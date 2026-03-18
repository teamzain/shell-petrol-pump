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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { BrandLoader } from "@/components/ui/brand-loader"
import { getPurchaseOrders } from "@/app/actions/purchase-orders"
import { getTanks } from "@/app/actions/tanks"
import { recordDelivery } from "@/app/actions/deliveries"
import { getSystemActiveDate } from "@/app/actions/balance"
import { Truck, Info, AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { HoldAmountPopup } from "./hold-amount-popup"
import { getTodayPKT } from "@/lib/utils"

const deliverySchema = z.object({
    purchase_order_id: z.string().min(1, "Purchase Order is required"),
    item_index: z.coerce.number().min(0, "Item selection is required"),
    delivered_quantity: z.coerce.number().min(0.01, "Quantity must be greater than 0"),
    rate_per_liter: z.coerce.number().min(0, "Price cannot be negative"),
    delivery_date: z.string().min(1, "Delivery date is required"),
    company_invoice_number: z.string().optional(),
    vehicle_number: z.string().optional(),
    driver_name: z.string().optional(),
    notes: z.string().optional(),
    tank_distribution: z.array(z.object({
        tank_id: z.string(),
        tank_name: z.string().optional(),
        quantity: z.number().min(0)
    })).optional()
})

interface RecordDeliveryTabProps {
    initialPO?: any
    onSuccess: () => void
}

export function RecordDeliveryTab({ initialPO, onSuccess }: RecordDeliveryTabProps) {
    const [loading, setLoading] = useState(false)
    const [pos, setPOs] = useState<any[]>([])
    const [tanks, setTanks] = useState<any[]>([])
    const [selectedPO, setSelectedPO] = useState<any>(initialPO || null)
    const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null)
    const [showWarning, setShowWarning] = useState(false)
    const [pendingSubmitValues, setPendingSubmitValues] = useState<z.infer<typeof deliverySchema> | null>(null)
    const [holdData, setHoldData] = useState<{ holdRecordId: string; poId: string; holdAmount: number; holdQuantity: number; productName: string } | null>(null)
    const [systemActiveDate, setSystemActiveDate] = useState("")

    const form = useForm<z.infer<typeof deliverySchema>>({
        resolver: zodResolver(deliverySchema),
        defaultValues: {
            purchase_order_id: initialPO?.id || "",
            item_index: 0,
            delivered_quantity: 0,
            rate_per_liter: 0,
            delivery_date: getTodayPKT(),
            company_invoice_number: "",
            vehicle_number: "",
            driver_name: "",
            notes: "",
        }
    })

    useEffect(() => {
        const fetchData = async () => {
            const [poData, tankData, activeDate] = await Promise.all([
                getPurchaseOrders({ status: 'all' }),
                getTanks(),
                getSystemActiveDate()
            ])
            
            const availablePOs = poData.filter((po: any) => po.status === 'pending' || po.status === 'partially_delivered')
            setPOs(availablePOs)
            setTanks(tankData || [])
            setSystemActiveDate(activeDate)
            form.setValue("delivery_date", activeDate)
        }
        fetchData()
    }, [])

    useEffect(() => {
        if (initialPO) {
            setSelectedPO(initialPO)
            form.setValue("purchase_order_id", initialPO.id)
            if (initialPO.items && initialPO.items.length > 0) {
                // Auto-select first pending item
                const pendingIdx = initialPO.items.findIndex((i: any) => i.status !== 'delivered' && i.status !== 'received');
                if (pendingIdx >= 0) {
                    setSelectedItemIndex(pendingIdx)
                    form.setValue("item_index", pendingIdx)
                    form.setValue("rate_per_liter", initialPO.items[pendingIdx].rate_per_liter)
                }
            } else {
                form.setValue("rate_per_liter", initialPO.rate_per_liter)
            }
        }
    }, [initialPO])

    const onPOChange = (id: string) => {
        const po = pos.find(p => p.id === id)
        setSelectedPO(po)
        setSelectedItemIndex(null) // Reset item selection when PO changes
        if (po && po.items && po.items.length > 0) {
            const pendingIdx = po.items.findIndex((i: any) => i.status !== 'delivered' && i.status !== 'received');
            if (pendingIdx >= 0) {
                form.setValue("item_index", pendingIdx)
                setSelectedItemIndex(pendingIdx)
                form.setValue("rate_per_liter", po.items[pendingIdx].rate_per_liter)
            }
        } else if (po) {
            form.setValue("rate_per_liter", po.rate_per_liter)
        }
    }

    const onItemChange = (idxStr: string) => {
        const idx = parseInt(idxStr)
        setSelectedItemIndex(idx)
        form.setValue("item_index", idx)
        if (selectedPO?.items && selectedPO.items[idx]) {
            form.setValue("rate_per_liter", selectedPO.items[idx].rate_per_liter)
        }
    }

    const currentItem = selectedPO?.items && selectedItemIndex !== null ? selectedPO.items[selectedItemIndex] : null

    // Parameters calculated dynamically
    const remainingQty = currentItem ? (Number(currentItem.ordered_quantity || 0) - Number(currentItem.delivered_quantity || 0)) : (selectedPO ? Number(selectedPO.quantity_remaining) : 0)
    const productLabel = currentItem ? currentItem.product_name : (selectedPO?.products?.name || "Product")
    const categoryLabel = currentItem ? (currentItem.product_category || 'other') : (selectedPO?.products?.category || selectedPO?.product_type || "-")
    const productId = currentItem ? currentItem.product_id : selectedPO?.product_id
    const isFuel = categoryLabel.toLowerCase() === 'fuel' || selectedPO?.product_type === 'fuel'
    const shortUnitLabel = currentItem ? (currentItem.unit_type === 'unit' ? 'U' : 'L') : (selectedPO?.unit_type === 'unit' ? 'U' : 'L')
    const unitLabel = currentItem ? (currentItem.unit_type === 'unit' ? 'Units' : 'Liters') : (selectedPO?.unit_type === 'unit' ? 'Units' : 'Liters')

    const orderedQty = currentItem ? Number(currentItem.ordered_quantity || 0) : Number(selectedPO?.ordered_quantity || 0)
    const alreadyDelivered = currentItem ? Number(currentItem.delivered_quantity || 0) : Number(selectedPO?.delivered_quantity || 0)

    const watchPrice = form.watch("rate_per_liter")
    const watchTankDistribution = form.watch("tank_distribution") || []

    // Calculate total qty from tanks if applicable
    const isUsingTanks = isFuel && tanks.filter(t => t.product_id === productId).length > 0;
    const computedTankQty = isUsingTanks ? watchTankDistribution.reduce((sum, t) => sum + (Number(t.quantity) || 0), 0) : 0;

    // Update delivered_quantity dynamically if using tanks
    useEffect(() => {
        if (isUsingTanks) {
            form.setValue("delivered_quantity", computedTankQty, { shouldValidate: true })
        }
    }, [computedTankQty, isUsingTanks, form])

    const watchQty = isUsingTanks ? computedTankQty : form.watch("delivered_quantity")

    // Cap total amount at remaining quantity value for over-delivery scenarios
    const totalAmount = (Math.min(Number(watchQty) || 0, remainingQty)) * (Number(watchPrice) || 0)

    // Calculate holds
    const isPartial = selectedPO && Number(watchQty) > 0 && Number(watchQty) < remainingQty;
    const holdQuantity = isPartial ? remainingQty - Number(watchQty) : 0;
    const holdAmount = holdQuantity * (Number(watchPrice) || 0);

    const availableItems = selectedPO && Array.isArray(selectedPO.items) ? selectedPO.items : []

    async function onSubmit(values: z.infer<typeof deliverySchema>) {
        if (isPartial) {
            setPendingSubmitValues(values)
            setShowWarning(true)
            return
        }

        await processDelivery(values)
    }

    async function processDelivery(values: z.infer<typeof deliverySchema>) {
        setLoading(true)
        setShowWarning(false)
        try {
            const result = await recordDelivery(values)
            toast.success("Delivery recorded and inventory updated!")

            if (result.holdRecord) {
                setHoldData({
                    holdRecordId: result.holdRecord.id,
                    poId: selectedPO?.id,
                    holdAmount: result.holdRecord.hold_amount,
                    holdQuantity: result.holdRecord.hold_quantity,
                    productName: productLabel
                })
            } else {
                onSuccess()
            }

            form.reset()
            setSelectedPO(null)
            setSelectedItemIndex(null)
            setPendingSubmitValues(null)

            // Re-fetch POs to update list
            const data = await getPurchaseOrders({ status: 'all' })
            const availablePOs = data.filter((po: any) => po.status === 'pending' || po.status === 'partially_delivered')
            setPOs(availablePOs)

        } catch (error: any) {
            toast.error(error.message || "Failed to record delivery")
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Truck className="h-5 w-5 text-primary" />
                                Receive Inventory Shipment
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
                                    const firstError = Object.values(errors)[0] as any
                                    toast.error(firstError?.message || "Please check the form for errors.")
                                    console.error("Validation Errors:", errors)
                                })} className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="purchase_order_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Select Purchase Order</FormLabel>
                                                <Select onValueChange={(val) => { field.onChange(val); onPOChange(val) }} value={field.value}>
                                                    <FormControl><SelectTrigger><SelectValue placeholder="Search for PO#..." /></SelectTrigger></FormControl>
                                                    <SelectContent>
                                                        {pos.map(p => (
                                                            <SelectItem key={p.id} value={p.id}>
                                                                {p.po_number} | {p.suppliers?.name || "Unknown Supplier"}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {selectedPO && availableItems.length > 0 && (
                                        <FormField
                                            control={form.control}
                                            name="item_index"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Select Product Item from PO</FormLabel>
                                                    <Select onValueChange={(val) => { field.onChange(parseInt(val)); onItemChange(val) }} value={String(field.value)}>
                                                        <FormControl><SelectTrigger><SelectValue placeholder="Select specific item..." /></SelectTrigger></FormControl>
                                                        <SelectContent>
                                                            {availableItems.map((item: any, idx: number) => {
                                                                const isItemDelivered = item.status === 'delivered' || item.status === 'received';
                                                                return (
                                                                    <SelectItem key={idx} value={String(idx)} disabled={isItemDelivered}>
                                                                        {item.product_name} - {item.ordered_quantity} {item.unit_type === 'liter' ? 'Liters' : 'Units'} {isItemDelivered ? '(Delivered)' : '(Pending)'}
                                                                    </SelectItem>
                                                                )
                                                            })}
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
                                            name="delivered_quantity"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Quantity Delivered NOW</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            placeholder="0.00"
                                                            {...field}
                                                            value={field.value || ""}
                                                            disabled={isUsingTanks}
                                                            onChange={(e) => {
                                                                if (!isUsingTanks) {
                                                                    field.onChange(e)
                                                                }
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormDescription className="text-[10px] text-primary font-bold">Max: {remainingQty} {shortUnitLabel}</FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="rate_per_liter"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Price Per {unitLabel === 'Units' ? 'Unit' : 'Liter'}</FormLabel>
                                                    <FormControl><Input type="number" step="0.0001" placeholder="0.00" {...field} /></FormControl>
                                                    <FormDescription className="text-[10px]">Actual invoice rate from supplier</FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {isUsingTanks && (
                                        <div className="bg-slate-50 border rounded-lg p-4 space-y-3 mt-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Truck className="h-4 w-4 text-slate-500" />
                                                <h4 className="text-sm font-bold uppercase text-slate-700">Tank Allocation Dashboard</h4>
                                            </div>
                                            <p className="text-xs text-muted-foreground mb-3 leading-tight">
                                                Specify how much quantity goes into each connected tank. The total quantity above is automatically calculated from these values.
                                            </p>
                                            <div className="grid gap-3">
                                                {tanks.filter(t => t.product_id === productId).map((tank) => {
                                                    const currentTankIdx = watchTankDistribution.findIndex(td => td.tank_id === tank.id);
                                                    const currentVal = currentTankIdx >= 0 ? watchTankDistribution[currentTankIdx].quantity : 0;

                                                    const fillPercentage = tank.capacity > 0 ? ((tank.current_level + currentVal) / tank.capacity) * 100 : 0;
                                                    const isOverCapacity = fillPercentage > 100;

                                                    return (
                                                        <div key={tank.id} className="flex items-center gap-4 bg-white p-2 rounded-md border text-sm">
                                                            <div className="flex-1">
                                                                <div className="font-bold flex items-center justify-between">
                                                                    <span>{tank.name}</span>
                                                                    <span className={`text-[10px] ${isOverCapacity ? 'text-red-500' : 'text-slate-500'}`}>
                                                                        Cap: {tank.capacity}L
                                                                    </span>
                                                                </div>
                                                                <div className="text-xs text-muted-foreground">Current: {tank.current_level}L</div>
                                                            </div>
                                                            <div className="w-32">
                                                                <Input
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    placeholder="0"
                                                                    value={currentVal || ""}
                                                                    onChange={(e) => {
                                                                        const val = parseFloat(e.target.value) || 0;
                                                                        const currentDist = [...watchTankDistribution];
                                                                        const existingIdx = currentDist.findIndex(x => x.tank_id === tank.id);

                                                                        if (existingIdx >= 0) {
                                                                            currentDist[existingIdx].quantity = val;
                                                                        } else {
                                                                            currentDist.push({ tank_id: tank.id, tank_name: tank.name, quantity: val });
                                                                        }
                                                                        form.setValue("tank_distribution", currentDist.filter(d => d.quantity > 0));
                                                                    }}
                                                                    className={`h-8 font-mono ${isOverCapacity ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                                                                />
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                        <FormField control={form.control} name="delivery_date" render={({ field }) => (
                                            <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} min={systemActiveDate} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="company_invoice_number" render={({ field }) => (
                                            <FormItem><FormLabel>Invoice # (Opt)</FormLabel><FormControl><Input placeholder="Supplier Invoice #" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="vehicle_number" render={({ field }) => (
                                            <FormItem><FormLabel>Vehicle (Opt)</FormLabel><FormControl><Input placeholder="ABC-1234" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                    </div>

                                    <Button type="submit" className="w-full h-12 text-lg font-black uppercase mt-4" disabled={loading || !selectedPO || selectedItemIndex === null}>
                                        {loading ? <BrandLoader size="sm" /> : "Confirm Receipt & Update Stock"}
                                    </Button>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-4">
                    <Card className="bg-slate-50 border-slate-200">
                        <CardHeader>
                            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-500">Item Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Supplier:</span>
                                <span className="font-bold">{selectedPO?.suppliers?.name || "-"}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Category:</span>
                                <span className="font-bold capitalize">{categoryLabel}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Product Name:</span>
                                <span className="font-bold uppercase text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-700">{productLabel}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm border-t border-slate-200 pt-3">
                                <span className="text-muted-foreground">Original Order:</span>
                                <span className="font-bold">{orderedQty} {shortUnitLabel}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Already Delivered:</span>
                                <span className="font-bold text-blue-600">{alreadyDelivered} {shortUnitLabel}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">To be Delivered:</span>
                                <span className="font-bold">{remainingQty} {shortUnitLabel}</span>
                            </div>

                            {Number(watchQty) > 0 && (
                                <div className="space-y-2 border-t border-slate-200 pt-3">
                                    {Number(watchQty) < remainingQty ? (
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-amber-600 font-bold uppercase text-[10px]">Short Quantity:</span>
                                            <span className="font-black text-amber-600">{(remainingQty - Number(watchQty)).toFixed(2)} {shortUnitLabel}</span>
                                        </div>
                                    ) : Number(watchQty) > remainingQty ? (
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-emerald-600 font-bold uppercase text-[10px]">Extra Quantity:</span>
                                            <span className="font-black text-emerald-600">{(Number(watchQty) - remainingQty).toFixed(2)} {shortUnitLabel}</span>
                                        </div>
                                    ) : (
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-blue-600 font-bold uppercase text-[10px]">Status:</span>
                                            <span className="font-black text-blue-600">Exact Match</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex justify-between items-center text-base font-black border-t border-slate-300 pt-3">
                                <span>Net Remaining:</span>
                                <span className="text-primary">{Math.max(0, remainingQty - Number(watchQty)).toFixed(2)} {shortUnitLabel}</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-primary/5 border-primary/20">
                        <CardHeader>
                            <CardTitle className="text-sm font-black uppercase tracking-widest text-primary">Financial Impact</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Auto-Debit Amount</span>
                                <span className="text-2xl font-black text-slate-900 leading-none">Rs. {totalAmount.toLocaleString()}</span>
                            </div>

                            {isPartial && (
                                <div className="flex flex-col gap-1 mt-4 pt-4 border-t border-primary/10">
                                    <span className="text-[10px] font-bold text-amber-600 uppercase flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3" />
                                        Hold Amount (Not Debited)
                                    </span>
                                    <span className="text-xl font-black text-amber-700 leading-none">Rs. {holdAmount.toLocaleString()}</span>
                                    <span className="text-[10px] text-amber-600/80 mt-1">
                                        For {holdQuantity} undelivered {unitLabel.toLowerCase()}
                                    </span>
                                </div>
                            )}

                            <Alert className="bg-white border-primary/10 py-2 mt-4">
                                <Info className="h-3 w-3 text-primary" />
                                <AlertDescription className="text-[10px] leading-tight flex flex-col gap-1 pl-2">
                                    <span>• Saves delivery & updates stock.</span>
                                    <span>• Debits supplier account for {totalAmount.toLocaleString()}.</span>
                                    {isPartial && <span>• Creates hold record for missing {holdQuantity} {shortUnitLabel}.</span>}
                                    <span>• Closes THIS item inside the PO array.</span>
                                </AlertDescription>
                            </Alert>
                        </CardContent>
                    </Card>
                </div>

                <Dialog open={showWarning} onOpenChange={setShowWarning}>
                    <DialogContent className="sm:max-w-[500px] border-amber-200 bg-amber-50">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-amber-800 text-xl font-black uppercase tracking-tight">
                                <AlertTriangle className="h-6 w-6" />
                                Partial Item Delivery Detected
                            </DialogTitle>
                            <DialogDescription className="text-amber-700/80 text-sm">
                                You are recording less than the ordered item quantity. Only ONE delivery is allowed per order item.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="bg-white p-4 rounded-lg border border-amber-200">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase text-slate-500">Ordered</p>
                                        <p className="font-mono">{remainingQty} {shortUnitLabel}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold uppercase text-slate-500">Delivering Now</p>
                                        <p className="font-mono text-blue-600 font-bold">{watchQty} {shortUnitLabel}</p>
                                    </div>
                                    <div className="col-span-2 pt-3 border-t">
                                        <p className="text-[10px] font-bold uppercase text-slate-500">Missing / Undelivered</p>
                                        <p className="font-mono text-lg text-amber-600 font-black">{holdQuantity} {shortUnitLabel}</p>
                                    </div>
                                </div>
                            </div>

                            <Alert className="bg-white border-amber-200">
                                <CheckCircle2 className="h-4 w-4 text-amber-600" />
                                <AlertTitle className="text-amber-800 text-xs uppercase font-bold tracking-wider">What happens next?</AlertTitle>
                                <AlertDescription className="text-amber-700/90 text-xs mt-2 space-y-2">
                                    <p className="flex items-start gap-2">
                                        <ChevronRight className="h-4 w-4 shrink-0" />
                                        This ITEM will be marked as <strong>DELIVERED</strong>. No more deliveries can be made.
                                    </p>
                                    <p className="flex items-start gap-2">
                                        <ChevronRight className="h-4 w-4 shrink-0" />
                                        A hold record of <strong>Rs. {holdAmount.toLocaleString()}</strong> will be created and tracked.
                                    </p>
                                    <p className="flex items-start gap-2">
                                        <ChevronRight className="h-4 w-4 shrink-0" />
                                        You will be reminded to collect this missing inventory or get a refund from the supplier.
                                    </p>
                                </AlertDescription>
                            </Alert>
                        </div>

                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="outline" onClick={() => setShowWarning(false)} className="w-full sm:w-auto border-amber-200 text-amber-800 hover:bg-amber-100">Cancel</Button>
                            <Button onClick={() => pendingSubmitValues && processDelivery(pendingSubmitValues)} disabled={loading} className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white">
                                {loading ? <BrandLoader size="sm" /> : "Confirm Delivery"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div >
            <HoldAmountPopup
                open={!!holdData}
                onOpenChange={(open) => !open && setHoldData(null)}
                holdRecordId={holdData?.holdRecordId || null}
                poId={holdData?.poId || null}
                holdAmount={holdData?.holdAmount || 0}
                holdQuantity={holdData?.holdQuantity || 0}
                productName={holdData?.productName || ""}
                onSuccess={() => { setHoldData(null); onSuccess() }}
            />
        </>
    )
}
