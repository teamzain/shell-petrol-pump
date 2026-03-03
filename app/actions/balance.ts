"use server"

import { createClient } from "@/lib/supabase/server"
import { getTodayPKT, getTomorrowPKT, getNextDate } from "@/lib/utils"
import { revalidatePath } from "next/cache"

export async function getBalanceOverviewData(date?: string) {
    const supabase = await createClient()
    const targetDate = date || getTodayPKT()

    // 1. Fetch Today's Daily Status
    const { data: todayBalance, error: balErr } = await supabase
        .from("daily_accounts_status")
        .select("*")
        .eq("status_date", targetDate)
        .single()

    // 2. Fetch Balance History (last 30 days)
    const { data: balanceHistory, error: histErr } = await supabase
        .from("daily_accounts_status")
        .select("*")
        .order("status_date", { ascending: false })
        .limit(30)

    // 3. Fetch Bank Accounts
    const { data: bankAccounts, error: bankErr } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("status", "active")
        .order("account_name")

    // 4. Fetch Bank Cards
    const { data: bankCards, error: cardErr } = await supabase
        .from("bank_cards")
        .select(`
            *,
            bank_accounts ( account_name )
        `)
        .eq("is_active", true)
        .order("card_name")

    // 4b. Fetch Supplier Cards
    const { data: supplierCards, error: suppCardErr } = await supabase
        .from("supplier_cards")
        .select(`
            *,
            suppliers ( name )
        `)
        .eq("is_active", true)
        .order("card_name")

    // 5. Fetch Suppliers with active balances
    const { data: suppliers, error: suppErr } = await supabase
        .from("suppliers")
        .select(`
            id,
            name,
            company_accounts ( current_balance )
        `)
        .eq("status", "active")

    // 6. Results
    let errors = []
    if (balErr && balErr.code !== 'PGRST116') {
        console.error('balErr', balErr)
        errors.push(`Daily Status: ${balErr.message}`)
    }
    if (histErr) {
        console.error('histErr', histErr)
        errors.push(`History: ${histErr.message}`)
    }
    if (bankErr) {
        console.error('bankErr', bankErr)
        errors.push(`Bank Accounts: ${bankErr.message}`)
    }
    if (cardErr) {
        console.error('cardErr', cardErr)
        errors.push(`Bank Cards: ${cardErr.message}`)
    }
    if (suppErr) {
        console.error('suppErr', suppErr)
        errors.push(`Suppliers: ${suppErr.message}`)
    }
    if (suppCardErr) {
        console.error('suppCardErr', suppCardErr)
        errors.push(`Supplier Cards: ${suppCardErr.message}`)
    }

    if (errors.length > 0) {
        throw new Error(`Database Error: ${errors.join(' | ')}`)
    }

    return {
        todayBalance: todayBalance || null,
        balanceHistory: balanceHistory || [],
        bankAccounts: bankAccounts || [],
        bankCards: bankCards || [],
        supplierCards: supplierCards || [],
        suppliers: (suppliers || []).map((s: any) => {
            // company_accounts can be array (one-to-many) or object (single) or null
            const accounts = s.company_accounts
            let balance = 0
            if (Array.isArray(accounts) && accounts.length > 0) {
                balance = Number(accounts[0]?.current_balance || 0)
            } else if (accounts && typeof accounts === 'object' && !Array.isArray(accounts)) {
                balance = Number(accounts.current_balance || 0)
            }
            return {
                id: s.id,
                supplier_name: s.name,
                account_balance: balance,
                tax_percentage: Number(s.tax_percentage || 0)
            }
        })
    }
}

export async function addBankCard(data: {
    bank_account_id: string;
    card_name: string;
    card_number?: string;
    tax_percentage: number;
}) {
    const supabase = await createClient()

    const { data: newCard, error } = await supabase
        .from("bank_cards")
        .insert({
            bank_account_id: data.bank_account_id,
            card_name: data.card_name,
            card_number: data.card_number,
            tax_percentage: data.tax_percentage,
            opening_balance: 0,
            current_balance: 0
        })
        .select()
        .single()

    if (error) throw error

    revalidatePath("/dashboard/balance")
    return { success: true, data: newCard }
}

