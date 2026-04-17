"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Eye, Truck, XCircle, Filter, Calendar, Package, Wallet, CreditCard } from "lucide-react"
import { getPurchaseOrders, cancelPurchaseOrder } from "@/app/actions/purchase-orders"
import { toast } from "sonner"
import { BrandLoader } from "@/components/ui/brand-loader"
import { PODetailModal } from "../purchases/po-detail-modal"
import { LocalPaymentModal } from "@/components/local-purchases/local-payment-modal"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

interface LocalPOListTabProps {
    onCreateDelivery: (po: any) => void
    dateFilters?: { from: string; to: string }
    filterMode?: 'all' | 'due'
}

export function LocalPOListTab({ onCreateDelivery, dateFilters, filterMode = 'all' }: LocalPOListTabProps) {
    const [pos, setPos] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [statusFilter, setStatusFilter] = useState("all")
    const [selectedPO, setSelectedPO] = useState<string | null>(null)
    const [paymentPO, setPaymentPO] = useState<any>(null)

    const fetchPOs = async () => {
        setLoading(true)
        try {
            const data = await getPurchaseOrders({
                status: filterMode === 'due' ? 'closed' : (statusFilter === 'all' ? undefined : statusFilter),
                date_from: dateFilters?.from,
                date_to: dateFilters?.to,
                supplier_type: 'local'
            })
            setPos(data?.filter(po => po.purchase_type === 'local') || [])
        } catch (error) {
            toast.error("Failed to fetch local purchase orders")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchPOs()
    }, [statusFilter, dateFilters, filterMode])

    const handleCancel = async (id: string) => {
        if (!confirm("Are you sure you want to cancel this local PO?")) return
        try {
            await cancelPurchaseOrder(id)
            toast.success("Local PO cancelled")
            fetchPOs()
        } catch (error: any) {
            toast.error(error.message)
        }
    }

    const filteredPOs = pos.filter(po => {
        const matchesSearch = po.po_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             po.suppliers?.name?.toLowerCase().includes(searchQuery.toLowerCase());
        
        const isDelivered = po.status === 'closed' || po.status === 'fully_delivered';
        const dueAmt = Number(po.estimated_total) - Number(po.paid_amount || 0);
        const hasDue = dueAmt > 0.1;

        if (filterMode === 'due') {
            return matchesSearch && isDelivered && hasDue;
        }

        // Main Tab: Hide if order is fully delivered
        if (filterMode === 'all') {
            if (isDelivered) return false;
        }

        return matchesSearch;
    })

    return (
        <div className="space-y-4">
            {filterMode !== 'due' && (
                <div className="flex flex-col md:flex-row gap-4 items-end bg-white p-6 rounded-xl border shadow-sm">
                    <div className="flex-1 space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Search Orders</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search PO# or Supplier..."
                                className="pl-10 h-11"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="w-full md:w-48 space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Status Filter</label>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-11 font-bold">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="partially_delivered">Partial</SelectItem>
                                <SelectItem value="closed">Delivered</SelectItem>
                                <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}

            {filterMode === 'due' && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-amber-100 p-2 rounded-lg">
                            <Wallet className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                            <h3 className="font-black text-amber-900 uppercase text-xs">Pending Settlements</h3>
                            <p className="text-[10px] text-amber-700 font-bold uppercase">Displaying only delivered orders with outstanding balance</p>
                        </div>
                    </div>
                    <div className="relative w-64 text-right">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input
                            placeholder="Find specific due order..."
                            className="pl-9 h-9 text-xs border-amber-200"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            )}

            <Card className="border-0 shadow-lg overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow className="hover:bg-transparent border-b">
                            <TableHead className="w-[120px] font-black uppercase text-[10px] tracking-widest text-slate-500">PO Number</TableHead>
                            <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500">Supplier</TableHead>
                            <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500">Items</TableHead>
                            <TableHead className="text-right font-black uppercase text-[10px] tracking-widest text-slate-500">Order Total</TableHead>
                            <TableHead className="text-right font-black uppercase text-[10px] tracking-widest text-slate-500">Paid / Due</TableHead>
                            <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500 text-center">Status</TableHead>
                            <TableHead className="text-center font-black uppercase text-[10px] tracking-widest text-slate-500">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-48 text-center">
                                    <BrandLoader size="lg" />
                                </TableCell>
                            </TableRow>
                        ) : filteredPOs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-48 text-center text-slate-400 font-medium italic">
                                    {filterMode === 'due' ? "Excellent! No delivered orders have outstanding balances." : "No local purchase orders found."}
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredPOs.map((po) => (
                                <TableRow key={po.id} className="hover:bg-slate-50/80 transition-colors group">
                                    <TableCell className="font-mono font-bold text-slate-900 whitespace-nowrap">{po.po_number}</TableCell>
                                    <TableCell>
                                        <div className="font-black text-slate-900 uppercase text-xs">{po.suppliers?.name}</div>
                                        <div className="text-[9px] text-slate-500 uppercase font-black">{po.product_type}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] font-black text-slate-700 uppercase">
                                                {po.delivered_quantity}/{po.ordered_quantity} {po.unit_type === 'liter' ? 'L' : 'U'}
                                            </span>
                                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-[80px]">
                                                <div 
                                                    className={`h-full transition-all ${po.status === 'closed' ? 'bg-green-500' : 'bg-amber-500'}`} 
                                                    style={{ width: `${(po.delivered_quantity / po.ordered_quantity) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-black text-slate-900 text-xs">
                                        Rs. {Number(po.estimated_total).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex flex-col items-end gap-1">
                                            <div className="text-[10px] font-bold text-green-600 uppercase">
                                                Paid: Rs. {Number(po.paid_amount || 0).toLocaleString()}
                                            </div>
                                            {Number(po.estimated_total) - Number(po.paid_amount || 0) > 0 && (
                                                <div className="text-[10px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded uppercase">
                                                    Due: Rs. {(Number(po.estimated_total) - Number(po.paid_amount || 0)).toLocaleString()}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge className={`uppercase text-[9px] font-black tracking-widest border-2 ${
                                            po.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                            po.status === 'partially_delivered' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                            po.status === 'closed' || po.status === 'fully_delivered' ? 'bg-green-50 text-green-700 border-green-100' :
                                            'bg-slate-50 text-slate-700 border-slate-100'
                                        }`} variant="outline">
                                            {po.status === 'closed' ? 'DELIVERED' : po.status.replace('_', ' ')}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-center items-center gap-1">
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-primary transition-colors" onClick={() => setSelectedPO(po.id)}>
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top">
                                                        <p className="font-bold text-[10px] uppercase">Details</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                                
                                                {po.status !== 'cancelled' && po.status !== 'closed' && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:bg-amber-50" onClick={() => onCreateDelivery(po)}>
                                                                <Truck className="h-4 w-4" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            <p className="font-bold text-[10px] uppercase">Receive</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                )}

                                                {Number(po.estimated_total) > Number(po.paid_amount || 0) && po.status !== 'cancelled' && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 bg-green-50/50 hover:bg-green-100" onClick={() => setPaymentPO(po)}>
                                                                <Wallet className="h-4 w-4" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            <p className="font-bold text-[10px] uppercase font-black">Pay & Settle</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                )}

                                                {po.status === 'pending' && po.delivered_quantity === 0 && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => handleCancel(po.id)}>
                                                                <XCircle className="h-4 w-4" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            <p className="font-bold text-red-500 text-[10px] uppercase">Cancel</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                )}
                                            </TooltipProvider>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>

            {selectedPO && (
                <PODetailModal
                    open={!!selectedPO}
                    onOpenChange={(open) => !open && setSelectedPO(null)}
                    poId={selectedPO}
                />
            )}

            {paymentPO && (
                <LocalPaymentModal
                    isOpen={!!paymentPO}
                    onClose={() => setPaymentPO(null)}
                    po={paymentPO}
                    onSuccess={() => {
                        setPaymentPO(null);
                        fetchPOs();
                    }}
                />
            )}
        </div>
    )
}
