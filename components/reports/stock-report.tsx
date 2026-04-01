"use client"

import { useState, useEffect, useCallback } from "react"
import { format } from "date-fns"
import { 
    ArrowUpRight, 
    ArrowDownRight, 
    TrendingUp, 
    Clock, 
    Search,
    Filter,
    Package,
    Droplets
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { BrandLoader } from "@/components/ui/brand-loader"
import { getStockReportData, StockReportRow } from "@/app/actions/stock-report-actions"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface StockReportProps {
    filters: {
        dateRange: { from: Date; to: Date }
        productId: string
        productType: string
    }
    onDataLoaded?: (data: any[]) => void
}

export function StockReport({ filters, onDataLoaded }: StockReportProps) {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<StockReportRow[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [typeFilter, setTypeFilter] = useState("all")

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const result = await getStockReportData({
                startDate: format(filters.dateRange.from, "yyyy-MM-dd"),
                endDate: format(filters.dateRange.to, "yyyy-MM-dd"),
                productId: filters.productId,
                movementType: typeFilter
            })
            setData(result)
            onDataLoaded?.(result)
        } catch (error) {
            console.error("Error fetching stock report:", error)
            toast.error("Failed to load stock report")
        } finally {
            setLoading(false)
        }
    }, [filters, typeFilter, onDataLoaded])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const filteredData = data.filter(row => {
        if (!searchQuery) return true
        const q = searchQuery.toLowerCase()
        return (
            row.product_name.toLowerCase().includes(q) ||
            row.notes?.toLowerCase().includes(q) ||
            row.reference_number?.toLowerCase().includes(q) ||
            row.supplier_name?.toLowerCase().includes(q)
        )
    })

    const getMovementIcon = (row: StockReportRow) => {
        if (row.row_type === "dip_reading") return <Droplets className="h-4 w-4 text-blue-500" />
        switch (row.movement_type) {
            case "purchase": return <ArrowUpRight className="h-4 w-4 text-green-500" />
            case "sale": return <ArrowDownRight className="h-4 w-4 text-red-500" />
            case "adjustment": return <TrendingUp className="h-4 w-4 text-amber-500" />
            default: return <Clock className="h-4 w-4 text-slate-400" />
        }
    }

    const getTypeLabel = (row: StockReportRow) => {
        if (row.row_type === "dip_reading") return "Dip Reading"
        switch (row.movement_type) {
            case "purchase": return "Purchase"
            case "sale": return "Sale"
            case "initial": return "Opening"
            case "adjustment": return "Adjustment"
            default: return row.movement_type
        }
    }

    if (loading && data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <BrandLoader size="lg" className="mb-4" />
                <p className="text-muted-foreground animate-pulse font-black uppercase tracking-widest text-[10px]">Analyzing Stock Movements...</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Local Filters */}
            <div className="flex flex-col md:flex-row items-center gap-4">
                <div className="relative flex-1 w-full md:w-auto">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search by product, notes, reference..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-10 w-full bg-background border-primary/10 shadow-sm"
                    />
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="w-[160px] h-10 border-primary/10 bg-background">
                            <SelectValue placeholder="Movement Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="purchase">Purchases</SelectItem>
                            <SelectItem value="sale">Sales</SelectItem>
                            <SelectItem value="adjustment">Adjustments</SelectItem>
                            <SelectItem value="dip_reading">Dip Readings</SelectItem>
                        </SelectContent>
                    </Select>
                    <span className="text-xs font-bold text-muted-foreground whitespace-nowrap bg-muted px-2 py-1 rounded border">
                        {filteredData.length} records
                    </span>
                </div>
            </div>

            <Card className="border-0 shadow-lg overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg font-black uppercase tracking-tight">Stock Movement & Dip History</CardTitle>
                            <CardDescription className="text-[10px] uppercase font-bold tracking-widest">Unified log of stock changes and manual dip measurements</CardDescription>
                        </div>
                        <Package className="h-8 w-8 text-primary opacity-20" />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="rounded-none">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 transition-none">
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500 py-4">Date & Time</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500">Product</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500">Type</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500 text-right">Prev. Stock</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500 text-right">Sale Qty</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500 text-right">Purchase</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500 text-right bg-blue-50/50">Dip Qty</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500 text-right bg-amber-50/50">Gain / Loss</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500 text-right">Net Stock</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-slate-500">Reference / Note</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredData.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="h-32 text-center text-muted-foreground animate-pulse uppercase text-[10px] font-black tracking-widest">
                                            No stock records found for this period
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredData.map((row) => {
                                        const isNegative = row.quantity && row.quantity < 0
                                        const isPositive = row.quantity && row.quantity > 0
                                        const isDip = row.row_type === "dip_reading"
                                        
                                        const rawQty = row.quantity ? Math.abs(row.quantity) : 0
                                        const qtyStr = rawQty.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

                                        return (
                                            <TableRow key={row.id} className={cn("hover:bg-slate-50/50 transition-colors", isDip && "bg-blue-50/20")}>
                                                <TableCell className="font-medium whitespace-nowrap">
                                                    <span className="text-xs font-black">
                                                        {new Intl.DateTimeFormat('en-PK', {
                                                            day: '2-digit',
                                                            month: 'short',
                                                            year: 'numeric',
                                                            timeZone: 'Asia/Karachi'
                                                        }).format(new Date(row.movement_date))}
                                                    </span>
                                                    <span className="block text-[10px] text-muted-foreground font-bold">
                                                        {new Intl.DateTimeFormat('en-PK', {
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                            hour12: true,
                                                            timeZone: 'Asia/Karachi'
                                                        }).format(new Date(row.movement_date))}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-black text-xs uppercase text-slate-700">{row.product_name}</div>
                                                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{row.product_type?.replace('_', ' ')}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={cn(
                                                        "text-[9px] font-black uppercase tracking-widest gap-1 py-0.5 px-2",
                                                        isPositive ? "bg-green-50 text-green-700 border-green-200" :
                                                        isNegative ? "bg-red-50 text-red-700 border-red-200" :
                                                        isDip ? "bg-blue-100 text-blue-700 border-blue-200" :
                                                        "bg-slate-100 text-slate-700"
                                                    )}>
                                                        {getMovementIcon(row)}
                                                        {getTypeLabel(row)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-bold text-xs text-slate-400">
                                                    {row.previous_stock?.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right font-black text-xs text-red-600">
                                                    {isNegative ? `-${qtyStr}` : "—"}
                                                </TableCell>
                                                <TableCell className="text-right font-black text-xs text-green-600">
                                                    {isPositive ? `+${qtyStr}` : "—"}
                                                </TableCell>
                                                <TableCell className="text-right font-black text-xs text-blue-700 bg-blue-50/30">
                                                    {isDip ? row.dip_quantity?.toLocaleString() : "—"}
                                                </TableCell>
                                                <TableCell className={cn(
                                                    "text-right font-black text-xs bg-amber-50/30",
                                                    (row.gain_amount || 0) > 0 ? "text-green-600" : (row.loss_amount || 0) > 0 ? "text-red-600" : "text-slate-400"
                                                )}>
                                                    {isDip ? (
                                                        (row.gain_amount || 0) > 0 ? `+${row.gain_amount}` : 
                                                        (row.loss_amount || 0) > 0 ? `-${row.loss_amount}` : "0"
                                                    ) : "—"}
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-black text-xs text-slate-900">
                                                    {row.balance_after?.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="max-w-[180px]">
                                                    <div className="truncate text-[10px] font-bold text-slate-500" title={row.notes || ""}>
                                                        {row.reference_number && (
                                                            <span className="font-black text-[9px] bg-slate-200 text-slate-700 px-1 rounded mr-1">
                                                                {row.reference_number}
                                                            </span>
                                                        )}
                                                        {row.notes || "—"}
                                                    </div>
                                                    {isDip && row.gain_amount !== 0 && (
                                                        <div className={cn("text-[9px] font-black uppercase", (row.gain_amount || 0) > 0 ? "text-green-600" : "text-red-600")}>
                                                            {(row.gain_amount || 0) > 0 ? `Gain: +${row.gain_amount}` : `Loss: ${row.loss_amount}`}
                                                        </div>
                                                    )}
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
        </div>
    )
}
