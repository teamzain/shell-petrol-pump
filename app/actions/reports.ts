"use server"

import { createClient } from "@/lib/supabase/server"
import { getTodayPKT, getPreviousDate } from "@/lib/utils"

export async function getDailyReportData(date: string) {
    const supabase = await createClient()
    const targetDate = date || getTodayPKT()

    // 1. Cash & Bank Balances (from daily_accounts_status)
    const { data: dayStatus } = await supabase
        .from("daily_accounts_status")
        .select("*")
        .eq("status_date", targetDate)
        .single()

    // 2. Sales Summary (Fuel + Product)
    const { data: fuelSales } = await supabase
        .from("daily_sales")
        .select("total_amount, revenue, quantity, product_id")
        .eq("sale_date", targetDate)
    
    const { data: manualSales } = await supabase
        .from("manual_sales")
        .select("total_amount, quantity, product_id")
        .eq("sale_date", targetDate)

    const totalSale = (fuelSales?.reduce((acc: number, s: any) => acc + Number(s.revenue ?? s.total_amount), 0) || 0) +
                    (manualSales?.reduce((acc: number, s: any) => acc + Number(s.total_amount), 0) || 0)

    // 3. Expenses & Purchases (from Cash/Bank only)
    const { data: expenses } = await supabase
        .from("daily_expenses")
        .select("amount, bank_account_id")
        .eq("expense_date", targetDate)

    const { data: internalTxs } = await supabase
        .from("balance_transactions")
        .select("*")
        .eq("transaction_date", targetDate)

    const bankPurchases = internalTxs?.filter(tx => tx.transaction_type === 'transfer_to_supplier')
                            .reduce((acc, tx) => acc + Number(tx.amount), 0) || 0
    
    const totalCashBankPurchase = bankPurchases + (expenses?.reduce((acc, e) => acc + Number(e.amount), 0) || 0)

    // 4. Bank Hold/Released
    const bankHold = internalTxs?.filter(tx => tx.is_hold).reduce((acc, tx) => acc + Number(tx.amount), 0) || 0
    const bankReleased = internalTxs?.filter(tx => tx.card_hold_id && !tx.is_hold).reduce((acc, tx) => acc + Number(tx.amount), 0) || 0

    // 5. Supplier Section
    // Opening balance = Current Balance walks back
    const { data: companyAccounts } = await supabase.from("company_accounts").select("current_balance, id").order("id") // Stable ordering
    const totalCurrentSupplierBalance = companyAccounts?.reduce((acc, b) => acc + Number(b.current_balance), 0) || 0

    // Get all transactions after targets date to compute opening
    const { data: futureTxs } = await supabase
        .from("company_account_transactions")
        .select("amount, transaction_type")
        .gt("transaction_date", targetDate)

    const futureImpact = futureTxs?.reduce((acc, tx) => {
        return tx.transaction_type === 'credit' ? acc - Number(tx.amount) : acc + Number(tx.amount)
    }, 0) || 0
    
    // Total closing for the day is current - future
    const supplierClosing = totalCurrentSupplierBalance - futureImpact
    
    // Transactions ON the target day
    const { data: dayTxs } = await supabase
        .from("company_account_transactions")
        .select("amount, transaction_type")
        .eq("transaction_date", targetDate)

    const supplierPurchases = dayTxs?.filter(tx => tx.transaction_type === 'credit').reduce((acc, tx) => acc + Number(tx.amount), 0) || 0
    const supplierPayments = dayTxs?.filter(tx => tx.transaction_type === 'debit').reduce((acc, tx) => acc + Number(tx.amount), 0) || 0
    const supplierOpening = supplierClosing - (supplierPurchases - supplierPayments)

    // 6. Stock Summary
    const { data: products } = await supabase.from("products").select("id, name, current_stock, unit").order("name") // Stable ordering
    const { data: futureDeliveries } = await supabase.from("deliveries").select("product_id, delivered_quantity").gt("delivery_date", targetDate)
    const { data: futureFuelSales } = await supabase.from("daily_sales").select("product_id, quantity").gt("sale_date", targetDate)
    const { data: futureManualSales } = await supabase.from("manual_sales").select("product_id, quantity").gt("sale_date", targetDate)

    const { data: todayDeliveries } = await supabase.from("deliveries").select("product_id, delivered_quantity").eq("delivery_date", targetDate)
    const todayFuelSales = fuelSales || []
    const todayManualSales = manualSales || []

    const stockSummary = products?.map(p => {
        const afterIn = futureDeliveries?.filter(d => d.product_id === p.id).reduce((acc, d) => acc + Number(d.delivered_quantity), 0) || 0
        const afterOut = (futureFuelSales?.filter(s => s.product_id === p.id).reduce((acc, s) => acc + Number(s.quantity), 0) || 0) +
                         (futureManualSales?.filter(s => s.product_id === p.id).reduce((acc, s) => acc + Number(s.quantity), 0) || 0)
        
        const closingStock = Number(p.current_stock) - afterIn + afterOut
        
        const todayIn = todayDeliveries?.filter(d => d.product_id === p.id).reduce((acc, d) => acc + Number(d.delivered_quantity), 0) || 0
        const todayOut = (todayFuelSales?.filter(s => s.product_id === p.id).reduce((acc, s) => acc + Number(s.quantity), 0) || 0) +
                          (todayManualSales?.filter(s => s.product_id === p.id).reduce((acc, s) => acc + Number(s.quantity), 0) || 0)
        
        const openingStock = closingStock - todayIn + todayOut

        return {
            name: p.name,
            opening: openingStock,
            in: todayIn,
            out: todayOut,
            closing: closingStock,
            unit: p.unit
        }
    })

    return {
        financials: {
            cash: {
                opening: dayStatus?.opening_cash || 0,
                closing: dayStatus?.closing_cash || 0
            },
            bank: {
                opening: dayStatus?.opening_bank || 0,
                closing: dayStatus?.closing_bank || 0,
                hold: bankHold,
                released: bankReleased
            },
            totalSale,
            totalPurchase: totalCashBankPurchase
        },
        suppliers: {
            opening: supplierOpening,
            additions: supplierPurchases,
            payments: supplierPayments,
            closing: supplierClosing
        },
        inventory: stockSummary
    }
}