export async function addSupplierCard(data: {
    supplier_id: string;
    card_name: string;
    card_number?: string;
    tax_percentage: number;
}) {
    const supabase = await createClient()

    const { data: newCard, error } = await supabase
        .from("supplier_cards")
        .insert({
            supplier_id: data.supplier_id,
            card_name: data.card_name,
            card_number: data.card_number,
            tax_percentage: data.tax_percentage,
            is_active: true
        })
        .select()
        .single()

    if (error) throw error

    revalidatePath("/dashboard/balance")
    return { success: true, data: newCard }
}

export async function addBankAccount(data: {
    account_name: string;
    account_number?: string;
    bank_name?: string;
    opening_balance: number;
}) {
    const supabase = await createClient()

    const { data: account, error } = await supabase
        .from("bank_accounts")
        .insert({
            ...data,
            current_balance: data.opening_balance
        })
        .select()
        .single()

    if (error) throw error

    revalidatePath("/dashboard/balance")
    return { success: true, data: account }
}

export async function updateDailyOpeningBalances(cash: number, bank: number, date?: string) {
    const supabase = await createClient()
    const targetDate = date || getTodayPKT()

    const { data, error } = await supabase
        .from("daily_accounts_status")
        .upsert({
            status_date: targetDate,
            opening_cash: cash,
            opening_bank: bank,
            updated_at: new Date().toISOString()
        }, { onConflict: 'status_date' })
        .select()
        .single()

    if (error) throw error

    revalidatePath("/dashboard/balance")
    return { success: true, data }
}

