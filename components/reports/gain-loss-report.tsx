"use client"

import { useState, useEffect, useCallback } from "react"
import { format } from "date-fns"
import { 
    TrendingUp, 
    TrendingDown, 
    AlertTriangle, 
    Droplets,
    FileText,
    PieChart,
    ChevronRight
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { BrandLoader } from "@/components/ui/brand-loader"
import { getGainLossReportData, GainLossSummary, GainLossReportRow } from "@/app/actions/stock-report-actions"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface GainLossReportProps {
    filters: {
        dateRange: { from: Date; to: Date }
        productId: string
        productType: string
    }
    onDataLoaded?: (data: any) => void
}

export function GainLossReport({ filters, onDataLoaded }: GainLossReportProps) {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<GainLossSummary | null>(null)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const result = await getGainLossReportData({
                startDate: format(filters.dateRange.from, "yyyy-MM-dd"),
                endDate: format(filters.dateRange.to, "yyyy-MM-dd"),
                productId: filters.productId
            })
            setData(result)
            onDataLoaded?.(result)
        } catch (error) {
            console.error("Error fetching gain/loss report:", error)
            toast.error("Failed to load gain/loss report")
        } finally {
            setLoading(false)
        }
    }, [filters, onDataLoaded])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <BrandLoader size="lg" className="mb-4" />
                <p className="text-muted-foreground animate-pulse font-black uppercase tracking-widest text-[10px]">Calculating Variances...</p>
            </div>
        )
    }

    const { totalGain, totalLoss, netVariance, records } = data || { totalGain: 0, totalLoss: 0, netVariance: 0, records: [] }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-0 shadow-md bg-green-50/30 overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingUp className="h-16 w-16 text-green-600" />
                    </div>
                    <CardHeader className="pb-2">
                        <CardDescription className="text-[10px] font-black uppercase tracking-widest text-green-700">Total Period Gain</CardDescription>
                        <CardTitle className="text-2xl font-black tabular-nums text-green-600">
                            +{totalGain.toLocaleString(undefined, { minimumFractionDigits: 1 })} <span className="text-xs">L</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-1 w-full bg-green-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 w-full" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-md bg-red-50/30 overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingDown className="h-16 w-16 text-red-600" />
                    </div>
                    <CardHeader className="pb-2">
                        <CardDescription className="text-[10px] font-black uppercase tracking-widest text-red-700">Total Period Loss</CardDescription>
                        <CardTitle className="text-2xl font-black tabular-nums text-red-600">
                            -{totalLoss.toLocaleString(undefined, { minimumFractionDigits: 1 })} <span className="text-xs">L</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-1 w-full bg-red-100 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500 w-full" />
                        </div>
                    </CardContent>
                </Card>

                <Card className={cn(
                    "border-0 shadow-md overflow-hidden relative group",
                    netVariance >= 0 ? "bg-blue-50/30" : "bg-amber-50/30"
                )}>
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <PieChart className={cn("h-16 w-16", netVariance >= 0 ? "text-blue-600" : "text-amber-600")} />
                    </div>
                    <CardHeader className="pb-2">
                        <CardDescription className={cn(
                            "text-[10px] font-black uppercase tracking-widest",
                            netVariance >= 0 ? "text-blue-700" : "text-amber-700"
                        )}>Net Variance</CardDescription>
                        <CardTitle className={cn(
                            "text-2xl font-black tabular-nums",
                            netVariance >= 0 ? "text-blue-600" : "text-amber-600"
                        )}>
                            {netVariance >= 0 ? "+" : ""}{netVariance.toLocaleString(undefined, { minimumFractionDigits: 1 })} <span className="text-xs">L</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                         <div className={cn(
                            "h-1 w-full rounded-full overflow-hidden",
                            netVariance >= 0 ? "bg-blue-100" : "bg-amber-100"
                        )}>
                            <div className={cn(
                                "h-full w-full",
                                netVariance >= 0 ? "bg-blue-500" : "bg-amber-500"
                            )} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-0 shadow-lg overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg font-black uppercase tracking-tight">Stock Discrepancy Log</CardTitle>
                            <CardDescription className="text-[10px] uppercase font-bold tracking-widest">Calculated variance between system stock and manual dip readings</CardDescription>
                        </div>
                        <AlertTriangle className="h-8 w-8 text-amber-500 opacity-20" />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="rounded-none">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 transition-none">
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500 py-4">Reconciliation Date</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500">Tank / Product</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500 text-right">System Stock</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500 text-right">Dip Stock</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500 text-right bg-slate-100/50">Variance (L)</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500 text-right bg-blue-50/50">New Stock</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500 text-right">Var %</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500">Notes / Dip MM</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {records.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center text-muted-foreground animate-pulse uppercase text-[10px] font-black tracking-widest">
                                            No reconciliation records found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    records.map((row) => {
                                        const isLoss = row.variance < 0
                                        const isGain = row.variance > 0
                                        
                                        return (
                                            <TableRow key={row.id} className="hover:bg-slate-50/50 transition-colors">
                                                <TableCell className="font-medium whitespace-nowrap">
                                                    <div className="text-xs font-black">
                                                        {format(new Date(row.reading_date), "dd MMM yyyy")}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-black text-xs uppercase text-slate-700">{row.tank_name}</div>
                                                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{row.product_name}</div>
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-bold text-xs text-slate-400">
                                                    {row.system_stock.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-black text-xs text-slate-900 border-r border-dashed border-slate-200">
                                                    {row.dip_stock.toLocaleString()}
                                                </TableCell>
                                                <TableCell className={cn(
                                                    "text-right font-black text-sm bg-slate-50/50",
                                                    isLoss ? "text-red-600 bg-red-50/20" : isGain ? "text-green-600 bg-green-50/20" : "text-slate-500"
                                                )}>
                                                    {isGain ? "+" : ""}{row.variance.toLocaleString(undefined, { minimumFractionDigits: 1 })}
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-black text-xs text-blue-700 bg-blue-50/30">
                                                    {row.dip_stock.toLocaleString()}
                                                </TableCell>
                                                <TableCell className={cn(
                                                    "text-right font-bold text-[10px]",
                                                    isLoss ? "text-red-400" : isGain ? "text-green-400" : "text-slate-300"
                                                )}>
                                                    {row.variance_percentage.toFixed(2)}%
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                                                        {row.notes}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 items-start animate-in slide-in-from-bottom duration-700">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                    <h4 className="text-xs font-black uppercase text-amber-800 tracking-wider mb-1">Audit Notice</h4>
                    <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
                        Physical discrepancies (Gains/Losses) exceeding 0.5% of total stock should be investigated immediately for potential leaks, calibration errors, or unauthorized withdrawals. These values are derived from manual dip entries compared against the real-time nozzle sale deduction logic.
                    </p>
                </div>
            </div>
        </div>
    )
}
