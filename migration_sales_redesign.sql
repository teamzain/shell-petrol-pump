-- RPC for decrementing product stock safely
CREATE OR REPLACE FUNCTION decrement_product_stock(
    p_product_id UUID,
    p_quantity NUMERIC
) RETURNS VOID AS $$
BEGIN
    UPDATE products
    SET current_stock = current_stock - p_quantity,
        updated_at = now()
    WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC for incrementing product stock safely (for returns/reopens)
CREATE OR REPLACE FUNCTION increment_product_stock(
    p_product_id UUID,
    p_quantity NUMERIC
) RETURNS VOID AS $$
BEGIN
    UPDATE products
    SET current_stock = current_stock + p_quantity,
        updated_at = now()
    WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
