"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
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
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  TrendingUp, 
  Clock, 
  ArrowLeft,
  Droplets 
} from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type StockMovement = StockReportRow

export default function StockMovementsPage() {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [productFilter, setProductFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [dateRange, setDateRange] = useState("all") // all, today, week, month, custom
  const [customStart, setCustomStart] = useState<string>("")
  const [customEnd, setCustomEnd] = useState<string>("")
  const [products, setProducts] = useState<{ id: string, product_name: string }[]>([])

  const fetchMovements = useCallback(async () => {
    setLoading(true)
    
    // Fetch products for filter
    const supabase = createClient()
    const { data: prodData } = await supabase.from("products").select("id, name").order("name")
    if (prodData) {
      setProducts(prodData.map((p: any) => ({
        id: p.id,
        product_name: p.name
      })))
    }

    let startStr = ""
    let endStr = ""

    if (dateRange !== "all") {
      if (dateRange === "today") {
        const d = new Date()
        startStr = d.toISOString().split('T')[0]
        endStr = startStr
      } else if (dateRange === "week") {
        const d = new Date()
        endStr = d.toISOString().split('T')[0]
        d.setDate(d.getDate() - 7)
        startStr = d.toISOString().split('T')[0]
      } else if (dateRange === "month") {
        const d = new Date()
        endStr = d.toISOString().split('T')[0]
        d.setMonth(d.getMonth() - 1)
        startStr = d.toISOString().split('T')[0]
      } else if (dateRange === "custom" && customStart && customEnd) {
        startStr = customStart
        endStr = customEnd
      }
    }

    try {
      const result = await getStockReportData({
        startDate: startStr,
        endDate: endStr,
        productId: productFilter,
        movementType: filter
      })
      
      // Client-side search filtering
      let filtered = result
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        filtered = filtered.filter(m =>
          m.product_name.toLowerCase().includes(q) ||
          m.notes?.toLowerCase().includes(q) ||
          m.reference_number?.toLowerCase().includes(q) ||
          m.supplier_name?.toLowerCase().includes(q)
        )
      }

      setMovements(filtered)
    } catch (error) {
      console.error("Error fetching movements:", error)
    } finally {
      setLoading(false)
    }
  }, [filter, productFilter, dateRange, customStart, customEnd, searchQuery])

  useEffect(() => {
    fetchMovements()
  }, [fetchMovements])

  const getMovementIcon = (type: string) => {
    switch (type) {
      case "purchase": return <ArrowUpRight className="h-4 w-4 text-primary" />
      case "sale": return <ArrowDownRight className="h-4 w-4 text-destructive" />
      case "adjustment": return <TrendingUp className="h-4 w-4 text-muted-foreground" />
      case "dip_reading": return <Droplets className="h-4 w-4 text-blue-500" />
      default: return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "purchase": return "Purchase"
      case "sale": return "Sale"
      case "initial": return "Opening"
      case "adjustment": return "Adjustment"
      case "dip_reading": return "Dip Reading"
      default: return type
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <BrandLoader size="lg" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Link href="/dashboard/inventory">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Stock Movements</h1>
            <p className="text-muted-foreground">Complete history of all stock changes</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4">
        {/* Search Bar */}
        <div className="relative flex-1 w-full md:w-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by product, notes, reference, or supplier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10 w-full"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          {/* Type Filter */}
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="purchase">Purchases</SelectItem>
              <SelectItem value="sale">Sales</SelectItem>
              <SelectItem value="adjustment">Adjustments</SelectItem>
            </SelectContent>
          </Select>

          {/* Product Filter */}
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Product" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              {products.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date Range Filter */}
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Date Range" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {dateRange === "custom" && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
              <Input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="w-[130px]"
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="w-[130px]"
              />
            </div>
          )}

          <div className="h-4 w-[1px] bg-border mx-2 hidden md:block" />
          <span className="text-sm text-muted-foreground whitespace-nowrap">{movements.length} records</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Movement History</CardTitle>
          <CardDescription>Detailed log of every stock transaction</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Prev. Stock</TableHead>
                  <TableHead className="text-right">Sale Qty</TableHead>
                  <TableHead className="text-right">Purchase</TableHead>
                  <TableHead className="text-right">Dip Qty</TableHead>
                  <TableHead className="text-right">Gain / Loss</TableHead>
                  <TableHead className="text-right">Net Stock</TableHead>
                  <TableHead>Reference / Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                      No movements found
                    </TableCell>
                  </TableRow>
                ) : (
                  movements.map((m) => {
                    const rawQty = Math.abs(Number(m.quantity || 0))
                    const isPositive = Number(m.quantity || 0) > 0
                    const isNegative = Number(m.quantity || 0) < 0
                    const isDip = m.row_type === "dip_reading"

                    const saleLabel = isNegative ? `-${rawQty.toLocaleString(undefined, { minimumFractionDigits: 1 })}` : "-"
                    const purchaseLabel = isPositive ? `+${rawQty.toLocaleString(undefined, { minimumFractionDigits: 1 })}` : "-"

                    return (
                      <TableRow key={m.id} className={isDip ? "bg-blue-50/20" : ""}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {new Intl.DateTimeFormat('en-PK', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'Asia/Karachi'
                          }).format(new Date(m.movement_date))}
                          <span className="block text-xs text-muted-foreground">
                            {new Intl.DateTimeFormat('en-PK', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                              timeZone: 'Asia/Karachi'
                            }).format(new Date(m.movement_date))}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold">{m.product_name}</div>
                          <div className="text-xs text-muted-foreground">{m.product_type?.replace('_', ' ')}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={isPositive ? "secondary" : isNegative ? "outline" : isDip ? "outline" : "outline"}
                            className={cn(
                              isPositive ? "bg-green-100 text-green-800 hover:bg-green-100" :
                                isNegative ? "bg-red-50 text-red-700 hover:bg-red-50" :
                                  isDip ? "bg-blue-50 text-blue-700 hover:bg-blue-50 border-blue-200" : ""
                            )}>
                            <div className="flex items-center gap-1">
                              {getMovementIcon(m.movement_type)}
                              {getTypeLabel(m.movement_type)}
                            </div>
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(m.previous_stock || 0).toLocaleString(undefined, { minimumFractionDigits: 1 })}
                        </TableCell>
                        <TableCell className="text-right font-bold text-destructive">
                          {isNegative ? saleLabel : "-"}
                        </TableCell>
                        <TableCell className="text-right font-bold text-green-600">
                          {isPositive ? purchaseLabel : "-"}
                        </TableCell>
                        <TableCell className="text-right font-black text-blue-700">
                          {isDip ? Number(m.dip_quantity || 0).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-black",
                          (m.gain_amount || 0) > 0 ? "text-green-600" : (m.loss_amount || 0) > 0 ? "text-red-600" : "text-slate-400"
                        )}>
                          {isDip ? (
                            (m.gain_amount || 0) > 0 ? `+${m.gain_amount}` :
                              (m.loss_amount || 0) > 0 ? `-${m.loss_amount}` : "0"
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {Number(m.balance_after || 0).toLocaleString(undefined, { minimumFractionDigits: 1 })}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <div className="truncate text-sm" title={m.notes || ""}>
                            {m.reference_number && <span className="font-mono text-xs bg-muted px-1 rounded mr-1">{m.reference_number}</span>}
                            {m.notes || "-"}
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
    </div>
  )
}
