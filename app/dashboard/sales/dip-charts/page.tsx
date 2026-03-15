"use client"

import { useState, useEffect } from "react"
import { Plus, Upload, Trash2, Link as LinkIcon, FileText, Loader2, AlertCircle, CheckCircle2, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { getDipCharts, saveDipChart, deleteDipChart, linkDipChartToTanks, getTanksWithCharts, getDipChartEntries, DipChartEntry } from "@/app/actions/dip-chart-actions"

export default function DipChartsPage() {
    const [dipCharts, setDipCharts] = useState<any[]>([])
    const [tanks, setTanks] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isUploadOpen, setIsUploadOpen] = useState(false)
    const [isLinkOpen, setIsLinkOpen] = useState(false)
    const [isViewOpen, setIsViewOpen] = useState(false)

    // Upload State
    const [chartName, setChartName] = useState("")
    const [csvFile, setCsvFile] = useState<File | null>(null)
    const [parsedEntries, setParsedEntries] = useState<DipChartEntry[]>([])

    // Link State
    const [selectedChart, setSelectedChart] = useState<any>(null)
    const [selectedTanks, setSelectedTanks] = useState<string[]>([])

    // View State
    const [viewingEntries, setViewingEntries] = useState<DipChartEntry[]>([])
    const [isViewingLoading, setIsViewingLoading] = useState(false)

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        setIsLoading(true)
        try {
            const [chartsData, tanksData] = await Promise.all([
                getDipCharts(),
                getTanksWithCharts()
            ])
            setDipCharts(chartsData)
            setTanks(tanksData)
        } catch (error: any) {
            toast.error("Failed to load data: " + error.message)
        } finally {
            setIsLoading(false)
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setCsvFile(file)
        const reader = new FileReader()
        reader.onload = (event) => {
            const text = event.target?.result as string
            const lines = text.split("\n")
            const entries: DipChartEntry[] = []

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim()
                if (!line) continue

                // Check for header or invalid lines
                const parts = line.split(",").map(p => p.trim())
                if (parts.length >= 2) {
                    const dip = parseFloat(parts[0])
                    const vol = parseFloat(parts[1])
                    if (!isNaN(dip) && !isNaN(vol)) {
                        entries.push({ dip_mm: dip, volume_liters: vol })
                    }
                }
            }
            setParsedEntries(entries)
        }
        reader.readAsText(file)
    }

    async function handleUpload() {
        if (!chartName) {
            toast.error("Please enter a chart name")
            return
        }
        if (parsedEntries.length === 0) {
            toast.error("No valid entries found in CSV")
            return
        }

        setIsSaving(true)
        try {
            await saveDipChart(chartName, parsedEntries)
            toast.success("Dip chart uploaded successfully")
            setIsUploadOpen(false)
            resetUploadForm()
            fetchData()
        } catch (error: any) {
            toast.error("Upload failed: " + error.message)
        } finally {
            setIsSaving(false)
        }
    }

    function resetUploadForm() {
        setChartName("")
        setCsvFile(null)
        setParsedEntries([])
    }

    async function handleLink() {
        if (!selectedChart || selectedTanks.length === 0) {
            toast.error("Select at least one tank")
            return
        }

        setIsSaving(true)
        try {
            await linkDipChartToTanks(selectedChart.id, selectedTanks)
            toast.success("Chart linked to tanks")
            setIsLinkOpen(false)
            fetchData()
        } catch (error: any) {
            toast.error("Linking failed: " + error.message)
        } finally {
            setIsSaving(false)
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Are you sure you want to delete this dip chart?")) return

        try {
            await deleteDipChart(id)
            toast.success("Dip chart deleted")
            fetchData()
        } catch (error: any) {
            toast.error("Delete failed: " + error.message)
        }
    }

    const openLinkModal = (chart: any) => {
        setSelectedChart(chart)
        // Pre-select tanks already linked to this chart
        const linkedTanks = tanks.filter(t => t.dip_chart_id === chart.id).map(t => t.id)
        setSelectedTanks(linkedTanks)
        setIsLinkOpen(true)
    }

    const openViewModal = async (chart: any) => {
        setSelectedChart(chart)
        setIsViewOpen(true)
        setIsViewingLoading(true)
        try {
            const entries = await getDipChartEntries(chart.id)
            setViewingEntries(entries)
        } catch (error: any) {
            toast.error("Failed to load entries: " + error.message)
            setIsViewOpen(false)
        } finally {
            setIsViewingLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Dip Charts</h1>
                    <p className="text-muted-foreground">Manage dip-to-volume mapping tables for your tanks.</p>
                </div>
                <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2">
                            <Plus className="w-4 h-4" />
                            New Dip Chart
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>Upload Dip Chart</DialogTitle>
                            <DialogDescription>
                                Upload a CSV file containing (Dip in mm, Volume in Liters).
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Chart Name</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g. 10KL Petrol Tank"
                                    value={chartName}
                                    onChange={(e) => setChartName(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="csv">CSV File</Label>
                                <Input
                                    id="csv"
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileChange}
                                />
                                <p className="text-[10px] text-muted-foreground">CSV format: dip_mm, volume_liters per row</p>
                            </div>

                            {parsedEntries.length > 0 && (
                                <div className="mt-2 p-2 bg-muted rounded-md border border-border max-h-[150px] overflow-y-auto">
                                    <p className="text-xs font-semibold mb-1">Preview ({parsedEntries.length} entries):</p>
                                    <Table>
                                        <TableHeader className="h-auto">
                                            <TableRow>
                                                <TableHead className="h-auto py-1">Dip (mm)</TableHead>
                                                <TableHead className="h-auto py-1 text-right">Volume (L)</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {parsedEntries.slice(0, 5).map((e, i) => (
                                                <TableRow key={i} className="h-auto">
                                                    <TableCell className="h-auto py-1">{e.dip_mm}</TableCell>
                                                    <TableCell className="h-auto py-1 text-right">{e.volume_liters}</TableCell>
                                                </TableRow>
                                            ))}
                                            {parsedEntries.length > 5 && (
                                                <TableRow className="h-auto">
                                                    <TableCell colSpan={2} className="h-auto py-1 text-center text-[10px] text-muted-foreground">...</TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
                            <Button onClick={handleUpload} disabled={isSaving || !chartName || parsedEntries.length === 0}>
                                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                                Save Chart
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Existing Charts</CardTitle>
                    <CardDescription>Configured dip charts available for tank assignment.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : dipCharts.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p>No dip charts uploaded yet.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Chart Name</TableHead>
                                    <TableHead>Linked Tanks</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {dipCharts.map((chart) => {
                                    const linkedTanks = tanks.filter(t => t.dip_chart_id === chart.id)
                                    return (
                                        <TableRow key={chart.id}>
                                            <TableCell className="font-medium">{chart.name}</TableCell>
                                            <TableCell>
                                                {linkedTanks.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {linkedTanks.map(t => (
                                                            <span key={t.id} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                                                {t.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">None</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {new Date(chart.created_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right flex items-center justify-end gap-2">
                                                <Button variant="outline" size="sm" onClick={() => openViewModal(chart)} className="h-8 gap-1">
                                                    <Eye className="w-3 h-3" />
                                                    View
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => openLinkModal(chart)} className="h-8 gap-1">
                                                    <LinkIcon className="w-3 h-3" />
                                                    Link Tanks
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDelete(chart.id)} className="h-8 w-8 text-destructive hover:text-destructive">
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Link Modal */}
            <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Link "{selectedChart?.name}" to Tanks</DialogTitle>
                        <DialogDescription>Select the tanks that use this calibration chart.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="grid gap-2">
                            {tanks.map((tank) => (
                                <div key={tank.id} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={tank.id}
                                        checked={selectedTanks.includes(tank.id)}
                                        onCheckedChange={(checked) => {
                                            if (checked) {
                                                setSelectedTanks([...selectedTanks, tank.id])
                                            } else {
                                                setSelectedTanks(selectedTanks.filter(id => id !== tank.id))
                                            }
                                        }}
                                    />
                                    <label
                                        htmlFor={tank.id}
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex justify-between w-full"
                                    >
                                        <span>{tank.name}</span>
                                        <span className="text-xs text-muted-foreground">{tank.products?.name}</span>
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsLinkOpen(false)}>Cancel</Button>
                        <Button onClick={handleLink} disabled={isSaving}>
                            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Update Links
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* View Modal */}
            <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Dip Chart Data: {selectedChart?.name}</DialogTitle>
                        <DialogDescription>
                            Full calibration mapping for this chart.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {isViewingLoading ? (
                            <div className="flex justify-center p-8">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            </div>
                        ) : (
                            <div className="border rounded-md overflow-hidden">
                                <div className="max-h-[400px] overflow-y-auto">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                                            <TableRow>
                                                <TableHead>Dip (mm)</TableHead>
                                                <TableHead className="text-right">Volume (Liters)</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {viewingEntries.map((entry, i) => (
                                                <TableRow key={i}>
                                                    <TableCell>{entry.dip_mm}</TableCell>
                                                    <TableCell className="text-right">{entry.volume_liters}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setIsViewOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
