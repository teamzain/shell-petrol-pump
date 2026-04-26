"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { validateTransactionDate } from "./balance"

import { addLedgerTransaction, validateSupplierBalance } from "./suppliers"

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
    try {
        const supabase = await createClient()

        // 1. Get User
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: "Unauthorized" }

        // --- DATE VALIDATION ---
        await validateTransactionDate(formData.order_date)
        // -----------------------

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

        // PRE-CHECK: Ensure balance is sufficient before any database insertions
        await validateSupplierBalance(formData.supplier_id, estimatedTotal)

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
                return { error: `The Purchase Order Number "${poNumber}" already exists. Please use a different PO number.` };
            }
            return { error: poError.message }
        }

        // 2. Record full order amount as debit in supplier ledger
        const { data: compAcc } = await supabase
            .from("company_accounts")
            .select("id")
            .eq("supplier_id", formData.supplier_id)
            .single()

        if (compAcc) {
            await addLedgerTransaction({
                company_account_id: compAcc.id,
                transaction_type: 'debit',
                amount: estimatedTotal,
                transaction_date: formData.order_date,
                reference_number: po.po_number,
                purchase_order_id: po.id,
                note: `Purchase Order Placed: ${totalOrderedQuantity} liters/units`,
                skip_date_validation: true
            })
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
    } catch (err: any) {
        console.error("Server Action Error:", err)
        return { error: err.message || "An unexpected error occurred" }
    }
}

export async function getNextPONumber() {
    const supabase = await createClient()
    const year = new Date().getFullYear()

    // Match both PO-2026- and LPO-2026- (any prefix before PO-)
    const { data, error } = await supabase
        .from("purchase_orders")
        .select("po_number")
        .ilike("po_number", `%PO-${year}-%`)

    if (error) {
        console.error("Failed to fetch next PO number", error)
        return `PO-${year}-${String(Date.now()).slice(-6)}`
    }

    let maxNum = 0
    data?.forEach(po => {
        const parts = po.po_number.split('-')
        // The numeric part is always the last part in PO-YYYY-NNNN format
        const lastPart = parts[parts.length - 1]
        const parsedNum = parseInt(lastPart, 10)
        if (!isNaN(parsedNum) && parsedNum > maxNum) {
            maxNum = parsedNum
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
    supplier_type?: 'local' | 'company';
}) {
    const supabase = await createClient()
    let query = supabase
        .from("purchase_orders")
        .select(`
            *,
            suppliers!inner (
                name,
                contact_person,
                phone,
                supplier_type
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
    if (filters?.date_from) query = query.gte("created_at", filters.date_from)
    if (filters?.date_to) query = query.lte("created_at", filters.date_to)

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

    // Revert Balance
    const nonDeliveredItems = items.filter((item: any) => item.status !== 'delivered')
    const revertAmount = nonDeliveredItems.reduce((acc: number, item: any) => acc + (item.total_amount || (item.ordered_quantity * item.rate_per_liter)), 0)

    if (revertAmount > 0) {
        // Find supplier and account
        const { data: poFull } = await supabase
            .from("purchase_orders")
            .select("supplier_id, po_number")
            .eq("id", poId)
            .single()

        if (poFull) {
            const { data: account } = await supabase
                .from("company_accounts")
                .select("id, current_balance")
                .eq("supplier_id", poFull.supplier_id)
                .single()

            if (account) {
                // Update balance
                await supabase
                    .from("company_accounts")
                    .update({
                        current_balance: Number(account.current_balance) + revertAmount,
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", account.id)

                // Record transaction
                await supabase
                    .from("company_account_transactions")
                    .insert({
                        company_account_id: account.id,
                        transaction_type: 'credit',
                        transaction_source: 'purchase_order_cancellation',
                        amount: revertAmount,
                        transaction_date: new Date().toISOString().split('T')[0],
                        reference_number: poFull.po_number,
                        purchase_order_id: poId,
                        note: `Balance reverted for cancelled Purchase Order #${poFull.po_number}`,
                        created_by: (await supabase.auth.getUser()).data.user?.id
                    })
            }
        }
    }

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

    // Revert Balance for this specific item
    const cancelledItem = items.find((i: any) => i.product_id === itemId && i.status === 'cancelled')
    if (cancelledItem) {
        const revertAmount = Number(cancelledItem.total_amount || (cancelledItem.ordered_quantity * cancelledItem.rate_per_liter))

        if (revertAmount > 0) {
            const { data: poFull } = await supabase
                .from("purchase_orders")
                .select("supplier_id, po_number")
                .eq("id", poId)
                .single()

            if (poFull) {
                const { data: account } = await supabase
                    .from("company_accounts")
                    .select("id, current_balance")
                    .eq("supplier_id", poFull.supplier_id)
                    .single()

                if (account) {
                    // Update balance
                    await supabase
                        .from("company_accounts")
                        .update({
                            current_balance: Number(account.current_balance) + revertAmount,
                            updated_at: new Date().toISOString()
                        })
                        .eq("id", account.id)

                    // Record transaction
                    await supabase
                        .from("company_account_transactions")
                        .insert({
                            company_account_id: account.id,
                            transaction_type: 'credit',
                            transaction_source: 'purchase_order_cancellation',
                            amount: revertAmount,
                            transaction_date: new Date().toISOString().split('T')[0],
                            reference_number: poFull.po_number,
                            purchase_order_id: poId,
                            note: `Balance reverted for cancelled item in PO #${poFull.po_number}`,
                            created_by: (await supabase.auth.getUser()).data.user?.id
                        })
                }
            }
        }
    }

    revalidatePath("/dashboard/purchases")
    return { success: true, allCancelled }
}

