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

    // If source = delivery or purchase, also fetch delivery details
    if (transaction.transaction_source === 'delivery' || transaction.transaction_source === 'purchase') {
        const { data: delivery } = await supabase
            .from('deliveries')
            .select(`
                *,
                purchase_orders!inner(
                    po_number,
                    ordered_quantity,
                    product_type,
                    unit_type,
                    estimated_total,
                    rate_per_liter,
                    quantity_remaining,
                    created_at,
                    expected_delivery_date,
                    products(
                        name,
                        category,
                        unit
                    )
                )
            `)
            .eq('id', transaction.delivery_id)
            .single()

        if (delivery) {
            resultTx.deliveries = delivery
        }
    }

    // If source = hold_release, fetch hold details
    if (transaction.transaction_source === 'hold_release') {
        const { data: hold } = await supabase
            .from('po_hold_records')
            .select(`
                *,
                purchase_orders!inner(
                    po_number,
                    product_type,
                    rate_per_liter,
                    unit_type,
                    products(
                        name,
                        category,
                        unit
                    )
                )
            `)
            .eq('id', transaction.hold_record_id)
            .single()

        if (hold) {
            resultTx.po_hold_records = hold
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
