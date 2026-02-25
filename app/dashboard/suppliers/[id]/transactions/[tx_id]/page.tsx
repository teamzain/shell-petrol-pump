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

export default function TransactionDetailPage() {
    const { id, tx_id } = useParams()
    const router = useRouter()
    const [transaction, setTransaction] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchTransaction = async () => {
            setLoading(true)
            try {
                const data = await getTransactionDetail(tx_id as string)
                setTransaction(data)
            } catch (error) {
                console.error("Error fetching transaction details:", error)
                toast.error("Failed to load transaction details")
            } finally {
                setLoading(false)
            }
        }

        if (tx_id) fetchTransaction()
    }, [tx_id])

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <BrandLoader size="lg" className="mb-4" />
                <p className="text-muted-foreground animate-pulse">Loading Transaction Details...</p>
            </div>
        )
    }

    if (!transaction) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div className="text-center space-y-4">
                    <p className="text-xl font-bold text-slate-700">Transaction Not Found</p>
                    <Button onClick={() => router.back()}>Go Back</Button>
                </div>
            </div>
        )
    }

    const isCredit = transaction.transaction_type === 'credit'
    let sourceLabel = "Manual Transaction"
    if (transaction.transaction_source === 'opening_balance') sourceLabel = "Opening Balance"
    if (transaction.transaction_source === 'manual_transfer') sourceLabel = "Fund Transfer"
    if (transaction.transaction_source === 'delivery' || transaction.transaction_source === 'purchase') sourceLabel = "Purchase"
    if (transaction.transaction_source === 'hold_release') sourceLabel = "Hold Released"
    if (transaction.transaction_source === 'reversal') sourceLabel = "Reversal"

    const txDate = new Date(transaction.transaction_date).toLocaleDateString('en-GB').replace(/\//g, '-')

    const isPurchase = transaction.transaction_source === 'purchase' || transaction.transaction_source === 'delivery'
    const d = transaction.deliveries
    const po = isPurchase ? transaction.deliveries?.purchase_orders : undefined

    const hr = transaction.po_hold_records
    const hrPo = hr?.purchase_orders
    const ca = transaction.company_accounts
    const supp = ca?.suppliers

    return (
        <div className="flex flex-col gap-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/suppliers/${id}/transactions`)}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Transaction Detail</h1>
                        <p className="text-sm text-muted-foreground font-black uppercase tracking-widest text-primary">#{transaction.id.substring(0, 8).toUpperCase()}</p>
                    </div>
                </div>
                <Badge className={isCredit ? 'bg-green-100 text-green-700 border-green-200 text-sm py-1' : 'bg-red-100 text-red-600 border-red-200 text-sm py-1'}>
                    {isCredit ? <span className="flex items-center gap-1">Credit <ArrowUpCircle className="h-4 w-4" /></span> : <span className="flex items-center gap-1">Debit <ArrowDownCircle className="h-4 w-4" /></span>}
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
                                <p className="font-medium text-sm capitalize">{transaction.transaction_type} {isCredit ? '↑' : '↓'}</p>
                            </div>
                            <div className="p-4 space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Source</p>
                                <p className="font-bold text-sm text-slate-700">{sourceLabel}</p>
                            </div>
                            <div className="p-4 space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Amount</p>
                                <p className={`font-black text-lg ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                                    {isCredit ? '+' : '-'} PKR {Number(transaction.amount).toLocaleString()}
                                </p>
                            </div>
                            <div className="p-4 space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reference No.</p>
                                <p className="font-medium text-sm">{transaction.reference_number || (d?.company_invoice_number) || "-"}</p>
                            </div>
                            <div className="p-4 col-span-2 space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Note / Description</p>
                                <p className="text-sm italic text-slate-600">{transaction.note || "-"}</p>
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
                    {(transaction.transaction_source === 'delivery' || transaction.transaction_source === 'purchase') && po && (
                        <>
                            {/* Section 3: Purchase Order Information */}
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
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground">PO Created Date</p>
                                            <p className="font-mono text-xs font-semibold">{po.created_at ? new Date(po.created_at).toLocaleDateString('en-GB').replace(/\//g, '-') : "-"}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground">Expected Delivery</p>
                                            <p className="font-mono text-xs font-semibold">{po.expected_delivery_date ? new Date(po.expected_delivery_date).toLocaleDateString('en-GB').replace(/\//g, '-') : "-"}</p>
                                        </div>
                                        <div className="space-y-1 text-right">
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground">Category</p>
                                            <p className="font-medium capitalize">{po.products?.category || "Unknown"}</p>
                                        </div>
                                        <div className="col-span-2 space-y-1 border-t pt-2">
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground">Product Name</p>
                                            <p className="font-semibold">{po.products?.product_name || po.products?.name || "-"}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Section 4: Delivery Information */}
                            <Card className="border-blue-100 bg-blue-50/30">
                                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                    <CardTitle className="text-[10px] font-black uppercase tracking-widest text-blue-700">Delivery Information</CardTitle>
                                    <Package className="h-4 w-4 text-blue-500 opacity-50" />
                                </CardHeader>
                                <CardContent className="space-y-4 text-sm mt-2">
                                    <div className="grid grid-cols-2 gap-y-3">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground">Delivery Number</p>
                                            <p className="font-mono text-xs font-semibold">{d?.delivery_number || "Pending"}</p>
                                        </div>
                                        <div className="space-y-1 text-right">
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground">Actual Delivery Date</p>
                                            <p className="font-mono text-xs font-semibold">{d?.delivery_date ? new Date(d.delivery_date).toLocaleDateString('en-GB').replace(/\//g, '-') : "-"}</p>
                                        </div>
                                        <div className="space-y-1 mt-2 border-t pt-2">
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground">Qty Ordered</p>
                                            <p className="font-semibold">{po.ordered_quantity || "0"} {po.unit_type === 'unit' ? 'Units' : 'Liters'}</p>
                                        </div>
                                        <div className="space-y-1 mt-2 border-t pt-2 text-right">
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground">Qty Received</p>
                                            <p className="font-semibold text-blue-700">{d?.delivered_quantity || "0"} {po.unit_type === 'unit' ? 'Units' : 'Liters'}</p>
                                        </div>
                                        {(Number(po.quantity_remaining) > 0) && (
                                            <div className="col-span-2 space-y-1 bg-amber-50 p-2 rounded border border-amber-200 mt-2 text-amber-800">
                                                <div className="flex justify-between items-center">
                                                    <p className="text-[10px] font-bold uppercase text-amber-700/70">Qty Remaining (Short)</p>
                                                    <p className="font-black text-sm">{po.quantity_remaining} {po.unit_type === 'unit' ? 'Units' : 'Liters'}</p>
                                                </div>
                                            </div>
                                        )}
                                        <div className="col-span-2 space-y-1 mt-2 pt-3 border-t">
                                            <div className="flex justify-between mb-2">
                                                <span className="text-[10px] font-bold uppercase text-muted-foreground">Price Per Unit</span>
                                                <span className="font-mono text-sm">PKR {Number(po.rate_per_liter || 0).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between mb-4">
                                                <span className="text-[10px] font-bold uppercase text-muted-foreground">Total Amount Charged</span>
                                                <span className="font-mono font-black text-blue-700 text-sm">PKR {Number(transaction.amount || 0).toLocaleString()}</span>
                                            </div>

                                            <div className="flex justify-between pt-3 border-t">
                                                <span className="text-[10px] font-bold uppercase text-muted-foreground">Company Invoice Number</span>
                                                <span className="font-mono text-sm">{d?.company_invoice_number || "-"}</span>
                                            </div>
                                            <div className="flex justify-between mt-2">
                                                <span className="text-[10px] font-bold uppercase text-muted-foreground">Vehicle / Tanker Number</span>
                                                <span className="font-mono text-sm">{d?.vehicle_number || "-"}</span>
                                            </div>
                                            <div className="flex justify-between mt-2">
                                                <span className="text-[10px] font-bold uppercase text-muted-foreground">Driver Name</span>
                                                <span className="font-mono text-sm">{d?.driver_name || "-"}</span>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Section 5: Hold Information */}
                            {(Number(hr?.hold_amount) > 0) && (
                                <Card className="border-amber-200 bg-amber-50/50">
                                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-amber-700">Hold Information</CardTitle>
                                        <ShieldCheck className="h-4 w-4 text-amber-500 opacity-50" />
                                    </CardHeader>
                                    <CardContent className="space-y-4 text-sm mt-2">
                                        <div className="grid grid-cols-2 gap-y-3">
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-bold uppercase text-muted-foreground">Hold Quantity</p>
                                                <p className="font-black text-amber-700">{hr.hold_quantity} {po.unit_type === 'unit' ? 'Units' : 'Liters'}</p>
                                            </div>
                                            <div className="space-y-1 text-right">
                                                <p className="text-[10px] font-bold uppercase text-muted-foreground">Hold Amount</p>
                                                <p className="font-black text-amber-700">PKR {Number(hr.hold_amount).toLocaleString()}</p>
                                            </div>
                                            <div className="col-span-2 space-y-1 pt-2 border-t border-amber-200/50">
                                                <p className="text-[10px] font-bold uppercase text-muted-foreground">Expected Return Date</p>
                                                <p className="font-mono text-xs">{hr.expected_return_date ? new Date(hr.expected_return_date).toLocaleDateString('en-GB').replace(/\//g, '-') : "-"}</p>
                                            </div>
                                            <div className="col-span-2 space-y-1 pt-2 border-t border-amber-200/50 flex justify-between items-center mt-1 pb-1">
                                                <p className="text-[10px] font-bold uppercase text-muted-foreground">Hold Status</p>
                                                <Badge variant="outline" className={`${hr.status === 'released' || hr.actual_return_date ? 'border-green-500 text-green-700 bg-green-50' : 'border-amber-500 text-amber-700 bg-amber-50'}`}>
                                                    {hr.status === 'released' || hr.actual_return_date ? 'Released' : 'On Hold'}
                                                </Badge>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    )}

                    {transaction.transaction_source === 'hold_release' && hr && (
                        <Card className="border-amber-200 bg-amber-50/50">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-amber-700">Hold Release Information</CardTitle>
                                <ShieldCheck className="h-4 w-4 text-amber-500 opacity-50" />
                            </CardHeader>
                            <CardContent className="space-y-4 text-sm mt-2">
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-y-3">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground">PO Number</p>
                                            <p className="font-mono text-xs font-semibold">{hrPo?.po_number || "-"}</p>
                                        </div>
                                        <div className="space-y-1 text-right">
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground">Product</p>
                                            <p className="font-semibold">{hrPo?.products?.product_name || hrPo?.products?.name || "-"}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white p-3 rounded border shadow-sm flex justify-between items-center">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Hold Quantity</p>
                                            <p className="font-black text-amber-700">{hr?.hold_quantity || "0"} Units</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Hold Amount</p>
                                            <p className="font-black">PKR {Number(hr?.hold_amount || 0).toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-y-3 pt-2 border-t border-amber-200/50">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground">Expected Return Date</p>
                                            <p className="font-mono text-xs">{hr?.expected_return_date ? new Date(hr.expected_return_date).toLocaleDateString('en-GB').replace(/\//g, '-') : "-"}</p>
                                        </div>
                                        <div className="space-y-1 text-right">
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground">Actual Release Date</p>
                                            <p className="font-mono text-xs text-green-700 font-bold">{hr?.actual_return_date ? new Date(hr.actual_return_date).toLocaleDateString('en-GB').replace(/\//g, '-') : "-"}</p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {transaction.transaction_source === 'manual_transfer' && (
                        <Card className="border-indigo-100 bg-indigo-50/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-indigo-700">Transfer Information</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm mt-2">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Transfer Date</p>
                                    <p className="font-medium">{txDate}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Reference No.</p>
                                    <p className="font-mono font-semibold">{transaction.reference_number || "-"}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Note</p>
                                    <p className="italic text-slate-600">{transaction.note || "-"}</p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {transaction.transaction_source === 'opening_balance' && (
                        <Card className="border-blue-100 bg-blue-50/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-blue-700">Account Information</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm mt-2">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Account Created</p>
                                    <p className="font-medium">{txDate}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Opening Balance</p>
                                    <p className="font-black text-blue-700">PKR {Number(transaction.amount).toLocaleString()}</p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Section 6: Supplier Profile Card */}
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
                                <p className="font-bold text-lg">{supp?.name || "N/A"}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4 border-t pt-3">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <User className="h-3 w-3 text-slate-400" />
                                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Contact Person</p>
                                    </div>
                                    <p className="font-medium">{supp?.contact_person || "-"}</p>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Phone className="h-3 w-3 text-slate-400" />
                                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Phone</p>
                                    </div>
                                    <p className="font-medium">{supp?.phone || "-"}</p>
                                </div>
                            </div>
                            <div className="pt-3 mt-3 border-t">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <Banknote className="h-3 w-3 text-slate-400" />
                                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Current Balance</p>
                                    </div>
                                    <Wallet className="h-4 w-4 text-slate-400 opacity-50" />
                                </div>
                                <p className={`font-black text-xl mt-1 ${Number(ca?.current_balance || 0) > 0 ? 'text-green-600' : Number(ca?.current_balance || 0) < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                                    PKR {Number(ca?.current_balance || 0).toLocaleString()}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
