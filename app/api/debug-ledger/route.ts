import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
    const supabase = await createClient()

    const { data: moves, error } = await supabase
        .from('stock_movements')
        .select('id, movement_type, movement_date, reference_number, notes')
        .order('movement_date', { ascending: false })
        .limit(20)

    const { data: purchases } = await supabase
        .from('deliveries')
        .select('id, delivery_date, delivery_number, product_id')
        .order('delivery_date', { ascending: false })
        .limit(10)

    return NextResponse.json({ 
        stockMovements: moves,
        deliveries: purchases,
        error: error?.message
    })
}
