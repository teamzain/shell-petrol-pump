"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, CalendarIcon, Save } from "lucide-react"
import { setPOHoldExpectedDate } from "@/app/actions/purchase-orders"
import { toast } from "sonner"
import { format } from "date-fns"
import { getTodayPKT } from "@/lib/utils"
import { getSystemActiveDate } from "@/app/actions/balance"

interface HoldAmountPopupProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    holdRecordId: string | null
    poId: string | null
    holdAmount: number
    holdQuantity: number
    productName: string
    onSuccess: () => void
}

export function HoldAmountPopup({
    open,
    onOpenChange,
    holdRecordId,
    poId,
    holdAmount,
    holdQuantity,
    productName,
    onSuccess
}: HoldAmountPopupProps) {
    const [expectedDate, setExpectedDate] = useState<string>("")
    const [minDate, setMinDate] = useState<string>(getTodayPKT())
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        const init = async () => {
            const date = await getSystemActiveDate()
            setMinDate(date)
        }
        init()
    }, [])

    const handleSave = async () => {
        if (!expectedDate) {
            toast.error("Please select an expected date")
            return
        }

        if (!holdRecordId || !poId) return

        setLoading(true)
        try {
            await setPOHoldExpectedDate(holdRecordId, poId, expectedDate)
            toast.success(`Reminder set for ${format(new Date(expectedDate), "MMM d, yyyy")}`)
            onSuccess()
            onOpenChange(false)
        } catch (error: any) {
            toast.error(error.message || "Failed to set reminder")
        } finally {
            setLoading(false)
        }
    }

    const handleSkip = () => {
        onOpenChange(false)
        onSuccess()
    }

    const formatCurrency = (val: number) => `PKR ${Number(val).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    return (
        <Dialog open={open} onOpenChange={(val) => {
            // Prevent closing by clicking outside during loading
            if (loading) return
            onOpenChange(val)
        }}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader className="space-y-3">
                    <DialogTitle className="flex items-center gap-2 text-amber-600">
                        <AlertCircle className="h-5 w-5" />
                        Amount On Hold
                    </DialogTitle>
                    <DialogDescription className="text-base text-slate-700">
                        <span className="font-bold text-amber-700">{formatCurrency(holdAmount)}</span> is on hold for this delivery.
                        <br />
                        <span className="text-sm text-slate-500">({Number(holdQuantity).toLocaleString()} {productName} not received)</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <div className="bg-amber-50 p-3 rounded-md border border-amber-200 text-sm text-amber-800">
                        When do you expect this amount to be credited back to the supplier account?
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="expected-date">Expected Credit Date</Label>
                        <div className="relative">
                            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="expected-date"
                                type="date"
                                min={minDate} // Active system date or future only
                                className="pl-9"
                                value={expectedDate}
                                onChange={(e) => setExpectedDate(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleSkip}
                        disabled={loading}
                        className="w-full sm:w-auto"
                    >
                        Skip for Now
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSave}
                        disabled={loading || !expectedDate}
                        className="w-full sm:w-auto gap-2"
                    >
                        <Save className="h-4 w-4" />
                        {loading ? "Saving..." : "Save & Set Reminder"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
