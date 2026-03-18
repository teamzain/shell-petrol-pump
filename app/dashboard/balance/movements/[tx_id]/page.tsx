"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Clock, FileText, Package, Wallet, ShieldCheck, ArrowUpCircle, ArrowDownCircle, User, Phone, Banknote, Building2 } from "lucide-react"
import { BrandLoader } from "@/components/ui/brand-loader"
import { getTransactionDetail } from "@/app/actions/suppliers"
import { toast } from "sonner"

export default function BalanceTransactionDetailPage() {
    const { tx_id } = useParams()
    const router = useRouter()
    const [transaction, setTransaction] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchTransaction = async () => {
            if (!tx_id || typeof tx_id !== 'string') {
                console.error("Invalid tx_id:", tx_id)
                setLoading(false)
                return
            }
            
            setLoading(true)
            console.log("Fetching transaction detail for ID:", tx_id)
            try {
                const data = await getTransactionDetail(tx_id)
                console.log("Transaction data received:", data)
                if (!data) {
                    console.warn("No transaction found for ID:", tx_id)
                }
                setTransaction(data)
            } catch (error) {
                console.error("Error fetching transaction details:", error)
                toast.error("Failed to load transaction details")
            } finally {
                setLoading(false)
            }
        }

        fetchTransaction()
    }, [tx_id])

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <BrandLoader size="lg" className="mb-4" />
                <p className="text-muted-foreground animate-pulse font-black uppercase tracking-widest text-[10px]">Loading Ledger Details...</p>
            </div>
        )
    }

    if (!transaction) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div className="text-center space-y-4">
                    <p className="text-xl font-bold text-slate-700">Transaction Not Found</p>
                    <p className="text-sm text-muted-foreground italic">The requested transaction with ID {String(tx_id)} could not be located.</p>
                    <Button onClick={() => router.push('/dashboard/balance/movements')}>Back to Ledger</Button>
                </div>
            </div>
        )
    }

    const isCredit = transaction.source_table === 'balance_transactions'
        ? ["add_cash", "add_bank", "cash_to_bank"].includes(transaction.transaction_type)
        : transaction.transaction_type === 'credit'

    let sourceLabel = "Manual Transaction"
    if (transaction.source_table === 'balance_transactions') {
        if (transaction.transaction_type === 'cash_to_bank') sourceLabel = "Cash to Bank Transfer"
        else if (transaction.transaction_type === 'bank_to_cash') sourceLabel = "Bank to Cash Withdrawal"
        else if (transaction.transaction_type === 'add_cash') sourceLabel = transaction.is_opening ? "Opening Cash Balance" : "Manual Cash Addition"
        else if (transaction.transaction_type === 'add_bank') sourceLabel = transaction.is_opening ? "Opening Bank Balance" : "Manual Bank Deposit"
        else if (transaction.transaction_type === 'bank_to_bank') sourceLabel = "Bank to Bank Transfer"
        else if (transaction.transaction_type === 'transfer_to_supplier') sourceLabel = "Transfer to Supplier"
    } else {
        if (transaction.transaction_source === 'opening_balance') sourceLabel = "Opening Balance"
        if (transaction.transaction_source === 'manual_transfer') sourceLabel = "Fund Transfer"
        if (transaction.transaction_source === 'delivery' || transaction.transaction_source === 'purchase' || transaction.transaction_source === 'purchase_order') sourceLabel = "Purchase"
        if (transaction.transaction_source === 'hold_release') sourceLabel = "Hold Released"
        if (transaction.transaction_source === 'reversal') sourceLabel = "Reversal"
    }

    const transactionDate = transaction.transaction_date || transaction.created_at
    const txDate = transactionDate ? new Date(transactionDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }) : "N/A"

    const isInternalTransfer = transaction.source_table === 'balance_transactions' && 
        ['cash_to_bank', 'bank_to_cash', 'bank_to_bank'].includes(transaction.transaction_type)

    const fromAccount = transaction.bank_accounts?.account_name || (transaction.transaction_type === 'cash_to_bank' ? 'Cash' : null)
    const toAccount = transaction.to_bank_accounts?.account_name || (transaction.transaction_type === 'bank_to_cash' ? 'Cash' : null)

    const d = transaction.deliveries
    const po = (transaction.deliveries?.purchase_orders || transaction.purchase_orders || transaction.po_hold_records?.purchase_orders)
    const hr = transaction.po_hold_records
    const ca = transaction.company_accounts
    const supp = ca?.suppliers

    return (
        <div className="flex flex-col gap-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/balance/movements')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Transaction Detail</h1>
                        <p className="text-sm text-muted-foreground font-black uppercase tracking-widest text-primary">
                            #{transaction.id ? String(transaction.id).substring(0, 8).toUpperCase() : "UNKNOWN"}
                        </p>
                    </div>
                </div>
                <Badge className={isCredit ? 'bg-green-100 text-green-700 border-green-200 text-sm py-1' : 'bg-red-100 text-red-600 border-red-200 text-sm py-1'}>
                    {isCredit ? <span className="flex items-center gap-1">Inflow <ArrowUpCircle className="h-4 w-4" /></span> : <span className="flex items-center gap-1">Outflow <ArrowDownCircle className="h-4 w-4" /></span>}
                </Badge>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Main Transaction Card */}
                <Card className="md:col-span-2 border shadow-sm">
                    <CardHeader className="bg-slate-50/50 border-b pb-4">
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <FileText className="h-4 w-4" /> Transaction Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="grid grid-cols-2 divide-x divide-y">
                            <div className="p-4 space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Transaction ID</p>
                                <p className="font-mono text-xs">{transaction.id}</p>
                            </div>
                            <div className="p-4 space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Date</p>
                                <p className="font-medium text-sm">{txDate}</p>
                            </div>
                            <div className="p-4 space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Type</p>
                                <p className="font-medium text-sm capitalize">{transaction.transaction_type?.replace("_", " ")}</p>
                            </div>
                            <div className="p-4 space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Method</p>
                                <p className="font-bold text-sm text-slate-700">{sourceLabel}</p>
                            </div>
                            {isInternalTransfer && (
                                <div className="p-4 col-span-2 space-y-1 bg-blue-50/50">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Fund Movement Pathway</p>
                                    <div className="flex items-center gap-2 font-bold text-slate-700">
                                        <div className="bg-white px-2 py-1 rounded border shadow-sm text-xs">{fromAccount || 'Origin'}</div>
                                        <ArrowLeft className="h-3 w-3 rotate-180 text-blue-400" />
                                        <div className="bg-white px-2 py-1 rounded border shadow-sm text-xs">{toAccount || 'Destination'}</div>
                                    </div>
                                </div>
                            )}
                            <div className="p-4 space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Amount</p>
                                <p className={`font-black text-lg ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                                    {isCredit ? '+' : '-'} PKR {Number(transaction.amount).toLocaleString()}
                                </p>
                            </div>
                            <div className="p-4 space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reference No.</p>
                                <p className="font-medium text-sm">{transaction.reference_number || "-"}</p>
                            </div>
                            <div className="p-4 col-span-2 space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Note / Description</p>
                                <p className="text-sm italic text-slate-600">{transaction.note || transaction.description || "-"}</p>
                            </div>
                        </div>

                        {/* Balance Movement Sub-section */}
                        <div className="border-t bg-slate-50 p-6">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                                <Wallet className="h-4 w-4" /> Balance Movement
                            </h4>
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div className="bg-white p-3 rounded-lg border shadow-sm">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Balance Before</p>
                                    <p className="font-semibold text-slate-600">PKR {Number(transaction.balance_before || 0).toLocaleString()}</p>
                                </div>
                                <div className={`p-3 rounded-lg border shadow-sm ${isCredit ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">This Transaction</p>
                                    <p className={`font-black ${isCredit ? 'text-green-700' : 'text-red-700'}`}>
                                        {isCredit ? '+' : '-'} PKR {Number(transaction.amount).toLocaleString()}
                                    </p>
                                </div>
                                <div className="bg-white p-3 rounded-lg border shadow-sm border-primary/20">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Balance After</p>
                                    <p className={`font-black ${Number(transaction.balance_after || 0) > 0 ? 'text-green-600' : Number(transaction.balance_after || 0) < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                                        PKR {Number(transaction.balance_after || 0).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Sidebar Cards */}
                <div className="space-y-6">
                    {/* Section: Supplier Profile Card */}
                    {supp && (
                        <Card>
                            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Supplier Profile</CardTitle>
                                <Building2 className="h-4 w-4 text-slate-400 opacity-50" />
                            </CardHeader>
                            <CardContent className="space-y-4 text-sm mt-2">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Building2 className="h-3 w-3 text-slate-400" />
                                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Supplier Name</p>
                                    </div>
                                    <p className="font-bold text-lg">{supp.name || "N/A"}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4 border-t pt-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <User className="h-3 w-3 text-slate-400" />
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground">Contact Person</p>
                                        </div>
                                        <p className="font-medium">{supp.contact_person || "-"}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Phone className="h-3 w-3 text-slate-400" />
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground">Phone</p>
                                        </div>
                                        <p className="font-medium">{supp.phone || "-"}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Purchase Related Sections */}
                    {po && (
                        <Card className="border-indigo-100 bg-indigo-50/30">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-indigo-700">Purchase Order Information</CardTitle>
                                <FileText className="h-4 w-4 text-indigo-500 opacity-50" />
                            </CardHeader>
                            <CardContent className="space-y-4 text-sm mt-2">
                                <div className="grid grid-cols-2 gap-y-3">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold uppercase text-muted-foreground">PO Number</p>
                                        <p className="font-mono text-xs font-semibold">{po.po_number || "-"}</p>
                                    </div>
                                    <div className="space-y-1 text-right">
                                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Status</p>
                                        <Badge variant="outline" className="capitalize text-[10px]">{po.status?.replace("_", " ")}</Badge>
                                    </div>
                                    <div className="col-span-2 space-y-3 border-t pt-3">
                                        <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-2">
                                            <Package className="h-3 w-3" /> Order Items
                                        </p>
                                        <div className="space-y-2">
                                            {po.items && Array.isArray(po.items) ? (
                                                po.items.map((item: any, idx: number) => (
                                                    <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border border-slate-100 text-xs">
                                                        <div>
                                                            <p className="font-bold text-slate-700">{item.product_name || "Unknown Product"}</p>
                                                            <p className="text-[10px] text-muted-foreground">{item.ordered_quantity} {item.unit_type === 'unit' ? 'Units' : 'Liters'} @ PKR {Number(item.rate_per_liter || 0).toLocaleString()}</p>
                                                        </div>
                                                        <p className="font-black text-indigo-700">PKR {Number(item.total_amount || 0).toLocaleString()}</p>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="font-semibold text-blue-700">{d?.product_name || po?.product_name_override || po?.products?.name || "-"}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Delivery Context */}
                    {d && (
                        <Card className="border-slate-200 bg-slate-50/50">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-700">Delivery Information</CardTitle>
                                <Package className="h-4 w-4 text-slate-400 opacity-50" />
                            </CardHeader>
                            <CardContent className="space-y-4 text-sm mt-2">
                                <div className="grid grid-cols-2 gap-y-3">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Delivery No.</p>
                                        <p className="font-mono text-xs font-semibold">{d.delivery_number || "N/A"}</p>
                                    </div>
                                    <div className="space-y-1 text-right">
                                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Received Qty</p>
                                        <p className="font-semibold text-blue-700">{d.delivered_quantity} {po?.unit_type === 'unit' ? 'U' : 'L'}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Hold Context */}
                    {hr && (
                        <Card className="border-amber-200 bg-amber-50/50">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-amber-700">Hold Information</CardTitle>
                                <ShieldCheck className="h-4 w-4 text-amber-500 opacity-50" />
                            </CardHeader>
                            <CardContent className="space-y-4 text-sm mt-2">
                                <div className="flex justify-between items-center bg-white p-3 rounded border shadow-sm">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Hold Amount</p>
                                        <p className="font-black text-amber-700">PKR {Number(hr.hold_amount).toLocaleString()}</p>
                                    </div>
                                    <Badge variant="outline" className={`${hr.status === 'released' ? 'border-green-500 text-green-700 bg-green-50' : 'border-amber-500 text-amber-700 bg-amber-50'}`}>
                                        {hr.status === 'released' ? 'Released' : 'On Hold'}
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    )
}
