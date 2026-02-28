"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function getSuppliers() {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from("suppliers")
        .select(`
      *,
      company_accounts (
        id,
        current_balance
      )
    `)
        .eq("status", "active")
        .order("name")

    if (error) throw error
    return data
}

export async function getSupplierById(id: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from("suppliers")
        .select(`
      *,
      company_accounts (
        id,
        current_balance,
        status
      )
    `)
        .eq("id", id)
        .single()

    if (error) throw error
    return data
}

export async function upsertSupplier(formData: any, supplierId?: string) {
    const supabase = await createClient()

    const supplierData = {
        name: formData.name,
        contact_person: formData.contact_person,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        ntn_number: formData.ntn_number,
        product_type: formData.product_type,
        status: formData.status || "active",
        updated_at: new Date().toISOString(),
    }

    if (supplierId) {
        const { error } = await supabase
            .from("suppliers")
            .update(supplierData)
            .eq("id", supplierId)
        if (error) throw error
        revalidatePath("/dashboard/suppliers")
        revalidatePath(`/dashboard/suppliers/${supplierId}`)
        return { success: true, id: supplierId }
    } else {
        // Check uniqueness manually for better error message
        const { data: existing } = await supabase
            .from("suppliers")
            .select("id")
            .eq("name", formData.name)
            .single()

        if (existing) {
            throw new Error("A supplier with this name already exists")
        }

        const { data, error } = await supabase
            .from("suppliers")
            .insert(supplierData)
            .select("id")
            .single()

        if (error) throw error
        revalidatePath("/dashboard/suppliers")
        return { success: true, id: data.id }
    }
}

export async function createCompanyAccount(supplierId: string) {
    const supabase = await createClient()

    // Check if exists
    const { data: existing } = await supabase
        .from("company_accounts")
        .select("id")
        .eq("supplier_id", supplierId)
        .single()

    if (existing) {
        return { success: true, id: existing.id }
    }

    const { data, error } = await supabase
        .from("company_accounts")
        .insert({
            supplier_id: supplierId,
            current_balance: 0,
            status: "active"
        })
        .select("id")
        .single()

    if (error) throw error

    revalidatePath("/dashboard/suppliers")
    revalidatePath(`/dashboard/suppliers/${supplierId}`)
    return { success: true, id: data.id }
}

export async function addLedgerTransaction(payload: {
    company_account_id: string,
    transaction_type: 'credit' | 'debit',
    amount: number,
    transaction_date: string,
    reference_number?: string,
    note?: string
}) {
    const supabase = await createClient()

    if (new Date(payload.transaction_date) > new Date()) {
        throw new Error("Transaction date cannot be in the future")
    }

    if (payload.amount <= 0) {
        throw new Error("Amount must be greater than 0")
    }

    // Get current balance
    const { data: account, error: accError } = await supabase
        .from("company_accounts")
        .select("current_balance, supplier_id")
        .eq("id", payload.company_account_id)
        .single()

    if (accError) throw accError

    let newBalance = Number(account.current_balance)
    if (payload.transaction_type === 'credit') {
        newBalance += payload.amount
    } else {
        if (newBalance < payload.amount) {
            throw new Error("Insufficient balance for this debit transaction")
        }
        newBalance -= payload.amount
    }

    // Check if this is the very first transaction for this account
    const { count, error: countError } = await supabase
        .from("company_account_transactions")
        .select('*', { count: 'exact', head: true })
        .eq("company_account_id", payload.company_account_id)

    if (countError) throw countError

    const isFirstTransaction = count === 0
    const txSource = isFirstTransaction && payload.transaction_type === 'credit'
        ? 'opening_balance'
        : 'manual_transfer'

    // Start Transaction

    const { error: txError } = await supabase
        .from("company_account_transactions")
        .insert({
            company_account_id: payload.company_account_id,
            transaction_type: payload.transaction_type,
            transaction_source: txSource,
            amount: payload.amount,
            transaction_date: payload.transaction_date,
            reference_number: payload.reference_number,
            note: payload.note || (txSource === 'opening_balance' ? "Initial Account Balance" : undefined)
        })

    if (txError) throw txError

    const { error: upError } = await supabase
        .from("company_accounts")
        .update({
            current_balance: newBalance,
            updated_at: new Date().toISOString()
        })
        .eq("id", payload.company_account_id)

    if (upError) throw upError

    revalidatePath("/dashboard/suppliers")
    revalidatePath(`/dashboard/suppliers/${account.supplier_id}`)
    revalidatePath(`/dashboard/suppliers/${account.supplier_id}/transactions`)

    return { success: true }
}

