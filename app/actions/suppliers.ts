"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function getSuppliers(includeInactive = false) {
    const supabase = await createClient()
    let query = supabase
        .from("suppliers")
        .select(`
      *,
      company_accounts (
        id,
        current_balance,
        opening_due,
        status
      )
    `)
    
    if (!includeInactive) {
        query = query.eq("status", "active")
    }

    const { data, error } = await query.order("name")

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
        opening_due,
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
        supplier_type: formData.supplier_type || "company",
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

export async function createCompanyAccount(supplierId: string, options?: { opening_due?: number }) {
    const supabase = await createClient()

    // Check if exists
    const { data: existing } = await supabase
        .from("company_accounts")
        .select("id")
        .eq("supplier_id", supplierId)
        .single()

    if (existing) {
        // Update opening_due if provided
        if (options?.opening_due !== undefined) {
            await supabase
                .from("company_accounts")
                .update({ opening_due: options.opening_due > 0 ? options.opening_due : 0 })
                .eq("id", existing.id)
        }
        return { success: true, id: existing.id }
    }

    const { data, error } = await supabase
        .from("company_accounts")
        .insert({
            supplier_id: supplierId,
            current_balance: 0,
            opening_due: options?.opening_due || 0,
            status: "active"
        })
        .select("id")
        .single()

    if (error) throw error

    revalidatePath("/dashboard/suppliers")
    revalidatePath(`/dashboard/suppliers/${supplierId}`)
    return { success: true, id: data.id }
}

export async function validateSupplierBalance(supplierId: string, requiredAmount: number) {
    const supabase = await createClient()
    const { data: account, error } = await supabase
        .from("company_accounts")
        .select("id, current_balance")
        .eq("supplier_id", supplierId)
        .single()

    if (error) throw new Error("Could not verify supplier balance.")

    const currentBalance = Number(account.current_balance)
    if (currentBalance < requiredAmount) {
        throw new Error(`Insufficient balance. Current balance: Rs. ${currentBalance.toLocaleString()}. Required: Rs. ${requiredAmount.toLocaleString()}.`)
    }

    return { success: true, accountId: account.id }
}



