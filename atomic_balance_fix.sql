-- Comprehensive trigger to handle balance deductions for expenses

-- 1. Function to handle balance changes
CREATE OR REPLACE FUNCTION handle_expense_balance_sync()
RETURNS TRIGGER AS $$
DECLARE
    v_amount_diff NUMERIC;
    v_old_method TEXT;
    v_new_method TEXT;
    v_old_bank UUID;
    v_new_bank UUID;
    v_date DATE;
BEGIN
    -- Determine the difference in amount and the methods
    IF (TG_OP = 'INSERT') THEN
        v_amount_diff := NEW.amount;
        v_new_method := NEW.payment_method;
        v_new_bank := NEW.bank_account_id;
        v_date := NEW.expense_date;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_amount_diff := NEW.amount - OLD.amount;
        v_old_method := OLD.payment_method;
        v_new_method := NEW.payment_method;
        v_old_bank := OLD.bank_account_id;
        v_new_bank := NEW.bank_account_id;
        v_date := NEW.expense_date;
        
        -- Handle method change (if they changed from cash to bank or vice versa)
        IF (v_old_method <> v_new_method OR COALESCE(v_old_bank, '00000000-0000-0000-0000-000000000000'::uuid) <> COALESCE(v_new_bank, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
            -- Reverse old impact
            IF (v_old_method = 'bank_transfer' AND v_old_bank IS NOT NULL) THEN
                UPDATE bank_accounts SET current_balance = current_balance + OLD.amount WHERE id = v_old_bank;
            ELSIF (v_old_method = 'cash' OR v_old_method IS NULL) THEN
                UPDATE daily_accounts_status 
                SET total_expenses = total_expenses - OLD.amount,
                    closing_cash = closing_cash + OLD.amount
                WHERE status_date = OLD.expense_date;
            END IF;
            -- Now treat as NEW insert for the new values
            v_amount_diff := NEW.amount;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        v_amount_diff := -OLD.amount;
        v_new_method := OLD.payment_method;
        v_new_bank := OLD.bank_account_id;
        v_date := OLD.expense_date;
    END IF;

    -- Apply the differential impact
    IF (v_new_method = 'bank_transfer' AND v_new_bank IS NOT NULL) THEN
        UPDATE bank_accounts SET current_balance = current_balance - v_amount_diff WHERE id = v_new_bank;
    ELSIF (v_new_method = 'cash' OR v_new_method IS NULL) THEN
        -- Upsert daily status if it doesn't exist for the date
        INSERT INTO daily_accounts_status (status_date, total_expenses, closing_cash)
        VALUES (v_date, v_amount_diff, -v_amount_diff)
        ON CONFLICT (status_date) DO UPDATE SET
            total_expenses = daily_accounts_status.total_expenses + v_amount_diff,
            closing_cash = daily_accounts_status.closing_cash - v_amount_diff;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the trigger
DROP TRIGGER IF EXISTS trg_sync_expense_balance ON daily_expenses;
CREATE TRIGGER trg_sync_expense_balance
AFTER INSERT OR UPDATE OR DELETE ON daily_expenses
FOR EACH ROW EXECUTE FUNCTION handle_expense_balance_sync();
