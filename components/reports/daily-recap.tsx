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
    onDataLoaded?: (data: any) => void
}

export function DailyRecapReport({ date, onDataLoaded }: DailyRecapProps) {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<any>(null)

    const fetchData = async (selectedDate: Date) => {
        setLoading(true)
        try {
            const formattedDate = format(selectedDate, "yyyy-MM-dd")
            const response = await getDailyReportData(formattedDate)
            setData(response)
            onDataLoaded?.({ ...response, _tab: 'daily-recap', _date: formattedDate })
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

    const totalOpeningBalance = (data.financials.cash.opening || 0) + (data.financials.bank.opening || 0)
    const totalClosingBalance = (data.financials.cash.closing || 0) + (data.financials.bank.closing || 0)
    const totalNetChange = totalClosingBalance - totalOpeningBalance

    return (
        <div className="grid gap-6 animate-in fade-in duration-500">
            {/* Total Balance Card */}
            <Card className="border-0 shadow-2xl overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white relative">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.15),_transparent_60%)]" />
                <CardContent className="p-6 relative z-10">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400 mb-1">Total Business Balance</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Cash + Bank Combined Closing</p>
                            <p className="text-4xl font-black text-white mt-2">{formatCurrency(totalClosingBalance)}</p>
                            <div className="flex items-center gap-4 mt-2">
                                <div className="flex items-center gap-1">
                                    <span className={`text-sm font-black ${totalNetChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {totalNetChange >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(totalNetChange))}
                                    </span>
                                    <span className="text-[10px] text-slate-500 uppercase tracking-widest">vs Opening</span>
                                </div>
                                {data.financials.totalDiscounts > 0 && (
                                    <div className="flex items-center gap-1 border-l border-white/20 pl-4">
                                        <Badge variant="outline" className="bg-orange-500/20 text-orange-400 border-orange-500/50 text-[10px] font-black tracking-widest uppercase">
                                            Discounts: {formatCurrency(data.financials.totalDiscounts)}
                                        </Badge>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 w-full md:w-auto">
                            <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Opening</p>
                                <p className="text-sm font-black text-slate-200">{formatCurrency(totalOpeningBalance)}</p>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                                <p className="text-[9px] font-black uppercase tracking-widest text-green-400 mb-1">Cash Closing</p>
                                <p className="text-sm font-black text-green-300">{formatCurrency(data.financials.cash.closing)}</p>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                                <p className="text-[9px] font-black uppercase tracking-widest text-blue-400 mb-1">Bank Closing</p>
                                <p className="text-sm font-black text-blue-300">{formatCurrency(data.financials.bank.closing)}</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Financial Pillars: Cash & Bank */}
            <div className="grid md:grid-cols-2 gap-6">
                <Card className="border-0 shadow-xl bg-slate-900 text-white overflow-hidden relative group">
                    <div className="absolute -right-10 -top-10 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Wallet size={200} />
                    </div>
                    <CardHeader className="border-b border-white/10 pb-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Cash Account Summary</CardTitle>
                            <Badge variant="outline" className="text-[10px] border-white/20 text-white font-black uppercase text-xs tracking-widest">Liquid Cash</Badge>
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
                            <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-green-500 mb-1 text-center">Cash Sales (In)</p>
                                <p className="text-lg font-black text-green-400 text-center">+{formatCurrency(data.financials.cash.sale)}</p>
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-1 text-center">Cash Expenses (Out)</p>
                                <p className="text-lg font-black text-red-400 text-center">-{formatCurrency(data.financials.cash.expense)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-xl bg-slate-900 text-white overflow-hidden relative group">
                    <div className="absolute -right-10 -top-10 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Building2 size={200} />
                    </div>
                    <CardHeader className="border-b border-white/10 pb-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Bank Account Summary</CardTitle>
                            <Badge variant="outline" className="text-[10px] border-white/20 text-white font-black uppercase text-xs tracking-widest">Managed Funds</Badge>
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
                            <div className="bg-white/10 p-4 rounded-xl border border-blue-500/20">
                                <p className="text-[9px] font-black uppercase tracking-widest text-blue-400 mb-1 text-center">Card Sales (In)</p>
                                <p className="text-lg font-black text-blue-300 text-center">+{formatCurrency(data.financials.bank.sale)}</p>
                            </div>
                            <div className="bg-white/10 p-4 rounded-xl border border-rose-500/20">
                                <p className="text-[9px] font-black uppercase tracking-widest text-rose-400 mb-1 text-center">Bank Payments (Out)</p>
                                <p className="text-lg font-black text-rose-300 text-center">-{formatCurrency(data.financials.bank.expense)}</p>
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl border border-amber-500/10">
                                <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-1 text-center">Card Holds (Today)</p>
                                <div className="flex items-center justify-center gap-2">
                                    <p className="text-lg font-black text-amber-400">{formatCurrency(data.financials.bank.hold)}</p>
                                    <Clock className="h-3 w-3 text-amber-500 opacity-50" />
                                </div>
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl border border-green-500/10">
                                <p className="text-[9px] font-black uppercase tracking-widest text-green-500 mb-1 text-center">Card Releases (Today)</p>
                                <div className="flex items-center justify-center gap-2">
                                    <p className="text-lg font-black text-green-400">{formatCurrency(data.financials.bank.released)}</p>
                                    <ShieldCheck className="h-3 w-3 text-green-500 opacity-50" />
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
                    <div className="grid grid-cols-1 md:grid-cols-3 divide-x divide-y md:divide-y-0 text-center">
                        <div className="p-6 space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center justify-center gap-2">
                                <Clock className="h-3 w-3" /> Initial Balance
                            </p>
                            <p className="text-xl font-black text-slate-600">{formatCurrency(data.suppliers.opening)}</p>
                        </div>
                        <div className="p-6 space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center justify-center gap-2">
                                <ArrowDownLeft className="h-3 w-3 text-green-500" /> Payments Made
                            </p>
                            <p className="text-xl font-black text-green-600">-{formatCurrency(data.suppliers.payments)}</p>
                        </div>
                        <div className="p-6 space-y-1 bg-slate-50/80">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center justify-center gap-2">
                                <FileText className="h-3 w-3" /> Closing Debt
                            </p>
                            <p className="text-xl font-black text-primary">{formatCurrency(data.suppliers.closing)}</p>
                        </div>
                    </div>

                    {/* Dynamic Hold & Release Breakdown */}
                    <div className="grid md:grid-cols-2 divide-x border-t bg-slate-50/30 text-center">
                        {/* Sales/Supplier Cards Section */}
                        <div className="divide-y">
                            <div className="p-4 flex items-center justify-between px-10 bg-amber-50/20">
                                <div className="space-y-0.5 text-left">
                                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-amber-700">Supplier Card — On Hold (Today)</p>
                                    <p className="text-lg font-black text-amber-600">{formatCurrency(data.suppliers.cardOnHold)}</p>
                                </div>
                                <Clock className="h-5 w-5 text-amber-500 opacity-30" />
                            </div>
                            <div className="p-4 flex items-center justify-between px-10 bg-green-50/20">
                                <div className="space-y-0.5 text-left">
                                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-green-700">Supplier Card — Releases (Today)</p>
                                    <p className="text-lg font-black text-green-600">{formatCurrency(data.suppliers.cardReleased)}</p>
                                </div>
                                <ShieldCheck className="h-5 w-5 text-green-500 opacity-30" />
                            </div>
                        </div>

                        {/* Purchase Shortage Holds Section */}
                        <div className="divide-y border-l">
                            <div className="p-4 flex items-center justify-between px-10 bg-orange-50/20">
                                <div className="space-y-0.5 text-left">
                                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-orange-700">Shortage Holds (Today)</p>
                                    <p className="text-lg font-black text-orange-600">{formatCurrency(data.suppliers.purchaseHoldOnHold)}</p>
                                </div>
                                <Clock className="h-5 w-5 text-orange-500 opacity-30" />
                            </div>
                            <div className="p-4 flex items-center justify-between px-10 bg-emerald-50/20">
                                <div className="space-y-0.5 text-left">
                                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-emerald-700">Shortage Releases (Today)</p>
                                    <p className="text-lg font-black text-emerald-600">{formatCurrency(data.suppliers.purchaseHoldReleased)}</p>
                                </div>
                                <ShieldCheck className="h-5 w-5 text-emerald-500 opacity-30" />
                            </div>
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
                                <TableHead className="font-black uppercase text-[10px] text-center border-l bg-slate-100">Without Dip</TableHead>
                                <TableHead className="font-black uppercase text-[10px] text-center border-l bg-indigo-50/50">Dip Qty</TableHead>
                                <TableHead className="font-black uppercase text-[10px] text-center border-l bg-amber-50/50">Gain / Loss</TableHead>
                                <TableHead className="font-black uppercase text-[10px] text-center border-l bg-green-50/30">Actual Stock</TableHead>
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
                                    <TableCell className="text-center font-bold text-slate-600 border-l bg-slate-50/50">
                                        {item.withoutDip.toLocaleString()} {item.unit}
                                    </TableCell>
                                    <TableCell className="text-center font-bold text-indigo-700 border-l bg-indigo-50/30">
                                        {item.dipQty !== null ? `${item.dipQty.toLocaleString()} ${item.unit}` : <span className="text-slate-300 font-medium">—</span>}
                                    </TableCell>
                                    <TableCell className={`text-center font-bold border-l bg-amber-50/30 ${item.gainLoss && item.gainLoss > 0 ? "text-green-600" : item.gainLoss && item.gainLoss < 0 ? "text-red-600" : "text-slate-400"}`}>
                                        {item.gainLoss !== null ? (
                                            item.gainLoss > 0 ? `+${item.gainLoss.toLocaleString()}` : item.gainLoss.toLocaleString()
                                        ) : (
                                            <span className="text-slate-300 font-medium">—</span>
                                        )}
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
