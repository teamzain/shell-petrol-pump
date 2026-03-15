"use server"

import { createClient } from "@/lib/supabase/server"
import { getTodayPKT, getTomorrowPKT } from "@/lib/utils"

export async function getBalanceMovement(filters?: {
    date_from?: string;
    date_to?: string;
    transaction_type?: string;
    supplier_id?: string;
    search?: string;
    page?: number;
}) {
    const supabase = await createClient()
    const pageSize = 20
    const page = filters?.page || 1
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // 1. Fetch Company Account Transactions
    let companyQuery = supabase
        .from("company_account_transactions")
        .select(`
            *,
            company_accounts!inner (
                id,
                supplier_id,
                suppliers (
                    id,
                    name
                )
            )
        `)

    if (filters?.date_from) companyQuery = companyQuery.gte("transaction_date", filters.date_from)
    if (filters?.date_to) companyQuery = companyQuery.lte("transaction_date", filters.date_to)
    if (filters?.transaction_type && filters.transaction_type !== 'all') companyQuery = companyQuery.eq("transaction_type", filters.transaction_type)
    if (filters?.supplier_id && filters.supplier_id !== 'all') companyQuery = companyQuery.eq("company_accounts.supplier_id", filters.supplier_id)
    if (filters?.search) companyQuery = companyQuery.ilike("reference_number", `%${filters.search}%`)

    const { data: companyTx, error: compErr } = await companyQuery

    // 2. Fetch Balance Transactions (Internal)
    // Only fetch if no supplier filter is active or if we want global visibility
    let balanceTx: any[] = []
    if (!filters?.supplier_id || filters.supplier_id === 'all') {
        let balanceQuery = supabase
            .from("balance_transactions")
            .select(`
                *,
                bank_accounts ( account_name )
            `)
            .not("transaction_type", "in", "(transfer_to_supplier,supplier_to_bank)")

        if (filters?.date_from) balanceQuery = balanceQuery.gte("transaction_date", filters.date_from)
        if (filters?.date_to) balanceQuery = balanceQuery.lte("transaction_date", filters.date_to)
        // Note: transaction_type filter might need mapping if we want to filter 'credit' vs 'cash_to_bank'
        // For now, if type is 'all', we show both.
        if (filters?.transaction_type && filters.transaction_type !== 'all') {
            // Map 'credit' to 'add_cash', 'add_bank', 'cash_to_bank' for balance_transactions
            // Map 'debit' to 'bank_to_cash' for balance_transactions
            if (filters.transaction_type === 'credit') {
                balanceQuery = balanceQuery.in("transaction_type", ["add_cash", "add_bank", "cash_to_bank"])
            } else if (filters.transaction_type === 'debit') {
                balanceQuery = balanceQuery.eq("transaction_type", "bank_to_cash")
            }
        }


        const { data: bTx, error: bErr } = await balanceQuery
        if (!bErr) balanceTx = bTx || []
    }

    if (compErr) throw compErr

    // 3. Unify and Transform
    const unified = [
        ...(companyTx || []).map(tx => ({
            ...tx,
            source_table: 'company_account_transactions',
            entity_name: tx.company_accounts?.suppliers?.name || 'Supplier',
            display_type: tx.transaction_type // 'credit' or 'debit'
        })),
        ...balanceTx.map(tx => ({
            ...tx,
            source_table: 'balance_transactions',
            entity_name: tx.bank_accounts?.account_name || 'System / Cash',
            display_type: tx.transaction_type // 'cash_to_bank', 'add_cash' etc.
        }))
    ]

    // 4. Sort and Paginate in JS (since we're merging)
    unified.sort((a, b) => {
        const dateA = new Date(a.transaction_date + 'T' + (a.created_at?.split('T')[1]?.split('+')[0] || '00:00:00')).getTime()
        const dateB = new Date(b.transaction_date + 'T' + (b.created_at?.split('T')[1]?.split('+')[0] || '00:00:00')).getTime()
        return dateB - dateA
    })

    const paginated = unified.slice(from, to + 1)

    return {
        data: paginated,
        total: unified.length,
        page,
        totalPages: Math.ceil(unified.length / pageSize)
    }
}

