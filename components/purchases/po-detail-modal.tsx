"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { format } from "date-fns"
import { BrandLoader } from "../ui/brand-loader"
import { getPurchaseOrderDetail, cancelPurchaseOrderItem } from "@/app/actions/purchase-orders"
import { RefreshCw, Trash2 } from "lucide-react"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"

interface PODetailModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    poId: string | null
    deliveryId?: string // Optional focus on a specific delivery
}

export function PODetailModal({
    open,
    onOpenChange,
    poId,
    deliveryId
}: PODetailModalProps) {
    const [loading, setLoading] = useState(false)
    const [cancellingItem, setCancellingItem] = useState<string | null>(null)
    const [itemToDelete, setItemToDelete] = useState<{ id: string, name: string } | null>(null)
    const [po, setPo] = useState<any>(null)

    useEffect(() => {
        if (open && poId) {
            fetchDetail()
        } else {
            setPo(null)
        }
    }, [open, poId])

    const fetchDetail = async () => {
        setLoading(true)
        try {
            const data = await getPurchaseOrderDetail(poId!)
            setPo(data)
        } catch (error) {
            console.error("Failed to fetch PO details:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleConfirmCancel = async () => {
        if (!itemToDelete || !poId) return;

        setCancellingItem(itemToDelete.id);
        try {
            const res = await cancelPurchaseOrderItem(poId, itemToDelete.id);
            toast.success(`Successfully cancelled ${itemToDelete.name}.`);
            if (res.allCancelled) {
                onOpenChange(false);
            } else {
                fetchDetail();
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to cancel item.");
        } finally {
            setCancellingItem(null);
            setItemToDelete(null);
        }
    }

    const formatCurrency = (val: number) => `Rs. ${Number(val).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "pending": return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>
            case "partially_delivered": return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Partial</Badge>
            case "closed": return <Badge className="bg-green-100 text-green-700 border-green-200">Closed</Badge>
            case "cancelled": return <Badge variant="destructive">Cancelled</Badge>
            default: return <Badge variant="outline">{status}</Badge>
        }
    }

    if (!poId) return null

    // Calculate dynamic aggregates from items array if it exists
    const hasItems = po?.items && Array.isArray(po.items) && po.items.length > 0;

    const totalDeliveredAmount = hasItems
        ? po.items.reduce((acc: number, item: any) =>
            acc + (Math.min(Number(item.delivered_quantity || 0), Number(item.ordered_quantity || 0)) * Number(item.rate_per_liter)), 0)
        : Number(po?.delivered_amount || 0)

    const totalHoldAmount = hasItems
        ? po.po_hold_records?.reduce((acc: number, hold: any) => acc + Number(hold.hold_amount), 0) || Number(po?.hold_amount || 0)
        : Number(po?.hold_amount || 0)

    // Apply Focused View Logic if deliveryId is provided
    let displayItems = hasItems ? po.items : [];
    let displayDeliveries = po?.deliveries || [];
    let displayHolds = po?.po_hold_records || [];
    let focusedTitle = "Purchase Order Details";
    let displayEstimatedTotal = po?.estimated_total || 0;
    let displayDeliveredValue = totalDeliveredAmount;

    if (deliveryId && po) {
        focusedTitle = "Delivery Transaction Details";
        const focusedDel = po.deliveries?.find((d: any) => d.id === deliveryId);

        if (focusedDel) {
            const invoiceNum = focusedDel.company_invoice_number;
            displayDeliveries = invoiceNum
                ? po.deliveries.filter((d: any) => d.company_invoice_number === invoiceNum)
                : po.deliveries.filter((d: any) => !d.company_invoice_number || d.company_invoice_number === "" || d.company_invoice_number === "N/A");

            // Scope items to what was actually in these deliveries
            if (hasItems) {
                displayItems = po.items.map((item: any, idx: number) => {
                    // Find if any of our focused deliveries recorded this item
                    const recordedInThisTrans = displayDeliveries.find((d: any) => d.po_item_index === idx);
                    if (recordedInThisTrans) {
                        return {
                            ...item,
                            original_index: idx,
                            delivered_quantity: recordedInThisTrans.delivered_quantity,
                            total_amount: Number(recordedInThisTrans.delivered_amount || (Math.min(Number(recordedInThisTrans.delivered_quantity), Number(item.ordered_quantity)) * Number(item.rate_per_liter))),
                            tank_distribution: recordedInThisTrans.tank_distribution // Copy over the array for visual rendering
                        };
                    }
                    return {
                        ...item,
                        original_index: idx,
                        delivered_quantity: 0,
                        total_amount: 0,
                        tank_distribution: null
                    };
                });

                displayDeliveredValue = displayItems.reduce((acc: number, item: any) => acc + (Number(item.total_amount || 0)), 0);
                // For focused transaction, we might want to show the transaction total as "Total Value" or stick to PO total.
                // The user's screenshot showed PO total (5500), so we keep displayEstimatedTotal as po.estimated_total.
            } else {
                // Legacy single-item PO logic
                const totalDeliveredInTrans = displayDeliveries.reduce((acc: number, d: any) => acc + Number(d.delivered_quantity || 0), 0);
                const totalAmountInTrans = displayDeliveries.reduce((acc: number, d: any) => acc + Number(d.delivered_amount || 0), 0);

                const aggregatedTanks = displayDeliveries.reduce((acc: any, d: any) => {
                    if (d.tank_distribution && Array.isArray(d.tank_distribution)) {
                        d.tank_distribution.forEach((td: any) => {
                            if (td.tank_name && td.quantity > 0) {
                                acc[td.tank_name] = (acc[td.tank_name] || 0) + Number(td.quantity);
                            }
                        });
                    }
                    return acc;
                }, {});

                const tankDistArray = Object.keys(aggregatedTanks).length > 0
                    ? Object.entries(aggregatedTanks).map(([tank_name, quantity]) => ({ tank_name, quantity }))
                    : null;

                displayItems = [{
                    product_id: po.product_id,
                    product_name: po.products?.name || "Product",
                    product_category: po.product_type,
                    ordered_quantity: po.ordered_quantity,
                    delivered_quantity: totalDeliveredInTrans,
                    rate_per_liter: po.rate_per_liter || (po.ordered_quantity > 0 ? po.estimated_total / po.ordered_quantity : 0),
                    total_amount: totalAmountInTrans,
                    unit_type: po.unit_type,
                    tank_distribution: tankDistArray,
                    original_index: -1 // special index for legacy
                }];
                displayDeliveredValue = totalAmountInTrans;
            }

            // Scope holds to all deliveries in this transition
            const delIds = displayDeliveries.map((d: any) => d.id);
            displayHolds = po.po_hold_records?.filter((h: any) => delIds.includes(h.delivery_id)) || [];
        }
    }

    // Final Items to Display
    let mappedItems = displayItems;
    if (deliveryId) {
        mappedItems = displayItems.filter((item: any) =>
            Number(item.delivered_quantity || 0) > 0 || item.status === 'cancelled'
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between font-black uppercase tracking-wider text-xl">
                        {focusedTitle}
                    </DialogTitle>
                </DialogHeader>

                {loading || !po ? (
                    <div className="flex items-center justify-center w-full h-48">
                        <BrandLoader />
                    </div>
                ) : (
                    <div className="space-y-4 py-1">
                        {/* Section 1: Order Information */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase font-bold text-primary">PO Number</p>
                                <p className="font-mono font-bold text-lg">{po.po_number}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground uppercase font-bold text-primary mb-1">Status</p>
                                {getStatusBadge(po.status)}
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase font-bold text-primary">Supplier</p>
                                <p className="font-bold">{po.suppliers?.name || "Unknown"}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground uppercase font-bold text-primary">Expected Delivery</p>
                                <p className="font-medium text-sm">{format(new Date(po.expected_delivery_date), "PPP")}</p>
                            </div>
                        </div>

                        {/* Section 2: Products Ordered */}
                        <div className="border rounded-md overflow-hidden text-sm bg-white">
                            <h4 className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground bg-slate-50 p-2 border-b flex items-center">
                                Products Ordered
                            </h4>
                            <div className="overflow-x-auto p-2">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="w-[300px] text-xs font-bold text-slate-500 uppercase h-8 py-1">Product</TableHead>
                                            <TableHead className="text-right text-xs font-bold text-slate-500 uppercase h-8 py-1 whitespace-nowrap">Ordered</TableHead>
                                            <TableHead className="text-right text-xs font-bold text-slate-500 uppercase h-8 py-1 whitespace-nowrap">Received</TableHead>
                                            <TableHead className="text-right text-xs font-bold text-slate-500 uppercase h-8 py-1 whitespace-nowrap">Date</TableHead>
                                            <TableHead className="text-right text-xs font-bold text-slate-500 uppercase h-8 py-1 whitespace-nowrap">Price / Rate</TableHead>
                                            <TableHead className="text-right text-xs font-bold text-slate-500 uppercase h-8 py-1 whitespace-nowrap">Total Value</TableHead>
                                            <TableHead className="w-12"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {mappedItems.length > 0 ? mappedItems.map((item: any, idx: number) => {
                                            const originalIdx = item.original_index ?? idx;
                                            const itemDelivery = po.deliveries?.find((d: any) => d.po_item_index === originalIdx) ||
                                                (originalIdx === -1 && displayDeliveries?.[0] ? displayDeliveries[0] : null);
                                            return (
                                                <TableRow key={idx} className={item.status === 'cancelled' ? 'opacity-50 grayscale' : ''}>
                                                    <TableCell className="py-2">
                                                        <div className="flex flex-col">
                                                            <div className="flex gap-2 items-center">
                                                                <span className={`font-bold text-sm ${item.status === 'cancelled' ? 'line-through text-muted-foreground' : ''}`}>{item.product_name || "Unknown Product"}</span>
                                                                {item.status === 'cancelled' && <Badge variant="destructive" className="h-4 px-1 pb-0 scale-90">Cancelled</Badge>}
                                                            </div>
                                                            <span className="text-xs text-muted-foreground capitalize">{item.product_category?.replace("_", " ")}</span>

                                                            {item.tank_distribution ? (
                                                                (Array.isArray(item.tank_distribution) && item.tank_distribution.length > 0) && (
                                                                    <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                                                                        {item.tank_distribution.map((td: any, i: number) => (
                                                                            <Badge key={i} variant="outline" className="bg-slate-50 text-slate-600 font-mono py-0 h-4 px-1 rounded-sm border-slate-200">
                                                                                {td.tank_name}: {Number(td.quantity).toLocaleString()}L
                                                                            </Badge>
                                                                        ))}
                                                                    </div>
                                                                )
                                                            ) : (
                                                                (itemDelivery?.tank_distribution && Array.isArray(itemDelivery.tank_distribution) && itemDelivery.tank_distribution.length > 0) && (
                                                                    <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                                                                        {itemDelivery.tank_distribution.map((td: any, i: number) => (
                                                                            <Badge key={i} variant="outline" className="bg-slate-50 text-slate-600 font-mono py-0 h-4 px-1 rounded-sm border-slate-200">
                                                                                {td.tank_name}: {Number(td.quantity).toLocaleString()}L
                                                                            </Badge>
                                                                        ))}
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right py-2 font-medium">
                                                        {Number(item.ordered_quantity).toLocaleString()} {item.unit_type === 'liter' ? 'L' : 'U'}
                                                    </TableCell>
                                                    <TableCell className="text-right py-2 font-bold text-green-600">
                                                        {Number(item.delivered_quantity || 0).toLocaleString()} {item.unit_type === 'liter' ? 'L' : 'U'}
                                                    </TableCell>
                                                    <TableCell className="text-right py-2 text-xs text-muted-foreground whitespace-nowrap">
                                                        {itemDelivery ? format(new Date(itemDelivery.delivery_date), "dd/MM/yy") : "-"}
                                                    </TableCell>
                                                    <TableCell className="text-right py-2 font-medium text-slate-600">
                                                        {item.rate_per_liter ? formatCurrency(item.rate_per_liter) : "-"}
                                                    </TableCell>
                                                    <TableCell className="text-right py-2 font-mono font-bold text-slate-800">
                                                        {formatCurrency(item.total_amount)}
                                                    </TableCell>
                                                    <TableCell className="py-2 text-right">
                                                        {po.status === 'pending' && item.status !== 'cancelled' && (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <button
                                                                        disabled={cancellingItem === item.product_id}
                                                                        onClick={() => setItemToDelete({ id: item.product_id, name: item.product_name })}
                                                                        className="text-destructive hover:bg-destructive/10 p-1 rounded-md transition-colors"
                                                                    >
                                                                        {cancellingItem === item.product_id ? <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" /> : <Trash2 className="h-4 w-4" />}
                                                                    </button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Cancel this Item</TooltipContent>
                                                            </Tooltip>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        }) : (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                                                    No items recorded in this transaction.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                                            <TableCell colSpan={4} className="text-right font-bold text-xs uppercase py-2">Total Estimated Order Value</TableCell>
                                            <TableCell className="text-right py-2 font-mono font-black text-primary border-l text-base">
                                                {formatCurrency(displayEstimatedTotal)}
                                            </TableCell>
                                            <TableCell></TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        {/* Section 3: Delivery Details (if deliveries exist) */}
                        {displayDeliveries && displayDeliveries.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                    {deliveryId ? "Transaction Record" : "Delivery Records"}
                                </h4>
                                <div className="space-y-2">
                                    {displayDeliveries.map((del: any) => (
                                        <div key={del.id} className="bg-white border rounded-lg p-3 text-xs grid grid-cols-2 md:grid-cols-6 gap-3">
                                            <div>
                                                <p className="text-[9px] text-muted-foreground uppercase font-bold">Delivery #</p>
                                                <p className="font-mono font-bold">{del.delivery_number || `DEL-${del.id.substring(0, 4)}`}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-muted-foreground uppercase font-bold">Date</p>
                                                <p className="font-medium">{format(new Date(del.delivery_date), "MMM d, yyyy")}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-muted-foreground uppercase font-bold">Invoice #</p>
                                                <p className="font-mono">{del.company_invoice_number}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-muted-foreground uppercase font-bold">Vehicle</p>
                                                <p>{del.vehicle_number || "-"}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-muted-foreground uppercase font-bold">Driver</p>
                                                <p>{del.driver_name || "-"}</p>
                                            </div>
                                            <div className="col-span-3">
                                                <p className="text-[10px] text-muted-foreground uppercase font-bold">Notes</p>
                                                <p className="truncate">{del.notes || "-"}</p>
                                            </div>
                                            {del.tank_distribution && Array.isArray(del.tank_distribution) && del.tank_distribution.length > 0 && (
                                                <div className="col-span-2 md:col-span-6 mt-2 pt-2 border-t text-xs">
                                                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1 border-b pb-1">Tank Distribution</p>
                                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                                        {del.tank_distribution.map((td: any, idx: number) => (
                                                            <div key={idx} className="flex gap-2">
                                                                <span className="font-semibold text-slate-700">{td.tank_name || "Unknown Tank"}:</span>
                                                                <span className="font-mono">{Number(td.quantity).toLocaleString()} L</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Section 4: Hold Information */}
                        {displayHolds && displayHolds.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="font-bold text-[10px] uppercase tracking-wider text-amber-600 flex items-center gap-2">
                                    Hold Information
                                </h4>
                                <div className="space-y-2">
                                    {displayHolds.map((hold: any) => (
                                        <div key={hold.id} className="bg-amber-50/50 border border-amber-200 rounded-lg p-3 text-xs grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div>
                                                <p className="text-[10px] text-amber-700 uppercase font-bold">Hold Amount</p>
                                                <p className="font-mono font-bold text-amber-700">{formatCurrency(hold.hold_amount)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-amber-700 uppercase font-bold">Hold Qty</p>
                                                <p className="font-bold text-amber-700">{Number(hold.hold_quantity).toLocaleString()} {po.unit_type === 'unit' ? 'Units' : 'L'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-amber-700 uppercase font-bold">Status</p>
                                                <Badge variant={hold.status === 'released' ? 'default' : 'outline'} className={hold.status === 'on_hold' ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-green-100 text-green-700 border-green-300'}>
                                                    {hold.status.replace("_", " ")}
                                                </Badge>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-amber-700 uppercase font-bold">Expected Return</p>
                                                <p className="font-medium text-amber-700">{format(new Date(hold.expected_return_date), "MMM d, yyyy")}</p>
                                            </div>
                                            {hold.actual_return_date && (
                                                <div className="col-span-4 mt-2 pt-2 border-t border-amber-200">
                                                    <p className="text-xs text-green-700 font-bold">
                                                        Hold was released and credited to account on {format(new Date(hold.actual_return_date), "MMMM d, yyyy")}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Section 5: Payment Summary */}
                        <div className="bg-slate-900 text-white p-4 rounded-lg space-y-2 mt-4 ml-auto w-full md:w-80">
                            <h4 className="font-bold text-[10px] uppercase tracking-widest text-slate-400 mb-2">Financial Summary</h4>
                            <div className="flex justify-between items-center text-sm border-b border-slate-700/50 pb-2 mb-2">
                                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-tight">
                                    {deliveryId ? "Current Transaction" : "Total Order Position"}
                                </span>
                            </div>

                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">
                                    {deliveryId ? "Items Value" : "Expected Order Value"}
                                </span>
                                <span className="font-mono font-bold">
                                    {deliveryId
                                        ? formatCurrency(mappedItems.reduce((acc: number, item: any) => acc + (Number(item.ordered_quantity) * Number(item.rate_per_liter)), 0))
                                        : formatCurrency(displayEstimatedTotal)
                                    }
                                </span>
                            </div>

                            <div className="flex justify-between items-center text-sm border-b border-slate-700 pb-2">
                                <span className="text-green-400">- Received / Debited Value</span>
                                <span className="font-mono font-bold text-green-400">-{formatCurrency(displayDeliveredValue)}</span>
                            </div>

                            <div className="flex justify-between items-center text-lg mt-2 pt-2">
                                <span className="uppercase text-amber-500 text-xs font-bold tracking-tight self-center">
                                    = Amount On Hold
                                </span>
                                <span className="font-mono font-black text-amber-500">
                                    {formatCurrency(
                                        deliveryId
                                            ? displayHolds.reduce((acc: number, h: any) => acc + Number(h.hold_amount), 0)
                                            : (displayEstimatedTotal - displayDeliveredValue)
                                    )}
                                </span>
                            </div>

                            {po.po_hold_records?.some((h: any) => h.status === 'released') && (
                                <div className="mt-2 pt-2 border-t border-slate-700/50 flex justify-between text-[10px] items-center text-blue-400 opacity-80">
                                    <span className="flex items-center gap-1 uppercase tracking-wider font-bold">Total Hold Released</span>
                                    <span className="font-mono font-bold">+{formatCurrency(
                                        po.po_hold_records.filter((h: any) => h.status === 'released').reduce((acc: number, h: any) => acc + Number(h.hold_amount), 0)
                                    )}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )
                }
            </DialogContent >

            {/* Delete Confirmation Modal */}
            <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will cancel <strong>{itemToDelete?.name}</strong> from this purchase order. This action cannot be undone.
                            If this is the only remaining item, the entire Purchase Order will be marked as cancelled.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={!!cancellingItem}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleConfirmCancel();
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={!!cancellingItem}
                        >
                            {cancellingItem ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Cancel Item
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

        </Dialog >
    )
}
