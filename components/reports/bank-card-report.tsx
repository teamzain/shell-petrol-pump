"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { format } from "date-fns"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
    CreditCard, 
    Banknote,
    ArrowUpRight,
    Search,
    Clock,
    CheckCircle2,
    XCircle
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { ReportFilter } from "@/app/dashboard/reports/page"

interface BankCardReportProps {
    filters: ReportFilter
    onDetailClick: (item: any) => void
    onDataLoaded: (data: any) => void
}

export function BankCardReport({ filters, onDetailClick, onDataLoaded }: BankCardReportProps) {
    const [loading, setLoading] = useState(true)
    const [records, setRecords] = useState<any[]>([])
    const [searchTerm, setSearchTerm] = useState("")
    const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "released">("all")
    const supabase = createClient()

    useEffect(() => {
        const fetchCardRecords = async () => {
            setLoading(true)
            try {
                const fromDate = format(filters.dateRange.from, "yyyy-MM-dd")
                const toDate = format(filters.dateRange.to, "yyyy-MM-dd")

                let query = supabase
                    .from("card_hold_records")
                    .select(`
                        *,
                        bank_cards (
                            card_name,
                            bank_accounts ( bank_name )
                        )
                    `)
                    .eq("card_type", "bank_card")
                    .gte("sale_date", fromDate)
                    .lte("sale_date", toDate)
                    .order("sale_date", { ascending: false })

                const { data, error } = await query

                if (error) throw error

                setRecords(data || [])
                onDataLoaded(data || [])
            } catch (error) {
                console.error("Error fetching bank card report:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchCardRecords()
    }, [filters, onDataLoaded, supabase])

    const filteredRecords = useMemo(() => {
        let filtered = records
        if (searchTerm) {
            const lower = searchTerm.toLowerCase()
            filtered = filtered.filter(r => 
                r.bank_cards?.card_name?.toLowerCase().includes(lower) || 
                r.bank_cards?.bank_accounts?.bank_name?.toLowerCase().includes(lower) ||
                r.status?.toLowerCase().includes(lower)
            )
        }
        if (statusFilter !== "all") {
            filtered = filtered.filter(r => r.status === statusFilter)
        }
        return filtered
    }, [records, searchTerm, statusFilter])

    const statusCounts = useMemo(() => {
        const pending = records.filter(r => r.status === 'pending').length
        const released = records.filter(r => r.status === 'released').length
        return { all: records.length, pending, released }
    }, [records])

    const summary = useMemo(() => {
        return filteredRecords.reduce((acc, r) => {
            const amount = Number(r.hold_amount) || 0
            const net = Number(r.net_amount) || 0
            const tax = Number(r.tax_amount) || 0
            
            acc.totalHold += amount
            acc.totalNet += net
            acc.totalTax += tax
            
            if (r.status === 'released') acc.totalReleased += net
            else if (r.status === 'pending') acc.totalPending += net
            
            return acc
        }, { totalHold: 0, totalNet: 0, totalTax: 0, totalReleased: 0, totalPending: 0 })
    }, [filteredRecords])

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-32 w-full rounded-xl" />
                    ))}
                </div>
                <Skeleton className="h-[400px] w-full rounded-xl" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-blue-500 shadow-sm bg-blue-50/5">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Card Sale</p>
                                <h3 className="text-2xl font-bold mt-1">Rs. {summary.totalHold.toLocaleString()}</h3>
                            </div>
                            <div className="p-3 bg-blue-500/10 rounded-full">
                                <CreditCard className="h-5 w-5 text-blue-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-amber-500 shadow-sm bg-amber-50/5">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pending Settlement</p>
                                <h3 className="text-2xl font-bold mt-1 text-amber-600">Rs. {summary.totalPending.toLocaleString()}</h3>
                            </div>
                            <div className="p-3 bg-amber-500/10 rounded-full">
                                <Clock className="h-5 w-5 text-amber-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-emerald-500 shadow-sm bg-emerald-50/5">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Released to Bank</p>
                                <h3 className="text-2xl font-bold mt-1 text-emerald-600">Rs. {summary.totalReleased.toLocaleString()}</h3>
                            </div>
                            <div className="p-3 bg-emerald-500/10 rounded-full">
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-rose-500 shadow-sm bg-rose-50/5">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Card Tax</p>
                                <h3 className="text-2xl font-bold mt-1 text-rose-600">Rs. {summary.totalTax.toLocaleString()}</h3>
                            </div>
                            <div className="p-3 bg-rose-500/10 rounded-full">
                                <Search className="h-5 w-5 text-rose-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Transactions Table */}
            <Card className="overflow-hidden border-none shadow-md">
                <CardHeader className="bg-muted/30 pb-4 flex flex-row items-center justify-between flex-wrap gap-3">
                    <div>
                        <CardTitle className="text-lg">Bank Card Transactions</CardTitle>
                        <CardDescription>Detailed log of customer card payments and settlements.</CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-slate-100">
                            <button
                                onClick={() => setStatusFilter("all")}
                                className={`text-[10px] font-bold px-3 py-1 rounded-md transition-all ${
                                    statusFilter === "all"
                                        ? "bg-white text-slate-800 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"
                                }`}
                            >
                                All ({statusCounts.all})
                            </button>
                            <button
                                onClick={() => setStatusFilter("pending")}
                                className={`text-[10px] font-bold px-3 py-1 rounded-md transition-all ${
                                    statusFilter === "pending"
                                        ? "bg-amber-500 text-white shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"
                                }`}
                            >
                                Pending ({statusCounts.pending})
                            </button>
                            <button
                                onClick={() => setStatusFilter("released")}
                                className={`text-[10px] font-bold px-3 py-1 rounded-md transition-all ${
                                    statusFilter === "released"
                                        ? "bg-emerald-500 text-white shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"
                                }`}
                            >
                                Released ({statusCounts.released})
                            </button>
                        </div>
                        <div className="relative w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search cards..."
                                className="pl-9 h-9 bg-background"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/10">
                                <TableHead>Date</TableHead>
                                <TableHead>Card Name</TableHead>
                                <TableHead>Bank</TableHead>
                                <TableHead className="text-right">Hold Amount</TableHead>
                                <TableHead className="text-right">Tax</TableHead>
                                <TableHead className="text-right">Net Amount</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredRecords.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground italic">
                                        No card transactions found for the selected period
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredRecords.map((record) => (
                                    <TableRow 
                                        key={record.id} 
                                        className="cursor-pointer hover:bg-primary/5 transition-colors group"
                                        onClick={() => onDetailClick(record)}
                                    >
                                        <TableCell className="font-medium text-xs">
                                            {format(new Date(record.sale_date), "dd MMM yyyy")}
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-semibold text-sm">{record.bank_cards?.card_name || 'Generic Bank Card'}</div>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-tighter">BANK CARD</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-xs">{record.bank_cards?.bank_accounts?.bank_name || 'N/A'}</div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-sm">
                                            Rs. {record.hold_amount?.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-xs text-rose-600">
                                            - Rs. {record.tax_amount?.toLocaleString()} ({record.tax_percentage}%)
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="font-bold text-sm text-primary">Rs. {record.net_amount?.toLocaleString()}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge 
                                                variant="outline" 
                                                className={cn(
                                                    "text-[10px] h-5 uppercase font-bold",
                                                    record.status === 'released' 
                                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                                        : record.status === 'pending'
                                                        ? "bg-amber-50 text-amber-700 border-amber-200"
                                                        : "bg-rose-50 text-rose-700 border-rose-200"
                                                )}
                                            >
                                                {record.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