export async function getSupplierLedger(companyAccountId: string, filters?: { date_from?: string; date_to?: string }) {
    const supabase = await createClient()

    // 1. Fetch ALL transactions for the account
    // Join all necessary tables to populate the transaction correctly based on its source.
    let { data: transactions, error } = await supabase
        .from("company_account_transactions")
        .select(`
            *,
            transaction_source,
            deliveries (
                delivery_number,
                company_invoice_number,
                vehicle_number,
                driver_name,
                notes,
                delivered_quantity,
                purchase_orders (
                    po_number,
                    ordered_quantity,
                    unit_type,
                    products (
                        name
                    )
                )
            ),
            po_hold_records (
                hold_quantity,
                hold_amount,
                expected_return_date,
                actual_return_date,
                created_at,
                purchase_orders (
                    po_number,
                    products (
                        name
                    )
                )
            ),
            purchase_orders (
                po_number,
                ordered_quantity,
                unit_type,
                rate_per_liter,
                products (
                    name,
                    category,
                    unit
                )
            )
        `)
        .eq("company_account_id", companyAccountId)
        .order("transaction_date", { ascending: true })
        .order("created_at", { ascending: true })

    if (error) {
        console.error("Ledger Join Query Failed (Likely missing schema_update.sql columns):", error)
        // Fallback to basic query if the joined query fails
        const { data: fallbackTx, error: fallbackErr } = await supabase
            .from("company_account_transactions")
            .select('*')
            .eq("company_account_id", companyAccountId)
            .order("transaction_date", { ascending: true })
            .order("created_at", { ascending: true })

        if (fallbackErr) throw fallbackErr
        transactions = fallbackTx || []
    }

    // 2. Calculate Running Balances
    let runningBalance = 0
    let openingBalance = 0
    let totalCredits = 0
    let totalDebits = 0

    const enrichedTransactions = (transactions || []).map((t) => {
        const balanceBefore = runningBalance

        if (t.transaction_type === 'credit') {
            runningBalance += Number(t.amount)
            totalCredits += Number(t.amount)
            if (t.transaction_source === 'opening_balance') {
                openingBalance += Number(t.amount)
            }
        } else if (t.transaction_type === 'debit') {
            runningBalance -= Number(t.amount)
            totalDebits += Number(t.amount)
        }

        const balanceAfter = runningBalance

        return {
            ...t,
            balance_before: balanceBefore,
            balance_after: balanceAfter
        }
    })

    // 3. Fallback Reconciliation
    // Sometimes old accounts were created with a balance but NO transaction record.
    // If the final runningBalance from the ledger doesn't match the actual company_account current_balance,
    // we should prepend a virtual "Legacy Opening Balance" row so the math is perfect.
    const { data: accData } = await supabase.from('company_accounts').select('current_balance, created_at').eq('id', companyAccountId).single()

    if (accData) {
        const actualBalance = Number(accData.current_balance)
        const discrepancy = actualBalance - runningBalance

        if (discrepancy !== 0) {
            const virtualTx = {
                id: 'virtual-opening-balance',
                company_account_id: companyAccountId,
                transaction_type: discrepancy > 0 ? 'credit' : 'debit',
                transaction_source: 'opening_balance',
                amount: Math.abs(discrepancy),
                transaction_date: accData.created_at || new Date().toISOString(),
                note: 'Legacy Opening/Reconciled Balance',
                balance_before: 0,
                balance_after: discrepancy
            }

            // Unshift this to the top of the enriched array
            enrichedTransactions.unshift(virtualTx)

            // Re-calculate the subsequent row balances for UI perfection
            let newRunningBalance = discrepancy
            if (discrepancy > 0) openingBalance += discrepancy

            for (let i = 1; i < enrichedTransactions.length; i++) {
                const updatedRow = { ...enrichedTransactions[i] }
                updatedRow.balance_before = newRunningBalance
                if (updatedRow.transaction_type === 'credit') {
                    newRunningBalance += Number(updatedRow.amount)
                } else {
                    newRunningBalance -= Number(updatedRow.amount)
                }
                updatedRow.balance_after = newRunningBalance
                enrichedTransactions[i] = updatedRow
            }
        }
    }

    // 4. Apply Date Filters AFTER calculating running balance
    let filteredTransactions = enrichedTransactions
    if (filters?.date_from) {
        filteredTransactions = filteredTransactions.filter(t => new Date(t.transaction_date) >= new Date(filters.date_from as string))
    }
    if (filters?.date_to) {
        filteredTransactions = filteredTransactions.filter(t => new Date(t.transaction_date) <= new Date(filters.date_to as string))
    }

    return {
        transactions: filteredTransactions,
        summary: {
            opening_balance: openingBalance,
            total_credits: totalCredits,
            total_debits: totalDebits,
            current_balance: totalCredits - totalDebits
        }
    }
}