export async function getPurchaseSummary(filters?: { date_from?: string; date_to?: string }) {
    const supabase = await createClient()

    // 1. Fetch all relevant orders
    let query = supabase
        .from("purchase_orders")
        .select("id, estimated_total, status")
        .neq("status", "cancelled")

    if (filters?.date_from) query = query.gte("created_at", filters.date_from)
    if (filters?.date_to) query = query.lte("created_at", filters.date_to)

    const { data: pos } = await query

    const totalOrders = pos?.filter((po: any) => ['pending', 'partially_delivered'].includes(po.status)).length || 0
    const totalValue = pos?.reduce((acc: number, po: any) => acc + Number(po.estimated_total), 0) || 0

    // 2. Fetch Total Settled (Ledger Debits linked to POs)
    let ledgerQuery = supabase
        .from("company_account_transactions")
        .select("amount")
        .eq("transaction_type", "debit")
        .not("purchase_order_id", "is", null)

    if (filters?.date_from) ledgerQuery = ledgerQuery.gte("transaction_date", filters.date_from)
    if (filters?.date_to) ledgerQuery = ledgerQuery.lte("transaction_date", filters.date_to)

    const { data: ledgerTxs } = await ledgerQuery
    const totalPaid = ledgerTxs?.reduce((acc: number, tx: any) => acc + Number(tx.amount), 0) || 0
    
    const totalDue = Math.max(0, totalValue - totalPaid)

    // 3. Fetch Hold Stats 
    const { data: holdData } = await supabase
        .from("po_hold_records")
        .select("hold_amount, status")

    const totalOnHold = holdData?.filter((h: any) => h.status === 'on_hold').reduce((acc: number, h: any) => acc + Number(h.hold_amount), 0) || 0
    const totalReleased = holdData?.filter((h: any) => h.status === 'released').reduce((acc: number, h: any) => acc + Number(h.hold_amount), 0) || 0
    const totalCancelled = holdData?.filter((h: any) => h.status === 'cancelled').reduce((acc: number, h: any) => acc + Number(h.hold_amount), 0) || 0

    return {
        totalOrders,
        totalValue,
        totalPaid,
        totalDue,
        totalOnHold,
        totalReleased,
        totalCancelled
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
                delivered_amount,
                rate_per_liter,
                original_rate,
                is_price_synced,
                tank_distribution
            ),
            po_hold_records (
                id,
                delivery_id,
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

export async function getAllHolds(filters?: { date_from?: string; date_to?: string; supplier_type?: 'local' | 'company' }) {
    const supabase = await createClient()

    // Show ALL holds by default — no date filtering applied
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
            purchase_orders!inner (
                id,
                po_number,
                created_at,
                suppliers!inner ( name, supplier_type )
            )
        `)

    if (filters?.supplier_type) query = query.eq("purchase_orders.suppliers.supplier_type", filters.supplier_type)

    const { data, error } = await query
        .order("created_at", { ascending: false })

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

export async function markHoldAsReceived(holdId: string, receivedDate?: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const { error } = await supabase.rpc('release_po_hold', {
        p_hold_id: holdId,
        p_user_id: user.id,
        p_actual_date: receivedDate
    })

    if (error) throw error

    revalidatePath("/dashboard")
    revalidatePath("/dashboard/purchases")
    revalidatePath("/dashboard/balance")
    return { success: true }
}

export async function cancelPOHold(holdId: string, reason: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    // Update hold status and reason
    const { error } = await supabase
        .from("po_hold_records")
        .update({
            status: 'cancelled',
            cancel_reason: reason,
            updated_at: new Date().toISOString()
        })
        .eq("id", holdId)

    if (error) throw error

    // Sync notification if exists
    await supabase.from("po_notifications")
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq("related_hold_id", holdId)

    revalidatePath("/dashboard/purchases")
    return { success: true }
}

export async function getAffectedPurchaseOrders(productId: string) {
    const supabase = await createClient()
    const { data: pos, error } = await supabase
        .from("purchase_orders")
        .select(`
            id,
            po_number,
            status,
            items,
            suppliers!inner (
                name,
                supplier_type
            )
        `)
        .in("status", ["pending", "partially_delivered"])
        .eq("suppliers.supplier_type", "company")
    
    if (error) throw error

    // Filter POs that contain the productId and have remaining quantity
    const affectedPOs = pos?.filter((po: any) => {
        if (!po.items || !Array.isArray(po.items)) return false;
        return po.items.some((item: any) => item.product_id === productId && item.quantity_remaining > 0);
    });

    return affectedPOs || [];
}

export async function updatePOPricePropagation(poIds: string[], productId: string, newPrice: number) {
    const supabase = await createClient()
    
    for (const poId of poIds) {
        const { data: po } = await supabase
            .from("purchase_orders")
            .select("items, estimated_total")
            .eq("id", poId)
            .single()
            
        if (!po || !po.items) continue;
        
        let newEstimatedTotal = 0;
        let itemsChanged = false;
        const newItems: any[] = [];
        
        po.items.forEach((item: any) => {
            if (item.product_id === productId && item.quantity_remaining > 0) {
                itemsChanged = true;
                
                const deliveredQty = Number(item.ordered_quantity) - Number(item.quantity_remaining);
                
                if (deliveredQty > 0) {
                    // It's a partially delivered item. Split it!
                    const oldRate = Number(item.rate_per_liter);
                    
                    // 1. Cap the old item to what was delivered
                    newItems.push({
                        ...item,
                        ordered_quantity: deliveredQty,
                        quantity_remaining: 0,
                        total_amount: deliveredQty * oldRate,
                        status: 'delivered'
                    });
                    newEstimatedTotal += deliveredQty * oldRate;
                    
                    // 2. Add a new item for the remainder with the new price
                    const newRemQty = Number(item.quantity_remaining);
                    newItems.push({
                        ...item,
                        ordered_quantity: newRemQty,
                        quantity_remaining: newRemQty,
                        rate_per_liter: newPrice,
                        original_rate: oldRate,
                        total_amount: newRemQty * newPrice,
                        status: 'pending',
                        delivered_quantity: 0
                    });
                    newEstimatedTotal += newRemQty * newPrice;
                } else {
                    // Not delivered at all, just update it in place
                    const qty = Number(item.ordered_quantity);
                    const oldRate = Number(item.rate_per_liter);
                    newItems.push({
                        ...item,
                        rate_per_liter: newPrice,
                        original_rate: item.original_rate || oldRate,
                        total_amount: qty * newPrice
                    });
                    newEstimatedTotal += qty * newPrice;
                }
            } else {
                newItems.push(item);
                newEstimatedTotal += Number(item.total_amount || (item.ordered_quantity * item.rate_per_liter));
            }
        });
        
        if (itemsChanged) {
            await supabase
                .from("purchase_orders")
                .update({ 
                    items: newItems,
                    estimated_total: newEstimatedTotal
                })
                .eq("id", poId);
        }
    }
    
    revalidatePath("/dashboard/purchases")
    return { success: true }
}
