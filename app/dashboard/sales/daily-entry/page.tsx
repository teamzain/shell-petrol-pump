"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { getTodayPKT, cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import {
  ArrowLeft, ArrowRight, Save, Droplet, CreditCard,
  Receipt, Wallet, Calculator, AlertCircle, Plus, Trash2, CheckCircle2
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { BrandLoader } from "@/components/ui/brand-loader"
import { Separator } from "@/components/ui/separator"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table"

import { saveLubricantSale, finalizeDailySummary, getOpeningBalances, getNozzleReadingForDate } from "@/app/actions/sales-daily"
import { Lock } from "lucide-react"

export default function DailyEntryPage() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  // --- State ---
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [date, setDate] = useState(getTodayPKT())
  const [user, setUser] = useState<string | null>(null)

  // Master Data
  const [nozzles, setNozzles] = useState<any[]>([])
  const [lubricants, setLubricants] = useState<any[]>([])
  const [paymentMethods, setPaymentMethods] = useState<any[]>([])
  const [tanks, setTanks] = useState<any[]>([])

  // Form Data
  const [readings, setReadings] = useState<Record<string, { opening: number, closing: number, price: number, locked: boolean }>>({})
  const [lubeSales, setLubeSales] = useState<any[]>([])
  const [cardPayments, setCardPayments] = useState<Record<string, number>>({})
  const [dailyStatus, setDailyStatus] = useState({ openingCash: 0, openingBank: 0 })

  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    init()
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (date && isMounted) {
      fetchOpeningData()
    }
  }, [date, isMounted])

  const init = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user?.id || null)

      // Parallel fetch master data
      const [nozzlesRes, productsRes, paymentsRes, tanksRes] = await Promise.all([
        supabase.from('nozzles').select('*, dispensers(name, tank_id), products(name, selling_price)').eq('status', 'active'),
        supabase.from('products').select('*').eq('type', 'oil').eq('status', 'active'),
        supabase.from('payment_methods').select('*').eq('is_active', true),
        supabase.from('tanks').select('*')
      ])

      setNozzles(nozzlesRes.data || [])
      setLubricants(productsRes.data || [])
      setPaymentMethods(paymentsRes.data || [])
      setTanks(tanksRes.data || [])

    } catch (err: any) {
      toast({ title: "Initialization Error", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const fetchOpeningData = async () => {
    try {
      // Fetch opening readings and check for existing closing readings
      const newReadings: Record<string, any> = {}
      for (const nozzle of nozzles) {
        const { data: opening } = await supabase.rpc('get_opening_reading', {
          p_nozzle_id: nozzle.id,
          p_date: date
        })

        const existingReading = await getNozzleReadingForDate(nozzle.id, date)

        newReadings[nozzle.id] = {
          opening: opening || 0,
          closing: existingReading?.closing_reading || opening || 0,
          price: nozzle.products?.selling_price || 0,
          locked: !!existingReading
        }
      }
      setReadings(newReadings)

      // Fetch opening balances
      const balances = await getOpeningBalances(date)
      setDailyStatus({
        openingCash: Number(balances.opening_cash),
        openingBank: Number(balances.opening_bank)
      })

    } catch (err) {
      console.error("Error fetching opening data", err)
    }
  }

  // --- Handlers ---
  const handleReadingChange = (id: string, val: string) => {
    const num = parseFloat(val) || 0
    setReadings(prev => {
      const existing = prev[id] || { opening: 0, closing: 0, price: 0, locked: false }
      return {
        ...prev,
        [id]: { ...existing, closing: num }
      }
    })
  }

  const addLubeSale = (product: any) => {
    setLubeSales([...lubeSales, {
      product_id: product.id,
      name: product.name,
      is_loose: product.lubricant_type === 'loose',
      quantity: 1,
      rate: product.selling_price,
      total_amount: product.selling_price
    }])
  }

  const updateLubeSale = (idx: number, qty: number) => {
    const newSales = [...lubeSales]
    const sale = newSales[idx]
    sale.quantity = qty
    sale.total_amount = qty * sale.rate
    setLubeSales(newSales)
  }

  const removeLubeSale = (idx: number) => setLubeSales(lubeSales.filter((_, i) => i !== idx))

  const handleCardChange = (methodId: string, amount: string) => {
    const val = parseFloat(amount) || 0
    setCardPayments(prev => ({
      ...prev,
      [methodId]: val
    }))
  }
  const fuelTotalAmount = nozzles.reduce((sum, n) => {
    const r = readings[n.id]
    if (!r) return sum
    const opening = typeof r.opening === 'number' ? r.opening : 0
    const closing = typeof r.closing === 'number' ? r.closing : 0
    const price = Number(n.products?.selling_price) || 0
    return sum + (Math.max(0, closing - opening) * price)
  }, 0)
  const lubeTotalAmount = lubeSales.reduce((sum, s) => sum + s.total_amount, 0)
  const grossSale = fuelTotalAmount + lubeTotalAmount
  const totalCardsAmount = Object.values(cardPayments).reduce((sum, val) => sum + (val || 0), 0)
  const netCashSale = grossSale - totalCardsAmount
  const closingCash = dailyStatus.openingCash + netCashSale

  // Final Save
  const handleFinish = async () => {
    setSaving(true)
    try {
      // 1. Save Nozzle Readings / Sales
      const cashMethod = paymentMethods.find(m => m.type === 'cash')?.id

      for (const nozzleId in readings) {
        const item = readings[nozzleId]
        if (item.closing > item.opening && !item.locked) {
          await supabase.rpc('save_daily_sale_v2', {
            p_sale_date: date,
            p_nozzle_id: nozzleId,
            p_closing_reading: item.closing,
            p_payment_method_id: cashMethod,
            p_expected_release_date: null,
            p_user_id: user
          })
        }
      }

      // 2. Save Lubricant Sales
      for (const sale of lubeSales) {
        await saveLubricantSale({
          sale_date: date,
          product_id: sale.product_id,
          is_loose: sale.is_loose,
          quantity: sale.quantity,
          rate: sale.rate,
          total_amount: sale.total_amount
        })
      }

      // 3. Save Card Payments (as separate entries to reconcile cash)
      for (const methodId in cardPayments) {
        const amount = cardPayments[methodId]
        if (amount > 0) {
          const method = paymentMethods.find(m => m.id === methodId)
          if (method) {
            // We insert into daily_sales directly for card payments
            // This ensures finalize_daily_status correctly calculates net_cash_sale
            const { data: saleData, error: saleError } = await supabase.from('daily_sales').insert({
              sale_date: date,
              payment_method_id: methodId,
              payment_type: method.type,
              total_amount: amount,
              liters_sold: 0,
              rate_per_liter: 0,
              card_amount: amount,
              hold_amount: amount,
              hold_status: 'pending',
              created_by: user
            }).select('id').single()

            if (saleError) throw saleError

            // Also create record in card_hold_records for tracking
            const holdDays = method.hold_days || 0
            const relDate = new Date(date)
            relDate.setDate(relDate.getDate() + holdDays)

            await supabase.from('card_hold_records').insert({
              sale_id: saleData.id,
              payment_method_id: methodId,
              payment_type: method.type,
              supplier_id: method.supplier_id,
              hold_amount: amount,
              sale_date: date,
              expected_release_date: relDate.toISOString().split('T')[0],
              created_by: user
            })
          }
        }
      }

      // 4. Finalize Daily Status (Carry Forward)
      await finalizeDailySummary(date)

      toast({ title: "Success", description: "Daily records saved and finalized!" })
      router.push("/dashboard/sales")

    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (loading || !isMounted) return <div className="h-screen flex items-center justify-center"><BrandLoader /></div>

  return (
    <div className="max-w-5xl mx-auto pb-20" suppressHydrationWarning>
      {/* Header */}
      <div className="flex items-center justify-between mb-8 border-b pb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Daily <span className="text-primary">Workflow</span></h1>
            <p className="text-muted-foreground text-sm">Follow steps to record today's sales and accounts.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-muted/30 p-2 rounded-lg border">
          <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-2">Record Date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-[160px] h-8 text-sm font-bold border-0 bg-transparent"
          />
        </div>
      </div>

      {/* Stepper Header */}
      <div className="flex justify-between mb-8 px-4">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className="flex flex-col items-center gap-2 relative z-10">
            <div className={cn(
              "h-10 w-10 rounded-full flex items-center justify-center font-bold transition-all",
              step === s ? "bg-primary text-white scale-110 shadow-lg" :
                step > s ? "bg-green-100 text-green-600" : "bg-muted text-muted-foreground"
            )}>
              {step > s ? <CheckCircle2 className="h-6 w-6" /> : s}
            </div>
            <span className={cn("text-[10px] font-bold uppercase tracking-widest", step === s ? "text-primary" : "text-muted-foreground")}>
              {s === 1 && "Nozzles"}
              {s === 2 && "Lubricants"}
              {s === 3 && "Cards"}
              {s === 4 && "Expenses"}
              {s === 5 && "Summary"}
            </span>
          </div>
        ))}
        {/* Progress Line */}
        <div className="absolute left-0 top-[148px] w-full h-[2px] bg-muted -z-0" />
      </div>

      <div className="min-h-[400px]">
        {/* STEP 1: NOZZLE READINGS */}
        {step === 1 && (
          <Card className="animate-in fade-in slide-in-from-right-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Droplet className="h-5 w-5 text-blue-500" /> Step 1: Nozzle Meter Readings
              </CardTitle>
              <CardDescription>Enter the closing meter reading for each nozzle. Opening is auto-filled.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dispenser / Nozzle</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                    <TableHead className="text-right">Sales (L)</TableHead>
                    <TableHead className="text-right">Rate (PKR)</TableHead>
                    <TableHead className="text-right">Amount (PKR)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nozzles.map(n => {
                    const r = readings[n.id] || { opening: 0, closing: 0 }
                    const opening = typeof r.opening === 'number' ? r.opening : 0
                    const closing = typeof r.closing === 'number' ? r.closing : 0
                    const price = Number(n.products?.selling_price) || 0

                    const liters = Math.max(0, closing - opening)
                    const amount = liters * price

                    return (
                      <TableRow key={n.id}>
                        <TableCell>
                          <div className="font-bold">{n.dispensers?.name}</div>
                          <div className="text-[10px] text-muted-foreground uppercase">Nozzle {n.nozzle_number}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{n.products?.name}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground" suppressHydrationWarning>
                          {opening.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right" suppressHydrationWarning>
                          <Input
                            type="number"
                            step="0.01"
                            value={closing === 0 ? "" : closing}
                            onChange={(e) => handleReadingChange(n.id, e.target.value)}
                            className="w-32 text-right ml-auto font-bold"
                          />
                        </TableCell>
                        <TableCell className="text-right font-bold text-blue-600" suppressHydrationWarning>
                          {liters.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground" suppressHydrationWarning>
                          {price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right font-black" suppressHydrationWarning>
                          {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="flex justify-between bg-muted/20">
              <div className="font-bold">Total Fuel Sale: <span className="text-primary text-xl ml-2">PKR {fuelTotalAmount.toLocaleString()}</span></div>
              <Button onClick={() => setStep(2)}>Next Step <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </CardFooter>
          </Card>
        )}

        {/* STEP 2: LUBRICANT SALES */}
        {step === 2 && (
          <Card className="animate-in fade-in slide-in-from-right-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Droplet className="h-5 w-5 text-orange-500" /> Step 2: Lubricant Sales
                </CardTitle>
                <CardDescription>Select lubricant and enter quantity sold.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="h-9 px-3 rounded-md border bg-background text-sm"
                  onChange={(e) => {
                    const p = lubricants.find(l => l.id === e.target.value)
                    if (p) addLubeSale(p)
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Add Lubricant...</option>
                  {lubricants.map(l => (
                    <option key={l.id} value={l.id}>{l.name} - {l.unit}</option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Qty (L/Unit)</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lubeSales.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground italic">No lubricants added yet.</TableCell></TableRow>
                  ) : lubeSales.map((s, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-bold">{s.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={s.is_loose ? "text-blue-600" : "text-purple-600"}>
                          {s.is_loose ? "Loose" : "Packed"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{s.rate.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={s.quantity}
                          onChange={(e) => updateLubeSale(idx, parseFloat(e.target.value) || 0)}
                          className="w-24 text-right ml-auto"
                        />
                      </TableCell>
                      <TableCell className="text-right font-bold">{s.total_amount.toLocaleString()}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeLubeSale(idx)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="flex justify-between bg-muted/20">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
              <div className="font-bold">Lube Total: <span className="text-orange-600 text-xl ml-2">PKR {lubeTotalAmount.toLocaleString()}</span></div>
              <Button onClick={() => setStep(3)}>Next Step <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </CardFooter>
          </Card>
        )}

        {/* STEP 3: CARD PAYMENTS */}
        {step === 3 && (
          <Card className="animate-in fade-in slide-in-from-right-4 max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-indigo-500" /> Step 3: Card Payments
              </CardTitle>
              <CardDescription>Enter total amount received for each card/payment method today.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {paymentMethods.filter(m => m.type !== 'cash').map((method) => (
                <div key={method.id} className="space-y-2">
                  <Label className="text-lg font-bold">{method.name}</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      className="text-2xl h-14 pl-12 font-black text-primary"
                      value={cardPayments[method.id] || ""}
                      onChange={(e) => handleCardChange(method.id, e.target.value)}
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">PKR</div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {method.type === 'shell_card' ? "This amount will be held in Shell Account balance." : "This amount will be reconciled via bank accounts."}
                  </p>
                </div>
              ))}

              {paymentMethods.filter(m => m.type !== 'cash').length === 0 && (
                <div className="text-center py-10 text-muted-foreground italic">No card payment methods configured.</div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
              <Button onClick={() => setStep(4)}>Next Step <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </CardFooter>
          </Card>
        )}

        {/* STEP 4: SUMMARY & FINALIZE */}
        {step === 4 && (
          <Card className="animate-in fade-in zoom-in-95 duration-300">
            <CardHeader className="text-center bg-slate-900 text-white rounded-t-xl py-8">
              <CardTitle className="text-3xl font-black tracking-tighter uppercase italic">Daily Cash Flow Summary</CardTitle>
              <CardDescription className="text-slate-400">Review all figures carefully before finalizing the day.</CardDescription>
            </CardHeader>
            <CardContent className="pt-8">
              <div className="grid md:grid-cols-2 gap-8">
                {/* Sales Breakdown */}
                <div className="space-y-4">
                  <h4 className="font-black text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">Sales & Revenue</h4>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span>Total Fuel Sale</span>
                    <span className="font-bold">PKR {fuelTotalAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b text-orange-600">
                    <span>Total Lubricant Sale</span>
                    <span className="font-bold">+ {lubeTotalAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b-2 border-slate-900 font-black text-lg">
                    <span>GROSS SALES</span>
                    <span>PKR {grossSale.toLocaleString()}</span>
                  </div>

                  {paymentMethods.filter(m => m.type !== 'cash').map(method => (
                    <div key={method.id} className="flex justify-between items-center py-2 border-b text-indigo-600">
                      <span>{method.name}</span>
                      <span className="font-bold">- {(cardPayments[method.id] || 0).toLocaleString()}</span>
                    </div>
                  ))}

                  <div className="flex justify-between items-center py-2 border-b text-slate-400 italic">
                    <span className="text-xs">Note: Expenses are recorded on a separate page.</span>
                  </div>
                </div>

                {/* Cash Reconciliation */}
                <div className="space-y-4 bg-muted/20 p-6 rounded-xl border-dashed border-2">
                  <h4 className="font-black text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">Cash Reconciliation</h4>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span>Net Cash Sale (Today)</span>
                    <span className="font-bold text-green-700">PKR {netCashSale.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span>Opening Cash (From Yesterday)</span>
                    <span className="font-bold">PKR {dailyStatus.openingCash.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-8 font-black text-2xl text-slate-900">
                    <div className="flex flex-col">
                      <span>CLOSING CASH</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Tomorrow's Opening</span>
                    </div>
                    <span>PKR {closingCash.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between bg-slate-100 py-6 rounded-b-xl border-t mt-4">
              <Button variant="outline" onClick={() => setStep(3)} disabled={saving}><ArrowLeft className="mr-2 h-4 w-4" /> Edit Details</Button>
              <Button
                size="lg"
                className="bg-slate-900 hover:bg-slate-800 text-white px-8 h-14 text-xl font-black rounded-xl shadow-xl hover:scale-105 transition-all"
                onClick={handleFinish}
                disabled={saving}
              >
                {saving ? <BrandLoader size="sm" /> : <><Save className="mr-3 h-6 w-6" /> FINALIZE DAY</>}
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  )
}
