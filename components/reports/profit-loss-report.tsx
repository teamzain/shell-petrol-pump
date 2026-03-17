"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ReportFilter } from "@/app/dashboard/reports/page"
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    ShoppingCart,
    Receipt,
    Fuel,
    Droplets,
    PieChart,
    BarChart2,
    Package
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

export function ProfitLossReport({ filters, onDataLoaded }: {
    filters: ReportFilter,
    onDataLoaded?: (data: any) => void
}) {
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState<any>(null)

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            try {
                const fromDate = format(filters.dateRange.from, "yyyy-MM-dd")
                const toDate = format(filters.dateRange.to, "yyyy-MM-dd")

                // 1. Fetch Fuel Sales
                let fuelQuery = supabase
                    .from("daily_sales")
                    .select(`
                        revenue, cogs, gross_profit, quantity,
                        nozzles!inner(product_id)
                    `)
                    .gte("sale_date", fromDate)
                    .lte("sale_date", toDate)

                if (filters.productId !== "all") {
                    fuelQuery = fuelQuery.eq("nozzles.product_id", filters.productId)
                } else if (filters.productType === "oil_lubricant") {
                    // If filtering for only lubricants, return no fuel sales
                    fuelQuery = fuelQuery.eq("nozzles.product_id", "00000000-0000-0000-0000-000000000000")
                }

                const { data: fuelSales } = await fuelQuery

                // 2. Fetch Manual Sales (Lubricants)
                let manualQuery = supabase
                    .from("manual_sales")
                    .select("total_amount, profit, quantity, product_id")
                    .gte("sale_date", fromDate)
                    .lte("sale_date", toDate)

                if (filters.productId !== "all") {
                    manualQuery = manualQuery.eq("product_id", filters.productId)
                } else if (filters.productType === "fuel") {
                    // If filtering for only fuel, return no lubricant sales
                    manualQuery = manualQuery.eq("product_id", "00000000-0000-0000-0000-000000000000")
                }

                const { data: manualSales } = await manualQuery

                // 3. Fetch Expenses
                const { data: expenses } = await supabase
                    .from("expenses")
                    .select("amount")
                    .gte("expense_date", fromDate)
                    .lte("expense_date", toDate)

                // Calculate Totals
                const fuelRevenue = fuelSales?.reduce((sum, s) => sum + Number(s.revenue || 0), 0) || 0
                const fuelCost = fuelSales?.reduce((sum, s) => sum + Number(s.cogs || 0), 0) || 0
                const fuelProfit = fuelRevenue - fuelCost
                const fuelQty = fuelSales?.reduce((sum, s) => sum + Number(s.quantity || 0), 0) || 0

                const lubeRevenue = manualSales?.reduce((sum, s) => sum + Number(s.total_amount || 0), 0) || 0
                const lubeProfit = manualSales?.reduce((sum, s) => sum + Number(s.profit || 0), 0) || 0
                const lubeCost = lubeRevenue - lubeProfit
                const lubeQty = manualSales?.reduce((sum, s) => sum + Number(s.quantity || 0), 0) || 0

                const totalExpense = expenses?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0

                const totalRevenue = fuelRevenue + lubeRevenue
                const totalCogs = fuelCost + lubeCost
                const grossProfit = totalRevenue - totalCogs
                const netProfit = grossProfit - totalExpense

                const finalStats = {
                    fuel: { revenue: fuelRevenue, cost: fuelCost, profit: fuelProfit, qty: fuelQty },
                    lube: { revenue: lubeRevenue, cost: lubeCost, profit: lubeProfit, qty: lubeQty },
                    total: {
                        revenue: totalRevenue,
                        cogs: totalCogs,
                        grossProfit: grossProfit,
                        expense: totalExpense,
                        netProfit: netProfit
                    },
                    productBreakdown: [] as { name: string; type: string; revenue: number; cost: number; profit: number; qty: number }[]
                }

                // 4. Per-Product Breakdown
                // Fuel sales per product via nozzles
                let fuelDetailQuery = supabase
                    .from("daily_sales")
                    .select(`
                        revenue, cogs, gross_profit, quantity,
                        nozzles!inner(product_id, products!inner(name, type))
                    `)
                    .gte("sale_date", fromDate)
                    .lte("sale_date", toDate)

                if (filters.productId !== "all") {
                    fuelDetailQuery = fuelDetailQuery.eq("nozzles.product_id", filters.productId)
                } else if (filters.productType === "oil_lubricant") {
                    fuelDetailQuery = fuelDetailQuery.eq("nozzles.product_id", "00000000-0000-0000-0000-000000000000")
                }

                const { data: fuelDetail } = await fuelDetailQuery

                // Aggregate fuel sales per product
                const fuelByProduct: Record<string, { name: string; type: string; revenue: number; cost: number; profit: number; qty: number }> = {}
                fuelDetail?.forEach((s: any) => {
                    const nozzle = Array.isArray(s.nozzles) ? s.nozzles[0] : s.nozzles
                    const product = Array.isArray(nozzle?.products) ? nozzle?.products[0] : nozzle?.products
                    const pid = nozzle?.product_id
                    const pname = product?.name || "Unknown Fuel"
                    if (!pid) return
                    if (!fuelByProduct[pid]) fuelByProduct[pid] = { name: pname, type: "fuel", revenue: 0, cost: 0, profit: 0, qty: 0 }
                    fuelByProduct[pid].revenue += Number(s.revenue || 0)
                    fuelByProduct[pid].cost += Number(s.cogs || 0)
                    fuelByProduct[pid].profit += Number(s.gross_profit || 0)
                    fuelByProduct[pid].qty += Number(s.quantity || 0)
                })

                // Manual (lubricant) sales per product
                let manualDetailQuery = supabase
                    .from("manual_sales")
                    .select("total_amount, profit, quantity, product_id, products!inner(name, type)")
                    .gte("sale_date", fromDate)
                    .lte("sale_date", toDate)

                if (filters.productId !== "all") {
                    manualDetailQuery = manualDetailQuery.eq("product_id", filters.productId)
                } else if (filters.productType === "fuel") {
                    manualDetailQuery = manualDetailQuery.eq("product_id", "00000000-0000-0000-0000-000000000000")
                }

                const { data: manualDetail } = await manualDetailQuery

                const lubeByProduct: Record<string, { name: string; type: string; revenue: number; cost: number; profit: number; qty: number }> = {}
                manualDetail?.forEach((s: any) => {
                    const product = Array.isArray(s.products) ? s.products[0] : s.products
                    const pid = s.product_id
                    const pname = product?.name || "Unknown Product"
                    if (!pid) return
                    if (!lubeByProduct[pid]) lubeByProduct[pid] = { name: pname, type: "oil_lubricant", revenue: 0, cost: 0, profit: 0, qty: 0 }
                    lubeByProduct[pid].revenue += Number(s.total_amount || 0)
                    lubeByProduct[pid].profit += Number(s.profit || 0)
                    lubeByProduct[pid].cost += Number(s.total_amount || 0) - Number(s.profit || 0)
                    lubeByProduct[pid].qty += Number(s.quantity || 0)
                })

                finalStats.productBreakdown = [
                    ...Object.values(fuelByProduct),
                    ...Object.values(lubeByProduct),
                ].filter(p => p.qty > 0)
                  .sort((a, b) => b.revenue - a.revenue)

                setStats(finalStats)
                onDataLoaded?.(finalStats)

            } catch (error) {
                console.error("Error fetching P&L report:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [filters, supabase])

    if (loading) {
        return <Skeleton className="h-[500px] w-full rounded-xl" />
    }

    if (!stats) return null

    const marginPercent = stats.total.revenue > 0 
        ? (stats.total.netProfit / stats.total.revenue) * 100 
        : 0

    return (
        <div className="space-y-6">
            {/* High Level Overview */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-emerald-50 border-emerald-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-tight">Total Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-700">Rs. {stats.total.revenue.toLocaleString()}</div>
                        <p className="text-[10px] text-emerald-600/70 mt-1 flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" /> Combined Sales
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-rose-50 border-rose-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-rose-600 uppercase tracking-tight">Cost of Goods (COGS)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-rose-700">Rs. {stats.total.cogs.toLocaleString()}</div>
                        <p className="text-[10px] text-rose-600/70 mt-1 flex items-center gap-1">
                            <ShoppingCart className="h-3 w-3" /> FIFO Calculation
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-amber-50 border-amber-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-amber-600 uppercase tracking-tight">Total Expenses</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-700">Rs. {stats.total.expense.toLocaleString()}</div>
                        <p className="text-[10px] text-amber-600/70 mt-1 flex items-center gap-1">
                            <Receipt className="h-3 w-3" /> Operational Costs
                        </p>
                    </CardContent>
                </Card>

                <Card className={cn(
                    "border-2",
                    stats.total.netProfit >= 0 ? "bg-blue-50 border-blue-200" : "bg-red-50 border-red-200"
                )}>
                    <CardHeader className="pb-2">
                        <CardTitle className={cn(
                            "text-xs font-bold uppercase tracking-tight",
                            stats.total.netProfit >= 0 ? "text-blue-700" : "text-red-700"
                        )}>Net Profit / Loss</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={cn(
                            "text-2xl font-black",
                            stats.total.netProfit >= 0 ? "text-blue-800" : "text-red-800"
                        )}>
                            Rs. {stats.total.netProfit.toLocaleString()}
                        </div>
                        <p className={cn(
                            "text-[10px] mt-1 font-bold",
                            stats.total.netProfit >= 0 ? "text-blue-600" : "text-red-600"
                        )}>
                            {marginPercent.toFixed(1)}% Net Margin
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Product Breakdown */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-base font-bold">Category Breakdown</CardTitle>
                            <CardDescription>Profit performance by product line</CardDescription>
                        </div>
                        <PieChart className="h-5 w-5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {/* Fuel Item */}
                            {(filters.productType === "all" || filters.productType === "fuel") && (stats.fuel.qty > 0) && (
                                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                                            <Fuel className="h-5 w-5 text-blue-600" />
                                        </div>
                                        <div>
                                            <div className="font-bold">Fuels</div>
                                            <div className="text-xs text-muted-foreground">{stats.fuel.qty.toLocaleString()} Liters Sold</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold">Rs. {stats.fuel.profit.toLocaleString()}</div>
                                        <div className="text-[10px] text-emerald-600 font-bold">GP: {((stats.fuel.profit / (stats.fuel.revenue || 1)) * 100).toFixed(1)}%</div>
                                    </div>
                                </div>
                            )}

                            {/* Lube Item */}
                            {(filters.productType === "all" || filters.productType === "oil_lubricant") && (stats.lube.qty > 0) && (
                                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                                            <Droplets className="h-5 w-5 text-purple-600" />
                                        </div>
                                        <div>
                                            <div className="font-bold">Lubricants</div>
                                            <div className="text-xs text-muted-foreground">{stats.lube.qty.toLocaleString()} Units Sold</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold">Rs. {stats.lube.profit.toLocaleString()}</div>
                                        <div className="text-[10px] text-emerald-600 font-bold">GP: {((stats.lube.profit / (stats.lube.revenue || 1)) * 100).toFixed(1)}%</div>
                                    </div>
                                </div>
                            )}

                            {stats.fuel.qty === 0 && stats.lube.qty === 0 && (
                                <div className="text-center py-8 text-muted-foreground italic">
                                    No sales data for the selected filters
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Financial Summary Table */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base font-bold">Financial Statement</CardTitle>
                        <CardDescription>Consolidated P&L summary</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableBody>
                                <TableRow>
                                    <TableCell className="font-medium">Gross Revenue</TableCell>
                                    <TableCell className="text-right font-mono text-emerald-600 font-bold">
                                        + Rs. {stats.total.revenue.toLocaleString()}
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="font-medium">Cost of Sales (COGS)</TableCell>
                                    <TableCell className="text-right font-mono text-rose-600">
                                        - Rs. {stats.total.cogs.toLocaleString()}
                                    </TableCell>
                                </TableRow>
                                <TableRow className="bg-muted/50">
                                    <TableCell className="font-bold">Gross Profit</TableCell>
                                    <TableCell className="text-right font-mono font-black text-blue-600">
                                        Rs. {stats.total.grossProfit.toLocaleString()}
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="font-medium pl-6">Operating Expenses</TableCell>
                                    <TableCell className="text-right font-mono text-amber-600">
                                        - Rs. {stats.total.expense.toLocaleString()}
                                    </TableCell>
                                </TableRow>
                                <TableRow className="bg-primary/5">
                                    <TableCell className="font-black text-lg">NET PROFIT</TableCell>
                                    <TableCell className={cn(
                                        "text-right font-mono text-lg font-black",
                                        stats.total.netProfit >= 0 ? "text-emerald-700" : "text-rose-700"
                                    )}>
                                        Rs. {stats.total.netProfit.toLocaleString()}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            {/* Per-Product Breakdown */}
            {stats.productBreakdown && stats.productBreakdown.length > 0 && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-base font-bold">Product-wise Profit & Loss</CardTitle>
                            <CardDescription>Revenue, COGS and profit margin per product</CardDescription>
                        </div>
                        <BarChart2 className="h-5 w-5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead className="text-right">Revenue</TableHead>
                                    <TableHead className="text-right">COGS</TableHead>
                                    <TableHead className="text-right">Gross Profit</TableHead>
                                    <TableHead className="text-right">Margin</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stats.productBreakdown.map((p: any, i: number) => {
                                    const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0
                                    return (
                                        <TableRow key={i}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className={cn(
                                                        "h-7 w-7 rounded-full flex items-center justify-center",
                                                        p.type === "fuel" ? "bg-blue-100" : "bg-purple-100"
                                                    )}>
                                                        {p.type === "fuel"
                                                            ? <Fuel className="h-3.5 w-3.5 text-blue-600" />
                                                            : <Droplets className="h-3.5 w-3.5 text-purple-600" />}
                                                    </div>
                                                    <span className="font-medium">{p.name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={p.type === "fuel" ? "text-blue-600 border-blue-200" : "text-purple-600 border-purple-200"}>
                                                    {p.type === "fuel" ? "Fuel" : "Lubricant"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">{p.qty.toLocaleString()}</TableCell>
                                            <TableCell className="text-right font-mono text-sm text-emerald-700 font-semibold">
                                                Rs. {p.revenue.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm text-rose-600">
                                                Rs. {p.cost.toLocaleString()}
                                            </TableCell>
                                            <TableCell className={cn(
                                                "text-right font-mono text-sm font-bold",
                                                p.profit >= 0 ? "text-blue-700" : "text-red-700"
                                            )}>
                                                Rs. {p.profit.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Badge className={cn(
                                                    "font-mono text-xs",
                                                    margin >= 10 ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" :
                                                    margin >= 0 ? "bg-amber-100 text-amber-700 hover:bg-amber-100" :
                                                    "bg-red-100 text-red-700 hover:bg-red-100"
                                                )}>
                                                    {margin.toFixed(1)}%
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
