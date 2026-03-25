"use client"

import { useState, useEffect } from "react"
import {
    Package,
    ShoppingCart,
    Wallet,
    Plus,
    Loader2,
    Search,
    X,
    CheckCircle2,
    Receipt,
    CreditCard
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CardFooter
} from "@/components/ui/card"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { toast } from "sonner"
import { recordManualSale } from "@/app/actions/manual-sales-actions"

export default function ManualSalesPage() {
    const [products, setProducts] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    const [formData, setFormData] = useState({
        product_id: "",
        quantity: "",
        unit_price: "",
        payment_method: "cash",
        customer_name: "",
        notes: "",
        paid_amount: ""
    })

    const supabase = createClient()

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        setIsLoading(true)
        try {
            const { data: pData } = await supabase
                .from("products")
                .select("id, name, selling_price, current_stock")
                .neq("type", "fuel")
                .eq("status", "active")
                .order("name")

            setProducts(pData || [])
        } catch (error) {
            toast.error("Failed to load products")
        } finally {
            setIsLoading(false)
        }
    }

    const handleProductChange = (val: string) => {
        const p = products.find(x => x.id === val)
        setFormData({
            ...formData,
            product_id: val,
            unit_price: p?.selling_price.toString() || ""
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSaving(true)

        try {
            await recordManualSale({
                product_id: formData.product_id,
                quantity: parseFloat(formData.quantity),
                unit_price: parseFloat(formData.unit_price),
                payment_method: "cash",
                customer_name: formData.customer_name || "Walk-in",
                notes: formData.notes,
                paid_amount: parseFloat(formData.paid_amount || total.toString())
            })

            toast.success("Manual sale recorded successfully!")
            setFormData({
                product_id: "",
                quantity: "",
                unit_price: "",
                payment_method: "cash",
                customer_name: "",
                notes: "",
                paid_amount: ""
            })
            fetchData()
        } catch (error: any) {
            toast.error(error.message || "Failed to record sale")
        } finally {
            setIsSaving(false)
        }
    }

    const selectedProduct = products.find(p => p.id === formData.product_id)
    const total = parseFloat(formData.quantity || "0") * parseFloat(formData.unit_price || "0")

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Manual Sales Entry</h1>
                <p className="text-muted-foreground">Record sales for lubricants, oils, and other non-metered products.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                    <Card>
                        <form onSubmit={handleSubmit}>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <ShoppingCart className="w-5 h-5 text-primary" />
                                    Sale Details
                                </CardTitle>
                                <CardDescription>Enter product and quantity to deduct from stock.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="product">Product</Label>
                                        <Select value={formData.product_id} onValueChange={handleProductChange} required>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select product" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {products.map(p => (
                                                    <SelectItem key={p.id} value={p.id}>
                                                        {p.name} ({(p.current_stock || 0).toLocaleString()} units)
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="method">Payment Method</Label>
                                        <div className="h-10 px-3 py-2 border rounded-md bg-muted text-sm flex items-center gap-2">
                                            <Wallet className="w-4 h-4 text-emerald-600" />
                                            Cash In Hand
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="quantity">Quantity</Label>
                                        <Input
                                            id="quantity"
                                            type="number"
                                            step="0.01"
                                            placeholder="0"
                                            required
                                            value={formData.quantity}
                                            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="price">Unit Price (Rs.)</Label>
                                        <Input
                                            id="price"
                                            type="number"
                                            step="0.01"
                                            placeholder="0.00"
                                            required
                                            value={formData.unit_price}
                                            onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="paid_amount">Paid Amount (Rs.)</Label>
                                        <Input
                                            id="paid_amount"
                                            type="number"
                                            step="0.01"
                                            placeholder={total.toString()}
                                            value={formData.paid_amount}
                                            onChange={(e) => setFormData({ ...formData, paid_amount: e.target.value })}
                                        />
                                        <p className="text-[10px] text-muted-foreground">Leave empty if full amount is paid.</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="customer">Customer Name (Optional)</Label>
                                        <Input
                                            id="customer"
                                            placeholder="e.g. Walk-in or Company Name"
                                            value={formData.customer_name}
                                            onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="notes">Notes</Label>
                                    <Input
                                        id="notes"
                                        placeholder="Internal remarks..."
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    />
                                </div>
                            </CardContent>
                            <CardFooter className="justify-between border-t p-6">
                                <div className="text-lg font-bold text-primary">
                                    Total: Rs. {(total || 0).toLocaleString()}
                                </div>
                                <Button type="submit" disabled={isSaving || isLoading}>
                                    {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Record Sale
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Quick Stats</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <Package className="w-4 h-4" /> Stock
                                </span>
                                <span className={selectedProduct && selectedProduct.current_stock < 5 ? "text-red-500 font-bold" : "font-medium"}>
                                    {selectedProduct ? `${(selectedProduct.current_stock || 0).toLocaleString()} units` : "-"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <Receipt className="w-4 h-4" /> Price
                                </span>
                                <span className="font-medium">
                                    {selectedProduct ? `Rs. ${(selectedProduct.selling_price || 0).toLocaleString()}` : "-"}
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    <Alert className="bg-primary/5 border-primary/20">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <AlertTitle className="text-primary">Stock Alert</AlertTitle>
                        <AlertDescription className="text-xs text-primary/80">
                            Manual sales instantly deduct from inventory and update financial summaries.
                        </AlertDescription>
                    </Alert>
                </div>
            </div>
        </div>
    )
}
