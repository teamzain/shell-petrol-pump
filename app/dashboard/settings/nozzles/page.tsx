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
import { addNozzle } from "@/app/actions/nozzle-actions"

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
        location: "",
        initial_reading: "",
    })

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
          products(name)
        `)
                .order("nozzle_number")

            const { data: productData } = await supabase
                .from("products")
                .select("id, name")
                .eq("type", "fuel")
                .eq("status", "active")

            setNozzles(nozzleData || [])
            setProducts(productData || [])
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
            await addNozzle({
                nozzle_number: formData.nozzle_number,
                product_id: formData.product_id,
                location: formData.location,
                initial_reading: parseFloat(formData.initial_reading),
            })

            toast.success("Nozzle configured successfully!")
            setIsDialogOpen(false)
            setFormData({ nozzle_number: "", product_id: "", location: "", initial_reading: "" })
            fetchData()
        } catch (error: any) {
            toast.error(error.message || "Failed to add nozzle")
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Nozzle Configuration</h1>
                    <p className="text-muted-foreground">Manage your fuel dispensers and meter readings.</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2">
                            <Plus className="w-4 h-4" />
                            Add Nozzle
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <form onSubmit={handleSubmit}>
                            <DialogHeader>
                                <DialogTitle>Configure New Nozzle</DialogTitle>
                                <DialogDescription>
                                    Enter the details for the new fuel dispenser nozzle.
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
                                    <Label htmlFor="location">Location/Position (Optional)</Label>
                                    <Input
                                        id="location"
                                        placeholder="e.g. Left Side - Bay 1"
                                        value={formData.location}
                                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
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
                                        value={formData.initial_reading}
                                        onChange={(e) => setFormData({ ...formData, initial_reading: e.target.value })}
                                    />
                                    <p className="text-[10px] text-muted-foreground">Current cumulative reading on meter</p>
                                </div>
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
                                    <TableHead>Location</TableHead>
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
                                        <TableCell>{nozzle.location || "-"}</TableCell>
                                        <TableCell className="text-right font-mono">
                                            {(nozzle.last_reading || 0).toLocaleString()} L
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={nozzle.status === "active" ? "default" : "secondary"}>
                                                {nozzle.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon">
                                                <Edit2 className="w-4 h-4" />
                                            </Button>
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
