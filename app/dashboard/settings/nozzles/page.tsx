"use client"

import { useState, useEffect } from "react"
import { Plus, Gauge, MapPin, Activity, Edit2, Save, X, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { addNozzle, updateNozzle, deleteNozzle } from "@/app/actions/nozzle-actions"
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
import { Trash2 } from "lucide-react"

export default function NozzleSettingsPage() {
    const [nozzles, setNozzles] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    // Form State
    const [formData, setFormData] = useState({
        nozzle_number: "",
        product_id: "",
        dispenser_id: "",
        nozzle_side: "",
        initial_reading: "",
        status: "active"
    })
    const [editingNozzle, setEditingNozzle] = useState<any>(null)
    const [dispensers, setDispensers] = useState<any[]>([])

    const supabase = createClient()

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        setIsLoading(true)
        try {
            const { data: nozzleData } = await supabase
                .from("nozzles")
                .select(`
          *,
          products(name),
          dispensers(name)
        `)
                .order("nozzle_number")

            const { data: productData } = await supabase
                .from("products")
                .select("id, name")
                .eq("type", "fuel")
                .eq("status", "active")

            const { data: dispenserData } = await supabase
                .from("dispensers")
                .select("id, name")
                .eq("status", "active")

            setNozzles(nozzleData || [])
            setProducts(productData || [])
            setDispensers(dispenserData || [])
        } catch (error) {
            console.error("Fetch error:", error)
            toast.error("Failed to load settings")
        } finally {
            setIsLoading(false)
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setIsSaving(true)

        try {
            if (editingNozzle) {
                await updateNozzle(editingNozzle.id, {
                    nozzle_number: formData.nozzle_number,
                    product_id: formData.product_id,
                    dispenser_id: formData.dispenser_id,
                    nozzle_side: formData.nozzle_side,
                    status: formData.status
                })
                toast.success("Nozzle updated successfully!")
            } else {
                await addNozzle({
                    nozzle_number: formData.nozzle_number,
                    product_id: formData.product_id,
                    dispenser_id: formData.dispenser_id,
                    nozzle_side: formData.nozzle_side,
                    initial_reading: parseFloat(formData.initial_reading),
                })
                toast.success("Nozzle configured successfully!")
            }

            setIsDialogOpen(false)
            setFormData({ nozzle_number: "", product_id: "", dispenser_id: "", nozzle_side: "", initial_reading: "", status: "active" })
            setEditingNozzle(null)
            fetchData()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleDelete(id: string) {
        try {
            await deleteNozzle(id)
            toast.success("Nozzle deleted")
            fetchData()
        } catch (error: any) {
            toast.error(error.message || "Failed to delete nozzle")
        }
    }

    const openEditDialog = (nozzle: any) => {
        setEditingNozzle(nozzle)
        setFormData({
            nozzle_number: nozzle.nozzle_number,
            product_id: nozzle.product_id,
            dispenser_id: nozzle.dispenser_id || "",
            nozzle_side: nozzle.nozzle_side || "",
            initial_reading: nozzle.initial_reading?.toString() || "0",
            status: nozzle.status || "active"
        })
        setIsDialogOpen(true)
    }

    const openAddDialog = () => {
        setEditingNozzle(null)
        setFormData({
            nozzle_number: "",
            product_id: "",
            dispenser_id: "",
            nozzle_side: "",
            initial_reading: "",
            status: "active"
        })
        setIsDialogOpen(true)
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Nozzle Configuration</h1>
                    <p className="text-muted-foreground">Manage your fuel dispensers and meter readings.</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open)
                    if (!open) {
                        setEditingNozzle(null)
                        setFormData({ nozzle_number: "", product_id: "", dispenser_id: "", nozzle_side: "", initial_reading: "", status: "active" })
                    }
                }}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 shadow-sm border-2 border-primary/10" onClick={openAddDialog}>
                            <Plus className="w-4 h-4" />
                            Add Nozzle
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <form onSubmit={handleSubmit}>
                            <DialogHeader>
                                <DialogTitle>{editingNozzle ? 'Edit Nozzle' : 'Configure New Nozzle'}</DialogTitle>
                                <DialogDescription>
                                    {editingNozzle ? 'Update the details for this fuel nozzle.' : 'Enter the details for the new fuel dispenser nozzle.'}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="nozzle_number">Nozzle Number/Name</Label>
                                    <Input
                                        id="nozzle_number"
                                        placeholder="e.g. N1, Nozzle 1"
                                        required
                                        value={formData.nozzle_number}
                                        onChange={(e) => setFormData({ ...formData, nozzle_number: e.target.value })}
                                    />
                                    <p className="text-[10px] text-muted-foreground">Unique identifier for this dispenser</p>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="product">Fuel Type</Label>
                                    <Select
                                        value={formData.product_id}
                                        onValueChange={(v) => setFormData({ ...formData, product_id: v })}
                                        required
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select fuel type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {products.map((p) => (
                                                <SelectItem key={p.id} value={p.id}>
                                                    {p.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="dispenser">Dispenser</Label>
                                    <Select
                                        value={formData.dispenser_id}
                                        onValueChange={(v) => setFormData({ ...formData, dispenser_id: v })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select dispenser (Optional)" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {dispensers.map((d) => (
                                                <SelectItem key={d.id} value={d.id}>
                                                    {d.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="nozzle_side">Location/Side (Optional)</Label>
                                    <Input
                                        id="nozzle_side"
                                        placeholder="e.g. Left Side - Bay 1"
                                        value={formData.nozzle_side}
                                        onChange={(e) => setFormData({ ...formData, nozzle_side: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="reading">Initial Meter Reading (Liters)</Label>
                                    <Input
                                        id="reading"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        required
                                        disabled={!!editingNozzle}
                                        value={formData.initial_reading}
                                        onChange={(e) => setFormData({ ...formData, initial_reading: e.target.value })}
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        {editingNozzle ? "Initial reading cannot be changed after configuration" : "Current cumulative reading on meter"}
                                    </p>
                                </div>
                                {editingNozzle && (
                                    <div className="grid gap-2">
                                        <Label htmlFor="status">Status</Label>
                                        <Select
                                            value={formData.status}
                                            onValueChange={(v) => setFormData({ ...formData, status: v })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select status" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="inactive">Inactive</SelectItem>
                                                <SelectItem value="maintenance">Maintenance</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={isSaving}>
                                    {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Save Configuration
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Configured Nozzles</CardTitle>
                    <CardDescription>
                        A list of all active fuel nozzles in your station. Total Active: {nozzles.filter(n => n.status === 'active').length}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : nozzles.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Gauge className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p>No nozzles configured yet.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nozzle</TableHead>
                                    <TableHead>Fuel Type</TableHead>
                                    <TableHead>Dispenser</TableHead>
                                    <TableHead>Location/Side</TableHead>
                                    <TableHead className="text-right">Last Reading</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {nozzles.map((nozzle) => (
                                    <TableRow key={nozzle.id}>
                                        <TableCell className="font-medium">{nozzle.nozzle_number}</TableCell>
                                        <TableCell>{nozzle.products?.name}</TableCell>
                                        <TableCell>{nozzle.dispensers?.name || "Unassigned"}</TableCell>
                                        <TableCell>{nozzle.nozzle_side || "-"}</TableCell>
                                        <TableCell className="text-right font-mono">
                                            {(nozzle.last_reading || 0).toLocaleString()} L
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={nozzle.status === "active" ? "default" : "secondary"}>
                                                {nozzle.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right flex items-center justify-end gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(nozzle)}>
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
                                                            This will permanently delete nozzle <strong>{nozzle.nozzle_number}</strong>.
                                                            This action cannot be undone.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            onClick={() => handleDelete(nozzle.id)}
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
        </div>
    )
}
