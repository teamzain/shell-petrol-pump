"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { format } from "date-fns"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { 
    TrendingUp, 
    Fuel, 
    Package, 
    Banknote,
    ArrowUpRight,
    Search,
    Tag
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ReportFilter } from "@/app/dashboard/reports/page"

interface SalesReportProps {
    filters: ReportFilter
    onDetailClick: (item: any) => void
    onDataLoaded: (data: any) => void
}

export function SalesReport({ filters, onDetailClick, onDataLoaded }: SalesReportProps) {
    const [loading, setLoading] = useState(true)
    const [sales, setSales] = useState<any[]>([])
    const [searchTerm, setSearchTerm] = useState("")
    const [totalCardHolds, setTotalCardHolds] = useState(0)
    const supabase = createClient()

    useEffect(() => {
        const fetchSales = async () => {
            setLoading(true)
            try {
                const fromDate = format(filters.dateRange.from, "yyyy-MM-dd")
                const toDate = format(filters.dateRange.to, "yyyy-MM-dd")

                // 1. Fetch Fuel Sales (Nozzle Readings)
                let fuelQuery = supabase
                    .from("daily_sales")
                    .select(`
                        *,
                        nozzles:nozzle_id (
                            nozzle_number,
                            product_id,
                            products:product_id (name, type)
                        )
                    `)
                    .gte("sale_date", fromDate)
                    .lte("sale_date", toDate)

                if (filters.productId !== "all") {
                    // Find nozzles that belong to this product
                    const { data: nozzleIds } = await supabase
                        .from("nozzles")
                        .select("id")
                        .eq("product_id", filters.productId)
                    
                    const ids = (nozzleIds || []).map(n => n.id)
                    if (ids.length > 0) {
                        fuelQuery = fuelQuery.in("nozzle_id", ids)
                    } else if (filters.productType === 'fuel' || filters.productType === 'all') {
                        // If we are looking for a fuel product but no nozzles found, force empty
                        fuelQuery = fuelQuery.eq("nozzle_id", "00000000-0000-0000-0000-000000000000")
                    }
                }

                // 2. Fetch Manual Sales (Products/Lubricants)
                let manualQuery = supabase
                    .from("manual_sales")
                    .select(`
                        *,
                        discount_amount,
                        products:product_id (name, type, category)
                    `)
                    .gte("sale_date", fromDate)
                    .lte("sale_date", toDate)

                if (filters.productId !== "all") {
                    manualQuery = manualQuery.eq("product_id", filters.productId)
                }

                // 3. Fetch ALL Card Amount for the period (Bank + Shell)
                let cardHoldQuery = supabase
                    .from("card_hold_records")
                    .select("hold_amount")
                    .gte("sale_date", fromDate)
                    .lte("sale_date", toDate)

                // 4. Fetch Stock Movements for manual sales time matching
                let smQuery = supabase
                    .from("stock_movements")
                    .select("product_id, quantity, movement_date, movement_type, reference_number")
                    .eq("movement_type", "sale")
                    .gte("movement_date", fromDate)
                    .lte("movement_date", `${toDate}T23:59:59`)

                const [fuelRes, manualRes, cardHoldRes, smRes] = await Promise.all([fuelQuery, manualQuery, cardHoldQuery, smQuery])

                const fetchedCardTotal = (cardHoldRes.data || []).reduce((sum, r) => sum + (Number(r.hold_amount) || 0), 0)
                setTotalCardHolds(fetchedCardTotal)

                const stockMovements = smRes.data || []

                // Normalize Fuel Sales
                const normalizedFuel = (fuelRes.data || []).map(f => {
                    // Try to find matching movement for this fuel sale
                    const match = stockMovements.find(sm => 
                        sm.product_id === f.product_id && 
                        sm.reference_number === `Nozzle ${f.nozzles?.nozzle_number}` &&
                        sm.movement_date.startsWith(f.sale_date)
                    )

                    return {
                        ...f,
                        id: f.id,
                        date: f.sale_date,
                        timestamp: f.created_at || match?.movement_date || null,
                        type: "Fuel",
                        category: "fuel",
                        description: `Nozzle ${f.nozzles?.nozzle_number}`,
                        item_name: f.nozzles?.products?.name,
                        quantity: f.quantity,
                        unit: "L",
                        rate: f.unit_price || f.rate_per_liter,
                        total: f.revenue || f.total_amount,
                        discount: 0,
                        profit: f.gross_profit,
                        paid: f.revenue || f.total_amount, // Fuel sales are assumed mostly paid for this view
                        payment: f.payment_method || 'cash',
                        raw: f
                    }
                })

                // Normalize Manual Sales with matched time from stock_movements
                const normalizedManual = (manualRes.data || []).map(m => {
                    // Try to find the matching movement for this sale to get the time
                    const match = stockMovements.find(sm => 
                        sm.product_id === m.product_id && 
                        Math.abs(Number(sm.quantity)) === Number(m.quantity) &&
                        sm.movement_date.startsWith(m.sale_date)
                    )

                    return {
                        ...m,
                        id: m.id,
                        date: m.sale_date,
                        timestamp: m.created_at || match?.movement_date || null,
                        type: m.products?.type === 'oil' ? 'Lubricant' : (m.products?.type || 'Product'),
                        category: m.products?.type === 'fuel' ? 'fuel' : 'oil_lubricant', // For filtering compatibility
                        description: m.products?.name,
                        item_name: m.products?.name,
                        quantity: m.quantity,
                        unit: "Unit",
                        rate: m.unit_price,
                        total: m.total_amount,
                        discount: m.discount_amount || 0,
                        profit: m.profit,
                        paid: m.cash_payment_amount !== undefined ? (Number(m.cash_payment_amount || 0) + Number(m.card_payment_amount || 0)) : m.total_amount,
                        payment: m.payment_method,
                        raw: m
                    }
                })

                // Merge and filter by category if needed
                let allSales = [...normalizedFuel, ...normalizedManual]
                
                if (filters.productType !== "all") {
                    allSales = allSales.filter(s => s.category === filters.productType)
                }

                if (filters.paymentMethod !== "all") {
                    allSales = allSales.filter(s => s.payment === filters.paymentMethod)
                }

                // Sort by timestamp desc
                allSales.sort((a, b) => new Date(b.timestamp || b.date).getTime() - new Date(a.timestamp || a.date).getTime())

                setSales(allSales)
                onDataLoaded(allSales)
            } catch (error) {
                console.error("Error fetching sales report:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchSales()
    }, [filters, onDataLoaded, supabase])

    const filteredSales = useMemo(() => {
        if (!searchTerm) return sales
        const lower = searchTerm.toLowerCase()
        return sales.filter(s => 
            s.description.toLowerCase().includes(lower) || 
            s.item_name?.toLowerCase().includes(lower) ||
            s.type.toLowerCase().includes(lower)
        )
    }, [sales, searchTerm])

    const summary = useMemo(() => {
        return filteredSales.reduce((acc, s) => {
            acc.totalRevenue += Number(s.total) || 0
            acc.totalProfit += Number(s.profit) || 0
            acc.totalDue += (Number(s.total) || 0) - (Number(s.paid) || 0)
            acc.totalDiscount += Number(s.discount) || 0
            if (s.category === "fuel") acc.fuelRevenue += Number(s.total) || 0
            else acc.productRevenue += Number(s.total) || 0
            return acc
        }, { totalRevenue: 0, fuelRevenue: 0, productRevenue: 0, totalProfit: 0, totalDue: 0, totalDiscount: 0 })
    }, [filteredSales])

    const netSaleCash = summary.totalRevenue - totalCardHolds

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-32 w-full rounded-xl" />
                    ))}
                </div>
                <Skeleton className="h-[400px] w-full rounded-xl" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-blue-500 shadow-sm bg-blue-50/5">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Sales</p>
                                <h3 className="text-2xl font-bold mt-1">Rs. {summary.totalRevenue.toLocaleString()}</h3>
                            </div>
                            <div className="p-3 bg-blue-500/10 rounded-full">
                                <TrendingUp className="h-5 w-5 text-blue-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-orange-500 shadow-sm bg-orange-50/5">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fuel Revenue</p>
                                <h3 className="text-2xl font-bold mt-1">Rs. {summary.fuelRevenue.toLocaleString()}</h3>
                            </div>
                            <div className="p-3 bg-orange-500/10 rounded-full">
                                <Fuel className="h-5 w-5 text-orange-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-yellow-500 shadow-sm bg-yellow-50/5">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Discounts</p>
                                <h3 className="text-2xl font-bold mt-1 text-yellow-600">Rs. {summary.totalDiscount.toLocaleString()}</h3>
                            </div>
                            <div className="p-3 bg-yellow-500/10 rounded-full">
                                <Tag className="h-5 w-5 text-yellow-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-purple-500 shadow-sm bg-purple-50/5">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product Revenue</p>
                                <h3 className="text-2xl font-bold mt-1">Rs. {summary.productRevenue.toLocaleString()}</h3>
                            </div>
                            <div className="p-3 bg-purple-500/10 rounded-full">
                                <Package className="h-5 w-5 text-purple-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-rose-500 shadow-sm bg-rose-50/5">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Due</p>
                                <h3 className="text-2xl font-bold mt-1 text-rose-600">Rs. {summary.totalDue.toLocaleString()}</h3>
                            </div>
                            <div className="p-3 bg-rose-500/10 rounded-full">
                                <Banknote className="h-5 w-5 text-rose-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-emerald-500 shadow-sm bg-emerald-50/5">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estimated Profit</p>
                                <h3 className="text-2xl font-bold mt-1 text-emerald-600">Rs. {summary.totalProfit.toLocaleString()}</h3>
                            </div>
                            <div className="p-3 bg-emerald-500/10 rounded-full">
                                <ArrowUpRight className="h-5 w-5 text-emerald-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-cyan-500 shadow-sm bg-cyan-50/5">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Sale Cash</p>
                                <h3 className="text-2xl font-bold mt-1 text-cyan-600">Rs. {netSaleCash.toLocaleString()}</h3>
                                <p className="text-[10px] text-muted-foreground mt-1">Sales minus Card Holds Rs. {totalCardHolds.toLocaleString()}</p>
                            </div>
                            <div className="p-3 bg-cyan-500/10 rounded-full">
                                <Banknote className="h-5 w-5 text-cyan-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Sales Table */}
            <Card className="overflow-hidden border-none shadow-md">
                <CardHeader className="bg-muted/30 pb-4 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-lg">Recent Sales Transactions</CardTitle>
                        <CardDescription>Unified log of fuel and lubricant sales.</CardDescription>
                    </div>
                    <div className="relative w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search sales..."
                            className="pl-9 h-9 bg-background"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/10">
                                <TableHead>Date</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Quantity</TableHead>
                                <TableHead className="text-right">Rate</TableHead>
                                <TableHead className="text-right">Discount</TableHead>
                                <TableHead className="text-right">Net Total</TableHead>
                                <TableHead className="text-right">Paid</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                                <TableHead>Payment</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredSales.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground italic">
                                        No sales found for the selected period
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredSales.map((sale) => (
                                    <TableRow 
                                        key={sale.id} 
                                        className="cursor-pointer hover:bg-primary/5 transition-colors group"
                                        onClick={() => onDetailClick(sale.raw || sale)}
                                    >
                                        <TableCell className="font-medium text-xs">
                                            {format(new Date(sale.date), "dd MMM yyyy")}
                                            {(sale.timestamp || (sale.category === 'fuel' && sale.created_at)) && (
                                                <div className="text-[10px] text-muted-foreground">
                                                    {new Intl.DateTimeFormat('en-GB', { 
                                                        timeZone: 'Asia/Karachi', 
                                                        hour: 'numeric', 
                                                        minute: '2-digit', 
                                                        hour12: true 
                                                    }).format(new Date(sale.timestamp || sale.created_at))}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={sale.category === 'fuel' ? 'default' : 'secondary'} className="text-[10px] h-5 uppercase tracking-tighter">
                                                {sale.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-semibold text-sm">{sale.description}</div>
                                            <div className="text-[10px] text-muted-foreground">{sale.item_name}</div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-sm">
                                            {sale.quantity.toLocaleString()} {sale.unit}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                            Rs. {sale.rate?.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-xs">
                                            {sale.discount > 0 
                                                ? <span className="text-orange-600 font-semibold">- Rs. {sale.discount.toLocaleString()}</span>
                                                : <span className="text-muted-foreground">Rs. 0</span>
                                            }
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="font-bold text-sm">Rs. {sale.total?.toLocaleString()}</div>
                                            <div className="text-[10px] text-emerald-600 font-medium">Profit: {sale.profit?.toLocaleString()}</div>
                                        </TableCell>
                                        <TableCell className="text-right text-sm">
                                            Rs. {sale.paid?.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right text-sm font-bold">
                                            <span className={cn(
                                                (sale.total - (sale.paid || 0)) > 0 ? "text-red-500" : "text-muted-foreground"
                                            )}>
                                                Rs. {(sale.total - (sale.paid || 0)).toLocaleString()}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <div className={cn(
                                                    "w-2 h-2 rounded-full",
                                                    sale.payment === 'cash' ? "bg-emerald-500" : "bg-blue-500"
                                                )} />
                                                <span className="text-[11px] font-medium capitalize">{sale.payment}</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
