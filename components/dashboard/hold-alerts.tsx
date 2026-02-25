"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertCircle, Clock, CheckCircle2 } from "lucide-react"
import { getPendingHolds, markHoldAsReceived } from "@/app/actions/purchase-orders"
import { toast } from "sonner"
import { differenceInDays, isPast, isToday, format } from "date-fns"
import { BrandLoader } from "@/components/ui/brand-loader"

export function HoldAlerts({ onlyToday = false }: { onlyToday?: boolean }) {
    const [holds, setHolds] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [processingId, setProcessingId] = useState<string | null>(null)

    useEffect(() => {
        loadHolds()
    }, [])

    const loadHolds = async () => {
        try {
            const data = await getPendingHolds()
            setHolds(data || [])
        } catch (error) {
            console.error("Failed to load holds:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleMarkReceived = async (holdId: string) => {
        setProcessingId(holdId)
        try {
            await markHoldAsReceived(holdId)
            toast.success("Hold marked as received and account credited.")
            loadHolds()
        } catch (error: any) {
            toast.error(error.message || "Failed to process hold return")
        } finally {
            setProcessingId(null)
        }
    }

    if (loading) {
        return (
            <Card className="border-amber-200">
                <CardHeader className="pb-3">
                    <CardTitle className="text-amber-800 text-lg flex items-center gap-2">
                        <AlertCircle className="h-5 w-5" />
                        Pending Holds
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex justify-center py-6">
                    <BrandLoader size="sm" />
                </CardContent>
            </Card>
        )
    }

    if (holds.length === 0) {
        return null // Don't show if no holds
    }

    const getUrgency = (expectedDate: string | null) => {
        if (!expectedDate) return { color: "bg-slate-100 border-slate-200 text-slate-800", text: "No Date Set" }

        const date = new Date(expectedDate)
        if (isPast(date) && !isToday(date)) return { color: "bg-red-50 border-red-200 text-red-700", text: "Overdue" }
        if (isToday(date)) return { color: "bg-orange-50 border-orange-200 text-orange-700", text: "Due Today" }

        const days = differenceInDays(date, new Date())
        if (days <= 2) return { color: "bg-yellow-50 border-yellow-200 text-yellow-800", text: `Due in ${days} days` }

        return { color: "bg-green-50 border-green-200 text-green-700", text: `Due ${format(date, 'MMM d')}` }
    }

    const formatCurrency = (val: number) => `PKR ${Number(val).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    let displayHolds = holds
    if (onlyToday) {
        displayHolds = holds.filter(hold => {
            const u = getUrgency(hold.expected_return_date)
            return u.text === "Overdue" || u.text === "Due Today"
        })
    }

    if (displayHolds.length === 0) return null;

    return (
        <div className="space-y-4">
            {displayHolds.map((hold) => {
                const po = hold.purchase_orders || {}
                const urgency = getUrgency(hold.expected_return_date)

                return (
                    <Card key={hold.id} className={`border ${urgency.color} shadow-sm transition-all hover:shadow-md`}>
                        <CardContent className="p-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className={`${urgency.color} font-semibold uppercase tracking-wider text-[10px]`}>
                                            <Clock className="w-3 h-3 mr-1 inline-block" />
                                            {urgency.text}
                                        </Badge>
                                        <span className="font-mono text-xs font-bold text-slate-500">
                                            {po.po_number}
                                        </span>
                                    </div>
                                    <h4 className="font-bold text-base">
                                        {formatCurrency(hold.hold_amount)} Hold
                                    </h4>
                                    <p className="text-sm opacity-80">
                                        {po.suppliers?.name} &bull; {hold.hold_quantity} Liters/Units of {hold.product_name || po.products?.name || 'Product'} missing
                                    </p>
                                </div>
                                <div className="flex shrink-0">
                                    <Button
                                        onClick={() => handleMarkReceived(hold.id)}
                                        disabled={processingId === hold.id}
                                        className="w-full sm:w-auto bg-white/50 hover:bg-white text-emerald-700 border border-emerald-200 hover:border-emerald-300"
                                    >
                                        {processingId === hold.id ? (
                                            <BrandLoader size="sm" />
                                        ) : (
                                            <>
                                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                                Mark as Received
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    )
}
