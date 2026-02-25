"use client"

import React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Fuel, AlertCircle } from "lucide-react"
import { BrandLoader } from "../ui/brand-loader"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { upsertProduct } from "@/app/actions/products"

interface FuelProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: {
    id: string
    name: string
    tank_capacity: number
    current_stock: number
    min_stock_level: number
    purchase_price: number
    selling_price: number
  } | null
  onSuccess: () => void
}

export function FuelProductDialog({ open, onOpenChange, product, onSuccess }: FuelProductDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [formData, setFormData] = useState({
    name: "",
    tank_capacity: "",
    current_stock: "",
    min_stock_level: "500",
    purchase_price: "",
    selling_price: "",
  })


  const isEditing = !!product

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        tank_capacity: (product.tank_capacity || 0).toString(),
        current_stock: (product.current_stock || 0).toString(),
        min_stock_level: (product.min_stock_level || 500).toString(),
        purchase_price: (product.purchase_price || 0).toString(),
        selling_price: (product.selling_price || 0).toString(),
      })
    } else {
      setFormData({
        name: "",
        tank_capacity: "",
        current_stock: "",
        min_stock_level: "500",
        purchase_price: "",
        selling_price: "",
      })
    }
    setError("")
  }, [product, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const tankCapacity = parseFloat(formData.tank_capacity)
      const currentStock = parseFloat(formData.current_stock)
      const minStockLevel = parseFloat(formData.min_stock_level)
      const purchasePrice = parseFloat(formData.purchase_price)
      const sellingPrice = parseFloat(formData.selling_price)

      // Validation
      if (currentStock > tankCapacity) {
        throw new Error("Current stock cannot exceed tank capacity")
      }

      if (sellingPrice <= purchasePrice) {
        throw new Error("Selling price must be greater than purchase price")
      }

      const payload = {
        ...formData,
        type: "fuel",
        category: "Fuel",
      }

      await upsertProduct(payload, product?.id)

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const profitMargin = formData.purchase_price && formData.selling_price
    ? (((parseFloat(formData.selling_price) - parseFloat(formData.purchase_price)) / parseFloat(formData.purchase_price)) * 100).toFixed(2)
    : "0"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fuel className="h-5 w-5 text-primary" />
            {isEditing ? "Edit Fuel Product" : "Add Fuel Product"}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? "Update fuel product details" : "Add a new fuel product with tank configuration"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Product Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Petrol, Diesel, Hi-Octane"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="tank_capacity">Tank Capacity (Liters)</Label>
                <Input
                  id="tank_capacity"
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.tank_capacity}
                  onChange={(e) => setFormData({ ...formData, tank_capacity: e.target.value })}
                  placeholder="e.g., 10000"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="current_stock">
                  {isEditing ? "Current Stock" : "Opening Stock"} (Liters)
                </Label>
                <Input
                  id="current_stock"
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.current_stock}
                  onChange={(e) => setFormData({ ...formData, current_stock: e.target.value })}
                  placeholder="e.g., 5000"
                  required
                  disabled={isEditing}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="min_stock_level">Min Stock Alert (Liters)</Label>
                <Input
                  id="min_stock_level"
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.min_stock_level}
                  onChange={(e) => setFormData({ ...formData, min_stock_level: e.target.value })}
                  placeholder="e.g., 1000"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="purchase_price">Purchase Price (per Liter)</Label>
                <Input
                  id="purchase_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.purchase_price}
                  onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })}
                  placeholder="e.g., 250.00"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="selling_price">Selling Price (per Liter)</Label>
                <Input
                  id="selling_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.selling_price}
                  onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                  placeholder="e.g., 260.00"
                  required
                />
              </div>
            </div>

            {formData.purchase_price && formData.selling_price && (
              <div className="rounded-lg bg-muted p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Profit Margin:</span>
                  <span className={`font-medium ${parseFloat(profitMargin) > 0 ? "text-success" : "text-destructive"}`}>
                    {profitMargin}%
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Profit per Liter:</span>
                  <span className="font-medium">
                    Rs. {(parseFloat(formData.selling_price) - parseFloat(formData.purchase_price)).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <BrandLoader size="xs" /> : (isEditing ? "Update Product" : "Add Product")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
