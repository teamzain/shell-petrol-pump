"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
    ArrowLeft,
    Building2,
    Phone,
    Mail,
    MapPin,
    FileText,
    Wallet,
    History,
    PlusCircle,
    ArrowUpCircle,
    ArrowDownCircle,
    AlertCircle
} from "lucide-react"
import { BrandLoader } from "@/components/ui/brand-loader"
import { getSupplierById, getSupplierLedger, createCompanyAccount, addLedgerTransaction } from "@/app/actions/suppliers"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { SupplierDialog } from "@/components/suppliers/supplier-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export default function SupplierDetailPage() {
    const { id } = useParams()
    const router = useRouter()
    const [supplier, setSupplier] = useState<any>(null)
    const [transactions, setTransactions] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [txDialogOpen, setTxDialogOpen] = useState(false)
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [txType, setTxType] = useState<'credit' | 'debit'>('credit')

    const [txData, setTxData] = useState({
        amount: "",
        date: new Date().toISOString().split("T")[0],
        ref: "",
        note: ""
    })

    const fetchData = async () => {
        setLoading(true)
        try {
            const data = await getSupplierById(id as string)
            setSupplier(data)
            if (data.company_accounts) {
                const account = Array.isArray(data.company_accounts) ? data.company_accounts[0] : data.company_accounts
                if (account) {
                    const ledgerData = await getSupplierLedger(account.id)
                    setTransactions(ledgerData.transactions.slice(0, 5)) // Just last 5
                }
            }
        } catch (error) {
            console.error("Error fetching supplier data:", error)
            toast.error("Failed to load supplier details")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (id) fetchData()
    }, [id])

    const handleCreateAccount = async () => {
        setActionLoading(true)
        try {
            await createCompanyAccount(id as string)
            toast.success("Company account created successfully")
            fetchData()
        } catch (error) {
            toast.error("Failed to create account")
        } finally {
            setActionLoading(false)
        }
    }

    const handleTransactionSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!supplier.company_accounts?.[0]?.id) return

        setActionLoading(true)
        try {
            await addLedgerTransaction({
                company_account_id: supplier.company_accounts[0].id,
                transaction_type: txType,
                amount: parseFloat(txData.amount),
                transaction_date: txData.date,
                reference_number: txData.ref,
                note: txData.note
            })
            toast.success(`Transaction recorded: ${txType === 'credit' ? 'Added Funds' : 'Payment Made'}`)
            setTxDialogOpen(false)
            setTxData({ amount: "", date: new Date().toISOString().split("T")[0], ref: "", note: "" })
            fetchData()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to record transaction")
        } finally {
            setActionLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <BrandLoader size="lg" className="mb-4" />
                <p className="text-muted-foreground animate-pulse">Fetching Supplier Profile...</p>
            </div>
        )
    }

    const accountData = supplier.company_accounts
    const account = Array.isArray(accountData) ? accountData[0] : accountData
    const balance = account ? Number(account.current_balance) : 0
    const openingDue = account ? Number(account.opening_due || 0) : 0

    return (
        <div className="flex flex-col gap-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between">
                <Button variant="ghost" className="pl-0" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Suppliers
                </Button>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditDialogOpen(true)}>Edit Profile</Button>
                    {account && (
                        <Button onClick={() => { setTxType('debit'); setTxDialogOpen(true); }}>
                            Record Payment
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Profile Card */}
                <Card className="md:col-span-1 border-primary/20 bg-primary/5 shadow-sm">
                    <CardHeader className="text-center">
                        <div className="mx-auto h-20 w-20 rounded-full bg-white border-2 border-primary flex items-center justify-center text-primary text-3xl font-black mb-2 shadow-sm">
                            {supplier.name.charAt(0)}
                        </div>
                        <CardTitle className="text-xl font-bold">{supplier.name}</CardTitle>
                        <div className="flex flex-col gap-1 mt-2">
                            <Badge variant="secondary" className="mx-auto uppercase text-[10px] tracking-widest font-black">
                                {supplier.product_type === 'both' ? 'Fuel & Oil' : supplier.product_type} Supplier
                            </Badge>
                            <Badge variant="outline" className={`mx-auto text-[9px] font-bold h-4 px-2 ${supplier.supplier_type === 'local' ? 'text-amber-600 border-amber-200 bg-amber-50' : 'text-blue-600 border-blue-200 bg-blue-50'}`}>
                                {supplier.supplier_type === 'local' ? 'Local Supplier' : 'Company'}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-3 pt-2">
                            <div className="flex items-center gap-3 text-sm">
                                <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center border shadow-sm"><Phone className="h-4 w-4 text-primary" /></div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Phone</span>
                                    <span className="font-medium">{supplier.phone}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center border shadow-sm"><Building2 className="h-4 w-4 text-primary" /></div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Point of Contact</span>
                                    <span className="font-medium">{supplier.contact_person || "Not specified"}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center border shadow-sm"><Mail className="h-4 w-4 text-primary" /></div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Email</span>
                                    <span className="font-medium">{supplier.email || "N/A"}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center border shadow-sm"><FileText className="h-4 w-4 text-primary" /></div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold">NTN Number</span>
                                    <span className="font-medium">{supplier.ntn_number || "N/A"}</span>
                                </div>
                            </div>
                            <Separator />
                            <div className="pt-2">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-2 mb-1">
                                    <MapPin className="h-3 w-3" /> Address
                                </span>
                                <p className="text-sm leading-relaxed text-slate-600 italic">
                                    {supplier.address || "No physical address recorded."}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Account & Ledger Card */}
                <div className="md:col-span-2 space-y-6">
                    <Card className="overflow-hidden border-orange-200">
                        <div className="bg-orange-600 p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
                                    <Wallet className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-widest opacity-80">{supplier.supplier_type === 'local' ? 'Due Amount' : 'Current Statement Balance'}</h3>
                                    <div className="text-3xl font-black tracking-tighter text-white">
                                        {supplier.supplier_type === 'local' ? '-' : ''} Rs. {Math.abs(balance).toLocaleString()}
                                    </div>
                                    {openingDue > 0 && (
                                        <div className="mt-2 pt-2 border-t border-white/20">
                                            <div className="text-[10px] opacity-75 uppercase font-bold tracking-wider">Separate Opening Due</div>
                                            <div className="font-bold text-lg">Rs. {openingDue.toLocaleString()}</div>
                                        </div>
                                    )}

                                </div>
                            </div>
                            {!account ? (
                                <Button variant="secondary" className="bg-white text-orange-600 hover:bg-slate-50 font-black uppercase text-[10px] tracking-widest" onClick={handleCreateAccount} disabled={actionLoading}>
                                    {actionLoading ? <BrandLoader size="xs" /> : "Link Company Account"}
                                </Button>
                            ) : (
                                <div className="flex gap-2">
                                    <Button variant="secondary" className="bg-white/10 text-white hover:bg-white/20 border-white/20 font-black uppercase text-[10px] tracking-widest" onClick={() => { setTxType('credit'); setTxDialogOpen(true); }}>
                                        Add Funds
                                    </Button>
                                </div>
                            )}
                        </div>
                        {account && (
                            <CardContent className="p-0">
                                <div className="p-6 border-b bg-slate-50/50 flex items-center justify-between">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                        <History className="h-4 w-4" /> Recent Ledger Activity
                                    </h4>
                                    <Link href={`/dashboard/suppliers/${id}/transactions`} className="text-[10px] font-black uppercase text-primary hover:underline tracking-widest">
                                        View Full Statement
                                    </Link>
                                </div>
                                <div className="divide-y">
                                    {transactions.length === 0 ? (
                                        <div className="py-12 text-center text-muted-foreground text-sm italic">
                                            No transactions recorded yet.
                                        </div>
                                    ) : (
                                        transactions.map((tx) => (
                                            <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-slate-50/30 transition-all">
                                                <div className="flex items-center gap-3">
                                                    {tx.transaction_type === 'credit' ? (
                                                        <ArrowUpCircle className="h-8 w-8 text-green-500 opacity-20" />
                                                    ) : (
                                                        <ArrowDownCircle className="h-8 w-8 text-red-500 opacity-20" />
                                                    )}
                                                    <div>
                                                        <div className="text-xs font-bold text-slate-900">
                                                            {tx.card_hold_id ? (
                                                                <span className="flex items-center gap-1.5 italic text-primary">
                                                                    Card Hold Release: {tx.card_hold_records?.supplier_cards?.card_name || tx.card_hold_records?.card_type || 'Supplier Card'}
                                                                </span>
                                                            ) : tx.transaction_source === 'opening_balance' ? (supplier.supplier_type === 'local' ? "Due" : "Opening Balance") :
                                                                (tx.note || (tx.transaction_type === 'credit' ? 'Account Deposit' : 'Supply Payment'))}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground font-medium">
                                                            {new Date(tx.transaction_date).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                            {tx.reference_number && ` • Ref: ${tx.reference_number}`}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={`text-sm font-black ${tx.transaction_type === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                                                    {tx.transaction_type === 'credit' ? '+' : '-'} Rs. {Number(tx.amount).toLocaleString()}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                        )}
                        {!account && (
                            <CardContent className="py-12 text-center text-muted-foreground">
                                <div className="max-w-[300px] mx-auto space-y-3">
                                    <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                                        <AlertCircle className="h-6 w-6" />
                                    </div>
                                    <p className="text-sm font-medium">This supplier does not have a linked company account yet.</p>
                                    <p className="text-xs">Create an account to start tracking purchase payments and balance history.</p>
                                </div>
                            </CardContent>
                        )}
                    </Card>
                </div>
            </div>

            {/* Transaction Dialog */}
            <Dialog open={txDialogOpen} onOpenChange={setTxDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{txType === 'credit' ? 'Add Funds to Account' : 'Record Supply Payment'}</DialogTitle>
                        <DialogDescription>
                            {txType === 'credit'
                                ? "Add internal credit or opening balance to the supplier statement."
                                : "Record a debit against the supplier balance for supplies received."}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleTransactionSubmit} className="space-y-4 pt-4">
                        <div className="grid gap-2">
                            <Label htmlFor="amount">Amount (PKR)</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">Rs.</span>
                                <Input
                                    id="amount"
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
                            <Label htmlFor="date">Transaction Date</Label>
                            <Input
                                id="date"
                                type="date"
                                required
                                value={txData.date}
                                onChange={(e) => setTxData({ ...txData, date: e.target.value })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ref">Reference / Check Number</Label>
                            <Input
                                id="ref"
                                placeholder="e.g. CHECK-1234"
                                value={txData.ref}
                                onChange={(e) => setTxData({ ...txData, ref: e.target.value })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="note">Note / Description</Label>
                            <Textarea
                                id="note"
                                placeholder="Details about this entry..."
                                value={txData.note}
                                onChange={(e) => setTxData({ ...txData, note: e.target.value })}
                            />
                        </div>
                        <DialogFooter className="gap-2">
                            <Button type="button" variant="outline" onClick={() => setTxDialogOpen(false)}>Cancel</Button>
                            <Button
                                type="submit"
                                disabled={actionLoading || (() => {
                                    if (!parseFloat(txData.amount) || parseFloat(txData.amount) <= 0) return true
                                    return false
                                })()}
                            >
                                {actionLoading ? <BrandLoader size="xs" /> : "Save Transaction"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <SupplierDialog
                open={editDialogOpen}
                onOpenChange={setEditDialogOpen}
                supplier={supplier}
                onSuccess={fetchData}
            />
        </div>
    )
}
