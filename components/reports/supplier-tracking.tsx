"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { ReportFilter } from "@/app/dashboard/reports/page"
import {
    Users,
    Phone,
    MapPin,
    ChevronDown,
    ChevronUp,
    Package,
    CreditCard,
    ArrowUpCircle,
    ArrowDownCircle,
    TrendingDown,
    Wallet,
    Receipt,
    AlertCircle,
    CheckCircle2,
    Clock,
    XCircle,
    Loader2,
    Search,
    ShieldAlert,
    ShieldCheck
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { format, parseISO, differenceInDays } from "date-fns"

// ─── Types ───────────────────────────────────────────────────────────────────

type SupplierRow = {
    id: string
    name: string
    phone: string
    address?: string
    product_type?: string
    supplier_type?: string
    status: string
    company_accounts?: { id: string; current_balance: number }[] | { id: string; current_balance: number }
    purchase_orders?: any[]
    // computed
    periodPurchases: number
    outstandingDues: number
    orderCount: number
}

type PurchaseOrder = {
    id: string
    po_number: string
    purchase_date?: string
    created_at: string
    product_type?: string
    items?: any[]
    products?: { name: string }
    ordered_quantity?: number
    delivered_quantity?: number
    rate_per_liter?: number
    estimated_total?: number
    total_amount?: number
    paid_amount?: number
    due_amount?: number
    status: string
}

type Transaction = {
    id: string
    transaction_type: "credit" | "debit"
    transaction_source?: string
    amount: number
    transaction_date: string
    reference_number?: string
    note?: string
    balance_before?: number
    balance_after?: number
    bank_accounts?: { account_name: string }
    created_at: string
}

// ─── Status helpers ──────────────────────────────────────────────────────────

function PurchaseStatusBadge({ status }: { status: string }) {
    const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
        pending: { label: "Pending", className: "bg-amber-100 text-amber-700 border-amber-200", icon: <Clock className="h-3 w-3" /> },
        partially_delivered: { label: "Partial", className: "bg-blue-100 text-blue-700 border-blue-200", icon: <Package className="h-3 w-3" /> },
        fully_delivered: { label: "Delivered", className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="h-3 w-3" /> },
        cancelled: { label: "Cancelled", className: "bg-rose-100 text-rose-700 border-rose-200", icon: <XCircle className="h-3 w-3" /> },
        overdue: { label: "Overdue", className: "bg-orange-100 text-orange-700 border-orange-200", icon: <AlertCircle className="h-3 w-3" /> },
    }
    const { label, className, icon } = map[status] || { label: status, className: "bg-slate-100 text-slate-700 border-slate-200", icon: null }
    return (
        <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0 h-5 flex items-center gap-1 ${className}`}>
            {icon}{label}
        </Badge>
    )
}

function TxTypeBadge({ type, source }: { type: string; source?: string }) {
    if (type === "credit") {
        return (
            <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold h-5 px-2 flex items-center gap-1">
                <ArrowUpCircle className="h-3 w-3" /> Payment In
            </Badge>
        )
    }
    const label = source === "delivery" || source === "purchase" ? "Delivery Charge" : "Deduction"
    return (
        <Badge className="bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold h-5 px-2 flex items-center gap-1">
            <ArrowDownCircle className="h-3 w-3" /> {label}
        </Badge>
    )
}

// ─── Per-Supplier Ledger Panel ───────────────────────────────────────────────

function SupplierLedgerPanel({ supplier, filters, onLedgerDataLoaded }: { supplier?: SupplierRow; filters: ReportFilter; onLedgerDataLoaded?: (data: any) => void }) {
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [purchases, setPurchases] = useState<any[]>([])
    const [transactions, setTransactions] = useState<any[]>([])
    const [holds, setHolds] = useState<any[]>([])
    const [accountBalance, setAccountBalance] = useState<number | null>(null)
    const [holdFilter, setHoldFilter] = useState<"all" | "pending" | "released">("all")

    const isCombined = !supplier

    const fromDate = format(filters.dateRange.from, "yyyy-MM-dd")
    const toDate = format(filters.dateRange.to, "yyyy-MM-dd")

    const fetchLedger = useCallback(async () => {
        setLoading(true)
        try {
            // 1. Fetch Purchase Orders in the period
            let poQuery = supabase
                .from("purchase_orders")
                .select("*, products(name), suppliers(name)")
                .gte("created_at", fromDate)
                .lte("created_at", toDate + "T23:59:59")
                .order("created_at", { ascending: false })

            if (supplier) {
                poQuery = poQuery.eq("supplier_id", supplier.id)
            }

            const { data: poData } = await poQuery
            setPurchases(poData || [])

            if (supplier) {
                // 2. Get company account
                const accountData = supplier.company_accounts
                const account = Array.isArray(accountData) ? accountData[0] : accountData

                if (account?.id) {
                    setAccountBalance(Number(account.current_balance))

                    // 3. Fetch transactions in the period
                    const { data: txData } = await supabase
                        .from("company_account_transactions")
                        .select("*, bank_accounts(account_name)")
                        .eq("company_account_id", account.id)
                        .gte("transaction_date", fromDate)
                        .lte("transaction_date", toDate)
                        .order("transaction_date", { ascending: true })
                        .order("created_at", { ascending: true })

                    // Compute running balance within the period
                    let running = 0
                    const enriched = (txData || []).map((t: any) => {
                        const before = running
                        if (t.transaction_type === "credit") running += Number(t.amount)
                        else running -= Number(t.amount)
                        return { ...t, balance_before: before, balance_after: running }
                    })

                    setTransactions(enriched)
                } else {
                    setTransactions([])
                }
            } else {
                // Combined view - fetch all transactions
                const { data: txData } = await supabase
                    .from("company_account_transactions")
                    .select("*, bank_accounts(account_name), company_accounts!inner(suppliers(name))")
                    .gte("transaction_date", fromDate)
                    .lte("transaction_date", toDate)
                    .order("transaction_date", { ascending: true })
                    .order("created_at", { ascending: true })
                    
                setTransactions(txData || [])
            }

            // 4. Fetch card hold records
            let holdsQuery = supabase
                .from("card_hold_records")
                .select(`
                    *,
                    supplier_cards!inner (
                        card_name,
                        supplier_id,
                        suppliers!inner (name)
                    )
                `)
                .not("supplier_card_id", "is", null)
                .order("created_at", { ascending: false })

            if (supplier) {
                holdsQuery = holdsQuery.eq("supplier_cards.supplier_id", supplier.id)
            }
            
            // Add date filter to respect the selected period
            holdsQuery = holdsQuery.gte("sale_date", fromDate).lte("sale_date", toDate)

            const { data: holdsData } = await holdsQuery
            
            let cardHolds = (holdsData || []).map((h: any) => ({
                ...h,
                _source: "card" as const,
                _normalized_status: h.status === "released" ? "released" : "pending"
            }))
            if (supplier) {
                cardHolds = cardHolds.filter((h: any) => h.supplier_cards?.supplier_id === supplier.id)
            }

            // 5. Fetch PO hold records (delivery discrepancy holds)
            let poHoldsQuery = supabase
                .from("po_hold_records")
                .select(`
                    *,
                    purchase_orders!inner (
                        po_number,
                        supplier_id,
                        suppliers!inner (name)
                    )
                `)
                .order("created_at", { ascending: false })

            if (supplier) {
                poHoldsQuery = poHoldsQuery.eq("purchase_orders.supplier_id", supplier.id)
            }

            const { data: poHoldsData } = await poHoldsQuery

            let poHolds = (poHoldsData || []).map((h: any) => ({
                ...h,
                _source: "po" as const,
                _normalized_status: h.status === "released" ? "released" : "pending",
                // Map PO hold fields to match card hold display fields
                sale_date: h.created_at,
                supplier_cards: {
                    card_name: h.purchase_orders?.po_number || "PO Hold",
                    supplier_id: h.purchase_orders?.supplier_id,
                    suppliers: h.purchase_orders?.suppliers
                },
                net_amount: h.hold_amount,
                tax_amount: 0
            }))
            if (supplier) {
                poHolds = poHolds.filter((h: any) => h.purchase_orders?.supplier_id === supplier.id)
            }

            const allHolds = [...cardHolds, ...poHolds]
            setHolds(allHolds)
        } catch (err) {
            console.error("Error fetching supplier ledger:", err)
        } finally {
            setLoading(false)
        }
    }, [supplier?.id, fromDate, toDate])

    useEffect(() => { fetchLedger() }, [fetchLedger])

    useEffect(() => {
        if (!loading) {
            onLedgerDataLoaded?.({
                purchases,
                transactions,
                holds
            })
        }
    }, [loading, purchases, transactions, holds, onLedgerDataLoaded])

    // ── Computed Summaries ──
    const totalPurchased = purchases.reduce((s, p) => s + Number(p.estimated_total || p.total_amount || 0), 0)
    const totalPaid = transactions.filter(t => t.transaction_type === "credit").reduce((s, t) => s + Number(t.amount), 0)
    const totalDeducted = transactions.filter(t => t.transaction_type === "debit").reduce((s, t) => s + Number(t.amount), 0)
    const netPeriodBalance = totalPaid - totalDeducted

    // Card + PO hold summaries - use _normalized_status for unified filtering
    const pendingHolds = holds.filter(h => h._normalized_status !== "released")
    const releasedHolds = holds.filter(h => h._normalized_status === "released")
    const totalOnHold = pendingHolds.reduce((s, h) => s + Number(h.hold_amount || 0), 0)
    const totalReleased = releasedHolds.reduce((s, h) => s + Number(h.hold_amount || 0), 0)

    if (loading) {
        return (
            <div className="p-4 space-y-3 w-full">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
            </div>
        )
    }

    const hasAccount = isCombined ? true : !!((Array.isArray(supplier?.company_accounts) ? supplier?.company_accounts[0] : supplier?.company_accounts)?.id)

    return (
        <div className="p-4 space-y-5 bg-slate-50/60 border-t border-dashed border-slate-200">

            {/* ── Period Summary Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                    <div className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mb-1">Period Orders</div>
                    <div className="text-xl font-black text-slate-800">{purchases.length}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Purchase orders</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                    <div className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mb-1">Period Purchases</div>
                    <div className="text-lg font-black text-blue-700">Rs. {totalPurchased.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Total ordered value</div>
                </div>
                <div className="bg-white rounded-xl border border-emerald-200 p-3 shadow-sm">
                    <div className="text-[9px] font-black uppercase text-emerald-600/80 tracking-widest mb-1">Payments Received</div>
                    <div className="text-lg font-black text-emerald-700">Rs. {totalPaid.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Credits in period</div>
                </div>
                <div className="bg-white rounded-xl border border-rose-200 p-3 shadow-sm">
                    <div className="text-[9px] font-black uppercase text-rose-600/80 tracking-widest mb-1">Deductions Made</div>
                    <div className="text-lg font-black text-rose-700">Rs. {totalDeducted.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Debits in period</div>
                </div>
            </div>

            {/* Account Balance Banner (only if account exists) */}
            {hasAccount && accountBalance !== null && (
                <div className={`flex items-center justify-between px-4 py-3 rounded-xl border font-bold text-sm ${accountBalance >= 0 ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
                    <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4" />
                        <span className="text-xs font-black uppercase tracking-wider">Current Account Balance (All Time)</span>
                    </div>
                    <span className="text-lg font-black font-mono">Rs. {accountBalance.toLocaleString()}</span>
                </div>
            )}

            {/* ── Tabs for Detailed Data ── */}
            <Tabs defaultValue="transactions" className="w-full mt-4">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="orders" className="text-xs font-bold uppercase tracking-wider">Purchase Orders</TabsTrigger>
                    <TabsTrigger value="transactions" className="text-xs font-bold uppercase tracking-wider">Ledger Accounts</TabsTrigger>
                    <TabsTrigger value="holds" className="text-xs font-bold uppercase tracking-wider">Card Holds & Releases</TabsTrigger>
                </TabsList>

                <TabsContent value="orders" className="mt-4">
                    {/* ── Purchase Orders Table ── */}
                    <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-700">Purchase Orders — Period</span>
                    <Badge variant="secondary" className="text-[10px] h-4 px-2">{purchases.length}</Badge>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    {purchases.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                            <Package className="h-8 w-8 opacity-30" />
                            <p className="text-sm font-medium">No purchase orders in this period</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/70">
                                        <TableHead className="text-[10px] font-black uppercase whitespace-nowrap">PO #</TableHead>
                                        {isCombined && <TableHead className="text-[10px] font-black uppercase whitespace-nowrap">Supplier</TableHead>}
                                        <TableHead className="text-[10px] font-black uppercase whitespace-nowrap">Date</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase whitespace-nowrap">Product</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-right whitespace-nowrap">Ordered</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-right whitespace-nowrap">Delivered</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-right whitespace-nowrap">Rate / L</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-right whitespace-nowrap">Total Value</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-center whitespace-nowrap">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {purchases.map((po) => {
                                        // Derive product name from items array or products join
                                        const productName = po.products?.name ||
                                            (po.items && po.items[0]?.product_name) ||
                                            po.product_type || "—"
                                        const date = po.purchase_date || po.created_at
                                        return (
                                            <TableRow key={po.id} className="hover:bg-slate-50/50 transition-colors">
                                                <TableCell className="font-mono text-xs font-black text-primary whitespace-nowrap">
                                                    {po.po_number}
                                                </TableCell>
                                                {isCombined && (
                                                    <TableCell className="text-xs font-bold text-slate-700 whitespace-nowrap">
                                                        {po.suppliers?.name || "—"}
                                                    </TableCell>
                                                )}
                                                <TableCell className="text-xs whitespace-nowrap text-slate-600">
                                                    {date ? format(parseISO(date.includes("T") ? date : date + "T00:00:00"), "dd MMM yyyy") : "—"}
                                                </TableCell>
                                                <TableCell className="text-xs whitespace-nowrap font-medium capitalize">
                                                    {productName}
                                                </TableCell>
                                                <TableCell className="text-xs font-mono text-right whitespace-nowrap">
                                                    {Number(po.ordered_quantity || 0).toLocaleString()} L
                                                </TableCell>
                                                <TableCell className="text-xs font-mono text-right whitespace-nowrap">
                                                    <span className={Number(po.delivered_quantity || 0) >= Number(po.ordered_quantity || 0) ? "text-emerald-600 font-bold" : "text-slate-600"}>
                                                        {Number(po.delivered_quantity || 0).toLocaleString()} L
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-xs font-mono text-right whitespace-nowrap">
                                                    Rs. {Number(po.rate_per_liter || 0).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-xs font-mono font-bold text-right whitespace-nowrap text-blue-700">
                                                    Rs. {Number(po.estimated_total || po.total_amount || 0).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-center whitespace-nowrap">
                                                    <PurchaseStatusBadge status={po.status} />
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                            {/* Purchase Total Row */}
                            <div className="flex items-center justify-between bg-blue-50 border-t border-blue-100 px-4 py-2.5">
                                <span className="text-[10px] font-black uppercase text-blue-600 tracking-wider">Period Purchase Total</span>
                                <span className="font-mono font-black text-sm text-blue-700">Rs. {totalPurchased.toLocaleString()}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
                </TabsContent>

                <TabsContent value="transactions" className="mt-4">
            {/* ── Transactions / Payments Table ── */}
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-700">Payment & Transaction Ledger — Period</span>
                    <Badge variant="secondary" className="text-[10px] h-4 px-2">{transactions.length}</Badge>
                </div>

                {!hasAccount ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-amber-700">No Company Account Linked</p>
                            <p className="text-xs text-amber-600 mt-0.5">This supplier has no account set up. Go to Suppliers page to create one and enable ledger tracking.</p>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        {transactions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                                <CreditCard className="h-8 w-8 opacity-30" />
                                <p className="text-sm font-medium">No transactions in this period</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50/70">
                                            <TableHead className="text-[10px] font-black uppercase whitespace-nowrap">Date</TableHead>
                                            {isCombined && <TableHead className="text-[10px] font-black uppercase whitespace-nowrap">Supplier</TableHead>}
                                            <TableHead className="text-[10px] font-black uppercase whitespace-nowrap">Type</TableHead>
                                            <TableHead className="text-[10px] font-black uppercase whitespace-nowrap">Reference</TableHead>
                                            <TableHead className="text-[10px] font-black uppercase whitespace-nowrap">Note / Description</TableHead>
                                            <TableHead className="text-[10px] font-black uppercase text-right whitespace-nowrap">Amount</TableHead>
                                            {!isCombined && <TableHead className="text-[10px] font-black uppercase text-right whitespace-nowrap">Balance After</TableHead>}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {transactions.map((tx) => (
                                            <TableRow key={tx.id} className={`hover:bg-slate-50/50 transition-colors ${tx.transaction_type === "credit" ? "bg-emerald-50/30" : "bg-rose-50/20"}`}>
                                                <TableCell className="text-xs whitespace-nowrap text-slate-600">
                                                    {tx.transaction_date
                                                        ? format(parseISO(tx.transaction_date.includes("T") ? tx.transaction_date : tx.transaction_date + "T00:00:00"), "dd MMM yyyy")
                                                        : "—"}
                                                </TableCell>
                                                {isCombined && (
                                                    <TableCell className="text-xs font-bold text-slate-700 whitespace-nowrap">
                                                        {tx.company_accounts?.suppliers?.name || "—"}
                                                    </TableCell>
                                                )}
                                                <TableCell className="whitespace-nowrap">
                                                    <TxTypeBadge type={tx.transaction_type} source={tx.transaction_source} />
                                                </TableCell>
                                                <TableCell className="text-[10px] font-mono font-black text-slate-500 uppercase flex flex-col gap-1">
                                                    <span>{tx.reference_number || <span className="text-muted-foreground italic">—</span>}</span>
                                                    {tx.bank_accounts?.account_name && (
                                                        <Badge variant="outline" className="text-[9px] w-fit text-blue-700 border-blue-200 bg-blue-50/50">
                                                            🏦 {tx.bank_accounts.account_name}
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs text-slate-600 max-w-[200px] truncate">
                                                    {tx.note || sourceLabel(tx.transaction_source)}
                                                </TableCell>
                                                <TableCell className="text-right whitespace-nowrap">
                                                    <span className={`font-mono font-black text-xs ${tx.transaction_type === "credit" ? "text-emerald-700" : "text-rose-700"}`}>
                                                        {tx.transaction_type === "credit" ? "+" : "−"} Rs. {Number(tx.amount).toLocaleString()}
                                                    </span>
                                                </TableCell>
                                                {!isCombined && (
                                                    <TableCell className="text-right whitespace-nowrap">
                                                        <span className={`font-mono text-xs font-bold ${(tx.balance_after || 0) >= 0 ? "text-slate-700" : "text-rose-600"}`}>
                                                            Rs. {Number(tx.balance_after || 0).toLocaleString()}
                                                        </span>
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>

                                {/* Transaction Summary Footer */}
                                <div className="grid grid-cols-3 divide-x border-t bg-slate-50/80">
                                    <div className="px-4 py-2.5 text-center">
                                        <div className="text-[9px] font-black uppercase text-emerald-600 tracking-wider">Total Payments In</div>
                                        <div className="font-mono font-black text-sm text-emerald-700">Rs. {totalPaid.toLocaleString()}</div>
                                    </div>
                                    <div className="px-4 py-2.5 text-center">
                                        <div className="text-[9px] font-black uppercase text-rose-600 tracking-wider">Total Deductions</div>
                                        <div className="font-mono font-black text-sm text-rose-700">Rs. {totalDeducted.toLocaleString()}</div>
                                    </div>
                                    <div className="px-4 py-2.5 text-center">
                                        <div className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Net Period Movement</div>
                                        <div className={`font-mono font-black text-sm ${netPeriodBalance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                            {netPeriodBalance >= 0 ? "+" : ""}Rs. {netPeriodBalance.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
                </TabsContent>

                <TabsContent value="holds" className="mt-4">
            {/* ── Card Holds & Releases ── */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <ShieldAlert className="h-4 w-4 text-amber-600" />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-700">Card Payment Holds & Releases</span>
                    <Badge variant="secondary" className="text-[10px] h-4 px-2">{holds.length}</Badge>
                    
                    {/* Filter Buttons */}
                    <div className="flex items-center gap-1 ml-auto border rounded-lg p-0.5 bg-slate-100">
                        <button
                            onClick={() => setHoldFilter("all")}
                            className={`text-[10px] font-bold px-3 py-1 rounded-md transition-all ${
                                holdFilter === "all"
                                    ? "bg-white text-slate-800 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            All ({holds.length})
                        </button>
                        <button
                            onClick={() => setHoldFilter("pending")}
                            className={`text-[10px] font-bold px-3 py-1 rounded-md transition-all ${
                                holdFilter === "pending"
                                    ? "bg-amber-500 text-white shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            On Hold ({pendingHolds.length})
                        </button>
                        <button
                            onClick={() => setHoldFilter("released")}
                            className={`text-[10px] font-bold px-3 py-1 rounded-md transition-all ${
                                holdFilter === "released"
                                    ? "bg-emerald-500 text-white shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            Released ({releasedHolds.length})
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    {holds.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                            <ShieldCheck className="h-8 w-8 opacity-30" />
                            <p className="text-sm font-medium">No card holds for this supplier</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/70">
                                        <TableHead className="text-[10px] font-black uppercase whitespace-nowrap">Card Name</TableHead>
                                        {isCombined && <TableHead className="text-[10px] font-black uppercase whitespace-nowrap">Supplier</TableHead>}
                                        <TableHead className="text-[10px] font-black uppercase whitespace-nowrap">Sale Date</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-right whitespace-nowrap">Gross Amount</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-right whitespace-nowrap">Tax</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-right whitespace-nowrap">Net Amount</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-center whitespace-nowrap">Days Pending</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-center whitespace-nowrap">Status</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase whitespace-nowrap">Settled At</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(holdFilter === "all" ? holds : holdFilter === "released" ? releasedHolds : pendingHolds).map((hold) => {
                                        const isReleased = hold._normalized_status === "released"
                                        const saleDate = hold.sale_date || hold.created_at
                                        const now = new Date()
                                        const holdStart = new Date(hold.created_at)

                                        // Days calculation
                                        let daysPending: number
                                        if (isReleased && (hold.released_at || hold.actual_return_date)) {
                                            daysPending = differenceInDays(new Date(hold.released_at || hold.actual_return_date), holdStart)
                                        } else {
                                            daysPending = differenceInDays(now, holdStart)
                                        }

                                        // Urgency color for pending holds
                                        let urgencyClass = "bg-blue-100 text-blue-700 border-blue-200"
                                        let urgencyText = `${daysPending}d pending`
                                        if (!isReleased) {
                                            if (daysPending >= 14) {
                                                urgencyClass = "bg-red-100 text-red-700 border-red-200"
                                                urgencyText = `${daysPending}d — LONG HOLD`
                                            } else if (daysPending >= 7) {
                                                urgencyClass = "bg-amber-100 text-amber-700 border-amber-200"
                                                urgencyText = `${daysPending}d on hold`
                                            }
                                        }

                                        const cardName = hold.supplier_cards?.card_name || "—"

                                        return (
                                            <TableRow key={hold.id} className={`transition-colors ${isReleased ? "bg-emerald-50/30" : "hover:bg-amber-50/30"}`}>
                                                <TableCell className="text-xs font-bold text-primary whitespace-nowrap">
                                                    <div className="flex items-center gap-1.5">
                                                        <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                                                        {cardName}
                                                        {hold._source === "po" && (
                                                            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 bg-blue-50 text-blue-600 border-blue-200 ml-1">PO</Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                {isCombined && (
                                                    <TableCell className="text-xs font-bold text-slate-700 whitespace-nowrap">
                                                        {hold.supplier_cards?.suppliers?.name || "—"}
                                                    </TableCell>
                                                )}
                                                <TableCell className="text-xs whitespace-nowrap text-slate-600">
                                                    {saleDate ? format(new Date(saleDate.includes("T") ? saleDate : saleDate + "T00:00:00"), "dd MMM yyyy") : "—"}
                                                </TableCell>
                                                <TableCell className="text-xs font-mono text-right whitespace-nowrap text-slate-700">
                                                    Rs. {Number(hold.hold_amount || 0).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-xs font-mono text-right whitespace-nowrap text-rose-600">
                                                    {hold.tax_amount > 0 ? `−Rs. ${Number(hold.tax_amount).toLocaleString()}` : "—"}
                                                </TableCell>
                                                <TableCell className="text-xs font-mono font-bold text-right whitespace-nowrap text-amber-700">
                                                    Rs. {Number(hold.net_amount || hold.hold_amount || 0).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-center whitespace-nowrap">
                                                    {!isReleased ? (
                                                        <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0 h-5 flex items-center gap-1 justify-center ${urgencyClass}`}>
                                                            <Clock className="h-3 w-3" />
                                                            {urgencyText}
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-[10px] font-bold px-2 py-0 h-5 flex items-center gap-1 justify-center bg-slate-100 text-slate-600">
                                                            <CheckCircle2 className="h-3 w-3" />
                                                            {daysPending}d held
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center whitespace-nowrap">
                                                    {isReleased ? (
                                                        <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold h-5 px-2">
                                                            <ShieldCheck className="h-3 w-3 mr-1" /> Released
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-bold h-5 px-2">
                                                            <ShieldAlert className="h-3 w-3 mr-1" /> Pending
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs whitespace-nowrap text-slate-600">
                                                    {isReleased && (hold.released_at || hold.actual_return_date) ? (
                                                        <span className="text-emerald-600 font-medium">
                                                            {format(new Date(hold.released_at || hold.actual_return_date), "dd MMM yyyy")}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground italic">Pending</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>

                            {/* Hold Summary Footer */}
                            <div className="grid grid-cols-2 divide-x border-t bg-slate-50/80">
                                <div className="px-4 py-2.5 text-center">
                                    <div className="text-[9px] font-black uppercase text-amber-600 tracking-wider">Total Pending</div>
                                    <div className="font-mono font-black text-sm text-amber-700">
                                        Rs. {totalOnHold.toLocaleString()}
                                        <span className="text-[10px] font-medium text-muted-foreground ml-1">({pendingHolds.length} transaction{pendingHolds.length !== 1 ? "s" : ""})</span>
                                    </div>
                                </div>
                                <div className="px-4 py-2.5 text-center">
                                    <div className="text-[9px] font-black uppercase text-emerald-600 tracking-wider">Total Released</div>
                                    <div className="font-mono font-black text-sm text-emerald-700">
                                        Rs. {totalReleased.toLocaleString()}
                                        <span className="text-[10px] font-medium text-muted-foreground ml-1">({releasedHolds.length} transaction{releasedHolds.length !== 1 ? "s" : ""})</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}

function sourceLabel(source?: string): string {
    if (!source) return "—"
    const map: Record<string, string> = {
        opening_balance: "Opening Balance",
        manual_transfer: "Manual Transfer",
        delivery: "Delivery Charge",
        purchase: "Purchase Charge",
        hold_release: "Hold Release",
        adjustment: "Balance Adjustment"
    }
    return map[source] || source.replace(/_/g, " ")
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SupplierPerformanceReport({ filters, onDetailClick, onDataLoaded }: {
    filters: ReportFilter,
    onDetailClick?: (item: any) => void,
    onDataLoaded?: (data: any) => void
}) {
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [totalOnHold, setTotalOnHold] = useState(0)
    const [totalReleased, setTotalReleased] = useState(0)
    
    const reportDataRef = useRef<any>({})

    const handleLedgerDataLoaded = useCallback((ledgerData: any) => {
        reportDataRef.current = { ...reportDataRef.current, ...ledgerData }
        onDataLoaded?.(reportDataRef.current)
    }, [onDataLoaded])

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            try {
                const fromDate = format(filters.dateRange.from, "yyyy-MM-dd")
                const toDate = format(filters.dateRange.to, "yyyy-MM-dd")

                // Fetch suppliers with company_accounts only (no nested purchase_orders to avoid 400 errors)
                let query = supabase
                    .from("suppliers")
                    .select(`
                        *,
                        company_accounts (
                            id,
                            current_balance
                        )
                    `)

                if (filters.supplierId !== "all") {
                    query = query.eq("id", filters.supplierId)
                }

                if (filters.productType !== "all") {
                    if (filters.productType === "fuel") {
                        query = query.eq("product_type", "fuel")
                    } else if (filters.productType === "oil_lubricant" || filters.productType === "oil") {
                        query = query.eq("product_type", "oil")
                    }
                }

                const { data: suppliersData, error: suppErr } = await query.order("name")

                if (suppErr) {
                    console.error("Error fetching suppliers:", suppErr)
                }

                if (suppliersData) {
                    // Fetch purchase order counts for the period for each supplier in a single query
                    const { data: periodOrders } = await supabase
                        .from("purchase_orders")
                        .select("supplier_id, estimated_total, due_amount, created_at, purchase_date")
                        .gte("created_at", fromDate)
                        .lte("created_at", toDate + "T23:59:59")

                    const ordersBySupplier: Record<string, any[]> = {}
                    for (const o of (periodOrders || [])) {
                        if (!ordersBySupplier[o.supplier_id]) ordersBySupplier[o.supplier_id] = []
                        ordersBySupplier[o.supplier_id].push(o)
                    }

                    const processed: SupplierRow[] = suppliersData.map((s: any) => {
                        const ordersInPeriod = ordersBySupplier[s.id] || []
                        const totalPurchasedPeriod = ordersInPeriod.reduce((sum: number, o: any) =>
                            sum + Number(o.estimated_total || 0), 0)

                        // Use actual company account balance for outstanding dues
                        const accountData = s.company_accounts
                        const account = Array.isArray(accountData) ? accountData[0] : accountData
                        const accountBalance = account ? Number(account.current_balance || 0) : 0

                        return {
                            ...s,
                            periodPurchases: totalPurchasedPeriod,
                            outstandingDues: accountBalance,
                            orderCount: ordersInPeriod.length,
                        }
                    })

                    setSuppliers(processed)

                    // Fetch card hold records across all suppliers via supplier_cards join
                    const supplierIds = suppliersData.map((s: any) => s.id)
                    const { data: holdsData } = await supabase
                        .from("card_hold_records")
                        .select("hold_amount, status, supplier_cards!inner(supplier_id)")
                        .in("supplier_cards.supplier_id", supplierIds)
                        .not("supplier_card_id", "is", null)
                        .gte("sale_date", fromDate)
                        .lte("sale_date", toDate)

                    // Also fetch PO hold records
                    const { data: poHoldsData } = await supabase
                        .from("po_hold_records")
                        .select("hold_amount, status, purchase_orders!inner(supplier_id)")
                        .in("purchase_orders.supplier_id", supplierIds)

                    let holdTotal = 0
                    let releasedTotal = 0
                    // Card holds
                    for (const h of (holdsData || [])) {
                        const amt = Number(h.hold_amount || 0)
                        if (h.status !== "released") holdTotal += amt
                        if (h.status === "released") releasedTotal += amt
                    }
                    // PO holds
                    for (const h of (poHoldsData || [])) {
                        const amt = Number(h.hold_amount || 0)
                        if (h.status === "on_hold") holdTotal += amt
                        if (h.status === "released") releasedTotal += amt
                    }
                    setTotalOnHold(holdTotal)
                    setTotalReleased(releasedTotal)

                    const summaryData = {
                        suppliers: processed,
                        totalSuppliers: processed.length,
                        totalOnHold: holdTotal,
                        totalReleased: releasedTotal,
                        totalOrders: processed.reduce((sum, s) => sum + s.orderCount, 0),
                        totalOutstanding: processed.reduce((sum, s) => sum + s.outstandingDues, 0),
                    }
                    reportDataRef.current = { ...reportDataRef.current, ...summaryData }
                    onDataLoaded?.(reportDataRef.current)
                }
            } catch (error) {
                console.error("Error fetching supplier report:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [filters])

    const toggleExpand = (id: string) => {
        setExpandedId(prev => prev === id ? null : id)
    }

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
                <Skeleton className="h-[400px] w-full rounded-xl" />
            </div>
        )
    }

    // Search filter
    const filteredSuppliers = suppliers.filter(s => {
        if (!searchQuery) return true
        const q = searchQuery.toLowerCase()
        return s.name.toLowerCase().includes(q) ||
            (s.phone || "").toLowerCase().includes(q) ||
            (s.address || "").toLowerCase().includes(q) ||
            (s.product_type || "").toLowerCase().includes(q)
    })

    const totalAccountBalance = suppliers.reduce((sum, s) => {
        const accountData = s.company_accounts
        const account = Array.isArray(accountData) ? accountData[0] : accountData
        return sum + (account ? Number(account.current_balance || 0) : 0)
    }, 0)

    return (
        <div className="space-y-6">
            {/* ── Overview Cards ── */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-primary/5 border-primary/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Suppliers</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end gap-2">
                            <div className="text-3xl font-black">{suppliers.length}</div>
                            <div className="text-xs text-muted-foreground mb-1">in view</div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-emerald-50 border-emerald-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-emerald-600 uppercase tracking-wider">Total Accounts Balance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-3xl font-black ${totalAccountBalance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>Rs. {totalAccountBalance.toLocaleString()}</div>
                        <div className="text-xs text-emerald-600/70 mt-1">All supplier accounts combined</div>
                    </CardContent>
                </Card>
                <Card className="bg-amber-50 border-amber-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-amber-600 uppercase tracking-wider">Total Amount On Hold</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-amber-700">Rs. {totalOnHold.toLocaleString()}</div>
                        <div className="text-xs text-amber-600/70 mt-1">Pending card holds across all suppliers</div>
                    </CardContent>
                </Card>
                <Card className="bg-blue-50 border-blue-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-600 uppercase tracking-wider">Total Released</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-blue-700">Rs. {totalReleased.toLocaleString()}</div>
                        <div className="text-xs text-blue-600/70 mt-1">Released card holds across all suppliers</div>
                    </CardContent>
                </Card>
            </div>

            {/* ── Supplier Table + Expandable Ledger ── */}
            {filters.supplierId === "all" ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <SupplierLedgerPanel filters={filters} onLedgerDataLoaded={handleLedgerDataLoaded} />
                </div>
            ) : (
                <Card className="shadow-sm">
                    <CardHeader className="space-y-3">
                    <div>
                        <CardTitle className="text-base font-bold">Supplier Performance Matrix</CardTitle>
                        <CardDescription>Click <strong>View Ledger</strong> on any supplier to see full purchases, payments, holds & balance history</CardDescription>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search suppliers by name, phone, address..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-10 rounded-lg border-slate-200"
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {filteredSuppliers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                            <Users className="h-12 w-12 opacity-20" />
                            <p className="font-medium">{searchQuery ? `No suppliers matching "${searchQuery}"` : "No suppliers found for the selected filters"}</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {filteredSuppliers.map((s) => {
                                const isExpanded = expandedId === s.id
                                const accountData = s.company_accounts
                                const account = Array.isArray(accountData) ? accountData[0] : accountData
                                const balance = account ? Number(account.current_balance) : null

                                return (
                                    <div key={s.id}>
                                        {/* ── Supplier Row ── */}
                                        <div className={`grid grid-cols-2 sm:grid-cols-[2fr,1fr,1fr,1fr,1fr,auto] items-center gap-4 px-4 py-3 transition-colors ${isExpanded ? "bg-primary/5" : "hover:bg-slate-50/60"} overflow-x-auto`}>

                                            {/* Supplier info */}
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-sm flex-shrink-0">
                                                    {s.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-900">{s.name}</div>
                                                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                                        <Phone className="h-3 w-3" /> {s.phone || "—"}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Type */}
                                            <div>
                                                <div className="text-[9px] font-black uppercase text-muted-foreground tracking-wider mb-1">Type</div>
                                                <Badge variant="outline" className="text-[10px] capitalize font-bold">
                                                    {(s.supplier_type || s.product_type || "general").replace(/_/g, " ")}
                                                </Badge>
                                            </div>

                                            {/* Period Purchases */}
                                            <div>
                                                <div className="text-[9px] font-black uppercase text-muted-foreground tracking-wider mb-1">Period Purchases</div>
                                                <div className="font-mono font-bold text-sm text-slate-700">Rs. {s.periodPurchases.toLocaleString()}</div>
                                                <div className="text-[10px] text-muted-foreground">{s.orderCount} order{s.orderCount !== 1 ? "s" : ""}</div>
                                            </div>

                                            {/* Account Balance */}
                                            <div>
                                                <div className="text-[9px] font-black uppercase text-muted-foreground tracking-wider mb-1">Acct Balance</div>
                                                {balance !== null ? (
                                                    <div className={`font-mono font-bold text-sm ${balance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                                        Rs. {balance.toLocaleString()}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">No account</span>
                                                )}
                                            </div>

                                            {/* Status */}
                                            <div>
                                                <div className="text-[9px] font-black uppercase text-muted-foreground tracking-wider mb-1">Status</div>
                                                <Badge variant={s.status === "active" ? "default" : "secondary"} className="h-5 text-[10px]">
                                                    {s.status}
                                                </Badge>
                                            </div>

                                            {/* Expand button */}
                                            <Button
                                                variant={isExpanded ? "default" : "outline"}
                                                size="sm"
                                                className="h-8 px-3 text-xs font-bold whitespace-nowrap flex-shrink-0"
                                                onClick={() => toggleExpand(s.id)}
                                            >
                                                {isExpanded ? (
                                                    <><ChevronUp className="h-3 w-3 mr-1" /> Close</>
                                                ) : (
                                                    <><ChevronDown className="h-3 w-3 mr-1" /> View Ledger</>
                                                )}
                                            </Button>
                                        </div>

                                        {/* ── Expanded Ledger Panel ── */}
                                        {isExpanded && (
                                            <SupplierLedgerPanel supplier={s} filters={filters} />
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
            )}
        </div>
    )
}