export async function recordBalanceTransaction(data: {
    transaction_type: 'cash_to_bank' | 'bank_to_cash' | 'add_cash' | 'add_bank' | 'transfer_to_supplier' | 'supplier_to_bank';
    amount: number;
    bank_account_id?: string;
    bank_card_id?: string;
    supplier_id?: string;
    supplier_card_id?: string;
    description: string;
    isOpeningBalance?: boolean;
    date?: string;
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const targetDate = data.date || getTodayPKT()

    // 1. Record the transaction
    const insertPayload: any = {
        transaction_type: data.transaction_type,
        amount: data.amount,
        description: data.description,
        transaction_date: targetDate,
        created_by: user.id
    }
    if (data.bank_account_id) insertPayload.bank_account_id = data.bank_account_id
    if (data.bank_card_id) insertPayload.bank_card_id = data.bank_card_id
    if (data.supplier_id) insertPayload.supplier_id = data.supplier_id
    if (data.supplier_card_id) insertPayload.supplier_card_id = data.supplier_card_id
    if (data.isOpeningBalance) insertPayload.is_opening = true

    const { error: txErr } = await supabase
        .from("balance_transactions")
        .insert(insertPayload)

    // Ignore error if bank_card_id or is_opening column doesn't exist yet
    if (txErr && !txErr.message?.includes('bank_card_id') && !txErr.message?.includes('is_opening')) throw txErr

    // 2. Resolve target bank account if card is used
    let effectiveBankId = data.bank_account_id
    if (data.bank_card_id && !effectiveBankId) {
        const { data: card } = await supabase
            .from("bank_cards")
            .select("bank_account_id")
            .eq("id", data.bank_card_id)
            .single()
        if (card) effectiveBankId = card.bank_account_id
    }

    // 2b. Resolve target supplier if supplier card is used
    let effectiveSupplierId = data.supplier_id
    if (data.supplier_card_id && !effectiveSupplierId) {
        const { data: card } = await supabase
            .from("supplier_cards")
            .select("supplier_id")
            .eq("id", data.supplier_card_id)
            .single()
        if (card) effectiveSupplierId = card.supplier_id
    }

    // 3. Determine adjustments
    let cashAdj = 0
    let bankAdj = 0

    if (data.transaction_type === 'cash_to_bank') {
        cashAdj = -data.amount
        bankAdj = data.amount
    } else if (data.transaction_type === 'bank_to_cash') {
        cashAdj = data.amount
        bankAdj = -data.amount
    } else if (data.transaction_type === 'add_cash') {
        cashAdj = data.amount
    } else if (data.transaction_type === 'add_bank') {
        bankAdj = data.amount
    } else if (data.transaction_type === 'transfer_to_supplier') {
        // If an account or card is provided, deduct from bank, else deduct from cash
        if (effectiveBankId) {
            bankAdj = -data.amount
        } else {
            cashAdj = -data.amount
        }
    } else if (data.transaction_type === 'supplier_to_bank') {
        bankAdj = data.amount
    }

    // 4. Update individual bank account balance if applicable
    if (effectiveBankId && bankAdj !== 0) {
        // Try RPC first, fallback to direct update
        const { error: bankUpErr } = await supabase.rpc("adjust_bank_balance", {
            p_bank_id: effectiveBankId,
            p_amount: bankAdj
        })
        if (bankUpErr) {
            const { data: bank } = await supabase
                .from("bank_accounts")
                .select("current_balance")
                .eq("id", effectiveBankId)
                .single()
            if (bank) {
                await supabase.from("bank_accounts").update({
                    current_balance: Number(bank.current_balance || 0) + bankAdj,
                    updated_at: new Date().toISOString()
                }).eq("id", effectiveBankId)
            }
        }
    }

    // 4. Update Daily Accounts Status
    const { data: currentStatus } = await supabase
        .from("daily_accounts_status")
        .select("opening_cash, closing_cash, opening_bank, closing_bank")
        .eq("status_date", targetDate)
        .single()

    if (currentStatus) {
        const newClosingCash = (currentStatus.closing_cash ?? currentStatus.opening_cash ?? 0) + cashAdj
        const newClosingBank = (currentStatus.closing_bank ?? currentStatus.opening_bank ?? 0) + bankAdj

        const updatePayload: any = {
            closing_cash: newClosingCash,
            closing_bank: newClosingBank,
            updated_at: new Date().toISOString()
        }

        if (data.isOpeningBalance) {
            if (data.transaction_type === 'add_cash') {
                updatePayload.opening_cash = (currentStatus.opening_cash ?? 0) + data.amount
            } else if (data.transaction_type === 'add_bank') {
                updatePayload.opening_bank = (currentStatus.opening_bank ?? 0) + data.amount
            }
        }

        await supabase.from("daily_accounts_status")
            .update(updatePayload)
            .eq("status_date", targetDate)
    } else {
        const insertDaily: any = {
            status_date: targetDate,
            opening_cash: 0,
            closing_cash: cashAdj,
            opening_bank: 0,
            closing_bank: bankAdj,
            updated_at: new Date().toISOString()
        }

        if (data.isOpeningBalance) {
            if (data.transaction_type === 'add_cash') insertDaily.opening_cash = data.amount
            if (data.transaction_type === 'add_bank') insertDaily.opening_bank = data.amount
        }

        await supabase.from("daily_accounts_status").insert(insertDaily)
    }

    // 5. Update supplier balance if applicable
    if ((data.transaction_type === 'transfer_to_supplier' || data.transaction_type === 'supplier_to_bank') && effectiveSupplierId) {
        // Find company account id
        const { data: compAcc } = await supabase
            .from("company_accounts")
            .select("id")
            .eq("supplier_id", effectiveSupplierId)
            .single()

        if (compAcc) {
            const txType = data.transaction_type === 'transfer_to_supplier' ? 'credit' : 'debit'
            // Use existing supplier action to add credit/debit
            const { addLedgerTransaction } = await import("./suppliers")
            await addLedgerTransaction({
                company_account_id: compAcc.id,
                transaction_type: txType,
                amount: data.amount,
                transaction_date: targetDate,
                note: data.description || `Transfer ${data.transaction_type === 'transfer_to_supplier' ? 'to' : 'from'} supplier`
            })
        }
    }

    revalidatePath("/dashboard/balance")
    revalidatePath("/dashboard/suppliers")
    return { success: true }
}

export async function closeDayForBalance(cashClosing: number, bankClosing: number, date?: string) {
    const supabase = await createClient()
    const targetDate = date || getTodayPKT()
    const { data: { user } } = await supabase.auth.getUser()

    console.log('Closing day for:', targetDate, { cashClosing, bankClosing })

    // 1. Manual close sets today's closing balances
    const { data: updateResult, error } = await supabase
        .from("daily_accounts_status")
        .update({
            closing_cash: cashClosing,
            closing_bank: bankClosing,
            is_closed: true,
            updated_at: new Date().toISOString()
        })
        .eq("status_date", targetDate)
        .select()

    if (error) {
        console.error('Close day error:', error)
        throw error
    }

    // 2. Automate next day opening
    const nextDate = getNextDate(targetDate)

    // A. Upsert next day in daily_accounts_status
    console.log('Opening next day status for:', nextDate)
    const { error: nextBalErr } = await supabase
        .from("daily_accounts_status")
        .upsert({
            status_date: nextDate,
            opening_cash: cashClosing,
            closing_cash: cashClosing,
            opening_bank: bankClosing,
            closing_bank: bankClosing,
            is_closed: false,
            updated_at: new Date().toISOString()
        }, { onConflict: 'status_date' })

    if (nextBalErr) {
        console.error('Next day status error:', nextBalErr)
        throw new Error(`Failed to create next day status: ${nextBalErr.message}`)
    }

    // B. Upsert next day in daily_operations
    console.log('Opening next day operations for:', nextDate)
    const { error: nextOpsErr } = await supabase
        .from("daily_operations")
        .upsert({
            operation_date: nextDate,
            status: 'open',
            opening_cash: cashClosing,
            opening_cash_actual: cashClosing,
            opening_cash_variance: 0,
            opening_bank: bankClosing,
            opened_by: user?.id,
            opened_at: new Date().toISOString()
        }, { onConflict: 'operation_date' })

    if (nextOpsErr) {
        console.error('Next day operations error:', nextOpsErr)
        // We don't necessarily throw here if status was created, but for consistency we should
        throw new Error(`Failed to create next day operations: ${nextOpsErr.message}`)
    }

    console.log('Day closed and next day opened successfully')

    revalidatePath("/dashboard/balance")
    revalidatePath("/dashboard")
    return { success: true }
}

export async function updateSupplierTax(supplierId: string, taxPercentage: number) {
    const supabase = await createClient()

    const { error } = await supabase
        .from("suppliers")
        .update({ tax_percentage: taxPercentage })
        .eq("id", supplierId)

    if (error) throw error

    revalidatePath("/dashboard/balance")
    return { success: true }
}

export async function updateBankAccount(id: string, data: {
    account_name?: string;
    account_number?: string;
    bank_name?: string;
    opening_balance?: number;
}) {
    const supabase = await createClient()

    const updatePayload: any = { ...data }
    if (data.opening_balance !== undefined) {
        // Note: Changing opening balance might need current_balance adjustment logic
        // For simplicity, we just update the field.
        updatePayload.current_balance = data.opening_balance
    }

    const { error } = await supabase
        .from("bank_accounts")
        .update({
            ...updatePayload,
            updated_at: new Date().toISOString()
        })
        .eq("id", id)

    if (error) throw error

    revalidatePath("/dashboard/balance")
    return { success: true }
}

export async function updateBankCard(id: string, data: {
    bank_account_id?: string;
    card_name?: string;
    card_number?: string;
    tax_percentage?: number;
}) {
    const supabase = await createClient()

    const { error } = await supabase
        .from("bank_cards")
        .update({
            ...data,
            updated_at: new Date().toISOString()
        })
        .eq("id", id)

    if (error) throw error

    revalidatePath("/dashboard/balance")
    return { success: true }
}

export async function updateSupplierCard(id: string, data: {
    supplier_id?: string;
    card_name?: string;
    card_number?: string;
    tax_percentage?: number;
}) {
    const supabase = await createClient()

    const { error } = await supabase
        .from("supplier_cards")
        .update({
            ...data,
            updated_at: new Date().toISOString()
        })
        .eq("id", id)

    if (error) throw error

    revalidatePath("/dashboard/balance")
    return { success: true }
}
