"use client"

import { useState, useEffect } from "react"
import {
    History,
    Filter,
    Download,
    Calendar,
    Fuel,
    Package,
    Search,
    ArrowUpRight,
    TrendingUp,
    CreditCard,
    Banknote,
    X
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { getTodayPKT } from "@/lib/utils"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { exportToCSV } from "@/lib/export-utils"

export default function SalesHistoryPage() {
    const [fuelSales, setFuelSales] = useState<any[]>([])
    const [manualSales, setManualSales] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [activeTab, setActiveTab] = useState("fuel")

    // Filter State
    const [startDate, setStartDate] = useState("")
    const [endDate, setEndDate] = useState("")
    const [selectedNozzle, setSelectedNozzle] = useState("all")
    const [selectedProduct, setSelectedProduct] = useState("all")
    const [search, setSearch] = useState("")

    // Metadata for filters
    const [nozzles, setNozzles] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])

    const supabase = createClient()
    const today = getTodayPKT()

    useEffect(() => {
        fetchMetadata()
        fetchHistory()
    }, [])

    async function fetchMetadata() {
        const { data: nData } = await supabase.from("nozzles").select("id, nozzle_number").order("nozzle_number")
        const { data: pData } = await supabase.from("products").select("id, name").order("name")
        setNozzles(nData || [])
        setProducts(pData || [])
    }

    async function fetchHistory() {
        setIsLoading(true)
        try {
            // Fuel Sales Query
            let fuelQuery = supabase
                .from("daily_sales")
                .select(`
                    *,
                    nozzles:nozzle_id (
                        nozzle_number,
                        products:product_id (name)
                    )
                `)
                .order("sale_date", { ascending: false })

            if (startDate) fuelQuery = fuelQuery.gte("sale_date", startDate)
            if (endDate) fuelQuery = fuelQuery.lte("sale_date", endDate)
            if (selectedNozzle !== "all") fuelQuery = fuelQuery.eq("nozzle_id", selectedNozzle)

            const { data: fData, error: fError } = await fuelQuery.limit(200)

            if (fError) {
                console.error("Fuel history error:", fError)
                toast.error("Error loading fuel history")
            }

            // Manual Sales Query
            let manualQuery = supabase
                .from("manual_sales")
                .select(`
                    *,
                    products:product_id (name)
                `)
                .order("sale_date", { ascending: false })

            if (startDate) manualQuery = manualQuery.gte("sale_date", startDate)
            if (endDate) manualQuery = manualQuery.lte("sale_date", endDate)
            if (selectedProduct !== "all") manualQuery = manualQuery.eq("product_id", selectedProduct)

            const { data: mData, error: mError } = await manualQuery.limit(200)

            if (mError) {
                console.error("Manual history error:", mError)
                toast.error("Error loading manual history")
            }

            setFuelSales(fData || [])
            setManualSales(mData || [])
        } catch (error) {
            toast.error("Failed to load history")
        } finally {
            setIsLoading(false)
        }
    }

    const handleExport = () => {
        if (activeTab === "fuel") {
            const headers = {
                sale_date: "Date",
                "nozzles.nozzle_number": "Nozzle",
                "nozzles.products.name": "Product",
                opening_reading: "Opening",
                closing_reading: "Closing",
                quantity: "Quantity (Litre)",
                revenue: "Total Revenue (Rs)",
                card_payment_amount: "Card Amount (Rs)",
                cash_payment_amount: "Net Cash (Rs)",
                gross_profit: "Profit (Rs)"
            }
            exportToCSV(fuelSales, "Fuel_Sales_History", headers)
        } else {
            const headers = {
                sale_date: "Date & Time",
                "products.name": "Product",
                quantity: "Quantity",
                total_amount: "Total (Rs)",
                payment_method: "Payment",
                customer_name: "Customer",
                profit: "Profit (Rs)"
            }
            exportToCSV(manualSales, "Manual_Sales_History", headers)
        }
        toast.success("Exporting CSV...")
    }

    const clearFilters = () => {
        setStartDate("")
        setEndDate("")
        setSelectedNozzle("all")
        setSelectedProduct("all")
        setSearch("")
        setTimeout(() => fetchHistory(), 10)
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Sales History</h1>
                    <p className="text-muted-foreground">View all automated and manual sales records.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
                        <Download className="w-4 h-4" />
                        Export
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => fetchHistory()} className="gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Filter Bar */}
            <Card className="border-primary/10 bg-muted/5">
                <CardContent className="p-4 flex flex-wrap gap-4 items-end">
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Start Date
                        </label>
                        <Input
                            type="date"
                            className="h-9 w-40 text-sm"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> End Date
                        </label>
                        <Input
                            type="date"
                            className="h-9 w-40 text-sm"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                    {activeTab === "fuel" ? (
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                <Fuel className="w-3 h-3" /> Nozzle
                            </label>
                            <Select value={selectedNozzle} onValueChange={setSelectedNozzle}>
                                <SelectTrigger className="h-9 w-32 text-sm">
                                    <SelectValue placeholder="All Nozzles" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Nozzles</SelectItem>
                                    {nozzles.map(n => (
                                        <SelectItem key={n.id} value={n.id}>{n.nozzle_number}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                <Package className="w-3 h-3" /> Product
                            </label>
                            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                                <SelectTrigger className="h-9 w-44 text-sm">
                                    <SelectValue placeholder="All Products" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Products</SelectItem>
                                    {products.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="flex gap-2 ml-auto">
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1 text-muted-foreground">
                            <X className="w-3 h-3" /> Clear
                        </Button>
                        <Button size="sm" onClick={fetchHistory} className="h-9 gap-2">
                            <Search className="w-4 h-4" /> Apply Filters
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="fuel" value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList>
                    <TabsTrigger value="fuel" className="gap-2">
                        <Fuel className="w-4 h-4" />
                        Fuel Sales (Nozzles)
                    </TabsTrigger>
                    <TabsTrigger value="manual" className="gap-2">
                        <Package className="w-4 h-4" />
                        Manual Sales (Lubricants)
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="fuel" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Fuel Sales History</CardTitle>
                            <CardDescription>Sales automatically calculated from nozzle readings.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Nozzle</TableHead>
                                        <TableHead>Product</TableHead>
                                        <TableHead className="text-right">Quantity</TableHead>
                                        <TableHead className="text-right">Revenue</TableHead>
                                        <TableHead className="text-right">Cards</TableHead>
                                        <TableHead className="text-right">Net Cash</TableHead>
                                        <TableHead className="text-right">Profit</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={9} className="text-center py-10">Loading...</TableCell></TableRow>
                                    ) : fuelSales.length === 0 ? (
                                        <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No records found</TableCell></TableRow>
                                    ) : fuelSales.map((sale) => (
                                        <TableRow key={sale.id}>
                                            <TableCell className="font-mono text-xs">{sale.sale_date}</TableCell>
                                            <TableCell>{sale.nozzles?.nozzle_number || '-'}</TableCell>
                                            <TableCell>{sale.nozzles?.products?.name || '-'}</TableCell>
                                            <TableCell className="text-right font-mono text-muted-foreground text-[10px]">
                                                {sale.opening_reading > 0 ? sale.opening_reading.toLocaleString() : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-muted-foreground text-[10px]">
                                                {sale.closing_reading > 0 ? sale.closing_reading.toLocaleString() : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-bold">{(sale.quantity || 0).toLocaleString()} L</TableCell>
                                            <TableCell className="text-right font-mono text-xs">{(sale.revenue || 0).toLocaleString()}</TableCell>
                                            <TableCell className="text-right font-mono text-orange-600 font-bold">
                                                {sale.card_payment_amount > 0 ? (sale.card_payment_amount || 0).toLocaleString() : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-emerald-600 font-black">
                                                {(sale.cash_payment_amount || 0).toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-primary/70 text-xs">{(sale.gross_profit || 0).toLocaleString()}</TableCell>
                                            <TableCell>
                                                {sale.is_overnight ? (
                                                    <Badge variant="secondary" className="text-[10px]">Overnight</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px]">Regular</Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="manual" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Manual Sales History</CardTitle>
                            <CardDescription>Lubricants and other products sold manually.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date & Time</TableHead>
                                        <TableHead>Product</TableHead>
                                        <TableHead className="text-right">Quantity</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                        <TableHead>Payment</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead className="text-right">Profit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={7} className="text-center py-10">Loading...</TableCell></TableRow>
                                    ) : manualSales.length === 0 ? (
                                        <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No records found</TableCell></TableRow>
                                    ) : manualSales.map((sale) => (
                                        <TableRow key={sale.id}>
                                            <TableCell className="font-mono text-xs">
                                                {sale.sale_date ? new Date(sale.sale_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                                            </TableCell>
                                            <TableCell className="font-medium">{sale.products?.name}</TableCell>
                                            <TableCell className="text-right">{sale.quantity}</TableCell>
                                            <TableCell className="text-right font-mono">Rs. {(sale.total_amount || 0).toLocaleString()}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    {sale.payment_method === 'cash' ? <Banknote className="w-3 h-3" /> : <CreditCard className="w-3 h-3" />}
                                                    <span className="capitalize">{sale.payment_method}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs">{sale.customer_name || "-"}</TableCell>
                                            <TableCell className="text-right font-mono text-green-600">Rs. {(sale.profit || 0).toLocaleString()}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
