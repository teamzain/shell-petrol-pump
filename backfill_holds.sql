-- Backfill existing pending card holds into balance_transactions ledger
INSERT INTO balance_transactions (
    transaction_type, 
    amount, 
    is_hold, 
    card_hold_id, 
    description, 
    transaction_date, 
    bank_card_id, 
    supplier_card_id,
    created_at
)
SELECT 
    CASE WHEN card_type = 'bank_card' THEN 'add_bank' ELSE 'transfer_to_supplier' END,
    hold_amount,
    true,
    id,
    'Card Hold (Backfill)',
    sale_date,
    bank_card_id,
    supplier_card_id,
    created_at
FROM card_hold_records
WHERE status = 'pending'
AND id NOT IN (SELECT card_hold_id FROM balance_transactions WHERE card_hold_id IS NOT NULL);
