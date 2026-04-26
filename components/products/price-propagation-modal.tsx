"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertCircle, FileText, CheckCircle2 } from "lucide-react"
import { BrandLoader } from "../ui/brand-loader"
import { getAffectedPurchaseOrders, updatePOPricePropagation } from "@/app/actions/purchase-orders"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"

interface PricePropagationModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    productId: string | null
    newPrice: number | null
    onComplete: () => void
}

export function PricePropagationModal({ open, onOpenChange, productId, newPrice, onComplete }: PricePropagationModalProps) {
    const [loading, setLoading] = useState(false)
    const [updating, setUpdating] = useState(false)
    const [affectedPOs, setAffectedPOs] = useState<any[]>([])

    useEffect(() => {
        if (open && productId && newPrice) {
            fetchAffectedPOs()
        }
    }, [open, productId, newPrice])

    const fetchAffectedPOs = async () => {
        setLoading(true)
        try {
            const pos = await getAffectedPurchaseOrders(productId!)
            setAffectedPOs(pos)
        } catch (error) {
            console.error("Failed to fetch affected POs:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleUpdateAll = async () => {
        if (!productId || !newPrice || affectedPOs.length === 0) return

        setUpdating(true)
        try {
            const poIds = affectedPOs.map(po => po.id)
            await updatePOPricePropagation(poIds, productId, newPrice)
            toast.success("Purchase orders successfully updated with new price")
            onComplete()
            onOpenChange(false)
        } catch (error) {
            console.error(error)
            toast.error("Failed to update purchase orders")
        } finally {
            setUpdating(false)
        }
    }

    const handleSkip = () => {
        onComplete()
        onOpenChange(false)
    }

    const pendingPOs = affectedPOs.filter(po => po.status === 'pending')
    const partialPOs = affectedPOs.filter(po => po.status === 'partially_delivered')

    return (
        <Dialog open={open} onOpenChange={(val) => { if (!updating) onOpenChange(val) }}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-primary">
                        <AlertCircle className="h-5 w-5" />
                        Update Pending Purchase Orders?
                    </DialogTitle>
                    <DialogDescription>
                        You just updated the purchase price of this product.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center items-center py-8">
                        <BrandLoader />
                    </div>
                ) : affectedPOs.length === 0 ? (
                    <div className="py-6 text-center space-y-4">
                        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
                        <p className="text-muted-foreground font-medium">No pending purchase orders contain this product.</p>
                        <Button onClick={handleSkip} className="w-full">Continue</Button>
                    </div>
                ) : (
                    <div className="space-y-4 py-2">
                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                            <p className="text-amber-800 text-sm mb-3">
                                We found <strong>{affectedPOs.length}</strong> purchase order(s) containing this product with the old price. Would you like to update the price for the remaining undelivered quantities?
                            </p>
                            
                            <div className="space-y-2">
                                {pendingPOs.length > 0 && (
                                    <div className="flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-slate-500" />
                                            <span>Pending Orders</span>
                                        </div>
                                        <Badge variant="secondary">{pendingPOs.length}</Badge>
                                    </div>
                                )}
                                {partialPOs.length > 0 && (
                                    <div className="flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-slate-500" />
                                            <span>Partially Delivered</span>
                                        </div>
                                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">{partialPOs.length}</Badge>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <p className="text-xs text-muted-foreground">
                            * Already-delivered quantities in partial orders will retain their original price to preserve historical accuracy. Only the remaining pending quantity will be updated.
                        </p>

                        <DialogFooter className="gap-2 sm:gap-0 mt-4">
                            <Button variant="outline" onClick={handleSkip} disabled={updating}>
                                No, Keep Old Price
                            </Button>
                            <Button onClick={handleUpdateAll} disabled={updating}>
                                {updating ? <BrandLoader size="sm" /> : "Yes, Update All Remaining"}
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
