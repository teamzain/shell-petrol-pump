"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { getTodayPKT } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, AlertCircle, Calendar as CalendarIcon, Droplet, CheckCircle } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { BrandLoader } from "@/components/ui/brand-loader"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

// --- Interfaces ---
interface Product {
  id: string
  name: string
  selling_price: number
}

interface Dispenser {
  id: string
  name: string
  status: string
}

interface Nozzle {
  id: string
  nozzle_number: number
  dispenser_id: string
  product_id: string
  status: string
  dispensers: Dispenser
  products: Product
  opening_reading: number
  closing_reading: string
  liters_sold: number
  amount: number
  payment_method_id: string
  expected_release_date: string
}

interface PaymentMethod {
  id: string
  name: string
  type: string
  hold_days: number
}

export default function DailySaleEntry() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  // State
  const [selectedDate, setSelectedDate] = useState<string>(getTodayPKT())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Data
  const [nozzles, setNozzles] = useState<Nozzle[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])

  // Dispenser Payment Splits (Dispenser ID -> { Method ID -> Amount })
  const [dispenserPayments, setDispenserPayments] = useState<Record<string, Record<string, string>>>({})

  // Hold configuration state
  const [holdDetails, setHoldDetails] = useState<Record<string, { expected_release_date: string }>>({})
  const [holdDialogOpen, setHoldDialogOpen] = useState(false)

  useEffect(() => {
    loadData(selectedDate)
  }, [selectedDate])

  const loadData = async (date: string) => {
    setLoading(true)
    try {
      // 1. Get payment methods
      const { data: methods, error: mErr } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('is_active', true)

      if (mErr) throw mErr
      setPaymentMethods(methods || [])

      // 2. Get active nozzles with dispenser and product info
      const { data: nData, error: nErr } = await supabase
        .from('nozzles')
        .select(`
          id, nozzle_number, status, dispenser_id, product_id,
          dispensers(id, name, status),
          products(id, name, type, selling_price, current_stock)
        `)
        .eq('status', 'active')
        .order('nozzle_number')

      if (nErr) throw nErr

      // 3. Get opening reading for each nozzle via RPC
      const defaultMethod = methods?.find(m => m.type === 'cash')?.id || ''
      const nozzlesWithOpenings = await Promise.all(
        (nData || []).map(async (nozzle: any) => {
          const { data: opening } = await supabase.rpc('get_opening_reading', {
            p_nozzle_id: nozzle.id,
            p_date: date
          })
          return {
            ...nozzle,
            opening_reading: parseFloat(opening || '0'),
            closing_reading: '',
            liters_sold: 0,
            amount: 0,
            payment_method_id: defaultMethod,
            expected_release_date: ''
          } as Nozzle
        })
      )

      setNozzles(nozzlesWithOpenings)

    } catch (err: any) {
      console.error(err)
      toast({ title: "Error loading data", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  // --- Handlers ---
  const handleClosingChange = (nozzleId: string, value: string) => {
    setNozzles(prev => prev.map(n => {
      if (n.id !== nozzleId) return n

      const closing = parseFloat(value) || 0
      const opening = n.opening_reading
      const liters = closing >= opening ? closing - opening : 0
      const amount = liters * (n.products?.selling_price || 0)

      return {
        ...n,
        closing_reading: value,
        liters_sold: liters,
        amount: amount
      }
    }))
  }

  const handleDispenserPaymentChange = (dispenserId: string, methodId: string, amount: string) => {
    setDispenserPayments(prev => ({
      ...prev,
      [dispenserId]: {
        ...(prev[dispenserId] || {}),
        [methodId]: amount
      }
    }))
  }

  const validatePayments = () => {
    // 1. Check closing >= opening
    for (const n of nozzles) {
      if (n.closing_reading && parseFloat(n.closing_reading) < n.opening_reading) {
        toast({
          title: "Invalid Reading",
          description: `Closing reading for Nozzle ${n.nozzle_number} cannot be less than opening.`,
          variant: "destructive"
        })
        return false
      }
    }

    // 2. Validate Dispenser Payment Totals
    const dispensersList = Array.from(new Set(nozzles.map(n => n.dispenser_id)))
    for (const dId of dispensersList) {
      const dNozzles = nozzles.filter(n => n.dispenser_id === dId)
      const dispenserTotal = dNozzles.reduce((sum, n) => sum + n.amount, 0)

      if (dispenserTotal > 0) {
        const pbs = dispenserPayments[dId] || {}
        const paymentTotal = Object.values(pbs).reduce((sum, val) => sum + (parseFloat(val) || 0), 0)

        if (Math.abs(dispenserTotal - paymentTotal) > 0.01) {
          const dName = dNozzles[0].dispensers.name
          toast({
            title: "Payment Mismatch",
            description: `Payment breakdown for ${dName} (Rs. ${paymentTotal.toFixed(2)}) must equal sales total (Rs. ${dispenserTotal.toFixed(2)}).`,
            variant: "destructive"
          })
          return false
        }
      }
    }

    return true
  }

  const checkHoldsAndPrompt = () => {
    if (!validatePayments()) return

    // Find all card payments across dispensers that need hold dates
    const cardPayments = []
    const dispensersList = Array.from(new Set(nozzles.map(n => n.dispenser_id)))

    for (const dId of dispensersList) {
      const pbs = dispenserPayments[dId] || {}
      for (const mId in pbs) {
        const amt = parseFloat(pbs[mId] || '0')
        const method = paymentMethods.find(m => m.id === mId)
        if (amt > 0 && method && method.type !== 'cash') {
          // Calculate default expected release date based on method hold_days
          const d = new Date(selectedDate)
          d.setDate(d.getDate() + method.hold_days)
          const defaultDate = format(d, 'yyyy-MM-dd')

          cardPayments.push({
            dispenserId: dId,
            methodId: mId,
            methodName: method.name,
            amount: amt,
            defaultDate
          })
        }
      }
    }

    if (cardPayments.length > 0) {
      // Initialize hold details if not set
      const initialHolds = { ...holdDetails }
      let updated = false
      cardPayments.forEach(cp => {
        const key = `${cp.dispenserId}_${cp.methodId}`
        if (!initialHolds[key]) {
          initialHolds[key] = { expected_release_date: cp.defaultDate }
          updated = true
        }
      })
      if (updated) setHoldDetails(initialHolds)
      setHoldDialogOpen(true)
    } else {
      saveAllSales()
    }
  }

  const saveAllSales = async () => {
    setHoldDialogOpen(false)
    setSaving(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const userId = session?.session?.user?.id

      const salesEntries = []

      for (const dId of Array.from(new Set(nozzles.map(n => n.dispenser_id)))) {
        const dNozzles = nozzles.filter(n => n.dispenser_id === dId && n.liters_sold > 0)
        let availablePayments = Object.entries(dispenserPayments[dId] || {})
          .map(([mId, amt]) => ({ mId, amount: parseFloat(amt || '0') }))
          .filter(p => p.amount > 0)

        for (const n of dNozzles) {
          let nAmountRemaining = n.amount
          // We just take the dominant payment method for this nozzle as a workaround 
          const methodToUse = availablePayments.length > 0 ? availablePayments[0].mId : paymentMethods[0].id
          const methodType = paymentMethods.find(m => m.id === methodToUse)?.type
          let rDate = null

          if (methodType !== 'cash') {
            const key = `${dId}_${methodToUse}`
            rDate = holdDetails[key]?.expected_release_date || null
          }

          salesEntries.push({
            p_sale_date: selectedDate,
            p_nozzle_id: n.id,
            p_closing_reading: parseFloat(n.closing_reading),
            p_payment_method_id: methodToUse,
            p_expected_release_date: rDate,
            p_user_id: userId || '00000000-0000-0000-0000-000000000000'
          })

          // reduce available for next
          if (availablePayments.length > 0) {
            availablePayments[0].amount -= nAmountRemaining
            if (availablePayments[0].amount <= 0) availablePayments.shift()
          }
        }
      }

      for (const entry of salesEntries) {
        const { error } = await supabase.rpc('save_daily_sale', entry)
        if (error) throw error
      }

      toast({ title: "Success", description: "Daily sales saved successfully." })
      router.push('/dashboard/sales')

    } catch (err: any) {
      console.error(err)
      toast({ title: "Error saving sales", description: err.message || "Failed to save records.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // --- Render Helpers ---
  const dispensersList = Array.from(new Set(nozzles.map(n => n.dispenser_id)))
    .map(dId => nozzles.find(n => n.dispenser_id === dId)?.dispensers)
    .filter(Boolean) as Dispenser[]

  const grandTotalLiters = nozzles.reduce((s, n) => s + n.liters_sold, 0)
  const grandTotalAmount = nozzles.reduce((s, n) => s + n.amount, 0)

  let grandTotalCash = 0
  let grandTotalCards = 0

  dispensersList.forEach(d => {
    const pbs = dispenserPayments[d.id] || {}
    paymentMethods.forEach(m => {
      const amt = parseFloat(pbs[m.id] || '0')
      if (m.type === 'cash') grandTotalCash += amt
      else grandTotalCards += amt
    })
  })

  const getNozzlesForDispenser = (dId: string) => nozzles.filter(n => n.dispenser_id === dId)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <BrandLoader size="lg" className="mb-4" />
        <p className="text-muted-foreground font-medium animate-pulse">Loading daily openings...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dashboard/sales" legacyBehavior>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">Daily Sale Entry</h1>
          </div>
          <p className="text-muted-foreground ml-10">Enter closing readings and payment breakdown per dispenser.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-10 w-[180px] font-bold"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {dispensersList.map((dispenser) => {
          const dNozzles = getNozzlesForDispenser(dispenser.id)
          const dSalesTotal = dNozzles.reduce((sum, n) => sum + n.amount, 0)

          return (
            <Card key={dispenser.id} className="overflow-hidden border-primary/10 shadow-sm">
              <div className="bg-primary/5 px-6 py-3 border-b flex justify-between items-center">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Droplet className="h-4 w-4 text-primary" />
                  {dispenser.name}
                </h3>
              </div>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 border-b">
                      <tr>
                        <th className="py-3 px-4 text-left font-medium text-muted-foreground">Nozzle</th>
                        <th className="py-3 px-4 text-right font-medium text-muted-foreground w-32">Opening</th>
                        <th className="py-3 px-4 text-right font-medium text-primary w-40">Closing</th>
                        <th className="py-3 px-4 text-right font-medium text-muted-foreground w-32">Liters Sold</th>
                        <th className="py-3 px-4 text-right font-medium text-muted-foreground w-32">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {dNozzles.map((nozzle) => (
                        <tr key={nozzle.id} className="hover:bg-muted/10 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-medium text-base">Nozzle {nozzle.nozzle_number}</div>
                            <div className="text-xs text-muted-foreground">{nozzle.products?.name} @ Rs. {nozzle.products?.selling_price}</div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                            {nozzle.opening_reading.toFixed(2)}
                            <div className="text-[10px] uppercase tracking-wider">(Auto)</div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Input
                              type="number"
                              className="w-full text-right font-mono border-primary/20 focus-visible:ring-primary shadow-inner"
                              value={nozzle.closing_reading}
                              onChange={(e) => handleClosingChange(nozzle.id, e.target.value)}
                              placeholder="0.00"
                            />
                          </td>
                          <td className="py-3 px-4 text-right font-bold">
                            {nozzle.liters_sold > 0 ? nozzle.liters_sold.toFixed(2) : "-"} L
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-primary">
                            {nozzle.amount > 0 ? `PKR ${nozzle.amount.toLocaleString()}` : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {dSalesTotal > 0 && (
                  <div className="bg-slate-50/50 p-6 border-t mt-4">
                    <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">
                      PAYMENT BREAKDOWN - {dispenser.name}
                    </h4>
                    <div className="grid gap-4 md:grid-cols-4 items-end">
                      {paymentMethods.map(method => (
                        <div key={method.id} className="space-y-2">
                          <Label className="text-xs">{method.name}</Label>
                          <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-xs">PKR</div>
                            <Input
                              type="number"
                              className="pl-9 font-mono"
                              value={dispenserPayments[dispenser.id]?.[method.id] || ""}
                              onChange={(e) => handleDispenserPaymentChange(dispenser.id, method.id, e.target.value)}
                              placeholder="0"
                            />
                          </div>
                        </div>
                      ))}

                      <div className="flex items-center h-10 px-4 rounded-md border bg-white shadow-sm gap-2">
                        <span className="text-sm font-medium text-muted-foreground w-12">Total:</span>
                        <span className={`text-lg font-bold flex-1 text-right ${Math.abs(dSalesTotal - paymentMethods.reduce((sum, m) => sum + parseFloat(dispenserPayments[dispenser.id]?.[m.id] || '0'), 0)) > 0.01
                          ? 'text-destructive'
                          : 'text-green-600'
                          }`}>
                          PKR {dSalesTotal.toLocaleString()}
                        </span>
                        {Math.abs(dSalesTotal - paymentMethods.reduce((sum, m) => sum + parseFloat(dispenserPayments[dispenser.id]?.[m.id] || '0'), 0)) < 0.01 && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Daily Summary & Save */}
      <Card className="mt-4 bg-primary/5 border-primary/20">
        <CardContent className="p-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">Total Liters</p>
              <p className="text-2xl font-black">{grandTotalLiters.toFixed(2)} L</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">Total Sale</p>
              <p className="text-2xl font-black text-primary">PKR {grandTotalAmount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">Cash</p>
              <p className="text-2xl font-black text-green-600">PKR {grandTotalCash.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">Cards (On Hold)</p>
              <p className="text-2xl font-black text-orange-500 flex items-center gap-2">
                PKR {grandTotalCards.toLocaleString()}
                {grandTotalCards > 0 && <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />}
              </p>
            </div>
          </div>

          <Button
            size="lg"
            className="w-full md:w-auto font-bold tracking-wide shadow-lg"
            onClick={checkHoldsAndPrompt}
            disabled={saving || grandTotalAmount === 0}
          >
            {saving ? <BrandLoader size="xs" className="mr-2" /> : <Save className="mr-2 h-5 w-5" />}
            Save All Sales
          </Button>
        </CardContent>
      </Card>

      {/* Card Hold Prompt Dialog */}
      <Dialog open={holdDialogOpen} onOpenChange={setHoldDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <span className="h-2 w-2 rounded-full bg-orange-500" />
              Card Payment Hold
            </DialogTitle>
            <DialogDescription>
              Please confirm the expected release dates for the card amounts.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {Object.keys(holdDetails).map(key => {
              const [dId, mId] = key.split('_')
              const method = paymentMethods.find(m => m.id === mId)
              const dispenser = dispensersList.find(d => d?.id === dId)
              const amount = parseFloat(dispenserPayments[dId]?.[mId] || '0')

              if (amount <= 0 || !method) return null

              return (
                <div key={key} className="space-y-2 p-3 bg-muted/50 rounded-lg border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold">{method.name} ({dispenser?.name})</span>
                    <span className="font-mono text-primary font-bold">PKR {amount.toLocaleString()}</span>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Expected Release Date</Label>
                    <Input
                      type="date"
                      value={holdDetails[key].expected_release_date}
                      onChange={(e) => setHoldDetails(prev => ({
                        ...prev, [key]: { expected_release_date: e.target.value }
                      }))}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {method.type === 'bank_card'
                        ? "(Bank will credit your account on this date)"
                        : "(Company will credit account on this date)"}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveAllSales} disabled={saving}>
              {saving ? <BrandLoader size="xs" /> : "Confirm & Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
