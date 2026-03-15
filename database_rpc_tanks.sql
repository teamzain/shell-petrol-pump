-- RPC to decrement tank stock
CREATE OR REPLACE FUNCTION decrement_tank_stock(p_tank_id UUID, p_quantity NUMERIC)
RETURNS void AS $$
BEGIN
    UPDATE tanks
    SET current_level = current_level - p_quantity,
        updated_at = NOW()
    WHERE id = p_tank_id;
END;
$$ LANGUAGE plpgsql;

-- RPC to increment tank stock
CREATE OR REPLACE FUNCTION increment_tank_stock(p_tank_id UUID, p_quantity NUMERIC)
RETURNS void AS $$
BEGIN
    UPDATE tanks
    SET current_level = current_level + p_quantity,
        updated_at = NOW()
    WHERE id = p_tank_id;
END;
$$ LANGUAGE plpgsql;
