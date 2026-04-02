"use server"

import { createClient } from "@/lib/supabase/server"

export interface StockReportRow {
    id: string
    row_type: "movement" | "dip_reading"
    movement_date: string
    product_id: string
    product_name: string
    product_type: string
    movement_type: string // 'purchase' | 'sale' | 'adjustment' | 'initial' | 'dip_reading'
    quantity: number | null
    previous_stock: number | null
    balance_after: number | null
    dip_mm: number | null
    dip_quantity: number | null // dip_volume in liters from reconciliation
    notes: string | null
    reference_number: string | null
    supplier_name: string | null
    // Extra reconciliation fields
    current_stock_before_dip: number | null
    gain_amount: number | null
    loss_amount: number | null
}

export interface GainLossReportRow {
    id: string
    reading_date: string
    tank_id: string
    tank_name: string
    product_id: string
    product_name: string
    product_type: string
    system_stock: number
    dip_stock: number
    variance: number // gain_amount - loss_amount
    variance_percentage: number
    notes: string | null
}

export interface GainLossSummary {
    totalGain: number
    totalLoss: number
    netVariance: number
    records: GainLossReportRow[]
}

export interface StockReportFilters {
    startDate?: string
    endDate?: string
    productId?: string
    productType?: string // 'all' | 'fuel' | 'oil'
    movementType?: string // 'all' | 'purchase' | 'sale' | 'adjustment' | 'dip_reading'
}

export async function getStockReportData(filters: StockReportFilters): Promise<StockReportRow[]> {
    const supabase = await createClient()

    const { startDate, endDate, productId, productType, movementType } = filters

    // ─── 1. Fetch stock_movements ───────────────────────────────────────────
    let movQuery = supabase
        .from("stock_movements")
        .select("id, product_id, movement_date, movement_type, quantity, previous_stock, balance_after, notes, reference_number, products!inner(name, type), suppliers(name)")
        .order("movement_date", { ascending: false })

    if (startDate) movQuery = movQuery.gte("movement_date", `${startDate}T00:00:00+05:00`)
    if (endDate)   movQuery = movQuery.lte("movement_date", `${endDate}T23:59:59+05:00`)
    if (productId && productId !== "all") movQuery = movQuery.eq("product_id", productId)
    if (productType && productType !== "all") {
        const type = (productType === 'fuel' || productType === 'fuel_products') ? 'fuel' : 'oil'
        movQuery = movQuery.eq("products.type", type)
    }
    if (movementType && movementType !== "all" && movementType !== "dip_reading") {
        movQuery = movQuery.eq("movement_type", movementType)
    }
    // If movementType is ONLY dip_reading, we should return NO movements from this table
    if (movementType === "dip_reading") {
        movQuery = movQuery.eq("id", "00000000-0000-0000-0000-000000000000") // Hack to return empty
    }

    const { data: movData, error: movError } = await movQuery.limit(5000)
    if (movError) throw new Error(`Stock movements fetch failed: ${movError.message}`)

    // ─── 2. Fetch tank_reconciliation_records ──────────────────────────────
    // Only fetch dip rows when type filter allows it
    let dipRows: StockReportRow[] = []

    if (!movementType || movementType === "all" || movementType === "dip_reading") {
        let dipQuery = supabase
            .from("tank_reconciliation_records")
            .select(`
                id,
                tank_id,
                reading_date,
                created_at,
                dip_mm,
                dip_volume,
                current_stock,
                gain_amount,
                loss_amount,
                actual_stock,
                tanks (
                    name,
                    product_id,
                    products ( name, type )
                )
            `)
            .order("reading_date", { ascending: false })

        if (startDate) dipQuery = dipQuery.gte("reading_date", startDate)
        if (endDate)   dipQuery = dipQuery.lte("reading_date", endDate)

        const { data: dipData, error: dipError } = await dipQuery.limit(5000)
        if (dipError) throw new Error(`Dip records fetch failed: ${dipError.message}`)

        dipRows = ((dipData || []) as any[])
            .filter((r: any) => {
                if (!productId || productId === "all") return true
                return r.tanks?.product_id === productId
            })
            .map((r: any): StockReportRow => {
                // Combine the logical reading date with the actual wall clock time (including TZ offset)
                let movementDate = `${r.reading_date}T00:00:00+05:00`;
                if (r.created_at && r.created_at.includes('T')) {
                    const timePart = r.created_at.split('T')[1];
                    movementDate = `${r.reading_date}T${timePart}`;
                }
                
                return {
                    id: `dip-${r.id}`,
                    row_type: "dip_reading",
                    movement_date: movementDate,
                    product_id: r.tanks?.product_id || "",
                    product_name: r.tanks?.products?.name || "Unknown",
                    product_type: r.tanks?.products?.type || "other",
                    movement_type: "dip_reading",
                    quantity: null,
                    previous_stock: Number(r.current_stock ?? 0),
                    balance_after: Number(r.actual_stock ?? 0),
                    dip_mm: Number(r.dip_mm ?? 0),
                    dip_quantity: Number(r.dip_volume ?? 0),
                    notes: `Tank dip reading — ${r.tanks?.name || "Tank"}`,
                    reference_number: null,
                    supplier_name: null,
                    current_stock_before_dip: Number(r.current_stock ?? 0),
                    gain_amount: Number(r.gain_amount ?? 0),
                    loss_amount: Number(r.loss_amount ?? 0),
                }
            })
    }

    // ─── 3. Map movement rows ──────────────────────────────────────────────
    const movRows: StockReportRow[] = ((movData || []) as any[]).map((m: any): StockReportRow => ({
        id: m.id,
        row_type: "movement",
        movement_date: m.movement_date,
        product_id: m.product_id,
        product_name: m.products?.name || "Unknown",
        product_type: m.products?.type || "other",
        movement_type: m.movement_type,
        quantity: Number(m.quantity),
        previous_stock: Number(m.previous_stock ?? 0),
        balance_after: Number(m.balance_after ?? 0),
        dip_mm: null,
        dip_quantity: null,
        notes: m.notes || null,
        reference_number: m.reference_number || null,
        supplier_name: m.suppliers?.name || null,
        current_stock_before_dip: null,
        gain_amount: null,
        loss_amount: null,
    }))

    // ─── 4. Merge & sort by date descending ───────────────────────────────
    const combined = [...movRows, ...dipRows].sort(
        (a, b) => new Date(b.movement_date).getTime() - new Date(a.movement_date).getTime()
    )

    return combined
}

