"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Fuel,
  DollarSign,
  TrendingUp,
  Package,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  CreditCard,
  Users,
} from "lucide-react"
import Link from "next/link"
import { HoldAlerts } from "@/components/dashboard/hold-alerts"
import { BrandLoader } from "@/components/ui/brand-loader"
import { getDashboardStats } from "@/app/actions/dashboard-actions"

type DashboardStats = {
  totalProducts: number
  lowStockProducts: number
  todaySales: number
  todayExpenses: number
  cashBalance: number
  bankBalance: number
  lowStockDetails: { name: string; stock: number }[]
  pendingPayments: number
  totalSupplierBalance: number
}

type RecentActivity = {
  id: string
  type: "purchase" | "sale" | "expense"
  description: string
  amount: number
  date: string
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    lowStockProducts: 0,
    todaySales: 0,
    todayExpenses: 0,
    cashBalance: 0,
    bankBalance: 0,
    lowStockDetails: [],
    pendingPayments: 0,
    totalSupplierBalance: 0,
  })
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true)
      try {
        const data = await getDashboardStats()
        setStats(data)
      } catch (error) {
        console.error("Failed to fetch dashboard stats:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [])

  const statCards = [
    {
      title: "Total Sales Today",
      value: `Rs. ${stats.todaySales.toLocaleString("en-PK")}`,
      icon: DollarSign,
      description: "Revenue generated today",
      trend: "up",
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Cash Balance",
      value: `Rs. ${stats.cashBalance.toLocaleString("en-PK")}`,
      icon: Fuel,
      description: "Current cash in hand",
      color: "text-chart-2",
      bgColor: "bg-chart-2/10",
    },
    {
      title: "Bank Balance",
      value: `Rs. ${stats.bankBalance.toLocaleString("en-PK")}`,
      icon: TrendingUp,
      description: "Current bank balance",
      color: "text-chart-3",
      bgColor: "bg-chart-3/10",
    },
    {
      title: "Active Products",
      value: stats.totalProducts.toString(),
      icon: Package,
      description: `${stats.lowStockProducts} with low stock`,
      alert: stats.lowStockProducts > 0,
      color: "text-chart-4",
      bgColor: "bg-chart-4/10",
    },
    {
      title: "Pending Payments",
      value: `Rs. ${stats.pendingPayments.toLocaleString("en-PK")}`,
      icon: CreditCard,
      description: "Total card payments on hold",
      alert: stats.pendingPayments > 0,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      title: "Supplier Balance",
      value: `Rs. ${stats.totalSupplierBalance.toLocaleString("en-PK")}`,
      icon: Users,
      description: "Total payable to suppliers",
      color: "text-rose-500",
      bgColor: "bg-rose-500/10",
    },
  ]

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in duration-500">
        <BrandLoader size="lg" className="mb-6" />
        <p className="text-muted-foreground font-medium animate-pulse tracking-wide italic">Preparing your dashboard analytics...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[900] tracking-tighter text-slate-900 uppercase">Dashboard</h1>
          <p className="text-muted-foreground font-medium italic">
            Welcome back! Here is your station overview.
          </p>
        </div>
        <div className="flex gap-2">
        </div>
      </div>

      {/* Daily Operations Widget */}
      {/* <DailyOperationsWidget /> */}

      {/* Holds Alerts */}
      <div className="grid gap-6 md:grid-cols-1">
        <HoldAlerts onlyToday={true} />
      </div>

      {/* Stats Grid - Row 1 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.slice(0,3).map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                {stat.alert && (
                  <AlertTriangle className="w-3 h-3 text-destructive" />
                )}
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stats Grid - Row 2 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.slice(3).map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                {stat.alert && (
                  <AlertTriangle className="w-3 h-3 text-destructive" />
                )}
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Low Stock Alert */}
      <div className="grid gap-6 md:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Stock Alerts
            </CardTitle>
            <CardDescription>Products requiring attention</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.lowStockProducts === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>All products are well stocked</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  {stats.lowStockDetails.map((product, index) => (
                    <div key={index} className="flex items-center justify-between p-2 rounded-md bg-destructive/5 border border-destructive/10">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        <span className="text-sm font-medium">{product.name}</span>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                        Stock: {product.stock}
                      </span>
                    </div>
                  ))}
                </div>
                <Link href="/dashboard/inventory">
                  <Button variant="outline" className="w-full bg-transparent">
                    View Inventory
                    <ArrowUpRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>


    </div>
  )
}
