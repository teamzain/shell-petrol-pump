"use client"

import { useState, useEffect } from "react"
import { useForm, useFieldArray } from "react-hook-form"
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
import { Badge } from "@/components/ui/badge"
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { BrandLoader } from "@/components/ui/brand-loader"
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog"
import { getSuppliers } from "@/app/actions/suppliers"
import { getProducts } from "@/app/actions/products"
import { createLocalPurchaseOrder } from "@/app/actions/local-purchases"
import { getNextPONumber } from "@/app/actions/purchase-orders"
import { getSystemActiveDate, getCashAndBankBalances } from "@/app/actions/balance"
import { AlertCircle, Plus, Trash2, ShoppingCart, RefreshCcw, Wallet, CreditCard, Clock, Truck } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { getTodayPKT } from "@/lib/utils"

const poSchema = z.object({
    po_number: z.string().min(1, "PO Number is required"),
    supplier_id: z.string().min(1, "Supplier is required"),
    order_date: z.string().min(1, "Order date is required"),
    expected_delivery_date: z.string().min(1, "Expected delivery date is required"),
    notes: z.string().optional(),
    payment_method: z.enum(["prepaid", "deferred"]),
    paid_amount: z.coerce.number().min(0, "Paid amount cannot be negative"),
    payment_source: z.enum(["cash", "bank"]).optional(),
    bank_account_id: z.string().optional(),
    products: z.array(z.object({
        product_id: z.string().min(1, "Product is required"),
        product_type: z.enum(["fuel", "oil", "other"]),
        ordered_quantity: z.coerce.number().positive("Quantity must be > 0"),
        unit_type: z.enum(["liter", "unit"]),
        rate_per_liter: z.coerce.number().positive("Rate must be > 0"),
    })).min(1, "At least one product is required")
})

type POFormValues = z.infer<typeof poSchema>

