"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Fuel,
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  ExternalLink,
  Database,
} from "lucide-react"
import Link from "next/link"
import { BrandLoader } from "@/components/ui/brand-loader"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"

interface Product {
  id: string
  product_name: string
  product_type: string
  current_stock: number
  tank_capacity: number | null
  minimum_stock_level: number
  weighted_avg_cost: number
  stock_value: number
  last_purchase_date: string | null
}

interface StockMovement {
  id: string
  product_id: string
  movement_date: string
  movement_type: string
  quantity: number
  ordered_quantity: number | null
  previous_stock: number
  unit_price: number | null
  balance_after: number
  notes: string | null
  products: {
    product_name: string
  }
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [tanks, setTanks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        // Fetch products
        const { data: prodData, error: prodError } = await supabase
          .from("products")
          .select("*")
          .order("name")

        if (prodError) throw prodError

        // Map to match interface
        const mappedProducts = (prodData || []).map(p => ({
          ...p,
          product_name: p.name,
          product_type: p.type === 'oil' ? 'oil_lubricant' : p.type,
          minimum_stock_level: p.min_stock_level,
          // Fallback to purchase_price if weighted_avg_cost is null or 0
          weighted_avg_cost: p.weighted_avg_cost || p.purchase_price || 0
        }))
        setProducts(mappedProducts)

        // Fetch recent movements
        const { data: moveData, error: moveError } = await supabase
          .from("stock_movements")
          .select("*, products(name)")
          .order("movement_date", { ascending: false })
          .limit(20)

        if (moveError) throw moveError

        // Map movements to ensure product_name is available
        const mappedMovements = (moveData || []).map(m => ({
          ...m,
          products: {
            product_name: (m.products as any)?.name || 'Unknown'
          }
        }))
        setMovements(mappedMovements)

        // Fetch tanks
        const { data: tankData, error: tankError } = await supabase
          .from("tanks")
          .select("*, products(name)")
          .order("name")

        if (tankError) throw tankError
        setTanks(tankData || [])
      } catch (error) {
        console.error("Error fetching inventory data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [supabase])

  const fuelProducts = products.filter(p => p.product_type === "fuel")
  const oilProducts = products.filter(p => p.product_type === "oil_lubricant")

  const getTotalFuelStock = (product: Product) => {
    const linkedTanks = tanks.filter(t => t.product_id === product.id)
    if (linkedTanks.length > 0) {
      return linkedTanks.reduce((sum, t) => sum + (t.current_level || 0), 0)
    }
    return product.current_stock || 0
  }

  const getTotalFuelCapacity = (product: Product) => {
    const linkedTanks = tanks.filter(t => t.product_id === product.id)
    if (linkedTanks.length > 0) {
      return linkedTanks.reduce((sum, t) => sum + (t.capacity || 0), 0)
    }
    return product.tank_capacity || 0
  }

  const totalStockValue = products.reduce((sum, p) => {
    if (p.product_type === "fuel") {
      return sum + (getTotalFuelStock(p) * (p.weighted_avg_cost || 0))
    }
    return sum + (p.stock_value || 0)
  }, 0)

  const lowStockAlerts = products.filter(p => {
    if (p.product_type === "oil_lubricant") {
      return p.current_stock <= p.minimum_stock_level
    } else {
      const totalCapacity = getTotalFuelCapacity(p)
      const totalStock = getTotalFuelStock(p)
      return totalCapacity > 0 && (totalStock / totalCapacity) < 0.2
    }
  })

  const getStockStatus = (product: Product) => {
    if (product.product_type === "fuel") {
      const totalCapacity = getTotalFuelCapacity(product)
      const totalStock = getTotalFuelStock(product)
      if (totalCapacity === 0) return { status: "good", label: "Good", color: "bg-primary" }

      const percentage = (totalStock / totalCapacity) * 100
      if (percentage <= 10) return { status: "critical", label: "Critical", color: "bg-destructive" }
      if (percentage <= 20) return { status: "low", label: "Low", color: "bg-warning" }
      if (percentage <= 50) return { status: "medium", label: "Medium", color: "bg-accent" }
      return { status: "good", label: "Good", color: "bg-primary" }
    } else {
      if (product.current_stock <= product.minimum_stock_level * 0.5) return { status: "critical", label: "Critical", color: "bg-destructive" }
      if (product.current_stock <= product.minimum_stock_level) return { status: "low", label: "Low", color: "bg-warning" }
      return { status: "good", label: "In Stock", color: "bg-primary" }
    }
  }

  const getMovementIcon = (type: string) => {
    switch (type) {
      case "purchase":
        return <ArrowUpRight className="h-4 w-4 text-primary" />
      case "sale":
        return <ArrowDownRight className="h-4 w-4 text-accent" />
      case "adjustment":
        return <TrendingUp className="h-4 w-4 text-muted-foreground" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />
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
        <h1 className="text-3xl font-bold tracking-tight">Inventory Management</h1>
        <p className="text-muted-foreground">
          Real-time stock tracking with predictive alerts and smart recommendations
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Stock Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Rs. {totalStockValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Based on current purchase price</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fuel Products</CardTitle>
            <Fuel className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fuelProducts.length}</div>
            <p className="text-xs text-muted-foreground">
              {fuelProducts.reduce((sum, p) => sum + getTotalFuelStock(p), 0).toLocaleString()} liters total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Oil Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{oilProducts.length}</div>
            <p className="text-xs text-muted-foreground">
              {oilProducts.reduce((sum, p) => sum + p.current_stock, 0).toLocaleString()} units total
            </p>
          </CardContent>
        </Card>

        <Card className={lowStockAlerts.length > 0 ? "border-destructive" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Alerts</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${lowStockAlerts.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${lowStockAlerts.length > 0 ? "text-destructive" : ""}`}>
              {lowStockAlerts.length}
            </div>
            <p className="text-xs text-muted-foreground">Products need attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alerts */}
      {lowStockAlerts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Low Stock Alerts
            </CardTitle>
            <CardDescription>These products require immediate attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {lowStockAlerts.map((product) => {
                const stockStatus = getStockStatus(product)
                let percentage = 100
                let currentText = ""
                let capText = ""

                if (product.product_type === "fuel") {
                  const tCap = getTotalFuelCapacity(product)
                  const tStock = getTotalFuelStock(product)
                  percentage = tCap > 0 ? (tStock / tCap) * 100 : 0
                  currentText = `Current: ${tStock.toLocaleString()}`
                  capText = tCap > 0 ? `Capacity: ${tCap.toLocaleString()}` : ""
                } else {
                  percentage = product.minimum_stock_level > 0 ? (product.current_stock / product.minimum_stock_level) * 100 : 100
                  currentText = `Current: ${product.current_stock.toLocaleString()}`
                  capText = `Min: ${product.minimum_stock_level}`
                }

                return (
                  <div key={product.id} className="rounded-lg border bg-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{product.product_name}</span>
                      <Badge variant="destructive">{stockStatus.label}</Badge>
                    </div>
                    <div className="space-y-2">
                      <Progress value={Math.min(percentage, 100)} className="h-2" />
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{currentText}</span>
                        <span>{capText}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stock Details */}
      <Tabs defaultValue="fuel" className="space-y-4">
        <TabsList>
          <TabsTrigger value="fuel" className="gap-2">
            <Fuel className="h-4 w-4" />
            Fuel Stock (Total)
          </TabsTrigger>
          <TabsTrigger value="tanks" className="gap-2">
            <Database className="h-4 w-4" />
            Tank Overview
          </TabsTrigger>
          <TabsTrigger value="oils" className="gap-2">
            <Package className="h-4 w-4" />
            Oils & Lubricants
          </TabsTrigger>
          <TabsTrigger value="movements" className="gap-2">
            <Clock className="h-4 w-4" />
            Recent Movements
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tanks" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tanks.map((tank) => {
              const capacity = tank.capacity || 0
              const currentLevel = tank.current_level || 0
              const dryLevel = tank.dry_level || 0
              const productName = tank.products?.name || "Unassigned"
              const percentage = capacity > 0 ? (currentLevel / capacity) * 100 : 0

              let statusColor = "bg-primary"
              let statusLabel = "Good"

              if (percentage <= 10) {
                statusColor = "bg-destructive"
                statusLabel = "Critical"
              } else if (percentage <= 25) {
                statusColor = "bg-warning"
                statusLabel = "Low"
              }

              return (
                <Card key={tank.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{tank.name}</CardTitle>
                      <Badge className={statusColor}>{statusLabel}</Badge>
                    </div>
                    <CardDescription>Product: {productName}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Tank Level</span>
                        <span className="font-medium">{percentage.toFixed(1)}%</span>
                      </div>
                      <Progress value={percentage} className="h-3" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                      <div>
                        <p className="text-muted-foreground">Current Volume</p>
                        <p className="font-semibold">{currentLevel.toLocaleString()} L</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Tank Capacity</p>
                        <p className="font-semibold">{capacity.toLocaleString()} L</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Dry Level (Min)</p>
                        <p className="font-semibold text-destructive">{dryLevel.toLocaleString()} L</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            {tanks.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Database className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">No tanks configured yet</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="fuel" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {fuelProducts.map((product) => {
              const linkedTanks = tanks.filter(t => t.product_id === product.id)

              // Aggregate total capacity and level from connected tanks
              const hasLinkedTanks = linkedTanks.length > 0
              const totalCapacity = hasLinkedTanks
                ? linkedTanks.reduce((sum, t) => sum + (t.capacity || 0), 0)
                : product.tank_capacity || 0

              const totalStock = hasLinkedTanks
                ? linkedTanks.reduce((sum, t) => sum + (t.current_level || 0), 0)
                : product.current_stock || 0

              const percentage = totalCapacity > 0 ? (totalStock / totalCapacity) * 100 : 0

              let statusLabel = "Good"
              let statusColor = "bg-primary"
              if (percentage <= 10) {
                statusLabel = "Critical"
                statusColor = "bg-destructive"
              } else if (percentage <= 25) {
                statusLabel = "Low"
                statusColor = "bg-warning"
              }

              return (
                <Card key={product.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{product.product_name}</CardTitle>
                      <Badge className={statusColor}>{statusLabel}</Badge>
                    </div>
                    {hasLinkedTanks && (
                      <CardDescription>From {linkedTanks.length} connected tank{linkedTanks.length > 1 ? 's' : ''}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Total Tank Level</span>
                        <span className="font-medium">{percentage.toFixed(1)}%</span>
                      </div>
                      <Progress value={percentage} className="h-3" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                      <div>
                        <p className="text-muted-foreground">Total Stock</p>
                        <p className="font-semibold">{totalStock.toLocaleString()} L</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Capacity</p>
                        <p className="font-semibold">{totalCapacity.toLocaleString() || "-"} L</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Purchase Price</p>
                        <p className="font-semibold">Rs. {Number(product.weighted_avg_cost || 0).toFixed(2)}/L</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Sale Price</p>
                        <p className="font-semibold">Rs. {Number((product as any).selling_price || 0).toFixed(2)}/L</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Stock Value</p>
                        <p className="font-semibold">Rs. {(totalStock * (product.weighted_avg_cost || 0)).toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            {fuelProducts.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Fuel className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">No fuel products added yet</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="oils" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {oilProducts.map((product) => {
              const stockStatus = getStockStatus(product)
              const percentage = (product.current_stock / Math.max(product.minimum_stock_level * 2, product.current_stock)) * 100

              return (
                <Card key={product.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{product.product_name}</CardTitle>
                      <Badge className={stockStatus.color}>{stockStatus.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Stock Level</span>
                        <span className="font-medium">{product.current_stock} units</span>
                      </div>
                      <Progress value={percentage} className="h-3" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Current Stock</p>
                        <p className="font-semibold">{product.current_stock} units</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Min Level</p>
                        <p className="font-semibold">{product.minimum_stock_level} units</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Purchase Price</p>
                        <p className="font-semibold">Rs. {Number(product.weighted_avg_cost || 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Stock Value</p>
                        <p className="font-semibold">Rs. {(product.stock_value || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            {oilProducts.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">No oil products added yet</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Stock Movements</CardTitle>
                <CardDescription>Last 20 stock transactions</CardDescription>
              </div>
              <Link href="/dashboard/inventory/movements">
                <Button variant="outline" size="sm" className="bg-transparent">
                  View All <ExternalLink className="ml-2 h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              {movements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">No stock movements recorded yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Prev. Stock</TableHead>
                        <TableHead className="text-right">Sale Qty</TableHead>
                        <TableHead className="text-right">Purchase</TableHead>
                        <TableHead className="text-right">Net Stock</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((movement) => {
                        const rawQty = Number(movement.quantity)
                        const isNegative = rawQty < 0
                        const isPositive = rawQty > 0

                        const quantityLabel = isNegative ? Math.abs(rawQty).toLocaleString() : "-"
                        const receivedLabel = isPositive ? rawQty.toLocaleString() : "-"

                        const typeLabel = movement.movement_type === "purchase" ? "Purchase"
                          : movement.movement_type === "sale" ? "Sale"
                            : movement.movement_type === "initial" ? "Opening"
                              : movement.movement_type === "adjustment" ? "Adj."
                                : movement.movement_type

                        return (
                          <TableRow key={movement.id}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {new Date(movement.movement_date).toLocaleDateString("en-PK", {
                                day: "numeric", month: "short"
                              })}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {new Date(movement.movement_date).toLocaleTimeString("en-PK", {
                                  hour: "2-digit", minute: "2-digit"
                                })}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{movement.products?.product_name}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs font-normal">
                                {typeLabel}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs font-mono">
                              {Number(movement.previous_stock || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-bold text-destructive">
                              {isNegative ? `-${quantityLabel}` : "-"}
                            </TableCell>
                            <TableCell className="text-right font-bold text-green-600">
                              {isPositive ? `+${receivedLabel}` : "-"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs font-bold">
                              {Number(movement.balance_after).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
