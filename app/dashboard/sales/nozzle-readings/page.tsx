"use client"

import { useState, useEffect } from "react"
import {
    Gauge,
    ArrowRight,
    AlertTriangle,
    CheckCircle2,
    Loader2,
    Save,
    RefreshCcw,
    Fuel,
    TrendingUp,
    CreditCard,
    Plus,
    Trash2,
    Download,
    Search,
    Lock,
    Unlock,
    History,
    Calendar,
    ArrowDown,
    ArrowUp
} from "lucide-react"
import { AdminPinDialog } from "@/components/auth/admin-pin-dialog"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CardFooter
} from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs"
import { toast } from "sonner"
import { recordNozzleReadings } from "@/app/actions/nozzle-actions"
import { recordDailyCardPayments, type DailyCardEntry } from "@/app/actions/card-actions"
import { recordTankReconciliation, getReconciliationHistory } from "@/app/actions/dip-chart-actions"
import { getTodayPKT } from "@/lib/utils"
import { exportToCSV } from "@/lib/export-utils"
import { getTanksWithCharts, getDipChartEntries } from "@/app/actions/dip-chart-actions"
import { getSystemActiveDate } from "@/app/actions/balance"

export default function NozzleReadingsPage() {
    const [nozzles, setNozzles] = useState<any[]>([])
    const [inputReadings, setInputReadings] = useState<Record<string, string>>({})
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")

    // Card Summary State
    const [bankCards, setBankCards] = useState<any[]>([])
    const [supplierCards, setSupplierCards] = useState<any[]>([])
    const [workingDate, setWorkingDate] = useState("")
    const [cardEntries, setCardEntries] = useState<DailyCardEntry[]>([
        { card_type: 'bank_card', card_id: '', amount: 0, date: "" }
    ])

    // Reconciliation History State
    const [history, setHistory] = useState<any[]>([])
    const [isHistoryLoading, setIsHistoryLoading] = useState(false)
    const [historyStartDate, setHistoryStartDate] = useState("")
    const [historyEndDate, setHistoryEndDate] = useState("")

    useEffect(() => {
        const initDate = async () => {
            const activeDate = await getSystemActiveDate()
            setWorkingDate(activeDate)
            setCardEntries([{ card_type: 'bank_card', card_id: '', amount: 0, date: activeDate }])
            setHistoryStartDate(activeDate)
            setHistoryEndDate(activeDate)
        }
        initDate()
    }, [])

    // Security Lock State
    const [lockedNozzleIds, setLockedNozzleIds] = useState<Set<string>>(new Set())
    const [isPinDialogOpen, setIsPinDialogOpen] = useState(false)
    const [activeNozzleId, setActiveNozzleId] = useState<string | null>(null)

    // Dip Chart Calculator State
    const [tanks, setTanks] = useState<any[]>([])
    const [dipChartEntriesMap, setDipChartEntriesMap] = useState<Record<string, any[]>>({})
    const [dipReadings, setDipReadings] = useState<Record<string, string>>({})
    const [isDipLoading, setIsDipLoading] = useState(false)
    const [isDipSaving, setIsDipSaving] = useState(false)



    const supabase = createClient()
    const today = getTodayPKT()

    useEffect(() => {
        fetchNozzles()
        fetchCardOptions()
        fetchDipChartData()
    }, [workingDate])

    async function fetchDipChartData() {
        setIsDipLoading(true)
        try {
            const tanksData = await getTanksWithCharts()
            setTanks(tanksData || [])

            // Fetch entries for each unique dip chart
            const uniqueChartIds = Array.from(new Set(tanksData.map(t => t.dip_chart_id).filter(Boolean))) as string[]
            const entriesMap: Record<string, any[]> = {}

            await Promise.all(uniqueChartIds.map(async (chartId) => {
                const entries = await getDipChartEntries(chartId)
                entriesMap[chartId] = entries
            }))

            setDipChartEntriesMap(entriesMap)
        } catch (error) {
            console.error("Failed to fetch dip chart data", error)
        } finally {
            setIsDipLoading(false)
        }
    }

    async function fetchCardOptions() {
        try {
            const { data: bCards } = await supabase.from("bank_cards").select("id, card_name").eq("is_active", true).order("card_name")
            const { data: sCards } = await supabase.from("supplier_cards").select("id, card_name").eq("is_active", true).order("card_name")
            setBankCards(bCards || [])
            setSupplierCards(sCards || [])
        } catch (error) {
            console.error("Failed to fetch card options", error)
        }
    }

    async function fetchHistory() {
        setIsHistoryLoading(true)
        try {
            const data = await getReconciliationHistory(historyStartDate, historyEndDate)
            setHistory(data || [])
        } catch (error) {
            console.error("Failed to fetch history", error)
            toast.error("Failed to load reconciliation history")
        } finally {
            setIsHistoryLoading(false)
        }
    }

    useEffect(() => {
        fetchHistory()
    }, [historyStartDate, historyEndDate])

    async function fetchNozzles() {
        setIsLoading(true)
        try {
            // 1. Fetch Nozzles
            const { data: nozzleData } = await supabase
                .from("nozzles")
                .select(`
                    *,
                    products(name, selling_price, current_stock),
                    dispensers(id, name, tank_ids)
                `)
                .eq("status", "active")
                .order("nozzle_number")

            if (nozzleData) {
                // 2. Fetch existing sales for this date
                const { data: existingSales } = await supabase
                    .from('daily_sales')
                    .select('*')
                    .eq('sale_date', workingDate)

                // 2b. Fetch all tanks to match with dispensers
                const { data: allTanks } = await supabase
                    .from('tanks')
                    .select('id, name, current_level, product_id')

                const processedNozzles = await Promise.all(nozzleData.map(async (n) => {
                    const existingSale = existingSales?.find(s => s.nozzle_id === n.id)

                    let openingReading = 0
                    let closingReading = ""

                    if (existingSale) {
                        openingReading = existingSale.opening_reading
                        closingReading = existingSale.closing_reading.toString()
                    } else {
                        // Find most recent closing reading before this date
                        const { data: lastReadingRecord } = await supabase
                            .from('daily_sales')
                            .select('closing_reading')
                            .eq('nozzle_id', n.id)
                            .lt('sale_date', workingDate)
                            .order('sale_date', { ascending: false })
                            .limit(1)
                            .single()

                        openingReading = lastReadingRecord ? lastReadingRecord.closing_reading : n.last_reading
                    }

                    // Find the specific tank for this nozzle
                    const dispenser = n.dispensers
                    let tankData = null
                    if (dispenser && dispenser.tank_ids && dispenser.tank_ids.length > 0) {
                        const matchingTank = allTanks?.find(t => 
                            dispenser.tank_ids.includes(t.id) && t.product_id === n.product_id
                        )
                        if (matchingTank) {
                            tankData = {
                                id: matchingTank.id,
                                name: matchingTank.name,
                                current_level: matchingTank.current_level
                            }
                        }
                    }

                    return {
                        ...n,
                        opening_reading: openingReading,
                        existing_closing: existingSale ? existingSale.closing_reading : null,
                        existing_qty: existingSale ? existingSale.quantity : 0,
                        tank: tankData
                    }
                }))

                setNozzles(processedNozzles)

                // Track locked status and pre-fill inputReadings
                const initialInputs: Record<string, string> = {}
                const lockedIds = new Set<string>()

                processedNozzles.forEach(n => {
                    if (n.existing_closing !== null) {
                        initialInputs[n.id] = n.existing_closing.toString()
                        lockedIds.add(n.id)
                    }
                })
                setLockedNozzleIds(lockedIds)
                setInputReadings(initialInputs)
            }
        } catch (error) {
            console.error("Fetch error:", error)
            toast.error("Failed to load nozzles")
        } finally {
            setIsLoading(false)
        }
    }

    const handleInputChange = (nozzleId: string, value: string) => {
        setInputReadings(prev => ({ ...prev, [nozzleId]: value }))
    }

    const handleExport = () => {
        const headers = {
            nozzle_number: "Nozzle",
            "products.name": "Fuel Type",
            last_reading: "Last Reading (L)",
        }
        exportToCSV(nozzles, "Active_Nozzles_Entry", headers)
        toast.success("Exporting nozzle list...")
    }

    const handleSave = async () => {
        const readingsToSave = nozzles
            .filter(n => inputReadings[n.id] && inputReadings[n.id].trim() !== "")
            .map(n => ({
                nozzle_id: n.id,
                opening_reading: n.opening_reading,
                meter_reading: parseFloat(inputReadings[n.id])
            }))

        if (readingsToSave.length === 0) {
            toast.error("Please enter at least one meter reading")
            return
        }

        // Validation
        for (const r of readingsToSave) {
            const nozzle = nozzles.find(n => n.id === r.nozzle_id)
            if (isNaN(r.meter_reading) || r.meter_reading < (nozzle?.opening_reading || 0)) {
                toast.error(`Invalid reading for ${nozzle?.nozzle_number}. Must be >= ${nozzle?.opening_reading}`)
                return
            }
            
            const qtySold = r.meter_reading - (nozzle?.opening_reading || 0)
            const existingQty = nozzle?.existing_qty || 0
            const incrementalQty = qtySold - existingQty
            const currentStock = nozzle?.products?.current_stock || 0
            
            // Product stock check
            if (incrementalQty > currentStock) {
                toast.error(`Cannot sell additional ${incrementalQty.toLocaleString()} L for ${nozzle?.nozzle_number} (Total required: ${qtySold.toLocaleString()} L). Only ${currentStock.toLocaleString()} L left in total stock.`)
                return
            }

            // Tank specific stock check
            const tankStock = nozzle?.tank?.current_level || 0
            if (incrementalQty > tankStock) {
                toast.error(`Insufficient stock in ${nozzle?.tank?.name || 'tank'}. Sale requires ${incrementalQty.toLocaleString()} L more, but tank only has ${tankStock.toLocaleString()} L remaining.`)
                return
            }
        }

        setIsSaving(true)
        try {
            await recordNozzleReadings(readingsToSave, workingDate)
            toast.success("Readings recorded and sales calculated!")

            // Re-lock all saved nozzles
            const updatedLocked = new Set(lockedNozzleIds)
            readingsToSave.forEach(r => updatedLocked.add(r.nozzle_id))
            setLockedNozzleIds(updatedLocked)

            fetchNozzles()
            // Don't clear inputs anymore so they stay visible while locked
        } catch (error: any) {
            toast.error(error.message || "Failed to save readings")
        } finally {
            setIsSaving(false)
        }
    }

    const handleAddCardRow = () => {
        setCardEntries([...cardEntries, { card_type: 'bank_card', card_id: '', amount: 0, date: workingDate }])
    }

    const handleRemoveCardRow = (index: number) => {
        setCardEntries(cardEntries.filter((_, i) => i !== index))
    }

    const handleUpdateCardRow = (index: number, updates: Partial<DailyCardEntry>) => {
        const newEntries = [...cardEntries]
        newEntries[index] = { ...newEntries[index], ...updates }
        setCardEntries(newEntries)
    }

    const handleSaveCards = async () => {
        const validEntries = cardEntries.filter(e => e.card_id && e.amount > 0)
        if (validEntries.length === 0) {
            toast.error("Please add at least one card with a valid amount")
            return
        }

        setIsSaving(true)
        try {
            await recordDailyCardPayments(validEntries)
            toast.success("Daily card summary recorded!")
            setCardEntries([{ card_type: 'bank_card', card_id: '', amount: 0, date: workingDate }])
        } catch (error: any) {
            toast.error(error.message || "Failed to record card payments")
        } finally {
            setIsSaving(false)
        }
    }

    const filteredNozzles = nozzles.filter(n =>
        n.nozzle_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.products?.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const getVolumeForDip = (tank: any, dipValue: string) => {
        const dip = parseFloat(dipValue)
        if (isNaN(dip) || !tank.dip_chart_id) return null

        let entries = dipChartEntriesMap[tank.dip_chart_id]
        let isFallbackApplied = false

        // Special case: Tank 4 fallback to Tank 1
        const isTank4 = tank.name.toLowerCase().includes("tank 4")
        if (isTank4 && entries && entries.length > 0) {
            const maxDipInTank4 = Math.max(...entries.map(e => e.dip_mm))
            if (dip > maxDipInTank4) {
                // Find Tank 1
                const tank1 = tanks.find(t => t.name.toLowerCase().includes("tank 1"))
                if (tank1 && tank1.dip_chart_id) {
                    const tank1Entries = dipChartEntriesMap[tank1.dip_chart_id]
                    if (tank1Entries && tank1Entries.length > 0) {
                        entries = tank1Entries
                        isFallbackApplied = true
                    }
                }
            }
        }

        if (!entries || entries.length === 0) return null

        let calculatedVolume = null

        // Find exact match or neighbors
        const exactMatch = entries.find(e => e.dip_mm === dip)
        if (exactMatch) {
            calculatedVolume = exactMatch.volume_liters
        } else {
            // Sort just in case, though action should return sorted
            const sorted = [...entries].sort((a, b) => a.dip_mm - b.dip_mm)

            if (dip <= sorted[0].dip_mm) {
                calculatedVolume = sorted[0].volume_liters
            } else if (dip >= sorted[sorted.length - 1].dip_mm) {
                calculatedVolume = sorted[sorted.length - 1].volume_liters
            } else {
                // Interpolation
                for (let i = 0; i < sorted.length - 1; i++) {
                    const low = sorted[i]
                    const high = sorted[i + 1]

                    if (dip > low.dip_mm && dip < high.dip_mm) {
                        // Formula: y = y0 + (x - x0) * (y1 - y0) / (x1 - x0)
                        const volume = low.volume_liters + (dip - low.dip_mm) * (high.volume_liters - low.volume_liters) / (high.dip_mm - low.dip_mm)
                        calculatedVolume = Math.round(volume * 100) / 100
                        break
                    }
                }
            }
        }

        if (calculatedVolume !== null) {
            // Add 150 liters if fallback was applied (user request)
            if (isFallbackApplied) {
                calculatedVolume += 150
            }
            return calculatedVolume
        }

        return null
    }

    const handleSaveDipReadings = async () => {
        const recordsToSave: any[] = []

        tanks.forEach(tank => {
            const dipValue = dipReadings[tank.id]
            if (dipValue && dipValue.trim() !== "") {
                const volume = getVolumeForDip(tank, dipValue)
                if (volume !== null) {
                    const diff = volume - tank.current_level
                    recordsToSave.push({
                        tank_id: tank.id,
                        dip_mm: parseFloat(dipValue),
                        dip_volume: volume,
                        current_stock: tank.current_level,
                        gain_amount: diff > 0 ? diff : 0,
                        loss_amount: diff < 0 ? Math.abs(diff) : 0,
                        actual_stock: volume
                    })
                }
            }
        })

        if (recordsToSave.length === 0) {
            toast.error("Please enter at least one valid dip reading")
            return
        }

        setIsDipSaving(true)
        try {
            await recordTankReconciliation(recordsToSave, workingDate)
            toast.success("Dip readings saved and tank stock updated!")
            setDipReadings({})
            fetchDipChartData() // Refresh current levels
            fetchHistory() // Refresh history tab
        } catch (error: any) {
            toast.error(error.message || "Failed to save dip readings")
        } finally {
            setIsDipSaving(false)
        }
    }

    const handleDipInputChange = (tankId: string, value: string) => {
        setDipReadings(prev => ({ ...prev, [tankId]: value }))
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Fuel Sales Entry</h1>
                    <p className="text-muted-foreground">Enter closing meter readings for each nozzle. Sales are calculated automatically.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Input
                        type="date"
                        value={workingDate}
                        max={getTodayPKT()}
                        onChange={(e) => {
                            const newDate = e.target.value
                            setWorkingDate(newDate)
                            // Update existing card entries to the new date as well
                            setCardEntries(prev => prev.map(entry => ({ ...entry, date: newDate })))
                        }}
                        className="w-40 h-9"
                    />
                    <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
                        <Download className="w-4 h-4" />
                        Export Nozzles
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="fuel" className="w-full">
                <TabsList className="bg-primary/5 mb-6">
                    <TabsTrigger value="fuel" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <Fuel className="w-4 h-4" />
                        Fuel Sales Entry
                    </TabsTrigger>
                    <TabsTrigger value="cards" className="gap-2 data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                        <CreditCard className="w-4 h-4" />
                        Daily Card Summary
                    </TabsTrigger>
                    <TabsTrigger value="dip" className="gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                        <Plus className="w-4 h-4" />
                        Dip Chart
                    </TabsTrigger>
                    <TabsTrigger value="history" className="gap-2 data-[state=active]:bg-slate-700 data-[state=active]:text-white">
                        <History className="w-4 h-4" />
                        Reconciliation History
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="fuel">
                    <Card className="border-primary/20 bg-primary/5 shadow-none">
                        <CardHeader className="pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-2 text-primary">
                                <TrendingUp className="w-5 h-5" />
                                <CardTitle>Daily Sales Recording</CardTitle>
                            </div>
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search nozzle or product..."
                                    className="pl-9 h-9 bg-background shadow-sm"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border bg-background overflow-hidden">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead>Nozzle</TableHead>
                                            <TableHead>Fuel Type</TableHead>
                                            <TableHead>Opening Reading</TableHead>
                                            <TableHead className="w-[160px]">Closing Reading</TableHead>
                                            <TableHead className="text-right">Sales (Liters)</TableHead>
                                            <TableHead className="text-right">Total Revenue</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow><TableCell colSpan={6} className="text-center py-10">Loading nozzles...</TableCell></TableRow>
                                        ) : filteredNozzles.length === 0 ? (
                                            <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No matches found.</TableCell></TableRow>
                                        ) : filteredNozzles.map((n) => {
                                            const current = parseFloat(inputReadings[n.id] || "0")
                                            const opening = n.opening_reading || 0
                                            const qtySold = current > 0 ? (current - opening) : 0
                                            const revenue = qtySold * (n.products?.selling_price || 0)

                                            return (
                                                <TableRow key={n.id} className="hover:bg-muted/50 transition-colors">
                                                    <TableCell className="font-bold">{n.nozzle_number}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="secondary" className="font-normal capitalize">{n.products?.name}</Badge>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-muted-foreground">{(opening || 0).toLocaleString()} L</TableCell>
                                                    <TableCell>
                                                        <div className="relative flex items-center gap-2">
                                                            <div className="relative flex-1">
                                                                <Input
                                                                    type="number"
                                                                    step="0.01"
                                                                    placeholder="Enter reading"
                                                                    value={inputReadings[n.id] || ""}
                                                                    onChange={(e) => handleInputChange(n.id, e.target.value)}
                                                                    disabled={lockedNozzleIds.has(n.id)}
                                                                    className={`font-mono border-primary/20 focus-visible:ring-primary ${current > 0 && current < opening ? "border-red-500 bg-red-50" : ""} ${lockedNozzleIds.has(n.id) ? "bg-muted cursor-not-allowed opacity-80" : ""}`}
                                                                />
                                                                {current > 0 && current < opening && (
                                                                    <span className="absolute -bottom-5 left-0 text-[10px] text-red-500 font-medium">Reading too low</span>
                                                                )}
                                                            </div>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className={`h-9 w-9 shrink-0 ${lockedNozzleIds.has(n.id) ? "text-primary hover:text-primary/80" : "text-muted-foreground"}`}
                                                                onClick={() => {
                                                                    if (lockedNozzleIds.has(n.id)) {
                                                                        setActiveNozzleId(n.id)
                                                                        setIsPinDialogOpen(true)
                                                                    } else {
                                                                        // Optional: manual lock if desired, but user wants auto-lock on save
                                                                    }
                                                                }}
                                                            >
                                                                {lockedNozzleIds.has(n.id) ? (
                                                                    <Lock className="h-4 w-4" />
                                                                ) : (
                                                                    <Unlock className="h-4 w-4 opacity-50" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {qtySold > 0 ? (
                                                            <div className="flex flex-col items-end">
                                                                <span className="font-bold text-primary">{(qtySold || 0).toLocaleString()} L</span>
                                                                <span className="text-[10px] text-muted-foreground">Quantity Sold</span>
                                                            </div>
                                                        ) : "-"}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {revenue > 0 ? (
                                                            <div className="flex flex-col items-end">
                                                                <span className="font-bold">Rs. {(revenue || 0).toLocaleString()}</span>
                                                                <span className="text-[10px] text-muted-foreground">@ {n.products?.selling_price}</span>
                                                            </div>
                                                        ) : "-"}
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                        <CardFooter className="flex items-center justify-between border-t p-6 bg-muted/30">
                            <div className="text-sm text-muted-foreground max-w-md">
                                Clicking save will instantly deduct fuel from stock and update sales reports.
                            </div>
                            <Button
                                onClick={handleSave}
                                disabled={isSaving || nozzles.length === 0}
                                className="px-8 gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all font-semibold"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Nozzle Readings
                            </Button>
                        </CardFooter>
                    </Card>
                </TabsContent>

                <TabsContent value="cards">
                    <Card className="border-orange-200 bg-orange-50/10 shadow-none">
                        <CardHeader>
                            <div className="flex items-center gap-2 text-orange-600">
                                <CreditCard className="w-5 h-5" />
                                <CardTitle>Daily Card Summary</CardTitle>
                            </div>
                            <CardDescription>
                                Consolidated entry for all card payments received on <b>{new Date(workingDate).toLocaleDateString("en-PK", { day: 'numeric', month: 'short', year: 'numeric' })}</b>.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {cardEntries.map((entry, index) => (
                                <div key={index} className="flex items-end gap-3 p-3 border rounded-lg bg-background relative group">
                                    <div className="flex-1 space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Card Type</Label>
                                        <Select
                                            value={entry.card_type}
                                            onValueChange={(val: any) => handleUpdateCardRow(index, { card_type: val, card_id: '' })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="bank_card">Bank Card</SelectItem>
                                                <SelectItem value="shell_card">Shell Card</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="flex-1 space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Select Card</Label>
                                        <Select
                                            value={entry.card_id}
                                            onValueChange={(val) => handleUpdateCardRow(index, { card_id: val })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Choose card" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {entry.card_type === 'bank_card' ? (
                                                    bankCards.map(c => <SelectItem key={c.id} value={c.id}>{c.card_name}</SelectItem>)
                                                ) : (
                                                    supplierCards.map(c => <SelectItem key={c.id} value={c.id}>{c.card_name}</SelectItem>)
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="w-32 space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Amount</Label>
                                        <Input
                                            type="number"
                                            value={entry.amount || ''}
                                            onChange={(e) => handleUpdateCardRow(index, { amount: parseFloat(e.target.value) || 0 })}
                                            placeholder="0.00"
                                        />
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleRemoveCardRow(index)}
                                        disabled={cardEntries.length === 1}
                                        className="text-muted-foreground hover:text-destructive"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}

                            <Button
                                variant="outline"
                                onClick={handleAddCardRow}
                                className="w-full border-dashed gap-2 py-6 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200"
                            >
                                <Plus className="h-4 w-4" />
                                Add Another Card Entry
                            </Button>
                        </CardContent>
                        <CardFooter className="flex items-center justify-between border-t p-6 bg-orange-50/30">
                            <div className="flex flex-col">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Total Summary Amount</span>
                                <span className="text-2xl font-black text-orange-600">
                                    Rs. {cardEntries.reduce((sum, e) => sum + (e.amount || 0), 0).toLocaleString()}
                                </span>
                            </div>
                            <Button
                                onClick={handleSaveCards}
                                disabled={isSaving || cardEntries.every(e => !e.card_id || e.amount <= 0)}
                                className="bg-orange-600 hover:bg-orange-700 shadow-md px-8 gap-2"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Card Summary
                            </Button>
                        </CardFooter>
                    </Card>
                </TabsContent>

                <TabsContent value="dip">
                    <Card className="border-blue-200 bg-blue-50/10 shadow-none">
                        <CardHeader>
                            <div className="flex items-center gap-2 text-blue-600">
                                <Plus className="w-5 h-5" />
                                <CardTitle>Dip Chart Calculator</CardTitle>
                            </div>
                            <CardDescription>
                                Enter tank dip readings (mm) to calculate corresponding fuel volume in liters.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border bg-background overflow-hidden">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead>Tank Name</TableHead>
                                            <TableHead>Fuel Type</TableHead>
                                            <TableHead className="w-[120px]">Current Stock</TableHead>
                                            <TableHead className="w-[130px]">Dip (mm)</TableHead>
                                            <TableHead className="text-right">Dip Volume</TableHead>
                                            <TableHead className="text-right w-[90px]">Gain</TableHead>
                                            <TableHead className="text-right w-[90px]">Loss</TableHead>
                                            <TableHead className="text-right w-[110px]">Actual Stock</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isDipLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center py-10">
                                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                                                    Loading tanks and charts...
                                                </TableCell>
                                            </TableRow>
                                        ) : tanks.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                                                    No tanks found. Please configure tanks in Settings.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                            tanks.map((tank) => {
                                                const volume = getVolumeForDip(tank, dipReadings[tank.id] || "")
                                                const hasChart = !!tank.dip_chart_id
                                                // Gain/Loss = Physical - System
                                                const diff = volume !== null ? (volume - tank.current_level) : null
                                                const gain = diff !== null && diff > 0 ? diff : null
                                                const loss = diff !== null && diff < 0 ? Math.abs(diff) : null
                                                // Actual Stock = Physical Volume
                                                const actualStock = volume

                                                return (
                                                    <TableRow key={tank.id}>
                                                        <TableCell className="font-medium">{tank.name}</TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="capitalize">
                                                                {tank.products?.name || "Unknown"}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                                            {tank.current_level?.toLocaleString() || "0"} L
                                                        </TableCell>
                                                        <TableCell>
                                                            <Input
                                                                type="number"
                                                                placeholder={hasChart ? "Enter mm" : "No chart"}
                                                                disabled={!hasChart}
                                                                value={dipReadings[tank.id] || ""}
                                                                onChange={(e) => handleDipInputChange(tank.id, e.target.value)}
                                                                className="font-mono h-8"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium text-muted-foreground">
                                                            {volume !== null ? `${volume.toLocaleString()} L` : "-"}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {gain !== null ? (
                                                                <span className="font-bold text-green-600">
                                                                    +{gain.toLocaleString()}
                                                                </span>
                                                            ) : "-"}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {loss !== null ? (
                                                                <span className="font-bold text-red-600">
                                                                    -{loss.toLocaleString()}
                                                                </span>
                                                            ) : "-"}
                                                        </TableCell>
                                                        <TableCell className="text-right font-bold text-blue-600">
                                                            {actualStock !== null ? `${actualStock.toLocaleString()} L` : "-"}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                        <CardFooter className="bg-blue-50/30 p-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="text-xs text-muted-foreground italic flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-amber-500" />
                                Saving will update the <b>actual tank stock</b> in the system inventory.
                            </div>
                            <Button
                                onClick={handleSaveDipReadings}
                                disabled={isDipSaving || tanks.length === 0 || Object.keys(dipReadings).length === 0}
                                className="bg-blue-600 hover:bg-blue-700 shadow-md px-8 gap-2 w-full sm:w-auto"
                            >
                                {isDipSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Dip Readings & Update Stock
                            </Button>
                        </CardFooter>
                    </Card>
                </TabsContent>

                <TabsContent value="history">
                    <Card className="border-slate-200 bg-slate-50/30 shadow-none">
                        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 text-slate-800">
                                    <History className="w-5 h-5" />
                                    <CardTitle>Reconciliation History</CardTitle>
                                </div>
                                <CardDescription>View past dip readings and stock adjustments.</CardDescription>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-2 bg-background border p-1 px-2 rounded-md shadow-sm">
                                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                                    <Input
                                        type="date"
                                        value={historyStartDate}
                                        onChange={(e) => setHistoryStartDate(e.target.value)}
                                        className="border-0 p-0 h-7 w-28 text-xs focus-visible:ring-0"
                                    />
                                    <span className="text-muted-foreground text-xs">to</span>
                                    <Input
                                        type="date"
                                        value={historyEndDate}
                                        onChange={(e) => setHistoryEndDate(e.target.value)}
                                        className="border-0 p-0 h-7 w-28 text-xs focus-visible:ring-0"
                                    />
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={fetchHistory}
                                    className="h-9 px-3"
                                >
                                    <RefreshCcw className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border bg-background overflow-hidden shadow-sm">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Tank</TableHead>
                                            <TableHead>Fuel Type</TableHead>
                                            <TableHead className="text-right">Dip (mm)</TableHead>
                                            <TableHead className="text-right">Dip Volume</TableHead>
                                            <TableHead className="text-right">System Stock</TableHead>
                                            <TableHead className="text-right">Actual Stock</TableHead>
                                            <TableHead className="text-right">Gain/Loss</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isHistoryLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center py-10">
                                                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                                                </TableCell>
                                            </TableRow>
                                        ) : history.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                                                    No reconciliation records found for this period.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            history.map((record) => (
                                                <TableRow key={record.id} className="hover:bg-slate-50/50 transition-colors">
                                                    <TableCell className="font-medium whitespace-nowrap">
                                                        {new Date(record.reading_date).toLocaleDateString("en-PK", { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </TableCell>
                                                    <TableCell className="font-semibold">{record.tanks?.name}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="secondary" className="font-normal">
                                                            {record.tanks?.products?.name}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-xs">
                                                        {record.dip_mm} mm
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-xs text-slate-600">
                                                        {record.dip_volume?.toLocaleString()} L
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                                        {record.current_stock?.toLocaleString()} L
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold text-blue-600 font-mono">
                                                        {record.actual_stock?.toLocaleString()} L
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {record.gain_amount > 0 ? (
                                                            <span className="flex items-center justify-end gap-1 font-bold text-green-600">
                                                                <ArrowUp className="w-3 h-3" />
                                                                {record.gain_amount.toLocaleString()}
                                                            </span>
                                                        ) : record.loss_amount > 0 ? (
                                                            <span className="flex items-center justify-end gap-1 font-bold text-red-600">
                                                                <ArrowDown className="w-3 h-3" />
                                                                {record.loss_amount.toLocaleString()}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground">-</span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <AdminPinDialog
                open={isPinDialogOpen}
                onOpenChange={setIsPinDialogOpen}
                onSuccess={() => {
                    if (activeNozzleId) {
                        const updatedLocked = new Set(lockedNozzleIds)
                        updatedLocked.delete(activeNozzleId)
                        setLockedNozzleIds(updatedLocked)
                        setActiveNozzleId(null)
                        toast.success("Nozzle unlocked for editing")
                    }
                }}
                title="Unlock Nozzle Reading"
                description="Enter Admin PIN to enable editing for this saved reading."
            />
        </div>
    )
}


function CalendarIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
    )
}
