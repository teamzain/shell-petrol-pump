"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Wallet, Building2, Package, ArrowUpRight, ArrowDownLeft, Scale, Clock, ShieldCheck, FileText } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { BrandLoader } from "@/components/ui/brand-loader"
import { getDailyReportData } from "@/app/actions/reports"
import { toast } from "sonner"

interface DailyRecapProps {
    date: Date
}

export function DailyRecapReport({ date }: DailyRecapProps) {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<any>(null)

    const fetchData = async (selectedDate: Date) => {
        setLoading(true)
        try {
            const formattedDate = format(selectedDate, "yyyy-MM-dd")
            const response = await getDailyReportData(formattedDate)
            setData(response)
        } catch (error) {
            console.error("Error fetching report:", error)
            toast.error("Failed to load daily report")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData(date)
    }, [date])

    const formatCurrency = (val: number) => {
        return `Rs. ${Number(val).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <BrandLoader size="lg" className="mb-4" />
                <p className="text-muted-foreground animate-pulse font-black uppercase tracking-widest text-[10px]">Compiling Daily Summary...</p>
            </div>
        )
    }

    if (!data) return null

    return (
        <div className="grid gap-6 animate-in fade-in duration-500">
            {/* Financial Pillars: Cash & Bank */}
            <div className="grid md:grid-cols-2 gap-6">
                <Card className="border-0 shadow-xl bg-slate-900 text-white overflow-hidden relative group">
                    <div className="absolute -right-10 -top-10 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Wallet size={200} />
                    </div>
                    <CardHeader className="border-b border-white/10 pb-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Cash Account Summary</CardTitle>
                            <Badge variant="outline" className="text-[10px] border-white/20 text-white font-black uppercase text-xs">Liquid Cash</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6 grid grid-cols-2 gap-8 relative z-10">
                        <div className="space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Opening Balance</p>
                            <p className="text-xl font-black text-slate-300">{formatCurrency(data.financials.cash.opening)}</p>
                        </div>
                        <div className="space-y-1 text-right">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Closing Balance</p>
                            <p className="text-xl font-black text-primary-foreground">{formatCurrency(data.financials.cash.closing)}</p>
                        </div>
                        <div className="col-span-2 grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                            <div className="bg-white/5 p-4 rounded-xl">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Total Daily Sales</p>
                                <p className="text-lg font-black text-green-400">+{formatCurrency(data.financials.totalSale)}</p>
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Daily Expenses</p>
                                <p className="text-lg font-black text-red-400">-{formatCurrency(data.financials.totalPurchase)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-xl bg-slate-900 text-white overflow-hidden relative group">
                    <div className="absolute -right-10 -top-10 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Scale size={200} />
                    </div>
                    <CardHeader className="border-b border-white/10 pb-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Bank Account Summary</CardTitle>
                            <Badge variant="outline" className="text-[10px] border-white/20 text-white font-black uppercase text-xs">Managed Funds</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6 grid grid-cols-2 gap-8 relative z-10">
                        <div className="space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Opening Balance</p>
                            <p className="text-xl font-black text-slate-300">{formatCurrency(data.financials.bank.opening)}</p>
                        </div>
                        <div className="space-y-1 text-right">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Closing Balance</p>
                            <p className="text-xl font-black text-blue-400">{formatCurrency(data.financials.bank.closing)}</p>
                        </div>
                        <div className="col-span-2 grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                            <div className="bg-white/5 p-4 rounded-xl border border-amber-500/10">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1">On Hold (Card)</p>
                                <div className="flex items-center gap-2">
                                    <p className="text-lg font-black text-amber-400">{formatCurrency(data.financials.bank.hold)}</p>
                                    <Clock className="h-4 w-4 text-amber-500 opacity-50" />
                                </div>
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl border border-green-500/10">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-green-500 mb-1">Released (Card)</p>
                                <div className="flex items-center gap-2">
                                    <p className="text-lg font-black text-green-400">{formatCurrency(data.financials.bank.released)}</p>
                                    <ShieldCheck className="h-4 w-4 text-green-500 opacity-50" />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Supplier Responsibility Section */}
            <Card className="border-0 shadow-lg border-l-4 border-l-primary">
                <CardHeader className="flex flex-row items-center justify-between bg-slate-50/50">
                    <div>
                        <CardTitle className="text-lg font-black uppercase tracking-tight">Supplier Liabilities Summary</CardTitle>
                        <CardDescription className="text-[10px] uppercase font-bold tracking-widest">Independent of Cash & Bank Balances</CardDescription>
                    </div>
                    <Building2 className="h-8 w-8 text-primary opacity-20" />
                </CardHeader>
                <CardContent className="p-0">
                    <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0">
                        <div className="p-6 space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <Clock className="h-3 w-3" /> Initial Balance
                            </p>
                            <p className="text-xl font-black text-slate-600">{formatCurrency(data.suppliers.opening)}</p>
                        </div>
                        <div className="p-6 space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <ArrowUpRight className="h-3 w-3 text-red-500" /> Purchases Added
                            </p>
                            <p className="text-xl font-black text-red-600">+{formatCurrency(data.suppliers.additions)}</p>
                        </div>
                        <div className="p-6 space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <ArrowDownLeft className="h-3 w-3 text-green-500" /> Payments Made
                            </p>
                            <p className="text-xl font-black text-green-600">-{formatCurrency(data.suppliers.payments)}</p>
                        </div>
                        <div className="p-6 space-y-1 bg-slate-50/80">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                                <FileText className="h-3 w-3" /> Closing Debt
                            </p>
                            <p className="text-xl font-black text-primary">{formatCurrency(data.suppliers.closing)}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Inventory Snapshot Section */}
            <Card className="border-0 shadow-lg overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between bg-white border-b">
                    <div>
                        <CardTitle className="text-lg font-black uppercase tracking-tight">Stock Movements Summary</CardTitle>
                        <CardDescription className="text-[10px] uppercase font-bold tracking-widest">Opening + Received - Sold = Closing</CardDescription>
                    </div>
                    <Package className="h-8 w-8 text-primary opacity-20" />
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50/50">
                                <TableHead className="font-black uppercase text-[10px] py-4">Item Name</TableHead>
                                <TableHead className="font-black uppercase text-[10px] text-center border-l">Opening Stock</TableHead>
                                <TableHead className="font-black uppercase text-[10px] text-center border-l bg-blue-50/30">Stock Received (In)</TableHead>
                                <TableHead className="font-black uppercase text-[10px] text-center border-l bg-red-50/30">Sale (Out)</TableHead>
                                <TableHead className="font-black uppercase text-[10px] text-center border-l bg-green-50/30">Closing Stock</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.inventory.map((item: any) => (
                                <TableRow key={item.name} className="hover:bg-slate-50/30 transition-colors">
                                    <TableCell className="font-black text-xs uppercase text-slate-700 py-4">
                                        {item.name}
                                    </TableCell>
                                    <TableCell className="text-center font-bold text-slate-500 border-l">
                                        {item.opening.toLocaleString()} {item.unit}
                                    </TableCell>
                                    <TableCell className="text-center font-black text-blue-600 border-l bg-blue-50/10">
                                        +{item.in.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-center font-black text-red-600 border-l bg-red-50/10">
                                        -{item.out.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-center font-black text-green-700 border-l bg-green-50/10">
                                        {item.closing.toLocaleString()} {item.unit}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
