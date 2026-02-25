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
import { createPurchaseOrder, getNextPONumber } from "@/app/actions/purchase-orders"
import { AlertCircle, Plus, Trash2, ShoppingCart, RefreshCcw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

const poSchema = z.object({
    po_number: z.string().min(1, "PO Number is required"),
    supplier_id: z.string().min(1, "Supplier is required"),
    order_date: z.string().min(1, "Order date is required"),
    expected_delivery_date: z.string().min(1, "Expected delivery date is required"),
    notes: z.string().optional(),
    products: z.array(z.object({
        product_id: z.string().min(1, "Product is required"),
        product_type: z.enum(["fuel", "oil", "other"]),
        ordered_quantity: z.coerce.number().positive("Quantity must be > 0"),
        unit_type: z.enum(["liter", "unit"]),
        rate_per_liter: z.coerce.number().positive("Rate must be > 0"),
    })).min(1, "At least one product is required")
})

type POFormValues = z.infer<typeof poSchema>

export function CreatePOTab({ onSuccess }: { onSuccess: () => void }) {
    const [isInitialLoading, setIsInitialLoading] = useState(true)
    const [loading, setLoading] = useState(false)
    const [itemToRemoveIndex, setItemToRemoveIndex] = useState<number | null>(null)
    const [suppliers, setSuppliers] = useState<any[]>([])
    const [inventoryProducts, setInventoryProducts] = useState<any[]>([])
    const [selectedSupplier, setSelectedSupplier] = useState<any>(null)

    const form = useForm<POFormValues>({
        resolver: zodResolver(poSchema),
        defaultValues: {
            po_number: "",
            supplier_id: "",
            order_date: new Date().toISOString().split('T')[0],
            expected_delivery_date: new Date().toISOString().split('T')[0],
            notes: "",
            products: [{ product_id: "", product_type: "fuel", unit_type: "liter", ordered_quantity: 0, rate_per_liter: 0 }]
        }
    })

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "products"
    })

    const watchProducts = form.watch("products")
    const totalAmount = watchProducts.reduce((sum, item) => sum + ((Number(item.ordered_quantity) || 0) * (Number(item.rate_per_liter) || 0)), 0)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [supps, prods, nextPoNum] = await Promise.all([getSuppliers(), getProducts(), getNextPONumber()])
                setSuppliers(supps.filter((s: any) => s.status === 'active'))
                setInventoryProducts(prods)
                form.setValue("po_number", nextPoNum)
            } finally {
                setIsInitialLoading(false)
            }
        }
        fetchData()
    }, [form])

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
        if (balanceWarning) {
            toast.error("Supplier's available balance is too low to process this purchase.")
            return
        }

        setLoading(true)
        try {
            await createPurchaseOrder(values)
            toast.success("Purchase Order created successfully!")

            // Re-fetch next PO number for subsequent creations
            const nextPoNum = await getNextPONumber()
            form.reset({
                ...form.getValues(),
                po_number: nextPoNum,
                products: [{ product_id: "", product_type: "fuel", unit_type: "liter", ordered_quantity: 0, rate_per_liter: 0 }]
            })
            onSuccess()
        } catch (error: any) {
            toast.error(error.message || "Failed to create PO")
        } finally {
            setLoading(false)
        }
    }

    // Find active account balance safely (handling both array and object returns from Supabase)
    const accounts = Array.isArray(selectedSupplier?.company_accounts)
        ? selectedSupplier.company_accounts
        : selectedSupplier?.company_accounts ? [selectedSupplier.company_accounts] : []

    const activeAccount = accounts.find((acc: any) => acc.status === 'active') || accounts[0]
    const supplierBalance = activeAccount?.current_balance || 0
    const balanceWarning = totalAmount > supplierBalance

    return (
        <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
                <Card className="border-0 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                        <ShoppingCart size={120} />
                    </div>
                    <CardHeader className="bg-slate-50 border-b pb-6">
                        <CardTitle className="flex items-center gap-2 text-2xl font-black uppercase tracking-tight">
                            Create Purchase Order
                        </CardTitle>
                        <CardDescription className="text-sm font-medium">
                            Generate a procurement request. You can add multiple products to a single order.
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
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="absolute right-1 top-1.5 h-9 w-9 text-slate-400 hover:text-primary"
                                                                onClick={async () => {
                                                                    const num = await getNextPONumber();
                                                                    form.setValue("po_number", num);
                                                                    toast.success("Regenerated next PO number")
                                                                }}
                                                                title="Regenerate PO Number"
                                                            >
                                                                <RefreshCcw className="h-4 w-4" />
                                                            </Button>
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
                                                    <FormLabel className="font-bold">Supplier</FormLabel>
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
                                                    <FormLabel className="font-bold">Expected Delivery Date</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" className="h-12" {...field} min={new Date().toISOString().split('T')[0]} />
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
                                                </div>
                                            </div>
                                        ))}
                                        {form.formState.errors.products && (
                                            <p className="text-sm font-medium text-destructive">{form.formState.errors.products.message}</p>
                                        )}
                                    </div>

                                    <FormField
                                        control={form.control}
                                        name="notes"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="font-bold">Remarks / Notes</FormLabel>
                                                <FormControl>
                                                    <Textarea placeholder="Any specific instructions..." className="resize-none" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <Button type="submit" className="w-full h-14 text-lg font-black uppercase tracking-wider shadow-lg" disabled={loading}>
                                        {loading ? <BrandLoader size="sm" /> : "Confirm & Generate PO"}
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
                    <CardHeader>
                        <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Estimated Total</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black">Rs. {totalAmount.toLocaleString()}</div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold mt-2">Combined value of all items</p>
                    </CardContent>
                </Card>

                {balanceWarning && selectedSupplier && (
                    <Alert variant="destructive" className="bg-red-50 text-red-800 border-red-200">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle className="font-bold text-xs uppercase tracking-wider">Low Account Balance</AlertTitle>
                        <AlertDescription className="text-xs mt-1">
                            Supplier account balance is Rs. {supplierBalance.toLocaleString()}.
                            This order requires Rs. {totalAmount.toLocaleString()}.
                            <strong> Orders cannot be placed if the order total exceeds the account balance.</strong> Please recharge the supplier's account.
                        </AlertDescription>
                    </Alert>
                )}

                {selectedSupplier && (
                    <Card className="bg-slate-50 border-slate-200">
                        <CardHeader className="pb-3 border-b border-slate-200">
                            <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-500">Supplier Info</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground mr-4">Name:</span>
                                <span className="font-bold text-right">{selectedSupplier.name}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Type:</span>
                                <span className="font-bold uppercase text-[10px] bg-slate-200 px-1.5 py-0.5 rounded">{selectedSupplier.product_type}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Contact:</span>
                                <span className="font-medium text-right">{selectedSupplier.phone || "-"}</span>
                            </div>
                            {accounts.length > 0 && (
                                <div className="flex justify-between items-center text-sm border-t border-slate-200 pt-3">
                                    <span className="text-muted-foreground">Linked Wallet:</span>
                                    <span className="font-black text-blue-600">Active</span>
                                </div>
                            )}
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
                description="Are you sure you want to remove this product from the current purchase order?"
            />
        </div>
    )
}
