"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

import {
    Plus,
    Pencil,
    Trash2,
    Droplet,
    Droplets,
    Settings2,
    Fuel,
    ChevronRight,
    Search,
    PlusCircle,
    Package,
    Gauge,
    Database
} from "lucide-react"
import { BrandLoader as Loader } from "@/components/ui/brand-loader"
import { toast } from "sonner"
import { getDispensers, saveDispenser, deleteDispenser, saveNozzle, deleteNozzle } from "@/app/actions/dispenser-actions"
import { getProducts } from "@/app/actions/products"
import { getTanks } from "@/app/actions/tanks"
import { Badge } from "@/components/ui/badge"

export default function DispensersPage() {
    const [loading, setLoading] = useState(true)
    const [dispensers, setDispensers] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [tanks, setTanks] = useState<any[]>([])

    const [isDispenserDialogOpen, setIsDispenserDialogOpen] = useState(false)
    const [editingDispenser, setEditingDispenser] = useState<any>(null)
    const [dispenserName, setDispenserName] = useState("")
    const [tankIds, setTankIds] = useState<string[]>([])

    const [isNozzleDialogOpen, setIsNozzleDialogOpen] = useState(false)
    const [editingNozzle, setEditingNozzle] = useState<any>(null)
    const [nozzleData, setNozzleData] = useState({
        dispenser_id: "",
        nozzle_number: "",
        product_id: "",
        nozzle_side: "",
        status: "active"
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [dispData, prodData, tankData] = await Promise.all([
                getDispensers(),
                getProducts('fuel'),
                getTanks()
            ])
            setDispensers(dispData || [])
            setProducts(prodData || [])
            setTanks(tankData || [])
        } catch (error) {
            console.error("Error fetching data:", error)
            toast.error("Failed to load dispensers and nozzles")
        } finally {
            setLoading(false)
        }
    }

    const handleSaveDispenser = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await saveDispenser({
                id: editingDispenser?.id,
                name: dispenserName,
                tank_ids: tankIds
            })
            toast.success("Dispenser saved successfully")
            setIsDispenserDialogOpen(false)
            fetchData()
        } catch (error) {
            toast.error("Failed to save dispenser")
        }
    }

    const handleDeleteDispenser = async (id: string) => {
        if (!confirm("Are you sure you want to delete this dispenser? This will delete all associated nozzles.")) return
        try {
            await deleteDispenser(id)
            toast.success("Dispenser deleted")
            fetchData()
        } catch (error) {
            toast.error("Failed to delete dispenser")
        }
    }

    const handleSaveNozzle = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await saveNozzle({
                ...nozzleData,
                id: editingNozzle?.id
            })
            toast.success("Nozzle saved successfully")
            setIsNozzleDialogOpen(false)
            fetchData()
        } catch (error) {
            toast.error("Failed to save nozzle")
        }
    }

    const handleDeleteNozzle = async (id: string) => {
        if (!confirm("Are you sure you want to delete this nozzle?")) return
        try {
            await deleteNozzle(id)
            toast.success("Nozzle deleted")
            fetchData()
        } catch (error) {
            toast.error("Failed to delete nozzle")
        }
    }

    if (loading && dispensers.length === 0) {
        return (
            <div className="flex items-center justify-center p-24">
                <Loader size="lg" />
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-3xl border shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl" />
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Settings2 className="w-5 h-5 text-primary" />
                        </div>
                        <h1 className="text-3xl font-black tracking-tighter uppercase italic">
                            Dispenser <span className="text-primary">Configuration</span>
                        </h1>
                    </div>
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        Station Equipment & Nozzle Management
                    </p>
                </div>
                <Button onClick={() => {
                    setEditingDispenser(null)
                    setDispenserName("")
                    setTankIds([])
                    setIsDispenserDialogOpen(true)
                }} className="relative z-10 h-12 px-6 rounded-xl font-black uppercase tracking-widest text-xs gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all hover:-translate-y-1">
                    <Plus className="w-4 h-4" /> Add Dispenser
                </Button>
            </div>

            {/* Main Configuration Card */}
            <Card className="border-0 shadow-2xl bg-white overflow-hidden">
                <div className="h-2 bg-slate-900" />
                <CardHeader className="border-b border-slate-50 pb-6 pt-8 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-xl font-black uppercase tracking-tight text-slate-800 italic">Configured Fuel Dispensers</CardTitle>
                            <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                                A total of {dispensers.length} terminal units and {dispensers.reduce((acc, d) => acc + (d.nozzles?.length || 0), 0)} active nozzles detected.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex justify-center p-24">
                            <Loader size="lg" />
                        </div>
                    ) : dispensers.length === 0 ? (
                        <div className="py-32 text-center">
                            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300">
                                <Fuel className="w-12 h-12" />
                            </div>
                            <h3 className="text-2xl font-black uppercase tracking-tight italic text-slate-800">Operational Void</h3>
                            <p className="text-slate-400 font-medium max-w-xs mx-auto mt-2">No functional dispensers have been registered at this station yet.</p>
                            <Button onClick={() => setIsDispenserDialogOpen(true)} className="mt-8 h-12 px-10 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl">
                                Initialize First Unit
                            </Button>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow className="hover:bg-transparent border-slate-100">
                                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400 py-4 h-auto pl-8">Unit Name</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400 py-4 h-auto">Linked Reservoirs</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400 py-4 h-auto">Nozzle Layout</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400 py-4 h-auto text-right pr-8">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {dispensers.map((dispenser) => (
                                    <TableRow key={dispenser.id} className="group border-slate-50 hover:bg-slate-50 transition-colors">
                                        <TableCell className="pl-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white italic">
                                                    <Fuel className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="font-black text-slate-800 uppercase italic leading-none">{dispenser.name.replace(/dispensor/gi, 'Dispenser')}</p>
                                                    <Badge variant="outline" className="mt-1 text-[9px] font-black uppercase bg-primary text-white border-primary px-1.5 py-0 h-4">ACTIVE UNIT</Badge>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1.5">
                                                {dispenser.tank_ids && dispenser.tank_ids.length > 0 ? (
                                                    tanks
                                                        .filter((t: any) => dispenser.tank_ids.includes(t.id))
                                                        .map((t: any) => (
                                                            <div key={t.id} className="flex items-center gap-1.5 bg-white border border-slate-100 px-2.5 py-1 rounded-lg shadow-sm">
                                                                <Database className="w-3 h-3 text-primary" />
                                                                <span className="text-[10px] font-black uppercase tracking-tight text-slate-600 italic">{t.name}</span>
                                                            </div>
                                                        ))
                                                ) : (
                                                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest italic">Unlinked Reservoir</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                                    <Gauge className="w-3 h-3" />
                                                    {dispenser.nozzles?.length || 0} Nozzles Configured
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {dispenser.nozzles?.map((nozzle: any) => (
                                                        <div key={nozzle.id} className="group/noz relative">
                                                            <div className="flex items-center gap-2 bg-slate-900 text-white px-2 py-1 rounded-lg hover:bg-primary transition-colors cursor-default">
                                                                <span className="text-xs font-black italic">{nozzle.nozzle_number}</span>
                                                                <div className="w-[1px] h-3 bg-white/20" />
                                                                <span className="text-[9px] font-black uppercase tracking-tighter opacity-80">{nozzle.products?.name || "Fuel"}</span>
                                                            </div>
                                                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] font-black px-2 py-1 rounded shadow-xl opacity-0 group-hover/noz:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                                                Rs. {nozzle.products?.selling_price} | {nozzle.nozzle_side || 'No Side'}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:text-primary hover:border-primary/50"
                                                        onClick={() => {
                                                            setEditingNozzle(null)
                                                            setNozzleData({
                                                                dispenser_id: dispenser.id,
                                                                nozzle_number: (dispenser.nozzles?.length + 1 || 1).toString(),
                                                                product_id: "",
                                                                nozzle_side: "",
                                                                status: "active"
                                                            })
                                                            setIsNozzleDialogOpen(true)
                                                        }}
                                                    >
                                                        <Plus className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right pr-8">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border border-slate-50 shadow-sm hover:bg-slate-100" onClick={() => {
                                                    setEditingDispenser(dispenser)
                                                    setDispenserName(dispenser.name)
                                                    setTankIds(dispenser.tank_ids || (dispenser.tank_id ? [dispenser.tank_id] : []))
                                                    setIsDispenserDialogOpen(true)
                                                }}>
                                                    <Pencil className="w-4 h-4 text-slate-600" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border border-slate-50 shadow-sm text-destructive hover:bg-destructive hover:text-white" onClick={() => handleDeleteDispenser(dispenser.id)}>
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>


            {/* Dispenser Dialog */}
            <Dialog open={isDispenserDialogOpen} onOpenChange={setIsDispenserDialogOpen}>
                <DialogContent className="rounded-3xl border-0 shadow-2xl p-0 overflow-hidden max-w-md">
                    <div className="bg-slate-900 p-8 text-white relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full -mr-16 -mt-16 blur-3xl" />
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-black uppercase italic tracking-tight">
                                {editingDispenser ? 'Refine' : 'Initialize'} <span className="text-primary">Unit</span>
                            </DialogTitle>
                            <DialogDescription className="text-slate-400 font-medium italic">Define the physical dispensing unit parameters.</DialogDescription>
                        </DialogHeader>
                    </div>
                    <form onSubmit={handleSaveDispenser} className="p-8 space-y-8 bg-white">
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Asset Designation</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g. Dispenser 01"
                                    value={dispenserName}
                                    onChange={(e) => setDispenserName(e.target.value)}
                                    required
                                    className="h-14 rounded-2xl border-slate-100 bg-slate-50 focus:border-primary/50 font-bold text-lg"
                                />
                            </div>
                            <div className="space-y-3">
                                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Fluid Reservoir Uplink</Label>
                                <div className="grid gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                    {tanks.length === 0 && (
                                        <div className="p-4 rounded-2xl border-2 border-dashed text-center text-xs font-bold text-slate-400 italic">No supply reservoirs found</div>
                                    )}
                                    {tanks.map(t => {
                                        const checked = tankIds.includes(t.id)
                                        return (
                                            <label
                                                key={t.id}
                                                className={cn(
                                                    "flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all border-2",
                                                    checked
                                                        ? "bg-primary/5 border-primary/30 shadow-sm"
                                                        : "bg-white border-slate-50 hover:border-slate-100"
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                                                        checked ? "bg-primary text-white" : "bg-slate-100 text-slate-400"
                                                    )}>
                                                        <Database className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <p className={cn("font-black text-sm uppercase italic", checked ? "text-primary" : "text-slate-600")}>{t.name}</p>
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t.products?.name || "Fuel"}</p>
                                                    </div>
                                                </div>
                                                <div className={cn(
                                                    "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                                                    checked ? "bg-primary border-primary" : "bg-white border-slate-200"
                                                )}>
                                                    {checked && <div className="w-2 h-2 rounded-full bg-white animate-in zoom-in" />}
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    className="hidden"
                                                    checked={checked}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setTankIds(prev => [...prev, t.id])
                                                        else setTankIds(prev => prev.filter(id => id !== t.id))
                                                    }}
                                                />
                                            </label>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="submit" className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-sm italic shadow-2xl shadow-primary/20">
                                {editingDispenser ? 'Save Configuration' : 'Confirm Deployment'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Nozzle Dialog */}
            <Dialog open={isNozzleDialogOpen} onOpenChange={setIsNozzleDialogOpen}>
                <DialogContent className="rounded-2xl border-2">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black">{editingNozzle ? 'Edit Nozzle' : 'New Nozzle'}</DialogTitle>
                        <DialogDescription className="font-medium">Assign a number and product to this nozzle.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSaveNozzle}>
                        <div className="py-6 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="nozzle_number" className="text-xs font-black uppercase tracking-widest ml-1 text-muted-foreground">Nozzle Number</Label>
                                <Input
                                    id="nozzle_number"
                                    type="number"
                                    placeholder="e.g. 1"
                                    value={nozzleData.nozzle_number}
                                    onChange={(e) => setNozzleData({ ...nozzleData, nozzle_number: e.target.value })}
                                    required
                                    className="h-12 rounded-xl border-2 focus-visible:ring-primary/20 font-bold"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase tracking-widest ml-1 text-muted-foreground">Product (Fuel Type)</Label>
                                <Select
                                    value={nozzleData.product_id}
                                    onValueChange={(v) => setNozzleData({ ...nozzleData, product_id: v })}
                                    required
                                >
                                    <SelectTrigger className="h-12 rounded-xl border-2 font-bold bg-background">
                                        <SelectValue placeholder="Select fuel type" />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-2 shadow-xl">
                                        {products.map(p => (
                                            <SelectItem key={p.id} value={p.id} className="font-bold rounded-lg focus:bg-primary/10">
                                                <div className="flex items-center gap-2">
                                                    <Droplet className="w-4 h-4 text-primary" />
                                                    {p.name} (Rs. {p.selling_price})
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="nozzle_side" className="text-xs font-black uppercase tracking-widest ml-1 text-muted-foreground">Location/Side (Optional)</Label>
                                <Input
                                    id="nozzle_side"
                                    placeholder="e.g. Left Side"
                                    value={nozzleData.nozzle_side || ""}
                                    onChange={(e) => setNozzleData({ ...nozzleData, nozzle_side: e.target.value })}
                                    className="h-12 rounded-xl border-2 focus-visible:ring-primary/20 font-bold"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="submit" className="w-full h-12 rounded-xl font-black text-lg shadow-lg shadow-primary/20" disabled={!nozzleData.product_id}>
                                {editingNozzle ? 'Update Nozzle' : 'Create Nozzle'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
