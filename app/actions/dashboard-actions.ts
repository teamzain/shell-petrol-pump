"use server"

import { createClient } from "@/lib/supabase/server"
import { getSystemActiveDate } from "./balance"

export type DashboardStats = {
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

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient()
  const today = await getSystemActiveDate()

  // 1. Fetch Products Stats
  const { data: products } = await supabase
    .from("products")
    .select("id, name, current_stock, min_stock_level")
    .eq("status", "active")

  const totalProducts = products?.length || 0
  const lowStockDetails = products?.filter(p => (p.current_stock || 0) <= (p.min_stock_level || 0))
    .map(p => ({ name: p.name, stock: p.current_stock || 0 })) || []
  const lowStockProducts = lowStockDetails.length

  // 2. Fetch Today's Sales
  // Fuel Sales
  const { data: fuelSales } = await supabase
    .from("daily_sales")
    .select("total_amount")
    .eq("sale_date", today)
  
  const fuelRevenue = fuelSales?.reduce((sum, s) => sum + Number(s.total_amount || 0), 0) || 0

  // Manual Sales (Oils/Etc)
  const { data: manualSales } = await supabase
    .from("manual_sales")
    .select("total_amount")
    .eq("sale_date", today)
  
  const manualRevenue = manualSales?.reduce((sum, s) => sum + Number(s.total_amount || 0), 0) || 0

  const todaySales = fuelRevenue + manualRevenue

  // 3. Fetch Today's Expenses
  const { data: expenses } = await supabase
    .from("daily_expenses")
    .select("amount")
    .eq("expense_date", today)
  
  const todayExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0

  // 4. Fetch Cash and Bank Balances
  const { data: balanceStatus } = await supabase
    .from("daily_accounts_status")
    .select("closing_cash, opening_cash, closing_bank, opening_bank")
    .eq("status_date", today)
    .single()

  const cashBalance = balanceStatus?.closing_cash ?? balanceStatus?.opening_cash ?? 0
  const bankBalance = balanceStatus?.closing_bank ?? balanceStatus?.opening_bank ?? 0

  // 5. Fetch Pending Payments (card hold records with status=pending)
  const { data: cardHolds } = await supabase
    .from("card_hold_records")
    .select("amount")
    .eq("status", "pending")

  const pendingPayments = cardHolds?.reduce((sum, h) => sum + Number(h.amount || 0), 0) || 0

  // 6. Fetch Total Supplier Account Balance (total payable to suppliers)
  const { data: supplierAccounts } = await supabase
    .from("company_accounts")
    .select("current_balance")

  const totalSupplierBalance = supplierAccounts?.reduce((sum, a) => sum + Number(a.current_balance || 0), 0) || 0

  return {
    totalProducts,
    lowStockProducts,
    todaySales,
    todayExpenses,
    cashBalance,
    bankBalance,
    lowStockDetails,
    pendingPayments,
    totalSupplierBalance
  }
}
