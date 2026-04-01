"use server"

import { createClient } from "@/lib/supabase/server"
import { getTodayPKT, getTomorrowPKT } from "@/lib/utils"

export async function getBalanceMovement(filters?: {
    date_from?: string;
    date_to?: string;
    transaction_type?: string;
    supplier_id?: string;
    account_type?: string;
    search?: string;
    page?: number;
    category?: 'sale' | 'purchase' | 'all';
}) {
    const supabase = await createClient()
    const pageSize = 50
    const page = filters?.page || 1
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const category = (filters?.category || 'all').toLowerCase()

    let companyTx: any[] = []
    let balanceTx: any[] = []
    let salesTx: any[] = []
    let manualSalesTx: any[] = []
    let expensesTx: any[] = []

    // 1. Fetch Company Account Transactions (Purchase Category only)
    if (category === 'purchase' || category === 'all') {
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
                ),
                bank_accounts ( account_name )
            `)
        if (filters?.date_from) companyQuery = companyQuery.gte("transaction_date", filters.date_from)
        if (filters?.date_to) companyQuery = companyQuery.lte("transaction_date", filters.date_to)
        if (filters?.transaction_type && filters.transaction_type !== 'all') companyQuery = companyQuery.eq("transaction_type", filters.transaction_type)
        if (filters?.supplier_id && filters.supplier_id !== 'all') companyQuery = companyQuery.eq("company_accounts.supplier_id", filters.supplier_id)
        if (filters?.search) companyQuery = companyQuery.ilike("reference_number", `%${filters.search}%`)

        const { data, error } = await companyQuery
        if (error) throw error
        companyTx = data || []
        
        // 1b. For Settlements that might not have card_hold_id set explicitly on companyTx, extract it from note
        companyTx = companyTx.map(tx => {
            if (!tx.card_hold_id && tx.note?.includes("Hold ID: ")) {
                const match = tx.note.match(/Hold ID: ([a-f0-9\-]+)/);
                if (match && match[1]) {
                    tx.card_hold_id = match[1];
                }
            }
            return tx;
        });

        // Manual join for card_hold_records to avoid relationship errors
        const holdIds = companyTx.filter(tx => tx.card_hold_id).map(tx => tx.card_hold_id);
        if (holdIds.length > 0) {
            const { data: holds } = await supabase
                .from("card_hold_records")
                .select("id, status, released_at, sale_date")
                .in("id", holdIds);
            
            if (holds) {
                const holdMap = Object.fromEntries(holds.map(h => [h.id, h]));
                companyTx = companyTx.map(tx => ({
                    ...tx,
                    card_hold_records: tx.card_hold_id ? holdMap[tx.card_hold_id] : null
                }));
            }
        }

        // Also fetch balance_transactions that affect suppliers (like card settlements)
        let bSuppQuery = supabase.from("balance_transactions").select(`
            *,
            bank_accounts:bank_account_id ( account_name ),
            suppliers:supplier_id ( name ),
            card_hold_records ( status, released_at, sale_date )
        `).not("supplier_id", "is", null)

        if (filters?.date_from) bSuppQuery = bSuppQuery.gte("transaction_date", filters.date_from)
        if (filters?.date_to) bSuppQuery = bSuppQuery.lte("transaction_date", filters.date_to)
        if (filters?.supplier_id && filters.supplier_id !== 'all') bSuppQuery = bSuppQuery.eq("supplier_id", filters.supplier_id)
        
        const { data: bSuppData } = await bSuppQuery
        if (bSuppData) {
            // Filter out those already in balanceTx to avoid duplicates if category === 'all'
            const existingIds = new Set(balanceTx.map(t => t.id))
            balanceTx = [...balanceTx, ...bSuppData.filter(t => !existingIds.has(t.id))]
        }
    }

    // 2. Fetch Internal Balance Transactions (Sale Category)
    if (category === 'sale' || category === 'all') {
        let balanceQuery = supabase
            .from("balance_transactions")
            .select(`
                *,
                bank_accounts:bank_account_id ( account_name ),
                to_bank_accounts:to_bank_account_id ( account_name ),
                suppliers:supplier_id ( name ),
                card_hold_records ( status, released_at, sale_date )
            `)
        
        if (category === 'sale') {
            balanceQuery = balanceQuery.or(`is_hold.eq.true,card_hold_id.not.is.null,transaction_type.neq.transfer_to_supplier,transaction_type.neq.supplier_to_bank`)
        } else {
            // For 'all', we want everything
        }

        if (filters?.date_from) balanceQuery = balanceQuery.gte("transaction_date", filters.date_from)
        if (filters?.date_to) balanceQuery = balanceQuery.lte("transaction_date", filters.date_to)
        
        if (filters?.transaction_type && filters.transaction_type !== 'all') {
            if (filters.transaction_type === 'credit') {
                balanceQuery = balanceQuery.in("transaction_type", ["add_cash", "add_bank", "cash_to_bank"])
            } else if (filters.transaction_type === 'debit') {
                balanceQuery = balanceQuery.eq("transaction_type", "bank_to_cash")
            }
        }

        const { data, error } = await balanceQuery
        if (error) throw error
        
        // Merge with existing balanceTx (from purchase block) if any
        const existingIds = new Set(balanceTx.map(t => t.id))
        balanceTx = [...balanceTx, ...(data || []).filter(t => !existingIds.has(t.id))]
    }

    // 3. Fetch Fuel Sales (Sale Category)
    if (category === 'sale' || category === 'all') {
        // Only include credit type filter for sales
        if (!filters?.transaction_type || filters.transaction_type === 'all' || filters.transaction_type === 'credit') {
            let salesQuery = supabase
                .from("daily_sales")
                .select(`*, nozzles ( nozzle_number, product_id, products ( name ) )`)
            if (filters?.date_from) salesQuery = salesQuery.gte("sale_date", filters.date_from)
            if (filters?.date_to) salesQuery = salesQuery.lte("sale_date", filters.date_to)
            const { data } = await salesQuery
            salesTx = data || []
        }
    }

    // 4. Fetch Manual (Lubricant/Product) Sales (Sale Category)
    if (category === 'sale' || category === 'all') {
        if (!filters?.transaction_type || filters.transaction_type === 'all' || filters.transaction_type === 'credit') {
            let manualQuery = supabase
                .from("manual_sales")
                .select(`*, products ( name )`)
            if (filters?.date_from) manualQuery = manualQuery.gte("sale_date", filters.date_from)
            if (filters?.date_to) manualQuery = manualQuery.lte("sale_date", filters.date_to)
            if (filters?.search) manualQuery = manualQuery.ilike("notes", `%${filters.search}%`)
            const { data } = await manualQuery
            manualSalesTx = data || []
        }
    }

    // 5. Fetch Daily Expenses (Sale Category — expenses are outflows from cash/bank)
    if (category === 'sale' || category === 'all') {
        if (!filters?.transaction_type || filters.transaction_type === 'all' || filters.transaction_type === 'debit') {
            let expQuery = supabase
                .from("daily_expenses")
                .select(`*, expense_categories ( category_name )`)
            if (filters?.date_from) expQuery = expQuery.gte("expense_date", filters.date_from)
            if (filters?.date_to) expQuery = expQuery.lte("expense_date", filters.date_to)
            if (filters?.search) expQuery = expQuery.ilike("description", `%${filters.search}%`)
            const { data } = await expQuery
            expensesTx = data || []
        }
    }
    // 6. Unify and Transform
    let unified: any[] = []

    // 6a. Group Sales into Summaries (Always done to ensure Action buttons work)
    const dailySummary: Record<string, any> = {}
    const settlementMap: Record<string, any> = {}
    const settlements = balanceTx.filter(tx => tx.card_hold_id && !tx.is_hold)
    settlements.forEach(s => {
        if (s.card_hold_id) settlementMap[s.card_hold_id] = { id: s.id, ref: s.reference_number || 'SETTLEMENT' }
    })

    // Fuel Sales
    salesTx.forEach(tx => {
        const date = tx.sale_date?.split('T')[0]?.trim(); // Normalize date key
        if (!date) return;
        if (!dailySummary[date]) {
            dailySummary[date] = {
                id: `summary-sale-${date}`,
                transaction_date: date,
                created_at: `${date}T18:30:00Z`, // 18:30 UTC = 11:30 PM PKT (UTC+5)
                source_table: 'daily_sales_summary',
                entity_name: 'Daily Sales Summary',
                transaction_type: 'credit',
                transaction_source: 'sales_summary',
                display_type: 'credit',
                amount: 0,
                reference_number: 'DAILY-SUMMARY',
                items: { fuel: [], manual: [], holds: [] },
                note: 'Consolidated Daily Sales Inflow'
            }
        }
        dailySummary[date].amount += Number(tx.revenue ?? tx.total_amount)
        dailySummary[date].items.fuel.push({
            ...tx,
            product_name: tx.nozzles?.products?.name || 'Fuel',
            nozzle_name: tx.nozzles?.nozzle_number || 'N/A'
        })
    })

    // Manual Sales
    manualSalesTx.forEach(tx => {
        const date = tx.sale_date?.split('T')[0]?.trim(); // Normalize date key
        if (!date) return;
        if (!dailySummary[date]) {
            dailySummary[date] = {
                id: `summary-sale-${date}`,
                transaction_date: date,
                created_at: `${date}T23:59:59Z`,
                source_table: 'daily_sales_summary',
                entity_name: 'Daily Sales Summary',
                transaction_type: 'credit',
                transaction_source: 'sales_summary',
                display_type: 'credit',
                amount: 0,
                reference_number: 'DAILY-SUMMARY',
                items: { fuel: [], manual: [], holds: [] },
                note: 'Consolidated Daily Sales Inflow'
            }
        }
        dailySummary[date].amount += Number(tx.total_amount)
        dailySummary[date].items.manual.push({
            ...tx,
            product_name: tx.products?.name || 'Product'
        })
    })

    // Card Holds
    const holds = balanceTx.filter(tx => tx.is_hold)
    holds.forEach(tx => {
        const date = (tx.transaction_date || tx.created_at?.split('T')[0])?.trim(); // Normalize date key
        if (!date) return;
        if (!dailySummary[date]) {
            dailySummary[date] = {
                id: `summary-sale-${date}`,
                transaction_date: date,
                created_at: `${date}T23:59:59Z`,
                source_table: 'daily_sales_summary',
                entity_name: 'Daily Sales Summary',
                transaction_type: 'credit',
                transaction_source: 'sales_summary',
                display_type: 'credit',
                amount: 0,
                reference_number: 'DAILY-SUMMARY',
                items: { fuel: [], manual: [], holds: [] },
                note: 'Consolidated Daily Sales Inflow'
            }
        }
        dailySummary[date].amount -= Number(tx.amount)
        const settlementInfo = tx.card_hold_id ? settlementMap[tx.card_hold_id] : null
        dailySummary[date].items.holds.push({
            ...tx,
            settlement_info: settlementInfo
        })
    })

    // Determine what to include in final unified list
    const nonGroupedCommon = [
        ...companyTx.map(tx => {
            const supplierName = tx.company_accounts?.suppliers?.name || 'Supplier';
            const bankName = tx.bank_accounts?.account_name;
            const entityName = bankName ? `${bankName} ➜ ${supplierName}` : supplierName;
            return {
                ...tx,
                source_table: 'company_account_transactions',
                entity_name: entityName,
                display_type: tx.transaction_type
            };
        }),
        ...balanceTx.filter(tx => {
            // General filter out grouped records (holds are grouped)
            if (tx.is_hold) return false;
            
            // In SALE tab, only show if it's NOT a hold (already handled)
            if (category === 'sale') return true;
            
            // In PURCHASE tab, only show if it affects a supplier 
            if (category === 'purchase') {
                // Deduplicate CardHold vs Settlement:
                // 1. If it's explicitly a "Card Hold" (gross value), we hide it in the Purchase ledger
                // because the user only wants to see the final Settlement (net value after tax).
                const note = tx.note?.toLowerCase() || "";
                if (note.includes("card hold") && !note.includes("settlement")) return false;

                // 2. Card settlements that hit a supplier ledger already exist as 'company_account_transactions'.
                // If it has both supplier_id and card_hold_id, it is almost certainly a duplicate of a companyTx record.
                if (tx.supplier_id && tx.card_hold_id) return false; 
                
                return !!tx.supplier_id;
            }
            
            return true;
        }).map(tx => {
            let entityName = tx.bank_accounts?.account_name || tx.suppliers?.name || 'System / Cash';
            if (tx.transaction_type === 'bank_to_bank' && tx.to_bank_accounts?.account_name) {
                entityName = `${tx.bank_accounts?.account_name || 'N/A'} ➜ ${tx.to_bank_accounts.account_name}`;
            } else if (tx.transaction_type === 'cash_to_bank' && tx.to_bank_accounts?.account_name) {
                entityName = `Cash ➜ ${tx.to_bank_accounts.account_name}`;
            } else if (tx.transaction_type === 'bank_to_cash' && tx.bank_accounts?.account_name) {
                entityName = `${tx.bank_accounts.account_name} ➜ Cash`;
            } else if (tx.transaction_type === 'transfer_to_supplier' && tx.suppliers?.name) {
                entityName = tx.suppliers.name;
            }
            return {
                ...tx,
                source_table: 'balance_transactions',
                entity_name: entityName,
                display_type: tx.transaction_type
            };
        }),
        ...expensesTx.map(tx => ({
            ...tx,
            source_table: 'daily_expenses',
            amount: tx.amount,
            transaction_date: tx.expense_date,
            entity_name: tx.paid_to || tx.expense_categories?.category_name || 'Expense',
            transaction_type: 'debit',
            balance_before: null,
            balance_after: null,
            reference_number: tx.invoice_number || null,
            transaction_source: 'expense',
            display_type: 'debit',
            note: tx.description || tx.expense_categories?.category_name || 'Daily Expense'
        }))
    ]

    if (category === 'sale') {
        unified = [
            ...nonGroupedCommon,
            ...Object.values(dailySummary)
        ]
    } else if (category === 'purchase') {
        // Ensure NO daily sales summary is included in purchase tab
        unified = nonGroupedCommon.filter(tx => tx.source_table !== 'daily_sales_summary');
    } else {
        // all or other
        unified = [
            ...nonGroupedCommon,
            ...Object.values(dailySummary)
        ]
    }



    // 7. Sort in JS (descending chronological order)
    unified.sort((a, b) => {
        const dateA = new Date(a.transaction_date + 'T' + (a.created_at?.split('T')[1]?.split('+')[0] || '00:00:00')).getTime()
        const dateB = new Date(b.transaction_date + 'T' + (b.created_at?.split('T')[1]?.split('+')[0] || '00:00:00')).getTime()
        return dateB - dateA
    })

    // 8. Compute Running Balances for Sale Tab (Cash vs Bank)
    if (category === 'sale') {
        const { data: bankAccs } = await supabase.from("bank_accounts").select("current_balance")
        const totalBank = bankAccs?.reduce((acc, b) => acc + Number(b.current_balance), 0) || 0
        
        // Get the most recent active or closed day's cash balance
        const { data: dayStatus } = await supabase
            .from("daily_accounts_status")
            .select("closing_cash, opening_cash")
            .order("status_date", { ascending: false })
            .limit(1)
            .single()
            
        const currentCash = dayStatus?.closing_cash ?? dayStatus?.opening_cash ?? 0
        
        let runningCash = currentCash
        let runningBank = totalBank

        for (let i = 0; i < unified.length; i++) {
            const tx = unified[i];
            
            tx.cash_after = runningCash;
            tx.bank_after = runningBank;

            const isInternal = tx.source_table === 'balance_transactions';
            const isSummary = tx.source_table === 'daily_sales_summary';
            let cashImpact = 0;
            let bankImpact = 0;
            let amount = Number(tx.amount || 0);

            if (isSummary) {
                // The amount is already net (Total sales - Card holds)
                // Sales inflow goes to cash
                cashImpact = amount;
                
                // Card holds (if we tracked them separately in this record)
                // Actually, the card holds were subtracted.
                // If card holds are part of this row, the amount only reflects the cash portion.
                // But the Bank balance should technically increase by the hold amount if we want it accurate?
                // Wait, if I subtract card holds from the summary row, those holds aren't being added to the bank balance here.
                // Let's rethink. If I want the running bank balance to be correct, I should add the holds to bank impact within the summary row.
                const holdAmountTotal = tx.items.holds.reduce((acc: number, h: any) => acc + Number(h.amount), 0);
                bankImpact = holdAmountTotal;
            } else if (isInternal) {
                const type = tx.transaction_type;
                if (type === 'add_cash') cashImpact = amount;
                else if (type === 'add_bank') bankImpact = amount;
                else if (type === 'cash_to_bank') { cashImpact = -amount; bankImpact = amount; }
                else if (type === 'bank_to_cash') { bankImpact = -amount; cashImpact = amount; }
                else if (type === 'transfer_to_supplier') {
                    // Shell Card / Supplier Card Settlements don't affect physical cash/bank in Sale Tab
                    // as they represent a ledger movement to a supplier's account.
                    if (tx.card_hold_id) {
                        cashImpact = 0;
                        bankImpact = 0;
                    } else if (tx.bank_account_id) {
                        bankImpact = -amount;
                    } else {
                        cashImpact = -amount;
                    }
                } else if (type === 'supplier_to_bank') {
                    bankImpact = amount;
                } else if (tx.card_hold_id) {
                    // Settlement of a card hold into a bank or supplier account
                    if (!tx.is_hold) {
                        if (tx.bank_account_id) bankImpact = amount;
                        else if (tx.supplier_id) {
                            // Supplier settlement doesn't affect physical cash/bank in Sale Tab
                            cashImpact = 0;
                            bankImpact = 0;
                        } else {
                            cashImpact = amount;
                        }
                    } else {
                        // Pending holds don't affect physical balance yet
                        cashImpact = 0;
                        bankImpact = 0;
                    }
                }
            } else if (tx.source_table === 'daily_sales' || tx.source_table === 'manual_sales') {
                cashImpact = amount; 
            } else if (tx.source_table === 'daily_expenses') {
                if (tx.bank_account_id) bankImpact = -amount;
                else cashImpact = -amount;
            }

            const isSupplierSettlement = isInternal && tx.card_hold_id && tx.supplier_id;

            if (isSupplierSettlement) {
                tx.account_type = "Supplier Account";
            } else if (cashImpact !== 0 && bankImpact !== 0) {
                tx.account_type = isSummary ? "Mixed (Sales/Holds)" : "Cash & Bank";
            } else if (cashImpact !== 0) {
                tx.account_type = "Cash";
            } else if (bankImpact !== 0) {
                tx.account_type = "Bank";
            } else {
                tx.account_type = "—";
            }


            const cashBefore = (isInternal && tx.is_opening) ? 0 : runningCash - cashImpact;
            const bankBefore = (isInternal && tx.is_opening) ? 0 : runningBank - bankImpact;
            
            tx.cash_before = cashBefore;
            tx.bank_before = bankBefore;
            
            runningCash = cashBefore;
            runningBank = bankBefore;
        }

        
        // 8a. Post-process filtering for Sale Tab
        if (filters?.account_type && filters.account_type !== 'all') {
            unified = unified.filter(tx => {
                const target = filters.account_type?.toLowerCase();
                const actual = (tx.account_type || "").toLowerCase();
                if (target === 'cash') return actual === 'cash' || actual === 'cash & bank';
                if (target === 'bank') return actual === 'bank' || actual === 'cash & bank';
                return true;
            });
        }
    } else if (category === 'purchase') {
        const { data: balances } = await supabase.from("company_accounts").select("current_balance, supplier_id")
        let relevantBalances = balances || []
        if (filters?.supplier_id && filters.supplier_id !== 'all') {
            relevantBalances = relevantBalances.filter(b => b.supplier_id === filters.supplier_id)
        }
        const currentSupplierBalance = relevantBalances.reduce((acc, b) => acc + Number(b.current_balance), 0)
        
        let runningSupplier = currentSupplierBalance;
        
        for (let i = 0; i < unified.length; i++) {
            const tx = unified[i];
            tx.account_type = "Supplier Balance";
            
            if (tx.source_table === 'company_account_transactions') {
                tx.balance_after = runningSupplier;
                let amount = Number(tx.amount || 0);
                let isCredit = tx.transaction_type === 'credit';
                
                const balanceBefore = isCredit ? runningSupplier - amount : runningSupplier + amount;
                tx.balance_before = balanceBefore;
                
                runningSupplier = balanceBefore;
            } else {
                // If by any chance there are 'balance_transactions' in purchase tab (e.g., transfers)
                tx.balance_after = runningSupplier;
                
                let amount = Number(tx.amount || 0);
                let isCredit = tx.display_type === 'credit'; // fallback
                if (tx.transaction_type === 'transfer_to_supplier' || tx.transaction_type === 'supplier_to_bank') {
                    // if it's going to supplier, it's a credit to supplier balance
                    isCredit = tx.transaction_type === 'transfer_to_supplier';
                }
                
                const balanceBefore = isCredit ? runningSupplier - amount : runningSupplier + amount;
                tx.balance_before = balanceBefore;
                
                runningSupplier = balanceBefore;
            }
        }
    }

    // 9. Paginate
    const paginated = unified.slice(from, to + 1)

    return {
        data: paginated,
        total: unified.length,
        page,
        totalPages: Math.ceil(unified.length / pageSize),
        extended_data: {
            summaries: dailySummary
        }
    }
}


export async function getBalanceMovementSummary(filters?: {
    date_from?: string;
    date_to?: string;
    supplier_id?: string;
    category?: 'sale' | 'purchase' | 'all';
}) {
    const supabase = await createClient()
    const category = filters?.category || 'all'

    let totalCredits = 0
    let totalDebits = 0
    let currentBalance = 0
    let totalBankValue = 0
    let currentCashValue = 0
    let totalHolds = 0

    // 1. Purchase Category Summary (Supplier Side)
    if (category === 'purchase' || category === 'all') {
        let query = supabase
            .from("company_account_transactions")
            .select("transaction_type, amount, is_hold, company_accounts!inner(supplier_id)")

        if (filters?.date_from) query = query.gte("transaction_date", filters.date_from)
        if (filters?.date_to) query = query.lte("transaction_date", filters.date_to)
        if (filters?.supplier_id && filters.supplier_id !== 'all') query = query.eq("company_accounts.supplier_id", filters.supplier_id)

        const { data: txs, error } = await query
        if (!error && txs) {
            const credits = txs.filter(t => t.transaction_type === 'credit' && !t.is_hold).reduce((acc, t) => acc + Number(t.amount), 0)
            const debits = txs.filter(t => t.transaction_type === 'debit' && !t.is_hold).reduce((acc, t) => acc + Number(t.amount), 0)
            const holds = txs.filter(t => t.is_hold).reduce((acc, t) => acc + Number(t.amount), 0)

            totalCredits += credits
            totalDebits += debits
            
            // Also include balance_transactions that affect suppliers
            let bQuery = supabase.from("balance_transactions").select("amount, transaction_type, is_hold, note, card_hold_id").not("supplier_id", "is", null)
            if (filters?.date_from) bQuery = bQuery.gte("transaction_date", filters.date_from)
            if (filters?.date_to) bQuery = bQuery.lte("transaction_date", filters.date_to)
            if (filters?.supplier_id && filters.supplier_id !== 'all') bQuery = bQuery.eq("supplier_id", filters.supplier_id)
            
            const { data: bTxs } = await bQuery
            if (bTxs) {
                // Deduplicate: Exclude "Card Hold:" (gross) from credits if we want net settlement
                const bCredits = bTxs.filter(t => 
                    !t.is_hold && 
                    !t.note?.startsWith("Card Hold:") && 
                    (["add_cash", "add_bank", "cash_to_bank", "transfer_to_supplier", "credit"].includes(t.transaction_type))
                ).reduce((acc, t) => acc + Number(t.amount), 0)
                
                const bDebits = bTxs.filter(t => 
                    !t.is_hold && 
                    (["debit"].includes(t.transaction_type))
                ).reduce((acc, t) => acc + Number(t.amount), 0)
                
                totalCredits += bCredits
                totalDebits += bDebits
            }

            let holdsQuery = supabase.from("po_hold_records").select("hold_amount").eq("status", "on_hold")
            const { data: activeHolds } = await holdsQuery
            const poHolds = activeHolds?.reduce((acc, h) => acc + Number(h.hold_amount), 0) || 0
            
            totalHolds += holds + poHolds
        }

        let balanceQuery = supabase.from("company_accounts").select("current_balance")
        if (filters?.supplier_id && filters.supplier_id !== 'all') balanceQuery = balanceQuery.eq("supplier_id", filters.supplier_id)

        const { data: balances } = await balanceQuery
        const supplierBalance = balances?.reduce((acc, b) => acc + Number(b.current_balance), 0) || 0
        
        if (category === 'purchase') {
            currentBalance = supplierBalance
        } else {
            currentBalance += supplierBalance
        }
    }

    // 2. Sale Category Summary (Cash/Bank + Sales + Expenses)
    if (category === 'sale' || category === 'all') {
        // 2a. Internal balance_transactions inflows/outflows
        let internalInflow = 0
        let internalOutflow = 0
        let bQuery = supabase.from("balance_transactions").select("amount, transaction_type, is_hold, card_hold_id, card_hold_records(status)")
        if (filters?.date_from) bQuery = bQuery.gte("transaction_date", filters.date_from)
        if (filters?.date_to) bQuery = bQuery.lte("transaction_date", filters.date_to)
        
        const { data: bTxs } = await bQuery
        if (bTxs) {
            internalInflow = bTxs.filter(t => ["add_cash", "add_bank", "supplier_to_bank"].includes(t.transaction_type) && !t.is_hold).reduce((acc, t) => acc + Number(t.amount), 0)
            internalOutflow = bTxs.filter(t => t.transaction_type === "transfer_to_supplier" && !t.card_hold_id && !t.is_hold).reduce((acc, t) => acc + Number(t.amount), 0)
            
            const salesCardHolds = bTxs.filter(t => {
                if (!t.is_hold) return false;
                const chr: any = t.card_hold_records;
                const status = Array.isArray(chr) ? chr[0]?.status : chr?.status;
                return status === 'on_hold';
            }).reduce((acc, h) => acc + Number(h.amount), 0) || 0;
            
            if (category === 'sale') {
                totalHolds = salesCardHolds
            } else {
                totalHolds += salesCardHolds
            }
        }

        // 2b. Fuel Sales Revenue
        let salesQuery = supabase.from("daily_sales").select("total_amount")
        if (filters?.date_from) salesQuery = salesQuery.gte("sale_date", filters.date_from)
        if (filters?.date_to) salesQuery = salesQuery.lte("sale_date", filters.date_to)
        const { data: salesData } = await salesQuery
        const fuelRevenue = salesData?.reduce((acc, s) => acc + Number(s.total_amount || 0), 0) || 0

        // 2c. Manual Sales Revenue
        let manualQuery = supabase.from("manual_sales").select("total_amount")
        if (filters?.date_from) manualQuery = manualQuery.gte("sale_date", filters.date_from)
        if (filters?.date_to) manualQuery = manualQuery.lte("sale_date", filters.date_to)
        const { data: manualData } = await manualQuery
        const manualRevenue = manualData?.reduce((acc, s) => acc + Number(s.total_amount || 0), 0) || 0

        // 2d. Expenses (outflow)
        let expQuery = supabase.from("daily_expenses").select("amount")
        if (filters?.date_from) expQuery = expQuery.gte("expense_date", filters.date_from)
        if (filters?.date_to) expQuery = expQuery.lte("expense_date", filters.date_to)
        const { data: expData } = await expQuery
        const totalExpenses = expData?.reduce((acc, e) => acc + Number(e.amount || 0), 0) || 0

        totalCredits += internalInflow + fuelRevenue + manualRevenue
        totalDebits += internalOutflow + totalExpenses

        // Physical Balance (Cash + Bank)
        const { data: bankAccs } = await supabase.from("bank_accounts").select("current_balance")
        const totalBank = bankAccs?.reduce((acc, b) => acc + Number(b.current_balance), 0) || 0

        // Get the most recent active or closed day's cash balance
        const { data: dayStatus } = await supabase
            .from("daily_accounts_status")
            .select("closing_cash, opening_cash")
            .order("status_date", { ascending: false })
            .limit(1)
            .single()
            
        const currentCash = dayStatus?.closing_cash ?? dayStatus?.opening_cash ?? 0

        totalBankValue = totalBank
        currentCashValue = currentCash
        const physicalBalance = totalBank + currentCash
        
        if (category === 'sale') {
            currentBalance = physicalBalance
        } else {
            currentBalance += physicalBalance
        }
    }

    return {
        totalCredits,
        totalDebits,
        netMovement: totalCredits - totalDebits,
        currentBalance,
        totalBank: totalBankValue,
        currentCash: currentCashValue,
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

export async function getSaleSummaryByDate(date: string) {
    const supabase = await createClient()

    const { data: fuelSales } = await supabase
        .from("daily_sales")
        .select(`*, nozzles ( nozzle_number, product_id, products ( name ) )`)
        .eq("sale_date", date)

    const { data: manualSales } = await supabase
        .from("manual_sales")
        .select(`*, products ( name )`)
        .eq("sale_date", date)

    const { data: holdsData } = await supabase
        .from("balance_transactions")
        .select(`*, bank_accounts:bank_account_id ( account_name ), card_hold_records ( status, released_at, sale_date )`)
        .eq("is_hold", true)

    // Settlements map
    const { data: settlements } = await supabase
        .from("balance_transactions")
        .select("id, reference_number, card_hold_id")
        .not("card_hold_id", "is", null)
        .eq("is_hold", false)
        .not("reference_number", "is", null)
        
    const settlementMap: Record<string, any> = {}
    if (settlements) {
        settlements.forEach(s => {
            if (s.card_hold_id) settlementMap[s.card_hold_id] = { id: s.id, ref: s.reference_number || 'SETTLEMENT' }
        })
    }

    const summary = {
        id: `summary-sale-${date}`,
        transaction_date: date,
        created_at: `${date}T23:59:59Z`,
        source_table: 'daily_sales_summary',
        entity_name: 'Daily Sales Summary',
        transaction_type: 'credit',
        transaction_source: 'sales_summary',
        display_type: 'credit',
        amount: 0,
        reference_number: 'DAILY-SUMMARY',
        items: { fuel: [] as any[], manual: [] as any[], holds: [] as any[] },
        note: 'Consolidated Daily Sales Inflow'
    }

    if (fuelSales) {
        fuelSales.forEach(tx => {
            summary.amount += Number(tx.revenue ?? tx.total_amount)
            summary.items.fuel.push({
                ...tx,
                product_name: tx.nozzles?.products?.name || 'Fuel',
                nozzle_name: tx.nozzles?.nozzle_number || 'N/A'
            })
        })
    }

    if (manualSales) {
        manualSales.forEach(tx => {
            summary.amount += Number(tx.total_amount)
            summary.items.manual.push({
                ...tx,
                product_name: tx.products?.name || 'Product'
            })
        })
    }

    const filteredHolds = (holdsData || []).filter(h => h.card_hold_records?.sale_date === date || h.transaction_date === date || h.created_at?.startsWith(date))

    filteredHolds.forEach(tx => {
        summary.amount -= Number(tx.amount)
        const settlementInfo = tx.card_hold_id ? settlementMap[tx.card_hold_id] : null
        summary.items.holds.push({
            ...tx,
            settlement_info: settlementInfo
        })
    })

    return summary
}
