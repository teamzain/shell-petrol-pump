"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { format } from "date-fns"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { AlertCircle, CheckCircle2, RefreshCw, AlertTriangle, ShieldCheck, Trash2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { BrandLoader } from "../ui/brand-loader"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cancelPurchaseOrderItem } from "@/app/actions/purchase-orders"

interface POHoldRecord {
  id: string
  hold_quantity: number
  hold_amount: number
  expected_return_date: string | null
  actual_return_date: string | null
  status: "on_hold" | "returned"
}

interface PurchaseOrder {
  id: string
  purchase_date: string
  invoice_number: string
  total_amount: number
  paid_amount: number
  due_amount: number
  payment_method: string
  status: string
  notes: string | null
  supplier_id: string
  created_at: string
  unit_type: "liter" | "unit"
  quantity_remaining: number
  estimated_total: number
  suppliers: {
    supplier_name: string
    contact_person?: string
    phone?: string
  }
  purchases?: {
    id: string
    quantity: number
    purchase_price_per_unit: number
    total_amount: number
    products: {
      id: string
      product_name: string
      product_type: string
      unit: string
      notes?: string
    }
  }[]
  items?: {
    product_id: string
    product_name: string
    product_category: string
    unit_type: string
    ordered_quantity: number
    rate_per_liter: number
    total_amount: number
    status: string
  }[]
  po_hold_records?: POHoldRecord[]
  deliveries?: any[]
  rate_per_liter: number
}

interface PurchaseDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: PurchaseOrder | null
  onRefresh?: () => void
}

