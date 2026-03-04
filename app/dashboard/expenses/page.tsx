"use client"

import { useState, useEffect, useMemo } from "react"
import { format } from "date-fns"
import { getTodayPKT } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { saveDailyExpense } from "@/app/actions/sales-daily"
import { useToast } from "@/components/ui/use-toast"
import {
    DollarSign,
    TrendingDown,
    Calendar,
    AlertTriangle,
    CheckCircle2,
    AlertCircle,
    PiggyBank,
    Wallet,
    Receipt,
    FileText,
    PieChart as PieChartIcon,
    RefreshCw,
    Plus,
    Search,
    Filter,
    Trash2,
} from "lucide-react"
import { BrandLoader } from "@/components/ui/brand-loader"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

// --- Interfaces ---
interface ExpenseCategory {
    id: string
    category_name: string
    category_type: string
}

interface ExpenseStats {
    amount: number
    expense_date: string
}

interface DailyBalance {
    id: string
    status_date: string
    opening_cash: number
    closing_cash: number | null
    opening_bank: number
    closing_bank: number | null
    is_closed: boolean
}

interface BankAccount {
    id: string
    account_name: string
    current_balance: number
}

interface Expense {
    id: string
    expense_date: string
    amount: number
    category_id: string
    category: { category_name: string, category_type: string }
    payment_method: string
    description: string
    paid_to: string | null
    invoice_number: string | null
    notes: string | null
}

