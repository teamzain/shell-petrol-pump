"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function createPurchaseOrder(formData: {
    supplier_id: string;
    order_date: string;
    expected_delivery_date: string;
    notes?: string;
    products: {
        product_id: string;
        product_type: "fuel" | "oil" | "other";
        ordered_quantity: number;
        unit_type: "liter" | "unit";
        rate_per_liter: number;
    }[];
}) {
    const supabase = await createClient()

    // 1. Generate PO Number (PO-YYYY-XXXX)
    const year = new Date().getFullYear()

    // Get the latest PO for this year to determine the next sequence number safely
    const { data: latestPo } = await supabase
        .from("purchase_orders")
        .select("po_number")
        .gte("created_at", `${year}-01-01`)
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

    let nextNum = 1
    if (latestPo && latestPo.po_number) {
        // Extract the number part from PO-YYYY-XXXX or PO-YYYY-XXXX-1
        const parts = latestPo.po_number.split('-')
        if (parts.length >= 3) {
            const parsedNum = parseInt(parts[2], 10)
            if (!isNaN(parsedNum)) {
                nextNum = parsedNum + 1
            }
        }
    }

    const basePoNumber = `PO-${year}-${nextNum.toString().padStart(4, '0')}`

    let estimatedTotal = 0
    let totalOrderedQuantity = 0
    const items = formData.products.map(item => {
        const total = item.ordered_quantity * item.rate_per_liter
        estimatedTotal += total
        totalOrderedQuantity += item.ordered_quantity
        return {
            product_id: item.product_id,
            product_type: item.product_type,
            ordered_quantity: item.ordered_quantity,
            quantity_remaining: item.ordered_quantity,
            unit_type: item.unit_type,
            rate_per_liter: item.rate_per_liter,
            total_amount: total,
            status: 'pending'
        }
    })

    const firstItem = formData.products[0]

    const { data: po, error: poError } = await supabase
        .from("purchase_orders")
        .insert({
            po_number: basePoNumber,
            supplier_id: formData.supplier_id,
            ordered_quantity: totalOrderedQuantity,
            quantity_remaining: totalOrderedQuantity,
            product_id: firstItem.product_id,
            product_type: firstItem.product_type,
            unit_type: firstItem.unit_type,
            rate_per_liter: firstItem.rate_per_liter,
            estimated_total: estimatedTotal,
            expected_delivery_date: formData.expected_delivery_date,
            created_at: new Date(formData.order_date).toISOString(),
            notes: formData.notes,
            status: 'pending',
            items: items
        })
        .select()
        .single()

    if (poError) {
        console.error("PO Insert Error:", poError)
        throw poError
    }

    // 3. Create Notification Reminder
    await supabase.from("notifications").insert({
        type: 'delivery_expected',
        title: 'Delivery Expected Today',
        message: `Purchase Order ${po.po_number} is scheduled for delivery today.`,
        reference_type: 'purchase_order',
        reference_id: po.id,
        scheduled_for: formData.expected_delivery_date,
    })

    revalidatePath("/dashboard/purchases")
    return { success: true, count: 1 }
}

export async function getPurchaseOrders(filters?: {
    status?: string;
    supplier_id?: string;
    product_type?: string;
    date_from?: string;
    date_to?: string;
}) {
    const supabase = await createClient()
    let query = supabase
        .from("purchase_orders")
        .select(`
            *,
            suppliers (
                name,
                contact_person,
                phone
            ),
            products (
                name,
                category,
                unit
            )
        `)
        .order("created_at", { ascending: false })

    if (filters?.status && filters.status !== 'all') query = query.eq("status", filters.status)
    if (filters?.supplier_id && filters.supplier_id !== 'all') query = query.eq("supplier_id", filters.supplier_id)
    if (filters?.product_type && filters.product_type !== 'all') query = query.eq("product_type", filters.product_type)
    if (filters?.date_from) query = query.gte("expected_delivery_date", filters.date_from)
    if (filters?.date_to) query = query.lte("expected_delivery_date", filters.date_to)

    const { data, error } = await query
    if (error) throw error
    return data
}

export async function cancelPurchaseOrder(poId: string) {
    const supabase = await createClient()

    // Business Rule: Can only cancel if Pending or Rescheduled, but NO items delivered
    const { data: po } = await supabase
        .from("purchase_orders")
        .select("status, items")
        .eq("id", poId)
        .single()

    const items = po?.items ? [...po.items] : []
    const hasDeliveredItems = items.some((item: any) => item.status === 'delivered')

    if (po?.status !== 'pending' && hasDeliveredItems) {
        throw new Error("Cannot cancel purchase order because some items have been delivered.")
    }

    const newItems = items.map((item: any) => ({ ...item, status: 'cancelled' }))

    const { error } = await supabase
        .from("purchase_orders")
        .update({ status: 'cancelled', items: newItems })
        .eq("id", poId)

    if (error) throw error

    // Also update notification
    await supabase.from("notifications")
        .update({ is_read: true })
        .eq("reference_id", poId)
        .eq("reference_type", "purchase_order")

    revalidatePath("/dashboard/purchases")
    return { success: true }
}

