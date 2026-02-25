"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Plus,
  Search,
  ExternalLink,
  Wallet,
  History,
  Edit,
  UserPlus,
  Phone,
  Building2,
  Filter
} from "lucide-react"
import { BrandLoader } from "@/components/ui/brand-loader"
import { getSuppliers } from "@/app/actions/suppliers"
import { SupplierWizard } from "@/components/suppliers/supplier-wizard"
import { SupplierDialog } from "@/components/suppliers/supplier-dialog"

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null)

  // New Filter States
  const [productTypeFilter, setProductTypeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [accountFilter, setAccountFilter] = useState<string>("all")

  const fetchSuppliers = async () => {
    setLoading(true)
    try {
      const data = await getSuppliers()
      setSuppliers(data || [])
    } catch (error) {
      console.error("Error fetching suppliers:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSuppliers()
  }, [])

  const filteredSuppliers = suppliers.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.contact_person && s.contact_person.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesProductType = productTypeFilter === "all" || s.product_type === productTypeFilter
    const matchesStatus = statusFilter === "all" || s.status === statusFilter

    const accountData = s.company_accounts
    const account = Array.isArray(accountData) ? accountData[0] : accountData
    const hasAccount = !!account

    const matchesAccount = accountFilter === "all" ||
      (accountFilter === "linked" && hasAccount) ||
      (accountFilter === "not_set" && !hasAccount)

    return matchesSearch && matchesProductType && matchesStatus && matchesAccount
  })

  if (loading && suppliers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in duration-500">
        <BrandLoader size="lg" className="mb-4" />
        <p className="text-muted-foreground font-medium animate-pulse">Loading Supplier Network...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Suppliers & Ledger</h1>
          <p className="text-muted-foreground">Manage your supply chain and account balances.</p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add New Supplier
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search suppliers by name or contact..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <Select value={productTypeFilter} onValueChange={setProductTypeFilter}>
              <SelectTrigger className="w-[140px] h-10 bg-white">
                <SelectValue placeholder="Product Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                <SelectItem value="fuel">Fuel Only</SelectItem>
                <SelectItem value="oil">Oil Only</SelectItem>
                <SelectItem value="both">Both (Fuel & Oil)</SelectItem>
              </SelectContent>
            </Select>

            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="w-[140px] h-10 bg-white">
                <SelectValue placeholder="Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                <SelectItem value="linked">Linked</SelectItem>
                <SelectItem value="not_set">Not Set</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px] h-10 bg-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            {(productTypeFilter !== "all" || statusFilter !== "all" || accountFilter !== "all" || searchQuery !== "") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setProductTypeFilter("all")
                  setStatusFilter("all")
                  setAccountFilter("all")
                  setSearchQuery("")
                }}
                className="text-xs text-muted-foreground whitespace-nowrap"
              >
                Clear All
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="font-bold">Supplier Info</TableHead>
                  <TableHead className="font-bold">Contact Details</TableHead>
                  <TableHead className="font-bold text-center">Account</TableHead>
                  <TableHead className="font-bold text-right">Balance</TableHead>
                  <TableHead className="font-bold text-center">Status</TableHead>
                  <TableHead className="font-bold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No suppliers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map((supplier) => {
                    const accountData = supplier.company_accounts
                    const account = Array.isArray(accountData) ? accountData[0] : accountData
                    const hasAccount = !!account
                    const balance = hasAccount ? Number(account.current_balance) : 0

                    return (
                      <TableRow key={supplier.id} className="hover:bg-slate-50/30 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                              {supplier.name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{supplier.name}</div>
                              <div className="text-[10px] uppercase font-bold tracking-tighter text-muted-foreground">
                                {supplier.product_type === 'both' ? 'Fuel & Oil' : supplier.product_type} Supplier
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="text-sm font-medium flex items-center gap-1.5">
                              <Building2 className="h-3 w-3 text-muted-foreground" />
                              {supplier.contact_person || "No POC"}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <Phone className="h-3 w-3" />
                              {supplier.phone}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {hasAccount ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">
                              Linked
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground border-dashed">
                              Not Set
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {hasAccount ? (
                            <div className="flex flex-col items-end">
                              <span className="font-bold text-slate-900">Rs. {balance.toLocaleString()}</span>
                              <span className="text-[10px] text-muted-foreground uppercase font-black">Net Balance</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={supplier.status === "active" ? "secondary" : "outline"}
                            className={supplier.status === "active" ? "bg-primary/10 text-primary" : ""}
                          >
                            {supplier.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Link href={`/dashboard/suppliers/${supplier.id}`}>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500">
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                </Link>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View Details</p>
                              </TooltipContent>
                            </Tooltip>

                            {hasAccount ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Link href={`/dashboard/suppliers/${supplier.id}/transactions`}>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500">
                                      <History className="h-4 w-4" />
                                    </Button>
                                  </Link>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Transaction History</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-500">
                                    <UserPlus className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Create Account</p>
                                </TooltipContent>
                              </Tooltip>
                            )}

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-primary"
                                  onClick={() => {
                                    setSelectedSupplier(supplier)
                                    setEditDialogOpen(true)
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Edit Supplier</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <SupplierWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSuccess={fetchSuppliers}
      />

      <SupplierDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        supplier={selectedSupplier}
        onSuccess={fetchSuppliers}
      />
    </div>
  )
}
