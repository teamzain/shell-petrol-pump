"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Pencil, Trash2, Package, AlertTriangle } from "lucide-react"
import { OilProductDialog } from "@/components/products/oil-product-dialog"
import { BrandLoader } from "@/components/ui/brand-loader"
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog"

import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { getProducts, deleteProduct as deleteProductAction } from "@/app/actions/products"

interface OilProduct {
  id: string
  name: string
  category: string
  unit: string
  current_stock: number
  min_stock_level: number
  purchase_price: number
  selling_price: number
}

export default function OilProductsPage() {
  const [products, setProducts] = useState<OilProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<OilProduct | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<OilProduct | null>(null)

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const data = await getProducts('oil')
      setProducts(data || [])
    } catch (error) {
      console.error("Error fetching oil products:", error)
      toast.error("Failed to load products")
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  const handleEdit = (product: OilProduct) => {
    setSelectedProduct(product)
    setDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!productToDelete) return

    try {
      await deleteProductAction(productToDelete.id)
      toast.success("Product deleted successfully")
      fetchProducts()
    } catch (error) {
      toast.error("Failed to delete product")
    }
    setDeleteDialogOpen(false)
    setProductToDelete(null)
  }

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.category?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const lowStockProducts = products.filter(p => p.current_stock <= p.min_stock_level)
  const totalStockValue = products.reduce((sum, p) => sum + (p.current_stock * p.purchase_price), 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Oils & Lubricants</h1>
        <p className="text-muted-foreground">
          Manage non-fuel products with stock tracking and minimum level alerts
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Stock Value</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Rs. {totalStockValue.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className={lowStockProducts.length > 0 ? "border-warning" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${lowStockProducts.length > 0 ? "text-warning" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${lowStockProducts.length > 0 ? "text-warning" : ""}`}>
              {lowStockProducts.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {products.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Product List</CardTitle>
              <CardDescription>View and manage oils and lubricant products</CardDescription>
            </div>
            <Button onClick={() => { setSelectedProduct(null); setDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <BrandLoader size="md" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-center">
              <Package className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No products found</p>
              <Button
                variant="link"
                className="mt-1"
                onClick={() => { setSelectedProduct(null); setDialogOpen(true); }}
              >
                Add your first product
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="whitespace-nowrap">Product Name</TableHead>
                    <TableHead className="whitespace-nowrap">Category</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Stock</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Min Level</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Purchase Price</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Selling Price</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Stock Value</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium whitespace-nowrap">{product.name}</TableCell>
                      <TableCell className="whitespace-nowrap">{product.category || "-"}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <span className={product.current_stock <= product.min_stock_level ? "text-destructive font-medium" : ""}>
                          {product.current_stock} {product.unit}
                        </span>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">{product.min_stock_level} {product.unit}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">Rs. {product.purchase_price.toFixed(2)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">Rs. {product.selling_price.toFixed(2)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">Rs. {(product.current_stock * product.purchase_price).toLocaleString()}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(product)}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setProductToDelete(product)
                              setDeleteDialogOpen(true)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <OilProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={selectedProduct}
        onSuccess={() => {
          fetchProducts()
          setDialogOpen(false)
        }}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Delete Product"
        description={`Are you sure you want to delete "${productToDelete?.name}"? This action cannot be undone.`}
      />
    </div>
  )
}