export async function getBalanceMovementSummary(filters?: {
    date_from?: string;
    date_to?: string;
    supplier_id?: string;
}) {
    const supabase = await createClient()

    let query = supabase
        .from("company_account_transactions")
        .select("transaction_type, amount, is_hold, company_accounts!inner(supplier_id)")

    if (filters?.date_from) query = query.gte("transaction_date", filters.date_from)
    if (filters?.date_to) query = query.lte("transaction_date", filters.date_to)
    if (filters?.supplier_id && filters.supplier_id !== 'all') query = query.eq("company_accounts.supplier_id", filters.supplier_id)

    const { data: txs, error } = await query
    if (error) throw error

    const credits = txs.filter(t => t.transaction_type === 'credit' && !t.is_hold).reduce((acc, t) => acc + Number(t.amount), 0)
    const debits = txs.filter(t => t.transaction_type === 'debit' && !t.is_hold).reduce((acc, t) => acc + Number(t.amount), 0)
    
    // Add internal inflows (add_cash, add_bank)
    let internalInflow = 0
    if (!filters?.supplier_id || filters.supplier_id === 'all') {
        let bQuery = supabase.from("balance_transactions").select("amount, transaction_type")
        if (filters?.date_from) bQuery = bQuery.gte("transaction_date", filters.date_from)
        if (filters?.date_to) bQuery = bQuery.lte("transaction_date", filters.date_to)
        bQuery = bQuery.in("transaction_type", ["add_cash", "add_bank"])
        
        const { data: bTxs } = await bQuery
        internalInflow = bTxs?.reduce((acc, t) => acc + Number(t.amount), 0) || 0
    }

    const totalCredits = credits + internalInflow

    const holds = txs.filter(t => t.is_hold).reduce((acc, t) => acc + Number(t.amount), 0) 
    
    let balanceQuery = supabase.from("company_accounts").select("current_balance")
    if (filters?.supplier_id && filters.supplier_id !== 'all') balanceQuery = balanceQuery.eq("supplier_id", filters.supplier_id)

    const { data: balances } = await balanceQuery
    const supplierBalance = balances?.reduce((acc, b) => acc + Number(b.current_balance), 0) || 0

    // Fetch total physical cash/bank too for a true "Combined Balance"
    let physicalBalance = 0
    if (!filters?.supplier_id || filters.supplier_id === 'all') {
        const { data: bankAccs } = await supabase.from("bank_accounts").select("current_balance")
        const totalBank = bankAccs?.reduce((acc, b) => acc + Number(b.current_balance), 0) || 0

        const today = getTodayPKT()
        const { data: dayStatus } = await supabase.from("daily_accounts_status").select("closing_cash, opening_cash").eq("status_date", today).single()
        const currentCash = dayStatus?.closing_cash ?? dayStatus?.opening_cash ?? 0

        physicalBalance = totalBank + currentCash
    }

    let holdsQuery = supabase.from("po_hold_records").select("hold_amount").eq("status", "on_hold")
    const { data: activeHolds } = await holdsQuery
    const totalHolds = activeHolds?.reduce((acc, h) => acc + Number(h.hold_amount), 0) || 0

    return {
        totalCredits,
        totalDebits: debits,
        netMovement: totalCredits - debits,
        currentBalance: supplierBalance + physicalBalance,
        totalHolds
    }
}

// Notifications Actions
export async function getPendingNotifications() {
    const supabase = await createClient()
    const { data: notifications, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("is_read", false)
        .eq("reference_type", "purchase_order")
        .lte("scheduled_for", getTodayPKT())

    if (error) throw error
    if (!notifications || notifications.length === 0) return []

    const poIds = notifications.map(n => n.reference_id).filter(id => id != null)

    // Fetch associated POs manually to avoid PGRST200 error
    const { data: pos } = await supabase
        .from("purchase_orders")
        .select("id, po_number, ordered_quantity, product_type")
        .in("id", poIds)

    // Assemble the data
    const enrichedNotifications = notifications.map(notif => {
        const po = pos?.find(p => p.id === notif.reference_id)
        return {
            ...notif,
            purchase_orders: po || null
        }
    })

    return enrichedNotifications
}

export async function dismissNotification(id: string) {
    const supabase = await createClient()
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id)
    if (error) throw error
    return { success: true }
}

export async function snoozeNotification(id: string) {
    const supabase = await createClient()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)

    const { error } = await supabase.from("notifications")
        .update({ scheduled_for: getTomorrowPKT() })
        .eq("id", id)

    if (error) throw error
    return { success: true }
}

export async function getPOHoldNotifications() {
    const supabase = await createClient()

    const { data: notifications, error } = await supabase
        .from("po_notifications")
        .select(`
            *,
            po_hold_records (
                hold_amount,
                hold_quantity
            ),
            purchase_orders (
                po_number,
                suppliers ( name )
            )
        `)
        .in("status", ["pending", "snoozed"])
        .lte("trigger_date", getTodayPKT())
        .order("trigger_date", { ascending: true })

    if (error) throw error
    return notifications || []
}

export async function snoozePOHoldNotification(id: string) {
    const supabase = await createClient()

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)

    const { error } = await supabase.from("po_notifications")
        .update({
            status: 'snoozed',
            trigger_date: getTomorrowPKT()
        })
        .eq("id", id)

    if (error) throw error

    // Also update the associated hold record's expected date if it exists
    const { data: notif } = await supabase.from("po_notifications").select("related_hold_id").eq("id", id).single()
    if (notif?.related_hold_id) {
        await supabase.from("po_hold_records")
            .update({ expected_return_date: getTomorrowPKT() })
            .eq("id", notif.related_hold_id)
    }

    return { success: true }
}
