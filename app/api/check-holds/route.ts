
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
    const supabase = await createClient()
    const targetDate = '2026-03-18'

    const { data: holds } = await supabase
        .from("card_hold_records")
        .select("*")
        .eq("sale_date", targetDate)

    const { data: balanceTxs } = await supabase
        .from("balance_transactions")
        .select("*")
        .eq("transaction_date", targetDate)

    return NextResponse.json({ 
        holds,
        balanceTxs: balanceTxs?.filter(tx => tx.is_hold || tx.card_hold_id)
    })
}