export function PurchaseDetailsDialog({
  open,
  onOpenChange,
  order,
  onRefresh
}: PurchaseDetailsDialogProps) {
  const [updating, setUpdating] = useState(false)
  const [resolvingHold, setResolvingHold] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [cancellingItem, setCancellingItem] = useState<string | null>(null)

  const supabase = createClient()

  if (!order) return null

  const paymentMethodLabels: Record<string, string> = {
    bank_transfer: "Bank Transfer",
    cheque: "Cheque",
    cash: "Cash",
  }

  const formatCurrency = (val: number) => `Rs. ${Number(val).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // To support both legacy 'purchases' relational array and new JSONB 'items' array.
  const orderItems = order.items || order.purchases?.map(p => ({
    product_id: p.products?.id,
    product_name: p.products?.product_name || "Unknown Product",
    product_category: p.products?.product_type || "Unknown",
    ordered_quantity: p.quantity,
    unit_type: p.products?.unit || order.unit_type,
    rate_per_liter: p.purchase_price_per_unit || order.rate_per_liter,
    total_amount: p.total_amount,
    status: order.status
  })) || [];

  const handleStatusUpdate = async (newStatus: string) => {
    if (newStatus === order.status) return

    setUpdating(true)
    setError("")
    setSuccess("")

    try {
      // 1. Update the order status
      const { error: updateError } = await supabase
        .from("purchase_orders")
        .update({ status: newStatus })
        .eq("id", order.id)

      if (updateError) throw updateError

      // 2. If moving to 'received', update stock
      if (newStatus === "received" && order.status !== "received") {
        for (const item of orderItems) {
          if (!item.product_id || item.status === 'cancelled') continue;

          const { data: product } = await supabase
            .from("products")
            .select("current_stock, purchase_price")
            .eq("id", item.product_id)
            .single()

          if (product) {
            const newStock = Number(product.current_stock) + Number(item.ordered_quantity)
            await supabase.from("products").update({
              current_stock: newStock,
              last_purchase_price: item.rate_per_liter,
              last_purchase_date: order.purchase_date
            }).eq("id", item.product_id)
          }
        }

        // Update supplier totals
        const { data: supplier } = await supabase.from("suppliers").select("total_purchases").eq("id", (order as any).supplier_id).single()
        if (supplier) {
          await supabase.from("suppliers").update({
            total_purchases: (supplier.total_purchases || 0) + order.total_amount,
            last_purchase_date: order.purchase_date
          }).eq("id", (order as any).supplier_id)
        }
      }

      setSuccess(`Order status updated to ${newStatus}`)
      if (onRefresh) onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status")
    } finally {
      setUpdating(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "received": return <Badge className="bg-green-100 text-green-700 border-green-200">Received</Badge>
      case "hold": return <Badge className="bg-amber-100 text-amber-700 border-amber-200">On Hold</Badge>
      case "scheduled": return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Scheduled</Badge>
      case "completed": return <Badge className="bg-green-100 text-green-700 border-green-200">Completed</Badge>
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  const handleResolveHold = async (holdId: string, holdAmount: number) => {
    setResolvingHold(true)
    setError("")
    setSuccess("")
    try {
      // 1. Call Atomic Postgres Function to release hold
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Unauthorized")

      const { data, error: releaseError } = await supabase.rpc('release_po_hold', {
        p_hold_id: holdId,
        p_user_id: user.id
      })

      if (releaseError) throw releaseError

      setSuccess(`Hold successfully resolved! Credited Rs. ${holdAmount.toLocaleString()} to supplier account.`)
      if (onRefresh) onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve hold")
    } finally {
      setResolvingHold(false)
    }
  }

  const handleCancelItem = async (productId: string, productName: string) => {
    if (!confirm(`Are you sure you want to cancel ${productName} from this order?`)) return;

    setCancellingItem(productId);
    setError("");
    setSuccess("");

    try {
      const res = await cancelPurchaseOrderItem(order.id, productId);
      setSuccess(`Successfully cancelled ${productName}. ${res.allCancelled ? "The entire order has been cancelled." : ""}`);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel item.");
    } finally {
      setCancellingItem(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold text-xl">
            Invoice Details
          </DialogTitle>
          <DialogDescription className="font-mono text-sm">
            #{order.invoice_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Header Info */}
          <div className="flex justify-between items-start border-b pb-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Supplier</p>
              <p className="font-bold text-lg">{order.suppliers?.supplier_name}</p>
              <p className="text-sm text-muted-foreground">{order.suppliers?.phone}</p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Date</p>
              <p className="font-medium">{format(new Date(order.purchase_date), "PPP")}</p>
              {getStatusBadge(order.status)}
            </div>
          </div>

          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {success && <Alert className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="h-4 w-4 mr-2" /><AlertDescription>{success}</AlertDescription></Alert>}

          {/* Status Update Control */}
          <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-background border shadow-sm">
                <RefreshCw className={`h-4 w-4 text-primary ${updating ? "animate-spin" : ""}`} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground">Order Status</p>
                <p className="text-sm font-medium capitalize">{order.status}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select defaultValue={order.status} onValueChange={handleStatusUpdate} disabled={updating || order.status === "received"}>
                <SelectTrigger className="w-full sm:w-40 h-9 font-bold bg-background">
                  <SelectValue placeholder="Update Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hold">⏳ Hold</SelectItem>
                  <SelectItem value="scheduled">📅 Scheduled</SelectItem>
                  <SelectItem value="received">✅ Received</SelectItem>
                  <SelectItem value="cancelled">❌ Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Items Table */}
          <div className="space-y-3">
            <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              Order Items
            </h4>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground text-left">
                  <tr>
                    <th className="p-2 font-medium">Product</th>
                    <th className="p-2 font-medium text-right">Qty</th>
                    <th className="p-2 font-medium text-right">Price/Rate</th>
                    <th className="p-2 font-medium text-right">Total</th>
                    <th className="p-2 font-medium text-right w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orderItems.map((item, idx) => (
                    <tr key={idx} className={`hover:bg-muted/30 ${item.status === 'cancelled' ? 'opacity-50 grayscale' : ''}`}>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <p className={`font-medium ${item.status === 'cancelled' ? 'line-through' : ''}`}>{item.product_name}</p>
                          {item.status === 'cancelled' && <Badge variant="destructive" className="text-[9px] h-4 px-1 pb-0 scale-90">Cancelled</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground capitalize">{item.product_category?.replace("_", " ")}</p>
                      </td>
                      <td className="p-2 text-right">{item.ordered_quantity?.toLocaleString()} {item.unit_type}</td>
                      <td className="p-2 text-right">{formatCurrency(item.rate_per_liter)}</td>
                      <td className="p-2 text-right font-medium">{formatCurrency(item.total_amount)}</td>
                      <td className="p-2 text-right">
                        {order.status === 'pending' && item.status !== 'cancelled' && item.status !== 'delivered' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                onClick={() => handleCancelItem(item.product_id, item.product_name)}
                                disabled={cancellingItem === item.product_id}
                              >
                                {cancellingItem === item.product_id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Cancel this Item</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals Section */}
          <div className="bg-muted/30 p-4 rounded-lg space-y-2 ml-auto w-full sm:w-72">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground capitalize">Total Value</span>
              <span className="font-bold">{formatCurrency(order.estimated_total || 0)}</span>
            </div>
            <div className="flex justify-between text-sm text-green-600 border-b border-muted pb-2">
              <span className="capitalize">- Paid Value / Debited Amount</span>
              <span className="font-bold">-{formatCurrency(order.paid_amount || 0)}</span>
            </div>
            <div className="flex justify-between font-black text-lg pt-1">
              <span className="uppercase text-amber-700 tracking-tight text-sm self-center">= Amount On Hold</span>
              <span className="text-amber-600">
                {formatCurrency(Math.max(0, (order.estimated_total || 0) - (order.paid_amount || 0)))}
              </span>
            </div>
          </div>

          {/* Active Holds Section */}
          {order.po_hold_records && order.po_hold_records.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-bold text-sm uppercase tracking-wider text-amber-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Hold Records
              </h4>
              <div className="space-y-2">
                {order.po_hold_records.map((hold) => (
                  <Alert key={hold.id} className={`border ${hold.status === 'on_hold' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                    {hold.status === 'on_hold' ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <ShieldCheck className="h-4 w-4 text-green-600" />}
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start w-full gap-4">
                      <div>
                        <AlertTitle className={`text-sm font-bold ${hold.status === 'on_hold' ? 'text-amber-800' : 'text-green-800'}`}>
                          {hold.status === 'on_hold' ? 'Active Hold' : 'Resolved Hold'}
                        </AlertTitle>
                        <AlertDescription className="text-xs text-muted-foreground mt-1">
                          Missing Qty: <span className="font-bold font-mono">{hold.hold_quantity}</span> {order.unit_type === 'unit' ? 'Units' : 'Liters'} <br />
                          Hold Amount: <span className="font-bold text-slate-800">{formatCurrency(hold.hold_amount)}</span>
                        </AlertDescription>
                      </div>
                      {hold.status === 'on_hold' && (
                        <div className="flex-shrink-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-8 text-xs w-full sm:w-auto"
                                onClick={() => handleResolveHold(hold.id, hold.hold_amount)}
                                disabled={resolvingHold}
                              >
                                {resolvingHold ? <BrandLoader size="sm" /> : "Resolve Check"}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Resolve & Return Funds</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                      {hold.status === 'returned' && hold.actual_return_date && (
                        <div className="text-right flex-shrink-0">
                          <span className="text-[10px] uppercase font-bold text-green-700 bg-green-200 px-2 py-1 rounded">
                            Returned on {format(new Date(hold.actual_return_date), "MMM d, yyyy")}
                          </span>
                        </div>
                      )}
                    </div>
                  </Alert>
                ))}
              </div>
            </div>
          )}

          {/* Delivery Details Section */}
          {order.deliveries && order.deliveries.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Delivery Info
              </h4>
              <div className="bg-slate-50 border rounded-lg p-3 text-sm grid grid-cols-2 gap-y-2 gap-x-4">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Delivery Ref</span>
                  <span className="font-mono text-slate-700">{order.deliveries[0].delivery_number || "N/A"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Supplier Invoice</span>
                  <span className="font-mono text-slate-700">{order.deliveries[0].company_invoice_number || "N/A"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Vehicle</span>
                  <span className="font-bold">{order.deliveries[0].vehicle_number || "N/A"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Driver</span>
                  <span className="font-bold">{order.deliveries[0].driver_name || "N/A"}</span>
                </div>
                {order.deliveries[0].notes && (
                  <div className="col-span-2 mt-1 pt-2 border-t border-slate-200">
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Remarks</span>
                    <span className="italic text-xs">{order.deliveries[0].notes}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="grid grid-cols-1 gap-4 text-sm bg-secondary/20 p-3 rounded">
            {order.notes ? (
              <div>
                <span className="text-muted-foreground block mb-1">Notes</span>
                <p className="italic text-muted-foreground">{order.notes}</p>
              </div>
            ) : (
              <span className="text-muted-foreground block mb-1">No additional notes provided.</span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
