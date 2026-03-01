"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import {
    CreditCard, Calendar, Clock, CheckCircle2,
    AlertCircle, ArrowUpRight, Search, Filter,
    History, Wallet, Building2, Banknote
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { BrandLoader } from "@/components/ui/brand-loader"
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function CardHoldsPage() {
    const { toast } = useToast()
    const supabase = createClient()

    const [loading, setLoading] = useState(true)
    const [releasing, setReleasing] = useState<string | null>(null)
    const [holds, setHolds] = useState<any[]>([])
    const [activeTab, setActiveTab] = useState("pending")

    useEffect(() => {
        fetchHolds()
    }, [activeTab])

    const fetchHolds = async () => {
        setLoading(true)
        try {
            let query = supabase
                .from('card_hold_records')
                .select('*, payment_methods(name), suppliers(name)')
                .order('sale_date', { ascending: false })

            if (activeTab === "pending") {
                query = query.eq('status', 'on_hold')
            } else {
                query = query.eq('status', 'released')
            }

            const { data, error } = await query
            if (error) throw error
            setHolds(data || [])
        } catch (err: any) {
            toast({ title: "Fetch Error", description: err.message, variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const handleRelease = async (id: string) => {
        setReleasing(id)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("Unauthorized")

            const { data, error } = await supabase.rpc('release_card_hold', {
                p_hold_id: id,
                p_user_id: user.id
            })

            if (error) throw error

            toast({ title: "Released", description: "Payment has been released to account." })
            fetchHolds()
        } catch (err: any) {
            toast({ title: "Release Failed", description: err.message, variant: "destructive" })
        } finally {
            setReleasing(null)
        }
    }

    const totalPending = holds.reduce((sum, h) => sum + (h.status === 'on_hold' ? Number(h.hold_amount) : 0), 0)

    if (loading && holds.length === 0) return <div className="h-[60vh] flex items-center justify-center"><BrandLoader /></div>

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tighter uppercase italic flex items-center gap-3">
                        <CreditCard className="w-10 h-10 text-primary" /> Card Payment <span className="text-primary">Holds</span>
                    </h1>
                    <p className="text-muted-foreground font-medium">Manage and release held payments from Shell and Bank cards.</p>
                </div>

                <div className="flex gap-4">
                    <Card className="border-2 border-primary/20 shadow-lg px-6 py-3 bg-primary/5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary/70 block">Total Pending Release</span>
                        <span className="text-2xl font-black">PKR {totalPending.toLocaleString()}</span>
                    </Card>
                </div>
            </div>

            <Tabs defaultValue="pending" className="w-full" onValueChange={setActiveTab}>
                <div className="flex justify-between items-center mb-6">
                    <TabsList className="grid w-[300px] grid-cols-2 bg-muted/50 p-1">
                        <TabsTrigger value="pending" className="font-bold data-[state=active]:bg-white">Pending</TabsTrigger>
                        <TabsTrigger value="history" className="font-bold data-[state=active]:bg-white">Released History</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="pending" className="m-0">
                    <Card className="border-2 shadow-xl overflow-hidden">
                        <CardHeader className="bg-slate-50 border-b pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Clock className="w-5 h-5 text-orange-500" /> Pending Transfers
                            </CardTitle>
                            <CardDescription>Wait for the expected release date or click release now if cleared.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/30">
                                        <TableHead className="font-bold">Entry Date</TableHead>
                                        <TableHead className="font-bold">Card Type</TableHead>
                                        <TableHead className="font-bold">Amount (PKR)</TableHead>
                                        <TableHead className="font-bold">Expected Clearance</TableHead>
                                        <TableHead className="text-right font-bold">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {holds.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="h-40 text-center text-muted-foreground italic">No pending holds found.</TableCell></TableRow>
                                    ) : holds.map(h => {
                                        const isDue = h.expected_release_date && new Date(h.expected_release_date) <= new Date();
                                        return (
                                            <TableRow key={h.id} className="hover:bg-muted/10 transition-colors">
                                                <TableCell>
                                                    <div className="font-bold">{new Date(h.sale_date).toLocaleDateString()}</div>
                                                    <div className="text-[10px] text-muted-foreground uppercase">Ref: {h.id.slice(0, 8)}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        {h.payment_type === 'supplier_card' ?
                                                            <Building2 className="w-4 h-4 text-primary" /> :
                                                            <Banknote className="w-4 h-4 text-blue-600" />
                                                        }
                                                        <span className="font-bold">{h.payment_methods?.name || 'Card'}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-black text-lg">
                                                    {Number(h.hold_amount).toLocaleString()}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className={isDue ? "text-red-600 font-bold" : "text-muted-foreground"}>
                                                            {new Date(h.expected_release_date).toLocaleDateString()}
                                                        </span>
                                                        {isDue && <Badge className="w-fit scale-75 -ml-2 bg-red-100 text-red-700 hover:bg-red-100 uppercase font-black tracking-tighter">Due Now</Badge>}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        onClick={() => handleRelease(h.id)}
                                                        disabled={releasing === h.id}
                                                        className="bg-slate-900 font-bold rounded-lg shadow-md hover:scale-105 active:scale-95 transition-all"
                                                    >
                                                        {releasing === h.id ? <BrandLoader size="xs" /> : <><ArrowUpRight className="w-4 h-4 mr-2" /> Release Now</>}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history" className="m-0">
                    <Card className="border-2 shadow-sm overflow-hidden">
                        {/* Simpler table for history */}
                        <CardHeader className="bg-slate-50 border-b pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <History className="w-5 h-5 text-green-500" /> Release History
                            </CardTitle>
                            <CardDescription>Recently cleared payments that have hit your accounts.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/30">
                                        <TableHead className="font-bold">Sale Date</TableHead>
                                        <TableHead className="font-bold">Released Date</TableHead>
                                        <TableHead className="font-bold">Method</TableHead>
                                        <TableHead className="text-right font-bold">Amount (PKR)</TableHead>
                                        <TableHead className="text-center font-bold">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {holds.map(h => (
                                        <TableRow key={h.id}>
                                            <TableCell className="text-muted-foreground">{new Date(h.sale_date).toLocaleDateString()}</TableCell>
                                            <TableCell className="font-bold">{new Date(h.actual_release_date).toLocaleDateString()}</TableCell>
                                            <TableCell className="flex items-center gap-2 mt-2">
                                                <Badge variant="outline">{h.payment_methods?.name}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-black">{Number(h.hold_amount).toLocaleString()}</TableCell>
                                            <TableCell className="text-center">
                                                <div className="flex justify-center">
                                                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