export default function ExpensesPage() {
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [categories, setCategories] = useState<ExpenseCategory[]>([])
    const [todayBalance, setTodayBalance] = useState<DailyBalance | null>(null)
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
    const [error, setError] = useState("")
    const [success, setSuccess] = useState<string | null>(null)

    // Form State
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [formData, setFormData] = useState({
        date: format(new Date(), "yyyy-MM-dd"),
        categoryId: "",
        amount: "",
        paymentMethod: "cash",
        bankAccountId: "",
        description: "",
        paidTo: "",
        invoiceNumber: "",
        notes: ""
    })
    const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)
    const [newCategory, setNewCategory] = useState({ name: "", type: "operating" })
    const [addingCategory, setAddingCategory] = useState(false)

    // Search & Filter
    const [searchQuery, setSearchQuery] = useState("")
    const [categoryFilter, setCategoryFilter] = useState("all")
    const [dateRange, setDateRange] = useState({
        start: getTodayPKT(),
        end: getTodayPKT()
    })
    const [expenses, setExpenses] = useState<Expense[]>([])
    const [monthlyStatsData, setMonthlyStatsData] = useState<ExpenseStats[]>([])

    const supabase = createClient()
    const { toast } = useToast()

    useEffect(() => {
        fetchData()
    }, [dateRange.start, dateRange.end])

    const fetchData = async () => {
        setLoading(true)
        setError("")
        try {
            // Fetch categories
            const { data: catData, error: catErr } = await supabase
                .from('expense_categories')
                .select('*')
                .order('category_name')
            if (catErr) throw catErr
            setCategories(catData || [])

            // Fetch expenses with date range
            const { data: expData, error: expErr } = await supabase
                .from('daily_expenses')
                .select('*, expense_categories(*)')
                .gte('expense_date', dateRange.start)
                .lte('expense_date', dateRange.end)
                .order('expense_date', { ascending: false })
            if (expErr) throw expErr

            setExpenses(expData?.map(e => ({
                ...e,
                category: {
                    category_name: e.expense_categories?.category_name || "Uncategorized",
                    category_type: e.expense_categories?.category_type || "other"
                }
            })) || [])

            // Fetch global month stats (independent of filter)
            const startOfMonth = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd")
            const { data: monthData } = await supabase
                .from('daily_expenses')
                .select('amount, expense_date')
                .gte('expense_date', startOfMonth)
            setMonthlyStatsData(monthData || [])

            // Fetch status for the selected end-date (or today)
            const statusDate = dateRange.end
            const { data: balData, error: balErr } = await supabase
                .from('daily_accounts_status')
                .select('*')
                .eq('status_date', statusDate)
                .single()
            if (balErr && balErr.code !== 'PGRST116') throw balErr
            setTodayBalance(balData || null)

            // Fetch bank accounts
            const { data: bankData, error: bankErr } = await supabase
                .from('bank_accounts')
                .select('*')
            if (bankErr) throw bankErr
            setBankAccounts(bankData || [])

        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const filteredExpenses = useMemo(() => {
        return expenses.filter(e => {
            const matchesSearch = e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (e.paid_to?.toLowerCase() || "").includes(searchQuery.toLowerCase())
            const matchesCategory = categoryFilter === "all" || e.category_id === categoryFilter
            return matchesSearch && matchesCategory
        })
    }, [expenses, searchQuery, categoryFilter])

    // --- Derived Stats ---
    const stats = useMemo(() => {
        const today = getTodayPKT()
        // Today total from ALL expenses of today, not just from the filtered list
        // However, usually today is in the filtered list if range is today.
        // Let's use the monthlyStatsData for accurate "Global" stats

        const todayTotal = monthlyStatsData
            .filter(e => e.expense_date === today)
            .reduce((sum, e) => sum + Number(e.amount), 0)

        const startOfMonth = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd")
        const monthTotal = monthlyStatsData
            .filter(e => e.expense_date >= startOfMonth)
            .reduce((sum, e) => sum + Number(e.amount), 0)

        // Total for the selected filtered view (table)
        const filteredTotal = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0)

        return { todayTotal, monthTotal, filteredTotal }
    }, [monthlyStatsData, filteredExpenses])

    const currentCash = todayBalance?.closing_cash ?? todayBalance?.opening_cash ?? 0
    const currentBank = todayBalance?.closing_bank ?? todayBalance?.opening_bank ?? 0

    const handleSubmit = async () => {
        if (!formData.description || !formData.amount || !formData.categoryId) {
            setError("Please fill in all required fields.")
            return
        }

        setSaving(true)
        setError("")
        try {
            const expenseData = {
                expense_date: formData.date,
                description: formData.description,
                amount: parseFloat(formData.amount),
                category_id: formData.categoryId,
                payment_method: formData.paymentMethod,
                bank_account_id: formData.paymentMethod === 'bank_transfer' ? formData.bankAccountId : undefined,
                paid_to: formData.paidTo || undefined,
                invoice_number: formData.invoiceNumber || undefined,
                notes: formData.notes || undefined,
            }

            const result = await saveDailyExpense(expenseData)
            if (result.success) {
                setSuccess("Expense recorded successfully")
                setIsDialogOpen(false)
                fetchData()
                setFormData({
                    ...formData,
                    description: "",
                    amount: "",
                    paidTo: "",
                    invoiceNumber: "",
                    notes: ""
                })
                setTimeout(() => setSuccess(null), 3000)
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleAddCategory = async () => {
        if (!newCategory.name) return
        setAddingCategory(true)
        try {
            const { error: err } = await supabase
                .from('expense_categories')
                .insert([{ category_name: newCategory.name, category_type: newCategory.type }])
            if (err) throw err

            setSuccess("Category added successfully")
            setNewCategory({ name: "", type: "operating" })
            fetchData()
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setAddingCategory(false)
        }
    }

    const handleDeleteCategory = async (id: string, name: string) => {
        try {
            const { error: err } = await supabase
                .from('expense_categories')
                .delete()
                .eq('id', id)
            if (err) throw err

            setSuccess(`Category "${name}" deleted`)
            fetchData()
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const formatCurrency = (val: number) => `Rs. ${val.toLocaleString("en-PK")}`

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in duration-500">
                <BrandLoader size="lg" className="mb-6" />
                <p className="text-muted-foreground font-medium animate-pulse tracking-wide italic">Syncing expense records...</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Expense Management</h1>
                    <p className="text-muted-foreground">Detailed tracking of operating costs and daily reconcilements.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={() => { }} className="hidden md:flex">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                    </Button>
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="shadow-lg shadow-primary/20">
                                <Plus className="mr-2 h-4 w-4" />
                                Record Expense
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>Record New Expense</DialogTitle>
                                <DialogDescription>
                                    Automated financial tracking will update your account balances instantly.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="date">Date</Label>
                                        <Input
                                            id="date"
                                            type="date"
                                            value={formData.date}
                                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="category">Category</Label>
                                        <div className="flex gap-2">
                                            <Select value={formData.categoryId} onValueChange={(v) => setFormData({ ...formData, categoryId: v })}>
                                                <SelectTrigger id="category" className="flex-1 min-w-0 overflow-hidden">
                                                    <div className="truncate">
                                                        <SelectValue placeholder="Select Category" />
                                                    </div>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {categories.map(c => (
                                                        <SelectItem key={c.id} value={c.id}>
                                                            {c.category_name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
                                                <DialogTrigger asChild>
                                                    <Button variant="outline" size="icon" type="button" className="shrink-0 bg-primary/5 border-primary/20 hover:bg-primary/10">
                                                        <Plus className="h-4 w-4 text-primary" />
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>Manage Categories</DialogTitle>
                                                        <DialogDescription>
                                                            Add new categories or delete existing ones.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <div className="grid gap-4 py-4">
                                                        <div className="space-y-2">
                                                            <Label htmlFor="newCategoryName">Category Name</Label>
                                                            <Input
                                                                id="newCategoryName"
                                                                placeholder="e.g. Office Supplies"
                                                                value={newCategory.name}
                                                                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label htmlFor="newCategoryType">Category Type</Label>
                                                            <Select value={newCategory.type} onValueChange={(v) => setNewCategory({ ...newCategory, type: v })}>
                                                                <SelectTrigger id="newCategoryType">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="operating">Operating Expense</SelectItem>
                                                                    <SelectItem value="fixed">Fixed Cost</SelectItem>
                                                                    <SelectItem value="maintenance">Maintenance</SelectItem>
                                                                    <SelectItem value="other">Other</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                    <DialogFooter className="flex flex-col gap-4">
                                                        <div className="w-full">
                                                            <Separator className="my-2" />
                                                            <h4 className="text-sm font-medium mb-3">Existing Categories</h4>
                                                            <ScrollArea className="h-[200px] pr-4">
                                                                <div className="space-y-2">
                                                                    {categories.map((c) => (
                                                                        <div key={c.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group border border-transparent hover:border-border transition-all">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-sm font-medium">{c.category_name}</span>
                                                                                <span className="text-[10px] text-muted-foreground uppercase">{c.category_type}</span>
                                                                            </div>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                                onClick={() => handleDeleteCategory(c.id, c.category_name)}
                                                                            >
                                                                                <Trash2 className="h-4 w-4" />
                                                                            </Button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </ScrollArea>
                                                        </div>
                                                        <div className="flex justify-end gap-2 w-full pt-4">
                                                            <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>Close</Button>
                                                            <Button onClick={handleAddCategory} disabled={addingCategory}>
                                                                {addingCategory ? <BrandLoader size="xs" /> : "Add Category"}
                                                            </Button>
                                                        </div>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="amount">Amount (Rs)</Label>
                                        <Input
                                            id="amount"
                                            type="number"
                                            placeholder="0.00"
                                            className="font-bold border-primary/20 focus:border-primary"
                                            value={formData.amount}
                                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="method">Payment Method</Label>
                                        <Select value={formData.paymentMethod} onValueChange={(v) => setFormData({ ...formData, paymentMethod: v })}>
                                            <SelectTrigger id="method">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="cash">🏛️ Cash Account</SelectItem>
                                                <SelectItem value="bank_transfer">🏦 Bank Transfer</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {formData.paymentMethod === "bank_transfer" && (
                                        <div className="space-y-2 animate-in slide-in-from-top-2">
                                            <Label htmlFor="bankAccount">Select Bank Account</Label>
                                            <Select value={formData.bankAccountId} onValueChange={(v) => setFormData({ ...formData, bankAccountId: v })}>
                                                <SelectTrigger id="bankAccount">
                                                    <SelectValue placeholder="Choose Bank..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {bankAccounts.map(bank => (
                                                        <SelectItem key={bank.id} value={bank.id}>
                                                            {bank.account_name} ({formatCurrency(bank.current_balance)})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="desc">Description <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="desc"
                                        placeholder="e.g. Electricity Bill Jan 2025"
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="payee">Paid To</Label>
                                        <Input
                                            id="payee"
                                            placeholder="Recipient name"
                                            value={formData.paidTo}
                                            onChange={(e) => setFormData({ ...formData, paidTo: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="inv">Invoice / Ref #</Label>
                                        <Input
                                            id="inv"
                                            placeholder="INV-XXX"
                                            value={formData.invoiceNumber}
                                            onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="notes">Notes</Label>
                                    <Textarea
                                        id="notes"
                                        placeholder="Internal record notes..."
                                        className="h-20"
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleSubmit} disabled={saving} className="h-11">
                                    {saving ? <BrandLoader size="xs" /> : "Record Expense"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-l-4 border-l-primary shadow-sm bg-primary/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-primary">
                            {dateRange.start === dateRange.end && dateRange.start === getTodayPKT()
                                ? "Today's Expenses"
                                : "Period Total"}
                        </CardTitle>
                        <TrendingDown className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black tracking-tight">{formatCurrency(stats.filteredTotal)}</div>
                        <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold tracking-tighter">
                            {dateRange.start === dateRange.end
                                ? `Expenses for ${format(new Date(dateRange.start), "MMM dd")}`
                                : `Total for selected period`}
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-orange-500 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Monthly Total</CardTitle>
                        <PieChartIcon className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(stats.monthTotal)}</div>
                        <p className="text-xs text-muted-foreground mt-1">Total operating costs</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-500 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Available Cash</CardTitle>
                        <Wallet className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(currentCash)}</div>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">Cash Balance</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-blue-500 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {dateRange.end === getTodayPKT() ? "Total Bank Balance" : "Historical Bank Balance"}
                        </CardTitle>
                        <PiggyBank className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {dateRange.end === getTodayPKT()
                                ? formatCurrency(bankAccounts.reduce((sum, b) => sum + Number(b.current_balance), 0))
                                : formatCurrency(currentBank)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">
                            {dateRange.end === getTodayPKT() ? "Across all bank accounts" : `As of ${format(new Date(dateRange.end), "MMM dd")}`}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {success && (
                <Alert className="border-green-200 bg-green-50 animate-in fade-in slide-in-from-top-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800 font-bold">Success</AlertTitle>
                    <AlertDescription className="text-green-700">{success}</AlertDescription>
                </Alert>
            )}

            {error && (
                <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Validation / Connection Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <Card className="border-2 border-primary/5 shadow-lg overflow-hidden">
                <CardHeader className="bg-muted/30 border-b">
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                        <CardTitle className="flex items-center gap-2">
                            <Receipt className="h-5 w-5 text-primary" />
                            Expense History
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <div className="relative w-full md:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search details..."
                                    className="pl-9 h-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-2 border rounded-md px-2 bg-background shadow-sm">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="date"
                                    className="border-0 focus-visible:ring-0 w-32 h-8 text-xs p-1"
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                />
                                <span className="text-muted-foreground">to</span>
                                <Input
                                    type="date"
                                    className="border-0 focus-visible:ring-0 w-32 h-8 text-xs p-1"
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                />
                            </div>
                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger className="w-[180px] h-9">
                                    <Filter className="mr-2 h-4 w-4 text-primary" />
                                    <SelectValue placeholder="All Categories" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {categories.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0 sm:p-6">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/20">
                                    <TableHead className="w-[120px]">Date</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Reference</TableHead>
                                    <TableHead className="text-center">Method</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredExpenses.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                            No expenses found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredExpenses.map((expense) => (
                                        <TableRow key={expense.id} className="hover:bg-muted/10">
                                            <TableCell className="font-medium whitespace-nowrap">
                                                {new Date(expense.expense_date).toLocaleDateString("en-PK", {
                                                    month: "short",
                                                    day: "numeric",
                                                    year: "numeric"
                                                })}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col min-w-[150px]">
                                                    <span className="font-semibold">{expense.description}</span>
                                                    {expense.notes && <span className="text-[10px] text-muted-foreground italic line-clamp-1">{expense.notes}</span>}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="font-normal border-primary/10 whitespace-nowrap">
                                                    {expense.category?.category_name}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                                                    {expense.category?.category_type?.replace("_", " ")}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                                {expense.paid_to && <div className="font-medium text-slate-700">{expense.paid_to}</div>}
                                                {expense.invoice_number && <div className="opacity-70">Ref: {expense.invoice_number}</div>}
                                                {(!expense.paid_to && !expense.invoice_number) && "-"}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 font-medium capitalize whitespace-nowrap">
                                                    {expense.payment_method.replace("_", " ")}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className="font-bold text-destructive whitespace-nowrap">
                                                    {formatCurrency(Number(expense.amount))}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
