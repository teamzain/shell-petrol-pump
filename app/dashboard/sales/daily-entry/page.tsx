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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { saveLubricantSale, finalizeDailySummary, getOpeningBalances, getNozzleReadingForDate, saveNozzleReadings, saveCardPaymentsBulk } from "@/app/actions/sales-daily"
import { Lock, Loader2 } from "lucide-react"

export default function DailyEntryPage() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  // --- State ---
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [date, setDate] = useState(getTodayPKT())
  const [user, setUser] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("fuel")

  // Master Data
  const [nozzles, setNozzles] = useState<any[]>([])
  const [lubricants, setLubricants] = useState<any[]>([])
  const [paymentMethods, setPaymentMethods] = useState<any[]>([])
  const [tanks, setTanks] = useState<any[]>([])
  const [bankCards, setBankCards] = useState<any[]>([])
  const [supplierCards, setSupplierCards] = useState<any[]>([])

  // Form Data
  const [readings, setReadings] = useState<Record<string, { opening: number, closing: number, price: number, locked: boolean }>>({})
  const [lubeSales, setLubeSales] = useState<any[]>([])
  const [cardEntries, setCardEntries] = useState<any[]>([
    { id: Math.random().toString(), methodId: "", amount: 0, bankCardId: "", supplierCardId: "" }
  ])
  const [dailyStatus, setDailyStatus] = useState({ openingCash: 0, openingBank: 0 })

  const [savedSteps, setSavedSteps] = useState<string[]>([])
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    init()
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (date && isMounted && nozzles.length > 0) {
      fetchOpeningData()
    }
  }, [date, isMounted, nozzles])

  const init = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user?.id || null)

      // Parallel fetch master data
      const [nozzlesRes, productsRes, paymentsRes, tanksRes, bankCardsRes, supplierCardsRes] = await Promise.all([
        supabase.from('nozzles').select('*, dispensers(name, tank_id), products(name, selling_price)').eq('status', 'active'),
        supabase.from('products').select('*').eq('type', 'oil').eq('status', 'active'),
        supabase.from('payment_methods').select('*').eq('is_active', true),
        supabase.from('tanks').select('*'),
        supabase.from('bank_cards').select('*, bank_accounts(bank_name)').eq('is_active', true).order('card_name'),
        supabase.from('supplier_cards').select('*, suppliers(name)').eq('is_active', true).order('card_name')
      ])

      setNozzles(nozzlesRes.data || [])
      setLubricants(productsRes.data || [])
      setPaymentMethods(paymentsRes.data || [])
      setTanks(tanksRes.data || [])
      setBankCards(bankCardsRes.data || [])
      setSupplierCards(supplierCardsRes.data || [])

    } catch (err: any) {
      toast({ title: "Initialization Error", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const fetchOpeningData = async () => {
    try {
      // Parallelize fetching data for all nozzles
      const nozzleDataResults = await Promise.all(nozzles.map(async (nozzle) => {
        const [openingRes, existingRes] = await Promise.all([
          supabase.rpc('get_opening_reading', {
            p_nozzle_id: nozzle.id,
            p_date: date
          }),
          getNozzleReadingForDate(nozzle.id, date)
        ])

        return {
          id: nozzle.id,
          opening: openingRes.data || 0,
          closing: existingRes?.closing_reading || 0,
          price: Number(nozzle.products?.selling_price) || 0,
          locked: !!existingRes
        }
      }))

      const newReadings: Record<string, any> = {}
      nozzleDataResults.forEach(data => {
        newReadings[data.id] = {
          opening: data.opening,
          closing: data.closing,
          price: data.price,
          locked: data.locked
        }
      })

      setReadings(newReadings)

      // Parallel fetch Lubricant and Card sales
      const [lubeRes, cardsRes] = await Promise.all([
        supabase.from('lubricant_sales').select('*').eq('sale_date', date),
        supabase.from('daily_sales').select('*').eq('sale_date', date).neq('payment_type', 'cash')
      ])

      if (lubeRes.data) {
        setLubeSales(lubeRes.data.map(s => {
          const product = lubricants.find(p => p.id === s.product_id)
          return {
            product_id: s.product_id,
            name: product?.name || "Unknown Product",
            is_loose: s.is_loose,
            quantity: Number(s.quantity),
            rate: Number(s.rate),
            total_amount: Number(s.total_amount)
          }
        }))
        if (lubeRes.data.length > 0) setSavedSteps(prev => [...new Set([...prev, "lubes"])])
      } else {
        setLubeSales([])
      }

      if (cardsRes.data) {
        setCardEntries(cardsRes.data.map(s => ({
          id: s.id,
          methodId: s.payment_method_id,
          amount: Number(s.total_amount),
          bankCardId: s.bank_card_id || "",
          supplierCardId: s.supplier_card_id || ""
        })))
        if (cardsRes.data.length > 0) setSavedSteps(prev => [...new Set([...prev, "cards"])])
      } else {
        setCardEntries([])
      }

      if (nozzleDataResults.some(r => r.locked)) {
        setSavedSteps(prev => [...new Set([...prev, "fuel"])])
      }

      // Fetch opening balances
      const balances = await getOpeningBalances(date)
      setDailyStatus({
        openingCash: Number(balances.opening_cash),
        openingBank: Number(balances.opening_bank)
      })

    } catch (err: any) {
      console.error("Error fetching opening data", err)
      toast({
        title: "Error fetching data",
        description: "Failed to load opening readings or balances. Please try refreshing or re-selecting the date.",
        variant: "destructive"
      })
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

  const addCardEntry = () => {
    setCardEntries([...cardEntries, { id: Math.random().toString(), methodId: "", amount: 0, bankCardId: "", supplierCardId: "" }])
  }

  const removeCardEntry = (id: string) => {
    setCardEntries(cardEntries.filter(e => e.id !== id))
  }

  const updateCardEntry = (id: string, updates: any) => {
    setCardEntries(cardEntries.map(e => e.id === id ? { ...e, ...updates } : e))
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
  const totalCardsAmount = cardEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0)
  const netCashSale = grossSale - totalCardsAmount
  const closingCash = dailyStatus.openingCash + netCashSale

  // --- Step Savers ---

  const handleSaveNozzles = async () => {
    setSaving(true)
    try {
      await saveNozzleReadings(date, readings)
      setSavedSteps(prev => [...new Set([...prev, "fuel"])])
      toast({ title: "Nozzle Readings Saved", description: "Fuel sales recorded successfully." })
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveLubricants = async () => {
    setSaving(true)
    try {
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
      setSavedSteps(prev => [...new Set([...prev, "lubes"])])
      toast({ title: "Lubricant Sales Saved", description: "Lubricant sales recorded successfully." })
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveCards = async () => {
    setSaving(true)
    try {
      const validEntries = cardEntries.filter(e => e.methodId && e.amount > 0)
      if (validEntries.length === 0) {
        toast({ title: "No Entries", description: "Please add valid card payment entries." })
        return
      }
      await saveCardPaymentsBulk(date, validEntries)
      setSavedSteps(prev => [...new Set([...prev, "cards"])])
      toast({ title: "Card Payments Saved", description: "Card sales recorded successfully." })
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // Final Finalize
  // handleFinalize removed as requested.

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

      {/* Tabs Layout */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-14 bg-muted/50 p-1 rounded-xl mb-8">
          <TabsTrigger value="fuel" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all">
            <Droplet className="mr-2 h-4 w-4" />
            Fuel Sales
            {savedSteps.includes("fuel") && <CheckCircle2 className="ml-2 h-4 w-4 text-green-400" />}
          </TabsTrigger>
          <TabsTrigger value="lubes" className="rounded-lg data-[state=active]:bg-orange-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all">
            <Droplet className="mr-2 h-4 w-4" />
            Lubricants
            {savedSteps.includes("lubes") && <CheckCircle2 className="ml-2 h-4 w-4 text-green-400" />}
          </TabsTrigger>
          <TabsTrigger value="cards" className="rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all">
            <CreditCard className="mr-2 h-4 w-4" />
            Card Payments
            {savedSteps.includes("cards") && <CheckCircle2 className="ml-2 h-4 w-4 text-green-400" />}
          </TabsTrigger>
        </TabsList>

        <div className="min-h-[500px]">
          {/* FUEL SALES TAB */}
          <TabsContent value="fuel" className="animate-in fade-in slide-in-from-left-4">
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
                <div className="font-bold">Total Fuel Sale: <span className="text-primary text-xl ml-2">PKR {Number(fuelTotalAmount).toLocaleString()}</span></div>
                <div className="flex gap-3">
                  <Button onClick={handleSaveNozzles} disabled={saving} size="lg" className="rounded-xl px-8">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Fuel Sales
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* LUBRICANTS TAB */}
          <TabsContent value="lubes" className="animate-in fade-in slide-in-from-right-4">

            {/* STEP 2: LUBRICANT SALES */}
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
                <div className="font-bold">Lube Total: <span className="text-orange-600 text-xl ml-2">PKR {lubeTotalAmount.toLocaleString()}</span></div>
                <div className="flex gap-3">
                  <Button onClick={handleSaveLubricants} disabled={saving} size="lg" className="bg-orange-600 hover:bg-orange-700 rounded-xl px-8">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Lubricant Sales
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* CARDS TAB */}
          <TabsContent value="cards" className="animate-in fade-in slide-in-from-bottom-4">
            <Card className="max-w-4xl mx-auto">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-indigo-500" /> Card Payment Records
                  </CardTitle>
                  <CardDescription>Record card sales by selecting the specific bank/card.</CardDescription>
                </div>
                <Button onClick={addCardEntry} variant="outline" size="sm" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                  <Plus className="mr-2 h-4 w-4" /> Add Card Entry
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Specific Card / Bank</TableHead>
                      <TableHead className="text-right w-48">Amount (PKR)</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cardEntries.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground italic">No card entries added. Click 'Add Card Entry' to start.</TableCell></TableRow>
                    ) : cardEntries.map((entry) => {
                      const selectedMethod = paymentMethods.find(m => m.id === entry.methodId)
                      return (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <Select value={entry.methodId} onValueChange={(v) => updateCardEntry(entry.id, { methodId: v, bankCardId: "", supplierCardId: "" })}>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select Method..." />
                              </SelectTrigger>
                              <SelectContent>
                                {paymentMethods.filter(m => m.type !== 'cash').map(m => (
                                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {selectedMethod?.type === 'bank_card' && (
                              <Select value={entry.bankCardId} onValueChange={(v) => updateCardEntry(entry.id, { bankCardId: v })}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select Bank/Card..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {bankCards.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.bank_accounts?.bank_name} - {c.card_name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            {selectedMethod?.type === 'supplier_card' || selectedMethod?.type === 'shell_card' ? (
                              <Select value={entry.supplierCardId} onValueChange={(v) => updateCardEntry(entry.id, { supplierCardId: v })}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select Supplier Card..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {supplierCards.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.suppliers?.name} - {c.card_name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : null}
                            {!selectedMethod && <div className="text-xs text-muted-foreground italic">← Select method first</div>}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              className="text-right font-bold"
                              value={entry.amount || ""}
                              onChange={(e) => updateCardEntry(entry.id, { amount: parseFloat(e.target.value) || 0 })}
                            />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => removeCardEntry(entry.id)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
              <CardFooter className="flex justify-between bg-muted/20">
                <div className="font-bold">Total Card Sales: <span className="text-indigo-600 text-xl ml-2">PKR {cardEntries.reduce((s, e) => s + (e.amount || 0), 0).toLocaleString()}</span></div>
                <Button onClick={handleSaveCards} disabled={saving} size="lg" className="bg-indigo-600 hover:bg-indigo-700 rounded-xl px-8">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Card Payments
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
