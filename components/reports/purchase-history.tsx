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
    Package
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
                    .select("*, purchase_orders(*, products(name, category)), suppliers(name, product_type)")
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
                                purchase_price_per_unit: del.rate_per_liter || poData?.rate_per_liter || 0
                            }
                        }
                        const amount = Number(del.delivered_amount || (del.delivered_quantity * (poData?.rate_per_liter || 0)))
                        acc[key].total_amount += amount
                        acc[key].paid_amount += amount
                        acc[key].quantity += Number(del.delivered_quantity || 0)
                        acc[key].items.push({
                            product_name: del.product_name || poData?.product_type || "Unknown",
                            quantity: del.delivered_quantity,
                            unit_type: del.unit_type || poData?.unit_type,
                            purchase_price_per_unit: del.rate_per_liter || poData?.rate_per_liter || 0,
                            total_amount: amount
                        })
                        return acc
                    }, {})
                    Object.values(grouped).forEach((d: any) => allRecords.push(d))
                }

                // Sort by date descending
                allRecords.sort((a, b) => new Date(b.display_date).getTime() - new Date(a.display_date).getTime())
                
                setOrders(allRecords)

                const totalValue = allRecords.reduce((sum: number, r: any) => sum + (r.type === 'delivery' ? r.total_amount : 0), 0)
                const totalOrdersCount = allRecords.filter(r => r.type === 'order').length

                onDataLoaded?.({
                    orders: allRecords,
                    totalValue,
                    totalOrders: totalOrdersCount
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

    const totalValue = orders.filter(o => o.type === 'delivery').reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
    const totalPaid = totalValue 
    const totalOrders = orders.filter(o => o.type === 'order').length

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-l-4 border-l-slate-700 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <Package className="h-4 w-4 text-slate-700" />
                            Total Orders Created
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black tracking-tight">{totalOrders}</div>
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> For selected period
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-primary shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <ShoppingCart className="h-4 w-4 text-primary" />
                            Total Delivered Value
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black tracking-tight">Rs. {totalValue.toLocaleString()}</div>
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            For selected period
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-emerald-500" />
                            Total Paid Amount
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-emerald-600 tracking-tight">Rs. {totalPaid.toLocaleString()}</div>
                        <p className="text-[10px] text-emerald-600/70 mt-1 font-medium">Payment cleared</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-destructive shadow-sm bg-destructive/[0.02]">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <FileText className="h-4 w-4 text-destructive" />
                            Outstanding Dues
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-destructive tracking-tight">Rs. {(totalValue - totalPaid).toLocaleString()}</div>
                        <p className="text-[10px] text-destructive/70 mt-1 font-medium">Pending balance</p>
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
