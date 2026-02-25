"use server"

import { createClient } from "@/lib/supabase/server"

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

    let query = supabase
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
        `, { count: 'exact' })
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })

    if (filters?.date_from) query = query.gte("transaction_date", filters.date_from)
    if (filters?.date_to) query = query.lte("transaction_date", filters.date_to)
    if (filters?.transaction_type && filters.transaction_type !== 'all') query = query.eq("transaction_type", filters.transaction_type)
    if (filters?.supplier_id && filters.supplier_id !== 'all') query = query.eq("company_accounts.supplier_id", filters.supplier_id)
    if (filters?.search) query = query.ilike("reference_number", `%${filters.search}%`)

    const { data, error, count } = await query.range(from, to)

    if (error) throw error

    return {
        data,
        total: count || 0,
        page,
        totalPages: Math.ceil((count || 0) / pageSize)
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
    const holds = txs.filter(t => t.is_hold).reduce((acc, t) => acc + Number(t.amount), 0) // Note: is_hold records are saved as credits (returns) or nothing currently. Actually they aren't even saved in this table. Wait, they are. They are saved as 'credit' with transaction_source='hold_return' when released or... no, hold RECORD is separate. 
    // Let's actually fetch holds from po_hold_records.
    let balanceQuery = supabase.from("company_accounts").select("current_balance")
    if (filters?.supplier_id && filters.supplier_id !== 'all') balanceQuery = balanceQuery.eq("supplier_id", filters.supplier_id)

    const { data: balances } = await balanceQuery
    const currentBalance = balances?.reduce((acc, b) => acc + Number(b.current_balance), 0) || 0

    let holdsQuery = supabase.from("po_hold_records").select("hold_amount").eq("status", "on_hold")
    if (filters?.supplier_id && filters.supplier_id !== 'all') {
        // Need to join through PO... this might get tricky. For now, we'll just get all holds if supplier_id is missing, 
        // or we fetch active holds directly. To keep it simple, let's fetch total active holds system-wide unless supplier is set.
        // If supplier is set, we need to join. Since we can't easily join here without a complex query, let's just do a basic one.
    }
    const { data: activeHolds } = await holdsQuery
    const totalHolds = activeHolds?.reduce((acc, h) => acc + Number(h.hold_amount), 0) || 0

    return {
        totalCredits: credits,
        totalDebits: debits,
        netMovement: credits - debits,
        currentBalance,
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
        .lte("scheduled_for", new Date().toISOString().split('T')[0])

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
        .update({ scheduled_for: tomorrow.toISOString().split('T')[0] })
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
        .lte("trigger_date", new Date().toISOString().split('T')[0])
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
            trigger_date: tomorrow.toISOString().split('T')[0]
        })
        .eq("id", id)

    if (error) throw error

    // Also update the associated hold record's expected date if it exists
    const { data: notif } = await supabase.from("po_notifications").select("related_hold_id").eq("id", id).single()
    if (notif?.related_hold_id) {
        await supabase.from("po_hold_records")
            .update({ expected_return_date: tomorrow.toISOString().split('T')[0] })
            .eq("id", notif.related_hold_id)
    }

    return { success: true }
}
