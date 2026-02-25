"use client"

import { useState, useEffect } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Search, Eye, Filter, Calendar } from "lucide-react"
import { getDeliveries } from "@/app/actions/deliveries"
import { toast } from "sonner"
import { BrandLoader } from "@/components/ui/brand-loader"
import { PODetailModal } from "./po-detail-modal"

export function DeliveryHistoryTab() {
    const [deliveries, setDeliveries] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [supplierFilter, setSupplierFilter] = useState("all")
    const [selectedPO, setSelectedPO] = useState<string | null>(null)
    const [selectedDelivery, setSelectedDelivery] = useState<string | null>(null)

    const fetchDeliveries = async () => {
        setLoading(true)
        try {
            const data = await getDeliveries()
            setDeliveries(data || [])
        } catch (error) {
            toast.error("Failed to fetch delivery history")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchDeliveries()
    }, [])

    const filteredDeliveries = deliveries.filter(del =>
        del.suppliers?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        del.company_invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        del.purchase_orders?.po_number.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search DEL#, Invoice#, or Supplier..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Button variant="outline" onClick={fetchDeliveries} size="icon">
                        <Search className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="border rounded-lg bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50/50">
                            <TableHead className="font-bold">Invoice #</TableHead>
                            <TableHead className="font-bold">PO #</TableHead>
                            <TableHead className="font-bold">Supplier</TableHead>
                            <TableHead className="font-bold">Product</TableHead>
                            <TableHead className="font-bold text-right">Qty</TableHead>
                            <TableHead className="font-bold text-right">Amount</TableHead>
                            <TableHead className="font-bold text-center">Date</TableHead>
                            <TableHead className="font-bold text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-48">
                                    <div className="flex items-center justify-center w-full h-full">
                                        <BrandLoader size="lg" />
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : filteredDeliveries.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                                    No delivery records found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredDeliveries.map((del) => (
                                <TableRow key={del.id} className="hover:bg-slate-50/30">
                                    <TableCell className="font-mono text-[10px] font-bold">{del.company_invoice_number}</TableCell>
                                    <TableCell className="font-mono text-[10px] text-muted-foreground">{del.purchase_orders?.po_number}</TableCell>
                                    <TableCell className="font-medium text-xs">{del.suppliers?.name}</TableCell>
                                    <TableCell className="capitalize text-[10px] whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]" title={del.product_name || del.product_type}>
                                        {del.product_name || del.product_type}
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-xs">{Number(del.delivered_quantity).toLocaleString()}</TableCell>
                                    <TableCell className="text-right font-black text-primary text-xs">Rs. {Number(del.total_amount).toLocaleString()}</TableCell>
                                    <TableCell className="text-center text-[10px] whitespace-nowrap">
                                        {new Date(del.delivery_date).toLocaleDateString('en-PK')}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-blue-600"
                                            onClick={() => {
                                                setSelectedPO(del.purchase_order_id)
                                                setSelectedDelivery(del.id)
                                            }}
                                        >
                                            <Eye className="h-3.5 w-3.5" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <PODetailModal
                open={!!selectedPO}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedPO(null)
                        setSelectedDelivery(null)
                    }
                }}
                poId={selectedPO}
                deliveryId={selectedDelivery || undefined}
            />
        </div>
    )
}
