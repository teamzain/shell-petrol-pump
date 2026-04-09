"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { upsertSupplier, createCompanyAccount, addLedgerTransaction } from "@/app/actions/suppliers"
import { BrandLoader } from "@/components/ui/brand-loader"
import { TrendingDown, TrendingUp, AlertCircle } from "lucide-react"

const supplierSchema = z.object({
    name: z.string().min(1, "Company Name is required"),
    contact_person: z.string().optional(),
    phone: z.string().min(1, "Phone Number is required"),
    email: z.string().email().optional().or(z.literal("")),
    address: z.string().optional(),
    ntn_number: z.string().optional(),
    product_type: z.enum(["fuel", "oil", "both"]),
    status: z.enum(["active", "inactive"]).default("active"),
})

const balanceSchema = z.object({
    amount: z.coerce.number().min(1, "Amount must be greater than 0"),
    balance_type: z.enum(["positive", "credit"]),
    credit_limit: z.coerce.number().optional(),
    transaction_date: z.string().min(1, "Date is required"),
    reference_number: z.string().optional(),
    note: z.string().optional(),
})

interface SupplierWizardProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

export function SupplierWizard({ open, onOpenChange, onSuccess }: SupplierWizardProps) {
    const router = useRouter()
    const [step, setStep] = useState(1) // 1: Form, 2: Account?, 3: Balance?, 4: Amount Entry
    const [loading, setLoading] = useState(false)
    const [supplierId, setSupplierId] = useState<string | null>(null)
    const [accountId, setAccountId] = useState<string | null>(null)
    const [supplierName, setSupplierName] = useState("")

    const form = useForm<z.infer<typeof supplierSchema>>({
        resolver: zodResolver(supplierSchema),
        defaultValues: {
            name: "",
            contact_person: "",
            phone: "",
            email: "",
            address: "",
            ntn_number: "",
            product_type: "both",
            status: "active",
        },
    })

    const balanceForm = useForm<z.infer<typeof balanceSchema>>({
        resolver: zodResolver(balanceSchema),
        defaultValues: {
            amount: 0,
            balance_type: "positive",
            credit_limit: undefined,
            transaction_date: new Date().toISOString().split("T")[0],
            reference_number: "",
            note: "Opening Balance",
        },
    })

    const watchBalanceType = balanceForm.watch("balance_type")
    const watchAmount = balanceForm.watch("amount")
    const watchCreditLimit = balanceForm.watch("credit_limit")

    const onSupplierSubmit = async (values: z.infer<typeof supplierSchema>) => {
        setLoading(true)
        try {
            const result = await upsertSupplier(values)
            if (result.success) {
                setSupplierId(result.id)
                setSupplierName(values.name)
                setStep(2)
                toast.success("Supplier created successfully")
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create supplier")
        } finally {
            setLoading(false)
        }
    }

    const handleCreateAccount = async () => {
        if (!supplierId) return
        setLoading(true)
        try {
            const result = await createCompanyAccount(supplierId)
            if (result.success) {
                setAccountId(result.id)
                setStep(3)
            }
        } catch (error) {
            toast.error("Failed to create company account")
        } finally {
            setLoading(false)
        }
    }

    const handleBalanceSubmit = async (values: z.infer<typeof balanceSchema>) => {
        if (!accountId) return
        setLoading(true)
        try {
            const isCredit = values.balance_type === "credit"

            if (isCredit) {
                // For credit accounts:
                // 1. Set the credit limit on the account
                // 2. Record a DEBIT transaction (supplier gave us credit = we owe them)
                //    We set the balance to -amount by doing a debit of that amount
                //    But first we need to temporarily override the credit_limit so debit is allowed
                await createCompanyAccount(supplierId!, { credit_limit: values.credit_limit || values.amount })

                await addLedgerTransaction({
                    company_account_id: accountId,
                    transaction_type: 'debit',
                    amount: values.amount,
                    transaction_date: values.transaction_date,
                    reference_number: values.reference_number,
                    note: values.note || `Opening Credit Balance — Supplier extended Rs. ${values.amount.toLocaleString()} credit`,
                    is_opening_balance: true,
                })
                toast.success(`Supplier credit account set up: -Rs. ${values.amount.toLocaleString()} opening balance`)
            } else {
                // Normal positive opening balance
                await addLedgerTransaction({
                    company_account_id: accountId,
                    transaction_type: 'credit',
                    amount: values.amount,
                    transaction_date: values.transaction_date,
                    reference_number: values.reference_number,
                    note: values.note || `Opening Balance`,
                    is_opening_balance: true,
                })
                toast.success(`Opening balance of Rs. ${values.amount.toLocaleString()} added`)
            }
            finish()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to add opening balance")
        } finally {
            setLoading(false)
        }
    }

    const finish = () => {
        onOpenChange(false)
        setStep(1)
        form.reset()
        balanceForm.reset()
        onSuccess()
    }

    return (
        <>
            <Dialog open={open && step === 1} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Add New Supplier</DialogTitle>
                        <DialogDescription>Enter supplier details to get started.</DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSupplierSubmit)} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Company Name</FormLabel>
                                            <FormControl><Input placeholder="e.g. Shell Pakistan" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="contact_person"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Contact Person</FormLabel>
                                            <FormControl><Input placeholder="Name" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="phone"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Phone Number</FormLabel>
                                            <FormControl><Input placeholder="0300-1234567" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Email</FormLabel>
                                            <FormControl><Input placeholder="info@company.com" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <FormField
                                control={form.control}
                                name="address"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Physical Address</FormLabel>
                                        <FormControl><Textarea placeholder="Full address" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="ntn_number"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>NTN Number (Optional)</FormLabel>
                                            <FormControl><Input placeholder="1234567-8" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="product_type"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Product Type</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select type" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="fuel">Fuel</SelectItem>
                                                    <SelectItem value="oil">Oil & Lubricants</SelectItem>
                                                    <SelectItem value="both">Both Fuel & Oil</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                                <Button type="submit" disabled={loading}>{loading ? <BrandLoader size="xs" /> : "Save Supplier"}</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Step 2: Create Account? */}
            <Dialog open={open && step === 2} onOpenChange={(val) => !val && finish()}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Company Account</DialogTitle>
                        <DialogDescription>
                            Do you want to create a Company Account for <strong>{supplierName}</strong>?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 text-sm text-muted-foreground">
                        A company account allows you to track payments, credits, and debits with this supplier in a ledger format.
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={finish}>Skip for Now</Button>
                        <Button onClick={handleCreateAccount} disabled={loading}>
                            {loading ? <BrandLoader size="xs" /> : "Yes, Create Account"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Step 3: Add Balance? */}
            <Dialog open={open && step === 3} onOpenChange={(val) => !val && finish()}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Opening Balance</DialogTitle>
                        <DialogDescription>
                            Do you want to add an opening balance to this Company Account?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 text-sm text-muted-foreground">
                        You can enter an initial amount if there is already an outstanding balance or credit with this supplier.
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={finish}>No, Keep Zero Balance</Button>
                        <Button onClick={() => setStep(4)}>Yes, Add Amount</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Step 4: Amount Entry */}
            <Dialog open={open && step === 4} onOpenChange={(val) => !val && finish()}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Enter Opening Balance</DialogTitle>
                        <DialogDescription>Set the opening balance for this supplier account.</DialogDescription>
                    </DialogHeader>
                    <Form {...balanceForm}>
                        <form onSubmit={balanceForm.handleSubmit(handleBalanceSubmit)} className="space-y-5">

                            {/* Balance Type Toggle */}
                            <FormField
                                control={balanceForm.control}
                                name="balance_type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Balance Type</FormLabel>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => field.onChange("positive")}
                                                className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                                                    field.value === "positive"
                                                        ? "border-green-500 bg-green-50 text-green-800"
                                                        : "border-slate-200 hover:border-slate-300"
                                                }`}
                                            >
                                                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                                                    field.value === "positive" ? "bg-green-100" : "bg-slate-100"
                                                }`}>
                                                    <span className="text-lg font-black">+</span>
                                                </div>
                                                <div>
                                                    <div className="text-xs font-black uppercase tracking-wide">Positive</div>
                                                    <div className="text-[10px] text-muted-foreground">We paid supplier in advance</div>
                                                </div>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => field.onChange("credit")}
                                                className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                                                    field.value === "credit"
                                                        ? "border-red-500 bg-red-50 text-red-800"
                                                        : "border-slate-200 hover:border-slate-300"
                                                }`}
                                            >
                                                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                                                    field.value === "credit" ? "bg-red-100" : "bg-slate-100"
                                                }`}>
                                                    <span className="text-lg font-black">−</span>
                                                </div>
                                                <div>
                                                    <div className="text-xs font-black uppercase tracking-wide">Credit (Negative)</div>
                                                    <div className="text-[10px] text-muted-foreground">Supplier extended us credit</div>
                                                </div>
                                            </button>
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Credit explanation banner */}
                            {watchBalanceType === "credit" && (
                                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <p className="text-xs leading-relaxed">
                                        <strong>Credit Balance:</strong> The balance will be set to <strong className="text-red-600">-Rs. {(watchAmount || 0).toLocaleString()}</strong>.
                                        Orders will deduct from this credit until the limit is reached.
                                    </p>
                                </div>
                            )}

                            {/* Amount */}
                            <FormField
                                control={balanceForm.control}
                                name="amount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Amount (PKR)</FormLabel>
                                        <div className="relative">
                                            <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black ${
                                                watchBalanceType === "credit" ? "text-red-500" : "text-green-600"
                                            }`}>
                                                {watchBalanceType === "credit" ? "−" : "+"} Rs.
                                            </span>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    className="pl-14 font-bold"
                                                    {...field}
                                                />
                                            </FormControl>
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Credit Limit — only shown when balance type is credit */}
                            {watchBalanceType === "credit" && (
                                <FormField
                                    control={balanceForm.control}
                                    name="credit_limit"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                Credit Limit (PKR)
                                                <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                                                    Max amount supplier will allow on credit
                                                </span>
                                            </FormLabel>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-500">Rs.</span>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        step="1"
                                                        min="0"
                                                        className="pl-10 font-bold"
                                                        placeholder={`e.g. ${(watchAmount || 7500000).toLocaleString()}`}
                                                        {...field}
                                                    />
                                                </FormControl>
                                            </div>
                                            {watchCreditLimit && watchCreditLimit > 0 && (
                                                <p className="text-[10px] text-muted-foreground">
                                                    Balance can go down to a maximum of <strong className="text-red-600">-Rs. {Number(watchCreditLimit).toLocaleString()}</strong>.
                                                </p>
                                            )}
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            <FormField
                                control={balanceForm.control}
                                name="transaction_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Transaction Date</FormLabel>
                                        <FormControl><Input type="date" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={balanceForm.control}
                                name="reference_number"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Ref No. / Check No. (Optional)</FormLabel>
                                        <FormControl><Input placeholder="Ref #" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={balanceForm.control}
                                name="note"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Note / Description (Optional)</FormLabel>
                                        <FormControl><Input placeholder="Opening balance setup" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setStep(3)}>Back</Button>
                                <Button type="submit" disabled={loading}>
                                    {loading ? <BrandLoader size="xs" /> : "Save Opening Balance"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </>
    )
}
