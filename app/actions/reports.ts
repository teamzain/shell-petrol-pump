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
        .select("total_amount, quantity, product_id, payment_method, discount_amount")
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

    // Filter out holds from actual expenses/transfers
    const actualInternalTxs = internalTxs?.filter(tx => !tx.is_hold && !tx.card_hold_id) || []
    
    const bankPurchasesOut = actualInternalTxs
        .filter(tx => tx.transaction_type === 'transfer_to_supplier' && tx.bank_account_id)
        .reduce((acc, tx) => acc + Number(tx.amount), 0)
    
    const cashPurchasesOut = actualInternalTxs
        .filter(tx => tx.transaction_type === 'transfer_to_supplier' && !tx.bank_account_id)
        .reduce((acc, tx) => acc + Number(tx.amount), 0)

    const bankSupplierInflow = actualInternalTxs
        .filter(tx => tx.transaction_type === 'supplier_to_bank')
        .reduce((acc, tx) => acc + Number(tx.amount), 0)

    const cashExpenses = (expenses?.filter(e => !e.bank_account_id).reduce((acc, e) => acc + Number(e.amount), 0) || 0) + cashPurchasesOut
    const bankExpenses = Math.max(0, (expenses?.filter(e => !!e.bank_account_id).reduce((acc, e) => acc + Number(e.amount), 0) || 0) + bankPurchasesOut - bankSupplierInflow)

    const totalCashBankPurchase = cashExpenses + bankExpenses

    // 4. Bank Hold/Released (SALES Card Holds - BANK CARDS ONLY)
    const { data: bankCardRecords } = await supabase
        .from("card_hold_records")
        .select("hold_amount, net_amount, status, released_at, sale_date")
        .not("bank_card_id", "is", null)
        .or(`sale_date.eq.${targetDate},released_at.gte.${targetDate}T00:00:00,released_at.lte.${targetDate}T23:59:59`)

    const bankHold = bankCardRecords?.filter(r => r.sale_date === targetDate)
        .reduce((acc, r) => acc + Number(r.hold_amount), 0) || 0
    
    // Released today: Check if the string date matches the target date
    const bankReleased = bankCardRecords?.filter(r => r.status === 'released' && r.released_at?.startsWith(targetDate))
        .reduce((acc, r) => acc + Number(r.net_amount), 0) || 0

    // 5. Purchase Shortage Holds (Created Today)
    const { data: createdHolds } = await supabase
        .from("po_hold_records")
        .select("hold_amount, deliveries!inner(delivery_date)")
        .filter("deliveries.delivery_date", "eq", targetDate)

    // 5b. Purchase Shortage Releases (Released Today)
    const { data: releasedHolds } = await supabase
        .from("po_hold_records")
        .select("hold_amount, status, actual_return_date")
        .eq("actual_return_date", targetDate)

    const purchaseHoldOnHold = createdHolds?.reduce((acc, h) => acc + Number(h.hold_amount), 0) || 0
    const purchaseHoldReleased = (releasedHolds || [])
        .filter(h => h.status?.toLowerCase() === 'released')
        .reduce((acc, h) => acc + Number(h.hold_amount), 0) || 0
    const purchaseHoldCancelled = (releasedHolds || [])
        .filter(h => h.status?.toLowerCase() === 'cancelled')
        .reduce((acc, h) => acc + Number(h.hold_amount), 0) || 0

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
        .select("amount, transaction_type, transaction_source, note")
        .eq("transaction_date", targetDate)

    const supplierPurchases = dayTxs?.filter(tx => 
        tx.transaction_type === 'credit' && 
        tx.transaction_source !== 'opening_balance' &&
        !tx.note?.toLowerCase().includes('initial') &&
        !tx.note?.toLowerCase().includes('opening balance')
    ).reduce((acc, tx) => acc + Number(tx.amount), 0) || 0
    const supplierPayments = dayTxs?.filter(tx => tx.transaction_type === 'debit').reduce((acc, tx) => acc + Number(tx.amount), 0) || 0
    const supplierOpening = supplierClosing - (supplierPurchases - supplierPayments)

    // 7. Supplier Card Holds & Releases
    const { data: supplierCardRecords } = await supabase
        .from("card_hold_records")
        .select("hold_amount, net_amount, status, released_at, sale_date")
        .not("supplier_card_id", "is", null)
        .or(`sale_date.eq.${targetDate},released_at.gte.${targetDate}T00:00:00,released_at.lte.${targetDate}T23:59:59`)

    const supplierCardOnHold = supplierCardRecords?.filter(r => r.sale_date === targetDate)
        .reduce((acc, r) => acc + Number(r.hold_amount), 0) || 0
    
    const supplierCardReleased = supplierCardRecords?.filter(r => r.status === "released" && r.released_at?.startsWith(targetDate))
        .reduce((acc, r) => acc + Number(r.net_amount), 0) || 0
    
    const supplierCardCancelled = supplierCardRecords?.filter(r => r.status === "cancelled")
        .reduce((acc, r) => acc + Number(r.hold_amount), 0) || 0

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

    // Fetch today's dip readings
    const { data: todayDips } = await supabase
        .from("tank_reconciliation_records")
        .select("gain_amount, loss_amount, actual_stock, current_stock, dip_volume, tanks!inner(product_id)")
        .eq("reading_date", targetDate)

    const dipSummaryByProduct = (todayDips || []).reduce((acc: any, dip: any) => {
        const pid = dip.tanks?.product_id
        if (!acc[pid]) {
            acc[pid] = { gain: 0, loss: 0, actual: 0, current: 0, dipsFound: false }
        }
        acc[pid].gain += Number(dip.gain_amount || 0)
        acc[pid].loss += Number(dip.loss_amount || 0)
        acc[pid].actual += Number(dip.actual_stock || 0) // New Physical Stock Input
        acc[pid].current += Number(dip.current_stock || 0) // Before dip calculation
        acc[pid].dipsFound = true
        return acc
    }, {})

    // Fetch ALL past dip readings before targetDate to correct the system stock
    const { data: pastDips } = await supabase
        .from("tank_reconciliation_records")
        .select("gain_amount, loss_amount, tanks!inner(product_id)")
        .lt("reading_date", targetDate)

    const pastDipNetByProduct = (pastDips || []).reduce((acc: any, dip: any) => {
        const pid = dip.tanks?.product_id
        if (!acc[pid]) acc[pid] = 0
        acc[pid] += Number(dip.gain_amount || 0) - Number(dip.loss_amount || 0)
        return acc
    }, {})

    const stockSummary = (products || []).map(p => {
        const pid = p.id
        const dipInfo = dipSummaryByProduct[pid] || { gain: 0, loss: 0, actual: 0, dipsFound: false }
        const gainLoss = dipInfo.gain - dipInfo.loss
        
        // Net gain/loss from all dips prior to today
        const historicalDipNet = pastDipNetByProduct[pid] || 0

        // The current_stock in products table doesn't track dips automatically in real-time,
        // so computing backward calculates the System Stock (without dip).
        const afterIn = futureDeliveries?.filter(d => d.product_id === pid).reduce((acc, d) => acc + Number(d.delivered_quantity), 0) || 0
        const afterOut = (futureFuelSales?.filter(s => s.product_id === pid).reduce((acc, s) => acc + Number(s.quantity), 0) || 0) +
                         (futureManualSales?.filter(s => s.product_id === pid).reduce((acc, s) => acc + Number(s.quantity), 0) || 0)
        
        // Base system stock + All historical dip adjustments up to yesterday
        const systemClosingStock = Number(p.current_stock) - afterIn + afterOut + historicalDipNet
        
        const todayIn = todayDeliveries?.filter(d => d.product_id === pid).reduce((acc, d) => acc + Number(d.delivered_quantity), 0) || 0
        const todayOut = (todayFuelSales?.filter(s => s.product_id === pid).reduce((acc, s) => acc + Number(s.quantity), 0) || 0) +
                          (todayManualSales?.filter(s => s.product_id === pid).reduce((acc, s) => acc + Number(s.quantity), 0) || 0)
        
        const openingStock = systemClosingStock - todayIn + todayOut
        
        const actualClosingStock = systemClosingStock + gainLoss

        return {
            name: p.name,
            opening: openingStock,
            in: todayIn,
            out: todayOut,
            withoutDip: systemClosingStock,
            dipQty: dipInfo.dipsFound ? dipInfo.actual : null,
            gainLoss: dipInfo.dipsFound ? gainLoss : null,
            closing: actualClosingStock,
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
            totalPurchase: totalCashBankPurchase,
            totalDiscounts: manualSales?.reduce((acc: number, s: any) => acc + Number(s.discount_amount || 0), 0) || 0
        },
        suppliers: {
            opening: supplierOpening,
            additions: supplierPurchases,
            payments: supplierPayments,
            closing: supplierClosing,
            cardOnHold: supplierCardOnHold,
            cardReleased: supplierCardReleased,
            cardCancelled: supplierCardCancelled,
            purchaseHoldOnHold,
            purchaseHoldReleased,
            purchaseHoldCancelled
        },
        inventory: stockSummary
    }
}
