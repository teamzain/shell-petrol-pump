-- Final Corrected SQL: Fix hold release date for Pakistan
CREATE OR REPLACE FUNCTION release_po_hold(
    p_hold_id UUID,
    p_user_id UUID,
    p_actual_date DATE DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_hold RECORD;
    v_po RECORD;
    v_account_id UUID;
    v_pkt_date DATE;
BEGIN
    -- Correctly get current date in Pakistan Time (PKT) if not provided
    -- now() is UTC, AT TIME ZONE 'Asia/Karachi' shifts it to PKT
    IF p_actual_date IS NOT NULL THEN
        v_pkt_date := p_actual_date;
    ELSE
        v_pkt_date := (now() AT TIME ZONE 'Asia/Karachi')::DATE;
    END IF;

    -- Get hold info
    SELECT * INTO v_hold FROM po_hold_records WHERE id = p_hold_id FOR UPDATE;
    
    IF v_hold.status = 'released' THEN
        RAISE EXCEPTION 'Hold is already released.';
    END IF;

    -- Get PO info
    SELECT * INTO v_po FROM purchase_orders WHERE id = v_hold.purchase_order_id;
    
    -- Get account id
    SELECT id INTO v_account_id FROM company_accounts WHERE supplier_id = v_po.supplier_id;

    -- Update hold status with provided date
    UPDATE po_hold_records 
    SET status = 'released', 
        actual_return_date = v_pkt_date, 
        updated_at = now()
    WHERE id = p_hold_id;

    -- Credit company account
    IF v_account_id IS NOT NULL THEN
        UPDATE company_accounts 
        SET current_balance = current_balance + v_hold.hold_amount,
            updated_at = now()
        WHERE id = v_account_id;

        INSERT INTO company_account_transactions (
            company_account_id, transaction_type, transaction_source, amount, transaction_date,
            purchase_order_id, delivery_id, hold_record_id, note, created_by
        ) VALUES (
            v_account_id, 'credit', 'hold_release', v_hold.hold_amount, v_pkt_date,
            v_po.id, v_hold.delivery_id, p_hold_id, 
            'Hold Released - PO# ' || v_po.po_number || ' | ' || v_hold.hold_quantity || ' ' || COALESCE(v_po.unit_type, 'units') || ' not delivered, amount returned by supplier',
            p_user_id
        );
    END IF;

    -- Update notification status
    UPDATE po_notifications 
    SET status = 'completed', updated_at = now()
    WHERE related_hold_id = p_hold_id AND notification_type = 'hold_return_reminder';

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
