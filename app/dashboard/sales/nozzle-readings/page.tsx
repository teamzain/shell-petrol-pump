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
    Search
} from "lucide-react"
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
import { getTodayPKT } from "@/lib/utils"
import { exportToCSV } from "@/lib/export-utils"

export default function NozzleReadingsPage() {
    const [nozzles, setNozzles] = useState<any[]>([])
    const [inputReadings, setInputReadings] = useState<Record<string, string>>({})
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")

    // Card Summary State
    const [bankCards, setBankCards] = useState<any[]>([])
    const [supplierCards, setSupplierCards] = useState<any[]>([])
    const [cardEntries, setCardEntries] = useState<DailyCardEntry[]>([
        { card_type: 'bank_card', card_id: '', amount: 0, date: getTodayPKT() }
    ])

    const supabase = createClient()
    const today = getTodayPKT()

    useEffect(() => {
        fetchNozzles()
        fetchCardOptions()
    }, [])

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

    async function fetchNozzles() {
        setIsLoading(true)
        try {
            const { data } = await supabase
                .from("nozzles")
                .select(`
          *,
          products(name, selling_price)
        `)
                .eq("status", "active")
                .order("nozzle_number")

            if (data) {
                setNozzles(data)
            }
        } catch (error) {
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
                meter_reading: parseFloat(inputReadings[n.id])
            }))

        if (readingsToSave.length === 0) {
            toast.error("Please enter at least one meter reading")
            return
        }

        // Validation
        for (const r of readingsToSave) {
            const nozzle = nozzles.find(n => n.id === r.nozzle_id)
            if (isNaN(r.meter_reading) || r.meter_reading < (nozzle?.last_reading || 0)) {
                toast.error(`Invalid reading for ${nozzle?.nozzle_number}. Must be >= ${nozzle?.last_reading}`)
                return
            }
        }

        setIsSaving(true)
        try {
            await recordNozzleReadings(readingsToSave)
            toast.success("Readings recorded and sales calculated!")
            fetchNozzles()
            setInputReadings({})
        } catch (error: any) {
            toast.error(error.message || "Failed to save readings")
        } finally {
            setIsSaving(false)
        }
    }

    const handleAddCardRow = () => {
        setCardEntries([...cardEntries, { card_type: 'bank_card', card_id: '', amount: 0, date: today }])
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
            setCardEntries([{ card_type: 'bank_card', card_id: '', amount: 0, date: today }])
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

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Fuel Sales Entry</h1>
                    <p className="text-muted-foreground">Enter closing meter readings for each nozzle. Sales are calculated automatically.</p>
                </div>
                <div className="flex items-center gap-2">
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
                                            <TableHead>Last Reading</TableHead>
                                            <TableHead className="w-[160px]">New Reading</TableHead>
                                            <TableHead className="text-right">Sales (Qty)</TableHead>
                                            <TableHead className="text-right">Total Revenue</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow><TableCell colSpan={8} className="text-center py-10">Loading nozzles...</TableCell></TableRow>
                                        ) : filteredNozzles.length === 0 ? (
                                            <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No matches found.</TableCell></TableRow>
                                        ) : filteredNozzles.map((n) => {
                                            const current = parseFloat(inputReadings[n.id] || "0")
                                            const last = n.last_reading || 0
                                            const qtySold = current > 0 ? (current - last) : 0
                                            const revenue = qtySold * (n.products?.selling_price || 0)

                                            return (
                                                <TableRow key={n.id} className="hover:bg-muted/50 transition-colors">
                                                    <TableCell className="font-bold">{n.nozzle_number}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="secondary" className="font-normal capitalize">{n.products?.name}</Badge>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-muted-foreground">{(last || 0).toLocaleString()} L</TableCell>
                                                    <TableCell>
                                                        <div className="relative">
                                                            <Input
                                                                type="number"
                                                                step="0.01"
                                                                placeholder="Enter reading"
                                                                value={inputReadings[n.id] || ""}
                                                                onChange={(e) => handleInputChange(n.id, e.target.value)}
                                                                className={`font-mono border-primary/20 focus-visible:ring-primary ${current > 0 && current < last ? "border-red-500 bg-red-50" : ""}`}
                                                            />
                                                            {current > 0 && current < last && (
                                                                <span className="absolute -bottom-5 left-0 text-[10px] text-red-500 font-medium">Reading too low</span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {qtySold > 0 ? (
                                                            <div className="flex flex-col items-end">
                                                                <span className="font-bold text-primary">{(qtySold || 0).toLocaleString()} L</span>
                                                                <span className="text-[10px] text-muted-foreground">Liters Sold</span>
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
                                Consolidated entry for all card payments received today (<b>{today}</b>).
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
            </Tabs>
        </div>
    )
}


function CalendarIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
    )
}
