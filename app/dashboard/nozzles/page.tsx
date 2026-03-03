"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Fuel,
  Gauge,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react"
import { BrandLoader } from "@/components/ui/brand-loader"
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog"

interface Nozzle {
  id: string
  nozzle_number: string
  dispenser_id: string | null
  dispenser_number: string | null
  nozzle_side: string | null
  product_id: string
  initial_reading: number
  current_reading: number
  status: string
  products: {
    product_name: string
    product_type: string
  }
}

interface Product {
  id: string
  product_name: string
  product_type: string
}

interface Dispenser {
  id: string
  name: string
  tank_id: string | null
  status: string
  tanks?: {
    name: string
  }
}

export default function NozzlesPage() {
  const [nozzles, setNozzles] = useState<Nozzle[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [dispensers, setDispensers] = useState<Dispenser[]>([])
  const [tanks, setTanks] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState("nozzles")

  // Nozzle Dialog State
  const [nozzleDialogOpen, setNozzleDialogOpen] = useState(false)
  const [nozzleDeleteDialogOpen, setNozzleDeleteDialogOpen] = useState(false)
  const [selectedNozzle, setSelectedNozzle] = useState<Nozzle | null>(null)
  const [nozzleFormData, setNozzleFormData] = useState({
    nozzle_number: "",
    dispenser_id: "",
    nozzle_side: "",
    product_id: "",
    initial_reading: "0",
  })

  // Dispenser Dialog State
  const [dispenserDialogOpen, setDispenserDialogOpen] = useState(false)
  const [dispenserDeleteDialogOpen, setDispenserDeleteDialogOpen] = useState(false)
  const [selectedDispenser, setSelectedDispenser] = useState<Dispenser | null>(null)
  const [dispenserFormData, setDispenserFormData] = useState({
    name: "",
    tank_id: "",
  })

  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError("")
    try {
      // Fetch Nozzles
      const { data: nozzlesData, error: nErr } = await supabase
        .from('nozzles')
        .select(`
          *,
          dispensers(name),
          products(name, type)
        `)
        .order('nozzle_number')

      if (nErr) throw nErr
      setNozzles(nozzlesData?.map((n: any) => ({
        ...n,
        dispenser_number: n.dispensers?.name || "Unassigned",
        products: {
          product_name: n.products?.name || "Unknown",
          product_type: n.products?.type || "unknown"
        }
      })) || [])

      // Fetch Products
      const { data: productsData, error: pErr } = await supabase
        .from('products')
        .select('id, name, type')
        .eq('status', 'active')
        .eq('type', 'fuel')

      if (pErr) throw pErr
      setProducts(productsData?.map((p: any) => ({
        id: p.id,
        product_name: p.name,
        product_type: p.type
      })) || [])

      // Fetch Dispensers
      const { data: dispensersData, error: dErr } = await supabase
        .from('dispensers')
        .select(`
          *,
          tanks(name)
        `)
        .eq('status', 'active')
        .order('name')

      if (dErr) throw dErr
      setDispensers(dispensersData || [])

      // Fetch Tanks
      const { data: tanksData, error: tErr } = await supabase
        .from('tanks')
        .select('id, name')
        .order('name')

      if (tErr) throw tErr
      setTanks(tanksData || [])

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // --- Nozzle Handlers ---
  const handleOpenNozzleDialog = (nozzle?: Nozzle) => {
    if (nozzle) {
      setSelectedNozzle(nozzle)
      setNozzleFormData({
        nozzle_number: nozzle.nozzle_number,
        dispenser_id: nozzle.dispenser_id || "",
        nozzle_side: nozzle.nozzle_side || "",
        product_id: nozzle.product_id,
        initial_reading: nozzle.initial_reading.toString(),
      })
    } else {
      setSelectedNozzle(null)
      setNozzleFormData({
        nozzle_number: "",
        dispenser_id: "",
        nozzle_side: "",
        product_id: "",
        initial_reading: "0",
      })
    }
    setError("")
    setNozzleDialogOpen(true)
  }

  const handleSaveNozzle = async () => {
    if (!nozzleFormData.nozzle_number) {
      setError("Nozzle number is required")
      return
    }
    if (!nozzleFormData.product_id) {
      setError("Fuel type is required")
      return
    }

    setSaving(true)
    setError("")
    try {
      const payload = {
        nozzle_number: nozzleFormData.nozzle_number,
        dispenser_id: nozzleFormData.dispenser_id || null,
        nozzle_side: nozzleFormData.nozzle_side || null,
        product_id: nozzleFormData.product_id,
        initial_reading: parseFloat(nozzleFormData.initial_reading) || 0,
        status: 'active'
      }

      if (selectedNozzle) {
        const { error: err } = await supabase
          .from('nozzles')
          .update(payload)
          .eq('id', selectedNozzle.id)
        if (err) throw err
        setSuccess("Nozzle updated successfully")
      } else {
        const { error: err } = await supabase
          .from('nozzles')
          .insert([payload])
        if (err) throw err
        setSuccess("Nozzle added successfully")
      }

      setNozzleDialogOpen(false)
      fetchData()
      setTimeout(() => setSuccess(""), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteNozzle = async () => {
    if (!selectedNozzle) return
    setSaving(true)
    try {
      const { error: err } = await supabase
        .from('nozzles')
        .delete()
        .eq('id', selectedNozzle.id)
      if (err) throw err

      setSuccess("Nozzle deleted successfully")
      setNozzleDeleteDialogOpen(false)
      setSelectedNozzle(null)
      fetchData()
      setTimeout(() => setSuccess(""), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // --- Dispenser Handlers ---
  const handleOpenDispenserDialog = (dispenser?: Dispenser) => {
    if (dispenser) {
      setSelectedDispenser(dispenser)
      setDispenserFormData({
        name: dispenser.name,
        tank_id: dispenser.tank_id || "",
      })
    } else {
      setSelectedDispenser(null)
      setDispenserFormData({
        name: "",
        tank_id: "",
      })
    }
    setError("")
    setDispenserDialogOpen(true)
  }

  const handleSaveDispenser = async () => {
    if (!dispenserFormData.name) {
      setError("Dispenser name is required")
      return
    }

    setSaving(true)
    setError("")
    try {
      const payload = {
        name: dispenserFormData.name,
        tank_id: dispenserFormData.tank_id || null,
        status: 'active'
      }

      if (selectedDispenser) {
        const { error: err } = await supabase
          .from('dispensers')
          .update(payload)
          .eq('id', selectedDispenser.id)
        if (err) throw err
        setSuccess("Dispenser updated successfully")
      } else {
        const { error: err } = await supabase
          .from('dispensers')
          .insert([payload])
        if (err) throw err
        setSuccess("Dispenser added successfully")
      }

      setDispenserDialogOpen(false)
      fetchData()
      setTimeout(() => setSuccess(""), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDispenser = async () => {
    if (!selectedDispenser) return
    setSaving(true)
    try {
      // Check if nozzles are assigned to this dispenser
      const { count, error: cErr } = await supabase
        .from('nozzles')
        .select('*', { count: 'exact', head: true })
        .eq('dispenser_id', selectedDispenser.id)

      if (cErr) throw cErr
      if (count && count > 0) {
        throw new Error(`Cannot delete dispenser. It has ${count} nozzles assigned to it.`)
      }

      const { error: err } = await supabase
        .from('dispensers')
        .delete()
        .eq('id', selectedDispenser.id)
      if (err) throw err

      setSuccess("Dispenser deleted successfully")
      setDispenserDeleteDialogOpen(false)
      setSelectedDispenser(null)
      fetchData()
      setTimeout(() => setSuccess(""), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const getNozzleBadgeColor = (productName: string) => {
    const name = productName.toLowerCase()
    if (name.includes("petrol") || name.includes("hi-octane")) {
      return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20"
    }
    if (name.includes("diesel")) {
      return "bg-green-500/10 text-green-700 border-green-500/20"
    }
    return "bg-primary/10 text-primary border-primary/20"
  }

  // Group nozzles by dispenser
  const groupedNozzles = nozzles.reduce((acc, nozzle) => {
    const dispenserKey = nozzle.dispenser_number || "Unassigned"
    if (!acc[dispenserKey]) {
      acc[dispenserKey] = []
    }
    acc[dispenserKey].push(nozzle)
    return acc
  }, {} as Record<string, Nozzle[]>)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">System Configuration</h1>
        <p className="text-muted-foreground">
          Manage fuel dispensers, nozzles, and their associated storage tanks
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-primary bg-primary/5">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="nozzles" className="flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Nozzles
          </TabsTrigger>
          <TabsTrigger value="dispensers" className="flex items-center gap-2">
            <Fuel className="h-4 w-4" />
            Dispensers
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="nozzles" className="space-y-6">
            {/* Summary Cards (Only in Nozzles tab for now) */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Nozzles</CardTitle>
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{nozzles.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Nozzles</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {nozzles.filter(n => n.status === "active").length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Dispensers</CardTitle>
                  <Fuel className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {dispensers.length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Fuel Types</CardTitle>
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {new Set(nozzles.map(n => n.product_id)).size}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Nozzles Table */}
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Nozzle List</CardTitle>
                    <CardDescription>
                      Assign nozzles to dispensers and track meter readings
                    </CardDescription>
                  </div>
                  <Button onClick={() => handleOpenNozzleDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Nozzle
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-500">
                    <BrandLoader size="lg" className="mb-4" />
                    <p className="text-sm text-muted-foreground font-medium animate-pulse">Syncing configurations...</p>
                  </div>
                ) : nozzles.length === 0 ? (
                  <div className="flex h-32 flex-col items-center justify-center text-center">
                    <Gauge className="h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">No nozzles configured</p>
                    <Button
                      variant="link"
                      className="mt-1"
                      onClick={() => handleOpenNozzleDialog()}
                    >
                      Add your first nozzle
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="whitespace-nowrap">Nozzle Name</TableHead>
                          <TableHead className="whitespace-nowrap">Dispenser</TableHead>
                          <TableHead className="whitespace-nowrap">Side</TableHead>
                          <TableHead className="whitespace-nowrap">Fuel Type</TableHead>
                          <TableHead className="text-right whitespace-nowrap">Initial Reading</TableHead>
                          <TableHead className="text-right whitespace-nowrap">Current Reading</TableHead>
                          <TableHead className="whitespace-nowrap">Status</TableHead>
                          <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {nozzles.map((nozzle) => (
                          <TableRow key={nozzle.id}>
                            <TableCell className="font-medium whitespace-nowrap">{nozzle.nozzle_number}</TableCell>
                            <TableCell className="whitespace-nowrap">{nozzle.dispenser_number || "-"}</TableCell>
                            <TableCell className="capitalize whitespace-nowrap">{nozzle.nozzle_side || "-"}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Badge
                                variant="outline"
                                className={getNozzleBadgeColor(nozzle.products?.product_name || "")}
                              >
                                {nozzle.products?.product_name}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono whitespace-nowrap">
                              {Number(nozzle.initial_reading || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-mono whitespace-nowrap">
                              {Number(nozzle.current_reading || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {nozzle.status === "active" ? (
                                <Badge variant="secondary" className="bg-primary/10 text-primary">
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="outline">Inactive</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenNozzleDialog(nozzle)}
                                >
                                  <Pencil className="h-4 w-4" />
                                  <span className="sr-only">Edit</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedNozzle(nozzle)
                                    setNozzleDeleteDialogOpen(true)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span className="sr-only">Delete</span>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Visual Pump Layout */}
            {Object.keys(groupedNozzles).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Dispenser Layout</CardTitle>
                  <CardDescription>Visual representation of dispensers and their nozzles</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {Object.entries(groupedNozzles).map(([dispenser, dispenserNozzles]) => (
                      <Card key={dispenser} className="border-2 border-primary/5 shadow-sm">
                        <CardHeader className="p-4 bg-muted/30 border-b">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Fuel className="h-4 w-4 text-primary" />
                            {dispenser === "Unassigned" ? "Unassigned Nozzles" : `Dispenser: ${dispenser}`}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                          <div className="grid grid-cols-2 gap-3">
                            {dispenserNozzles.map((nozzle) => (
                              <div
                                key={nozzle.id}
                                className="rounded-xl border bg-card p-3 text-center shadow-sm hover:shadow-md transition-shadow duration-300"
                              >
                                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">
                                  {nozzle.nozzle_side || "Side"}
                                </div>
                                <div className="font-bold text-lg mb-1">{nozzle.nozzle_number}</div>
                                <Badge
                                  variant="outline"
                                  className={`${getNozzleBadgeColor(nozzle.products?.product_name || "")} text-[10px] px-1.5 py-0`}
                                >
                                  {nozzle.products?.product_name}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="dispensers" className="space-y-6">
            {/* Dispensers Table */}
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Dispenser Units</CardTitle>
                    <CardDescription>
                      Manage pump units and link them to storage tanks
                    </CardDescription>
                  </div>
                  <Button onClick={() => handleOpenDispenserDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Dispenser
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <BrandLoader size="lg" />
                  </div>
                ) : dispensers.length === 0 ? (
                  <div className="flex h-32 flex-col items-center justify-center text-center">
                    <Fuel className="h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">No dispensers configured</p>
                    <Button
                      variant="link"
                      className="mt-1"
                      onClick={() => handleOpenDispenserDialog()}
                    >
                      Add your first dispenser
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Dispenser Name</TableHead>
                          <TableHead>Linked Tank</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dispensers.map((dispenser) => (
                          <TableRow key={dispenser.id}>
                            <TableCell className="font-medium">{dispenser.name}</TableCell>
                            <TableCell>
                              {dispenser.tanks?.name ? (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                  {dispenser.tanks.name}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm italic">Not Linked</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="bg-primary/10 text-primary">
                                {dispenser.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenDispenserDialog(dispenser)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedDispenser(dispenser)
                                    setDispenserDeleteDialogOpen(true)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      {/* Nozzle Add/Edit Dialog */}
      <Dialog open={nozzleDialogOpen} onOpenChange={setNozzleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedNozzle ? "Edit Nozzle" : "Add New Nozzle"}
            </DialogTitle>
            <DialogDescription>
              Configure the nozzle and its dispenser assignment
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nozzle_number">Nozzle Name/Number</Label>
              <Input
                id="nozzle_number"
                value={nozzleFormData.nozzle_number}
                onChange={(e) => setNozzleFormData({ ...nozzleFormData, nozzle_number: e.target.value })}
                placeholder="e.g., Nozzle 1, N-1A"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dispenser_id">Dispenser</Label>
                <Select
                  value={nozzleFormData.dispenser_id}
                  onValueChange={(value) => setNozzleFormData({ ...nozzleFormData, dispenser_id: value })}
                >
                  <SelectTrigger id="dispenser_id">
                    <SelectValue placeholder="Select dispenser" />
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
              <div className="space-y-2">
                <Label htmlFor="nozzle_side">Nozzle Side</Label>
                <Select
                  value={nozzleFormData.nozzle_side}
                  onValueChange={(value) => setNozzleFormData({ ...nozzleFormData, nozzle_side: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select side" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product_id">Fuel Type</Label>
              <Select
                value={nozzleFormData.product_id}
                onValueChange={(value) => setNozzleFormData({ ...nozzleFormData, product_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select fuel type" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.product_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="initial_reading">Initial Meter Reading</Label>
              <Input
                id="initial_reading"
                type="number"
                step="0.001"
                min="0"
                value={nozzleFormData.initial_reading}
                onChange={(e) => setNozzleFormData({ ...nozzleFormData, initial_reading: e.target.value })}
                placeholder="0.000"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNozzleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveNozzle} disabled={saving}>
              {saving ? <BrandLoader size="xs" /> : (selectedNozzle ? "Update Nozzle" : "Add Nozzle")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispenser Add/Edit Dialog */}
      <Dialog open={dispenserDialogOpen} onOpenChange={setDispenserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedDispenser ? "Edit Dispenser" : "Add New Dispenser"}
            </DialogTitle>
            <DialogDescription>
              Configure the dispenser unit and link it to a tank
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="d_name">Dispenser Name</Label>
              <Input
                id="d_name"
                value={dispenserFormData.name}
                onChange={(e) => setDispenserFormData({ ...dispenserFormData, name: e.target.value })}
                placeholder="e.g., Dispenser 1, Pump A"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tank_id">Link to Tank</Label>
              <Select
                value={dispenserFormData.tank_id}
                onValueChange={(val) => setDispenserFormData({ ...dispenserFormData, tank_id: val })}
              >
                <SelectTrigger id="tank_id">
                  <SelectValue placeholder="Select a tank" />
                </SelectTrigger>
                <SelectContent>
                  {tanks.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Linking to a tank allows the system to auto-deduct stock from that tank during sales.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDispenserDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveDispenser} disabled={saving}>
              {saving ? <BrandLoader size="xs" /> : (selectedDispenser ? "Update Dispenser" : "Add Dispenser")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialogs */}
      <DeleteConfirmDialog
        open={nozzleDeleteDialogOpen}
        onOpenChange={setNozzleDeleteDialogOpen}
        onConfirm={handleDeleteNozzle}
        title="Delete Nozzle"
        description={`Are you sure you want to delete nozzle "${selectedNozzle?.nozzle_number}"? This action cannot be undone.`}
      />

      <DeleteConfirmDialog
        open={dispenserDeleteDialogOpen}
        onOpenChange={setDispenserDeleteDialogOpen}
        onConfirm={handleDeleteDispenser}
        title="Delete Dispenser"
        description={`Are you sure you want to delete dispenser "${selectedDispenser?.name}"?`}
      />
    </div>
  )
}
