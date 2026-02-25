"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function createPurchaseOrder(formData: {
    supplier_id: string;
    order_date: string;
    expected_delivery_date: string;
    po_number: string;
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

    const poNumber = formData.po_number || `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`

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
            po_number: poNumber,
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
        if (poError.code === '23505') {
            throw new Error(`The Purchase Order Number "${poNumber}" already exists. Please use a different PO number.`);
        }
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

export async function getNextPONumber() {
    const supabase = await createClient()
    const year = new Date().getFullYear()

    const { data, error } = await supabase
        .from("purchase_orders")
        .select("po_number")
        .like("po_number", `PO-${year}-%`)

    if (error) {
        console.error("Failed to fetch next PO number", error)
        return `PO-${year}-${String(Date.now()).slice(-6)}`
    }

    let maxNum = 0
    data?.forEach(po => {
        const parts = po.po_number.split('-')
        if (parts.length >= 3) {
            const parsedNum = parseInt(parts[2], 10)
            if (!isNaN(parsedNum) && parsedNum > maxNum) {
                maxNum = parsedNum
            }
        }
    })

    return `PO-${year}-${(maxNum + 1).toString().padStart(4, '0')}`
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

    if (filters?.status && filters.status !== 'all') {
        if (filters.status === 'pending') {
            query = query.in("status", ['pending', 'partially_delivered'])
        } else if (filters.status === 'partial') {
            query = query.eq("status", 'partially_delivered')
        } else {
            query = query.eq("status", filters.status)
        }
    }
    if (filters?.supplier_id && filters.supplier_id !== 'all') query = query.eq("supplier_id", filters.supplier_id)
    if (filters?.product_type && filters.product_type !== 'all') query = query.eq("product_type", filters.product_type)
    if (filters?.date_from) query = query.gte("expected_delivery_date", filters.date_from)
    if (filters?.date_to) query = query.lte("expected_delivery_date", filters.date_to)

    const { data: pos, error } = await query
    if (error) throw error

    // Map product names for JSONB items 
    if (pos) {
        // Collect all distinct product IDs from all POs
        const productIds = new Set<string>();
        pos.forEach((po: any) => {
            if (po.items && Array.isArray(po.items)) {
                po.items.forEach((item: any) => {
                    if (item.product_id) productIds.add(item.product_id);
                });
            }
        });

        if (productIds.size > 0) {
            const { data: products } = await supabase
                .from("products")
                .select("id, name, category")
                .in("id", Array.from(productIds));

            if (products) {
                const productMap = new Map(products.map((p: any) => [p.id, p]));
                pos.forEach((po: any) => {
                    if (po.items && Array.isArray(po.items)) {
                        po.items = po.items.map((item: any) => {
                            const product = productMap.get(item.product_id);
                            return {
                                ...item,
                                product_name: product ? product.name : "Unknown Product",
                                product_category: product ? product.category : item.product_type
                            };
                        });
                    }
                });
            }
        }
    }

    return pos
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

export async function cancelPurchaseOrderItem(poId: string, itemId: string) {
    const supabase = await createClient()

    // 1. Fetch current PO
    const { data: po, error: fetchErr } = await supabase
        .from("purchase_orders")
        .select("items, expected_delivery_date, po_number")
        .eq("id", poId)
        .single()

    if (fetchErr) throw fetchErr
    if (!po || !po.items) throw new Error("Purchase order items not found")

    // 2. Map and update the specific item status to cancelled
    let itemFound = false
    const items = po.items.map((item: any) => {
        // Handle matches by product_id since "items" is a jsonb array of {product_id, ...}
        if (item.product_id === itemId && item.status !== 'cancelled' && item.status !== 'delivered') {
            itemFound = true
            return { ...item, status: 'cancelled' }
        }
        return item
    })

    if (!itemFound) {
        throw new Error("Item not found or cannot be cancelled.")
    }

    // 3. Determine if ALL items are now cancelled
    const allCancelled = items.every((i: any) => i.status === 'cancelled')

    // 4. Update the DB
    const updatePayload: any = { items }
    if (allCancelled) {
        updatePayload.status = 'cancelled'
    }

    const { error: updateErr } = await supabase
        .from("purchase_orders")
        .update(updatePayload)
        .eq("id", poId)

    if (updateErr) throw updateErr

    revalidatePath("/dashboard/purchases")
    return { success: true, allCancelled }
}

export async function getPurchaseSummary(filters?: { date_from?: string; date_to?: string }) {
    const supabase = await createClient()

    // 1. Total Pending/Partial Orders
    let poQuery = supabase
        .from("purchase_orders")
        .select("items, status, ordered_quantity, delivered_quantity, rate_per_liter", { count: 'exact' })
        .in("status", ["pending", "partially_delivered"])

    if (filters?.date_from) poQuery = poQuery.gte("expected_delivery_date", filters.date_from)
    if (filters?.date_to) poQuery = poQuery.lte("expected_delivery_date", filters.date_to)

    const { data: committedData, count: pendingCount } = await poQuery

    // Calculate committed value as the sum of PENDING items only
    const committedValue = committedData?.reduce((acc, po) => {
        let poPending = 0
        if (po.items && Array.isArray(po.items) && po.items.length > 0) {
            po.items.forEach((item: any) => {
                const isPending = !['delivered', 'received', 'cancelled'].includes(item.status)
                if (isPending) {
                    poPending += Number(item.total_amount || 0)
                }
            })
        } else {
            // Legacy PO handling
            const remaining = Math.max(0, Number(po.ordered_quantity || 0) - Number(po.delivered_quantity || 0))
            poPending = remaining * Number(po.rate_per_liter || 0)
        }
        return acc + poPending
    }, 0) || 0

    // 2. Total Settled (Sum of all deliveries)
    let delQuery = supabase
        .from("deliveries")
        .select("total_amount")

    if (filters?.date_from) delQuery = delQuery.gte("delivery_date", filters.date_from)
    if (filters?.date_to) delQuery = delQuery.lte("delivery_date", filters.date_to)

    const { data: settledData } = await delQuery
    const totalSettled = settledData?.reduce((acc, d) => acc + Number(d.total_amount), 0) || 0

    // 3. New Specific Hold Stats
    let holdQuery = supabase
        .from("po_hold_records")
        .select("hold_amount, status")

    if (filters?.date_from) holdQuery = holdQuery.gte("created_at", filters.date_from)
    if (filters?.date_to) holdQuery = holdQuery.lte("created_at", filters.date_to)

    const { data: holdData } = await holdQuery

    const totalOnHold = holdData?.filter(h => h.status === 'on_hold').reduce((acc, h) => acc + Number(h.hold_amount), 0) || 0
    const totalReleased = holdData?.filter(h => h.status === 'released').reduce((acc, h) => acc + Number(h.hold_amount), 0) || 0

    return {
        totalOrders: pendingCount || 0,
        totalValue: committedValue,
        totalPaid: totalSettled,
        totalDue: committedValue, // Outstanding is now exactly the committed pending value
        totalOnHold,
        totalReleased
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
                notes,
                po_item_index,
                delivered_quantity,
                delivered_amount
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

    // Map product names for JSONB items 
    if (data && data.items && Array.isArray(data.items)) {
        const productIds = Array.from(new Set(data.items.filter((i: any) => i.product_id).map((i: any) => i.product_id)));
        if (productIds.length > 0) {
            const { data: products } = await supabase
                .from("products")
                .select("id, name, category")
                .in("id", productIds);

            if (products) {
                const productMap = new Map(products.map((p: any) => [p.id, p]));
                data.items = data.items.map((item: any) => {
                    const product = productMap.get(item.product_id);
                    return {
                        ...item,
                        product_name: product ? product.name : "Unknown Product",
                        product_category: product ? product.category : item.product_type
                    };
                });
            }
        }
    }

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

export async function getAllHolds(filters?: { date_from?: string; date_to?: string }) {
    const supabase = await createClient()

    let query = supabase
        .from("po_hold_records")
        .select(`
            id,
            delivery_id,
            hold_amount,
            hold_quantity,
            expected_return_date,
            actual_return_date,
            product_id,
            product_name,
            status,
            created_at,
            purchase_orders (
                id,
                po_number,
                created_at,
                suppliers ( name )
            )
        `)
        .order("created_at", { ascending: false })

    if (filters?.date_from) query = query.gte("created_at", filters.date_from)
    if (filters?.date_to) query = query.lte("created_at", filters.date_to)

    const { data, error } = await query

    if (error) throw error
    return data
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
