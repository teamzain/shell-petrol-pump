"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertCircle, Clock, CheckCircle2, CreditCard } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/components/ui/use-toast"
import { differenceInDays, isPast, isToday, format } from "date-fns"
import { BrandLoader } from "@/components/ui/brand-loader"

export function SalesHoldAlerts({ onlyToday = false }: { onlyToday?: boolean }) {
    const { toast } = useToast()
    const supabase = createClient()

    const [holds, setHolds] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [processingId, setProcessingId] = useState<string | null>(null)
    const [sessionUser, setSessionUser] = useState<string>("")

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setSessionUser(data.session?.user?.id || ''))
        loadHolds()
    }, [])

    const loadHolds = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('card_hold_records')
                .select(`
                    id, sale_date, hold_amount, expected_release_date, status, payment_type,
                    payment_methods(name), suppliers(name)
                `)
                .eq('status', 'on_hold')
                .order('expected_release_date', { ascending: true })

            if (error) throw error
            setHolds(data || [])
        } catch (error) {
            console.error("Failed to load sales holds:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleMarkReleased = async (holdId: string) => {
        setProcessingId(holdId)
        try {
            const { error } = await supabase.rpc('release_card_hold', {
                p_hold_id: holdId,
                p_user_id: sessionUser || '00000000-0000-0000-0000-000000000000'
            })
            if (error) throw error

            toast({ title: "Success", description: "Card hold marked as released." })
            loadHolds()
        } catch (error: any) {
            toast({ title: "Release Failed", description: error.message, variant: "destructive" })
        } finally {
            setProcessingId(null)
        }
    }

    if (loading) {
        return (
            <Card className="border-orange-200">
                <CardHeader className="pb-3">
                    <CardTitle className="text-orange-800 text-lg flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Card Holds Pending
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
        if (!expectedDate) return { color: "bg-slate-100 border-slate-200 text-slate-800", text: "No Date" }

        const date = new Date(expectedDate)
        const today = new Date()
        today.setHours(0, 0, 0, 0) // Normalize

        if (isPast(date) && !isToday(date)) return { color: "bg-red-50 border-red-200 text-red-700", text: "Overdue" }
        if (isToday(date)) return { color: "bg-orange-50 border-orange-200 text-orange-700", text: "Due Today" }

        const days = differenceInDays(date, today)
        if (days <= 3) return { color: "bg-yellow-50 border-yellow-200 text-yellow-800", text: `Due in ${days} days` }

        return { color: "bg-green-50 border-green-200 text-green-700", text: `Due ${format(date, 'MMM d')}` }
    }

    const formatCurrency = (val: number) => `PKR ${Number(val).toLocaleString("en-PK")}`

    let displayHolds = holds
    if (onlyToday) {
        displayHolds = holds.filter(hold => {
            const u = getUrgency(hold.expected_release_date)
            return u.text === "Overdue" || u.text === "Due Today" || u.text.includes("Due in") // Show up to 3 days out on dashboard
        })
    }

    if (displayHolds.length === 0) return null;

    return (
        <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
                <CreditCard className="h-4 w-4" /> Card Reconciliations
            </h3>
            {displayHolds.map((hold) => {
                const urgency = getUrgency(hold.expected_release_date)

                return (
                    <Card key={hold.id} className={`border ${urgency.color} shadow-sm transition-all hover:shadow-md`}>
                        <CardContent className="p-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className={`${urgency.color} font-bold uppercase tracking-wider text-[10px]`}>
                                            <Clock className="w-3 h-3 mr-1 inline-block" />
                                            {urgency.text}
                                        </Badge>
                                        <span className="font-mono text-xs font-bold text-slate-500">
                                            Sale: {format(new Date(hold.sale_date), 'dd MMM yyyy')}
                                        </span>
                                    </div>
                                    <h4 className="font-bold text-base flex items-center gap-2">
                                        {formatCurrency(hold.hold_amount)} Hold
                                    </h4>
                                    <p className="text-sm opacity-80">
                                        {hold.payment_methods.name} {hold.payment_type === 'supplier_card' && hold.suppliers ? `(${hold.suppliers.name})` : ''}
                                    </p>
                                </div>
                                <div className="flex shrink-0">
                                    <Button
                                        onClick={() => handleMarkReleased(hold.id)}
                                        disabled={processingId === hold.id}
                                        className="w-full sm:w-auto bg-white/50 hover:bg-white text-emerald-700 border border-emerald-200 hover:border-emerald-300 shadow-sm"
                                        size="sm"
                                    >
                                        {processingId === hold.id ? (
                                            <BrandLoader size="sm" />
                                        ) : (
                                            <>
                                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                                Receipt Confirmed
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
