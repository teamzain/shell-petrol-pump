"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { ReportFilter } from "@/app/dashboard/reports/page"
import {
    Receipt,
    Search,
    FilterX,
    LayoutDashboard,
    Wallet
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { format } from "date-fns"

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#6366f1', '#ec4899', '#8b5cf6', '#06b6d4']

export function ExpenseBreakdownReport({ filters, onDetailClick, onDataLoaded }: {
    filters: ReportFilter,
    onDetailClick?: (item: any) => void,
    onDataLoaded?: (data: any) => void
}) {
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<any>(null)
    const [categories, setCategories] = useState<any[]>([])
    
    // Local Filters
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedCategoryId, setSelectedCategoryId] = useState("all")

    useEffect(() => {
        async function fetchCategories() {
            try {
                const { data } = await supabase.from("expense_categories").select("*").order("category_name")
                setCategories(data || [])
            } catch (err) {
                console.error("Error fetching categories:", err)
            }
        }
        fetchCategories()
    }, [supabase])

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            try {
                const fromDate = format(filters.dateRange.from, "yyyy-MM-dd")
                const toDate = format(filters.dateRange.to, "yyyy-MM-dd")

                let query = supabase
                    .from("daily_expenses")
                    .select("*, expense_categories(category_name)")
                    .gte("expense_date", fromDate)
                    .lte("expense_date", toDate)

                if (filters.paymentMethod !== "all") {
                    const method = filters.paymentMethod === 'bank' ? 'bank_transfer' : 'cash'
                    query = query.eq("payment_method", method)
                }

                const { data: expenses } = await query
                    .order("amount", { ascending: false })

                // Process Category Breakdown (All for the period)
                const categoryMap: any = {}
                expenses?.forEach(e => {
                    const cat = e.expense_categories?.category_name || "Miscellaneous"
                    categoryMap[cat] = (categoryMap[cat] || 0) + Number(e.amount || 0)
                })

                const categoryData = Object.entries(categoryMap).map(([name, value]) => ({ name, value }))
                    .sort((a: any, b: any) => b.value - a.value)

            setData({ expenses: expenses || [], categoryData })
            
            // Find selected category name for export
            const catName = selectedCategoryId === 'all' 
                ? 'All Categories' 
                : (categories.find(c => c.id === selectedCategoryId)?.category_name || 'Selected Category')

            // Keep parent updated with totals and current filter names for export
            const overallTotal = categoryData.reduce((sum: number, c: any) => sum + c.value, 0)
            onDataLoaded?.({ 
                expenses: expenses || [], 
                categoryData, 
                totalExpenses: overallTotal,
                selectedCategoryName: catName,
                searchQuery
            })
        } catch (error) {
                console.error("Error fetching expense breakdown:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [filters, supabase])

    // Filter results locally for performance & instant feedback
    const filteredExpenses = useMemo(() => {
        if (!data?.expenses) return []
        return data.expenses.filter((exp: any) => {
            const matchesCategory = selectedCategoryId === "all" || exp.category_id === selectedCategoryId
            const query = searchQuery.toLowerCase()
            const matchesSearch = !searchQuery || 
                (exp.description || "").toLowerCase().includes(query) ||
                (exp.paid_to || "").toLowerCase().includes(query) ||
                (exp.expense_categories?.category_name || "").toLowerCase().includes(query)
            
            return matchesCategory && matchesSearch
        })
    }, [data?.expenses, searchQuery, selectedCategoryId])

    if (loading) {
        return <Skeleton className="h-[500px] w-full rounded-xl" />
    }

    const totalFilteredExpenses = filteredExpenses.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0)

    return (
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {/* Total Expense Summary Card - Filtered */}
                <Card className="bg-rose-50/50 dark:bg-rose-950/10 border-rose-100 dark:border-rose-900/50 shadow-sm relative overflow-hidden group">
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                        <Receipt className="h-12 w-12 text-rose-600" />
                    </div>
                    <CardHeader className="pb-2">
                        <CardDescription className="text-xs font-bold uppercase tracking-wider text-rose-600/70 dark:text-rose-400/70">
                            {selectedCategoryId === 'all' && !searchQuery ? 'Total Expenses' : 'Filtered Expenses'}
                        </CardDescription>
                        <CardTitle className="text-3xl font-black tracking-tighter text-rose-700 dark:text-rose-400">
                            Rs. {totalFilteredExpenses.toLocaleString()}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-white/50 dark:bg-black/20 border-rose-200 dark:border-rose-800 text-[10px] h-5">
                                {filteredExpenses.length} Records
                            </Badge>
                            {(selectedCategoryId !== 'all' || searchQuery) && (
                                <button 
                                    onClick={() => { setSearchQuery(""); setSelectedCategoryId("all"); }}
                                    className="text-[9px] font-black uppercase tracking-widest text-rose-600 hover:text-rose-700 flex items-center gap-1"
                                >
                                    <FilterX className="h-3 w-3" /> Clear filters
                                </button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="flex items-center gap-2 w-full sm:w-[400px] relative">
                    <Search className="absolute left-3 h-4 w-4 text-muted-foreground z-10" />
                    <Input 
                        placeholder="Search by description, paid to, or remark..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-10 border-slate-200 bg-white/50"
                    />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                        <SelectTrigger className="w-full sm:w-[220px] h-10 bg-white/50 border-slate-200">
                            <SelectValue placeholder="All Categories" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Expense Categories</SelectItem>
                            {categories.map((cat: any) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                    {cat.category_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Card className="border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base font-bold">Transaction Ledger</CardTitle>
                            <CardDescription>Detailed audit of spending during this period</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100 uppercase text-[9px] font-black tracking-widest px-2">
                                Period Log
                            </Badge>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/70 border-b border-slate-200">
                                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-10">Date</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-10">Category</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-10">Description</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-10">Recipient</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase tracking-wider h-10">Amount</TableHead>
                                    <TableHead className="text-center text-[10px] font-black uppercase tracking-wider h-10">Method</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredExpenses.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-20 text-muted-foreground">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
                                                    <Receipt className="h-6 w-6 opacity-20" />
                                                </div>
                                                <p className="text-sm font-medium">No expenses found matching your filters</p>
                                                {(searchQuery || selectedCategoryId !== 'all') && (
                                                    <Button variant="link" size="sm" onClick={() => { setSearchQuery(""); setSelectedCategoryId("all"); }}>
                                                        Clear all filters
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredExpenses.map((exp: any) => (
                                        <TableRow
                                            key={exp.id}
                                            className="group cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                                            onClick={() => onDetailClick?.(exp)}
                                        >
                                            <TableCell className="text-xs font-medium text-slate-500 whitespace-nowrap">
                                                {format(new Date(exp.expense_date), "dd MMM yyyy")}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                <Badge variant="outline" className="text-[10px] uppercase font-bold px-2 bg-white group-hover:bg-slate-100 transition-colors">
                                                    {exp.expense_categories?.category_name}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-slate-900 font-bold truncate max-w-[280px]">
                                                {exp.description}
                                            </TableCell>
                                            <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                                                {exp.paid_to || <span className="text-slate-300 italic">—</span>}
                                            </TableCell>
                                            <TableCell className="text-right font-black text-sm text-rose-600 whitespace-nowrap">
                                                Rs. {Number(exp.amount).toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-center whitespace-nowrap">
                                                <Badge className="text-[10px] font-black uppercase h-5 px-2 bg-slate-900 text-white border-0">
                                                    {exp.payment_method.replace('_', ' ')}
                                                </Badge>
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
