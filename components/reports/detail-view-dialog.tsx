"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { format } from "date-fns"
import {
    Receipt,
    Printer,
    Edit2,
    Save,
    X,
    Loader2
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { updateManualSalePayment } from "@/app/actions/manual-sales-actions"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export function DetailViewDialog({ isOpen, onOpenChange, item }: any) {
    const supabase = createClient()
    const [loading, setLoading] = useState(false)
    const [subItems, setSubItems] = useState<any[]>([])
    const [isEditing, setIsEditing] = useState(false)
    const [editValue, setEditValue] = useState("")
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        if (isOpen && item) {
            fetchSubDetails()
        } else {
            setSubItems([])
        }
    }, [isOpen, item])

    const fetchSubDetails = async () => {
        if (!item) return
        setLoading(true)
        try {
            // Priority 1: If item already has 'items' (JSONB from PO), use it
            if (item.items && Array.isArray(item.items) && item.items.length > 0) {
                // Map PO items to the format expected by si.products.product_name
                const mapped = item.items.map((i: any, idx: number) => ({
                    ...i,
                    id: i.id || `${item.id}-item-${idx}`,
                    // BUG FIX: Prioritize 'quantity' (delivered) over 'ordered_quantity' for this display mapping
                    quantity: i.quantity || i.delivered_quantity || i.ordered_quantity,
                    purchase_price_per_unit: i.purchase_price_per_unit || i.rate_per_liter || i.price,
                    total_amount: i.total_amount || (Number(i.quantity || i.delivered_quantity || i.ordered_quantity) * Number(i.purchase_price_per_unit || i.rate_per_liter || i.price)),
                    products: { product_name: i.product_name || (i.products?.product_name) }
                }));
                setSubItems(mapped);
                setLoading(false);
                return;
            }

            // 1. Purchase Details (from purchase_orders or stock movement or purchases table)
            if (
                (item.total_amount !== undefined && item.invoice_number && !item.product_id) ||
                (item.movement_type === 'purchase' && item.reference_type === 'purchase')
            ) {
                const orderId = item.reference_id || item.id
                const { data } = await supabase
                    .from("purchases")
                    .select("*, products(product_name)")
                    .eq("order_id", orderId)
                if (data && data.length > 0) {
                    setSubItems(data)
                } 
            }
            // 2. Fuel Sale specifics (from nozzle_readings or stock movement)
            else if (
                item.opening_reading !== undefined ||
                (item.sale_amount !== undefined && item.nozzle_id) ||
                (item.movement_type === 'sale' && item.reference_type === 'reading')
            ) {
                const readingId = item.reference_id || item.id
                const { data } = await supabase
                    .from("nozzle_readings")
                    .select("*, nozzles(nozzle_number, products(product_name))")
                    .eq("id", readingId)
                    .single()
                if (data) setSubItems([data])
            }
            // 3. Product Sale specifics (from manual_sales or stock movement)
            else if (
                (item.unit_price !== undefined && item.product_id) ||
                (item.movement_type === 'sale' && item.reference_type === 'sale')
            ) {
                const saleId = item.reference_id || item.id
                const { data } = await supabase
                    .from("manual_sales")
                    .select("*, products(name)")
                    .eq("id", saleId)
                    .single()
                if (data) {
                    // Map products.name to product_name for consistency
                    setSubItems([{
                        ...data,
                        products: { product_name: data.products?.name }
                    }])
                }
            }
            // 4. Card Hold Details
            else if (item.hold_amount !== undefined || item.card_type) {
                const holdId = item.id
                const { data } = await supabase
                    .from("card_hold_records")
                    .select("*, bank_cards(card_name), supplier_cards(card_name)")
                    .eq("id", holdId)
                    .single()
                if (data) setSubItems([data])
            }
        } catch (error) {
            console.error("Error fetching sub-details:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleEditClick = () => {
        setEditValue((item.paid_amount || item.cash_payment_amount || item.total_amount || 0).toString())
        setIsEditing(true)
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const newVal = parseFloat(editValue)
            if (isNaN(newVal)) throw new Error("Invalid amount")
            
            await updateManualSalePayment(item.id, newVal)
            
            toast.success("Payment amount updated!")
            setIsEditing(false)
            onOpenChange(false)
        } catch (error: any) {
            toast.error(error.message || "Failed to update")
        } finally {
            setIsSaving(false)
        }
    }

    if (!item) return null

    // Precise Type Determination
    const isFuelSale = item.opening_reading !== undefined || (item.revenue !== undefined && item.nozzle_id)
    const isProductSale = (item.unit_price !== undefined || item.total_amount !== undefined) && item.product_id && !isFuelSale && !item.invoice_number
    const isCardRecord = item.hold_amount !== undefined || item.card_type !== undefined
    const isPurchase = item.total_amount !== undefined && !isProductSale
    const isExpense = item.amount !== undefined && !isPurchase && !isCardRecord

    const type = isFuelSale ? "Fuel Sale" : isProductSale ? "Product Sale" : isPurchase ? "Purchase" : "Expense"

    const printStyles = `
        @media print {
            /* 1. Nuke the background phantom space */
            #reports-page-wrapper { 
                display: none !important; 
            }
            
            html, body { 
                background: white !important; 
                margin: 0 !important; 
                padding: 0 !important;
                height: auto !important;
            }

            /* 2. Target exactly this receipt and force it to center */
            body * { visibility: hidden !important; }
            #receipt-${item.id}, #receipt-${item.id} * { visibility: visible !important; }
            
            /* Zero out all parent heights to prevent them from pushing content to page 2 */
            html, body, [data-radix-portal], [role="dialog"], .fixed.inset-0 { 
                margin: 0 !important; 
                padding: 0 !important;
                height: 0 !important;
                width: 100% !important;
                background: transparent !important;
            }

            #receipt-${item.id} { 
                position: absolute !important;
                top: -600px !important; /* Extreme upward shift to overcome browser header space */
                left: 0 !important;
                right: 0 !important;
                margin: 0 auto !important;
                padding: 0 !important;
                width: 95% !important; 
                display: block !important;
                max-height: none !important;
                height: auto !important;
                overflow: visible !important;
                zoom: 0.60 !important;
                z-index: 99999 !important;
                border: none !important;
                box-shadow: none !important;
                background: white !important;
                transform: none !important;
            }

            .grid-cols-1, .lg\\:grid-cols-\\[1\\.5fr\\,1fr\\] { 
                display: grid !important;
                grid-template-columns: 1fr 1fr !important;
                gap: 10px !important;
            }
            .space-y-4 { margin-top: 5px !important; margin-bottom: 5px !important; }
            .space-y-6 { margin-top: 8px !important; margin-bottom: 8px !important; }
            .p-4, .p-6, .p-8 { padding: 8px !important; }
            [class*="CardHeader"] { padding-top: 0 !important; padding-bottom: 2px !important; }
            .print-hidden { display: none !important; }
            
            @page {
                size: landscape;
                margin: 0 !important;
            }
            
            #receipt-${item.id}, .bg-white, .dark\\:bg-slate-950 { 
                break-inside: avoid !important;
            }
            .overflow-y-auto { overflow: visible !important; max-height: none !important; }
            [class*="CardContent"] { overflow: visible !important; max-height: none !important; padding: 5px !important; }
            .min-h-\\[140px\\], .min-h-\\[200px\\] { min-height: 0 !important; }
            .rounded-2xl { rounded: 12px !important; } /* Smaller rounding to save a few px */
        }
    `;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <style>{printStyles}</style>
            <DialogContent showCloseButton={false} className="max-w-[1200px] w-[98vw] p-0 border-none bg-transparent">
                <Card id={`receipt-${item.id}`} className="border-none shadow-2xl bg-white dark:bg-slate-950 flex flex-col max-h-[90vh] overflow-hidden printable-receipt-card relative">
                    <CardHeader className="bg-primary text-primary-foreground rounded-t-xl pb-4 flex-shrink-0 print:rounded-none">
                        <div className="flex justify-between items-start">
                            <div>
                                <Badge variant="secondary" className="mb-1.5 bg-white/20 text-white hover:bg-white/30 border-none text-[10px]">
                                    {type}
                                </Badge>
                                <CardTitle className="text-xl sm:text-2xl font-black">Transaction Detail</CardTitle>
                                <CardDescription className="text-primary-foreground/70 text-xs mt-0.5">
                                    Recorded at {format(new Date(item.sale_date || item.purchase_date || item.expense_date || item.reading_date || item.movement_date || new Date()), "PPP p")}
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md">
                                    <Receipt className="h-5 w-5" />
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 rounded-full text-white hover:bg-white/20 transition-colors"
                                    onClick={() => onOpenChange(false)}
                                >
                                    <X className="h-5 w-5" />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="p-4 sm:p-6 space-y-6 bg-white dark:bg-slate-950 overflow-y-auto custom-scrollbar">
                        {/* 1. TOP SECTION: REFERENCE & STATUS (SPANS FULL WIDTH) */}
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap justify-between items-center gap-4">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                    <Receipt className="h-4 w-4" />
                                </div>
                                <div>
                                    <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest block leading-none mb-1">Reference ID</span>
                                    <div className="font-mono text-xs text-primary font-bold">
                                        {item.id.toUpperCase()}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest block leading-none mb-1">System Status</span>
                                    <Badge className="bg-emerald-500 hover:bg-emerald-600 text-[10px] h-6 px-3 font-bold">COMPLETED</Badge>
                                </div>
                            </div>
                        </div>

                        {/* 2. LANDSCAPE GRID: ITEMS (LEFT) vs SUMMARY (RIGHT) */}
                        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr,1fr] gap-6 lg:items-start">

                            {/* LEFT COLUMN: TRANSACTION ITEMS */}
                            <div className="space-y-4">
                                <div className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                    {isPurchase ? "Transaction Line Items" : isFuelSale ? "Operating Readings" : "Items List"}
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-4">
                                    {isFuelSale && (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
                                                <span className="text-sm font-bold">{item.nozzles?.products?.product_name || subItems[0]?.nozzles?.products?.product_name || "Fuel Sale"}</span>
                                                <Badge variant="secondary" className="text-[10px]">Nozzle {item.nozzles?.nozzle_number || subItems[0]?.nozzles?.nozzle_number || "-"}</Badge>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border text-center shadow-sm">
                                                    <div className="text-[9px] text-muted-foreground uppercase font-black">Start Reading</div>
                                                    <div className="text-base font-mono font-bold">{(item.opening_reading || 0).toFixed(2)}</div>
                                                </div>
                                                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border text-center shadow-sm">
                                                    <div className="text-[9px] text-muted-foreground uppercase font-black">End Reading</div>
                                                    <div className="text-base font-mono font-bold">{(item.closing_reading || 0).toFixed(2)}</div>
                                                </div>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full">
                                                    <thead>
                                                        <tr className="border-b border-slate-200 dark:border-slate-800">
                                                            <th className="text-[10px] text-muted-foreground uppercase font-black pb-2 text-left">Quantity</th>
                                                            <th className="text-[10px] text-muted-foreground uppercase font-black pb-2 text-left">Price</th>
                                                            <th className="text-[10px] text-muted-foreground uppercase font-black pb-2 text-right">Total Amount</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr>
                                                            <td className="py-3 text-sm font-bold font-mono">{(item.quantity_sold || item.quantity || 0).toLocaleString()} <span className="text-[10px] font-sans text-muted-foreground">Ltr</span></td>
                                                            <td className="py-3 text-sm font-bold font-mono text-primary">Rs.{Number(item.selling_price || item.unit_price || item.rate_per_liter || 0).toLocaleString()}</td>
                                                            <td className="py-3 text-lg font-black text-primary font-mono text-right">Rs.{Number(item.sale_amount || item.revenue || item.total_amount || (Number(item.quantity_sold || item.quantity) * Number(item.selling_price || item.unit_price || item.rate_per_liter)) || 0).toLocaleString()}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {isProductSale && (
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                                <span className="text-sm font-bold text-primary">{item.products?.product_name || "Product Item"}</span>
                                                <Badge className="h-5">x{item.quantity}</Badge>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full">
                                                    <thead>
                                                        <tr className="border-b border-slate-100 dark:border-slate-800">
                                                            <th className="text-[10px] text-muted-foreground uppercase font-black pb-2 text-left">Qty</th>
                                                            <th className="text-[10px] text-muted-foreground uppercase font-black pb-2 text-left">Rate</th>
                                                            <th className="text-[10px] text-muted-foreground uppercase font-black pb-2 text-right">Total Sale</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr>
                                                            <td className="py-2 text-sm font-bold font-mono">{item.quantity} <span className="text-[10px] font-sans text-muted-foreground">Unit</span></td>
                                                            <td className="py-2 text-sm font-bold font-mono">Rs.{Number(item.selling_price || item.unit_price || 0).toLocaleString()}</td>
                                                            <td className="py-2 text-base font-black text-primary font-mono text-right">Rs.{Number(item.sale_amount || item.revenue || item.total_amount || 0).toLocaleString()}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {isPurchase && (
                                        <div className="space-y-3">
                                            {loading ? (
                                                <div className="space-y-2">
                                                    <Skeleton className="h-4 w-full" />
                                                    <Skeleton className="h-4 w-3/4" />
                                                </div>
                                            ) : subItems.length > 0 ? (
                                                <div className="space-y-4">
                                                    {subItems.map((si, idx) => {
                                                        const diff = (si.quantity || 0) - (si.ordered_quantity || 0);
                                                        const isShort = diff < 0;
                                                        const isExtra = diff > 0;
                                                        
                                                        return (
                                                            <div key={si.id || `item-${idx}`} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-3 hover:border-primary/20 transition-colors duration-300">
                                                                <div className="flex justify-between items-start gap-4">
                                                                    <div className="flex flex-col truncate">
                                                                        <span className="font-black text-xs text-primary truncate">{si.products?.product_name || si.product_name}</span>
                                                                        {isShort && (
                                                                            <Badge variant="destructive" className="text-[8px] h-3.5 mt-1 w-fit uppercase font-bold px-1.5">
                                                                                Shortage: {Math.abs(diff).toLocaleString()} L
                                                                            </Badge>
                                                                        )}
                                                                        {isExtra && (
                                                                            <Badge className="bg-emerald-500 hover:bg-emerald-600 text-[8px] h-3.5 mt-1 w-fit uppercase font-bold px-1.5">
                                                                                Extra: {diff.toLocaleString()} L
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                    <Badge variant="outline" className="text-[8px] h-4 uppercase bg-slate-50 dark:bg-slate-950 font-bold flex-shrink-0">ID-{(String(si.id || '') || 'N/A').slice(-4)}</Badge>
                                                                </div>
                                                                <table className="w-full border-t border-slate-100 dark:border-slate-800 pt-2">
                                                                    <thead>
                                                                        <tr>
                                                                            <th className="text-[8px] text-muted-foreground uppercase font-black text-left pt-2">Ordered</th>
                                                                            <th className="text-[8px] text-muted-foreground uppercase font-black text-left pt-2">Received</th>
                                                                            <th className="text-[8px] text-muted-foreground uppercase font-black text-left pt-2">Rate</th>
                                                                            <th className="text-[8px] text-muted-foreground uppercase font-black text-right pt-2">Total</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        <tr>
                                                                            <td className="text-[11px] font-mono font-bold pt-1 text-muted-foreground">{(si.ordered_quantity || 0).toLocaleString()}L</td>
                                                                            <td className={cn("text-[11px] font-mono font-bold pt-1", isShort ? "text-rose-600" : isExtra ? "text-emerald-600" : "")}>{(si.quantity || 0).toLocaleString()}L</td>
                                                                            <td className="text-[11px] font-mono font-bold text-primary pt-1">Rs.{Math.round(si.purchase_price_per_unit || 0).toLocaleString()}</td>
                                                                            <td className="text-xs font-black text-primary font-mono text-right pt-1">Rs.{Math.round(si.total_amount || 0).toLocaleString()}</td>
                                                                        </tr>
                                                                    </tbody>
                                                                </table>

                                                                {/* Bank Hold for this specific item if it exists */}
                                                                {si.po_hold_record && (
                                                                    <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex justify-between items-center">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="h-5 w-5 rounded bg-amber-500/20 flex items-center justify-center text-amber-600">
                                                                                <Receipt className="h-3 w-3" />
                                                                            </div>
                                                                            <div className="flex flex-col">
                                                                                <span className="text-[8px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-tighter">Bank Hold (Shortage)</span>
                                                                                <span className="text-[9px] font-bold text-amber-600">Qty: {si.po_hold_record.hold_quantity} L</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <div className="text-[10px] font-black text-amber-700">Rs. {Number(si.po_hold_record.hold_amount).toLocaleString()}</div>
                                                                            <Badge className={cn("text-[7px] h-3 uppercase p-1", si.po_hold_record.status === 'released' ? "bg-emerald-500" : "bg-amber-500")}>
                                                                                {si.po_hold_record.status}
                                                                            </Badge>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="text-center py-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                                    <div className="text-sm font-bold text-primary">{item.products?.product_name || "Stock Arrival"}</div>
                                                    
                                                    {/* Check for overall difference if subItems was empty */}
                                                    {item.ordered_quantity !== undefined && (
                                                        <div className="flex justify-center mt-1">
                                                            {Number(item.delivered_quantity || item.quantity) < Number(item.ordered_quantity) ? (
                                                                <Badge variant="destructive" className="text-[9px] h-4 uppercase font-bold">Shortage Detected</Badge>
                                                            ) : Number(item.delivered_quantity || item.quantity) > Number(item.ordered_quantity) ? (
                                                                <Badge className="bg-emerald-500 text-[9px] h-4 uppercase font-bold">Extra Quantity</Badge>
                                                            ) : null}
                                                        </div>
                                                    )}

                                                    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-3 mt-3 border-t text-center px-4">
                                                        <div className="flex flex-col">
                                                            <div className="text-[10px] uppercase font-black text-muted-foreground mb-0.5">Ordered</div>
                                                            <div className="text-sm font-bold font-mono text-muted-foreground">{item.ordered_quantity || "-"} <span className="text-[10px] font-sans">L</span></div>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <div className="text-[10px] uppercase font-black text-muted-foreground mb-0.5">Received</div>
                                                            <div className="text-sm font-bold font-mono">{item.delivered_quantity || item.quantity || item.ordered_quantity} <span className="text-[10px] font-sans text-muted-foreground">L</span></div>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <div className="text-[10px] uppercase font-black text-muted-foreground mb-0.5">Rate</div>
                                                            <div className="text-sm font-bold font-mono">Rs.{Number(item.purchase_price_per_unit || item.rate_per_liter || 0).toLocaleString()}</div>
                                                        </div>
                                                        <div className="flex flex-col items-end flex-grow">
                                                            <div className="text-[10px] uppercase font-black text-muted-foreground mb-0.5">Total Amount</div>
                                                            <div className="text-base font-black text-primary font-mono leading-none">Rs.{Number(item.delivered_amount || item.total_amount || 0).toLocaleString()}</div>
                                                        </div>
                                                    </div>

                                                    {/* Global Hold if exists */}
                                                    {item.po_hold_records && item.po_hold_records.length > 0 && (
                                                        <div className="mt-4 mx-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-dashed border-amber-300 dark:border-amber-800 rounded-xl flex justify-between items-center anim-pulse">
                                                            <div className="text-left">
                                                                <div className="text-[8px] font-black text-amber-700 uppercase">Aggregated Bank Hold</div>
                                                                <div className="text-xs font-bold text-amber-600">Total Held: {item.hold_quantity} L</div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-sm font-black text-amber-700">Rs. {Number(item.hold_amount).toLocaleString()}</div>
                                                                <span className="text-[8px] text-amber-600 font-bold uppercase tracking-widest">Awaiting reconciliation</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {isCardRecord && (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center border-b pb-2 border-dashed border-slate-200 dark:border-slate-800">
                                                <span className="text-[10px] font-bold uppercase text-muted-foreground">Card Details</span>
                                                <Badge variant="outline" className="text-[10px] bg-white dark:bg-slate-950 px-2 py-0 h-5">
                                                    {item.bank_cards?.card_name || item.supplier_cards?.card_name || item.card_type}
                                                </Badge>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border text-center shadow-sm">
                                                    <div className="text-[9px] text-muted-foreground uppercase font-black">Hold Amount</div>
                                                    <div className="text-base font-mono font-bold">Rs. {Number(item.hold_amount || 0).toLocaleString()}</div>
                                                </div>
                                                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border text-center shadow-sm border-emerald-100 bg-emerald-50/10">
                                                    <div className="text-[9px] text-emerald-600 uppercase font-black">Net Amount</div>
                                                    <div className="text-base font-mono font-bold text-emerald-600">Rs. {Number(item.net_amount || 0).toLocaleString()}</div>
                                                </div>
                                            </div>
                                            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border shadow-sm space-y-2">
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-muted-foreground">Tax Deduction:</span>
                                                    <span className="font-bold text-rose-600">-Rs. {Number(item.tax_amount || 0).toLocaleString()} ({item.tax_percentage}%)</span>
                                                </div>
                                                <div className="flex justify-between text-xs border-t pt-2">
                                                    <span className="text-muted-foreground">Current Status:</span>
                                                    <Badge className={cn(
                                                        "text-[9px] uppercase font-bold px-2 h-5",
                                                        item.status === 'released' ? "bg-emerald-500" : "bg-amber-500"
                                                    )}>
                                                        {item.status || 'PENDING'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {isExpense && (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center border-b pb-2 border-dashed border-slate-200 dark:border-slate-800">
                                                <span className="text-[10px] font-bold uppercase text-muted-foreground">Expense Category</span>
                                                <Badge variant="outline" className="text-[10px] bg-white dark:bg-slate-950 px-2 py-0 h-5">{item.expense_categories?.category_name || "Operating"}</Badge>
                                            </div>
                                            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-center font-bold text-lg text-primary">
                                                <div className="text-[9px] text-muted-foreground uppercase mb-1">Expense Amount</div>
                                                Rs. {Number(item.amount).toLocaleString()}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* RIGHT COLUMN: SUMMARY & TOTAL */}
                            <div className="space-y-6">
                                <div className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                    Payment Metadata
                                </div>

                                <div className="space-y-4">
                                    {/* Payment Details Card */}
                                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
                                        <div className="flex justify-between items-center bg-white dark:bg-slate-900 border p-2.5 rounded-xl">
                                            <span className="text-[9px] font-bold uppercase text-muted-foreground">Method</span>
                                            <Badge variant="outline" className="text-[10px] capitalize bg-slate-50 dark:bg-slate-950 font-bold px-3 h-6">
                                                {item.payment_method?.replace('_', ' ') || "Cash"}
                                            </Badge>
                                        </div>

                                        {item.payment_method === 'bank_transfer' && (
                                            <div className="flex justify-between items-center bg-primary/5 p-2.5 rounded-xl border border-primary/10">
                                                <span className="text-[9px] font-bold uppercase text-muted-foreground">Bank</span>
                                                <span className="text-xs font-black text-primary flex items-center gap-1.5">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                                    {item.accounts?.account_name || "Bank Account"}
                                                </span>
                                            </div>
                                        )}

                                        <div className="space-y-2.5 pt-1">
                                            <div className="flex justify-between items-center">
                                                <span className="font-bold uppercase text-muted-foreground text-[9px]">Paid</span>
                                                <div className="flex items-center gap-2">
                                                    {isEditing ? (
                                                        <div className="flex items-center gap-1">
                                                            <Input 
                                                                className="h-7 w-24 text-right text-xs px-2 font-mono font-bold"
                                                                type="number"
                                                                value={editValue}
                                                                onChange={(e) => setEditValue(e.target.value)}
                                                                autoFocus
                                                            />
                                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={handleSave} disabled={isSaving}>
                                                                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                                            </Button>
                                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => setIsEditing(false)} disabled={isSaving}>
                                                                <X className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <span className="font-mono font-black text-emerald-600 text-sm">
                                                                Rs.{Number(item.paid_amount || item.cash_payment_amount || item.delivered_amount || item.amount || item.sale_amount || 0).toLocaleString()}
                                                            </span>
                                                            {isProductSale && (
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity print:hidden"
                                                                    onClick={handleEditClick}
                                                                >
                                                                    <Edit2 className="h-3 w-3 text-muted-foreground hover:text-primary" />
                                                                </Button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            {isPurchase && (
                                                <div className="flex justify-between items-center border-t border-dashed pt-2.5">
                                                    <span className="font-bold uppercase text-muted-foreground text-[9px]">Dues</span>
                                                    <span className={`font-mono font-black text-sm ${Number(item.due_amount || 0) > 0 ? "text-destructive" : "text-emerald-500"}`}>
                                                        Rs.{Number(item.due_amount || 0).toLocaleString()}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {item.description && (
                                            <div className="pt-3 border-t">
                                                <span className="text-[9px] uppercase font-black text-muted-foreground block mb-1">Remarks</span>
                                                <div className="bg-amber-50 dark:bg-amber-500/5 text-[10px] italic p-3 rounded-xl border border-amber-100 dark:border-amber-500/20 text-amber-900 dark:text-amber-200">
                                                    "{item.description}"
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Grand Total Card */}
                                    <div className="bg-primary rounded-2xl p-6 text-primary-foreground shadow-xl shadow-primary/20 relative overflow-hidden flex flex-col justify-center min-h-[140px]">
                                        <div className="absolute -right-6 -top-6 h-32 w-32 bg-white/10 rounded-full blur-3xl opacity-50" />
                                        <div className="relative z-10 text-center space-y-3">
                                            <div className="text-[10px] uppercase font-black tracking-widest opacity-70">Total Amount</div>
                                            <div className="text-4xl font-black tracking-tighter">
                                                <span className="text-lg mr-1 font-bold opacity-80">Rs.</span>
                                                {(item.sale_amount || item.revenue || item.total_amount || item.amount || item.total_purchases || 0).toLocaleString()}
                                            </div>
                                            <div className="text-[9px] font-medium opacity-50 italic">Digital Receipt Token Generated</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>

                    <CardFooter className="bg-slate-50 dark:bg-slate-900/50 p-4 sm:p-6 border-t gap-4 print-hidden flex-shrink-0">
                        <Button
                            variant="default"
                            className="w-full h-11 rounded-xl font-black shadow-lg shadow-primary/20 transition-all active:scale-95 hover:brightness-110 hover:text-white"
                            onClick={() => onOpenChange(false)}
                        >
                            Close Details
                        </Button>
                    </CardFooter>
                </Card>
            </DialogContent>
        </Dialog>
    )
}