export async function getPurchaseSummary() {
    const supabase = await createClient()

    // 1. Total Pending/Partial Orders
    const { count: pendingCount } = await supabase
        .from("purchase_orders")
        .select("*", { count: 'exact', head: true })
        .in("status", ["pending", "partially_delivered"])

    // 2. Committed Value (Total amount of pending/partial)
    const { data: committedData } = await supabase
        .from("purchase_orders")
        .select("estimated_total")
        .in("status", ["pending", "partially_delivered"])

    const committedValue = committedData?.reduce((acc, po) => acc + Number(po.estimated_total), 0) || 0

    // 3. Total Settled (Sum of all deliveries)
    const { data: settledData } = await supabase
        .from("deliveries")
        .select("total_amount")

    const totalSettled = settledData?.reduce((acc, d) => acc + Number(d.total_amount), 0) || 0

    return {
        totalOrders: pendingCount || 0,
        totalValue: committedValue,
        totalPaid: totalSettled,
        totalDue: Math.max(0, committedValue - totalSettled) // Simplification for dashboard
    }
}

export async function getPurchaseOrderDetail(poId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from("purchase_orders")
        .select(`
            *,
            suppliers (
                name,
                contact_person,
                phone
            ),
            products (
                name,
                category,
                unit
            ),
            deliveries (
                id,
                delivery_number,
                delivery_date,
                company_invoice_number,
                vehicle_number,
                driver_name,
                notes
            ),
            po_hold_records (
                id,
                hold_quantity,
                hold_amount,
                expected_return_date,
                actual_return_date,
                status
            )
        `)
        .eq("id", poId)
        .single()

    if (error) throw error
    return data
}

export async function setPOHoldExpectedDate(holdRecordId: string, poId: string, expectedDate: string) {
    const supabase = await createClient()

    // 1. Update existing hold record
    const { error: updateError } = await supabase
        .from("po_hold_records")
        .update({ expected_return_date: expectedDate })
        .eq("id", holdRecordId)

    if (updateError) throw updateError

    // 2. Create Hold Notification
    const { error: notifError } = await supabase
        .from("po_notifications")
        .insert({
            purchase_order_id: poId,
            notification_type: 'hold_return_reminder',
            related_hold_id: holdRecordId,
            trigger_date: expectedDate
        })

    if (notifError) throw notifError

    revalidatePath("/dashboard/purchases")
    return { success: true }
}

export async function updatePurchaseOrderDate(poId: string, newDate: string, itemIdx?: number) {
    const supabase = await createClient()

    if (itemIdx === undefined) {
        // Fallback for legacy
        const { error } = await supabase
            .from("purchase_orders")
            .update({ expected_delivery_date: newDate })
            .eq("id", poId)

        if (error) throw error
    } else {
        // Update specific item in array
        const { data: po, error: fetchErr } = await supabase
            .from("purchase_orders")
            .select("items")
            .eq("id", poId)
            .single()

        if (fetchErr) throw fetchErr
        if (!po || !po.items) throw new Error("Purchase order items not found")

        const items = [...po.items]
        if (items[itemIdx]) {
            items[itemIdx].expected_delivery_date = newDate;
            items[itemIdx].status = 'rescheduled';
        }

        const { error: updateErr } = await supabase
            .from("purchase_orders")
            .update({ items })
            .eq("id", poId)

        if (updateErr) throw updateErr
    }

    // Update associated notifications
    await supabase
        .from("notifications")
        .update({ scheduled_for: newDate })
        .eq("reference_id", poId)
        .eq("reference_type", "purchase_order")

    revalidatePath("/dashboard/purchases")
    return { success: true }
}

export async function getPendingHolds() {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from("po_hold_records")
        .select(`
            id,
            hold_amount,
            hold_quantity,
            expected_return_date,
            product_name,
            purchase_orders (
                id,
                po_number,
                suppliers ( name )
            )
        `)
        .eq("status", "on_hold")
        .order("expected_return_date", { ascending: true, nullsFirst: false })

    if (error) throw error
    return data
}

export async function markHoldAsReceived(holdId: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const { error } = await supabase.rpc('release_po_hold', {
        p_hold_id: holdId,
        p_user_id: user.id
    })

    if (error) throw error

    revalidatePath("/dashboard")
    revalidatePath("/dashboard/purchases")
    revalidatePath("/dashboard/balance")
    return { success: true }
}
