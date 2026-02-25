"use client"

import { useState, useEffect } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, Clock, CheckCircle2, Eye } from "lucide-react"
import { getAllHolds, markHoldAsReceived } from "@/app/actions/purchase-orders"
import { toast } from "sonner"
import { differenceInDays, isPast, isToday, format } from "date-fns"
import { BrandLoader } from "@/components/ui/brand-loader"
import { PODetailModal } from "./po-detail-modal"

export function ActiveHoldsTab() {
    const [holds, setHolds] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [processingId, setProcessingId] = useState<string | null>(null)
    const [filterTab, setFilterTab] = useState("all") // all, pending, released
    const [selectedPO, setSelectedPO] = useState<string | null>(null)
    const [selectedDelivery, setSelectedDelivery] = useState<string | null>(null)

    useEffect(() => {
        loadHolds()
    }, [])

    const loadHolds = async () => {
        setLoading(true)
        try {
            const data = await getAllHolds()
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

    const getUrgency = (expectedDate: string | null, status: string) => {
        if (status === 'released') return { color: "bg-emerald-50 border-emerald-200 text-emerald-700", text: "Resolved" }
        if (!expectedDate) return { color: "bg-slate-100 border-slate-200 text-slate-800", text: "No Date Set" }

        const date = new Date(expectedDate)
        if (isPast(date) && !isToday(date)) return { color: "bg-red-50 border-red-200 text-red-700", text: "Overdue" }
        if (isToday(date)) return { color: "bg-orange-50 border-orange-200 text-orange-700", text: "Due Today" }

        const days = differenceInDays(date, new Date())
        if (days <= 2) return { color: "bg-amber-50 border-amber-200 text-amber-800", text: `Due in ${days} days` }

        return { color: "bg-blue-50 border-blue-200 text-blue-700", text: `Due ${format(date, 'MMM d')}` }
    }

    const formatCurrency = (val: number) => `PKR ${Number(val).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    const filteredHolds = holds.filter(h => {
        if (filterTab === 'pending') return h.status === 'on_hold'
        if (filterTab === 'released') return h.status === 'released'
        return true
    })

    const pendingTotal = holds.filter(h => h.status === 'on_hold').reduce((sum, h) => sum + Number(h.hold_amount), 0)

    if (loading) {
        return (
            <div className="flex justify-center items-center h-48">
                <BrandLoader size="lg" />
            </div>
        )
    }

    return (
        <div className="space-y-4 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border">
                <div className="space-y-1">
                    <h2 className="text-xl font-black uppercase text-amber-800 flex items-center gap-2">
                        <AlertCircle className="h-5 w-5" />
                        Hold Discrepancy Register
                    </h2>
                    <p className="text-sm text-slate-500 font-medium">
                        Total Pending Hold Amount: <span className="font-bold text-amber-600 font-mono tracking-tight">{formatCurrency(pendingTotal)}</span>
                    </p>
                </div>

                <Tabs value={filterTab} onValueChange={setFilterTab} className="w-full sm:w-auto">
                    <TabsList className="grid w-full grid-cols-3 sm:w-80 h-10">
                        <TabsTrigger value="all" className="font-bold text-[10px] uppercase tracking-wider">All Holds</TabsTrigger>
                        <TabsTrigger value="pending" className="font-bold text-[10px] uppercase tracking-wider text-amber-700 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-800 border-amber-200">Pending</TabsTrigger>
                        <TabsTrigger value="released" className="font-bold text-[10px] uppercase tracking-wider text-emerald-700 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-800 border-emerald-200">Resolved</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <Card className="border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50 border-b">
                            <TableRow>
                                <TableHead className="font-black text-[10px] uppercase tracking-widest">PO Number</TableHead>
                                <TableHead className="font-black text-[10px] uppercase tracking-widest">Supplier</TableHead>
                                <TableHead className="font-black text-[10px] uppercase tracking-widest">Product / Missing Qty</TableHead>
                                <TableHead className="font-black text-[10px] uppercase tracking-widest text-right">Hold Amount</TableHead>
                                <TableHead className="font-black text-[10px] uppercase tracking-widest text-center">Urgency / Status</TableHead>
                                <TableHead className="font-black text-[10px] uppercase tracking-widest text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredHolds.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                        No holds found for the selected filter.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredHolds.map((hold) => {
                                    const po = hold.purchase_orders || {}
                                    const urgency = getUrgency(hold.expected_return_date, hold.status)
                                    const isResolved = hold.status === 'released'

                                    return (
                                        <TableRow key={hold.id} className={`${isResolved ? 'bg-emerald-50/20' : 'hover:bg-slate-50'} transition-colors`}>
                                            <TableCell className="font-mono text-xs font-bold text-slate-700">
                                                {po.po_number || "-"}
                                            </TableCell>
                                            <TableCell className="font-semibold text-sm">
                                                {po.suppliers?.name || "-"}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-xs font-bold bg-slate-100 px-2 py-0.5 rounded-md w-fit whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]">
                                                        {hold.product_name || hold.product_type || "Unknown Product"}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                                        {hold.hold_quantity} Units Missing
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-black font-mono text-amber-700">
                                                {formatCurrency(hold.hold_amount)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="outline" className={`${urgency.color} font-bold uppercase tracking-wider text-[9px] px-2 py-0.5 whitespace-nowrap`}>
                                                    {isResolved ? (
                                                        <CheckCircle2 className="w-3 h-3 mr-1 inline-block" />
                                                    ) : (
                                                        <Clock className="w-3 h-3 mr-1 inline-block" />
                                                    )}
                                                    {urgency.text}
                                                </Badge>
                                                {isResolved && hold.actual_return_date && (
                                                    <div className="text-[9px] text-emerald-600/70 mt-1 font-mono">
                                                        {format(new Date(hold.actual_return_date), 'dd MMM yyyy')}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                        onClick={() => {
                                                            setSelectedPO(po.id)
                                                            setSelectedDelivery(hold.delivery_id)
                                                        }}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>

                                                    {isResolved ? (
                                                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-none font-black text-[10px] uppercase h-8 px-3">
                                                            Settled
                                                        </Badge>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleMarkReceived(hold.id)}
                                                            disabled={processingId === hold.id}
                                                            className="bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 hover:border-emerald-300 shadow-sm h-8"
                                                        >
                                                            {processingId === hold.id ? (
                                                                <BrandLoader size="sm" />
                                                            ) : (
                                                                <>
                                                                    <CheckCircle2 className="h-3 w-3 mr-1.5" />
                                                                    Resolve
                                                                </>
                                                            )}
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>

            <PODetailModal
                open={!!selectedPO}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedPO(null)
                        setSelectedDelivery(null)
                    }
                }}
                poId={selectedPO}
                deliveryId={selectedDelivery || undefined}
            />
        </div>
    )
}