export async function addLedgerTransaction(payload: {
    company_account_id: string,
    transaction_type: 'credit' | 'debit',
    amount: number,           // Always positive — direction is set by transaction_type
    transaction_date: string,
    bank_account_id?: string,
    card_hold_id?: string,
    reference_number?: string,
    note?: string,
    purchase_order_id?: string,
    is_opening_balance?: boolean, // explicit flag for opening balance
    skip_date_validation?: boolean, // skip future-date check when called internally
}) {
    const supabase = await createClient()

    // Only run the future-date check when called directly from UI (not from internal balance actions)
    if (!payload.skip_date_validation) {
        // Compare as date-only strings to avoid UTC/PKT timezone mismatches
        const todayPKT = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Karachi' }).split(',')[0].trim()
        if (payload.transaction_date > todayPKT) {
            throw new Error("Transaction date cannot be in the future")
        }
    }

    if (payload.amount < 0) {
        throw new Error("Amount cannot be negative")
    }

    // Get current balance AND supplier type
    const { data: account, error: accError } = await supabase
        .from("company_accounts")
        .select("current_balance, supplier_id, suppliers(supplier_type)")
        .eq("id", payload.company_account_id)
        .single()

    if (accError) throw accError

    // Supabase joins can return array or object depending on relation type
    const supplierType = Array.isArray(account.suppliers)
        ? (account.suppliers as any[])[0]?.supplier_type
        : (account.suppliers as any)?.supplier_type
    const isLocalSupplier = supplierType === 'local'

    let newBalance = Number(account.current_balance)

    if (payload.transaction_type === 'credit') {
        // Credit = money coming into the account (increases balance / reduces debt)
        newBalance += payload.amount
    } else {
        // Debit = money going out / order placed (decreases balance)
        // CRITICAL: Local suppliers are allowed to have a negative balance (showing 'Due')
        if (!isLocalSupplier && newBalance < payload.amount && !payload.is_opening_balance) {
            throw new Error(`Insufficient balance. Current balance: Rs. ${newBalance.toLocaleString()}. Required: Rs. ${payload.amount.toLocaleString()}.`)
        }
        newBalance -= payload.amount
    }

    // Determine transaction source
    const { count, error: countError } = await supabase
        .from("company_account_transactions")
        .select('*', { count: 'exact', head: true })
        .eq("company_account_id", payload.company_account_id)

    if (countError) throw countError

    const isFirstTransaction = count === 0
    const txSource = (payload.is_opening_balance || isFirstTransaction)
        ? 'opening_balance'
        : payload.purchase_order_id ? 'purchase_order' 
        : 'manual_transfer'

    const bankAccountId = payload.bank_account_id || undefined

    const { error: txError } = await supabase
        .from("company_account_transactions")
        .insert({
            company_account_id: payload.company_account_id,
            transaction_type: payload.transaction_type,
            transaction_source: txSource,
            amount: payload.amount,
            bank_account_id: bankAccountId,
            card_hold_id: payload.card_hold_id || undefined,
            balance_before: Number(account.current_balance),
            balance_after: newBalance,
            transaction_date: payload.transaction_date,
            reference_number: payload.reference_number,
            purchase_order_id: payload.purchase_order_id || undefined,
            note: payload.note || (txSource === 'opening_balance' ? "Opening Balance" : undefined),
            remaining_amount: (isLocalSupplier && payload.transaction_type === 'debit') ? payload.amount : 0,
            is_due: (isLocalSupplier && payload.transaction_type === 'debit') ? true : false
        })

    if (txError) throw txError

    // 4. SMART SYNC: If this is a payment (Credit) for a PO, update the parent Debit's remaining_amount
    if (payload.transaction_type === 'credit' && payload.purchase_order_id && isLocalSupplier) {
        try {
            // Find the corresponding Debit row for this PO
            const { data: parentTx } = await supabase
                .from("company_account_transactions")
                .select("id, remaining_amount")
                .eq("purchase_order_id", payload.purchase_order_id)
                .eq("transaction_type", "debit")
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle()

            if (parentTx) {
                const currentRemaining = Number(parentTx.remaining_amount || 0)
                const newlyPaid = payload.amount
                const updatedRemaining = Math.max(0, currentRemaining - newlyPaid)

                await supabase
                    .from("company_account_transactions")
                    .update({ 
                        remaining_amount: updatedRemaining,
                        is_due: updatedRemaining > 0
                    })
                    .eq("id", parentTx.id)
            }
        } catch (syncErr) {
            console.error("Auto-sync of remaining amount failed:", syncErr)
            // We don't throw here to ensure the main transaction is still saved
        }
    }

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
            bank_accounts ( account_name ),
            deliveries (
                delivery_number,
                company_invoice_number,
                vehicle_number,
                driver_name,
                notes,
                delivered_quantity
            ),
            po_hold_records (
                hold_quantity,
                hold_amount,
                expected_return_date,
                actual_return_date,
                created_at
            ),
            card_hold_records (
                amount,
                net_amount,
                card_type,
                supplier_cards ( card_name )
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

    // --- BULK RECONCILIATION: Fix data drift for Local Suppliers ---
    try {
        const localDebits = (transactions || []).filter(tx => 
            tx.transaction_type === 'debit' && 
            tx.purchase_order_id
        )

        // Only reconcile if this is likely a local supplier ledger
        if (localDebits.length > 0) {
            const poIds = localDebits.map(d => d.purchase_order_id)
            
            // Get all payments for these POs
            const { data: allPayments } = await supabase
                .from("company_account_transactions")
                .select("purchase_order_id, amount")
                .in("purchase_order_id", poIds)
                .eq("transaction_type", "credit")

            const paymentMap: Record<string, number> = {}
            allPayments?.forEach(p => {
                paymentMap[p.purchase_order_id] = (paymentMap[p.purchase_order_id] || 0) + Number(p.amount)
            })

            for (let i = 0; i < (transactions || []).length; i++) {
                const tx = transactions![i]
                if (tx.transaction_type === 'debit' && tx.purchase_order_id) {
                    const totalPaid = paymentMap[tx.purchase_order_id] || 0
                    const expectedRemaining = Math.max(0, Number(tx.amount) - totalPaid)
                    
                    if (Number(tx.remaining_amount) !== expectedRemaining) {
                        // Silent update in DB
                        supabase
                            .from("company_account_transactions")
                            .update({ 
                                remaining_amount: expectedRemaining,
                                is_due: expectedRemaining > 0
                            })
                            .eq("id", tx.id)
                            .then(() => {})

                        // Update in-memory for immediate UI
                        transactions![i].remaining_amount = expectedRemaining
                        transactions![i].is_due = expectedRemaining > 0
                    }
                }
            }
        }
    } catch (err) {
        console.error("Bulk reconciliation error:", err)
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
            if (t.transaction_source === 'opening_balance') {
                openingBalance -= Number(t.amount)
            }
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
            openingBalance += discrepancy
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

    // 1. Try to fetch from company_account_transactions first
    const { data: transaction, error: txError } = await supabase
        .from("company_account_transactions")
        .select(`
            *,
            bank_accounts ( account_name ),
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

    if (!txError && transaction) {
        console.log("Transaction found in company_account_transactions:", transactionId)
        let resultTx = { ...transaction, source_table: 'company_account_transactions' }

        // Resolve Purchase Order ID
        const poId = transaction.purchase_order_id || transaction.deliveries?.purchase_order_id || transaction.po_hold_records?.purchase_order_id

        // Fetch all related context (Deliveries, POs, Holds)
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

            const { data: allHolds } = await supabase
                .from('po_hold_records')
                .select('*')
                .eq('purchase_order_id', poId)
                .order('created_at', { ascending: false })

            resultTx.all_related_holds = allHolds || []
        }

        // Helper to map product names
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

        if (resultTx.purchase_orders) resultTx.purchase_orders = await mapPOItems(resultTx.purchase_orders);
        if (resultTx.all_related_deliveries) {
            for (let del of resultTx.all_related_deliveries) {
                if (del.purchase_orders) del.purchase_orders = await mapPOItems(del.purchase_orders);
            }
        }

        // Fetch related payment history if it's a PO transaction
        if (resultTx.purchase_order_id || resultTx.transaction_source === 'purchase_order') {
            const poId = resultTx.purchase_order_id || resultTx.deliveries?.purchase_order_id
            if (poId) {
                const { data: payments } = await supabase
                    .from("company_account_transactions")
                    .select("*")
                    .eq("purchase_order_id", poId)
                    .eq("transaction_type", "credit")
                    .order("transaction_date", { ascending: true })
                    .order("created_at", { ascending: true })
                
                resultTx.payment_history = payments || []

                // SELF-HEALING: If the stored remaining_amount doesn't match the history, fix it now
                const totalPaid = (payments || []).reduce((acc: number, p: any) => acc + Number(p.amount), 0)
                const expectedRemaining = Math.max(0, Number(resultTx.amount) - totalPaid)
                
                if (Number(resultTx.remaining_amount) !== expectedRemaining) {
                    // Update only if it's a Debit row (the parent)
                    if (resultTx.transaction_type === 'debit') {
                        await supabase
                            .from("company_account_transactions")
                            .update({ 
                                remaining_amount: expectedRemaining,
                                is_due: expectedRemaining > 0
                            })
                            .eq("id", resultTx.id)
                        
                        // Update the object in memory so the UI shows the fixed value immediately
                        resultTx.remaining_amount = expectedRemaining
                        resultTx.is_due = expectedRemaining > 0
                    }
                }
            }
        }

        // Fetch running balance from ledger
        const ledger = await getSupplierLedger(resultTx.company_account_id)
        const matchingRow = ledger.transactions.find(t => t.id === resultTx.id)
        resultTx.balance_before = matchingRow ? matchingRow.balance_before : 0
        resultTx.balance_after = matchingRow ? matchingRow.balance_after : 0

        return resultTx
    }

    // 2. If not found, try balance_transactions (Internal/Manual Movements)
    console.log("Not found in first table, trying balance_transactions for:", transactionId)
    const { data: balanceTx, error: bErr } = await supabase
        .from("balance_transactions")
        .select(`
            *,
            bank_accounts:bank_account_id ( account_name ),
            to_bank_accounts:to_bank_account_id ( account_name ),
            suppliers ( name, contact_person, phone )
        `)
        .eq("id", transactionId)
        .single()

    if (!bErr && balanceTx) {
        console.log("Transaction ID matched in balance_transactions:", transactionId)
        // Map fields to match the UI expectations
        return {
            ...balanceTx,
            source_table: 'balance_transactions',
            note: balanceTx.description || (balanceTx.is_opening ? "Opening Balance Initialization" : "Manual Balance Movement"),
            // Synthesize transaction_source for the UI labels
            transaction_source: balanceTx.is_opening ? 'opening_balance' : balanceTx.transaction_type,
            // company_accounts dummy for supplier profile UI if supplier_id is present
            company_accounts: balanceTx.suppliers ? { 
                suppliers: balanceTx.suppliers,
                current_balance: 0 // We don't necessarily know the total here easily
            } : null
        }
    }

    console.error("Transaction not found in either table:", transactionId)
    return null
}

export async function deleteSupplier(supplierId: string) {
    const supabase = await createClient()

    // Delete balance transactions referencing this supplier (avoids foreign key constraints as it often doesn't cascade)
    await supabase.from("balance_transactions").delete().eq("supplier_id", supplierId)

    // Suppliers table has ON DELETE CASCADE for company_accounts, purchase_orders, and deliveries.
    // Deleting the supplier will completely wipe all of its records from the system.
    const { error: delErr } = await supabase.from("suppliers").delete().eq("id", supplierId)
    
    if (delErr) {
        throw new Error("Failed to delete supplier. Detail: " + delErr.message)
    }

    revalidatePath("/dashboard/suppliers")
    return { success: true }
}

export async function getActiveBankAccounts() {
    const supabase = await createClient()
    const { data } = await supabase
        .from('bank_accounts')
        .select('id, bank_name, account_name, account_number')
        .eq('status', 'active')
    return data || []
}

