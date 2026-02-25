"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Plus, Edit2, CheckCircle2, CreditCard, Banknote, Building2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { BrandLoader } from "@/components/ui/brand-loader"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"

export default function PaymentMethodsPage() {
    const { toast } = useToast()
    const supabase = createClient()

    const [methods, setMethods] = useState<any[]>([])
    const [suppliers, setSuppliers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Dialog State
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingMethod, setEditingMethod] = useState<any>(null)
    const [saving, setSaving] = useState(false)

    // Form State
    const [formData, setFormData] = useState({
        name: "",
        type: "bank_card",
        supplier_id: "",
        hold_days: 0,
        is_active: true
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            const { data: mData, error: mErr } = await supabase
                .from('payment_methods')
                .select(`*, suppliers(name)`)
                .order('id')
            if (mErr) throw mErr
            setMethods(mData || [])

            const { data: sData, error: sErr } = await supabase
                .from('suppliers')
                .select('id, name')
            if (sErr) throw sErr
            setSuppliers(sData || [])

        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const openAddDialog = () => {
        setEditingMethod(null)
        setFormData({
            name: "",
            type: "bank_card",
            supplier_id: "",
            hold_days: 0,
            is_active: true
        })
        setIsDialogOpen(true)
    }

    const openEditDialog = (method: any) => {
        setEditingMethod(method)
        setFormData({
            name: method.name,
            type: method.type,
            supplier_id: method.supplier_id || "",
            hold_days: method.hold_days,
            is_active: method.is_active
        })
        setIsDialogOpen(true)
    }

    const handleSave = async () => {
        if (!formData.name) {
            toast({ title: "Validation Error", description: "Name is required.", variant: "destructive" })
            return
        }

        setSaving(true)
        try {
            const payload = {
                name: formData.name,
                type: formData.type,
                supplier_id: formData.type === 'supplier_card' ? formData.supplier_id : null,
                hold_days: formData.hold_days,
                is_active: formData.is_active
            }

            let error
            if (editingMethod) {
                const { error: updateErr } = await supabase
                    .from('payment_methods')
                    .update(payload)
                    .eq('id', editingMethod.id)
                error = updateErr
            } else {
                const { error: insertErr } = await supabase
                    .from('payment_methods')
                    .insert([payload])
                error = insertErr
            }

            if (error) throw error

            toast({ title: "Success", description: "Payment method saved successfully." })
            setIsDialogOpen(false)
            fetchData()
        } catch (err: any) {
            toast({ title: "Save Error", description: err.message, variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-10 pt-4">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b pb-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
                        <CreditCard className="h-8 w-8 text-primary" /> Payment Methods
                    </h1>
                    <p className="text-muted-foreground ml-[40px] text-sm">Manage payment types and hold durations.</p>
                </div>
                <Button onClick={openAddDialog}>
                    <Plus className="mr-2 h-4 w-4" /> Add Payment Method
                </Button>
            </div>

            <Card className="shadow-sm border-border">
                {loading ? (
                    <div className="h-64 flex items-center justify-center">
                        <BrandLoader size="lg" />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted text-muted-foreground uppercase text-[10px] tracking-wider font-bold">
                                <tr>
                                    <th className="px-6 py-4">Method Name</th>
                                    <th className="px-6 py-4">Type</th>
                                    <th className="px-6 py-4 text-center">Hold Period</th>
                                    <th className="px-6 py-4 text-center">Status</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {methods.map(method => (
                                    <tr key={method.id} className="hover:bg-muted/5 transition-colors">
                                        <td className="px-6 py-4 font-bold flex items-center gap-3">
                                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${method.type === 'cash' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {method.type === 'cash' ? <Banknote className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                                            </div>
                                            {method.name}
                                        </td>
                                        <td className="px-6 py-4">
                                            {method.type === 'cash' && <span className="text-xs uppercase px-2 py-1 bg-muted rounded font-bold">Cash</span>}
                                            {method.type === 'bank_card' && <span className="text-xs uppercase px-2 py-1 bg-muted rounded font-bold">Bank Card</span>}
                                            {method.type === 'supplier_card' && (
                                                <div>
                                                    <span className="text-xs uppercase px-2 py-1 bg-muted rounded font-bold">Supplier Card</span>
                                                    <div className="text-[10px] text-muted-foreground mt-1 tracking-tight flex items-center gap-1">
                                                        <Building2 className="h-3 w-3" /> {method.suppliers?.name || 'Unknown Supplier'}
                                                    </div>
                                                </div>
                                            )}
                                            {method.type === 'custom' && <span className="text-xs uppercase px-2 py-1 bg-muted rounded font-bold">Custom</span>}
                                        </td>
                                        <td className="px-6 py-4 text-center font-mono">
                                            {method.hold_days} <span className="text-xs text-muted-foreground">days</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {method.is_active ? (
                                                <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50 uppercase text-[10px]">Active</Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-muted-foreground uppercase text-[10px]">Inactive</Badge>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(method)}>
                                                <Edit2 className="h-4 w-4 text-primary" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editingMethod ? 'Edit Payment Method' : 'Add Payment Method'}</DialogTitle>
                        <DialogDescription>
                            Configure the behavior for this payment option at checkout.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label>Method Name</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="e.g., Shell Fleet Card"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Payment Type</Label>
                            <Select value={formData.type} onValueChange={(v) => setFormData(prev => ({ ...prev, type: v }))} disabled={formData.type === 'cash'}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cash">Cash (Immediate Settlement)</SelectItem>
                                    <SelectItem value="bank_card">Bank Card (Holds in Bank)</SelectItem>
                                    <SelectItem value="supplier_card">Supplier Card (Credits Supplier Ledger)</SelectItem>
                                    <SelectItem value="custom">Custom Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {formData.type === 'supplier_card' && (
                            <div className="space-y-2 animate-in slide-in-from-top-2">
                                <Label>Link Supplier Ledger</Label>
                                <Select value={formData.supplier_id} onValueChange={(v) => setFormData(prev => ({ ...prev, supplier_id: v }))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Supplier" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {suppliers.map(s => (
                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Hold Duration (Days)</Label>
                            <Input
                                type="number"
                                min="0"
                                value={formData.hold_days}
                                onChange={(e) => setFormData(prev => ({ ...prev, hold_days: parseInt(e.target.value) || 0 }))}
                                disabled={formData.type === 'cash'}
                            />
                            <p className="text-[10px] text-muted-foreground px-1">Money typically takes this long to appear in your account.</p>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t">
                            <Label className="flex flex-col gap-1 cursor-pointer">
                                <span className="font-bold">Active Status</span>
                                <span className="text-xs text-muted-foreground font-normal">Enable or disable this method for sales.</span>
                            </Label>
                            <Switch
                                checked={formData.is_active}
                                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                            />
                        </div>

                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? <BrandLoader size="xs" /> : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
