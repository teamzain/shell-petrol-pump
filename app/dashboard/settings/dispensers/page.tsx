"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
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
    Settings2,
    Fuel,
    ChevronRight,
    Search,
    PlusCircle
} from "lucide-react"
import { BrandLoader as Loader } from "@/components/ui/brand-loader"
import { toast } from "sonner"
import { getDispensers, saveDispenser, deleteDispenser, saveNozzle, deleteNozzle } from "@/app/actions/sales-setup"
import { getProducts } from "@/app/actions/products"
import { Badge } from "@/components/ui/badge"

export default function DispensersPage() {
    const [loading, setLoading] = useState(true)
    const [dispensers, setDispensers] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])

    const [isDispenserDialogOpen, setIsDispenserDialogOpen] = useState(false)
    const [editingDispenser, setEditingDispenser] = useState<any>(null)
    const [dispenserName, setDispenserName] = useState("")

    const [isNozzleDialogOpen, setIsNozzleDialogOpen] = useState(false)
    const [editingNozzle, setEditingNozzle] = useState<any>(null)
    const [nozzleData, setNozzleData] = useState({
        dispenser_id: "",
        nozzle_number: "",
        product_id: "",
        status: "active"
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [dispData, prodData] = await Promise.all([
                getDispensers(),
                getProducts('fuel')
            ])
            setDispensers(dispData || [])
            setProducts(prodData || [])
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
                name: dispenserName
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
        <div className="container py-8 space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
                        <Settings2 className="w-10 h-10 text-primary" /> Dispensers & Nozzles
                    </h1>
                    <p className="text-muted-foreground mt-1 font-medium">Configure your fuel station's layout and equipment.</p>
                </div>
                <Button onClick={() => {
                    setEditingDispenser(null)
                    setDispenserName("")
                    setIsDispenserDialogOpen(true)
                }} className="h-12 px-6 rounded-xl font-bold shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95">
                    <Plus className="w-5 h-5 mr-2" /> Add Dispenser
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {dispensers.map((dispenser) => (
                    <Card key={dispenser.id} className="relative overflow-hidden group border-2 hover:border-primary/50 transition-all duration-300 shadow-md hover:shadow-xl">
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-primary/20 group-hover:bg-primary transition-colors" />
                        <CardHeader className="flex flex-row items-center justify-between pb-2 bg-muted/30">
                            <div>
                                <CardTitle className="text-xl font-black">{dispenser.name}</CardTitle>
                                <CardDescription className="text-xs uppercase font-bold tracking-widest text-muted-foreground">
                                    {dispenser.nozzles?.length || 0} Nozzles Configured
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => {
                                    setEditingDispenser(dispenser)
                                    setDispenserName(dispenser.name)
                                    setIsDispenserDialogOpen(true)
                                }}>
                                    <Pencil className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10" onClick={() => handleDeleteDispenser(dispenser.id)}>
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="space-y-3">
                                {dispenser.nozzles?.map((nozzle: any) => (
                                    <div key={nozzle.id} className="flex items-center justify-between p-3 rounded-xl bg-background border border-border shadow-sm group/nozzle transition-all hover:translate-x-1">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-black text-primary">
                                                {nozzle.nozzle_number}
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm leading-tight">{nozzle.products?.name || "No Product"}</p>
                                                <p className="text-[10px] text-muted-foreground uppercase font-black items-center flex gap-1 tracking-tighter">
                                                    <Droplet className="w-3 h-3 text-primary" />
                                                    Rs. {nozzle.products?.selling_price || 0} / Liter
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover/nozzle:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => {
                                                setEditingNozzle(nozzle)
                                                setNozzleData({
                                                    dispenser_id: dispenser.id,
                                                    nozzle_number: nozzle.nozzle_number.toString(),
                                                    product_id: nozzle.product_id,
                                                    status: nozzle.status
                                                })
                                                setIsNozzleDialogOpen(true)
                                            }}>
                                                <Pencil className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10" onClick={() => handleDeleteNozzle(nozzle.id)}>
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}

                                <Button
                                    variant="outline"
                                    className="w-full h-12 border-dashed border-2 rounded-xl text-muted-foreground font-bold hover:text-primary hover:border-primary/50 transition-all hover:bg-primary/5"
                                    onClick={() => {
                                        setEditingNozzle(null)
                                        setNozzleData({
                                            dispenser_id: dispenser.id,
                                            nozzle_number: (dispenser.nozzles?.length + 1 || 1).toString(),
                                            product_id: "",
                                            status: "active"
                                        })
                                        setIsNozzleDialogOpen(true)
                                    }}
                                >
                                    <PlusCircle className="w-4 h-4 mr-2" /> Add Nozzle
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {dispensers.length === 0 && (
                    <div className="col-span-full py-24 text-center border-2 border-dashed rounded-3xl bg-muted/20">
                        <Fuel className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                        <h3 className="text-xl font-bold">No Dispensers Found</h3>
                        <p className="text-muted-foreground max-w-xs mx-auto mt-2">Start by adding your fuel dispensaries below to configure nozzles.</p>
                        <Button onClick={() => setIsDispenserDialogOpen(true)} className="mt-6 h-12 px-8 rounded-xl font-bold">
                            Add First Dispenser
                        </Button>
                    </div>
                )}
            </div>

            {/* Dispenser Dialog */}
            <Dialog open={isDispenserDialogOpen} onOpenChange={setIsDispenserDialogOpen}>
                <DialogContent className="rounded-2xl border-2">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black">{editingDispenser ? 'Edit Dispenser' : 'New Dispenser'}</DialogTitle>
                        <DialogDescription className="font-medium"> Give your dispenser a name (e.g. Dispenser 1, Bay A).</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSaveDispenser}>
                        <div className="py-6 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-xs font-black uppercase tracking-widest ml-1 text-muted-foreground">Dispenser Name</Label>
                                <Input
                                    id="name"
                                    placeholder="Enter dispenser name..."
                                    value={dispenserName}
                                    onChange={(e) => setDispenserName(e.target.value)}
                                    required
                                    className="h-12 rounded-xl border-2 focus-visible:ring-primary/20 font-bold"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="submit" className="w-full h-12 rounded-xl font-black text-lg shadow-lg shadow-primary/20">
                                {editingDispenser ? 'Update Dispenser' : 'Create Dispenser'}
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
