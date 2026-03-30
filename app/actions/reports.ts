"use server"

import { createClient } from "@/lib/supabase/server"
import { getTodayPKT, getPreviousDate, getNextDate } from "@/lib/utils"

export async function getDailyReportData(date: string) {
    const supabase = await createClient()
    const targetDate = date || getTodayPKT()

    // 1. Cash & Bank Balances (from daily_accounts_status)
    const { data: dayStatus } = await supabase
        .from("daily_accounts_status")
        .select("*")
        .eq("status_date", targetDate)
        .single()

    // 2. Sales Summary (Fuel + Product) breakdown by Cash vs Card
    // daily_sales uses nozzle_id, so we join nozzles to get product_id
    const { data: fuelSales } = await supabase
        .from("daily_sales")
        .select("total_amount, revenue, quantity, payment_method, nozzle_id, nozzles!inner(product_id)")
        .eq("sale_date", targetDate)
    
    const { data: manualSales } = await supabase
        .from("manual_sales")
        .select("total_amount, quantity, product_id, payment_method")
        .eq("sale_date", targetDate)

    const cashSalesTotal = (fuelSales?.filter(s => s.payment_method === 'cash').reduce((acc: number, s: any) => acc + Number(s.revenue ?? s.total_amount), 0) || 0) +
                         (manualSales?.filter(s => s.payment_method === 'cash').reduce((acc: number, s: any) => acc + Number(s.total_amount), 0) || 0)
    
    const cardSalesTotal = (fuelSales?.filter(s => s.payment_method !== 'cash').reduce((acc: number, s: any) => acc + Number(s.revenue ?? s.total_amount), 0) || 0) +
                         (manualSales?.filter(s => s.payment_method !== 'cash').reduce((acc: number, s: any) => acc + Number(s.total_amount), 0) || 0)

    const totalSale = cashSalesTotal + cardSalesTotal

    // 3. Expenses & Purchases (Breakdown by Cash vs Bank)
    const { data: expenses } = await supabase
        .from("daily_expenses")
        .select("amount, bank_account_id")
        .eq("expense_date", targetDate)

    const { data: internalTxs } = await supabase
        .from("balance_transactions")
        .select("*")
        .eq("transaction_date", targetDate)

    const bankPurchasesFromTxs = internalTxs?.filter(tx => tx.transaction_type === 'transfer_to_supplier')
                            .reduce((acc, tx) => acc + Number(tx.amount), 0) || 0
    
    const cashExpenses = (expenses?.filter(e => !e.bank_account_id).reduce((acc, e) => acc + Number(e.amount), 0) || 0)
    const bankExpenses = (expenses?.filter(e => !!e.bank_account_id).reduce((acc, e) => acc + Number(e.amount), 0) || 0) + bankPurchasesFromTxs

    const totalCashBankPurchase = cashExpenses + bankExpenses

    // 4. Bank Hold/Released (SALES Card Holds)
    const bankHold = internalTxs?.filter(tx => tx.is_hold).reduce((acc, tx) => acc + Number(tx.amount), 0) || 0
    const bankReleased = internalTxs?.filter(tx => tx.card_hold_id && !tx.is_hold).reduce((acc, tx) => acc + Number(tx.amount), 0) || 0

    // 5. Purchase Shortage Holds & Releases
    // Join with deliveries to filter by actual delivery date
    const { data: poHolds } = await supabase
        .from("po_hold_records")
        .select("hold_amount, status, deliveries!inner(delivery_date)")
        .eq("deliveries.delivery_date", targetDate)

    const purchaseHoldOnHold = poHolds?.filter(h => h.status === 'on_hold').reduce((acc, h) => acc + Number(h.hold_amount), 0) || 0
    const purchaseHoldReleased = poHolds?.filter(h => h.status === 'released').reduce((acc, h) => acc + Number(h.hold_amount), 0) || 0

    // 6. Supplier Section
    const { data: companyAccounts } = await supabase.from("company_accounts").select("current_balance, id").order("id")
    const totalCurrentSupplierBalance = companyAccounts?.reduce((acc, b) => acc + Number(b.current_balance), 0) || 0

    const { data: futureTxs } = await supabase
        .from("company_account_transactions")
        .select("amount, transaction_type")
        .gt("transaction_date", targetDate)

    const futureImpact = futureTxs?.reduce((acc, tx) => {
        return tx.transaction_type === 'credit' ? acc - Number(tx.amount) : acc + Number(tx.amount)
    }, 0) || 0
    
    const supplierClosing = totalCurrentSupplierBalance - futureImpact
    
    const { data: dayTxs } = await supabase
        .from("company_account_transactions")
        .select("amount, transaction_type")
        .eq("transaction_date", targetDate)

    const supplierPurchases = dayTxs?.filter(tx => tx.transaction_type === 'credit').reduce((acc, tx) => acc + Number(tx.amount), 0) || 0
    const supplierPayments = dayTxs?.filter(tx => tx.transaction_type === 'debit').reduce((acc, tx) => acc + Number(tx.amount), 0) || 0
    const supplierOpening = supplierClosing - (supplierPurchases - supplierPayments)

    // 7. Supplier Card Holds & Releases
    const { data: supplierCardHolds } = await supabase
        .from("card_hold_records")
        .select("hold_amount, status")
        .not("supplier_card_id", "is", null)
        .eq("sale_date", targetDate)

    const supplierCardOnHold = supplierCardHolds?.filter(h => h.status !== "released")
        .reduce((acc, h) => acc + Number(h.hold_amount), 0) || 0
    const supplierCardReleased = supplierCardHolds?.filter(h => h.status === "released")
        .reduce((acc, h) => acc + Number(h.hold_amount), 0) || 0

    // 8. Stock Summary
    const { data: products } = await supabase.from("products").select("id, name, current_stock, unit").order("name")
    const { data: futureDeliveries } = await supabase.from("deliveries").select("product_id, delivered_quantity").gt("delivery_date", targetDate)
    // Join with nozzles to get product_id for fuel sales
    const { data: futureFuelSalesRaw } = await supabase.from("daily_sales").select("quantity, nozzles!inner(product_id)").gt("sale_date", targetDate)
    const { data: futureManualSales } = await supabase.from("manual_sales").select("product_id, quantity").gt("sale_date", targetDate)

    const { data: todayDeliveries } = await supabase.from("deliveries").select("product_id, delivered_quantity").eq("delivery_date", targetDate)
    // Flatten fuelSales to include product_id from joined nozzle
    const todayFuelSales = (fuelSales || []).map((s: any) => ({ ...s, product_id: s.nozzles?.product_id }))
    const todayManualSales = manualSales || []
    const futureFuelSales = (futureFuelSalesRaw || []).map((s: any) => ({ ...s, product_id: s.nozzles?.product_id }))

    const stockSummary = (products || []).map(p => {
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
                closing: dayStatus?.closing_cash || 0,
                sale: cashSalesTotal,
                expense: cashExpenses
            },
            bank: {
                opening: dayStatus?.opening_bank || 0,
                closing: dayStatus?.closing_bank || 0,
                sale: cardSalesTotal,
                expense: bankExpenses,
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
            closing: supplierClosing,
            cardOnHold: supplierCardOnHold,
            cardReleased: supplierCardReleased,
            purchaseHoldOnHold,
            purchaseHoldReleased
        },
        inventory: stockSummary
    }
}
