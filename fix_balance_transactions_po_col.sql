-- Add purchase_order_id column to balance_transactions to link cash/bank movements to POs
ALTER TABLE balance_transactions 
ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL;

-- Index for better join performance
CREATE INDEX IF NOT EXISTS idx_balance_transactions_po_id ON balance_transactions(purchase_order_id);
