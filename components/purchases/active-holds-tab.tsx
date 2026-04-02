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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { AlertCircle, Clock, CheckCircle2, Eye, Search, XCircle, ChevronRight, MessageSquare, Calendar as CalendarIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getAllHolds, markHoldAsReceived, cancelPOHold } from "@/app/actions/purchase-orders"
import { toast } from "sonner"
import { differenceInDays, isPast, isToday, format } from "date-fns"
import { BrandLoader } from "@/components/ui/brand-loader"
import { PODetailModal } from "./po-detail-modal"

export function ActiveHoldsTab({ dateFilters }: { dateFilters?: { from: string; to: string } }) {
    const [holds, setHolds] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [processingId, setProcessingId] = useState<string | null>(null)
    const [filterTab, setFilterTab] = useState("all") // all, pending, released, cancelled
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedPO, setSelectedPO] = useState<string | null>(null)
    const [selectedDelivery, setSelectedDelivery] = useState<string | null>(null)
    const [isDateModalOpen, setIsDateModalOpen] = useState(false)
    const [holdToMark, setHoldToMark] = useState<any | null>(null)
    const [receivedDate, setReceivedDate] = useState<Date>(new Date())
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
    const [holdToCancel, setHoldToCancel] = useState<any | null>(null)
    const [cancelReason, setCancelReason] = useState("")

    useEffect(() => {
        loadHolds()
    }, [dateFilters])

    const loadHolds = async () => {
        setLoading(true)
        try {
            const data = await getAllHolds({
                date_from: dateFilters?.from,
                date_to: dateFilters?.to
            })
            setHolds(data || [])
        } catch (error) {
            console.error("Failed to load holds:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleMarkReceived = async (holdId: string, date: Date) => {
        setProcessingId(holdId)
        try {
            const dateStr = format(date, 'yyyy-MM-dd')
            await markHoldAsReceived(holdId, dateStr)
            toast.success("Hold marked as received and account credited.")
            loadHolds()
            setIsDateModalOpen(false)
        } catch (error: any) {
            toast.error(error.message || "Failed to process hold return")
        } finally {
            setProcessingId(null)
        }
    }

    const handleCancelHold = async () => {
        if (!holdToCancel || !cancelReason.trim()) {
            toast.error("Please provide a reason for cancellation.")
            return
        }

        setProcessingId(holdToCancel.id)
        try {
            await cancelPOHold(holdToCancel.id, cancelReason)
            toast.success("Hold record has been cancelled.")
            loadHolds()
            setIsCancelModalOpen(false)
            setCancelReason("")
            setHoldToCancel(null)
        } catch (error: any) {
            toast.error(error.message || "Failed to cancel hold")
        } finally {
            setProcessingId(null)
        }
    }

    const getUrgency = (expectedDate: string | null, status: string) => {
        if (status === 'released') return { color: "bg-emerald-50 border-emerald-200 text-emerald-700", text: "Resolved" }
        if (status === 'cancelled') return { color: "bg-slate-50 border-slate-200 text-slate-700", text: "Cancelled" }
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
        // Tab filtering
        if (filterTab === 'pending' && h.status !== 'on_hold') return false
        if (filterTab === 'released' && h.status !== 'released') return false
        if (filterTab === 'cancelled' && h.status !== 'cancelled') return false

        // Search filtering
        const poNum = h.purchase_orders?.po_number?.toLowerCase() || ""
        const supplier = h.purchase_orders?.suppliers?.name?.toLowerCase() || ""
        const query = searchQuery.toLowerCase()

        return poNum.includes(query) || supplier.includes(query)
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

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search PO# or Supplier..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-10 rounded-lg border-slate-200"
                        />
                    </div>

                    <Tabs value={filterTab} onValueChange={setFilterTab} className="w-full sm:w-auto">
                        <TabsList className="grid w-full grid-cols-4 sm:w-[360px] h-10">
                            <TabsTrigger value="all" className="font-bold text-[10px] uppercase tracking-wider">All</TabsTrigger>
                            <TabsTrigger value="pending" className="font-bold text-[10px] uppercase tracking-wider text-amber-700 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-800">Pending</TabsTrigger>
                            <TabsTrigger value="released" className="font-bold text-[10px] uppercase tracking-wider text-emerald-700 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-800">Received</TabsTrigger>
                            <TabsTrigger value="cancelled" className="font-bold text-[10px] uppercase tracking-wider text-slate-600 data-[state=active]:bg-slate-100 data-[state=active]:text-slate-800">Canceled</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </div>

            <Card className="border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50 border-b">
                            <TableRow>
                                <TableHead className="font-black text-[10px] uppercase tracking-widest">PO Number</TableHead>
                                <TableHead className="font-black text-[10px] uppercase tracking-widest">Order Date</TableHead>
                                <TableHead className="font-black text-[10px] uppercase tracking-widest">Supplier</TableHead>
                                <TableHead className="font-black text-[10px] uppercase tracking-widest text-center">Days Due</TableHead>
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
                                    const isCancelled = hold.status === 'cancelled'

                                    return (
                                        <TableRow key={hold.id} className={`${isResolved ? 'bg-emerald-50/20' : isCancelled ? 'bg-slate-50/50' : 'hover:bg-slate-50'} transition-colors`}>
                                            <TableCell className="font-mono text-xs font-bold text-slate-700">
                                                {po.po_number || "-"}
                                            </TableCell>
                                            <TableCell className="text-xs text-slate-500 font-medium">
                                                {po.created_at ? format(new Date(po.created_at), 'dd MMM yyyy') : "-"}
                                            </TableCell>
                                            <TableCell className="font-semibold text-sm">
                                                {po.suppliers?.name || "-"}
                                            </TableCell>
                                            <TableCell className="text-center font-bold text-xs">
                                                <Badge variant="secondary" className={`${isResolved ? 'bg-emerald-100 text-emerald-800' : isCancelled ? 'bg-slate-100 text-slate-500' : 'bg-slate-100 text-slate-700'} hover:opacity-80 border-none whitespace-nowrap`}>
                                                    {isResolved && hold.actual_return_date ? (
                                                        `Received in ${Math.abs(differenceInDays(new Date(hold.actual_return_date), new Date(po.created_at || hold.created_at)))} Days`
                                                    ) : isCancelled ? (
                                                        "Closed / Cancelled"
                                                    ) : (
                                                        `${Math.abs(differenceInDays(new Date(), new Date(po.created_at || hold.created_at)))} Days`
                                                    )}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-black font-mono text-amber-700">
                                                {formatCurrency(hold.hold_amount)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="outline" className={`${urgency.color} font-bold uppercase tracking-wider text-[9px] px-2 py-0.5 whitespace-nowrap`}>
                                                    {isResolved ? (
                                                        <CheckCircle2 className="w-3 h-3 mr-1 inline-block" />
                                                    ) : isCancelled ? (
                                                        <XCircle className="w-3 h-3 mr-1 inline-block" />
                                                    ) : (
                                                        <Clock className="w-3 h-3 mr-1 inline-block" />
                                                    )}
                                                    {isResolved ? "Received" : isCancelled ? "Cancelled" : urgency.text}
                                                </Badge>
                                                {isResolved && hold.actual_return_date && (
                                                    <div className="text-[9px] text-emerald-600/70 mt-1 font-mono uppercase tracking-tighter">
                                                        Received: {format(new Date(hold.actual_return_date), 'dd MMM yyyy')}
                                                    </div>
                                                )}
                                                {isCancelled && hold.cancel_reason && (
                                                    <div className="text-[9px] text-slate-500 mt-1 italic max-w-[120px] line-clamp-1 mx-auto" title={hold.cancel_reason}>
                                                        {hold.cancel_reason}
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
                                                            Received
                                                        </Badge>
                                                    ) : isCancelled ? (
                                                        <Badge variant="outline" className="text-slate-400 border-slate-200 font-bold text-[10px] uppercase h-8 px-3 italic">
                                                            Cancelled
                                                        </Badge>
                                                    ) : (
                                                        <div className="flex items-center gap-1">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => {
                                                                    setHoldToCancel(hold)
                                                                    setCancelReason("")
                                                                    setIsCancelModalOpen(true)
                                                                }}
                                                                disabled={processingId === hold.id}
                                                                className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 h-8 px-2"
                                                                title="Cancel Hold"
                                                            >
                                                                <XCircle className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                onClick={() => {
                                                                    setHoldToMark(hold)
                                                                    setReceivedDate(new Date())
                                                                    setIsDateModalOpen(true)
                                                                }}
                                                                disabled={processingId === hold.id}
                                                                className="bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 hover:border-emerald-300 shadow-sm h-8"
                                                            >
                                                                {processingId === hold.id ? (
                                                                    <BrandLoader size="sm" />
                                                                ) : (
                                                                    <>
                                                                        <CheckCircle2 className="h-3 w-3 mr-1.5" />
                                                                        Mark As Read
                                                                    </>
                                                                )}
                                                            </Button>
                                                        </div>
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

            <Dialog open={isDateModalOpen} onOpenChange={setIsDateModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-emerald-700">
                            <CheckCircle2 className="h-5 w-5" />
                            Mark Hold as Received
                        </DialogTitle>
                        <DialogDescription>
                            Please select the actual date when this hold discrepancy was resolved/received from the supplier.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="py-4 space-y-4">
                        {holdToMark && (
                            <div className="bg-slate-50 p-3 rounded-lg border text-sm space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-slate-500 font-medium">PO Number:</span>
                                    <span className="font-mono font-bold text-slate-700">{holdToMark.purchase_orders?.po_number}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500 font-medium">Supplier:</span>
                                    <span className="font-bold text-slate-700">{holdToMark.purchase_orders?.suppliers?.name}</span>
                                </div>
                                <div className="flex justify-between border-t pt-1 mt-1">
                                    <span className="text-slate-500 font-medium">Hold Amount:</span>
                                    <span className="font-black text-amber-700 font-mono">{formatCurrency(holdToMark.hold_amount)}</span>
                                </div>
                            </div>
                        )}

                        <div className="grid gap-2">
                            <Label htmlFor="receive-date" className="font-bold text-xs uppercase tracking-wider text-slate-500">
                                Date of Receipt
                            </Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal h-11 rounded-xl border-slate-200",
                                            !receivedDate && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4 text-emerald-600" />
                                        {receivedDate ? format(receivedDate, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={receivedDate}
                                        onSelect={(date) => date && setReceivedDate(date)}
                                        initialFocus
                                        disabled={(date) => date > new Date()}
                                    />
                                </PopoverContent>
                            </Popover>
                            <p className="text-[10px] text-muted-foreground italic">
                                * This date will be used for financial accounting and transaction records.
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="sm:justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setIsDateModalOpen(false)}
                            className="font-bold"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={() => holdToMark && handleMarkReceived(holdToMark.id, receivedDate)}
                            disabled={!receivedDate || processingId === holdToMark?.id}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6"
                        >
                            {processingId === holdToMark?.id ? (
                                <BrandLoader size="sm" />
                            ) : (
                                "Record Receipt"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isCancelModalOpen} onOpenChange={setIsCancelModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-700">
                            <XCircle className="h-5 w-5" />
                            Cancel Hold Discrepancy
                        </DialogTitle>
                        <DialogDescription>
                            This will close the record without any refund to the supplier account. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4 space-y-4">
                        {holdToCancel && (
                            <div className="bg-red-50/50 p-3 rounded-lg border border-red-100 text-sm space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-slate-500 font-medium">Record:</span>
                                    <span className="font-bold text-slate-700">PO #{holdToCancel.purchase_orders?.po_number} | {holdToCancel.product_name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500 font-medium">Amount to Forfeit:</span>
                                    <span className="font-bold text-red-700">{formatCurrency(holdToCancel.hold_amount)}</span>
                                </div>
                            </div>
                        )}

                        <div className="grid gap-2">
                            <Label htmlFor="cancel-reason" className="font-bold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                <MessageSquare className="h-3 w-3" /> Reason for Cancellation
                            </Label>
                            <Textarea
                                id="cancel-reason"
                                placeholder="e.g., Short quantity accepted by management, Supplier refused refund..."
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                className="min-h-[100px] rounded-xl"
                            />
                        </div>
                    </div>

                    <DialogFooter className="sm:justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setIsCancelModalOpen(false)}
                            className="font-bold"
                        >
                            Back
                        </Button>
                        <Button
                            type="button"
                            onClick={handleCancelHold}
                            disabled={!cancelReason.trim() || processingId === holdToCancel?.id}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold px-6"
                        >
                            {processingId === holdToCancel?.id ? (
                                <BrandLoader size="sm" />
                            ) : (
                                "Confirm Cancellation"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