export async function getGainLossReportData(filters: StockReportFilters): Promise<GainLossSummary> {
    const supabase = await createClient()
    const { startDate, endDate, productId } = filters

    let query = supabase
        .from("tank_reconciliation_records")
        .select(`
            id,
            tank_id,
            reading_date,
            current_stock,
            actual_stock,
            gain_amount,
            loss_amount,
            dip_mm,
            tanks (
                name,
                product_id,
                products ( name, type )
            )
        `)
        .order("reading_date", { ascending: false })

    if (startDate) query = query.gte("reading_date", startDate)
    if (endDate)   query = query.lte("reading_date", endDate)

    const { data, error } = await query
    if (error) throw new Error(`Gain/Loss fetch failed: ${error.message}`)

    let totalGain = 0
    let totalLoss = 0

    const records: GainLossReportRow[] = (data || [])
        .filter((r: any) => {
            if (!productId || productId === "all") return true
            return r.tanks?.product_id === productId
        })
        .map((r: any): GainLossReportRow => {
            const variance = (r.gain_amount || 0) - (r.loss_amount || 0)
            totalGain += (r.gain_amount || 0)
            totalLoss += (r.loss_amount || 0)
            
            const systemStock = Number(r.current_stock || 0)
            const variancePct = systemStock > 0 ? (variance / systemStock) * 100 : 0

            return {
                id: r.id,
                reading_date: r.reading_date,
                tank_id: r.tank_id,
                tank_name: r.tanks?.name || "Unknown Tank",
                product_id: r.tanks?.product_id || "",
                product_name: r.tanks?.products?.name || "Unknown Product",
                product_type: r.tanks?.products?.type || "other",
                system_stock: systemStock,
                dip_stock: Number(r.actual_stock || 0),
                variance: variance,
                variance_percentage: variancePct,
                notes: `Dip: ${r.dip_mm}mm`
            }
        })

    return {
        totalGain,
        totalLoss,
        netVariance: totalGain - totalLoss,
        records
    }
}

/**
 * Fetch a summary of current stock levels for all active products
 */
export async function getCurrentStockSummary(productType?: string) {
    const supabase = await createClient()
    
    let query = supabase
        .from("products")
        .select("id, name, type, current_stock, unit, tank_capacity, purchase_price")
        .eq("status", "active")
        .order("name")

    if (productType && productType !== "all") {
        const type = (productType === 'fuel' || productType === 'fuel_products') ? 'fuel' : 'oil'
        query = query.eq("type", type)
    }

    const { data, error } = await query
    if (error) throw new Error(`Stock summary fetch failed: ${error.message}`)

    return (data || []).map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        stock: Number(p.current_stock || 0),
        unit: p.unit,
        capacity: p.tank_capacity ? Number(p.tank_capacity) : null,
        value: Number(p.current_stock || 0) * Number(p.purchase_price || 0)
    }))
}
