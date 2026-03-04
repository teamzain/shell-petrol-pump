-- Table: profiles (Base user metadata)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT DEFAULT 'staff',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: dispensers
CREATE TABLE IF NOT EXISTS dispensers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,           -- e.g. "Dispenser 1"
  product_id UUID REFERENCES products(id),
  status TEXT DEFAULT 'active', -- active/inactive
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- Table: nozzles
CREATE TABLE IF NOT EXISTS nozzles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispenser_id UUID REFERENCES dispensers(id),
  nozzle_number INT NOT NULL,   -- 1, 2, 3, 4
  product_id UUID REFERENCES products(id),
  status TEXT DEFAULT 'active', -- active/inactive
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- Table: daily_meter_readings
CREATE TABLE daily_meter_readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reading_date DATE NOT NULL,
  nozzle_id UUID REFERENCES nozzles(id),
  dispenser_id UUID REFERENCES dispensers(id),
  product_id UUID REFERENCES products(id),
  opening_reading NUMERIC NOT NULL,  
    -- auto from previous day closing
  closing_reading NUMERIC NOT NULL,  
    -- user enters this
  liters_sold NUMERIC GENERATED ALWAYS AS 
    (closing_reading - opening_reading) STORED,
  rate_per_liter NUMERIC NOT NULL,   
    -- from products.selling_price
  total_amount NUMERIC GENERATED ALWAYS AS 
    ((closing_reading - opening_reading) * rate_per_liter) STORED,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  UNIQUE(reading_date, nozzle_id)    
    -- one reading per nozzle per day
);

-- Table: payment_methods
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,           
    -- 'Cash', 'Bank Card', 'Shell Card', custom
  type TEXT NOT NULL,           
    -- 'cash', 'bank_card', 'supplier_card', 'custom'
  supplier_id UUID REFERENCES suppliers(id) NULL,
    -- for supplier cards like Shell Card
  hold_days INT DEFAULT 0,      
    -- 0 for cash, X days for cards
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- Table: daily_sales
CREATE TABLE daily_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_date DATE NOT NULL,
  meter_reading_id UUID REFERENCES daily_meter_readings(id),
  nozzle_id UUID REFERENCES nozzles(id),
  dispenser_id UUID REFERENCES dispensers(id),
  product_id UUID REFERENCES products(id),
  liters_sold NUMERIC NOT NULL,
  rate_per_liter NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,  -- liters × rate
  payment_method_id UUID REFERENCES payment_methods(id),
  payment_type TEXT NOT NULL,     
    -- 'cash'/'bank_card'/'supplier_card'/'custom'
  cash_amount NUMERIC DEFAULT 0,
  card_amount NUMERIC DEFAULT 0,
  hold_amount NUMERIC DEFAULT 0,  
    -- card amount put on hold
  hold_status TEXT DEFAULT 'none', 
    -- 'none'/'pending'/'released'
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- Table: card_hold_records
CREATE TABLE card_hold_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID REFERENCES daily_sales(id),
  payment_method_id UUID REFERENCES payment_methods(id),
  payment_type TEXT NOT NULL,     
    -- 'bank_card' / 'supplier_card'
  supplier_id UUID REFERENCES suppliers(id) NULL,
    -- for supplier cards
  hold_amount NUMERIC NOT NULL,
  sale_date DATE NOT NULL,
  expected_release_date DATE NULL,
  actual_release_date DATE NULL,
  status TEXT DEFAULT 'on_hold',  
    -- 'on_hold' / 'released'
  release_note TEXT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- Table: card_hold_notifications
CREATE TABLE card_hold_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_hold_id UUID REFERENCES card_hold_records(id),
  notification_type TEXT DEFAULT 'card_hold_release',
  trigger_date DATE NOT NULL,
  status TEXT DEFAULT 'pending', 
    -- 'pending'/'snoozed'/'completed'
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- Insert Default Payment Methods
INSERT INTO payment_methods (name, type, hold_days) VALUES
  ('Cash', 'cash', 0),
  ('Bank Card', 'bank_card', 3),     -- holds 3 days in bank
  ('Shell Card', 'supplier_card', 2); -- holds 2 days in company

CREATE OR REPLACE FUNCTION get_opening_reading(
  p_nozzle_id UUID,
  p_date DATE
) RETURNS NUMERIC AS $$
DECLARE
  v_opening NUMERIC;
