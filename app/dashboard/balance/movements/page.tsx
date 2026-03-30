"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Search,
    ArrowUpRight,
    ArrowDownLeft,
    Scale,
    Download,
    Filter,
    Wallet,
    ArrowLeft,
    Eye,
    Calendar as CalendarIcon,
    ChevronDown,
    FileText
} from "lucide-react"
import { getBalanceMovement, getBalanceMovementSummary, getSaleSummaryByDate } from "@/app/actions/balance-movement"
import { getSuppliers } from "@/app/actions/suppliers"
import { BrandLoader } from "@/components/ui/brand-loader"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Label } from "@/components/ui/label"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { exportReport } from "@/lib/report-export"
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"

export default function BalanceMovementsPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<"sale" | "purchase">("sale")
    const [transactions, setTransactions] = useState<any[]>([])
    const [selectedTx, setSelectedTx] = useState<any>(null)
    const [summary, setSummary] = useState<any>({
        totalCredits: 0,
        totalDebits: 0,
        netMovement: 0,
        currentBalance: 0,
        totalHolds: 0,
        totalBank: 0,
        currentCash: 0
    })
    const [searchQuery, setSearchQuery] = useState("")
    const [typeFilter, setTypeFilter] = useState("all")
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
        from: undefined,
        to: undefined
    })
    const [supplierFilter, setSupplierFilter] = useState("all")
    const [accountTypeFilter, setAccountTypeFilter] = useState("all")
    const [suppliersList, setSuppliersList] = useState<any[]>([])
    const [summaries, setSummaries] = useState<Record<string, any>>({})


    useEffect(() => {
        getSuppliers().then(setSuppliersList).catch(console.error)
    }, [])

    const handleExport = (type: "pdf" | "csv") => {
        if (!transactions || transactions.length === 0) {
            toast.error("No data to export")
            return
        }
        
        // Structure data for report-export.ts
        const exportData = {
            transactions: transactions.map(t => {
                const isInternal = t.source_table === 'balance_transactions';
                const isCredit = isInternal 
                    ? ["add_cash", "add_bank", "cash_to_bank"].includes(t.transaction_type) || t.card_hold_id
                    : t.transaction_type === 'credit';
                    
                let desc = t.note || "";
                if (isInternal) {
                    if (t.transaction_type === 'cash_to_bank') desc = "Cash to Bank Transfer";
                    else if (t.transaction_type === 'bank_to_cash') desc = "Bank to Cash Withdrawal";
                    else if (t.transaction_type === 'add_cash') desc = t.is_opening ? "Opening Cash Balance" : "Manual Cash Addition";
                    else if (t.transaction_type === 'add_bank') desc = t.is_opening ? "Opening Bank Balance" : "Manual Bank Deposit";
                    else if (t.transaction_type === 'transfer_to_supplier') desc = t.card_hold_id ? "Card Settlement" : "Transfer to Supplier Account";
                    else desc = t.description || t.transaction_type.replace("_", " ");
                }

                return {
                    ...t,
                    display_date: format(new Date(t.transaction_date || t.created_at), "dd-MMM-yyyy"),
                    display_entity: t.entity_name || "General",
                    display_desc: desc || t.note || t.description || "General Transaction",
                    is_credit: isCredit
                }
            }),
            summary
        }

        exportReport({
            activeTab: "balance-ledger",
            reportData: exportData,
            filters: {
                dateRange,
                search: searchQuery,
                type: typeFilter
            }
        }, type)
    }

    const fetchData = async () => {
        setLoading(true)
        try {
            const filters = {
                search: searchQuery || undefined,
                transaction_type: typeFilter === 'all' ? undefined : typeFilter as any,
                supplier_id: supplierFilter === 'all' || activeTab === 'sale' ? undefined : supplierFilter,
                account_type: accountTypeFilter === 'all' || activeTab === 'purchase' ? undefined : accountTypeFilter,
                date_from: dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : undefined,
                date_to: dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : undefined,
                category: activeTab
            }

            const [txResult, stats] = await Promise.all([
                getBalanceMovement(filters),
                getBalanceMovementSummary(filters)
            ])

            const filteredData = (txResult.data || []).filter((tx: any) => {
                if (activeTab === 'purchase') {
                    // 1. Hide daily sales summaries in purchase tab
                    if (tx.source_table === 'daily_sales_summary') return false;
                    
                    // 2. Hide "Card Hold" (gross) if it's the Purchase tab, to avoid double-counting with settlements
                    const note = tx.note?.toLowerCase() || "";
                    if (note.includes("card hold") && !note.includes("settlement")) return false;
                }
                return true;
            })
            setTransactions(filteredData)
            setSummary(stats)
            setSummaries(txResult.extended_data?.summaries || {})
        } catch (error) {
            toast.error("Failed to fetch balance data")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [typeFilter, supplierFilter, accountTypeFilter, activeTab])

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchData()
        }, 500)
        return () => clearTimeout(timer)
    }, [searchQuery])

    const formatCurrency = (val: number) => {
        if (val === undefined || val === null) return "Rs. 0.00"
        return `Rs. ${Number(val).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <BrandLoader size="lg" className="mb-4" />
                <p className="text-muted-foreground animate-pulse font-black uppercase tracking-widest text-[10px]">Loading Transaction Ledger...</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Link href="/dashboard/balance">
                        <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight uppercase">Balance <span className="text-primary">&</span> Ledger</h1>
                        <p className="text-muted-foreground text-sm uppercase tracking-wider font-medium">Detailed audit trail of all financial movements across accounts.</p>
                    </div>
                </div>
                <Button 
                    variant="outline" 
                    className="font-bold border-2"
                    onClick={() => handleExport("pdf")}
                >
                    <Download className="mr-2 h-4 w-4" /> EXPORT PDF
                </Button>
            </div>

            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-[400px] mb-4">
                    <TabsTrigger value="sale" className="font-bold uppercase tracking-wider">Sale Tab</TabsTrigger>
                    <TabsTrigger value="purchase" className="font-bold uppercase tracking-wider">Purchase Tab</TabsTrigger>
                </TabsList>

                {/* Summary Cards */}
                <div className={`grid gap-4 mb-6 ${activeTab === 'sale' ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6' : 'md:grid-cols-5'}`}>
                    {activeTab === 'sale' ? (
                        <>
                            <Card className="bg-slate-900 text-white border-0 shadow-xl overflow-hidden relative">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <Wallet size={80} />
                                </div>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Cash</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-black">{formatCurrency(summary.currentCash)}</div>
                                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Physical Cash on Hand</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-slate-900 text-white border-0 shadow-xl overflow-hidden relative">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <Scale size={80} />
                                </div>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Bank</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-black">{formatCurrency(summary.totalBank)}</div>
                                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Physical Bank Funds</p>
                                </CardContent>
                            </Card>
                        </>
                    ) : (
                        <Card className="bg-slate-900 text-white border-0 shadow-xl overflow-hidden relative">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <Wallet size={80} />
                            </div>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Supplier Balance</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-black">{formatCurrency(summary.currentBalance)}</div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Total Prepaid Supplier Funds</p>
                            </CardContent>
                        </Card>
                    )}

                    <Card className="border-l-4 border-l-amber-500">
                        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total On Hold</CardTitle>
                            <Wallet className="h-4 w-4 text-amber-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-xl font-black text-amber-600">{formatCurrency(summary.totalHolds || 0)}</div>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">
                                {activeTab === 'sale' ? 'Pending settlement' : 'Pending Deliveries'}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-green-600">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                {activeTab === 'sale' ? 'Total Sales' : 'Total Prepaid'}
                            </CardTitle>
                            <ArrowDownLeft className="h-4 w-4 text-green-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-xl font-black text-green-600">{formatCurrency(summary.totalCredits)}</div>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">
                                {activeTab === 'sale' ? 'Total Cash/Bank Inflow' : 'Total Supplier Credits'}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-red-600">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                {activeTab === 'sale' ? 'Total Expenses' : 'Total Purchases'}
                            </CardTitle>
                            <ArrowUpRight className="h-4 w-4 text-red-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-xl font-black text-red-600">{formatCurrency(summary.totalDebits)}</div>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">
                                {activeTab === 'sale' ? 'Total Cash/Bank Outflow' : 'Total Supplier Debits'}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-primary">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Net Movement</CardTitle>
                            <Scale className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-xl font-black text-primary">
                                {summary.netMovement > 0 ? "+" : ""}
                                {formatCurrency(summary.netMovement)}
                            </div>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Inflow vs Outflow Delta</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters & Table */}
                <Card className="border-0 shadow-lg">
                    <CardHeader>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <CardTitle className="text-xl font-black uppercase tracking-tight">
                                    {activeTab === 'sale' ? 'Sale Ledger' : 'Purchase Ledger'}
                                </CardTitle>
                                <CardDescription>
                                    {activeTab === 'sale' 
                                        ? 'Detailed audit trail of sales, expenses and internal movements' 
                                        : 'Detailed audit trail of purchases and supplier payments'}
                                </CardDescription>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <div className="relative w-full md:w-64">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        placeholder="Search reference..."
                                        className="pl-10 h-10"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <Select value={typeFilter} onValueChange={setTypeFilter}>
                                    <SelectTrigger className="w-[130px] h-10">
                                        <SelectValue placeholder="All Types" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Types</SelectItem>
                                        <SelectItem value="credit">Credits</SelectItem>
                                        <SelectItem value="debit">Debits</SelectItem>
                                    </SelectContent>
                                </Select>
                                {activeTab === 'purchase' && (
                                    <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                                        <SelectTrigger className="w-[180px] h-10">
                                            <SelectValue placeholder="All Suppliers" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Suppliers</SelectItem>
                                            {suppliersList.map(s => (
                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                                {activeTab === 'sale' && (
                                    <Select value={accountTypeFilter} onValueChange={setAccountTypeFilter}>
                                        <SelectTrigger className="w-[150px] h-10">
                                            <SelectValue placeholder="All Accounts" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Accounts</SelectItem>
                                            <SelectItem value="cash">Cash Only</SelectItem>
                                            <SelectItem value="bank">Bank Only</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                                <div className="flex items-center gap-2">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className={cn(
                                                    "h-10 w-[240px] justify-start text-left font-normal border-2",
                                                    !dateRange.from && "text-muted-foreground"
                                                )}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {dateRange.from ? (
                                                    dateRange.to ? (
                                                        <>
                                                            {format(dateRange.from, "LLL dd, y")} -{" "}
                                                            {format(dateRange.to, "LLL dd, y")}
                                                        </>
                                                    ) : (
                                                        format(dateRange.from, "LLL dd, y")
                                                    )
                                                ) : (
                                                    <span>Filter by Date</span>
                                                )}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="end">
                                            <Calendar
                                                initialFocus
                                                mode="range"
                                                defaultMonth={dateRange.from}
                                                selected={dateRange}
                                                onSelect={(range: any) => {
                                                    setDateRange({ from: range?.from, to: range?.to })
                                                }}
                                                numberOfMonths={2}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <Button variant="outline" onClick={fetchData} className="font-bold border-2 h-10">
                                    <Filter className="h-4 w-4 mr-2" /> APPLY
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="border rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50">
                                        <TableHead className="font-black uppercase text-[10px]">Date</TableHead>
                                        <TableHead className="font-black uppercase text-[10px]">Reference</TableHead>
                                        <TableHead className="font-black uppercase text-[10px]">Entity</TableHead>
                                        <TableHead className="font-black uppercase text-[10px]">Description</TableHead>
                                        {activeTab === 'sale' ? (
                                            <>
                                                <TableHead className="font-black uppercase text-[10px] text-right">Cash Before</TableHead>
                                                <TableHead className="font-black uppercase text-[10px] text-right">Bank Before</TableHead>
                                                <TableHead className="font-black uppercase text-[10px] text-right">Amount</TableHead>
                                                <TableHead className="font-black uppercase text-[10px] text-right">Cash After</TableHead>
                                                <TableHead className="font-black uppercase text-[10px] text-right">Bank After</TableHead>
                                                <TableHead className="font-black uppercase text-[10px] text-center">Acc Type</TableHead>
                                            </>
                                        ) : (
                                            <>
                                                <TableHead className="font-black uppercase text-[10px] text-right">Balance Before</TableHead>
                                                <TableHead className="font-black uppercase text-[10px] text-right">Amount</TableHead>
                                                <TableHead className="font-black uppercase text-[10px] text-right">Balance After</TableHead>
                                            </>
                                        )}
                                        <TableHead className="font-black uppercase text-[10px] text-center">Type</TableHead>
                                        <TableHead className="font-black uppercase text-[10px] text-center">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={activeTab === 'sale' ? 12 : 9} className="h-64 text-center text-muted-foreground italic">
                                                No transactions found matching your filters.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        transactions.map((tx) => {
                                            const isInternal = tx.source_table === 'balance_transactions';
                                            const isFuelSale = tx.source_table === 'daily_sales';
                                            const isManualSale = tx.source_table === 'manual_sales';
                                            const isExpense = tx.source_table === 'daily_expenses';
                                            const isSupplier = tx.source_table === 'company_account_transactions';
                                            const isSummary = tx.source_table === 'daily_sales_summary';

                                            const isSupplierSettlement = isInternal && tx.card_hold_id && tx.supplier_id;

                                            // Determine credit/debit
                                            let isCredit: boolean;
                                            if (isInternal) {
                                                isCredit = ["add_cash", "add_bank", "cash_to_bank"].includes(tx.transaction_type) || !!tx.card_hold_id;
                                            } else if (isFuelSale || isManualSale || isSummary) {
                                                isCredit = true;
                                            } else if (isExpense) {
                                                isCredit = false;
                                            } else {
                                                // supplier / purchase
                                                isCredit = tx.transaction_type === 'credit';
                                            }
                                            
                                            // Generate a detailed description
                                            let displayDescription = tx.note || "";
                                            
                                            if (isInternal) {
                                                if (tx.transaction_type === 'cash_to_bank') displayDescription = "Cash to Bank Transfer";
                                                else if (tx.transaction_type === 'bank_to_cash') displayDescription = "Bank to Cash Withdrawal";
                                                else if (tx.transaction_type === 'add_cash') displayDescription = tx.is_opening ? "Opening Cash Balance" : "Manual Cash Addition";
                                                else if (tx.transaction_type === 'add_bank') displayDescription = tx.is_opening ? "Opening Bank Balance" : "Manual Bank Deposit";
                                                else if (tx.transaction_type === 'transfer_to_supplier') {
                                                    if (tx.card_hold_id) {
                                                        const parts = tx.description?.split('Settlement:');
                                                        displayDescription = parts && parts.length > 1 ? `Settlement: ${parts[1]}` : "Card Settlement";
                                                    } else {
                                                        displayDescription = "Transfer to Supplier Account";
                                                    }
                                                }
                                                else displayDescription = tx.description || tx.transaction_type.replace("_", " ");
                                            } else if (isFuelSale) {
                                                displayDescription = tx.note || `Fuel Sale`;
                                            } else if (isManualSale) {
                                                displayDescription = tx.note || `Product Sale`;
                                            } else if (isExpense) {
                                                displayDescription = tx.note || tx.description || "Daily Expense";
                                            } else if (isSupplier) {
                                                if (tx.transaction_source === 'purchase_order') {
                                                    displayDescription = `Purchase Order #${tx.reference_number || 'N/A'}`;
                                                } else if (tx.transaction_source === 'delivery') {
                                                    displayDescription = `Purchase Delivery | Ref# ${tx.reference_number || 'N/A'}`;
                                                } else if (tx.transaction_source === 'opening_balance') {
                                                    displayDescription = "Opening Balance Initialization";
                                                } else if (!displayDescription) {
                                                    displayDescription = "General Transaction";
                                                }
                                            } else if (isSummary) {
                                                const fuelCount = tx.items?.fuel?.length || 0;
                                                const manualCount = tx.items?.manual?.length || 0;
                                                displayDescription = `Daily Inflow Summary | ${fuelCount} Fuel Tx, ${manualCount} Manual Tx`;
                                            }

                                            // Source badge label
                                            const sourceLabel = isFuelSale ? "fuel sale" : isManualSale ? "product sale" : isExpense ? "expense" : isSummary ? "sales summary" : (tx.transaction_source || tx.transaction_type || "").replace(/_/g, " ");

                                            const handleRowClick = () => {
                                                if (isFuelSale || isManualSale || isExpense || isSummary) {
                                                    setSelectedTx(tx);
                                                } else {
                                                    router.push(`/dashboard/balance/movements/${tx.id}`);
                                                }
                                            };

                                            return (
                                                <TableRow
                                                    key={tx.id}
                                                    className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                                                    onClick={handleRowClick}
                                                >
                                                    <TableCell className="font-medium text-xs whitespace-nowrap">
                                                        {new Date(tx.transaction_date || tx.created_at).toLocaleDateString('en-PK', {
                                                            day: '2-digit',
                                                            month: 'short',
                                                            year: 'numeric'
                                                        })}
                                                        <span className="block text-[10px] text-muted-foreground">
                                                            {new Date(tx.created_at).toLocaleTimeString('en-PK', {
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-[10px] font-bold text-slate-500 uppercase flex flex-col gap-1">
                                                        <span>{tx.reference_number || "N/A"}</span>
                                                        <Badge variant="outline" className="text-[8px] w-fit capitalize">
                                                            {sourceLabel || "transaction"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="font-bold text-xs">
                                                        {tx.entity_name || "General"}
                                                    </TableCell>
                                                    <TableCell className="text-xs max-w-xs truncate font-semibold">
                                                        {displayDescription}
                                                    </TableCell>
                                                    {activeTab === 'sale' ? (
                                                        <>
                                                            <TableCell className="text-right text-slate-500 font-medium text-xs">
                                                                {tx.cash_before != null ? formatCurrency(tx.cash_before) : "—"}
                                                            </TableCell>
                                                            <TableCell className="text-right text-slate-500 font-medium text-xs">
                                                                {tx.bank_before != null ? formatCurrency(tx.bank_before) : "—"}
                                                            </TableCell>
                                                            <TableCell className={`text-right font-black text-sm ${isSupplierSettlement ? 'text-purple-600' : isCredit ? 'text-green-600' : 'text-red-600'}`}>
                                                                {!isSupplierSettlement && (isCredit ? '+ ' : '- ')} {formatCurrency(tx.amount)}
                                                            </TableCell>
                                                            <TableCell className={`text-right font-black text-sm ${tx.cash_after == null ? 'text-slate-400' : Number(tx.cash_after || 0) >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                                                                {tx.cash_after != null ? formatCurrency(tx.cash_after) : "—"}
                                                            </TableCell>
                                                            <TableCell className={`text-right font-black text-sm ${tx.bank_after == null ? 'text-slate-400' : Number(tx.bank_after || 0) >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                                                                {tx.bank_after != null ? formatCurrency(tx.bank_after) : "—"}
                                                            </TableCell>
                                                            <TableCell className="text-center font-bold text-[10px] uppercase text-slate-500">
                                                                <Badge variant="outline" className={`${tx.account_type === 'Cash' ? 'text-green-600 border-green-200 bg-green-50' : tx.account_type === 'Bank' ? 'text-blue-600 border-blue-200 bg-blue-50' : tx.account_type === 'Supplier Account' ? 'text-purple-600 border-purple-200 bg-purple-50' : 'text-slate-600'} text-[9px] uppercase px-2 py-0.5 whitespace-nowrap`}>
                                                                    {tx.account_type || "—"}
                                                                </Badge>
                                                            </TableCell>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <TableCell className="text-right text-slate-500 font-medium text-xs">
                                                                {tx.balance_before != null ? formatCurrency(tx.balance_before) : "—"}
                                                            </TableCell>
                                                            <TableCell className={`text-right font-black text-sm ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                                                                {isCredit ? '+' : '-'} {formatCurrency(tx.amount)}
                                                            </TableCell>
                                                            <TableCell className={`text-right font-black text-sm ${tx.balance_after == null ? 'text-slate-400' : Number(tx.balance_after || 0) >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                                                                {tx.balance_after != null ? formatCurrency(tx.balance_after) : "—"}
                                                            </TableCell>
                                                        </>
                                                    )}
                                                    <TableCell className="text-center">
                                                        {tx.is_hold ? (
                                                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 uppercase text-[9px] font-black">Hold</Badge>
                                                        ) : isCredit ? (
                                                            <Badge className="bg-green-100 text-green-700 border-green-200 uppercase text-[9px] font-black">Inflow</Badge>
                                                        ) : (
                                                            <Badge className="bg-red-100 text-red-700 border-red-200 uppercase text-[9px] font-black">Outflow</Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleRowClick(); }}>
                                                                <Eye className="h-3 w-3 text-slate-400 hover:text-primary transition-colors" />
                                                            </Button>
                                                            {tx.card_hold_id && tx.card_hold_records?.sale_date && (
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-6 w-6" 
                                                                    title="View Original Sale Summary"
                                                                    onClick={(e) => { 
                                                                        e.stopPropagation(); 
                                                                        const saleDate = tx.card_hold_records.sale_date;
                                                                        const summaryId = `summary-sale-${saleDate}`;
                                                                        let summaryTx = transactions.find(t => t.id === summaryId);
                                                                        
                                                                        // If not in the current list (common in Purchase tab), look in the extended summaries
                                                                        if (!summaryTx && summaries[saleDate]) {
                                                                            summaryTx = summaries[saleDate];
                                                                        }

                                                                        if (summaryTx) {
                                                                            setSelectedTx(summaryTx);
                                                                        } else {
                                                                            toast.promise(
                                                                                getSaleSummaryByDate(saleDate).then(data => {
                                                                                    if (data.items.fuel.length === 0 && data.items.manual.length === 0 && data.items.holds.length === 0) {
                                                                                        throw new Error("No sales data found for this date");
                                                                                    }
                                                                                    setSelectedTx(data);
                                                                                }),
                                                                                {
                                                                                    loading: 'Fetching original sale summary...',
                                                                                    success: 'Sale summary loaded',
                                                                                    error: 'Original sales summary not found for this date'
                                                                                }
                                                                            )
                                                                        }
                                                                    }}
                                                                >
                                                                    <FileText className="h-3 w-3 text-purple-600 hover:text-purple-800 transition-colors" />
                                                                </Button>
                                                            )}

                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </Tabs>

            <Dialog open={!!selectedTx} onOpenChange={(open: boolean) => !open && setSelectedTx(null)}>
                <DialogContent className={selectedTx?.source_table === 'daily_sales_summary' ? "max-w-4xl max-h-[90vh] overflow-y-auto" : "max-w-md"}>
                    <DialogHeader>
                        <DialogTitle className="uppercase tracking-widest text-primary font-black">Transaction Details</DialogTitle>
                        <DialogDescription className="text-xs uppercase font-bold tracking-wider">
                            Full breakdown of the recorded entry.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedTx && (
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">Date</p>
                                    <p className="font-bold">{format(new Date(selectedTx.transaction_date || selectedTx.created_at), "dd MMM yyyy")}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">Reference No.</p>
                                    <p className="font-mono font-bold text-slate-700">{selectedTx.reference_number || "N/A"}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">Source Record</p>
                                    <Badge variant="outline" className="capitalize text-[10px] font-bold">
                                        {(selectedTx.source_table || "").replace(/_/g, " ")}
                                    </Badge>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">Account Impact</p>
                                    <Badge variant="outline" className={`capitalize text-[10px] font-bold ${selectedTx.account_type?.includes('Cash') ? 'text-green-600 border-green-200' : selectedTx.account_type?.includes('Bank') ? 'text-blue-600 border-blue-200' : ''}`}>
                                        {selectedTx.account_type || "N/A"}
                                    </Badge>
                                </div>
                            </div>

                            {selectedTx.source_table === 'daily_sales_summary' ? (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    {/* Breakdown Tables */}
                                    <div className="space-y-4">
                                        {/* Fuel Sales */}
                                        {selectedTx.items?.fuel?.length > 0 && (
                                            <div className="rounded-xl border shadow-sm overflow-hidden bg-white">
                                                <div className="bg-slate-50 px-4 py-3 border-b flex justify-between items-center">
                                                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
                                                        <FileText size={14} className="text-primary" />
                                                        Fuel Sales Breakdown
                                                    </h3>
                                                    <Badge variant="secondary" className="font-bold">{selectedTx.items.fuel.length} Entries</Badge>
                                                </div>
                                                <Table>
                                                    <TableHeader className="bg-slate-50/50">
                                                        <TableRow>
                                                            <TableHead className="h-9 text-[10px] font-black uppercase">Nozzle</TableHead>
                                                            <TableHead className="h-9 text-[10px] font-black uppercase">Product</TableHead>
                                                            <TableHead className="h-9 text-[10px] font-black uppercase text-right">Qty (L)</TableHead>
                                                            <TableHead className="h-9 text-[10px] font-black uppercase text-right">Price</TableHead>
                                                            <TableHead className="h-9 text-[10px] font-black uppercase text-right">Total</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {selectedTx.items.fuel.map((item: any, idx: number) => (
                                                            <TableRow key={idx}>
                                                                <TableCell className="py-2 text-xs font-bold">{item.nozzle_name}</TableCell>
                                                                <TableCell className="py-2 text-xs text-muted-foreground font-semibold">{item.product_name}</TableCell>
                                                                <TableCell className="py-2 text-xs text-right font-mono">{Number(item.quantity).toLocaleString()}</TableCell>
                                                                <TableCell className="py-2 text-xs text-right font-mono">Rs. {Number(item.unit_price).toLocaleString()}</TableCell>
                                                                <TableCell className="py-2 text-xs text-right font-bold">Rs. {Number(item.revenue || item.total_amount).toLocaleString()}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        )}

                                        {/* Manual Sales */}
                                        {selectedTx.items?.manual?.length > 0 && (
                                            <div className="rounded-xl border shadow-sm overflow-hidden bg-white">
                                                <div className="bg-slate-50 px-4 py-3 border-b flex justify-between items-center">
                                                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
                                                        <FileText size={14} className="text-primary" />
                                                        Product Sales Breakdown
                                                    </h3>
                                                    <Badge variant="secondary" className="font-bold">{selectedTx.items.manual.length} Entries</Badge>
                                                </div>
                                                <Table>
                                                    <TableHeader className="bg-slate-50/50">
                                                        <TableRow>
                                                            <TableHead className="h-9 text-[10px] font-black uppercase">Description</TableHead>
                                                            <TableHead className="h-9 text-[10px] font-black uppercase text-right">Qty</TableHead>
                                                            <TableHead className="h-9 text-[10px] font-black uppercase text-right">Price</TableHead>
                                                            <TableHead className="h-9 text-[10px] font-black uppercase text-right">Total</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {selectedTx.items.manual.map((item: any, idx: number) => (
                                                            <TableRow key={idx}>
                                                                <TableCell className="py-2 text-xs font-bold">
                                                                    {item.product_name}
                                                                    <span className="block text-[9px] text-muted-foreground font-normal">Ref: {item.customer_name || 'Walk-in'}</span>
                                                                </TableCell>
                                                                <TableCell className="py-2 text-xs text-right font-mono">{Number(item.quantity).toLocaleString()}</TableCell>
                                                                <TableCell className="py-2 text-xs text-right font-mono">Rs. {Number(item.unit_price).toLocaleString()}</TableCell>
                                                                <TableCell className="py-2 text-xs text-right font-bold">Rs. {Number(item.total_amount).toLocaleString()}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        )}

                                        {/* Card Holds */}
                                        {selectedTx.items?.holds?.length > 0 && (
                                            <div className="rounded-xl border border-amber-200 shadow-sm overflow-hidden bg-amber-50/30">
                                                <div className="bg-amber-100/50 px-4 py-3 border-b border-amber-200 flex justify-between items-center">
                                                    <h3 className="text-xs font-black uppercase tracking-widest text-amber-700 flex items-center gap-2">
                                                        <Wallet size={14} className="text-amber-600" />
                                                        Card Settlements & Holds
                                                    </h3>
                                                    <Badge className="bg-amber-200 text-amber-800 border-amber-300 font-bold hover:bg-amber-200">{selectedTx.items.holds.length} Holds</Badge>
                                                </div>
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow className="bg-amber-50/50">
                                                            <TableHead className="h-9 text-[10px] font-black uppercase text-amber-800">Card/Bank</TableHead>
                                                            <TableHead className="h-9 text-[10px] font-black uppercase text-amber-800">Status</TableHead>
                                                            <TableHead className="h-9 text-[10px] font-black uppercase text-amber-800">Released At</TableHead>
                                                            <TableHead className="h-9 text-[10px] font-black uppercase text-amber-800">Settlement</TableHead>
                                                            <TableHead className="h-9 text-[10px] font-black uppercase text-right text-amber-800">Amount</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {selectedTx.items.holds.map((item: any, idx: number) => (
                                                            <TableRow key={idx} className="border-amber-100">
                                                                <TableCell className="py-2 text-xs font-bold text-amber-900">
                                                                    {item.entity_name || 'System Card'}
                                                                    <span className="block text-[9px] text-amber-700/70 font-normal truncate max-w-[200px]">{item.description}</span>
                                                                </TableCell>
                                                                <TableCell className="py-2 text-[10px] uppercase font-black">
                                                                    {item.card_hold_records?.status === 'released' ? (
                                                                        <span className="text-green-600">Released</span>
                                                                    ) : (
                                                                        <span className="text-amber-600">Pending</span>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="py-2 text-[10px] font-bold text-amber-700/80">
                                                                    {item.card_hold_records?.released_at 
                                                                        ? format(new Date(item.card_hold_records.released_at), "dd MMM, HH:mm") 
                                                                        : "—"}
                                                                </TableCell>
                                                                <TableCell className="py-2 text-[10px] uppercase font-bold text-amber-900">
                                                                    {item.settlement_info ? (
                                                                        <Button 
                                                                            variant="link" 
                                                                            className="h-auto p-0 text-[10px] font-black text-purple-600 hover:text-purple-800"
                                                                            onClick={() => router.push(`/dashboard/balance/movements/${item.settlement_info.id}`)}
                                                                        >
                                                                            {item.settlement_info.ref}
                                                                        </Button>
                                                                    ) : "—"}
                                                                </TableCell>
                                                                <TableCell className="py-2 text-xs text-right font-black text-amber-700">- {formatCurrency(item.amount)}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        )}
                                    </div>

                                    {/* Final Calc Footer */}
                                    <div className="bg-slate-900 text-white rounded-xl p-6 shadow-2xl relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <Scale size={100} />
                                        </div>
                                        <div className="flex flex-col gap-4">
                                            <div className="flex justify-between items-center border-b border-white/10 pb-4">
                                                <div>
                                                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Total Gross Sale</p>
                                                    <p className="text-xl font-bold">
                                                        {formatCurrency(
                                                            selectedTx.items.fuel.reduce((acc: number, cur: any) => acc + Number(cur.revenue || cur.total_amount), 0) +
                                                            selectedTx.items.manual.reduce((acc: number, cur: any) => acc + Number(cur.total_amount), 0)
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] uppercase font-black tracking-widest text-amber-400">Total Card Hold</p>
                                                    <p className="text-xl font-bold text-amber-400">
                                                        - {formatCurrency(selectedTx.items.holds.reduce((acc: number, cur: any) => acc + Number(cur.amount), 0))}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-end">
                                                <div>
                                                    <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">Final Net Inflow</h4>
                                                    <p className="text-muted-foreground text-[10px] uppercase mt-1">This amount is added to the system Ledger Balance.</p>
                                                </div>
                                                <div className="text-4xl font-black text-white tracking-tighter animate-pulse">
                                                    {formatCurrency(selectedTx.amount)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="col-span-2">
                                        <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">Entity / Party</p>
                                        <p className="font-bold text-slate-900 text-lg">{selectedTx.entity_name || "General"}</p>
                                    </div>
                                    <div className="col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-2">Description & Notes</p>
                                        <p className="font-bold text-sm text-slate-800 leading-relaxed">{selectedTx.note || selectedTx.description || selectedTx.transaction_type?.replace(/_/g, " ") || "No additional description."}</p>
                                    </div>
                                    <div className="col-span-2 flex items-center justify-between bg-slate-100/50 p-4 rounded-xl border-2 border-dashed border-slate-200">
                                        <div>
                                            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Transaction Amount</p>
                                            <p className="text-[9px] text-muted-foreground uppercase font-bold">Injected into system ledger</p>
                                        </div>
                                        <p className={`text-2xl font-black ${selectedTx.display_type === 'credit' || selectedTx.transaction_type?.includes('add') ? 'text-green-600' : 'text-red-600'}`}>
                                            {formatCurrency(selectedTx.amount)}
                                        </p>
                                    </div>
                                </>
                            )}
                            
                            <div className="flex justify-between items-center pt-4 border-t">
                                <p className="text-[10px] text-muted-foreground italic max-w-[240px]">Note: Financial editing is locked at the ledger level for audit integrity.</p>
                                <Button variant="outline" className="font-bold uppercase tracking-widest text-[10px] h-8" onClick={() => setSelectedTx(null)}>Close Detail</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

        </div>
    )
}
