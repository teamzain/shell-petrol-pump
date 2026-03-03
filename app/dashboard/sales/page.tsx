"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { getTodayPKT, cn } from "@/lib/utils"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, ArrowRightLeft, Calendar as CalendarIcon, Save, AlertCircle, CheckCircle2, Droplet, CreditCard, Receipt, FileText, Download, TrendingUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { BrandLoader } from "@/components/ui/brand-loader"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select"

export default function SalesHistoryPage() {
  const { toast } = useToast()
  const supabase = createClient()

  // State
  const [activeTab, setActiveTab] = useState("daily")
  const [selectedDate, setSelectedDate] = useState<string>(getTodayPKT())
  const [loading, setLoading] = useState(true)

  // Data
  const [sales, setSales] = useState<any[]>([])
  const [readings, setReadings] = useState<any[]>([])
  const [holds, setHolds] = useState<any[]>([])
  const [sessionUser, setSessionUser] = useState<string>("")

  // Hold Release Modal
  const [holdToRelease, setHoldToRelease] = useState<any>(null)
  const [releasing, setReleasing] = useState(false)

  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    // get user inline for releases
    supabase.auth.getSession().then(({ data }) => setSessionUser(data.session?.user?.id || ''))
    fetchData()
    setIsMounted(true)
  }, [selectedDate, activeTab])

  const fetchData = async () => {
    setLoading(true)
    try {
      if (activeTab === "daily") {
        const { data, error } = await supabase
          .from('daily_sales')
          .select(`
            id, sale_date, liters_sold, rate_per_liter, total_amount, payment_type, hold_status,
            dispensers(name), nozzles(nozzle_number), products(name), payment_methods(name)
          `)
          .eq('sale_date', selectedDate)
          .order('created_at', { ascending: false })
        if (error) throw error
        setSales(data || [])
      }
      else if (activeTab === "readings") {
        const { data, error } = await supabase
          .from('daily_meter_readings')
          .select(`
            id, reading_date, opening_reading, closing_reading, liters_sold,
            nozzles(nozzle_number), dispensers(name)
          `)
          .eq('reading_date', selectedDate)
          .order('created_at', { ascending: false })
        if (error) throw error
        setReadings(data || [])
      }
      else if (activeTab === "holds") {
        // Fetch all non-released holds globally for managing, maybe filter by date optionally, but usually see all pending
        const { data, error } = await supabase
          .from('card_hold_records')
          .select(`
            id, sale_date, hold_amount, expected_release_date, actual_release_date, status, payment_type,
            payment_methods(name), suppliers(name)
          `)
          .order('sale_date', { ascending: false })
        if (error) throw error
        setHolds(data || [])
      }

    } catch (err: any) {
      console.error(err)
      toast({ title: "Error loading data", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleReleaseHold = async () => {
    if (!holdToRelease) return
    setReleasing(true)
    try {
      const { error } = await supabase.rpc('release_card_hold', {
        p_hold_id: holdToRelease.id,
        p_user_id: sessionUser || '00000000-0000-0000-0000-000000000000'
      })
      if (error) throw error

      toast({ title: "Success", description: "Hold successfully released." })
      setHoldToRelease(null)
      fetchData() // Refresh list
    } catch (err: any) {
      toast({ title: "Release Failed", description: err.message, variant: "destructive" })
    } finally {
      setReleasing(false)
    }
  }

  // --- Render Helpers ---
  const dailyTotalAmount = sales.reduce((s, row) => s + Number(row.total_amount), 0)
  const dailyTotalLiters = sales.reduce((s, row) => s + Number(row.liters_sold), 0)

  // Hold Status Component
  const HoldStatusBadge = ({ hold }: { hold: any }) => {
    if (hold.status === 'released') return <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">Released</Badge>

    const expDate = hold.expected_release_date ? new Date(hold.expected_release_date) : null
    const today = new Date(selectedDate) // Using selected date as anchor for "today"

    if (!expDate) return <Badge variant="secondary" className="bg-slate-100/80">Pending</Badge>

    const diffTime = expDate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 shadow-sm flex gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500 my-auto" />Overdue</Badge> // Red
    if (diffDays === 0) return <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-200">Due Today</Badge> // Orange
    if (diffDays <= 3) return <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 border-yellow-200 flex gap-1"><span className="h-1.5 w-1.5 rounded-full bg-yellow-500 my-auto" />In {diffDays} days</Badge> // Yellow

    return <Badge variant="outline" className="bg-white">Upcoming</Badge> // Default
  }

  if (loading || !isMounted) return <div className="h-screen flex items-center justify-center"><BrandLoader /></div>

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10" suppressHydrationWarning>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 border-border/40">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted/60 transition-colors" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-3xl font-black tracking-tighter sm:text-4xl relative">
              Sales <span className="text-primary tracking-tighter">History</span>
              <div className="absolute -bottom-1 left-0 w-1/3 h-[2px] bg-primary/20 rounded-full" />
            </h1>
          </div>
          <p className="text-muted-foreground ml-[40px] text-sm font-medium tracking-tight">
            Manage daily sales, meter readings, and pending card holds.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" className="shadow-sm bg-white" asChild>
            <Link href="/dashboard/sales/daily-entry">
              Record New Sale
            </Link>
          </Button>
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-blue-500/30 rounded-lg blur opacity-40 group-hover:opacity-100 transition duration-500" />
            <div className="relative flex items-center bg-white border border-border/50 rounded-lg shadow-sm">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="pl-10 h-10 border-0 focus-visible:ring-0 bg-transparent font-black tracking-widest text-[#1a1a1a]"
              />
              <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none rounded-r-lg" />
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full md:w-[600px] grid-cols-4 bg-muted/60 p-1 rounded-xl">
          <TabsTrigger value="daily" className="font-bold flex items-center gap-2 rounded-lg data-[state=active]:shadow-sm">
            <Receipt className="h-4 w-4" /> Daily Sales
          </TabsTrigger>
          <TabsTrigger value="readings" className="font-bold flex items-center gap-2 rounded-lg data-[state=active]:shadow-sm">
            <Droplet className="h-4 w-4" /> Readings
          </TabsTrigger>
          <TabsTrigger value="holds" className="font-bold flex items-center gap-2 rounded-lg data-[state=active]:shadow-sm">
            <div className="relative">
              <CreditCard className="h-4 w-4" />
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
            </div>
            Holds
          </TabsTrigger>
          <TabsTrigger value="reports" className="font-bold flex items-center gap-2 rounded-lg data-[state=active]:shadow-sm text-primary">
            <FileText className="h-4 w-4" /> Reports
          </TabsTrigger>
        </TabsList>

        {/* TAB: DAILY SALES */}
        <TabsContent value="daily" className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="shadow-sm border-white/40 bg-[#f8fafc]/60 backdrop-blur-sm relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-[#f8fafc] to-[#e2e8f0] opacity-50 z-0" />
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10 transition-transform duration-700 group-hover:scale-150" />
              <CardHeader className="pb-2 relative z-10 flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-[11px] uppercase tracking-widest font-black text-muted-foreground flex items-center gap-2">
                    <Receipt className="h-3.5 w-3.5" /> Total Invoices
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-3xl font-black tracking-tighter text-[#1e293b]">
                  {sales.length}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-white/40 bg-[#f8fafc]/60 backdrop-blur-sm relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-[#f8fafc] to-[#e2e8f0] opacity-50 z-0" />
              <div className="absolute top-0 left-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -ml-10 -mt-10 transition-transform duration-700 group-hover:scale-150" />
              <CardHeader className="pb-2 relative z-10 flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-[11px] uppercase tracking-widest font-black text-primary/80 flex items-center gap-2">
                    <Droplet className="h-3.5 w-3.5" /> Total Liters
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-3xl font-black tracking-tighter text-primary">
                  {dailyTotalLiters.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  <span className="text-base text-primary/60 ml-1 font-medium tracking-normal">L</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-white/40 bg-gradient-to-br from-slate-900 to-slate-800 text-white relative overflow-hidden group">
              <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay z-0" />
              <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/40 rounded-full blur-3xl -mr-10 -mb-10 transition-transform duration-700 group-hover:scale-150" />
              <CardHeader className="pb-2 relative z-10 flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-[11px] uppercase tracking-widest font-black text-slate-300 flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5" /> Total Sale Amount
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-4xl font-black tracking-tighter drop-shadow-sm flex items-end gap-1">
                  <span className="text-lg text-slate-300 font-medium tracking-normal mb-1.5">PKR</span>
                  {dailyTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm border-border/40 overflow-hidden">
            <div className="overflow-x-auto">
              {loading ? (
                <div className="h-48 flex items-center justify-center">
                  <BrandLoader size="sm" />
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="font-bold text-xs uppercase tracking-wider h-11">Dispenser</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Product</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider text-right">Liters</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider text-right">Amount (PKR)</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider text-center">Payment Method</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                          No sales recorded for this date.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sales.map((sale) => (
                        <TableRow key={sale.id} className="hover:bg-muted/10 transition-colors">
                          <TableCell className="font-medium">
                            {sale.dispensers.name}
                            <div className="text-[10px] text-muted-foreground uppercase">Nozzle {sale.nozzles.nozzle_number}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-white">{sale.products.name}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-black tracking-tight">{Number(sale.liters_sold).toFixed(2)}</TableCell>
                          <TableCell className="text-right font-black text-primary tracking-tight">{Number(sale.total_amount).toLocaleString()}</TableCell>
                          <TableCell className="text-center">
                            <span className="text-xs font-bold bg-muted px-2 py-1 rounded-md">
                              {sale.payment_methods.name}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {sale.hold_status === 'none' ? (
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none">Completed</Badge>
                            ) : sale.hold_status === 'pending' ? (
                              <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-none flex items-center gap-1 w-fit mx-auto">
                                <AlertCircle className="h-3 w-3" /> On Hold
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground border-dashed">Released</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* TAB: METER READINGS */}
        <TabsContent value="readings" className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card className="shadow-sm border-border/40 overflow-hidden">
            <CardHeader className="bg-muted/10 pb-4">
              <CardTitle className="text-lg">Daily Meter Readings</CardTitle>
              <CardDescription>Opening and closing readings recorded for the day.</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="h-48 flex items-center justify-center">
                  <BrandLoader size="sm" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="font-bold text-xs uppercase tracking-wider h-11">Dispenser</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider text-right">Opening</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider text-right">Closing</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider text-right">Liters Sold</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {readings.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                          No meter readings for this date.
                        </TableCell>
                      </TableRow>
                    ) : (
                      readings.map((reading) => (
                        <TableRow key={reading.id} className="hover:bg-muted/10">
                          <TableCell className="font-medium">
                            <span className="flex items-center gap-2">
                              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                              {reading.dispensers.name} - Nozzle {reading.nozzles.nozzle_number}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {Number(reading.opening_reading).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            {Number(reading.closing_reading).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-black tracking-tight text-primary bg-primary/5">
                            {Number(reading.liters_sold).toFixed(2)} L
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* TAB: CARD HOLDS */}
        <TabsContent value="holds" className="mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-800 flex items-start gap-4">
            <div className="mt-0.5">
              <AlertCircle className="h-5 w-5 text-orange-600" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold tracking-tight">Pending Card Reconcialiations</h4>
              <p className="text-sm opacity-80 leading-snug">
                These are amounts recorded via Cards that are currently "On Hold". When the bank or supplier clears the payment to your company account, mark them as Released here. This credits your system's company account.
              </p>
            </div>
          </div>

          <Card className="shadow-sm border-border/40 overflow-hidden">
            <div className="overflow-x-auto">
              {loading ? (
                <div className="h-48 flex items-center justify-center">
                  <BrandLoader size="sm" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-bold text-[10px] uppercase tracking-wider w-[120px]">Sale Date</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-wider">Payment Method</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-wider text-right">Amount (PKR)</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-wider">Expected Release</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-wider text-center">Status</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-wider text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holds.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                          No pending card holds.
                        </TableCell>
                      </TableRow>
                    ) : (
                      holds.map((hold) => (
                        <TableRow key={hold.id} className="hover:bg-muted/10 transition-colors">
                          <TableCell className="font-mono text-xs">{format(new Date(hold.sale_date), 'dd MMM yyyy')}</TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">{hold.payment_methods.name}</div>
                            {hold.payment_type === 'supplier_card' && hold.suppliers && (
                              <div className="text-[10px] text-muted-foreground">via {hold.suppliers.name}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-black tracking-tight text-[#1a1a1a]">
                            {Number(hold.hold_amount).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">
                              {hold.expected_release_date ? format(new Date(hold.expected_release_date), 'dd MMM yyyy') : '-'}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <HoldStatusBadge hold={hold} />
                          </TableCell>
                          <TableCell className="text-right">
                            {hold.status !== 'released' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-green-200 text-green-700 hover:bg-green-50 shadow-sm"
                                onClick={() => setHoldToRelease(hold)}
                              >
                                <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                                Release
                              </Button>
                            )}
                            {hold.status === 'released' && hold.actual_release_date && (
                              <div className="text-[10px] text-muted-foreground px-2">
                                Cleared on<br />{format(new Date(hold.actual_release_date), 'dd MMM')}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* TAB: REPORTS */}
        <TabsContent value="reports" className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card className="border-primary/20 bg-primary/5 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <FileText className="h-5 w-5" /> Reporting Center
              </CardTitle>
              <CardDescription>View detailed summaries and generate consolidated reports.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="p-5 rounded-xl bg-white border shadow-sm flex flex-col items-center text-center gap-3 hover:border-primary/50 transition-colors cursor-pointer group">
                  <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                    <Receipt className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-bold">Daily Summary Report</h4>
                    <p className="text-xs text-muted-foreground mt-1 px-4 leading-snug">Product wise, payment wise, and nozzle wise breakdown of today's sales.</p>
                  </div>
                  <Button variant="ghost" size="sm" className="mt-2 w-full text-primary hover:text-primary hover:bg-primary/5">View Report</Button>
                </div>

                <div className="p-5 rounded-xl bg-white border shadow-sm flex flex-col items-center text-center gap-3 hover:border-orange-500/50 transition-colors cursor-pointer group">
                  <div className="h-12 w-12 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform">
                    <CreditCard className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-bold">Card Hold Pending Report</h4>
                    <p className="text-xs text-muted-foreground mt-1 px-4 leading-snug">Detailed view of all pending bank and supplier card reconciliations.</p>
                  </div>
                  <Button variant="ghost" size="sm" className="mt-2 w-full text-orange-600 hover:text-orange-700 hover:bg-orange-50">View Report</Button>
                </div>

                <div className="p-5 rounded-xl bg-white border shadow-sm flex flex-col items-center text-center gap-3 hover:border-slate-800 transition-colors cursor-pointer group">
                  <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 group-hover:scale-110 transition-transform">
                    <CalendarIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-bold">Monthly Summary</h4>
                    <p className="text-xs text-muted-foreground mt-1 px-4 leading-snug">Week by week aggregation of liters sold, cash received, and cards.</p>
                  </div>
                  <Button variant="ghost" size="sm" className="mt-2 w-full">View Report</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Release Hold Dialog */}
      <Dialog open={!!holdToRelease} onOpenChange={(open) => !open && setHoldToRelease(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release Card Hold</DialogTitle>
            <DialogDescription>
              Confirm that you have received the funds for this hold.
            </DialogDescription>
          </DialogHeader>
          {holdToRelease && (
            <div className="py-4 space-y-4">
              <div className="p-4 rounded-lg bg-slate-50 border">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm text-muted-foreground">Original Sale Date</div>
                  <div className="font-bold">{format(new Date(holdToRelease.sale_date), 'dd MMM yyyy')}</div>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm text-muted-foreground">Payment Method</div>
                  <div className="font-bold">{holdToRelease.payment_methods.name}</div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t mt-2">
                  <div className="font-bold text-slate-700 uppercase text-xs tracking-widest">Amount to Release</div>
                  <div className="text-xl font-black text-primary">PKR {Number(holdToRelease.hold_amount).toLocaleString()}</div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Releasing this hold will update the transaction status.
                {holdToRelease.payment_type === 'supplier_card' && holdToRelease.suppliers && (
                  <span className="block mt-2 text-green-700 font-medium p-2 bg-green-50 rounded">
                    ✓ Funds will be automatically credited to your {holdToRelease.suppliers.name} company account.
                  </span>
                )}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldToRelease(null)} disabled={releasing}>Cancel</Button>
            <Button onClick={handleReleaseHold} disabled={releasing} className="bg-green-600 hover:bg-green-700">
              {releasing ? <BrandLoader size="xs" /> : <><CheckCircle2 className="mr-2 h-4 w-4" /> Confirm Receipt</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