BEGIN
  -- Get the most recent closing reading before the given date
  SELECT closing_reading INTO v_opening
  FROM daily_meter_readings
  WHERE nozzle_id = p_nozzle_id
  AND reading_date < p_date
  ORDER BY reading_date DESC, created_at DESC
  LIMIT 1;
  
  -- If no previous reading, return 0
  RETURN COALESCE(v_opening, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function 2: Save Daily Sale (Atomic)
CREATE OR REPLACE FUNCTION save_daily_sale(
  p_sale_date DATE,
  p_nozzle_id UUID,
  p_closing_reading NUMERIC,
  p_payment_method_id UUID,
  p_expected_release_date DATE,
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_nozzle RECORD;
  v_product RECORD;
  v_payment RECORD;
  v_opening_reading NUMERIC;
  v_liters_sold NUMERIC;
  v_total_amount NUMERIC;
  v_reading_id UUID;
  v_sale_id UUID;
  v_hold_id UUID;
BEGIN
  -- Get nozzle and product info
  SELECT n.*, d.name as dispenser_name 
  INTO v_nozzle
  FROM nozzles n
  JOIN dispensers d ON n.dispenser_id = d.id
  WHERE n.id = p_nozzle_id;

  SELECT * INTO v_product 
  FROM products WHERE id = v_nozzle.product_id;

  SELECT * INTO v_payment 
  FROM payment_methods WHERE id = p_payment_method_id;

  -- Get opening reading (previous day closing)
  v_opening_reading := get_opening_reading(p_nozzle_id, p_sale_date);

  -- Validate closing > opening
  IF p_closing_reading < v_opening_reading THEN
    RAISE EXCEPTION 'Closing reading cannot be less than opening reading. Opening: %, Closing: %', v_opening_reading, p_closing_reading;
  END IF;

  -- Calculate liters sold
  v_liters_sold := p_closing_reading - v_opening_reading;
  v_total_amount := v_liters_sold * v_product.selling_price;

  -- Save meter reading
  INSERT INTO daily_meter_readings (
    reading_date, nozzle_id, dispenser_id, product_id,
    opening_reading, closing_reading, rate_per_liter, created_by
  ) VALUES (
    p_sale_date, p_nozzle_id, v_nozzle.dispenser_id,
    v_nozzle.product_id, v_opening_reading, 
    p_closing_reading, v_product.selling_price, p_user_id
  ) RETURNING id INTO v_reading_id;

  -- Save daily sale
  INSERT INTO daily_sales (
    sale_date, meter_reading_id, nozzle_id, 
    dispenser_id, product_id,
    liters_sold, rate_per_liter, total_amount,
    payment_method_id, payment_type,
    cash_amount, card_amount, hold_amount, hold_status,
    created_by
  ) VALUES (
    p_sale_date, v_reading_id, p_nozzle_id,
    v_nozzle.dispenser_id, v_nozzle.product_id,
    v_liters_sold, v_product.selling_price, v_total_amount,
    p_payment_method_id, v_payment.type,
    CASE WHEN v_payment.type = 'cash' THEN v_total_amount ELSE 0 END,
    CASE WHEN v_payment.type != 'cash' THEN v_total_amount ELSE 0 END,
    CASE WHEN v_payment.type != 'cash' THEN v_total_amount ELSE 0 END,
    CASE WHEN v_payment.type = 'cash' THEN 'none' ELSE 'pending' END,
    p_user_id
  ) RETURNING id INTO v_sale_id;

  -- Update product stock (subtract liters sold)
  UPDATE products
  SET current_stock = current_stock - v_liters_sold,
      updated_at = now()
  WHERE id = v_nozzle.product_id;

  -- If card payment → create hold record
  IF v_payment.type != 'cash' THEN
    INSERT INTO card_hold_records (
      sale_id, payment_method_id, payment_type,
      supplier_id, hold_amount, sale_date,
      expected_release_date, created_by
    ) VALUES (
      v_sale_id, p_payment_method_id, v_payment.type,
      v_payment.supplier_id, v_total_amount, p_sale_date,
      p_expected_release_date, p_user_id
    ) RETURNING id INTO v_hold_id;

    -- Create notification for release date
    IF p_expected_release_date IS NOT NULL THEN
      INSERT INTO card_hold_notifications (
        card_hold_id, trigger_date
      ) VALUES (
        v_hold_id, p_expected_release_date
      );
    END IF;
  END IF;

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function 3: Release Card Hold
CREATE OR REPLACE FUNCTION release_card_hold(
  p_hold_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_hold RECORD;
  v_payment RECORD;
  v_account_id UUID;
BEGIN
  SELECT * INTO v_hold 
  FROM card_hold_records WHERE id = p_hold_id;

  IF v_hold.status = 'released' THEN
    RAISE EXCEPTION 'Hold is already released.';
  END IF;

  -- Update hold status
  UPDATE card_hold_records
  SET status = 'released',
      actual_release_date = CURRENT_DATE,
      updated_at = now()
  WHERE id = p_hold_id;

  -- Update daily_sales hold_status
  UPDATE daily_sales
  SET hold_status = 'released',
      updated_at = now()
  WHERE id = v_hold.sale_id;

  -- If supplier card → credit supplier company account
  IF v_hold.payment_type = 'supplier_card' 
     AND v_hold.supplier_id IS NOT NULL THEN
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
        transaction_source, amount, transaction_date, note
      ) VALUES (
        v_account_id, 'credit', 'card_hold_release',
        v_hold.hold_amount, CURRENT_DATE,
        'Card Hold Released - Sale Date: ' || v_hold.sale_date
      );
    END IF;
  END IF;

  -- Complete notification
  UPDATE card_hold_notifications
  SET status = 'completed', updated_at = now()
  WHERE card_hold_id = p_hold_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
