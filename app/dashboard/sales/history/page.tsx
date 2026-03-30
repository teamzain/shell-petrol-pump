"use client"

import { useState, useEffect, useMemo } from "react"
import {
    History as HistoryIcon,
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
    X,
    CheckCircle2,
    RefreshCw,
    Wallet,
    ArrowDownRight,
    Coins,
    Layers,
    Tag
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
import { getBalanceOverviewData, releaseCardHold, getSystemActiveDate } from "@/app/actions/balance"
import { format } from "date-fns"

export default function SalesHistoryPage() {
    const [fuelSales, setFuelSales] = useState<any[]>([])
    const [manualSales, setManualSales] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [activeTab, setActiveTab] = useState("fuel")
    const [cardHoldings, setCardHoldings] = useState<any[]>([])
    const [allCardRecords, setAllCardRecords] = useState<any[]>([])
    const [bankAccounts, setBankAccounts] = useState<any[]>([])
    const [suppliers, setSuppliers] = useState<any[]>([])
    const [isSaving, setIsSaving] = useState(false)

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PK', {
            style: 'currency',
            currency: 'PKR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount).replace('PKR', 'Rs.')
    }

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
        const initDate = async () => {
            const activeDate = await getSystemActiveDate()
            setStartDate(activeDate)
            setEndDate(activeDate)
        }
        initDate()
        fetchMetadata()
    }, [])

    useEffect(() => {
        if (startDate && endDate) {
            fetchHistory()
        }
    }, [startDate, endDate])

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

            // Fetch card records for summary and released tab
            let cardQuery = supabase
                .from("card_hold_records")
                .select(`
                    *,
                    bank_cards ( card_name, bank_accounts ( bank_name ) ),
                    supplier_cards ( card_name, suppliers ( name ) ),
                    bank_accounts ( account_name ),
                    suppliers ( name )
                `)

            if (startDate) cardQuery = cardQuery.gte("sale_date", startDate)
            if (endDate) cardQuery = cardQuery.lte("sale_date", endDate)

            const { data: cRecords } = await cardQuery
            setAllCardRecords(cRecords || [])

            // Also fetch card holdings (pending only for the tab), bank accounts, and suppliers
            const balanceData = await getBalanceOverviewData()
            setCardHoldings(balanceData.cardHoldings || [])
            setBankAccounts(balanceData.bankAccounts || [])
            setSuppliers(balanceData.suppliers || [])
        } catch (error) {
            toast.error("Failed to load history")
        } finally {
            setIsLoading(false)
        }
    }

    const handleReleaseHold = async (holdId: string, bankAccountId: string, releaseDate?: string) => {
        if (!bankAccountId) {
            toast.error("Please select a bank account")
            return
        }

        setIsSaving(true)
        try {
            await releaseCardHold(holdId, bankAccountId, releaseDate)
            toast.success("Card payment released to bank account")
            fetchHistory()
        } catch (err: any) {
            toast.error(err.message || "Failed to release card hold")
        } finally {
            setIsSaving(false)
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
                unit_price: "Unit Price (Rs)",
                total_amount: "Net Total (Rs)",
                discount_type: "Discount Type",
                discount_value: "Discount Value",
                discount_amount: "Discount Amount (Rs)",
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

    // Calculations for Summary Cards
    const summaryData = useMemo(() => {
        const totalFuelRevenue = fuelSales.reduce((sum, s) => sum + (Number(s.revenue) || 0), 0)
        const totalManualRevenue = manualSales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
        const totalManualDiscount = manualSales.reduce((sum, s) => sum + (Number(s.discount_amount) || 0), 0)
        const totalSale = totalFuelRevenue + totalManualRevenue

        const totalCardHolding = allCardRecords
            .filter(r => r.status === 'pending')
            .reduce((sum, r) => sum + (Number(r.hold_amount) || 0), 0)

        const totalReleased = allCardRecords
            .filter(r => r.status === 'released')
            .reduce((sum, r) => sum + (Number(r.net_amount) || 0), 0)

        const totalNetCash = totalSale - totalCardHolding - totalReleased

        // Product Breakdown
        const productMap: Record<string, number> = {}

        fuelSales.forEach(s => {
            const name = s.nozzles?.products?.name || 'Unknown Fuel'
            productMap[name] = (productMap[name] || 0) + (Number(s.quantity) || 0)
        })

        manualSales.forEach(s => {
            const name = s.products?.name || 'Unknown Item'
            productMap[name] = (productMap[name] || 0) + (Number(s.quantity) || 0)
        })

        const productBreakdown = Object.entries(productMap).map(([name, qty]) => ({ name, qty }))

        return {
            totalSale,
            totalNetCash,
            totalCardHolding,
            totalReleased,
            productBreakdown,
            totalManualDiscount
        }
    }, [fuelSales, manualSales, allCardRecords])

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

            {/* Summary Cards Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-blue-500 shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Sale</p>
                                <h3 className="text-2xl font-bold mt-1">{formatCurrency(summaryData.totalSale)}</h3>
                                {summaryData.totalManualDiscount > 0 && (
                                    <div className="flex items-center gap-1 mt-1 text-[10px] text-orange-600 font-bold bg-orange-50 px-2 py-0.5 rounded w-fit">
                                        <Tag className="w-3 h-3" />
                                        Discounts: {formatCurrency(summaryData.totalManualDiscount)}
                                    </div>
                                )}
                            </div>
                            <div className="p-3 bg-blue-50 rounded-full">
                                <TrendingUp className="w-5 h-5 text-blue-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Net Cash</p>
                                <h3 className="text-2xl font-bold mt-1 text-emerald-600">{formatCurrency(summaryData.totalNetCash)}</h3>
                            </div>
                            <div className="p-3 bg-emerald-50 rounded-full">
                                <Banknote className="w-5 h-5 text-emerald-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-orange-500 shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Card Holding</p>
                                <h3 className="text-2xl font-bold mt-1 text-orange-600">{formatCurrency(summaryData.totalCardHolding)}</h3>
                            </div>
                            <div className="p-3 bg-orange-50 rounded-full">
                                <Wallet className="w-5 h-5 text-orange-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-purple-500 shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Released Amount</p>
                                <h3 className="text-2xl font-bold mt-1 text-purple-600">{formatCurrency(summaryData.totalReleased)}</h3>
                            </div>
                            <div className="p-3 bg-purple-50 rounded-full">
                                <CheckCircle2 className="w-5 h-5 text-purple-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Product Summary Card */}
            <Card className="overflow-hidden border-none shadow-md bg-gradient-to-br from-slate-50 to-white">
                <CardHeader className="bg-slate-100/50 pb-3 border-b">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Layers className="w-5 h-5 text-slate-600" />
                            Product Sales Summary
                        </CardTitle>
                        <Badge variant="outline" className="bg-white">
                            {summaryData.productBreakdown.length} Products
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 divide-x divide-y border-b">
                        {summaryData.productBreakdown.length === 0 ? (
                            <div className="col-span-full p-8 text-center text-muted-foreground italic">
                                No product data for the selected period
                            </div>
                        ) : (
                            summaryData.productBreakdown.map((prod, idx) => (
                                <div key={idx} className="p-4 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors">
                                    <span className="text-xs text-muted-foreground font-medium mb-1 truncate w-full">{prod.name}</span>
                                    <span className="text-lg font-bold text-primary">{prod.qty.toLocaleString()}</span>
                                    <span className="text-[10px] text-muted-foreground uppercase">Units/Ltr</span>
                                </div>
                            ))
                        )}
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
                    <TabsTrigger value="card_holding" className="gap-2 text-orange-600">
                        <HistoryIcon className="w-4 h-4" />
                        Card Holding
                    </TabsTrigger>
                    <TabsTrigger value="released_cards" className="gap-2 text-emerald-600">
                        <CheckCircle2 className="w-4 h-4" />
                        Released Cards
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
                                        <TableHead className="text-right">Opening</TableHead>
                                        <TableHead className="text-right">Closing</TableHead>
                                        <TableHead className="text-right">Sold Qty</TableHead>
                                        <TableHead className="text-right">Revenue</TableHead>
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
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Unit Price</TableHead>
                                        <TableHead className="text-right">Discount</TableHead>
                                        <TableHead className="text-right">Net Total</TableHead>
                                        <TableHead>Payment</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead className="text-right">Profit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={9} className="text-center py-10">Loading...</TableCell></TableRow>
                                    ) : manualSales.length === 0 ? (
                                        <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No records found</TableCell></TableRow>
                                    ) : manualSales.map((sale) => (
                                        <TableRow key={sale.id}>
                                            <TableCell className="font-mono text-xs">
                                                {sale.sale_date ? new Date(sale.sale_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                                            </TableCell>
                                            <TableCell className="font-medium">{sale.products?.name}</TableCell>
                                            <TableCell className="text-right">{sale.quantity}</TableCell>
                                            <TableCell className="text-right font-mono text-xs">Rs. {(sale.unit_price || 0).toLocaleString()}</TableCell>
                                            <TableCell className="text-right">
                                                {sale.discount_amount > 0 ? (
                                                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[10px] gap-1">
                                                        <Tag className="w-2.5 h-2.5" />
                                                        {sale.discount_type === 'percentage'
                                                            ? `${sale.discount_value}%`
                                                            : `Rs. ${sale.discount_amount.toLocaleString()}`
                                                        }
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-bold">Rs. {(sale.total_amount || 0).toLocaleString()}</TableCell>
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

                <TabsContent value="card_holding" className="mt-6">
                    <Card className="border-none shadow-xl bg-background/50 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-orange-500/10 rounded-lg">
                                        <HistoryIcon className="h-5 w-5 text-orange-600" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl">Pending Card Settlements</CardTitle>
                                        <CardDescription>Release on-hold card payments to bank accounts</CardDescription>
                                    </div>
                                </div>
                                <Badge variant="outline" className="border-orange-200 text-orange-700 font-bold px-3">
                                    {cardHoldings.length} Pending
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-xl border border-border/50 bg-background/50 overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/30">
                                            <TableHead>Date</TableHead>
                                            <TableHead className="text-center">Days</TableHead>
                                            <TableHead>Card Type</TableHead>
                                            <TableHead>Card Name</TableHead>
                                            <TableHead className="text-right">Gross Amount</TableHead>
                                            <TableHead className="text-right">Tax (%)</TableHead>
                                            <TableHead className="text-right">Net Amount</TableHead>
                                            <TableHead>Release Date</TableHead>
                                            <TableHead className="text-center">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {cardHoldings.map((hold) => (
                                            <TableRow key={hold.id} className="hover:bg-muted/20">
                                                <TableCell className="font-medium">
                                                    {format(new Date(hold.sale_date), "dd MMM yyyy")}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {(() => {
                                                        const diffTime = Math.abs(new Date(today).getTime() - new Date(hold.sale_date).getTime());
                                                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                                        return (
                                                            <Badge
                                                                variant="outline"
                                                                className={diffDays > 3 ? "bg-rose-50 text-rose-700 border-rose-200 font-bold" : "bg-slate-50 text-slate-600 border-slate-200"}
                                                            >
                                                                {diffDays} {diffDays === 1 ? 'day' : 'days'}
                                                            </Badge>
                                                        );
                                                    })()}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={(hold.card_type === 'bank' || hold.card_type === 'bank_card') ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"}>
                                                        {hold.card_type.toUpperCase().replace('_', ' ')}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-xs">
                                                            {hold.bank_cards?.card_name || hold.supplier_cards?.card_name}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground uppercase">
                                                            {hold.bank_cards?.bank_accounts?.bank_name || hold.supplier_cards?.suppliers?.name}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">{formatCurrency(hold.hold_amount)}</TableCell>
                                                <TableCell className="text-right">
                                                    <span className="text-rose-600 font-bold">{hold.tax_percentage}%</span>
                                                </TableCell>
                                                <TableCell className="text-right font-black text-emerald-600">{formatCurrency(hold.net_amount)}</TableCell>
                                                <TableCell>
                                                    <Input
                                                        type="date"
                                                        className="h-8 w-32 text-[11px]"
                                                        defaultValue={today}
                                                        onChange={(e) => {
                                                            hold.__release_date = e.target.value;
                                                        }}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2 justify-center">
                                                        <Select
                                                            onValueChange={(v) => {
                                                                hold.__target_bank_id = v;
                                                            }}
                                                        >
                                                            <SelectTrigger className="w-[180px] h-8 text-[11px]">
                                                                <SelectValue placeholder="Target Bank..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {bankAccounts
                                                                    .filter(bank => {
                                                                        const isBankCard = hold.card_type === 'bank' || hold.card_type === 'bank_card';
                                                                        if (isBankCard) {
                                                                            return (bank.account_type || 'bank') === 'bank';
                                                                        } else {
                                                                            return bank.account_type === 'supplier';
                                                                        }
                                                                    })
                                                                    .map(bank => (
                                                                        <SelectItem key={bank.id} value={`acc_${bank.id}`}>{bank.account_name}</SelectItem>
                                                                    ))}
                                                                {!(hold.card_type === 'bank' || hold.card_type === 'bank_card') && suppliers.length > 0 && (
                                                                    <>
                                                                        <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase border-t bg-muted/20">Direct Supplier Accounts</div>
                                                                        {suppliers.map(s => (
                                                                            <SelectItem key={s.id} value={`supp_${s.id}`}>{s.name}</SelectItem>
                                                                        ))}
                                                                    </>
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                        <Button
                                                            size="sm"
                                                            className="h-8 bg-orange-600 hover:bg-orange-700 gap-1 px-3"
                                                            onClick={() => {
                                                                if (!hold.__target_bank_id) {
                                                                    toast.error("Please select a target bank account");
                                                                    return;
                                                                }
                                                                handleReleaseHold(hold.id, hold.__target_bank_id, hold.__release_date || today);
                                                            }}
                                                            disabled={isSaving}
                                                        >
                                                            {isSaving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                                            Release
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {cardHoldings.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                                    No pending card settlements found.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="released_cards" className="mt-6">
                    <Card className="border-none shadow-xl bg-background/50 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl">Released Card Settlements</CardTitle>
                                        <CardDescription>History of card payments released to accounts</CardDescription>
                                    </div>
                                </div>
                                <Badge variant="outline" className="border-emerald-200 text-emerald-700 font-bold px-3">
                                    {allCardRecords.filter(r => r.status === 'released').length} Released
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-xl border border-border/50 bg-background/50 overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/30">
                                            <TableHead>Sale Date</TableHead>
                                            <TableHead>Released Date</TableHead>
                                            <TableHead className="text-center whitespace-nowrap">Hold Period</TableHead>
                                            <TableHead>Card Name</TableHead>
                                            <TableHead>Settled To</TableHead>
                                            <TableHead className="text-right">Gross Amount</TableHead>
                                            <TableHead className="text-right">Tax (%)</TableHead>
                                            <TableHead className="text-right">Net Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {allCardRecords
                                            .filter(r => r.status === 'released')
                                            .map((hold) => (
                                                <TableRow key={hold.id} className="hover:bg-muted/20">
                                                    <TableCell className="font-medium">
                                                        {format(new Date(hold.sale_date), "dd MMM yyyy")}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">
                                                        {hold.released_at ? format(new Date(hold.released_at), "dd MMM yyyy HH:mm") : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {hold.released_at ? (
                                                            (() => {
                                                                const day1 = new Date(hold.sale_date).setHours(0, 0, 0, 0);
                                                                const day2 = new Date(hold.released_at).setHours(0, 0, 0, 0);
                                                                const diffDays = Math.ceil(Math.abs(day2 - day1) / (1000 * 60 * 60 * 24));
                                                                return (
                                                                    <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-700">
                                                                        {diffDays} {diffDays === 1 ? 'day' : 'days'}
                                                                    </Badge>
                                                                );
                                                            })()
                                                        ) : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-xs">
                                                                {hold.bank_cards?.card_name || hold.supplier_cards?.card_name}
                                                            </span>
                                                            <span className="text-[10px] text-muted-foreground uppercase">
                                                                {hold.card_type.replace('_', ' ')}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="secondary" className="text-[10px]">
                                                            {hold.bank_accounts?.account_name || hold.suppliers?.name || 'Unknown'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">{formatCurrency(hold.hold_amount)}</TableCell>
                                                    <TableCell className="text-right">
                                                        <span className="text-rose-600 font-bold">{hold.tax_percentage}%</span>
                                                    </TableCell>
                                                    <TableCell className="text-right font-black text-emerald-600">{formatCurrency(hold.net_amount)}</TableCell>
                                                </TableRow>
                                            ))}
                                        {allCardRecords.filter(r => r.status === 'released').length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                                    No released card settlements found for the selected period.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
