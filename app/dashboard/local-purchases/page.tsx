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
  XCircle,
  Calendar as CalendarIcon, 
  Filter as FilterIcon,
  ShoppingBag,
  Wallet
} from "lucide-react"
import { LocalPOListTab } from "@/components/local-purchases/local-po-list-tab"
import { RecordDeliveryTab } from "@/components/purchases/record-delivery-tab"
import { DeliveryHistoryTab } from "@/components/purchases/delivery-history-tab"
import { LocalCreatePOTab } from "@/components/local-purchases/local-create-po-tab"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getTodayPKT } from "@/lib/utils"
import { getSystemActiveDate } from "@/app/actions/balance"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getPurchaseOrders } from "@/app/actions/purchase-orders"

export default function LocalPurchasesPage() {
  const [activeTab, setActiveTab] = useState("po")
  const [selectedPOForDelivery, setSelectedPOForDelivery] = useState<any>(null)
  const [stats, setStats] = useState({
      totalOrders: 0,
      totalValue: 0,
      totalPaid: 0,
      totalDue: 0
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
        const data = await getPurchaseOrders({
            date_from: dateRange.from,
            date_to: dateRange.to,
            supplier_type: 'local'
        })
        const localPOs = data?.filter(po => po.purchase_type === 'local') || []
        
        const totalValue = localPOs.reduce((acc, po) => acc + Number(po.estimated_total), 0)
        const totalPaid = localPOs.reduce((acc, po) => acc + Number(po.paid_amount || 0), 0)
        
        setStats({
            totalOrders: localPOs.length,
            totalValue,
            totalPaid,
            totalDue: totalValue - totalPaid
        })
    } catch (error) {
      console.error("Failed to fetch local purchase stats:", error)
    }
  }, [dateRange])

  useEffect(() => {
    fetchStats()
  }, [activeTab, fetchStats])

  const handleRecordDelivery = (po: any) => {
    setSelectedPOForDelivery(po)
    setActiveTab("record")
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-black tracking-tight uppercase">Local <span className="text-amber-500">Procurement</span></h1>
            <p className="text-muted-foreground text-sm uppercase tracking-wider font-medium">Manage cash purchases and deferred payments with local suppliers.</p>
          </div>
          <Button
            onClick={() => setActiveTab("create")}
            className="font-bold border-2 bg-amber-600 hover:bg-amber-700 text-white"
            variant={activeTab === "create" ? "secondary" : "default"}
          >
            <Plus className="mr-2 h-4 w-4" /> CREATE LOCAL PO
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Local Orders</CardTitle>
              <ShoppingBag className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black">{stats.totalOrders}</div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Total orders this period</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Commitment</CardTitle>
              <TrendingUp className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black">Rs. {stats.totalValue.toLocaleString()}</div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Sum of all local POs</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md border-l-4 border-green-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-green-600">Total Paid</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-green-600">Rs. {stats.totalPaid.toLocaleString()}</div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Successfully settled</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md border-l-4 border-red-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-red-600">Total Due</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-red-600">Rs. {stats.totalDue.toLocaleString()}</div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Outstanding debt</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row items-end gap-3 bg-white p-4 rounded-xl border shadow-sm">
          <div className="flex flex-col gap-1.5 w-full sm:w-auto">
            <Label className="text-[10px] uppercase font-black text-slate-500 flex items-center gap-1.5 ml-1">
              <CalendarIcon className="h-3 w-3 text-amber-500" /> From Date
            </Label>
            <Input 
              type="date" 
              className="h-10 font-bold" 
              value={dateRange.from}
              onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5 w-full sm:w-auto">
            <Label className="text-[10px] uppercase font-black text-slate-500 flex items-center gap-1.5 ml-1">
              <CalendarIcon className="h-3 w-3 text-amber-500" /> To Date
            </Label>
            <Input 
              type="date" 
              className="h-10 font-bold" 
              value={dateRange.to}
              onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
            />
          </div>
          <Button variant="outline" className="h-10 font-bold" onClick={fetchStats}>
            <FilterIcon className="h-4 w-4 mr-2" /> Apply Filters
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-slate-100 p-1.5 h-14 rounded-xl border mb-6 flex overflow-x-auto">
            <TabsTrigger value="po" className="flex-1 font-black uppercase text-[10px] tracking-widest gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg h-10">
              <ClipboardList className="h-4 w-4" /> LOCAL ORDERS
            </TabsTrigger>
            <TabsTrigger value="record" className="flex-1 font-black uppercase text-[10px] tracking-widest gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg h-10">
              <Truck className="h-4 w-4" /> RECORD DELIVERY
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 font-black uppercase text-[10px] tracking-widest gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg h-10">
              <History className="h-4 w-4" /> DELIVERY HISTORY
            </TabsTrigger>
            <TabsTrigger value="due" className="flex-1 font-black uppercase text-[10px] tracking-widest gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg h-10">
              <Wallet className="h-4 w-4 text-green-600" /> DUE SETTLEMENT
            </TabsTrigger>
            <TabsTrigger value="create" className="hidden">
              CREATE
            </TabsTrigger>
          </TabsList>

          <TabsContent value="po" className="mt-0 outline-none">
            <LocalPOListTab 
              onCreateDelivery={handleRecordDelivery} 
              dateFilters={dateRange}
            />
          </TabsContent>

          <TabsContent value="due" className="mt-0 outline-none">
            <LocalPOListTab 
              filterMode="due"
              onCreateDelivery={handleRecordDelivery} 
              dateFilters={dateRange}
            />
          </TabsContent>

          <TabsContent value="record" className="mt-0 outline-none">
            <RecordDeliveryTab 
              initialPO={selectedPOForDelivery} 
              onSuccess={() => {
                setSelectedPOForDelivery(null)
                setActiveTab("history")
              }} 
            />
          </TabsContent>

          <TabsContent value="history" className="mt-0 outline-none">
            <DeliveryHistoryTab dateFilters={dateRange} supplierType="local" />
          </TabsContent>

          <TabsContent value="create" className="mt-0 outline-none">
            <LocalCreatePOTab onSuccess={() => setActiveTab("po")} />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}
