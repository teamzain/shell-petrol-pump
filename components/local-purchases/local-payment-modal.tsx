"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription,
} from "@/components/ui/form"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { BrandLoader } from "@/components/ui/brand-loader"
import { getCashAndBankBalances, getSystemActiveDate } from "@/app/actions/balance"
import { payLocalPurchaseOrder } from "@/app/actions/local-purchases"
import { Wallet, CreditCard, Landmark, Banknote, Calendar } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

const paymentSchema = z.object({
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    payment_source: z.enum(["cash", "bank"]),
    bank_account_id: z.string().optional(),
    transaction_date: z.string().min(1, "Date is required"),
    reference_number: z.string().optional(),
    note: z.string().optional(),
})

interface LocalPaymentModalProps {
    isOpen: boolean
    onClose: () => void
    po: any
    onSuccess: () => void
}

export function LocalPaymentModal({ isOpen, onClose, po, onSuccess }: LocalPaymentModalProps) {
    const [loading, setLoading] = useState(false)
    const [bankAccounts, setBankAccounts] = useState<any[]>([])
    const [cashBalance, setCashBalance] = useState(0)
    const [systemActiveDate, setSystemActiveDate] = useState("")

    const remainingDue = Number(po.estimated_total) - Number(po.paid_amount || 0)

    const form = useForm<z.infer<typeof paymentSchema>>({
        resolver: zodResolver(paymentSchema),
        defaultValues: {
            amount: remainingDue,
            payment_source: "cash",
            bank_account_id: "",
            transaction_date: "",
            reference_number: "",
            note: ""
        }
    })

    const paymentSource = form.watch("payment_source")

    useEffect(() => {
        if (isOpen) {
            const fetchData = async () => {
                try {
                    const [balances, activeDate] = await Promise.all([
                        getCashAndBankBalances(),
                        getSystemActiveDate()
                    ])
                    setBankAccounts(balances.bankAccounts || [])
                    setCashBalance(balances.cashBalance || 0)
                    setSystemActiveDate(activeDate)
                    form.setValue("transaction_date", activeDate)
                    form.setValue("amount", remainingDue)
                } catch (error) {
                    console.error("Failed to fetch payment context:", error)
                }
            }
            fetchData()
        }
    }, [isOpen, po, remainingDue, form])

    async function onSubmit(values: z.infer<typeof paymentSchema>) {
        if (values.payment_source === 'bank' && !values.bank_account_id) {
            toast.error("Please select a bank account")
            return
        }

        setLoading(true)
        try {
            const result = await payLocalPurchaseOrder({
                po_id: po.id,
                ...values
            })

            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Payment recorded successfully")
                onSuccess()
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to process payment")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px] border-0 shadow-2xl p-0 overflow-hidden">
                <div className="bg-slate-900 p-6 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
                            <Wallet className="h-6 w-6 text-green-400" /> Confirm Payment
                        </DialogTitle>
                        <DialogDescription className="text-slate-400 font-medium">
                            Record a payment for Local PO <span className="text-white font-bold">#{po.po_number}</span> to <span className="text-white font-bold">{po.suppliers?.name}</span>.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="mt-6 p-4 bg-white/10 rounded-xl border border-white/10 flex justify-between items-center">
                        <div className="text-xs uppercase font-black text-slate-400 tracking-widest">Remaining Due</div>
                        <div className="text-2xl font-black text-green-400">Rs. {remainingDue.toLocaleString()}</div>
                    </div>
                </div>

                <div className="p-6">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="transaction_date"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-black uppercase tracking-widest text-slate-500">Payment Date</FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                                                    <Input type="date" className="pl-10 h-11 font-medium" {...field} />
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="amount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-black uppercase tracking-widest text-slate-500">Amount (Rs.)</FormLabel>
                                            <FormControl>
                                                <Input type="number" step="0.01" className="h-11 font-black text-lg text-green-700" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="payment_source"
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                        <FormLabel className="text-xs font-black uppercase tracking-widest text-slate-500">Payment Source</FormLabel>
                                        <FormControl>
                                            <RadioGroup
                                                onValueChange={field.onChange}
                                                defaultValue={field.value}
                                                className="flex gap-4"
                                            >
                                                <FormItem className="flex-1">
                                                    <FormControl className="sr-only">
                                                        <RadioGroupItem value="cash" />
                                                    </FormControl>
                                                    <FormLabel className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer ${field.value === 'cash' ? 'border-slate-900 bg-slate-50 shadow-md' : 'border-slate-100 hover:border-slate-200'}`}>
                                                        <Banknote className={`h-6 w-6 ${field.value === 'cash' ? 'text-slate-900' : 'text-slate-300'}`} />
                                                        <span className="text-xs font-black uppercase text-center">Cash Account</span>
                                                        <span className="text-[10px] font-bold text-slate-400">Bal: {cashBalance.toLocaleString()}</span>
                                                    </FormLabel>
                                                </FormItem>
                                                <FormItem className="flex-1">
                                                    <FormControl className="sr-only">
                                                        <RadioGroupItem value="bank" />
                                                    </FormControl>
                                                    <FormLabel className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer ${field.value === 'bank' ? 'border-slate-900 bg-slate-50 shadow-md' : 'border-slate-100 hover:border-slate-200'}`}>
                                                        <Landmark className={`h-6 w-6 ${field.value === 'bank' ? 'text-slate-900' : 'text-slate-300'}`} />
                                                        <span className="text-xs font-black uppercase text-center">Bank Account</span>
                                                        <span className="text-[10px] font-bold text-slate-400">{bankAccounts.length} Connected</span>
                                                    </FormLabel>
                                                </FormItem>
                                            </RadioGroup>
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            {paymentSource === 'bank' && (
                                <FormField
                                    control={form.control}
                                    name="bank_account_id"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-black uppercase tracking-widest text-slate-500">Select Bank Account</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="h-11">
                                                        <SelectValue placeholder="Chose account..." />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {bankAccounts.map(acc => (
                                                        <SelectItem key={acc.id} value={acc.id}>
                                                            {acc.account_name} <span className="text-slate-400 text-[10px] ml-2"> (Rs. {Number(acc.current_balance).toLocaleString()})</span>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="reference_number"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-black uppercase tracking-widest text-slate-500">Ref# / Check#</FormLabel>
                                            <FormControl>
                                                <Input className="h-11" placeholder="Optional" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="note"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-black uppercase tracking-widest text-slate-500">Payment Note</FormLabel>
                                            <FormControl>
                                                <Input className="h-11" placeholder="Optional" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="ghost" onClick={onClose} disabled={loading} className="font-bold">Cancel</Button>
                                <Button type="submit" className="bg-slate-900 border-0 h-11 px-8 font-black uppercase tracking-wider" disabled={loading}>
                                    {loading ? <BrandLoader size="sm" /> : "Confirm & Deduct Funds"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </div>
            </DialogContent>
        </Dialog>
    )
}
