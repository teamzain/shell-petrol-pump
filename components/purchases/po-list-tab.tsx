"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Eye, Truck, XCircle, Filter, Calendar, Package, Trash2 } from "lucide-react"
import { getPurchaseOrders, cancelPurchaseOrder, updatePurchaseOrderDate, cancelPurchaseOrderItem } from "@/app/actions/purchase-orders"
import { toast } from "sonner"
import { BrandLoader } from "@/components/ui/brand-loader"
import { PODetailModal } from "./po-detail-modal"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface POListTabProps {
    onCreateDelivery: (po: any) => void
    dateFilters?: { from: string; to: string }
}

export function POListTab({ onCreateDelivery, dateFilters }: POListTabProps) {
    const [pos, setPos] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [statusFilter, setStatusFilter] = useState("pending")
    const [selectedPO, setSelectedPO] = useState<string | null>(null)
    const [rescheduleData, setRescheduleData] = useState<{ poId: string, itemIdx: number, poNum: string, date: string } | null>(null)
    const [isRescheduling, setIsRescheduling] = useState(false)
    const [systemActiveDate, setSystemActiveDate] = useState("")

    const fetchPOs = async () => {
        setLoading(true)
        try {
            const data = await getPurchaseOrders({
                status: statusFilter === 'all' ? undefined : statusFilter,
                date_from: dateFilters?.from,
                date_to: dateFilters?.to
            })
            setPos(data || [])
        } catch (error) {
            toast.error("Failed to fetch purchase orders")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        const fetchActiveDate = async () => {
            const { getSystemActiveDate } = await import("@/app/actions/balance")
            const date = await getSystemActiveDate()
            setSystemActiveDate(date)
        }
        fetchActiveDate()
    }, [])

    useEffect(() => {
        fetchPOs()
    }, [statusFilter, dateFilters])

    const filteredPOs = pos.filter(po =>
        po.po_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        po.suppliers?.name?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const handleReschedule = async () => {
        if (!rescheduleData) return;
        setIsRescheduling(true);
        try {
            // Note: server action `updatePurchaseOrderDate` needs to be updated to handle item array updating
            // We pass the index and the PO id
            await updatePurchaseOrderDate(rescheduleData.poId, rescheduleData.date, rescheduleData.itemIdx);
            toast.success("Delivery date updated successfully");
            setRescheduleData(null);
            fetchPOs();
        } catch (error: any) {
            toast.error(error.message || "Failed to reschedule dates");
        } finally {
            setIsRescheduling(false);
        }
    };

    const handleCancel = async (id: string) => {
        if (!confirm("Are you sure you want to cancel this entire PO?")) return
        try {
            await cancelPurchaseOrder(id)
            toast.success("PO cancelled")
            fetchPOs()
        } catch (error: any) {
            toast.error(error.message)
        }
    }

    const handleCancelItem = async (poId: string, productId: string) => {
        if (!confirm("Are you sure you want to cancel this item?")) return
        try {
            await cancelPurchaseOrderItem(poId, productId)
            toast.success("Item cancelled")
            fetchPOs()
        } catch (error: any) {
            toast.error(error.message)
        }
    }

    const getPOProducts = (po: any) => {
        if (po.items && Array.isArray(po.items) && po.items.length > 0) {
            return po.items.map((item: any, idx: number) => ({ ...item, _idx: idx }))
        }
        if (po.product_type && po.ordered_quantity) {
            return [{
                _idx: 0,
                product_id: null,
                product_name: po.product_type,
                product_type: po.product_type,
                product_category: ['petrol', 'diesel', 'high octane', 'cng'].includes(po.product_type?.toLowerCase()) ? 'fuel' : 'oil',
                ordered_quantity: po.ordered_quantity,
                rate_per_liter: po.rate_per_liter || 0,
                unit_type: po.unit_type || 'liter',
                total_amount: po.estimated_total || 0,
                delivered_quantity: po.delivered_quantity || 0,
                quantity_remaining: (po.ordered_quantity || 0) - (po.delivered_quantity || 0),
                status: po.is_closed ? 'delivered' : po.status === 'cancelled' ? 'cancelled' : 'pending',
                hold_amount: po.hold_amount || 0,
                is_legacy: true,
                expected_delivery_date: po.expected_delivery_date
            }]
        }
        return []
    }

    const derivePOStatus = (po: any) => {
        if (po.status === 'cancelled') return 'cancelled'
        if (po.is_closed) return 'delivered' // Fallback for legacy closed

        const items = getPOProducts(po)
        if (items.length === 0) return po.status || 'pending'

        const statuses = items.map((i: any) => i.status || 'pending')
        const allPending = statuses.every((s: string) => s === 'pending')
        const allDone = statuses.every((s: string) => s === 'delivered' || s === 'received' || s === 'cancelled')
        const anyRescheduled = statuses.some((s: string) => s === 'rescheduled' || s === 'scheduled')

        if (allDone) {
            // If everything is cancelled, it's cancelled, otherwise it's delivered
            return statuses.every((s: string) => s === 'cancelled') ? 'cancelled' : 'delivered'
        }
        if (anyRescheduled) return 'rescheduled'
        if (!allPending) return 'partial'

        return 'pending'
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "pending": return <Badge className="bg-amber-100 text-amber-700 border-amber-200 shadow-sm"><span className="mr-1">⏳</span> Pending</Badge>
            case "partial": return <Badge className="bg-blue-100 text-blue-700 border-blue-200 shadow-sm"><span className="mr-1">🔄</span> Partial</Badge>
            case "delivered": return <Badge className="bg-green-100 text-green-700 border-green-200 shadow-sm"><span className="mr-1">✅</span> Delivered</Badge>
            case "received": return <Badge className="bg-green-100 text-green-700 border-green-200 shadow-sm"><span className="mr-1">✅</span> Received</Badge>
            case "rescheduled": return <Badge className="bg-purple-100 text-purple-700 border-purple-200 shadow-sm"><span className="mr-1">📅</span> Rescheduled</Badge>
            case "scheduled": return <Badge className="bg-purple-100 text-purple-700 border-purple-200 shadow-sm"><span className="mr-1">📅</span> Scheduled</Badge>
            case "cancelled": return <Badge variant="destructive" className="shadow-sm"><span className="mr-1">❌</span> Cancelled</Badge>
            default: return <Badge variant="outline" className="shadow-sm">{status}</Badge>
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search PO# or Supplier..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[150px]">
                            <Filter className="mr-2 h-3 w-3" />
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="partial">Partial</SelectItem>
                            <SelectItem value="delivered">Delivered</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={fetchPOs} size="icon">
                        <Search className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="space-y-4">
                {loading ? (
                    <div className="flex items-center justify-center p-12 border rounded-xl bg-slate-50 border-dashed">
                        <BrandLoader size="lg" />
                    </div>
                ) : filteredPOs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 border rounded-xl bg-slate-50 border-dashed text-slate-500">
                        <Package className="h-12 w-12 mb-3 text-slate-300" />
                        <h4 className="font-bold text-lg">No Purchase Orders</h4>
                        <p className="text-sm">Try changing your filters or create a new PO.</p>
                    </div>
                ) : (
                    filteredPOs.map((po) => {
                        const items = getPOProducts(po)
                        const derivedStatus = derivePOStatus(po)
                        const poDate = new Date(po.expected_delivery_date || po.created_at).toLocaleDateString('en-GB').replace(/\//g, '-')

                        const displayItems = items.filter((item: any) => {
                            const isDelivered = item.status === 'delivered' || item.status === 'received';
                            if (statusFilter === 'delivered') return isDelivered;
                            // For pending/partial, we show all items in the PO to give context ("one delivered, one not")
                            // But we only show the PO itself if it has at least one pending item if statusFilter is 'pending'
                            return true;
                        });

                        const hasPendingItems = items.some((i: any) => i.status !== 'delivered' && i.status !== 'received' && i.status !== 'cancelled');
                        if ((statusFilter === 'pending' || statusFilter === 'partial') && !hasPendingItems) return null;

                        return (
                            <Card key={po.id} className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                <CardHeader className="bg-slate-50 py-3 border-b border-slate-100 flex flex-row items-center justify-between space-y-0">
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col">
                                            <span className="font-mono font-black text-sm text-primary">{po.po_number || 'PO-UNKNOWN'}</span>
                                            <span className="font-semibold text-xs text-slate-600">{po.suppliers?.name || "Unknown"}</span>
                                        </div>
                                        <div className="h-8 w-px bg-slate-200 mx-2 hidden sm:block"></div>
                                        <div className="flex flex-col hidden sm:flex">
                                            <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Order Date</span>
                                            <span className="text-xs font-semibold text-slate-700">{poDate}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col text-right">
                                            <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Total</span>
                                            <span className="font-black text-sm tracking-tight">PKR {Number(po.estimated_total || 0).toLocaleString()}</span>
                                        </div>
                                        {getStatusBadge(derivedStatus)}
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="bg-white overflow-x-auto">
                                        <Table>
                                            <TableHeader className="bg-slate-50 border-b border-slate-100">
                                                <TableRow className="hover:bg-transparent">
                                                    <TableHead className="w-[300px] text-xs font-bold text-slate-500 uppercase h-10">Product</TableHead>
                                                    <TableHead className="text-right text-xs font-bold text-slate-500 uppercase h-10 whitespace-nowrap">Total Amount</TableHead>
                                                    <TableHead className="text-center text-xs font-bold text-slate-500 uppercase h-10">Status</TableHead>
                                                    <TableHead className="text-right text-xs font-bold text-slate-500 uppercase h-10 w-[140px]">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {displayItems.map((item: any, idx: number) => {
                                                    const isDelivered = item.status === 'delivered' || item.status === 'received';
                                                    return (
                                                        <TableRow key={idx} className={`hover:bg-slate-50/50 ${isDelivered ? 'opacity-50 grayscale-[0.5] bg-slate-50/30' : ''}`}>
                                                            <TableCell className="py-3 align-top">
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold text-sm text-slate-900 flex items-center">
                                                                        {item.product_name} {item.is_legacy ? <Badge variant="secondary" className="ml-2 text-[8px] h-4">Legacy</Badge> : null}
                                                                    </span>
                                                                    <span className="text-xs text-muted-foreground font-medium mt-0.5">
                                                                        {Number(item.ordered_quantity).toLocaleString()}{item.unit_type === 'liter' ? 'L' : (item.unit_type || 'U')} @ PKR {Number(item.rate_per_liter).toLocaleString()}
                                                                    </span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-right py-3 align-top">
                                                                <span className="font-black text-sm text-primary py-1 px-2 rounded-md bg-primary/5 whitespace-nowrap">
                                                                    PKR {Number(item.total_amount).toLocaleString()}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="text-center py-3 align-top">
                                                                {getStatusBadge(item.status || 'pending')}
                                                            </TableCell>
                                                            <TableCell className="text-right py-3 align-top">
                                                                <div className="flex items-center justify-end gap-1">
                                                                    {item.status !== 'delivered' && item.status !== 'cancelled' && item.status !== 'received' && (
                                                                        <Button
                                                                            variant="default"
                                                                            size="sm"
                                                                            className="h-8 px-2 font-semibold bg-primary hover:bg-primary/90 rounded-md shrink-0 shadow-sm text-xs"
                                                                            onClick={() => {
                                                                                const poClone = { ...po, items: items }
                                                                                poClone.items[item._idx].status = 'pending'
                                                                                onCreateDelivery(poClone)
                                                                            }}
                                                                        >
                                                                            <Truck className="h-3 w-3 mr-1" /> Deliver
                                                                        </Button>
                                                                    )}

                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 rounded-full hover:bg-slate-200 text-slate-500 shrink-0 text-nowrap"
                                                                        title="Reschedule Item Delivery"
                                                                        onClick={() => setRescheduleData({ poId: po.id, itemIdx: item._idx, poNum: po.po_number, date: item.expected_delivery_date || po.expected_delivery_date })}
                                                                        disabled={item.status === 'delivered' || po.status === 'cancelled' || item.status === 'received'}
                                                                    >
                                                                        <Calendar className="h-4 w-4" />
                                                                    </Button>

                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 rounded-full hover:bg-red-50 text-red-500 shrink-0"
                                                                        title="Cancel Item"
                                                                        onClick={() => handleCancelItem(po.id, item.product_id)}
                                                                        disabled={item.status === 'delivered' || po.status === 'cancelled' || item.status === 'received'}
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })}
                                                {items.length === 0 && (
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="p-4 text-center text-sm text-muted-foreground italic">
                                                            No products found.
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                                <CardFooter className="bg-slate-50 border-t border-slate-100 py-2.5 px-4 flex justify-between items-center">
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Options</p>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            className="h-8 bg-white border border-slate-200 shadow-sm font-semibold hover:bg-slate-100"
                                            onClick={() => setSelectedPO(po.id)}
                                        >
                                            <Eye className="h-3 w-3 mr-1.5 text-blue-600" /> View Detail
                                        </Button>

                                        {derivedStatus !== 'delivered' && derivedStatus !== 'cancelled' && (
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                title="Cancel PO"
                                                onClick={() => handleCancel(po.id)}
                                            >
                                                <XCircle className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </CardFooter>
                            </Card>
                        )
                    })
                )}
            </div>

            <PODetailModal
                open={!!selectedPO}
                onOpenChange={(open) => !open && setSelectedPO(null)}
                poId={selectedPO}
            />

            <Dialog open={!!rescheduleData} onOpenChange={(open) => !open && setRescheduleData(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reschedule Item Delivery</DialogTitle>
                        <DialogDescription>
                            Change the expected delivery date for this specific item in <span className="font-mono font-bold">{rescheduleData?.poNum}</span>.
                        </DialogDescription>
                    </DialogHeader>
                    {rescheduleData && (
                        <div className="py-4">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">New Expected Delivery Date</label>
                            <Input
                                type="date"
                                value={rescheduleData.date || ''}
                                onChange={(e) => setRescheduleData({ ...rescheduleData, date: e.target.value })}
                                className="w-full h-10 rounded-xl bg-slate-50 border-slate-200 mt-1 font-bold"
                                min={systemActiveDate}
                            />
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setRescheduleData(null)} className="rounded-full">Cancel</Button>
                        <Button onClick={handleReschedule} disabled={isRescheduling} className="rounded-full bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-600/20 font-bold px-8">
                            {isRescheduling ? <BrandLoader size="sm" /> : "Save Date"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
