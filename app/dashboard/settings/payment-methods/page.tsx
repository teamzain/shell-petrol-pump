"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import {
    Plus,
    Trash2,
    CreditCard,
    Building2,
    Settings,
    CheckCircle2,
    AlertCircle,
    Banknote
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { BrandLoader } from "@/components/ui/brand-loader"

export default function PaymentMethodsPage() {
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [methods, setMethods] = useState<any[]>([])
    const [error, setError] = useState("")
    const [success, setSuccess] = useState<string | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    const [formData, setFormData] = useState({
        name: "",
        type: "bank_card",
        hold_days: "0",
        is_active: true
    })

    const supabase = createClient()

    useEffect(() => {
        fetchMethods()
    }, [])

    const fetchMethods = async () => {
        setLoading(true)
        try {
            const { data, error: err } = await supabase
                .from('payment_methods')
                .select('*')
                .order('name')
            if (err) throw err
            setMethods(data || [])
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        if (!formData.name) return
        setSaving(true)
        setError("")
        try {
            const { error: err } = await supabase
                .from('payment_methods')
                .insert([{
                    name: formData.name,
                    type: formData.type,
                    hold_days: parseInt(formData.hold_days) || 0,
                    is_active: formData.is_active
                }])
            if (err) throw err

            setSuccess("Payment method added successfully")
            setIsDialogOpen(false)
            setFormData({ name: "", type: "bank_card", hold_days: "0", is_active: true })
            fetchMethods()
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        try {
            const { error: err } = await supabase
                .from('payment_methods')
                .delete()
                .eq('id', id)
            if (err) throw err
            setSuccess("Payment method deleted")
            fetchMethods()
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            setError(err.message)
        }
    }

    if (loading) return <div className="h-[60vh] flex items-center justify-center"><BrandLoader /></div>

    return (
        <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Payment Methods</h1>
                    <p className="text-muted-foreground">Manage cards, banks, and other payment channels.</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Add New Method
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add Payment Method</DialogTitle>
                            <DialogDescription>
                                Users will be able to select this method during daily sales entry.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Method Name</Label>
                                    <Input
                                        id="name"
                                        placeholder="e.g. HBL Card"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="hold_days">Hold Days</Label>
                                    <Input
                                        id="hold_days"
                                        type="number"
                                        value={formData.hold_days}
                                        onChange={(e) => setFormData({ ...formData, hold_days: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="type">Type</Label>
                                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                                    <SelectTrigger id="type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cash">💵 Cash</SelectItem>
                                        <SelectItem value="bank_card">💳 Bank Card</SelectItem>
                                        <SelectItem value="shell_card">🐚 Shell Card</SelectItem>
                                        <SelectItem value="supplier_card">🚛 Supplier Card</SelectItem>
                                        <SelectItem value="digital_wallet">📱 Digital Wallet</SelectItem>
                                        <SelectItem value="other">❓ Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleSave} disabled={saving}>
                                {saving ? <BrandLoader size="xs" /> : "Save Method"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {success && (
                <Alert className="border-green-200 bg-green-50">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800 font-bold">Success</AlertTitle>
                    <AlertDescription className="text-green-700">{success}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Configured Methods</CardTitle>
                    <CardDescription>All active payment methods available in the system.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Method Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {methods.map((m) => (
                                <TableRow key={m.id}>
                                    <TableCell className="font-medium">{m.name}</TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="capitalize">
                                            {m.type.replace('_', ' ')}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={m.is_active ? "default" : "secondary"}>
                                            {m.is_active ? "Active" : "Inactive"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {m.type !== 'cash' && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-muted-foreground hover:text-destructive"
                                                onClick={() => handleDelete(m.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {methods.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                                        No payment methods found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
