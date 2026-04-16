"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    ArrowLeft,
    Download,
    Printer,
    ArrowUpCircle,
    ArrowDownCircle,
    Calendar,
    Filter,
    Wallet,
    Landmark,
    Eye,
    CheckCircle2
} from "lucide-react"
import { BrandLoader } from "@/components/ui/brand-loader"
import { getSupplierById, getSupplierLedger, getActiveBankAccounts } from "@/app/actions/suppliers"
import { recordBalanceTransaction, paySpecificTransactionDue } from "@/app/actions/balance"
import { toast } from "sonner"

export default function SupplierTransactionsPage() {
    const { id } = useParams()
    const router = useRouter()
    const [supplier, setSupplier] = useState<any>(null)
    const [transactions, setTransactions] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Pay Dues States
    const [txDialogOpen, setTxDialogOpen] = useState(false)
    const [txActionLoading, setTxActionLoading] = useState(false)
    const [paySpecificId, setPaySpecificId] = useState<string | null>(null)
    const [bankAccounts, setBankAccounts] = useState<any[]>([])
    
    const [txData, setTxData] = useState({
        method: "cash",
        bank_account_id: "none",
        amount: "",
        date: new Date().toISOString().split("T")[0],
        note: ""
    })

    // Filter States
    const [txTypeFilter, setTxTypeFilter] = useState<string>("all")
    const [startDate, setStartDate] = useState<string>("")
    const [endDate, setEndDate] = useState<string>("")

    const fetchData = async () => {
        setLoading(true)
        try {
            const data = await getSupplierById(id as string)
            setSupplier(data)
            const account = Array.isArray(data.company_accounts) ? data.company_accounts[0] : data.company_accounts
            if (account?.id) {
                const ledgerData = await getSupplierLedger(account.id)
                setTransactions(ledgerData.transactions || [])
            }
            
            const banks = await getActiveBankAccounts()
            setBankAccounts(banks || [])
        } catch (error: any) {
            console.error(error)
            toast.error(error?.message || "Failed to load transactions")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (id) fetchData()
    }, [id])

    const handlePayDues = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!txData.amount || Number(txData.amount) <= 0) return
        
        setTxActionLoading(true)
        try {
            if (paySpecificId) {
                await paySpecificTransactionDue({
                    transaction_id: paySpecificId,
                    amount: Number(txData.amount),
                    supplier_id: id as string,
                    method: txData.method as any,
                    bank_account_id: txData.method === 'bank' && txData.bank_account_id !== 'none' ? txData.bank_account_id : undefined,
                    note: txData.note,
                    date: txData.date
                })
            } else {
                await recordBalanceTransaction({
                    transaction_type: 'transfer_to_supplier',
                    amount: Number(txData.amount),
                    supplier_id: id as string,
                    bank_account_id: txData.method === 'bank' && txData.bank_account_id !== 'none' ? txData.bank_account_id : undefined,
                    description: `${txData.note || 'Payment to Supplier'}`,
                    date: txData.date
                })
            }
            
            toast.success("Payment recorded and balance updated.")
            setTxDialogOpen(false)
            setPaySpecificId(null)
            setTxData({
                method: "cash",
                bank_account_id: "none",
                amount: "",
                date: new Date().toISOString().split("T")[0],
                note: ""
            })
            fetchData() 
        } catch (error: any) {
            toast.error(error.message || "Failed to record payment")
        } finally {
            setTxActionLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <BrandLoader size="lg" className="mb-4" />
                <p className="text-muted-foreground animate-pulse">Loading Ledger Statement...</p>
            </div>
        )
    }

    const _companyAccounts = supplier?.company_accounts
    const account = Array.isArray(_companyAccounts) ? _companyAccounts[0] : _companyAccounts
    const currentBalance = account ? Number(account.current_balance || 0) : 0

    const filteredTransactions = transactions
        .filter(t => {
            const matchesType = txTypeFilter === "all" || t.transaction_type === txTypeFilter
            const txDate = new Date(t.transaction_date)
            const matchesStart = !startDate || txDate >= new Date(startDate)
            const matchesEnd = !endDate || txDate <= new Date(endDate)
            return matchesType && matchesStart && matchesEnd
        })
        .sort((a, b) => {
            // ALWAYS force opening_balance to the very top
            if (a.transaction_source === 'opening_balance') return -1;
            if (b.transaction_source === 'opening_balance') return 1;

            // Otherwise sort by date as usual
            return new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
        })

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Statement: {supplier?.name}</h1>
                        <p className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                            {account?.status === 'active' ? (
                                <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 uppercase text-[10px] tracking-widest font-black">Active Account</Badge>
                            ) : (
                                <Badge variant="outline" className="text-slate-600 bg-slate-50 uppercase text-[10px] tracking-widest font-black">Inactive</Badge>
                            )}
                            Ledger History
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {supplier?.supplier_type !== 'local' && (
                        <Button variant="default" size="sm" onClick={() => setTxDialogOpen(true)} className="bg-orange-600 hover:bg-orange-700 text-white font-bold tracking-wider">
                            Pay Dues
                        </Button>
                    )}
                    <Button variant="outline" size="sm">
                        <Download className="mr-2 h-4 w-4" /> Export CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => window.print()}>
                        <Printer className="mr-2 h-4 w-4" /> Print
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-blue-50 border-blue-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase text-blue-600 tracking-widest flex items-center gap-2">
                            <Wallet className="h-4 w-4" /> Opening Balance
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-blue-700">
                            Rs. {
                                (() => {
                                    const openingTx = transactions.find(t => t.transaction_source === 'opening_balance');
                                    if (openingTx) {
                                        // Directions for balance calculation:
                                        // In many cases, an Opening Balance (credit) means starting with positive funds.
                                        // In this ledger, Debit reduces balance. 
                                        const amount = Number(openingTx.amount);
                                        return (openingTx.transaction_type === 'debit' ? -amount : amount).toLocaleString();
                                    }
                                    return "0";
                                })()
                            }
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase text-green-600 tracking-widest flex items-center gap-2">
                            <ArrowUpCircle className="h-4 w-4" /> Total Credits
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-green-700">
                            Rs. {transactions
                                .filter(t => t.transaction_type === 'credit' && t.transaction_source !== 'opening_balance' && t !== transactions[0])
                                .reduce((acc, t) => acc + Number(t.amount), 0).toLocaleString()}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-red-50 border-red-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase text-red-600 tracking-widest flex items-center gap-2">
                            <ArrowDownCircle className="h-4 w-4" /> Total Debits
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-red-700">
                            Rs. {transactions
                                .filter(t => t.transaction_type === 'debit' && t.transaction_source !== 'opening_balance')
                                .reduce((acc, t) => acc + Number(t.amount), 0).toLocaleString()}
                        </div>
                    </CardContent>
                </Card>
                <Card className={`border ${currentBalance > 0 ? 'bg-green-50 border-green-200' : currentBalance < 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                    <CardHeader className="pb-2">
                        <CardTitle className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${currentBalance > 0 ? 'text-green-700' : currentBalance < 0 ? 'text-red-700' : 'text-slate-600'}`}>
                            <Landmark className="h-4 w-4" /> Current Balance
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-black ${currentBalance > 0 ? 'text-green-700' : currentBalance < 0 ? 'text-red-700' : 'text-slate-700'}`}>
                            Rs. {currentBalance.toLocaleString()}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="text-lg font-bold">Ledger Transactions</CardTitle>
                        <p className="text-xs text-muted-foreground">Showing detailed history of all financial activities.</p>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase mr-1">Date:</span>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="h-8 w-32 py-1 text-xs"
                            />
                            <span className="text-muted-foreground text-xs">to</span>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="h-8 w-32 py-1 text-xs"
                            />
                        </div>

                        <Select value={txTypeFilter} onValueChange={setTxTypeFilter}>
                            <SelectTrigger className="w-[110px] h-8 text-xs bg-white">
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                <SelectItem value="credit">Credits</SelectItem>
                                <SelectItem value="debit">Debits</SelectItem>
                            </SelectContent>
                        </Select>

                        {(txTypeFilter !== "all" || startDate !== "" || endDate !== "") && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setTxTypeFilter("all")
                                    setStartDate("")
                                    setEndDate("")
                                }}
                                className="h-8 text-[10px] font-bold text-muted-foreground uppercase"
                            >
                                Reset
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50/50">
                                <TableHead className="w-[80px] font-bold">#</TableHead>
                                <TableHead className="w-[100px] font-bold text-xs uppercase tracking-wider">Date</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Description</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Type</TableHead>
                                <TableHead className="font-bold text-right text-xs uppercase tracking-wider">Amount</TableHead>
                                {supplier?.supplier_type === 'local' && <TableHead className="font-bold text-right text-xs uppercase tracking-wider">Remaining Due</TableHead>}
                                <TableHead className="font-bold text-right text-xs uppercase tracking-wider">Balance After</TableHead>
                                <TableHead className="font-bold text-center text-xs uppercase tracking-wider">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTransactions.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                        No transactions found for this supplier
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredTransactions.map((tx, idx) => {
                                    const txDate = new Date(tx.transaction_date).toLocaleDateString('en-GB').replace(/\//g, '-')

                                    // Generate the standard Description string
                                    let description = "Manual Transaction"
                                    if (tx.transaction_source === 'opening_balance' || (idx === 0 && tx.transaction_type === 'credit')) {
                                        description = supplier?.supplier_type === 'local' ? "Opening Due" : "Opening Balance"
                                    } else if (tx.transaction_source === 'manual_transfer') {
                                        description = tx.note || "Fund Transfer"
                                        if (tx.reference_number && !description.includes('Ref#')) description += ` | Ref# ${tx.reference_number}`
                                    } else if (tx.transaction_source === 'delivery' || tx.transaction_source === 'purchase' || tx.transaction_source === 'purchase_order' || tx.purchase_order_id) {
                                        const poObj = tx.purchase_orders || tx.deliveries?.purchase_orders

                                        // Try to get product info - fallback to type if nested products join was removed
                                        const prodName = poObj?.products?.name || poObj?.product_type || "Items"
                                        
                                        const isDebit = tx.transaction_type === 'debit'
                                        description = isDebit ? "Purchase Order" : "PO Payment"
                                        
                                        if (poObj?.po_number) description += ` | PO# ${poObj.po_number}`
                                        
                                        const qty = tx.deliveries?.delivered_quantity || poObj?.ordered_quantity
                                        if (qty) description += ` | ${qty} ${prodName}`

                                        if (tx.deliveries?.company_invoice_number) description += ` | Invoice# ${tx.deliveries.company_invoice_number}`
                                    } else if (tx.transaction_source === 'hold_release') {
                                        const hr = tx.po_hold_records
                                        const po = hr?.purchase_orders
                                        description = "Hold Released"
                                        if (po?.po_number) description += ` | PO# ${po.po_number}`
                                    } else if (tx.transaction_source === 'reversal') {
                                        description = "Reversal"
                                        if (tx.reference_number) description += ` | Ref# ${tx.reference_number}`
                                    }

                                    const isCredit = tx.transaction_type === 'credit'
                                    const rowBgClass = isCredit ? 'bg-green-50/10 hover:bg-green-50/50' : 'bg-red-50/10 hover:bg-red-50/50'

                                    return (
                                        <TableRow
                                            key={tx.id}
                                            className={`${rowBgClass} cursor-pointer transition-colors hover:shadow-sm`}
                                            onClick={() => router.push(`/dashboard/suppliers/${id}/transactions/${tx.id}`)}
                                        >
                                            <TableCell className="font-medium text-slate-500">{idx + 1}</TableCell>
                                            <TableCell className="text-xs font-medium">{txDate}</TableCell>
                                            <TableCell className="text-xs font-semibold max-w-[300px] truncate">{description}</TableCell>
                                            <TableCell>
                                                <Badge className={isCredit ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-600 border-red-200'}>
                                                    {isCredit ? <span className="flex items-center gap-1">Credit <ArrowUpCircle className="h-3 w-3" /></span> : <span className="flex items-center gap-1">Debit <ArrowDownCircle className="h-3 w-3" /></span>}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className={`text-right font-bold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                                                {isCredit ? '+' : '-'} PKR {Number(tx.amount).toLocaleString()}
                                            </TableCell>
                                            {supplier?.supplier_type === 'local' && (
                                                <TableCell className="text-right font-black">
                                                    {tx.transaction_type === 'debit' && tx.remaining_amount !== null ? (
                                                        <div className="flex flex-col gap-1 items-end">
                                                            {Number(tx.remaining_amount) > 0 ? (
                                                                <span className="text-amber-600">PKR {Number(tx.remaining_amount).toLocaleString()}</span>
                                                            ) : (
                                                                <Badge variant="outline" className="text-[10px] text-slate-400">Settled</Badge>
                                                            )}
                                                            {Number(tx.amount) - Number(tx.remaining_amount) > 0 && (
                                                                <div className="text-[9px] text-green-600 flex items-center gap-1 opacity-80 uppercase tracking-wider">
                                                                    <CheckCircle2 className="h-3 w-3" /> Paid: PKR {(Number(tx.amount) - Number(tx.remaining_amount)).toLocaleString()}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : "-"}
                                                </TableCell>
                                            )}
                                            <TableCell className={`text-right font-black ${Number(tx.balance_after || 0) > 0 ? 'text-green-600' : Number(tx.balance_after || 0) < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                                                {description.includes('Payment against') ? "-" : `PKR ${Number(tx.balance_after || 0).toLocaleString()}`}
                                            </TableCell>
                                            <TableCell className="text-center flex justify-center gap-2">
                                                {supplier?.supplier_type === 'local' && tx.is_due && Number(tx.remaining_amount) > 0 && (
                                                    <Button size="sm" className="h-8 bg-orange-600 hover:bg-orange-700 text-white text-[10px] uppercase font-bold tracking-wider" onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPaySpecificId(tx.id);
                                                        setTxData({ ...txData, amount: tx.remaining_amount.toString() });
                                                        setTxDialogOpen(true);
                                                    }}>Pay Due</Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    title="View Detail"
                                                    className="h-8 w-8 p-0"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/dashboard/suppliers/${id}/transactions/${tx.id}`);
                                                    }}
                                                >
                                                    <Eye className="h-4 w-4 text-slate-500" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={txDialogOpen} onOpenChange={(val) => {
                setTxDialogOpen(val)
                if (!val) setPaySpecificId(null)
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{paySpecificId ? 'Pay Specific Due' : 'Pay Supplier Dues'}</DialogTitle>
                        <DialogDescription>
                            {paySpecificId ? 'Record a payment towards this specific transaction balance.' : 'Record a general payment to this supplier. This will reduce your cash/bank balance and credit the supplier account.'}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handlePayDues} className="space-y-4 pt-4">
                        <div className="grid gap-2">
                            <Label>Payment Method</Label>
                            <Select value={txData.method} onValueChange={(val) => setTxData({ ...txData, method: val })}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cash">Cash Account</SelectItem>
                                    <SelectItem value="bank">Bank Account</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        
                        {txData.method === "bank" && (
                            <div className="grid gap-2">
                                <Label>Select Bank Account</Label>
                                <Select value={txData.bank_account_id} onValueChange={(val) => setTxData({ ...txData, bank_account_id: val })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Bank..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none" disabled>Select Bank...</SelectItem>
                                        {bankAccounts.map((b) => (
                                            <SelectItem key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        
                        <div className="grid gap-2">
                            <Label>Transaction Date</Label>
                            <Input
                                type="date"
                                required
                                value={txData.date}
                                onChange={(e) => setTxData({ ...txData, date: e.target.value })}
                            />
                        </div>
                        
                        <div className="grid gap-2">
                            <Label>Amount (PKR)</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">Rs.</span>
                                <Input
                                    type="number"
                                    className="pl-10 font-bold"
                                    required
                                    value={txData.amount}
                                    onChange={(e) => setTxData({ ...txData, amount: e.target.value })}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label>Note / Comment</Label>
                            <Textarea
                                placeholder="Details about this payment..."
                                value={txData.note}
                                onChange={(e) => setTxData({ ...txData, note: e.target.value })}
                            />
                        </div>

                        <DialogFooter className="gap-2">
                            <Button type="button" variant="outline" onClick={() => setTxDialogOpen(false)}>Cancel</Button>
                            <Button
                                type="submit"
                                disabled={txActionLoading || (txData.method === "bank" && txData.bank_account_id === "none") || !parseFloat(txData.amount)}
                            >
                                {txActionLoading ? <BrandLoader size="xs" /> : "Save Payment"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
