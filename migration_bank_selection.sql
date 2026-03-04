-- Add bank_card_id and supplier_card_id to card_hold_records and daily_sales
ALTER TABLE card_hold_records ADD COLUMN IF NOT EXISTS bank_card_id UUID REFERENCES bank_cards(id);
ALTER TABLE card_hold_records ADD COLUMN IF NOT EXISTS supplier_card_id UUID REFERENCES supplier_cards(id);

ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS bank_card_id UUID REFERENCES bank_cards(id);
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS supplier_card_id UUID REFERENCES supplier_cards(id);
