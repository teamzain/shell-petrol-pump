"use client"

import { useState, useEffect } from "react"
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
  History
} from "lucide-react"
import { POListTab } from "@/components/purchases/po-list-tab"
import { RecordDeliveryTab } from "@/components/purchases/record-delivery-tab"
import { DeliveryHistoryTab } from "@/components/purchases/delivery-history-tab"
import { CreatePOTab } from "@/components/purchases/create-po-tab"
import { HoldAlerts } from "@/components/dashboard/hold-alerts"
import { getPurchaseSummary } from "@/app/actions/purchase-orders"

export default function PurchasesPage() {
  const [activeTab, setActiveTab] = useState("po")
  const [selectedPOForDelivery, setSelectedPOForDelivery] = useState<any>(null)
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalValue: 0,
    totalPaid: 0,
    totalDue: 0
  })

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await getPurchaseSummary()
        setStats(data)
      } catch (error) {
        console.error("Failed to fetch purchase stats:", error)
      }
    }
    fetchStats()
  }, [activeTab]) // Refresh when tabs change

  const handleRecordDelivery = (po: any) => {
    setSelectedPOForDelivery(po)
    setActiveTab("record")
  }

  return (
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
          <POListTab onCreateDelivery={handleRecordDelivery} />
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
          <DeliveryHistoryTab />
        </TabsContent>

        <TabsContent value="holds" className="mt-0 focus-visible:outline-none max-w-4xl mx-auto">
          <div className="bg-amber-50 rounded-xl p-6 border border-amber-200">
            <div className="mb-6 space-y-2">
              <h2 className="text-xl font-black uppercase text-amber-800 flex items-center gap-2">
                <AlertCircle className="h-6 w-6" /> Pending Hold Tracking
              </h2>
              <p className="text-sm text-amber-700/80">
                Track and manage all partial deliveries where supplier funds are held for undelivered inventory items.
              </p>
            </div>
            <HoldAlerts onlyToday={false} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