export function LocalCreatePOTab({ onSuccess }: { onSuccess: () => void }) {
    const [isInitialLoading, setIsInitialLoading] = useState(true)
    const [loading, setLoading] = useState(false)
    const [itemToRemoveIndex, setItemToRemoveIndex] = useState<number | null>(null)
    const [suppliers, setSuppliers] = useState<any[]>([])
    const [inventoryProducts, setInventoryProducts] = useState<any[]>([])
    const [selectedSupplier, setSelectedSupplier] = useState<any>(null)
    const [systemActiveDate, setSystemActiveDateState] = useState(getTodayPKT())
    const [bankAccounts, setBankAccounts] = useState<any[]>([])
    const [cashBalance, setCashBalance] = useState(0)

    const form = useForm<POFormValues>({
        resolver: zodResolver(poSchema),
        defaultValues: {
            po_number: "",
            supplier_id: "",
            order_date: getTodayPKT(),
            expected_delivery_date: "",
            notes: "",
            payment_method: "prepaid",
            paid_amount: 0,
            payment_source: "cash",
            bank_account_id: "",
            products: [{ product_id: "", product_type: "fuel", unit_type: "liter", ordered_quantity: 0, rate_per_liter: 0 }]
        }
    })

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "products"
    })

    const watchProducts = form.watch("products")
    const totalAmount = watchProducts.reduce((acc: number, p: any) => acc + (Number(p.ordered_quantity || 0) * Number(p.rate_per_liter || 0)), 0)
    
    const watchPaidAmount = form.watch("paid_amount")
    const watchPaymentMethod = form.watch("payment_method")
    const watchPaymentSource = form.watch("payment_source")
    const watchBankId = form.watch("bank_account_id")
    
    const dueAmount = totalAmount - watchPaidAmount

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [supps, prods, nextPoNum, activeDate, balances] = await Promise.all([
                    getSuppliers(),
                    getProducts(),
                    getNextPONumber(),
                    getSystemActiveDate(),
                    getCashAndBankBalances()
                ])
                setSuppliers(supps.filter((s: any) => s.status === 'active' && s.supplier_type === 'local'))
                setInventoryProducts(prods)
                setSystemActiveDateState(activeDate)
                setBankAccounts(balances.bankAccounts || [])
                setCashBalance(balances.cashBalance || 0)
                
                form.setValue("po_number", "L" + nextPoNum)
                form.setValue("order_date", activeDate)
                form.setValue("expected_delivery_date", activeDate)
                form.setValue("paid_amount", totalAmount) // Default for prepaid
            } finally {
                setIsInitialLoading(false)
            }
        }
        fetchData()
    }, [form])

    // Update paid_amount when strategy changes
    useEffect(() => {
        if (watchPaymentMethod === 'prepaid') {
            form.setValue("paid_amount", totalAmount)
        } else {
            form.setValue("paid_amount", 0)
        }
    }, [watchPaymentMethod, totalAmount, form])

    const onSupplierChange = (id: string) => {
        const supplier = suppliers.find(s => s.id === id)
        setSelectedSupplier(supplier)
    }

    const onProductChange = (index: number, productId: string) => {
        const product = inventoryProducts.find(p => p.id === productId)
        if (product) {
            form.setValue(`products.${index}.product_type`, product.type)
            form.setValue(`products.${index}.rate_per_liter`, product.purchase_price)
            form.setValue(`products.${index}.unit_type`, product.unit === 'Liters' ? 'liter' : 'unit')
        }
    }

    async function onSubmit(values: POFormValues) {
        if (!hasAccount) {
            toast.error("Supplier has no active company account. Please create one first.")
            return
        }

        if (values.paid_amount > 0 && values.payment_source === 'bank' && !values.bank_account_id) {
            toast.error("Please select a bank account")
            return
        }

        setLoading(true)
        try {
            const result = await createLocalPurchaseOrder(values)
            
            if (result?.error) {
                toast.error(result.error)
                return
            }

            toast.success("Local Purchase Order created successfully!")

            // Re-fetch next PO number for subsequent creations
            const nextPoNum = await getNextPONumber()
            form.reset({
                ...form.getValues(),
                po_number: "L" + nextPoNum,
                products: [{ product_id: "", product_type: "fuel", unit_type: "liter", ordered_quantity: 0, rate_per_liter: 0 }],
                paid_amount: 0
            })
            onSuccess()
        } catch (error: any) {
            toast.error(error.message || "Failed to create PO")
        } finally {
            setLoading(false)
        }
    }

    const accounts = Array.isArray(selectedSupplier?.company_accounts)
        ? selectedSupplier.company_accounts
        : selectedSupplier?.company_accounts ? [selectedSupplier.company_accounts] : []

    const activeAccount = accounts.find((acc: any) => acc.status === 'active') || accounts[0]
    const supplierBalance = Number(activeAccount?.current_balance || 0)
    const hasAccount = accounts.length > 0 && !!activeAccount
    
    // Get currently selected source balance
    const currentSourceBalance = watchPaymentSource === 'bank' 
        ? (bankAccounts.find(a => a.id === watchBankId)?.current_balance || 0)
        : cashBalance

    return (
        <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
                <Card className="border-0 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                        <ShoppingCart size={120} />
                    </div>
                    <CardHeader className="bg-slate-50 border-b pb-6">
                        <CardTitle className="flex items-center gap-2 text-2xl font-black uppercase tracking-tight">
                            Create Local Purchase Order
                        </CardTitle>
                        <CardDescription className="text-sm font-medium">
                            Generate a procurement request for a local supplier.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        {isInitialLoading ? (
                            <div className="flex justify-center items-center h-48">
                                <BrandLoader size="lg" />
                            </div>
                        ) : (
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="po_number"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="font-bold">PO Number</FormLabel>
                                                    <FormControl>
                                                        <div className="relative">
                                                            <Input className="h-12 font-mono font-bold pl-3 pr-10" {...field} />
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="absolute right-1 top-1.5 h-9 w-9 text-slate-400 hover:text-primary"
                                                                            onClick={async () => {
                                                                                const num = await getNextPONumber();
                                                                                form.setValue("po_number", "L" + num);
                                                                                toast.success("Regenerated next PO number")
                                                                            }}
                                                                        >
                                                                            <RefreshCcw className="h-4 w-4" />
                                                                        </Button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="top">
                                                                        <p className="font-bold">Regenerate Next PO#</p>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                        </div>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="supplier_id"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="font-bold">Local Supplier</FormLabel>
                                                    <Select
                                                        onValueChange={(val) => {
                                                            field.onChange(val)
                                                            onSupplierChange(val)
                                                        }}
                                                        value={field.value || ""}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger className="h-12">
                                                                <SelectValue placeholder="Select a supplier" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {suppliers.map(s => (
                                                                <SelectItem key={s.id} value={s.id}>
                                                                    <span className="font-bold">{s.name}</span>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="expected_delivery_date"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="font-bold">Expected Delivery</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" className="h-12" {...field} min={systemActiveDate} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="order_date"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="font-bold">Order Date</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" className="h-12 bg-slate-50 font-medium" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">Order Items</h3>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="font-bold"
                                                onClick={() => append({ product_id: "", product_type: "fuel", unit_type: "liter", ordered_quantity: 0, rate_per_liter: 0 })}
                                            >
                                                <Plus className="h-4 w-4 mr-1" /> Add Product
                                            </Button>
                                        </div>

                                        {fields.map((field, index) => (
                                            <div key={field.id} className="grid grid-cols-12 gap-4 items-start p-4 bg-slate-50 border rounded-lg relative group">
                                                <div className="col-span-12 md:col-span-4">
                                                    <FormField
                                                        control={form.control}
                                                        name={`products.${index}.product_id`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-xs">Product</FormLabel>
                                                                <Select
                                                                    onValueChange={(val) => {
                                                                        field.onChange(val)
                                                                        onProductChange(index, val)
                                                                    }}
                                                                    value={field.value || ""}
                                                                >
                                                                    <FormControl>
                                                                        <SelectTrigger>
                                                                            <SelectValue placeholder="Select product" />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        {inventoryProducts.map(p => (
                                                                            <SelectItem key={p.id} value={p.id}>
                                                                                {p.name} <span className="text-muted-foreground ml-1">({p.unit})</span>
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                                <div className="col-span-12 md:col-span-3">
                                                    <FormField
                                                        control={form.control}
                                                        name={`products.${index}.ordered_quantity`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-xs">Quantity</FormLabel>
                                                                <FormControl>
                                                                    <div className="flex gap-2">
                                                                        <Input type="number" step="0.01" placeholder="0.00" {...field} />
                                                                        <FormField
                                                                            control={form.control}
                                                                            name={`products.${index}.unit_type`}
                                                                            render={({ field: unitField }) => (
                                                                                <Select onValueChange={unitField.onChange} value={unitField.value}>
                                                                                    <SelectTrigger className="w-[80px]">
                                                                                        <SelectValue />
                                                                                    </SelectTrigger>
                                                                                    <SelectContent>
                                                                                        <SelectItem value="liter">L</SelectItem>
                                                                                        <SelectItem value="unit">U</SelectItem>
                                                                                    </SelectContent>
                                                                                </Select>
                                                                            )}
                                                                        />
                                                                    </div>
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                                <div className="col-span-11 md:col-span-4">
                                                    <FormField
                                                        control={form.control}
                                                        name={`products.${index}.rate_per_liter`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-xs">Rate (Rs.)</FormLabel>
                                                                <FormControl>
                                                                    <Input type="number" step="0.0001" placeholder="0.00" {...field} />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                                <div className="col-span-1 md:col-span-1 flex justify-end pt-8">
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                                    onClick={() => setItemToRemoveIndex(index)}
                                                                    disabled={fields.length === 1}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top">
                                                                <p className="font-bold text-red-500">Remove Product</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="bg-amber-50 p-6 rounded-xl border-2 border-dashed border-amber-200 space-y-6">
                                        <FormField
                                            control={form.control}
                                            name="payment_method"
                                            render={({ field }) => (
                                                <FormItem className="space-y-3">
                                                    <FormLabel className="text-sm font-black uppercase tracking-widest text-amber-700">Payment Strategy</FormLabel>
                                                    <FormControl>
                                                        <RadioGroup
                                                            onValueChange={field.onChange}
                                                            defaultValue={field.value}
                                                            className="flex flex-col md:flex-row gap-4"
                                                        >
                                                            <FormItem className="flex items-center space-x-3 space-y-0 bg-white p-4 rounded-lg border shadow-sm cursor-pointer hover:border-amber-400 transition-colors">
                                                                <FormControl>
                                                                    <RadioGroupItem value="prepaid" />
                                                                </FormControl>
                                                                <FormLabel className="font-bold flex items-center gap-2 cursor-pointer">
                                                                    <CreditCard className="h-4 w-4 text-amber-600" /> Pay Immediately
                                                                </FormLabel>
                                                            </FormItem>
                                                            <FormItem className="flex items-center space-x-3 space-y-0 bg-white p-4 rounded-lg border shadow-sm cursor-pointer hover:border-amber-400 transition-colors">
                                                                <FormControl>
                                                                    <RadioGroupItem value="deferred" />
                                                                </FormControl>
                                                                <FormLabel className="font-bold flex items-center gap-2 cursor-pointer">
                                                                    <Clock className="h-4 w-4 text-amber-600" /> Pay Later (Record as Debt)
                                                                </FormLabel>
                                                            </FormItem>
                                                        </RadioGroup>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <FormField
                                                control={form.control}
                                                name="paid_amount"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="font-black text-xs uppercase tracking-widest text-slate-500">Paid Amount (Rs.)</FormLabel>
                                                        <FormControl>
                                                            <Input type="number" step="0.01" className="h-12 text-lg font-black text-green-700" {...field} />
                                                        </FormControl>
                                                        <FormDescription className="text-[10px] font-bold text-slate-400 uppercase">
                                                            Due Amount: Rs. {dueAmount.toLocaleString()}
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            {watchPaidAmount > 0 && (
                                                <FormField
                                                    control={form.control}
                                                    name="payment_source"
                                                    render={({ field }) => (
                                                        <FormItem className="space-y-3">
                                                            <FormLabel className="font-black text-xs uppercase tracking-widest text-slate-500">Payment Source</FormLabel>
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
                                                                        <FormLabel className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all cursor-pointer ${field.value === 'cash' ? 'border-amber-500 bg-white' : 'border-slate-100 bg-white'}`}>
                                                                            <Wallet className={`h-4 w-4 ${field.value === 'cash' ? 'text-amber-500' : 'text-slate-300'}`} />
                                                                            <span className="text-[10px] font-black uppercase">Cash</span>
                                                                            <span className="text-[8px] font-bold text-slate-400">Bal: {cashBalance.toLocaleString()}</span>
                                                                        </FormLabel>
                                                                    </FormItem>
                                                                    <FormItem className="flex-1">
                                                                        <FormControl className="sr-only">
                                                                            <RadioGroupItem value="bank" />
                                                                        </FormControl>
                                                                        <FormLabel className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all cursor-pointer ${field.value === 'bank' ? 'border-amber-500 bg-white' : 'border-slate-100 bg-white'}`}>
                                                                            <CreditCard className={`h-4 w-4 ${field.value === 'bank' ? 'text-amber-500' : 'text-slate-300'}`} />
                                                                            <span className="text-[10px] font-black uppercase">Bank</span>
                                                                            <span className="text-[8px] font-bold text-slate-400">{bankAccounts.length} Connected</span>
                                                                        </FormLabel>
                                                                    </FormItem>
                                                                </RadioGroup>
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            )}
                                        </div>

                                        {watchPaidAmount > 0 && watchPaymentSource === 'bank' && (
                                            <FormField
                                                control={form.control}
                                                name="bank_account_id"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="font-black text-xs uppercase tracking-widest text-slate-500">Select Bank Account</FormLabel>
                                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger className="h-11 bg-white">
                                                                    <SelectValue placeholder="Choose account..." />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {bankAccounts.map(acc => (
                                                                    <SelectItem key={acc.id} value={acc.id}>
                                                                        {acc.account_name} <span className="text-slate-400 text-[10px] ml-2">(Rs. {Number(acc.current_balance).toLocaleString()})</span>
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                    </div>

                                    <FormField
                                        control={form.control}
                                        name="notes"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="font-bold text-slate-700">Remarks / Notes</FormLabel>
                                                <FormControl>
                                                    <Textarea placeholder="Any specific instructions..." className="h-24 resize-none" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <Button type="submit" className="w-full h-14 text-lg font-black uppercase tracking-wider shadow-lg bg-slate-900 border-0" disabled={loading}>
                                        {loading ? <BrandLoader size="sm" /> : "Confirm Local PO"}
                                    </Button>
                                </form>
                            </Form>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-4">
                <Card className="bg-slate-900 text-white border-0 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                        <ShoppingCart size={80} />
                    </div>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Order Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1">
                            <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Total Amount</div>
                            <div className="text-2xl font-black">Rs. {totalAmount.toLocaleString()}</div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                            <div className="space-y-1">
                                <div className="text-[8px] font-black uppercase text-green-500 tracking-wider">Paid</div>
                                <div className="text-lg font-black text-green-400">Rs. {watchPaidAmount.toLocaleString()}</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[8px] font-black uppercase text-red-500 tracking-wider">Due</div>
                                <div className="text-lg font-black text-red-400">Rs. {dueAmount.toLocaleString()}</div>
                            </div>
                        </div>
                        
                        {watchPaidAmount > 0 && (
                            <div className="pt-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {watchPaymentSource === 'cash' ? <Wallet className="h-3 w-3 text-amber-500" /> : <CreditCard className="h-3 w-3 text-amber-500" />}
                                    <span className="text-[10px] font-black uppercase text-slate-300">Deducting from {watchPaymentSource}</span>
                                </div>
                                <div className="text-[10px] font-black text-amber-400">Avl: Rs. {currentSourceBalance.toLocaleString()}</div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {selectedSupplier && (
                    <Card className="bg-slate-50 border-slate-200 overflow-hidden">
                        <CardHeader className="pb-3 border-b border-slate-200">
                            <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-500">Local Supplier Info</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground mr-4">Name:</span>
                                <span className="font-bold text-right">{selectedSupplier.name}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground mr-4">Current Due:</span>
                                <span className={`font-black ${supplierBalance < 0 ? "text-red-600" : "text-green-600"}`}>
                                    Rs. {Math.abs(supplierBalance).toLocaleString()}
                                    {supplierBalance < 0 ? " (DR)" : " (CR)"}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            <DeleteConfirmDialog
                open={itemToRemoveIndex !== null}
                onOpenChange={(open) => !open && setItemToRemoveIndex(null)}
                onConfirm={() => {
                    if (itemToRemoveIndex !== null) {
                        remove(itemToRemoveIndex);
                        setItemToRemoveIndex(null);
                    }
                }}
                title="Remove Product"
                description="Are you sure you want to remove this product?"
            />
        </div>
    )
}
