-- Refined release_card_hold to handle Bank Cards
CREATE OR REPLACE FUNCTION release_card_hold_v2(
  p_hold_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_hold RECORD;
  v_account_id UUID;
BEGIN
  -- 1. Get hold details
  SELECT * INTO v_hold 
  FROM card_hold_records WHERE id = p_hold_id;

  IF v_hold IS NULL THEN
    RAISE EXCEPTION 'Hold record not found.';
  END IF;

  IF v_hold.status = 'released' THEN
    RAISE EXCEPTION 'Hold is already released.';
  END IF;

  -- 2. Update hold status
  UPDATE card_hold_records
  SET status = 'released',
      actual_release_date = CURRENT_DATE,
      updated_at = now()
  WHERE id = p_hold_id;

  -- 3. Update daily_sales hold_status
  UPDATE daily_sales
  SET hold_status = 'released',
      updated_at = now()
  WHERE id = v_hold.sale_id;

  -- 4. Handle Supplier Cards (Credit Supplier Account)
  IF v_hold.payment_type = 'supplier_card' AND v_hold.supplier_id IS NOT NULL THEN
    SELECT id INTO v_account_id
    FROM company_accounts
    WHERE supplier_id = v_hold.supplier_id;

    IF v_account_id IS NOT NULL THEN
      UPDATE company_accounts
      SET current_balance = current_balance + v_hold.hold_amount,
          updated_at = now()
      WHERE id = v_account_id;

      INSERT INTO company_account_transactions (
        company_account_id, transaction_type, 
        transaction_source, amount, transaction_date, note, created_by
      ) VALUES (
        v_account_id, 'credit', 'card_hold_release',
        v_hold.hold_amount, CURRENT_DATE,
        'Card Hold Released - Sale Date: ' || v_hold.sale_date,
        p_user_id
      );
    END IF;
  END IF;

  -- 5. Handle Bank Cards (Update Current Bank Balance in daily_accounts_status or a system account)
  -- For now, we update the LATEST closing_bank in daily_accounts_status
  IF v_hold.payment_type = 'bank_card' THEN
    -- Find the latest status record and update it
    UPDATE daily_accounts_status
    SET closing_bank = closing_bank + v_hold.hold_amount,
        finalized_at = now()
    WHERE id = (
        SELECT id FROM daily_accounts_status 
        ORDER BY status_date DESC, created_at DESC 
        LIMIT 1
    );
    
    -- If no status record exists for today, it will be picked up in next finalization
  END IF;

  -- 6. Complete notification
  UPDATE card_hold_notifications
  SET status = 'completed', updated_at = now()
  WHERE card_hold_id = p_hold_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
