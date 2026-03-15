"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function getProducts(type?: 'fuel' | 'oil') {
    const supabase = await createClient()
    let query = supabase.from("products").select("*").eq("status", "active").order("name")

    if (type) {
        query = query.eq("type", type)
    }

    const { data, error } = await query
    if (error) throw error
    return data
}

export async function upsertProduct(formData: any, productId?: string) {
    const supabase = await createClient()

    const purchasePrice = parseFloat(formData.purchase_price)
    const sellingPrice = parseFloat(formData.selling_price)
    const currentStock = formData.current_stock ? parseFloat(formData.current_stock) : 0
    const tankCapacity = formData.tank_capacity ? parseFloat(formData.tank_capacity) : 0
    const minStockLevel = formData.min_stock_level ? parseFloat(formData.min_stock_level) : 0

    // Strict Validations
    if (sellingPrice < purchasePrice) {
        throw new Error("Selling price must be greater than or equal to purchase price")
    }

    const productData = {
        name: formData.name,
        type: formData.type,
        category: formData.category || (formData.type === 'fuel' ? "Fuel" : null),
        unit: formData.unit || "Liters",
        current_stock: currentStock,
        min_stock_level: minStockLevel,
        purchase_price: purchasePrice,
        selling_price: sellingPrice,
        tank_capacity: tankCapacity,
        status: "active",
    }

    let resultProductId = productId
    let oldPrice = null

    if (productId) {
        // Get old price for history
        const { data: oldData } = await supabase
            .from("products")
            .select("selling_price")
            .eq("id", productId)
            .single()

        oldPrice = oldData?.selling_price

        const { error } = await supabase
            .from("products")
            .update(productData)
            .eq("id", productId)
        if (error) throw error
    } else {
        const { data, error } = await supabase
            .from("products")
            .insert(productData)
            .select("id")
            .single()
        if (error) throw error
        resultProductId = data.id
    }

    // Record price history if price changed or new product
    if (!productId || oldPrice !== sellingPrice) {
        await supabase.from("price_history").insert({
            product_id: resultProductId,
            old_price: oldPrice,
            new_price: sellingPrice,
            reason: productId ? "Manual Update" : "Initial Setup",
        })
    }

    revalidatePath("/dashboard/products/fuel")
    revalidatePath("/dashboard/products/oils")
    return { success: true, id: resultProductId }
}

export async function deleteProduct(productId: string) {
    const supabase = await createClient()
    const { error } = await supabase.from("products").delete().eq("id", productId)
    if (error) throw error

    revalidatePath("/dashboard/products/fuel")
    revalidatePath("/dashboard/products/oils")
    return { success: true }
}
