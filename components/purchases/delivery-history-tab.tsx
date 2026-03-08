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

export function DeliveryHistoryTab({ dateFilters }: { dateFilters?: { from: string; to: string } }) {
    const [deliveries, setDeliveries] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [supplierFilter, setSupplierFilter] = useState("all")
    const [selectedPO, setSelectedPO] = useState<string | null>(null)
    const [selectedDelivery, setSelectedDelivery] = useState<string | null>(null)

    const fetchDeliveries = async () => {
        setLoading(true)
        try {
            const data = await getDeliveries({
                date_from: dateFilters?.from,
                date_to: dateFilters?.to
            })
            setDeliveries(data || [])
        } catch (error) {
            toast.error("Failed to fetch delivery history")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchDeliveries()
    }, [dateFilters])

    const formatMultiUnit = (unitsObj: { [key: string]: number }) => {
        const parts = Object.entries(unitsObj)
            .filter(([_, qty]) => qty > 0)
            .map(([unit, qty]) => `${qty.toLocaleString()} ${unit === 'liter' ? 'L' : 'U'}`);
        return parts.length > 0 ? parts.join(", ") : "-";
    };

    const groupedDeliveries = deliveries.reduce((acc: any, del: any) => {
        const key = `${del.purchase_order_id}-${del.company_invoice_number || 'no-invoice'}`

        // Handle case where purchase_orders might be an array or object depending on join behavior
        const poData = Array.isArray(del.purchase_orders) ? del.purchase_orders[0] : del.purchase_orders;

        if (!acc[key]) {
            acc[key] = {
                id: del.id,
                purchase_order_id: del.purchase_order_id,
                company_invoice_number: del.company_invoice_number,
                po_number: poData?.po_number,
                name: del.suppliers?.name,
                order_date: poData?.created_at,
                receiving_date: del.delivery_date,
                total_order_value: poData?.estimated_total || 0,
                debited_value: 0,
                hold_value: 0,
                release_value: 0,
                short_units: {} as { [key: string]: number },
                extra_units: {} as { [key: string]: number },
                unit_type: del.unit_type || poData?.unit_type
            }
        }
        acc[key].debited_value += Number(del.delivered_amount || (Math.min(Number(del.delivered_quantity || 0), Number(del.quantity_ordered || 0)) * Number(poData?.rate_per_liter || 0)))
        acc[key].hold_value += Number(del.hold_amount || 0)

        // Calculate short/extra for this specific delivery item
        const ordered = Number(del.quantity_ordered || 0)
        const received = Number(del.delivered_quantity || 0)
        const unit = del.unit_type || poData?.unit_type || 'unit'

        if (received < ordered) {
            acc[key].short_units[unit] = (acc[key].short_units[unit] || 0) + (ordered - received)
        } else if (received > ordered) {
            acc[key].extra_units[unit] = (acc[key].extra_units[unit] || 0) + (received - ordered)
        }

        // Sum release values from hold records (if any)
        if (del.po_hold_records) {
            const hRecords = Array.isArray(del.po_hold_records) ? del.po_hold_records : [del.po_hold_records];
            hRecords.forEach((hr: any) => {
                if (hr.status === 'released') {
                    acc[key].release_value += Number(hr.hold_amount || 0)
                }
            })
        }
        return acc
    }, {})

    const deliveryList = Object.values(groupedDeliveries)

    const filteredDeliveries = deliveryList.filter((del: any) =>
        del.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        del.company_invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        del.po_number?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search Invoice#, PO#, or Supplier..."
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
                        <TableRow className="bg-slate-50/50 text-[10px]">
                            <TableHead className="font-bold">Invoice #</TableHead>
                            <TableHead className="font-bold">PO #</TableHead>
                            <TableHead className="font-bold">Supplier</TableHead>
                            <TableHead className="font-bold">Order Date</TableHead>
                            <TableHead className="font-bold">Received Date</TableHead>
                            <TableHead className="font-bold text-right text-amber-600">Short Qty</TableHead>
                            <TableHead className="font-bold text-right text-emerald-600">Extra Qty</TableHead>
                            <TableHead className="font-bold text-right text-slate-700">Order Value</TableHead>
                            <TableHead className="font-bold text-right text-blue-700 font-black">Debited</TableHead>
                            <TableHead className="font-bold text-right text-amber-700">Hold</TableHead>
                            <TableHead className="font-bold text-right text-green-700">Released</TableHead>
                            <TableHead className="font-bold text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={12} className="h-48">
                                    <div className="flex items-center justify-center w-full h-full">
                                        <BrandLoader size="lg" />
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : filteredDeliveries.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={12} className="h-24 text-center text-muted-foreground">
                                    No delivery records found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredDeliveries.map((del: any) => (
                                <TableRow key={`${del.purchase_order_id}-${del.company_invoice_number}`} className="hover:bg-slate-50/30">
                                    <TableCell className="font-mono text-[10px] font-bold">{del.company_invoice_number || 'N/A'}</TableCell>
                                    <TableCell className="font-mono text-[10px] text-muted-foreground">{del.po_number}</TableCell>
                                    <TableCell className="font-medium text-[10px]">{del.name}</TableCell>
                                    <TableCell className="text-[10px] whitespace-nowrap">
                                        {del.order_date ? new Date(del.order_date).toLocaleDateString('en-PK') : '-'}
                                    </TableCell>
                                    <TableCell className="text-[10px] whitespace-nowrap">
                                        {del.receiving_date ? new Date(del.receiving_date).toLocaleDateString('en-PK') : '-'}
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-[10px] text-amber-600">
                                        {formatMultiUnit(del.short_units)}
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-[10px] text-emerald-600">
                                        {formatMultiUnit(del.extra_units)}
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-xs text-slate-500">
                                        Rs. {Number(del.total_order_value || 0).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right font-black text-blue-800 text-xs text-nowrap pl-4">
                                        Rs. {Number(del.debited_value).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-amber-700 text-xs text-nowrap pl-4">
                                        Rs. {Number(del.hold_value).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-green-700 text-xs text-nowrap pl-4">
                                        {del.release_value > 0 ? `Rs. ${Number(del.release_value).toLocaleString()}` : '-'}
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
        </div >
    )
}
