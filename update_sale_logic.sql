-- Updated save_daily_sale with Tank Level deduction
CREATE OR REPLACE FUNCTION save_daily_sale_v2(
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
  v_tank_id UUID;
  v_existing_liters NUMERIC := 0;
BEGIN
  -- 1. Get nozzle and product info
  SELECT n.*, d.name as dispenser_name, d.tank_id 
  INTO v_nozzle
  FROM nozzles n
  JOIN dispensers d ON n.dispenser_id = d.id
  WHERE n.id = p_nozzle_id;

  v_tank_id := v_nozzle.tank_id;

  SELECT * INTO v_product 
  FROM products WHERE id = v_nozzle.product_id;

  SELECT * INTO v_payment 
  FROM payment_methods WHERE id = p_payment_method_id;

  -- 2. Get opening reading (previous day closing)
  v_opening_reading := get_opening_reading(p_nozzle_id, p_sale_date);

  -- 3. Validate closing > opening
  IF p_closing_reading < v_opening_reading THEN
    RAISE EXCEPTION 'Closing reading cannot be less than opening reading. Opening: %, Closing: %', v_opening_reading, p_closing_reading;
  END IF;

  -- 4. Calculate liters sold
  v_liters_sold := p_closing_reading - v_opening_reading;
  v_total_amount := v_liters_sold * v_product.selling_price;

  -- 5. Check for existing reading/sale
  SELECT id, (closing_reading - opening_reading) INTO v_reading_id, v_existing_liters
  FROM daily_meter_readings 
  WHERE reading_date = p_sale_date AND nozzle_id = p_nozzle_id;

  IF v_reading_id IS NULL THEN
    -- 5a. Insert new meter reading
    INSERT INTO daily_meter_readings (
      reading_date, nozzle_id, dispenser_id, product_id,
      opening_reading, closing_reading, rate_per_liter, created_by
    ) VALUES (
      p_sale_date, p_nozzle_id, v_nozzle.dispenser_id,
      v_nozzle.product_id, v_opening_reading, 
      p_closing_reading, v_product.selling_price, p_user_id
    ) RETURNING id INTO v_reading_id;

    -- 6a. Save daily sale
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
  ELSE
    -- 5b. Update existing meter reading
    UPDATE daily_meter_readings SET
      opening_reading = v_opening_reading,
      closing_reading = p_closing_reading,
      rate_per_liter = v_product.selling_price,
      updated_at = now()
    WHERE id = v_reading_id;

    -- 6b. Update existing daily sale
    UPDATE daily_sales SET
      liters_sold = v_liters_sold,
      rate_per_liter = v_product.selling_price,
      total_amount = v_total_amount,
      payment_method_id = p_payment_method_id,
      payment_type = v_payment.type,
      cash_amount = CASE WHEN v_payment.type = 'cash' THEN v_total_amount ELSE 0 END,
      card_amount = CASE WHEN v_payment.type != 'cash' THEN v_total_amount ELSE 0 END,
      hold_amount = CASE WHEN v_payment.type != 'cash' THEN v_total_amount ELSE 0 END,
      hold_status = CASE WHEN v_payment.type = 'cash' THEN 'none' ELSE 'pending' END,
      updated_at = now()
    WHERE meter_reading_id = v_reading_id
    RETURNING id INTO v_sale_id;
  END IF;

  -- 7. Update product stock (adjusting for the diff)
  UPDATE products
  SET current_stock = current_stock - (v_liters_sold - COALESCE(v_existing_liters, 0)),
      updated_at = now()
  WHERE id = v_nozzle.product_id;

  -- 8. Deduct from Tank Level if linked
  IF v_tank_id IS NOT NULL THEN
    UPDATE tanks
    SET current_level = current_level - (v_liters_sold - COALESCE(v_existing_liters, 0)),
        updated_at = now()
    WHERE id = v_tank_id;
  END IF;

  -- 9. If card payment → create or update hold record
  IF v_payment.type != 'cash' THEN
    SELECT id INTO v_hold_id FROM card_hold_records WHERE sale_id = v_sale_id;

    IF v_hold_id IS NULL THEN
      INSERT INTO card_hold_records (
        sale_id, payment_method_id, payment_type,
        supplier_id, hold_amount, sale_date,
        expected_release_date, created_by
      ) VALUES (
        v_sale_id, p_payment_method_id, v_payment.type,
        v_payment.supplier_id, v_total_amount, p_sale_date,
        p_expected_release_date, p_user_id
      ) RETURNING id INTO v_hold_id;
    ELSE
      UPDATE card_hold_records SET
        payment_method_id = p_payment_method_id,
        payment_type = v_payment.type,
        supplier_id = v_payment.supplier_id,
        hold_amount = v_total_amount,
        expected_release_date = p_expected_release_date,
        updated_at = now()
      WHERE id = v_hold_id;
    END IF;

    -- Update or create notification for release date
    IF p_expected_release_date IS NOT NULL THEN
      INSERT INTO card_hold_notifications (
        card_hold_id, trigger_date
      ) VALUES (
        v_hold_id, p_expected_release_date
      ) ON CONFLICT (card_hold_id) DO UPDATE SET
        trigger_date = EXCLUDED.trigger_date;
    END IF;
  ELSE
    -- If switched to cash, delete existing hold record if any
    DELETE FROM card_hold_records WHERE sale_id = v_sale_id;
  END IF;

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
