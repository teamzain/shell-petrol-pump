"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Plus, Trash2, Edit2, Save, X, Package, Droplet, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { BrandLoader } from "@/components/ui/brand-loader"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

export default function LubricantsPage() {
    const { toast } = useToast()
    const supabase = createClient()

    const [lubricants, setLubricants] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [search, setSearch] = useState("")

    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingLube, setEditingLube] = useState<any>(null)
    const [formData, setFormData] = useState({
        name: "",
        type: "oil",
        category: "Engine Oil",
        unit: "Units",
        selling_price: 0,
        purchase_price: 0,
        lubricant_type: "packed",
        current_stock: 0
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('type', 'oil')
                .order('name')

            setLubricants(data || [])
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            if (editingLube) {
                const { error } = await supabase.from('products').update(formData).eq('id', editingLube.id)
                if (error) throw error
                toast({ title: "Success", description: "Lubricant updated successfully" })
            } else {
                const { error } = await supabase.from('products').insert({
                    ...formData,
                    type: 'oil'
                })
                if (error) throw error
                toast({ title: "Success", description: "Lubricant created successfully" })
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
        if (!confirm("Are you sure you want to delete this lubricant?")) return
        try {
            const { error } = await supabase.from('products').delete().eq('id', id)
            if (error) throw error
            toast({ title: "Deleted", description: "Lubricant removed successfully" })
            fetchData()
        } catch (err: any) {
            toast({ title: "Delete Failed", description: err.message, variant: "destructive" })
        }
    }

    const filteredLubes = lubricants.filter(l => l.name.toLowerCase().includes(search.toLowerCase()))

    if (loading) return <div className="h-screen flex items-center justify-center"><BrandLoader /></div>

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter uppercase italic">Lubricants <span className="text-primary">Master</span></h1>
                    <p className="text-muted-foreground">Manage engine oils, brake oils and other lubricants.</p>
                </div>
                <Button onClick={() => {
                    setEditingLube(null)
                    setFormData({
                        name: "", type: "oil", category: "Engine Oil", unit: "Units",
                        selling_price: 0, purchase_price: 0, lubricant_type: "packed", current_stock: 0
                    })
                    setIsDialogOpen(true)
                }}>
                    <Plus className="mr-2 h-4 w-4" /> Add Lubricant
                </Button>
            </div>

            <Card>
                <CardHeader className="pb-3 bg-muted/20">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search lubricants by name..."
                            className="pl-10"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Product Name</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Selling Type</TableHead>
                                <TableHead className="text-right">Price (PKR)</TableHead>
                                <TableHead className="text-right">Stock</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredLubes.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-10">No lubricants found.</TableCell></TableRow>
                            ) : filteredLubes.map(l => (
                                <TableRow key={l.id}>
                                    <TableCell className="font-bold">{l.name}</TableCell>
                                    <TableCell><Badge variant="outline">{l.category}</Badge></TableCell>
                                    <TableCell>
                                        <Badge className={l.lubricant_type === 'loose' ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"}>
                                            {l.lubricant_type === 'loose' ? "Loose (Litre)" : "Packed (Unit)"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-black">{l.selling_price.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">
                                        <span className={l.current_stock < 5 ? "text-red-500 font-bold" : ""}>
                                            {l.current_stock} {l.unit}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => {
                                                setEditingLube(l)
                                                setFormData({
                                                    name: l.name, type: "oil", category: l.category, unit: l.unit,
                                                    selling_price: l.selling_price, purchase_price: l.purchase_price,
                                                    lubricant_type: l.lubricant_type || 'packed', current_stock: l.current_stock
                                                })
                                                setIsDialogOpen(true)
                                            }}><Edit2 className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(l.id)} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>{editingLube ? "Edit Lubricant" : "Add Lubricant"}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Product Name</Label>
                            <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Shell Helix HX7 5W-40" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Category</Label>
                                <Input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} placeholder="e.g. Engine Oil" />
                            </div>
                            <div className="grid gap-2">
                                <Label>Selling Type</Label>
                                <Select value={formData.lubricant_type} onValueChange={(val) => setFormData({ ...formData, lubricant_type: val, unit: val === 'loose' ? 'Litres' : 'Units' })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="loose">Loose (By Litre)</SelectItem>
                                        <SelectItem value="packed">Packed (By Unit)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Purchase Price</Label>
                                <Input type="number" value={formData.purchase_price} onChange={(e) => setFormData({ ...formData, purchase_price: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div className="grid gap-2">
                                <Label>Selling Price</Label>
                                <Input type="number" value={formData.selling_price} onChange={(e) => setFormData({ ...formData, selling_price: parseFloat(e.target.value) || 0 })} />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label>Current Stock {formData.unit}</Label>
                            <Input type="number" value={formData.current_stock} onChange={(e) => setFormData({ ...formData, current_stock: parseFloat(e.target.value) || 0 })} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving}>Save Lubricant</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
