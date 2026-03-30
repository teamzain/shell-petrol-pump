"use client"

import React, { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ReportFilter } from "@/app/dashboard/reports/page"
import {
    ShoppingCart,
    Search,
    Calendar,
    CreditCard,
    FileText,
    Package,
    Clock,
    Truck,
    RefreshCw,
    Banknote,
    ShieldCheck
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"

export function PurchaseHistoryReport({ filters, onDetailClick, onDataLoaded }: {
    filters: ReportFilter,
    onDetailClick?: (item: any) => void,
    onDataLoaded?: (data: any) => void
}) {
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [orders, setOrders] = useState<any[]>([])
    const [expandedRows, setExpandedRows] = useState<string[]>([])

    const toggleRow = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setExpandedRows(prev => 
            prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
        )
    }

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            try {
                const fromDate = format(filters.dateRange.from, "yyyy-MM-dd")
                const toDate = format(filters.dateRange.to, "yyyy-MM-dd")

                // 1. Fetch Purchase Orders (Within range)
                let poQuery = supabase
                    .from("purchase_orders")
                    .select("*, suppliers(name, product_type), products(name, category)")
                    .gte("created_at", fromDate)
                    .lte("created_at", `${toDate}T23:59:59.999Z`)

                // 2. Fetch Pending/In-Progress POs (regardless of date) to ensure "not delivered" orders show up
                let pendingPoQuery = supabase
                    .from("purchase_orders")
                    .select("*, suppliers(name, product_type), products(name, category)")
                    .in("status", ["pending", "partially_delivered", "approved", "rescheduled"]) // Include all non-completed states
                
                if (filters.supplierId !== "all") {
                    poQuery = poQuery.eq("supplier_id", filters.supplierId)
                    pendingPoQuery = pendingPoQuery.eq("supplier_id", filters.supplierId)
                }
                
                // 3. Fetch Deliveries
                let delQuery = supabase
                    .from("deliveries")
                    .select("*, purchase_orders(*, products(name, category)), suppliers(name, product_type), po_hold_records(*)")
                    .gte("delivery_date", fromDate)
                    .lte("delivery_date", toDate)

                if (filters.supplierId !== "all") delQuery = delQuery.eq("supplier_id", filters.supplierId)

                const [poRes, pendingPoRes, delRes] = await Promise.all([poQuery, pendingPoQuery, delQuery])

                if (poRes.error) console.error("PO Fetch Error:", poRes.error)
                if (pendingPoRes.error) console.error("Pending PO Fetch Error:", pendingPoRes.error)
                if (delRes.error) console.error("Del Fetch Error:", delRes.error)

                const allRecords: any[] = []
                const addedPoIds = new Set<string>()
                const deliveredPoNumbers = new Set<string>()

                // Collect delivered PO numbers from the current delivery result
                if (delRes.data) {
                    delRes.data.forEach((d: any) => {
                        if (d.purchase_orders?.po_number) deliveredPoNumbers.add(d.purchase_orders.po_number)
                    })
                }

                // Process POs
                const processPo = (po: any) => {
                    if (addedPoIds.has(po.id)) return
                    
                    // If the order is fully delivered/completed, we don't show the "PO Created" row
                    // as the "Stock Arrival" row (Delivery) provides the necessary log entry.
                    if (po.status === 'completed' || po.status === 'delivered') return
                    
                    // Also skip if we already have a delivery row for this PO in the current set
                    if (deliveredPoNumbers.has(po.po_number)) return

                    addedPoIds.add(po.id)
                    allRecords.push({
                        id: po.id,
                        display_date: po.created_at,
                        invoice_number: po.po_number,
                        po_number: po.po_number,
                        supplier_name: po.suppliers?.name,
                        total_amount: Number(po.estimated_total || 0),
                        status: 'PO CREATED',
                        type: 'order',
                        payment_method: po.payment_method || 'N/A',
                        items: po.items, // JSONB items for detail modal
                        ordered_quantity: po.ordered_quantity,
                        rate_per_liter: po.rate_per_liter,
                        due_amount: Number(po.estimated_total || 0),
                        paid_amount: 0,
                        raw_data: po
                    })
                }

                if (poRes.data) poRes.data.forEach(processPo)
                if (pendingPoRes.data) pendingPoRes.data.forEach(processPo)

                // Process Deliveries (these are "Arrivals")
                if (delRes.data) {
                    // Group deliveries by PO+Invoice for the log
                    const grouped = delRes.data.reduce((acc: any, del: any) => {
                        const key = `del-${del.purchase_order_id}-${del.company_invoice_number || 'no-svc'}`
                        const poData = del.purchase_orders;
                        if (!acc[key]) {
                            acc[key] = {
                                id: del.id, // Use actual delivery ID
                                display_date: del.delivery_date,
                                invoice_number: del.company_invoice_number || del.delivery_number,
                                po_number: poData?.po_number,
                                supplier_name: del.suppliers?.name,
                                total_amount: 0,
                                status: 'STOCK ARRIVAL',
                                type: 'delivery',
                                payment_method: poData?.payment_method || 'Supp. Acc.',
                                items: [],
                                paid_amount: 0,
                                due_amount: 0,
                                quantity: 0,
                                ordered_quantity: 0,
                                hold_amount: 0,
                                hold_quantity: 0,
                                purchase_price_per_unit: del.rate_per_liter || poData?.rate_per_liter || 0,
                                po_hold_records: []
                            }
                        }
                        const amount = Number(del.delivered_amount || (del.delivered_quantity * (poData?.rate_per_liter || 0)))
                        acc[key].total_amount += amount
                        acc[key].paid_amount += amount
                        acc[key].quantity += Number(del.delivered_quantity || 0)
                        
                        // Get ordered quantity for this specific item from PO items
                        if (poData?.items && Array.isArray(poData.items) && del.po_item_index !== undefined) {
                            const poItem = poData.items[del.po_item_index];
                            if (poItem) {
                                acc[key].ordered_quantity += Number(poItem.ordered_quantity || 0);
                            }
                        }

                        // Add hold record info
                        if (del.po_hold_records && del.po_hold_records.length > 0) {
                            del.po_hold_records.forEach((h: any) => {
                                acc[key].hold_amount += Number(h.hold_amount || 0);
                                acc[key].hold_quantity += Number(h.hold_quantity || 0);
                                acc[key].po_hold_records.push(h);
                            });
                        }

                        acc[key].items.push({
                            product_name: del.product_name || poData?.product_type || "Unknown",
                            quantity: del.delivered_quantity,
                            ordered_quantity: (poData?.items && del.po_item_index !== undefined) ? poData.items[del.po_item_index]?.ordered_quantity : 0,
                            unit_type: del.unit_type || poData?.unit_type,
                            purchase_price_per_unit: del.rate_per_liter || poData?.rate_per_liter || 0,
                            total_amount: amount,
                            po_hold_record: del.po_hold_records?.[0] || null
                        })
                        return acc
                    }, {})
                    Object.values(grouped).forEach((d: any) => allRecords.push(d))
                }

                // Sort by date descending
                allRecords.sort((a, b) => new Date(b.display_date).getTime() - new Date(a.display_date).getTime())
                
                setOrders(allRecords)

                // Calculate calculations for export
                const deliveries = allRecords.filter(r => r.type === 'delivery')
                const totalValue = deliveries.reduce((sum: number, r: any) => sum + Number(r.total_amount || 0), 0)
                const totalOrdersCount = allRecords.filter(r => r.type === 'order').length
                
                const totalOnHold = deliveries.reduce((sum: number, o: any) => {
                    const holdAmount = (o.po_hold_records || []).filter((h: any) => h.status === 'on_hold').reduce((s: number, h: any) => s + Number(h.hold_amount || 0), 0)
                    return sum + holdAmount
                }, 0)

                const totalReleased = deliveries.reduce((sum: number, o: any) => {
                    const releasedAmount = (o.po_hold_records || []).filter((h: any) => h.status === 'released').reduce((s: number, h: any) => s + Number(h.hold_amount || 0), 0)
                    return sum + releasedAmount
                }, 0)

                const totalPaid = totalValue - totalOnHold
                const totalDues = 0

                onDataLoaded?.({
                    orders: allRecords,
                    totalValue,
                    totalOrders: totalOrdersCount,
                    totalOnHold,
                    totalReleased,
                    totalPaid,
                    totalDues
                })
            } catch (error) {
                console.error("Error fetching purchases:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [filters, supabase])

    if (loading) {
        return <Skeleton className="h-[400px] w-full rounded-xl" />
    }

    // Calculate Summary Stats
    const totalValue = orders.filter(o => o.type === 'delivery').reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
    const totalOrders = orders.filter(o => o.type === 'order').length
    
    // Calculate Hold & Released amounts
    const totalOnHold = orders.filter(o => o.type === 'delivery').reduce((sum, o) => {
        const holdAmount = (o.po_hold_records || []).filter((h: any) => h.status === 'on_hold').reduce((s: number, h: any) => s + Number(h.hold_amount || 0), 0)
        return sum + holdAmount
    }, 0)

    const totalReleased = orders.filter(o => o.type === 'delivery').reduce((sum, o) => {
        const releasedAmount = (o.po_hold_records || []).filter((h: any) => h.status === 'released').reduce((s: number, h: any) => s + Number(h.hold_amount || 0), 0)
        return sum + releasedAmount
    }, 0)

    const totalPaid = totalValue - totalOnHold // Assuming full payment minus active holds
    const totalDues = 0 // In this system, SUPP.ACC. is usually considered clear if no explicitly tracked aging dues

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <Card className="border-l-4 border-l-slate-700 shadow-sm">
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 line-clamp-1">
                            <Package className="h-3.5 w-3.5 text-slate-700" />
                            Orders Created
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-xl font-black tracking-tight">{totalOrders}</div>
                        <p className="text-[9px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Calendar className="h-2.5 w-2.5" /> This period
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-primary shadow-sm">
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 line-clamp-1">
                            <Truck className="h-3.5 w-3.5 text-primary" />
                            Delivered Value
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-xl font-black tracking-tight">Rs. {totalValue.toLocaleString()}</div>
                        <p className="text-[9px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <ShoppingCart className="h-2.5 w-2.5" /> Gross total
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-amber-500 shadow-sm bg-amber-500/5">
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1.5 line-clamp-1">
                            <Clock className="h-3.5 w-3.5 text-amber-500" />
                            Total On Hold
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-xl font-black text-amber-700 tracking-tight">Rs. {totalOnHold.toLocaleString()}</div>
                        <p className="text-[9px] text-amber-600/70 font-bold uppercase mt-0.5">Shortage Hold</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-indigo-500 shadow-sm bg-indigo-500/5">
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5 line-clamp-1">
                            <RefreshCw className="h-3.5 w-3.5 text-indigo-500" />
                            Total Released
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-xl font-black text-indigo-700 tracking-tight">Rs. {totalReleased.toLocaleString()}</div>
                        <p className="text-[9px] text-indigo-600/70 font-bold uppercase mt-0.5">Resolved Funds</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 line-clamp-1">
                            <Banknote className="h-3.5 w-3.5 text-emerald-500" />
                            Paid (Net)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-xl font-black text-emerald-600 tracking-tight">Rs. {totalPaid.toLocaleString()}</div>
                        <p className="text-[9px] text-emerald-600/70 font-bold uppercase mt-0.5">Final Payout</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-rose-500 shadow-sm bg-rose-500/5">
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 line-clamp-1">
                            <ShieldCheck className="h-3.5 w-3.5 text-rose-500" />
                            Outstanding Dues
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-xl font-black text-rose-700 tracking-tight">Rs. {totalDues.toLocaleString()}</div>
                        <p className="text-[9px] text-rose-600/70 font-bold uppercase mt-0.5">Balance Dues</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-bold">Purchase Log</CardTitle>
                    <CardDescription>Detailed list of all stock arrivals and orders</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="whitespace-nowrap">Date</TableHead>
                                    <TableHead className="whitespace-nowrap">Invoice #</TableHead>
                                    <TableHead className="whitespace-nowrap">Supplier</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">Total Amount</TableHead>
                                    <TableHead className="text-center whitespace-nowrap">Status</TableHead>
                                    <TableHead className="text-center whitespace-nowrap">Payment</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orders.length === 0 ? (
                                    <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No purchases found</TableCell></TableRow>
                                ) : (
                                    orders.map((order) => {
                                        const isExpanded = expandedRows.includes(order.id)
                                        return (
                                            <React.Fragment key={order.id}>
                                                <TableRow
                                                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                                                    onClick={() => {
                                                        if (order.type === 'order') {
                                                            onDetailClick?.({ ...order.raw_data, _type: 'purchase_order' })
                                                        } else {
                                                            // For deliveries, try to find the linked PO or just show the delivery
                                                            onDetailClick?.({ ...order, _type: 'delivery' })
                                                        }
                                                    }}
                                                >
                                                    <TableCell className="text-xs font-medium whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold">{format(new Date(order.display_date), "MMM dd, yyyy")}</span>
                                                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-tighter">
                                                                {order.type === 'order' ? 'PO Created' : 'Stock Arrival'}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        <div className="font-bold text-xs">{order.invoice_number || "N/A"}</div>
                                                        {order.type === 'delivery' && <div className="text-[10px] text-muted-foreground font-mono">{order.po_number}</div>}
                                                    </TableCell>
                                                    <TableCell className="text-xs whitespace-nowrap">{order.supplier_name}</TableCell>
                                                    <TableCell className="text-right font-bold text-xs whitespace-nowrap text-primary">
                                                        Rs. {Number(order.total_amount).toLocaleString()}
                                                    </TableCell>
                                                    <TableCell className="text-center whitespace-nowrap">
                                                        <Badge 
                                                            variant={order.type === 'order' ? 'secondary' : 'default'} 
                                                            className={`text-[10px] h-4 uppercase ${order.type === 'delivery' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-100 text-slate-700'}`}
                                                        >
                                                            {order.type === 'order' ? 'PO CREATED' : 'DELIVERED'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-center whitespace-nowrap">
                                                        <div className="flex flex-col items-center">
                                                            <Badge variant="outline" className="text-[10px] h-4 uppercase">
                                                                {order.payment_method || 'N/A'}
                                                            </Badge>
                                                            <span className="text-[9px] text-muted-foreground mt-0.5 opacity-50">Click for details</span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            </React.Fragment>
                                        )
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
