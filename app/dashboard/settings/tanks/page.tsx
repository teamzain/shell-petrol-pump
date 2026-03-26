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
import { Badge } from "@/components/ui/badge"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

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

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Tank Configuration</h1>
                    <p className="text-muted-foreground">Manage storage tanks, capacities, and safety dry levels.</p>
                </div>
                <Button onClick={openAddDialog} className="gap-2 shadow-sm border-2 border-primary/10">
                    <Plus className="w-4 h-4" /> Add New Tank
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Configured Storage Tanks</CardTitle>
                    <CardDescription>
                        A list of all fuel storage tanks in your station. Total Capacity: {tanks.reduce((acc, t) => acc + Number(t.capacity), 0).toLocaleString()} L
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <BrandLoader />
                        </div>
                    ) : tanks.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Database className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p>No tanks configured yet.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tank Name</TableHead>
                                    <TableHead>Linked Product</TableHead>
                                    <TableHead className="text-right">Capacity</TableHead>
                                    <TableHead className="text-right">Current Stock</TableHead>
                                    <TableHead className="text-right">Dry Level</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tanks.map((tank) => (
                                    <TableRow key={tank.id}>
                                        <TableCell className="font-medium">{tank.name}</TableCell>
                                        <TableCell>{tank.products?.name || "No Product Linked"}</TableCell>
                                        <TableCell className="text-right font-mono">{tank.capacity.toLocaleString()} L</TableCell>
                                        <TableCell className="text-right font-mono">
                                            <span className={cn(
                                                "font-black",
                                                tank.current_level < tank.dry_level ? "text-red-500" : "text-primary"
                                            )}>
                                                {tank.current_level.toLocaleString()} L
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground font-mono">{tank.dry_level.toLocaleString()} L</TableCell>
                                        <TableCell>
                                            <Badge variant={tank.current_level < tank.dry_level ? "destructive" : "default"}>
                                                {tank.current_level < tank.dry_level ? "Low Level" : "Healthy"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right flex items-center justify-end gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(tank)}>
                                                <Edit2 className="w-4 h-4" />
                                            </Button>

                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This will permanently delete tank <strong>{tank.name}</strong>.
                                                            This action cannot be undone.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            onClick={() => handleDelete(tank.id)}
                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                        >
                                                            Delete
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

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
                            <Label htmlFor="current">Tank Stock (L)</Label>
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
