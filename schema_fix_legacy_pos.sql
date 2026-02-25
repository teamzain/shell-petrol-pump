-- PROBLEM 1: LEGACY POs SHOWING "No nested products found"

-- Step 1: Add items column if not exists
ALTER TABLE purchase_orders 
  ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb;

-- Step 2: Make delivery fields optional (if not already)
ALTER TABLE deliveries 
  ALTER COLUMN company_invoice_number DROP NOT NULL,
  ALTER COLUMN vehicle_number DROP NOT NULL,
  ALTER COLUMN driver_name DROP NOT NULL;

-- Step 3: Migrate all legacy POs that have NULL items or empty array
-- but have product_type filled
UPDATE purchase_orders
SET items = jsonb_build_array(
  jsonb_build_object(
    'product_id', NULL,
    'product_name', COALESCE(product_type, 'Unknown'),
    'product_type', COALESCE(product_type, 'Unknown'),
    'product_category', CASE 
      WHEN LOWER(COALESCE(product_type,'')) IN 
        ('petrol','diesel','high octane','cng','fuel') 
      THEN 'fuel'
      ELSE 'oil'
    END,
    'ordered_quantity', COALESCE(ordered_quantity, 0),
    'rate_per_liter', COALESCE(rate_per_liter, 0),
    'unit_type', COALESCE(unit_type, 'liter'),
    'total_amount', COALESCE(estimated_total, 0),
    'delivered_quantity', COALESCE(delivered_quantity, 0),
    'quantity_remaining', GREATEST(0, 
      COALESCE(ordered_quantity,0) - COALESCE(delivered_quantity,0)
    ),
    'status', CASE 
      WHEN is_closed = true THEN 'delivered'
      WHEN status = 'cancelled' THEN 'cancelled'
      ELSE 'pending'
    END,
    'hold_amount', COALESCE(hold_amount, 0),
    'is_legacy', true
  )
)
WHERE (items IS NULL OR items = '[]'::jsonb OR 
       jsonb_array_length(items) = 0)
AND product_type IS NOT NULL;

-- Step 4: Verify migration - should show items for all POs
SELECT po_number, product_type, 
       jsonb_array_length(items) as item_count,
       items->0->>'product_name' as first_product
FROM purchase_orders
ORDER BY created_at DESC;
