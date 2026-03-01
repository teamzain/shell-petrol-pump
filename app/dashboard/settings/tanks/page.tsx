"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { getTodayPKT, cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { Plus, Trash2, Edit2, Save, X, Database, AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { BrandLoader } from "@/components/ui/brand-loader"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function TanksPage() {
    const { toast } = useToast()
    const supabase = createClient()

    const [tanks, setTanks] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingTank, setEditingTank] = useState<any>(null)
    const [formData, setFormData] = useState({
        name: "",
        product_id: "",
        capacity: 0,
        dry_level: 500,
        current_level: 0
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [tanksRes, productsRes] = await Promise.all([
                supabase.from('tanks').select('*, products(name)').order('created_at'),
                supabase.from('products').select('*').eq('type', 'fuel')
            ])
            setTanks(tanksRes.data || [])
            setProducts(productsRes.data || [])
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            if (editingTank) {
                const { error } = await supabase.from('tanks').update(formData).eq('id', editingTank.id)
                if (error) throw error
                toast({ title: "Success", description: "Tank updated successfully" })
            } else {
                const { error } = await supabase.from('tanks').insert(formData)
                if (error) throw error
                toast({ title: "Success", description: "Tank created successfully" })
            }
            setIsDialogOpen(false)
            fetchData()
        } catch (err: any) {
            toast({ title: "Save Failed", description: err.message, variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this tank?")) return
        try {
            const { error } = await supabase.from('tanks').delete().eq('id', id)
            if (error) throw error
            toast({ title: "Deleted", description: "Tank removed successfully" })
            fetchData()
        } catch (err: any) {
            toast({ title: "Delete Failed", description: err.message, variant: "destructive" })
        }
    }

    const openAddDialog = () => {
        setEditingTank(null)
        setFormData({ name: "", product_id: "", capacity: 0, dry_level: 500, current_level: 0 })
        setIsDialogOpen(true)
    }

    const openEditDialog = (tank: any) => {
        setEditingTank(tank)
        setFormData({
            name: tank.name,
            product_id: tank.product_id,
            capacity: tank.capacity,
            dry_level: tank.dry_level,
            current_level: tank.current_level
        })
        setIsDialogOpen(true)
    }

    if (loading) return <div className="h-screen flex items-center justify-center"><BrandLoader /></div>

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter uppercase italic">Fuel <span className="text-primary">Tanks</span></h1>
                    <p className="text-muted-foreground">Manage storage tanks, capacities, and safety dry levels.</p>
                </div>
                <Button onClick={openAddDialog} className="shadow-lg border-2 border-primary/20">
                    <Plus className="mr-2 h-4 w-4" /> Add New Tank
                </Button>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {tanks.map(tank => (
                    <Card key={tank.id} className="relative overflow-hidden group border-2 hover:border-primary/50 transition-all shadow-sm">
                        <div className="absolute top-0 right-0 p-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="icon" variant="ghost" className="h-8 w-8 bg-white/80 shadow-sm" onClick={() => openEditDialog(tank)}>
                                <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 bg-white/80 shadow-sm text-red-500 hover:text-red-700" onClick={() => handleDelete(tank.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2 mb-1">
                                <Database className="h-5 w-5 text-primary" />
                                <CardTitle className="tracking-tight">{tank.name}</CardTitle>
                            </div>
                            <CardDescription>{tank.products?.name || "No Product Linked"}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="relative h-6 w-full bg-muted rounded-full overflow-hidden border">
                                    <div
                                        className={cn(
                                            "h-full transition-all duration-1000",
                                            (tank.current_level / tank.capacity) < 0.2 ? "bg-red-500" : "bg-blue-500"
                                        )}
                                        style={{ width: `${(tank.current_level / tank.capacity) * 100}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-sm">
                                    <div>
                                        <span className="text-muted-foreground block text-[10px] uppercase font-bold">Current</span>
                                        <span className="font-black text-lg">{tank.current_level.toLocaleString()} L</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-muted-foreground block text-[10px] uppercase font-bold">Capacity</span>
                                        <span className="font-bold">{tank.capacity.toLocaleString()} L</span>
                                    </div>
                                </div>
                                {tank.current_level < tank.dry_level && (
                                    <div className="flex items-center gap-2 p-2 bg-red-50 rounded border border-red-100 text-red-700 text-xs font-bold animate-pulse">
                                        <AlertTriangle className="h-4 w-4" /> DRY LEVEL WARNING
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{editingTank ? "Edit Tank" : "Add New Tank"}</DialogTitle>
                        <DialogDescription>Configure storage tank details and safety thresholds.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Tank Name</Label>
                            <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Super Tank North" />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="product">Linked Product (Fuel)</Label>
                            <Select value={formData.product_id} onValueChange={(val) => setFormData({ ...formData, product_id: val })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select fuel type" />
                                </SelectTrigger>
                                <SelectContent>
                                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="capacity">Capacity (L)</Label>
                                <Input id="capacity" type="number" value={formData.capacity} onChange={(e) => setFormData({ ...formData, capacity: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="dry_level">Dry Level (L)</Label>
                                <Input id="dry_level" type="number" value={formData.dry_level} onChange={(e) => setFormData({ ...formData, dry_level: parseFloat(e.target.value) || 0 })} />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="current">Current Reading (L)</Label>
                            <Input id="current" type="number" value={formData.current_level} onChange={(e) => setFormData({ ...formData, current_level: parseFloat(e.target.value) || 0 })} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? <BrandLoader size="xs" /> : "Save Tank"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
