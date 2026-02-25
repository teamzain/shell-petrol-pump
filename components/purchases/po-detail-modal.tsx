"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { format } from "date-fns"
import { BrandLoader } from "../ui/brand-loader"
import { getPurchaseOrderDetail } from "@/app/actions/purchase-orders"

interface PODetailModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    poId: string | null
}

export function PODetailModal({
    open,
    onOpenChange,
    poId
}: PODetailModalProps) {
    const [loading, setLoading] = useState(false)
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
            acc + (Number(item.delivered_quantity || 0) * Number(item.rate_per_liter)), 0)
        : Number(po?.delivered_amount || 0)

    const totalHoldAmount = hasItems
        ? po.po_hold_records?.reduce((acc: number, hold: any) => acc + Number(hold.hold_amount), 0) || Number(po?.hold_amount || 0)
        : Number(po?.hold_amount || 0)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between font-black uppercase tracking-wider text-xl">
                        Purchase Order Details
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
                                            <TableHead className="text-right text-xs font-bold text-slate-500 uppercase h-8 py-1 whitespace-nowrap">Total Value</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {hasItems ? po.items.map((item: any, idx: number) => (
                                            <TableRow key={idx}>
                                                <TableCell className="py-2">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-sm">{item.product_name}</span>
                                                        <span className="text-xs text-muted-foreground">Rate: {formatCurrency(item.rate_per_liter)}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right py-2 font-medium">
                                                    {Number(item.ordered_quantity).toLocaleString()} {item.unit_type === 'liter' ? 'L' : 'U'}
                                                </TableCell>
                                                <TableCell className="text-right py-2 font-bold text-green-600">
                                                    {Number(item.delivered_quantity || 0).toLocaleString()} {item.unit_type === 'liter' ? 'L' : 'U'}
                                                </TableCell>
                                                <TableCell className="text-right py-2 font-mono font-bold text-primary">
                                                    {formatCurrency(item.total_amount)}
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell className="py-2">
                                                    <span className="font-bold text-sm">{po.products?.name || "Product"}</span>
                                                    <Badge variant="outline" className="ml-2 text-[10px]">{po.product_type}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right py-2 font-medium">
                                                    {Number(po.ordered_quantity).toLocaleString()} {po.unit_type === 'liter' ? 'L' : 'U'}
                                                </TableCell>
                                                <TableCell className="text-right py-2 font-bold text-green-600">
                                                    {Number(po.delivered_quantity || 0).toLocaleString()} {po.unit_type === 'liter' ? 'L' : 'U'}
                                                </TableCell>
                                                <TableCell className="text-right py-2 font-mono font-bold text-primary">
                                                    {formatCurrency(po.estimated_total)}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                                            <TableCell colSpan={3} className="text-right font-bold text-xs uppercase py-2">Total Estimated Order Value</TableCell>
                                            <TableCell className="text-right py-2 font-mono font-black text-primary border-l text-base">
                                                {formatCurrency(po.estimated_total)}
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        {/* Section 3: Delivery Details (if deliveries exist) */}
                        {po.deliveries && po.deliveries.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                    Delivery Records
                                </h4>
                                <div className="space-y-2">
                                    {po.deliveries.map((del: any) => (
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
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Section 4: Hold Information */}
                        {po.po_hold_records && po.po_hold_records.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="font-bold text-[10px] uppercase tracking-wider text-amber-600 flex items-center gap-2">
                                    Hold Information
                                </h4>
                                <div className="space-y-2">
                                    {po.po_hold_records.map((hold: any) => (
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
                        <div className="bg-slate-900 text-white p-3 rounded-lg space-y-1">
                            <h4 className="font-bold text-[10px] uppercase tracking-widest text-slate-400 mb-2">Payment Summary</h4>
                            <div className="flex justify-between text-xs items-center py-1">
                                <span className="text-slate-300 flex items-center gap-1">Company Account Debited</span>
                                <span className="font-mono font-bold text-green-400">-{formatCurrency(totalDeliveredAmount)}</span>
                            </div>
                            {totalHoldAmount > 0 && (
                                <div className="flex justify-between text-xs items-center py-1">
                                    <span className="text-slate-300 flex items-center gap-1">Hold Amount <span className="text-[9px] text-slate-500">(Not debited)</span></span>
                                    <span className="font-mono font-bold text-amber-400">{formatCurrency(totalHoldAmount)}</span>
                                </div>
                            )}
                            {po.po_hold_records?.some((h: any) => h.status === 'released') && (
                                <div className="mt-1 pt-2 border-t border-slate-700 flex justify-between text-xs items-center">
                                    <span className="text-slate-300 flex items-center gap-1">Total Hold Released <span className="text-[9px] text-slate-500">(Credited back)</span></span>
                                    <span className="font-mono font-bold text-blue-400">+{formatCurrency(
                                        po.po_hold_records.filter((h: any) => h.status === 'released').reduce((acc: number, h: any) => acc + Number(h.hold_amount), 0)
                                    )}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
