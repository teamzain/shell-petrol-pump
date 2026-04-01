"use server"

import { createClient } from "@/lib/supabase/server"
import { getTodayPKT, getTomorrowPKT, getNextDate, getPreviousDate } from "@/lib/utils"
import { revalidatePath } from "next/cache"
import { addLedgerTransaction } from "./suppliers"

export async function getBalanceOverviewData(date?: string) {
    const supabase = await createClient()
    const targetDate = date || getTodayPKT()

    // 1. Fetch Today's Daily Status
    let { data: todayBalance, error: balErr } = await supabase
        .from("daily_accounts_status")
        .select("*")
        .eq("status_date", targetDate)
        .single()

    // --- ROBUST AUTO-INITIALIZATION ---
    // If today is missing or opening_balances_set is false, check if yesterday is closed
    if (!todayBalance || !todayBalance.opening_balances_set) {
        const prevDate = getPreviousDate(targetDate)
        const { data: prevDay } = await supabase
            .from("daily_accounts_status")
            .select("*")
            .eq("status_date", prevDate)
            .eq("is_closed", true)
            .single()

        if (prevDay) {
            console.log(`Auto-initializing ${targetDate} from closed ${prevDate}`)
            const initialCash = prevDay.closing_cash ?? 0
            const initialBank = prevDay.closing_bank ?? 0

            // A. Upsert daily_accounts_status
            const { data: newStatus, error: autoErr } = await supabase
                .from("daily_accounts_status")
                .upsert({
                    status_date: targetDate,
                    opening_cash: initialCash,
                    closing_cash: initialCash,
                    opening_bank: initialBank,
                    closing_bank: initialBank,
                    is_closed: false,
                    opening_balances_set: true, // Mark as set to skip "Set Opening"
                    updated_at: new Date().toISOString()
                }, { onConflict: 'status_date' })
                .select()
                .single()

            if (!autoErr && newStatus) {
                todayBalance = newStatus

                // B. Also ensure daily_operations is initialized
                const { data: { user } } = await supabase.auth.getUser()
                await supabase
                    .from("daily_operations")
                    .upsert({
                        operation_date: targetDate,
                        status: 'open',
                        opening_cash: initialCash,
                        opening_cash_actual: initialCash,
                        opening_cash_variance: 0,
                        opening_bank: initialBank,
                        opened_by: user?.id,
                        opened_at: new Date().toISOString()
                    }, { onConflict: 'operation_date' })
            }
        }
    }
    // -----------------------------------

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

    // 5b. Fetch Pending Card Holdings
    const { data: cardHoldings } = await supabase
        .from("card_hold_records")
        .select(`
            *,
            bank_cards ( card_name, bank_accounts ( bank_name ) ),
            supplier_cards ( card_name, suppliers ( name ) )
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false })


    return {
        todayBalance: todayBalance || null,
        balanceHistory: balanceHistory || [],
        bankAccounts: bankAccounts || [],
        bankCards: bankCards || [],
        supplierCards: supplierCards || [],
        cardHoldings: cardHoldings || [],
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
                name: s.name,
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
    account_type: 'bank' | 'supplier';
}, date?: string) {
    const supabase = await createClient()

    // 1. Create the account with 0 balance first
    const { data: account, error } = await supabase
        .from("bank_accounts")
        .insert({
            ...data,
            current_balance: 0
        })
        .select()
        .single()

    if (error) throw error

    // 2. If there's an opening balance, record it as a transaction
    // This ensures it appears in the ledger and correctly updates the balance via the existing RPC
    if (data.opening_balance > 0) {
        try {
            await recordBalanceTransaction({
                transaction_type: 'add_bank',
                amount: data.opening_balance,
                bank_account_id: account.id,
                description: `Initial Deposit for ${data.account_name}`,
                isOpeningBalance: false, // Record as a mid-day movement
                date: date
            })
        } catch (txErr) {
            console.error("Failed to record initialization transaction:", txErr)
            // We still have the account, but the ledger entry is missing
            // We could attempt to manually update the balance here as a fallback
            await supabase.from("bank_accounts").update({
                current_balance: data.opening_balance
            }).eq("id", account.id)
        }
    }

    revalidatePath("/dashboard/balance")
    return { success: true, data: account }
}

export async function updateDailyOpeningBalances(
    cash: number,
    bankAccounts: { id: string, amount: number }[],
    date?: string
) {
    const supabase = await createClient()
    const targetDate = date || getTodayPKT()

    // --- DATE VALIDATION ---
    await validateTransactionDate(targetDate)
    // -----------------------

    // 1. Check if already set
    const { data: existingStatus } = await supabase
        .from("daily_accounts_status")
        .select("opening_balances_set")
        .eq("status_date", targetDate)
        .single()

    if (existingStatus?.opening_balances_set) {
        throw new Error("Opening balances have already been set for this day.")
    }

    // 1b. Check for unclosed prior days
    const { data: unclosedPrior } = await supabase
        .from("daily_accounts_status")
        .select("status_date")
        .lt("status_date", targetDate)
        .eq("is_closed", false)
        .limit(1)

    if (unclosedPrior && unclosedPrior.length > 0) {
        throw new Error(`Cannot open ${targetDate} because a previous day (${unclosedPrior[0].status_date}) is still open. Please close previous days first.`)
    }

    // 2. Record transactions for cash
    if (cash > 0) {
        await recordBalanceTransaction({
            transaction_type: 'add_cash',
            amount: cash,
            description: "Daily Opening Cash Balance",
            isOpeningBalance: true,
            date: targetDate
        })
    }

    // 3. Record transactions for each bank account
    let totalBank = 0
    for (const entry of bankAccounts) {
        if (entry.amount > 0) {
            totalBank += entry.amount
            await recordBalanceTransaction({
                transaction_type: 'add_bank',
                amount: entry.amount,
                bank_account_id: entry.id,
                description: "Daily Opening Bank Balance",
                isOpeningBalance: true,
                date: targetDate
            })
        }
    }

    // 4. Mark as set in daily status
    const { error } = await supabase
        .from("daily_accounts_status")
        .upsert({
            status_date: targetDate,
            opening_balances_set: true,
            updated_at: new Date().toISOString()
        }, { onConflict: 'status_date' })

    if (error) throw error

    revalidatePath("/dashboard/balance")
    return { success: true }
}

async function getGlobalNetBalance() {
    const supabase = await createClient()

    // 1. Get total supplier debt
    const { data: accounts } = await supabase
        .from("company_accounts")
        .select("current_balance")

    const totalDebt = accounts?.reduce((acc, b) => acc + Number(b.current_balance), 0) || 0

    // For this business logic, we'll consider the "Ledger Balance" to be the supplier debt total
    // because that's what the current movements page shows.
    // If we want it to show internal transfers too, we can either:
    // a) Use global balance (Cash + Bank - Debt)
    // b) Or keep it focused on debt but show transfers as "Non-debt" rows with N/A balance.
    // Given the user wants "remaining remains same" for transfers, they likely want Global Balance.

    const { data: bankAccs } = await supabase.from("bank_accounts").select("current_balance")
    const totalBank = bankAccs?.reduce((acc, b) => acc + Number(b.current_balance), 0) || 0

    const today = getTodayPKT()
    const { data: dayStatus } = await supabase.from("daily_accounts_status").select("closing_cash, opening_cash").eq("status_date", today).single()
    const currentCash = dayStatus?.closing_cash ?? dayStatus?.opening_cash ?? 0

    return (totalDebt + totalBank + currentCash)
}

/**
 * Finds the earliest unclosed date in the system.
 * This is considered the "Active Date" for data entry.
 */
export async function getSystemActiveDate(): Promise<string> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from("daily_accounts_status")
        .select("status_date")
        .eq("is_closed", false)
        .order("status_date", { ascending: true })
        .limit(1)
        .single()

    if (error || !data) {
        // Fallback to today PKT if no unclosed day found
        return getTodayPKT()
    }
    return data.status_date
}

/**
 * Validates that a given date is NOT in the future relative to the system's active open date.
 */
export async function validateTransactionDate(transactionDate: string) {
    const activeDate = await getSystemActiveDate()
    
    // Convert to Date objects for robust comparison
    const txDateObj = new Date(transactionDate)
    const activeDateObj = new Date(activeDate)

    if (txDateObj > activeDateObj) {
        throw new Error(`Transaction blocked. You are currently working on ${activeDate}. Data for future dates (like ${transactionDate}) cannot be entered until ${activeDate} is closed.`)
    }
}

export async function recordBalanceTransaction(data: {
    transaction_type: 'cash_to_bank' | 'bank_to_cash' | 'add_cash' | 'add_bank' | 'transfer_to_supplier' | 'supplier_to_bank' | 'bank_to_bank';
    amount: number;
    bank_account_id?: string;
    to_bank_account_id?: string;
    bank_card_id?: string;
    supplier_id?: string;
    supplier_card_id?: string;
    description: string;
    isOpeningBalance?: boolean;
    is_hold?: boolean;
    card_hold_id?: string;
    date?: string;
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const activeDate = await getSystemActiveDate()
    const targetDate = data.date || activeDate
    
    // Sanitize UUIDs to avoid Postgres syntax errors for empty strings
    const bankAccountId = data.bank_account_id || undefined
    const toBankAccountId = data.to_bank_account_id || undefined
    const bankCardId = data.bank_card_id || undefined
    const supplierId = data.supplier_id || undefined
    const supplierCardId = data.supplier_card_id || undefined

    // --- DATE VALIDATION ---
    await validateTransactionDate(targetDate)
    // -----------------------

    // 0. Check if opening balances are already set if this is an opening adjustment
    if (data.isOpeningBalance) {
        const { data: status } = await supabase
            .from("daily_accounts_status")
            .select("opening_balances_set")
            .eq("status_date", targetDate)
            .single()

        if (status?.opening_balances_set) {
            throw new Error("Opening balances for this day have already been set and cannot be adjusted as an opening balance.")
        }
    }

    // 1. Record the transaction
    const insertPayload: any = {
        transaction_type: data.transaction_type,
        amount: data.amount,
        description: data.description,
        transaction_date: targetDate,
        created_by: user.id,
        bank_account_id: data.bank_account_id || undefined,
        to_bank_account_id: data.to_bank_account_id || undefined,
        bank_card_id: data.bank_card_id || undefined,
        supplier_id: data.supplier_id || undefined,
        supplier_card_id: data.supplier_card_id || undefined,
        is_opening: data.isOpeningBalance || false,
        is_hold: data.is_hold || false,
        card_hold_id: data.card_hold_id || undefined
    }

    // --- TRACK RUNNING BALANCE ---
    // Fetch current global balance before this transaction
    const balanceBefore = await getGlobalNetBalance()
    insertPayload.balance_before = balanceBefore
    
    // Determine the net effect on global balance
    let netEffect = 0
    if (data.is_hold) {
        netEffect = 0 // Hold doesn't affect balance until released
    } else if (data.transaction_type === 'add_cash' || data.transaction_type === 'add_bank') {
        netEffect = data.amount
    } else if (data.transaction_type === 'cash_to_bank' || data.transaction_type === 'bank_to_cash' || data.transaction_type === 'bank_to_bank') {
        netEffect = 0 // Net zero for global balance
    } else if (data.transaction_type === 'transfer_to_supplier' || data.transaction_type === 'supplier_to_bank') {
        // These will be tracked via company_account_transactions too.
        // For the global physical balance, they might be outflows.
        // However, if we track (Cash + Bank + SupplierBalance), then:
        // Cash to Supplier: Cash decreases, Supplier Account increases (Wait, if credit=debt, it increases).
        // Actually, if we use (Total physical - Total Debt), then paying 1k decreases Physical by 1k and decreases Debt by 1k. Net zero!
        // So for the "Unified Balance", transfers to suppliers are net zero movements.
        netEffect = 0
    }

    insertPayload.balance_after = balanceBefore + netEffect
    // -----------------------------

    const { error: txErr } = await supabase
        .from("balance_transactions")
        .insert(insertPayload)

    if (txErr) throw txErr

    // 2. Resolve target bank account if card is used
    let effectiveBankId = bankAccountId
    if (bankCardId && !effectiveBankId) {
        const { data: card } = await supabase
            .from("bank_cards")
            .select("bank_account_id")
            .eq("id", bankCardId)
            .single()
        if (card) effectiveBankId = card.bank_account_id
    }

    // 2b. Resolve target supplier if supplier card is used
    let effectiveSupplierId = supplierId
    if (supplierCardId && !effectiveSupplierId) {
        const { data: card } = await supabase
            .from("supplier_cards")
            .select("supplier_id")
            .eq("id", supplierCardId)
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
    } else if (data.transaction_type === 'bank_to_bank') {
        // Internal bank transfer
        // Note: we update two different bank accounts below
        bankAdj = 0 // The net change to "Total Bank" as tracked in daily_accounts_status is zero
    }

    // 4. Update individual bank account balance if applicable
    if (effectiveBankId && (bankAdj !== 0 || data.transaction_type === 'bank_to_bank')) {
        const sourceAdj = data.transaction_type === 'bank_to_bank' ? -data.amount : bankAdj
        
        const { error: bankUpErr } = await supabase.rpc("adjust_bank_balance", {
            p_bank_id: effectiveBankId,
            p_amount: sourceAdj
        })
        if (bankUpErr) {
            const { data: bank } = await supabase
                .from("bank_accounts")
                .select("current_balance")
                .eq("id", effectiveBankId)
                .single()
            if (bank) {
                await supabase.from("bank_accounts").update({
                    current_balance: Number(bank.current_balance || 0) + sourceAdj,
                    updated_at: new Date().toISOString()
                }).eq("id", effectiveBankId)
            }
        }
    }

    // 4b. Update destination bank account for bank_to_bank
    if (data.transaction_type === 'bank_to_bank' && toBankAccountId) {
        const { error: bankToErr } = await supabase.rpc("adjust_bank_balance", {
            p_bank_id: toBankAccountId,
            p_amount: data.amount
        })
        if (bankToErr) {
            const { data: bank } = await supabase
                .from("bank_accounts")
                .select("current_balance")
                .eq("id", toBankAccountId)
                .single()
            if (bank) {
                await supabase.from("bank_accounts").update({
                    current_balance: Number(bank.current_balance || 0) + data.amount,
                    updated_at: new Date().toISOString()
                }).eq("id", toBankAccountId)
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
    // ONLY update the ledger if NOT a hold. Holds will be recorded when released.
    if (!data.is_hold && (data.transaction_type === 'transfer_to_supplier' || data.transaction_type === 'supplier_to_bank') && effectiveSupplierId) {
        const { data: compAcc } = await supabase
            .from("company_accounts")
            .select("id")
            .eq("supplier_id", effectiveSupplierId)
            .single()

        if (compAcc) {
            const txType = data.transaction_type === 'transfer_to_supplier' ? 'credit' : 'debit'
            await addLedgerTransaction({
                company_account_id: compAcc.id,
                transaction_type: txType,
                amount: data.amount,
                transaction_date: targetDate,
                bank_account_id: effectiveBankId, // Track which bank was used
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
    const todayPKT = getTodayPKT()

    console.log('Closing day for:', targetDate, { cashClosing, bankClosing })

    // 1. Manual close sets today's closing balances
    const { data: closedDay, error } = await supabase
        .from("daily_accounts_status")
        .update({
            closing_cash: cashClosing,
            closing_bank: bankClosing,
            is_closed: true,
            updated_at: new Date().toISOString()
        })
        .eq("status_date", targetDate)
        .select("closing_cash, closing_bank")
        .single()

    if (error) {
        console.error('Close day error:', error)
        throw error
    }

    const actualCashClosing = closedDay?.closing_cash ?? cashClosing
    const actualBankClosing = closedDay?.closing_bank ?? bankClosing

    console.log('Actual closing values:', { actualCashClosing, actualBankClosing })

    // 2. ALWAYS auto-open the next day when triggered by this manual close action
    const nextDate = getNextDate(targetDate)
    console.log('Auto-opening next day:', nextDate)

    // A. Upsert next day in daily_accounts_status
    const { error: nextBalErr } = await supabase
        .from("daily_accounts_status")
        .upsert({
            status_date: nextDate,
            opening_cash: actualCashClosing,
            closing_cash: actualCashClosing,
            opening_bank: actualBankClosing,
            closing_bank: actualBankClosing,
            is_closed: false,
            opening_balances_set: true, // Crucial: automatically set for carry-forward
            updated_at: new Date().toISOString()
        }, { onConflict: 'status_date' })

    if (nextBalErr) throw new Error(`Failed to create next day status: ${nextBalErr.message}`)

    // B. Upsert next day in daily_operations
    const { error: nextOpsErr } = await supabase
        .from("daily_operations")
        .upsert({
            operation_date: nextDate,
            status: 'open',
            opening_cash: actualCashClosing,
            opening_cash_actual: actualCashClosing,
            opening_cash_variance: 0,
            opening_bank: actualBankClosing,
            opened_by: user?.id,
            opened_at: new Date().toISOString()
        }, { onConflict: 'operation_date' })

    if (nextOpsErr) throw new Error(`Failed to create next day operations: ${nextOpsErr.message}`)

    revalidatePath("/dashboard/balance")
    revalidatePath("/dashboard")
    return { success: true, nextDate }
}

/**
 * Fixes a day's opening balances by copying the previous day's closing balances.
 * Use this to repair incorrect (e.g., 0.00) opening balances.
 */
export async function syncOpeningFromPreviousClosing(date: string) {
    const supabase = await createClient()

    // 1. Find the most recent closed day BEFORE the target date
    const { data: prevDay, error: prevErr } = await supabase
        .from("daily_accounts_status")
        .select("status_date, closing_cash, closing_bank")
        .eq("is_closed", true)
        .lt("status_date", date)
        .order("status_date", { ascending: false })
        .limit(1)
        .single()

    if (prevErr || !prevDay) {
        throw new Error("No previous closed day found to sync from.")
    }

    const prevCashClose = prevDay.closing_cash ?? 0
    const prevBankClose = prevDay.closing_bank ?? 0

    console.log(`Syncing ${date} opening from ${prevDay.status_date} closing:`, { prevCashClose, prevBankClose })

    // 2. Update ONLY the target day's OPENING balances (never touch closing_cash/closing_bank
    // as those accumulate from real transactions during the day)
    const { error: updateErr } = await supabase
        .from("daily_accounts_status")
        .update({
            opening_cash: prevCashClose,
            opening_bank: prevBankClose,
            updated_at: new Date().toISOString()
        })
        .eq("status_date", date)

    if (updateErr) throw new Error(`Failed to sync opening balances: ${updateErr.message}`)

    // 3. Also update daily_operations if a record exists
    await supabase
        .from("daily_operations")
        .update({
            opening_cash: prevCashClose,
            opening_cash_actual: prevCashClose,
            opening_bank: prevBankClose,
        })
        .eq("operation_date", date)

    revalidatePath("/dashboard/balance")
    return { success: true, opening_cash: prevCashClose, opening_bank: prevBankClose }
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
    account_type?: 'bank' | 'supplier';
}, date?: string) {
    const supabase = await createClient()

    const updatePayload: any = { ...data }
    if (data.opening_balance !== undefined) {
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

/**
 * Release a card hold record into a bank account or supplier account
 */
export async function releaseCardHold(holdId: string, targetId: string, releaseDate?: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    // 1. Get hold record
    const { data: hold, error: fetchErr } = await supabase
        .from('card_hold_records')
        .select('*')
        .eq('id', holdId)
        .single()

    if (fetchErr || !hold) throw new Error("Hold record not found")
    if (hold.status !== 'pending') throw new Error("Record already processed")

    const isBankTarget = targetId.startsWith('acc_')
    const actualTargetId = targetId.replace(/^(acc_|supp_)/, '')

    const activeDate = await getSystemActiveDate()
    const effectiveReleaseDate = releaseDate ? new Date(releaseDate).toISOString() : new Date(activeDate).toISOString()
    const effectiveTransactionDate = releaseDate || activeDate

    // 2. Update hold record status
    const { error: updateErr } = await supabase
        .from('card_hold_records')
        .update({
            status: 'released',
            released_at: effectiveReleaseDate,
            bank_account_id: isBankTarget ? actualTargetId : null,
            supplier_id: !isBankTarget ? actualTargetId : null
        })
        .eq('id', holdId)

    if (updateErr) throw new Error(updateErr.message)

    // 3. Create a NEW balance_transactions record for the settlement
    // This allows the original 'Hold' to remain in the Daily Summary while
    // the new 'Settlement' row shows up as its own entry in the ledger.
    const settlementDescription = `Card Settlement: ${hold.card_type} (Hold ID: ${hold.id})${!isBankTarget ? ' - Supplier Account' : ''}`;
    
    await recordBalanceTransaction({
        transaction_type: isBankTarget ? 'add_bank' : 'transfer_to_supplier',
        amount: Number(hold.net_amount),
        bank_account_id: isBankTarget ? actualTargetId : undefined,
        supplier_id: !isBankTarget ? actualTargetId : undefined,
        description: settlementDescription,
        date: effectiveTransactionDate,
        is_hold: false,
        card_hold_id: hold.id // Link it to the hold for audit trail
    })

    revalidatePath('/dashboard/balance')
    revalidatePath('/dashboard/sales/history')
    revalidatePath('/dashboard/suppliers')
    return { success: true }
}
