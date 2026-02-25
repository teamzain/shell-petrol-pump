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
    amount: z.coerce.number().positive("Amount must be greater than 0"),
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
            transaction_date: new Date().toISOString().split("T")[0],
            reference_number: "",
            note: "Opening Balance",
        },
    })

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
            await addLedgerTransaction({
                company_account_id: accountId,
                transaction_type: "credit",
                amount: values.amount,
                transaction_date: values.transaction_date,
                reference_number: values.reference_number,
                note: values.note,
            })
            toast.success(`Company Account created with opening balance of Rs. ${values.amount}`)
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
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Enter Opening Balance</DialogTitle>
                        <DialogDescription>Provide transaction details for the opening balance.</DialogDescription>
                    </DialogHeader>
                    <Form {...balanceForm}>
                        <form onSubmit={balanceForm.handleSubmit(handleBalanceSubmit)} className="space-y-4">
                            <FormField
                                control={balanceForm.control}
                                name="amount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Amount (PKR)</FormLabel>
                                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
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
