"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plus,
  ShoppingCart,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  ClipboardList,
  Truck,
  History,
  XCircle
} from "lucide-react"
import { POListTab } from "@/components/purchases/po-list-tab"
import { RecordDeliveryTab } from "@/components/purchases/record-delivery-tab"
import { DeliveryHistoryTab } from "@/components/purchases/delivery-history-tab"
import { CreatePOTab } from "@/components/purchases/create-po-tab"
import { HoldAlerts } from "@/components/dashboard/hold-alerts"
import { getPurchaseSummary } from "@/app/actions/purchase-orders"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ActiveHoldsTab } from "@/components/purchases/active-holds-tab"
import { getTodayPKT } from "@/lib/utils"
import { getSystemActiveDate } from "@/app/actions/balance"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar as CalendarIcon, Filter as FilterIcon } from "lucide-react"

export default function PurchasesPage() {
  const [activeTab, setActiveTab] = useState("po")
  const [selectedPOForDelivery, setSelectedPOForDelivery] = useState<any>(null)
    const [stats, setStats] = useState({
      totalOrders: 0,
      totalValue: 0,
      totalPaid: 0,
      totalDue: 0,
      totalOnHold: 0,
      totalReleased: 0,
      totalCancelled: 0
    })

  const [dateRange, setDateRange] = useState({
    from: "2024-01-01",
    to: ""
  })

  useEffect(() => {
    const initDate = async () => {
      const activeDate = await getSystemActiveDate()
      setDateRange(prev => ({ ...prev, to: activeDate }))
    }
    initDate()
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const data = await getPurchaseSummary({
        date_from: dateRange.from,
        date_to: dateRange.to
      })
      setStats(data)
    } catch (error) {
      console.error("Failed to fetch purchase stats:", error)
    }
  }, [dateRange])

  useEffect(() => {
    fetchStats()
  }, [activeTab, fetchStats]) // Refresh when tabs or dates change

  const handleRecordDelivery = (po: any) => {
    setSelectedPOForDelivery(po)
    setActiveTab("record")
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-black tracking-tight uppercase">Procurement <span className="text-primary">&</span> Stock Inflow</h1>
            <p className="text-muted-foreground text-sm uppercase tracking-wider font-medium">Manage purchase orders, record deliveries and track supplier ledger.</p>
          </div>
          <Button
            onClick={() => setActiveTab("create")}
            className="font-bold border-2"
            variant={activeTab === "create" ? "secondary" : "default"}
          >
            <Plus className="mr-2 h-4 w-4" /> CREATE PO
          </Button>
        </div>

        {/* Global Date Filter */}
        <div className="flex flex-col sm:flex-row items-end gap-3 bg-white p-4 rounded-xl border shadow-sm">
          <div className="flex flex-col gap-1.5 w-full sm:w-auto">
            <Label className="text-[10px] uppercase font-black text-slate-500 flex items-center gap-1.5 ml-1">
              <CalendarIcon className="h-3 w-3 text-primary" /> From Date
            </Label>
            <Input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
              className="h-10 rounded-lg border-slate-200 font-bold text-sm w-full sm:w-44 focus:ring-primary/20"
            />
          </div>
          <div className="flex flex-col gap-1.5 w-full sm:w-auto">
            <Label className="text-[10px] uppercase font-black text-slate-500 flex items-center gap-1.5 ml-1">
              <FilterIcon className="h-3 w-3 text-primary" /> To Date
            </Label>
            <Input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
              className="h-10 rounded-lg border-slate-200 font-bold text-sm w-full sm:w-44 focus:ring-primary/20"
            />
          </div>
          <div className="hidden sm:block h-10 w-px bg-slate-100 mx-2"></div>
          <div className="flex-1 text-right hidden sm:block">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Filtering all records & summaries</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-l-4 border-l-slate-400">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Active Orders</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black">{stats.totalOrders}</div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Pending/Partial POs</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Order Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-primary">Rs. {stats.totalValue.toLocaleString()}</div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Total committed funds</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-600">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Settled</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-green-600">Rs. {stats.totalPaid.toLocaleString()}</div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Amount debited from accounts</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-destructive">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Outstanding</CardTitle>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-destructive">Rs. {stats.totalDue.toLocaleString()}</div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Liability for pending orders</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500 bg-amber-50/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-amber-700">Pending Holds</CardTitle>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-amber-600">Rs. {stats.totalOnHold.toLocaleString()}</div>
              <p className="text-[10px] text-amber-700/70 uppercase font-bold mt-1">Sum of all missing items</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-600 bg-emerald-50/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Received Post-Hold</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-600">Rs. {stats.totalReleased.toLocaleString()}</div>
              <p className="text-[10px] text-emerald-700/70 uppercase font-bold mt-1">Returned by supplier</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-slate-400 bg-slate-50/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-600">Hold Cancelled Amount</CardTitle>
              <XCircle className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-500">Rs. {stats.totalCancelled.toLocaleString()}</div>
              <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">Forfeited / Written off</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-slate-100 p-1 rounded-xl h-14 w-full justify-start gap-2 shadow-inner overflow-x-auto">
            <TabsTrigger
              value="po"
              className="rounded-lg h-full px-8 data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-primary font-bold uppercase tracking-tighter text-sm whitespace-nowrap"
            >
              <ClipboardList className="mr-2 h-4 w-4" /> Purchase Orders
            </TabsTrigger>
            <TabsTrigger
              value="create"
              className="rounded-lg h-full px-8 data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-primary font-bold uppercase tracking-tighter text-sm whitespace-nowrap"
            >
              <Plus className="mr-2 h-4 w-4" /> Create PO
            </TabsTrigger>
            <TabsTrigger
              value="record"
              className="rounded-lg h-full px-8 data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-primary font-bold uppercase tracking-tighter text-sm whitespace-nowrap"
            >
              <Truck className="mr-2 h-4 w-4" /> Record Delivery
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="rounded-lg h-full px-8 data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-primary font-bold uppercase tracking-tighter text-sm whitespace-nowrap"
            >
              <History className="mr-2 h-4 w-4" /> Delivery History
            </TabsTrigger>
            <TabsTrigger
              value="holds"
              className="rounded-lg h-full px-8 data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-amber-600 font-bold uppercase tracking-tighter text-sm whitespace-nowrap"
            >
              <AlertCircle className="mr-2 h-4 w-4" /> Active Holds
            </TabsTrigger>
          </TabsList>

          <TabsContent value="po" className="mt-0 focus-visible:outline-none">
            <POListTab onCreateDelivery={handleRecordDelivery} dateFilters={dateRange} />
          </TabsContent>

          <TabsContent value="create" className="mt-0 focus-visible:outline-none">
            <CreatePOTab onSuccess={() => setActiveTab("po")} />
          </TabsContent>

          <TabsContent value="record" className="mt-0 focus-visible:outline-none">
            <RecordDeliveryTab
              initialPO={selectedPOForDelivery}
              onSuccess={() => {
                setActiveTab("history")
                setSelectedPOForDelivery(null)
              }}
            />
          </TabsContent>

          <TabsContent value="history" className="mt-0 focus-visible:outline-none">
            <DeliveryHistoryTab dateFilters={dateRange} />
          </TabsContent>

          <TabsContent value="holds" className="mt-0 focus-visible:outline-none">
            <ActiveHoldsTab dateFilters={dateRange} />
          </TabsContent>

        </Tabs>
      </div>
    </TooltipProvider>
  )
}