export async function getTransactionDetail(transactionId: string) {
    const supabase = await createClient()

    // 1. Fetch transaction with NO source filter, joining company_accounts -> suppliers
    const { data: transaction, error: txError } = await supabase
        .from("company_account_transactions")
        .select(`
            *,
            company_accounts!inner(
                id,
                current_balance,
                supplier_id,
                suppliers!inner(
                    name,
                    contact_person,
                    phone,
                    status
                )
            )
        `)
        .eq("id", transactionId)
        .single()

    if (txError) {
        console.error("Failed to fetch transaction detail:", txError)
        throw txError
    }

    let resultTx = { ...transaction }

    // 1. Resolve Purchase Order ID
    const poId = transaction.purchase_order_id || transaction.deliveries?.purchase_order_id || transaction.po_hold_records?.purchase_order_id

    // 2. Fetch all related deliveries if a PO exists
    if (poId) {
        const { data: allDeliveries } = await supabase
            .from('deliveries')
            .select(`
                *,
                purchase_orders(
                    po_number,
                    items,
                    products(name)
                )
            `)
            .eq('purchase_order_id', poId)
            .order('delivery_date', { ascending: false })

        resultTx.all_related_deliveries = allDeliveries || []

        // Fetch the main PO object if we don't have it
        const { data: po } = await supabase
            .from('purchase_orders')
            .select(`
                *,
                products(
                    name,
                    category,
                    unit
                )
            `)
            .eq('id', poId)
            .single()

        if (po) resultTx.purchase_orders = po

        // Fetch all hold records for this PO
        const { data: allHolds } = await supabase
            .from('po_hold_records')
            .select('*')
            .eq('purchase_order_id', poId)
            .order('created_at', { ascending: false })

        resultTx.all_related_holds = allHolds || []
    }

    // 3. Helper to map product names for any PO object's items
    const mapPOItems = async (poObj: any) => {
        if (!poObj || !poObj.items || !Array.isArray(poObj.items)) return poObj;
        const productIds = Array.from(new Set(poObj.items.filter((i: any) => i.product_id).map((i: any) => i.product_id)));
        if (productIds.length > 0) {
            const { data: products } = await supabase
                .from("products")
                .select("id, name, category")
                .in("id", productIds);
            if (products) {
                const productMap = new Map(products.map((p: any) => [p.id, p]));
                poObj.items = poObj.items.map((item: any) => {
                    const product = productMap.get(item.product_id);
                    return {
                        ...item,
                        product_name: product ? product.name : "Unknown Product",
                        product_category: product ? product.category : item.product_type
                    };
                });
            }
        }
        return poObj;
    };

    // Map main PO items
    if (resultTx.purchase_orders) {
        resultTx.purchase_orders = await mapPOItems(resultTx.purchase_orders);

        // Populate product names for holds now that PO items are mapped
        if (resultTx.all_related_holds?.length > 0 && resultTx.purchase_orders.items) {
            resultTx.all_related_holds = resultTx.all_related_holds.map((h: any) => {
                if (!h.product_name && h.po_item_index !== undefined) {
                    const item = resultTx.purchase_orders.items[h.po_item_index];
                    if (item) return { ...h, product_name: item.product_name };
                }
                return h;
            });
        }
    }

    // Map items in all related deliveries
    if (resultTx.all_related_deliveries) {
        for (let del of resultTx.all_related_deliveries) {
            if (del.purchase_orders) {
                del.purchase_orders = await mapPOItems(del.purchase_orders);
                // Also populate product_name from items if missing
                if (!del.product_name && del.purchase_orders.items && del.po_item_index !== undefined) {
                    const item = del.purchase_orders.items[del.po_item_index];
                    if (item) del.product_name = item.product_name;
                }
            }
        }
    }

    // 4. Fetch specific delivery details if this transaction is linked to ONE delivery
    if (transaction.delivery_id) {
        const { data: delivery } = await supabase
            .from('deliveries')
            .select(`
                *,
                purchase_orders!inner(
                    id,
                    po_number,
                    items
                )
            `)
            .eq('id', transaction.delivery_id)
            .single()

        if (delivery) {
            delivery.purchase_orders = await mapPOItems(delivery.purchase_orders);
            // Also populate product_name here
            if (!delivery.product_name && delivery.purchase_orders.items && delivery.po_item_index !== undefined) {
                const item = delivery.purchase_orders.items[delivery.po_item_index];
                if (item) delivery.product_name = item.product_name;
            }
            resultTx.deliveries = delivery;
        }
    }

    // 5. If source = hold_release, fetch hold details
    if (transaction.transaction_source === 'hold_release') {
        const { data: hold } = await supabase
            .from('po_hold_records')
            .select(`
                *,
                purchase_orders!inner(
                    po_number,
                    items,
                    products(name)
                )
            `)
            .eq('id', transaction.hold_record_id)
            .single()

        if (hold) {
            hold.purchase_orders = await mapPOItems(hold.purchase_orders);
            resultTx.po_hold_records = hold;
        }
    }

    // 2. Fetch all transactions via getSupplierLedger to ensure DRY exact match with the Virtual Reconciliations
    const ledger = await getSupplierLedger(resultTx.company_account_id)
    const matchingRow = ledger.transactions.find(t => t.id === resultTx.id)

    let balanceBefore = matchingRow ? matchingRow.balance_before : 0
    let balanceAfter = matchingRow ? matchingRow.balance_after : 0

    return {
        ...resultTx,
        balance_before: balanceBefore,
        balance_after: balanceAfter
    }
}

export async function deleteSupplier(supplierId: string) {
    const supabase = await createClient()

    // Check balance before allowing deletion
    const { data: qAcc } = await supabase
        .from("company_accounts")
        .select("current_balance")
        .eq("supplier_id", supplierId)
        .single()

    if (qAcc && Number(qAcc.current_balance) !== 0) {
        throw new Error("Cannot delete supplier with an outstanding account balance. Please settle the balance first.")
    }

    const { error: delErr } = await supabase.from("suppliers").delete().eq("id", supplierId)
    if (delErr) throw delErr

    revalidatePath("/dashboard/suppliers")
    return { success: true }
}
