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
import { getBalanceMovement, getBalanceMovementSummary } from "@/app/actions/balance-movement"
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

export default function BalanceMovementsPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [transactions, setTransactions] = useState<any[]>([])
    const [summary, setSummary] = useState<any>({
        totalCredits: 0,
        totalDebits: 0,
        netMovement: 0,
        currentBalance: 0,
        totalHolds: 0
    })
    const [searchQuery, setSearchQuery] = useState("")
    const [typeFilter, setTypeFilter] = useState("all")
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
        from: undefined,
        to: undefined
    })

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
                    ? ["add_cash", "add_bank", "cash_to_bank"].includes(t.transaction_type)
                    : t.transaction_type === 'credit';
                    
                let desc = t.note || "";
                if (isInternal) {
                    if (t.transaction_type === 'cash_to_bank') desc = "Cash to Bank Transfer";
                    else if (t.transaction_type === 'bank_to_cash') desc = "Bank to Cash Withdrawal";
                    else if (t.transaction_type === 'add_cash') desc = t.is_opening ? "Opening Cash Balance" : "Manual Cash Addition";
                    else if (t.transaction_type === 'add_bank') desc = t.is_opening ? "Opening Bank Balance" : "Manual Bank Deposit";
                    else if (t.transaction_type === 'transfer_to_supplier') desc = "Transfer to Supplier Account";
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
                date_from: dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : undefined,
                date_to: dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : undefined
            }

            const [txResult, stats] = await Promise.all([
                getBalanceMovement(filters),
                getBalanceMovementSummary(filters)
            ])

            setTransactions(txResult.data || [])
            setSummary(stats)
        } catch (error) {
            toast.error("Failed to fetch balance data")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [typeFilter])

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

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-5">
                <Card className="bg-slate-900 text-white border-0 shadow-xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Wallet size={80} />
                    </div>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Net Exposure</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black">{formatCurrency(summary.currentBalance)}</div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Total combined balance</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total On Hold</CardTitle>
                        <Wallet className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-black text-amber-600">{formatCurrency(summary.totalHolds || 0)}</div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Pending Missing Deliveries</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-green-600">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Inflow</CardTitle>
                        <ArrowDownLeft className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-black text-green-600">{formatCurrency(summary.totalCredits)}</div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Total Credits (Sales/Income)</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-red-600">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Outflow</CardTitle>
                        <ArrowUpRight className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-black text-red-600">{formatCurrency(summary.totalDebits)}</div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Total Debits (Purchases/Exp)</p>
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
                            <CardTitle className="text-xl font-black uppercase tracking-tight">Transaction Ledger</CardTitle>
                            <CardDescription>Visualizing cash inflow and outflow across accounts</CardDescription>
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
                                    <TableHead className="font-black uppercase text-[10px] text-right">Balance Before</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-right">Amount</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-right">Balance After</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-center">Type</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-center">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="h-64 text-center text-muted-foreground italic">
                                            No transactions found matching your filters.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    transactions.map((tx) => {
                                        const isInternal = tx.source_table === 'balance_transactions';
                                        const isCredit = isInternal 
                                            ? ["add_cash", "add_bank", "cash_to_bank"].includes(tx.transaction_type)
                                            : tx.transaction_type === 'credit';
                                        
                                        // Generate a detailed description
                                        let displayDescription = tx.note || "";
                                        
                                        if (isInternal) {
                                            if (tx.transaction_type === 'cash_to_bank') displayDescription = "Cash to Bank Transfer";
                                            else if (tx.transaction_type === 'bank_to_cash') displayDescription = "Bank to Cash Withdrawal";
                                            else if (tx.transaction_type === 'add_cash') displayDescription = tx.is_opening ? "Opening Cash Balance" : "Manual Cash Addition";
                                            else if (tx.transaction_type === 'add_bank') displayDescription = tx.is_opening ? "Opening Bank Balance" : "Manual Bank Deposit";
                                            else if (tx.transaction_type === 'transfer_to_supplier') displayDescription = "Transfer to Supplier Account";
                                            else displayDescription = tx.description || tx.transaction_type.replace("_", " ");
                                        } else {
                                            if (tx.transaction_source === 'purchase_order') {
                                                displayDescription = `Purchase Order #${tx.reference_number || 'N/A'}`;
                                            } else if (tx.transaction_source === 'delivery') {
                                                displayDescription = `Purchase Delivery | Ref# ${tx.reference_number || 'N/A'}`;
                                            } else if (tx.transaction_source === 'opening_balance') {
                                                displayDescription = "Opening Balance Initialization";
                                            } else if (!displayDescription) {
                                                displayDescription = "General Transaction";
                                            }
                                        }

                                        const handleRowClick = () => {
                                            router.push(`/dashboard/balance/movements/${tx.id}`);
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
                                                    {tx.transaction_source && (
                                                        <Badge variant="outline" className="text-[8px] w-fit">
                                                            {(tx.transaction_source || tx.transaction_type).replace("_", " ")}
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="font-bold text-xs">
                                                    {tx.entity_name || "General"}
                                                </TableCell>
                                                <TableCell className="text-xs max-w-xs truncate font-semibold">
                                                    {displayDescription}
                                                </TableCell>
                                                <TableCell className="text-right text-slate-500 font-medium text-xs">
                                                    {formatCurrency(tx.balance_before)}
                                                </TableCell>
                                                <TableCell className={`text-right font-black text-sm ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                                                    {isCredit ? '+' : '-'} {formatCurrency(tx.amount)}
                                                </TableCell>
                                                <TableCell className={`text-right font-black text-sm ${Number(tx.balance_after || 0) >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                                                    {formatCurrency(tx.balance_after)}
                                                </TableCell>
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
                                                    <Button variant="ghost" size="icon" className="h-6 w-6">
                                                        <Eye className="h-3 w-3 text-slate-400" />
                                                    </Button>
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
        </div>
    )
}
