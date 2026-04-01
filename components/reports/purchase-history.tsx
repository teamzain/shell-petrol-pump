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
    const [summaryStats, setSummaryStats] = useState({
        totalOrderValue: 0,
        totalArrivalValue: 0,
        totalOrders: 0,
        totalOnHold: 0,
        totalReleased: 0,
        totalPaid: 0,
        totalDues: 0
    })
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

                // 4. Fetch Card Hold Records for refunds/rebates
                let cardHoldQuery = supabase
                    .from("card_hold_records")
                    .select("*, supplier_cards!inner(supplier_id)")
                    .gte("sale_date", fromDate)
                    .lte("sale_date", toDate)

                if (filters.supplierId !== "all") {
                    cardHoldQuery = cardHoldQuery.eq("supplier_cards.supplier_id", filters.supplierId)
                }

                const [poRes, pendingPoRes, delRes, cardHoldRes] = await Promise.all([
                    poQuery, 
                    pendingPoQuery, 
                    delQuery,
                    cardHoldQuery
                ])

                if (poRes.error) console.error("PO Fetch Error:", poRes.error)
                if (pendingPoRes.error) console.error("Pending PO Fetch Error:", pendingPoRes.error)
                if (delRes.error) console.error("Del Fetch Error:", delRes.error)
                if (cardHoldRes.error) console.error("Card Hold Fetch Error:", cardHoldRes.error)

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
                                id: del.id,
                                display_date: del.delivery_date,
                                invoice_number: del.company_invoice_number || del.delivery_number,
                                po_number: poData?.po_number,
                                supplier_name: del.suppliers?.name || poData?.suppliers?.name,
                                total_amount: 0,
                                order_value: Number(poData?.estimated_total || 0),
                                hold_amount: 0,
                                release_amount: 0,
                                net_paid: 0,
                                status: 'STOCK ARRIVAL',
                                type: 'delivery',
                                payment_method: poData?.payment_method || 'Supp. Acc.',
                                items: [],
                                paid_amount: 0,
                                due_amount: 0,
                                quantity: 0,
                                ordered_quantity: 0,
                                hold_quantity: 0,
                                purchase_price_per_unit: del.rate_per_liter || poData?.rate_per_liter || 0,
                                po_hold_records: []
                            }
                        }
                        const amount = Number(del.delivered_amount || (del.delivered_quantity * (poData?.rate_per_liter || 0)))
                        acc[key].total_amount += amount

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
                                if (h.status === 'on_hold') {
                                    acc[key].hold_amount += Number(h.hold_amount || 0);
                                } else if (h.status === 'released') {
                                    acc[key].release_amount += Number(h.hold_amount || 0);
                                }
                                acc[key].hold_quantity += Number(h.hold_quantity || 0);
                                if (!acc[key].po_hold_records) acc[key].po_hold_records = [];
                                acc[key].po_hold_records.push(h);
                            });
                        }

                        // Calculate net_paid for this row (Order Baseline - Resolved Refunds)
                        acc[key].net_paid = acc[key].order_value - acc[key].release_amount;
                        
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

                // Calculate Summary Statistics for the period based on base data
                // 1. Total Order Value (Sum of all POs created in this period)
                const totalOrderValue = (poRes.data || []).reduce((sum: number, po: any) => sum + Number(po.estimated_total || 0), 0)
                const totalOrdersCount = (poRes.data || []).length

                // 2. Total Arrivals (Actual stock delivered in this period)
                const totalArrivalValue = (delRes.data || []).reduce((sum: number, d: any) => {
                    const poData = d.purchase_orders;
                    const amount = Number(d.delivered_amount || (Number(d.delivered_quantity || 0) * (poData?.rate_per_liter || 0)))
                    return sum + amount
                }, 0)

                // 3. Total On Hold (Active PO shortages + Pending Card holds)
                const poOnHold = (delRes.data || []).reduce((sum: number, d: any) => {
                    const holdAmount = (d.po_hold_records || []).filter((h: any) => h.status === 'on_hold').reduce((s: number, h: any) => s + Number(h.hold_amount || 0), 0)
                    return sum + holdAmount
                }, 0)
                const cardOnHold = (cardHoldRes.data || []).filter((h: any) => h.status !== 'released').reduce((sum: number, h: any) => sum + Number(h.hold_amount || 0), 0)
                const totalOnHold = poOnHold + cardOnHold

                // 4. Total Released (Resolved PO shortages + Released Card holds) - This is money back
                const poReleased = (delRes.data || []).reduce((sum: number, d: any) => {
                    const releasedAmount = (d.po_hold_records || []).filter((h: any) => h.status === 'released').reduce((s: number, h: any) => s + Number(h.hold_amount || 0), 0)
                    return sum + releasedAmount
                }, 0)
                const cardReleased = (cardHoldRes.data || []).filter((h: any) => h.status === 'released').reduce((sum: number, h: any) => sum + Number(h.hold_amount || 0), 0)
                const totalReleased = poReleased + cardReleased

                // 5. Net Paid (Order Value - Released refunds/adjustments)
                // Since user pays upfront, Net Paid is the original cost minus what was returned.
                const totalPaid = totalOrderValue - totalReleased

                const stats = {
                    totalOrderValue,
                    totalArrivalValue,
                    totalOrders: totalOrdersCount,
                    totalOnHold,
                    totalReleased,
                    totalPaid,
                    totalDues: 0
                }

                setSummaryStats(stats)

                onDataLoaded?.({
                    orders: allRecords,
                    ...stats
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

    // Final summary count from the tracked data
    const totalDues = 0

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
                <Card className="border-l-4 border-l-slate-700 shadow-sm overflow-hidden">
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 truncate">
                            <Package className="h-3.5 w-3.5 text-slate-700" />
                            Purchase Orders
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-xl font-black tracking-tight">{summaryStats.totalOrders}</div>
                        <p className="text-[9px] text-muted-foreground flex items-center gap-1 mt-0.5 font-medium truncate">
                            <Calendar className="h-2.5 w-2.5" /> Total created
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-primary shadow-sm bg-primary/5 overflow-hidden">
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5 truncate">
                            <ShoppingCart className="h-3.5 w-3.5 text-primary" />
                            Total Order Value
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-xl font-black text-primary tracking-tight">Rs. {summaryStats.totalOrderValue.toLocaleString()}</div>
                        <p className="text-[9px] text-primary/70 font-bold uppercase mt-0.5 truncate">Upfront Cost</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-orange-500 shadow-sm bg-orange-50/10 overflow-hidden">
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 truncate">
                            <Truck className="h-3.5 w-3.5 text-orange-500" />
                            Total Arrivals
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-xl font-black tracking-tight">Rs. {summaryStats.totalArrivalValue.toLocaleString()}</div>
                        <p className="text-[9px] text-muted-foreground flex items-center gap-1 mt-0.5 font-bold truncate">Gross Delivered</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-amber-500 shadow-sm bg-amber-500/5 overflow-hidden">
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1.5 truncate">
                            <Clock className="h-3.5 w-3.5 text-amber-500" />
                            Total On Hold
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-xl font-black text-amber-700 tracking-tight">Rs. {summaryStats.totalOnHold.toLocaleString()}</div>
                        <p className="text-[9px] text-amber-600/70 font-bold uppercase mt-0.5 truncate">Pending Refunds</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-indigo-500 shadow-sm bg-indigo-500/5 overflow-hidden">
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5 truncate">
                            <RefreshCw className="h-3.5 w-3.5 text-indigo-500" />
                            Total Released
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-xl font-black text-indigo-700 tracking-tight">Rs. {summaryStats.totalReleased.toLocaleString()}</div>
                        <p className="text-[9px] text-indigo-600/70 font-bold uppercase mt-0.5 truncate">Resolved Refunds</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-emerald-500 shadow-sm bg-emerald-500/5 overflow-hidden">
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1.5 truncate">
                            <Banknote className="h-3.5 w-3.5 text-emerald-500" />
                            Net Paid
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-xl font-black text-emerald-700 tracking-tight">Rs. {summaryStats.totalPaid.toLocaleString()}</div>
                        <p className="text-[9px] text-emerald-600/70 font-bold uppercase mt-0.5 text-[10px] truncate">Actual Net Cost</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-rose-500 shadow-sm bg-rose-500/5 overflow-hidden">
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 truncate">
                            <ShieldCheck className="h-3.5 w-3.5 text-rose-500" />
                            Outstanding Dues
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-xl font-black text-rose-700 tracking-tight">Rs. {summaryStats.totalDues.toLocaleString()}</div>
                        <p className="text-[9px] text-rose-600/70 font-bold uppercase mt-0.5 truncate">Balance Dues</p>
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
                                    <TableHead className="text-right whitespace-nowrap">Order Value</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">Arrival Value</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">Hold/Release</TableHead>
                                    <TableHead className="text-right whitespace-nowrap text-emerald-600">Net Paid</TableHead>
                                    <TableHead className="text-center whitespace-nowrap">Status</TableHead>
                                    <TableHead className="text-center whitespace-nowrap">Payment</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orders.length === 0 ? (
                                    <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No purchases found</TableCell></TableRow>
                                ) : (
                                    orders.map((order: any) => {
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
                                                    <TableCell className="text-right font-mono text-xs whitespace-nowrap text-muted-foreground font-semibold">
                                                        Rs. {(order.order_value || 0).toLocaleString()}
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold text-xs whitespace-nowrap text-primary">
                                                        Rs. {Number(order.total_amount).toLocaleString()}
                                                    </TableCell>
                                                    <TableCell className="text-right whitespace-nowrap">
                                                        <div className="flex flex-col items-end gap-0.5">
                                                            {order.hold_amount > 0 && (
                                                                <span className="text-[10px] font-bold text-amber-600 px-1 py-0.5 bg-amber-50 rounded border border-amber-100">
                                                                    -Rs. {order.hold_amount.toLocaleString()}
                                                                </span>
                                                            )}
                                                            {order.release_amount > 0 && (
                                                                <span className="text-[10px] font-bold text-indigo-600 px-1 py-0.5 bg-indigo-50 rounded border border-indigo-100">
                                                                    +Rs. {order.release_amount.toLocaleString()}
                                                                </span>
                                                            )}
                                                            {!(order.hold_amount > 0 || order.release_amount > 0) && (
                                                                <span className="text-[10px] text-muted-foreground opacity-40 italic">None</span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold text-xs whitespace-nowrap text-emerald-700">
                                                        Rs. {(order.net_paid || 0).toLocaleString()}
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
