"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Moon, Sun, Laptop, User, Shield, Info, Check, Landmark, Plus, Edit2, Trash2, Power, RefreshCw,
    ArrowRightLeft,
    PlusCircle,
    Fuel,
    CreditCard,
    Database,
    Droplet
} from "lucide-react"
import { BrandLoader as Loader } from "@/components/ui/brand-loader"
import { getPumpConfig, updateAdminPin } from "@/app/actions/config-actions"
import { toast } from "sonner"

interface BankAccount {
    id: string
    account_name: string
    account_number: string | null
    opening_balance: number
    current_balance: number
    status: 'active' | 'inactive'
}

export default function SettingsPage() {
    const { setTheme, theme } = useTheme()
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    // Profile State
    const [profile, setProfile] = useState({
        id: 'mock-id',
        fullName: 'Mock User',
        email: 'user@example.com',
        phone: '0300-1234567'
    })

    // System Settings State
    const [systemConfig, setSystemConfig] = useState({
        id: 'mock-config-id',
        adminPin: '1234'
    })

    // Password State
    const [passwords, setPasswords] = useState({
        current: '',
        new: '',
        confirm: ''
    })

    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
    const [bankFormData, setBankFormData] = useState({
        id: '',
        account_name: '',
        account_number: '',
        opening_balance: '',
        status: 'active' as 'active' | 'inactive'
    })
    const [isBankDialogOpen, setIsBankDialogOpen] = useState(false)
    const [isEditingBank, setIsEditingBank] = useState(false)

    useEffect(() => {
        async function loadConfig() {
            setLoading(true)
            try {
                const config = await getPumpConfig()
                if (config) {
                    setSystemConfig({
                        id: config.id,
                        adminPin: config.admin_pin || ''
                    })
                }
            } catch (error) {
                console.error("Failed to load config:", error)
            } finally {
                setLoading(false)
            }
        }
        loadConfig()
    }, [])

    const handleBankSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setMessage({ type: 'success', text: 'Bank account saved (UI Only mode)' })
        setIsBankDialogOpen(false)
        setTimeout(() => setMessage(null), 3000)
    }

    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        setMessage({ type: 'success', text: 'Profile updated (UI Only mode)' })
        setTimeout(() => setMessage(null), 3000)
    }

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault()
        setMessage({ type: 'success', text: 'Password updated (UI Only mode)' })
        setPasswords({ current: '', new: '', confirm: '' })
        setTimeout(() => setMessage(null), 3000)
    }

    const handlePinUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            await updateAdminPin(systemConfig.adminPin)
            toast.success("Admin PIN updated successfully")
            setMessage({ type: 'success', text: 'Admin PIN updated successfully' })
        } catch (error: any) {
            toast.error(error.message || "Failed to update PIN")
            setMessage({ type: 'error', text: error.message || "Failed to update PIN" })
        } finally {
            setLoading(false)
            setTimeout(() => setMessage(null), 3000)
        }
    }

    return (
        <div className="container max-w-4xl py-6 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground">Manage your account settings and preferences.</p>
            </div>

            <Tabs defaultValue="appearance" className="space-y-4">
                <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
                    <TabsList className="w-fit sm:w-full inline-flex">
                        <TabsTrigger value="appearance" className="flex items-center gap-2 whitespace-nowrap">
                            <Sun className="w-4 h-4" /> Appearance
                        </TabsTrigger>
                        <TabsTrigger value="profile" className="flex items-center gap-2 whitespace-nowrap">
                            <User className="w-4 h-4" /> Profile
                        </TabsTrigger>
                        <TabsTrigger value="security" className="flex items-center gap-2 whitespace-nowrap">
                            <Shield className="w-4 h-4" /> Security
                        </TabsTrigger>
                        <TabsTrigger value="system" className="flex items-center gap-2 whitespace-nowrap">
                            <Shield className="w-4 h-4" /> System
                        </TabsTrigger>
                        <TabsTrigger value="banks" className="flex items-center gap-2 whitespace-nowrap">
                            <Landmark className="w-4 h-4" /> Banks
                        </TabsTrigger>
                        <TabsTrigger value="about" className="flex items-center gap-2 whitespace-nowrap">
                            <Info className="w-4 h-4" /> About
                        </TabsTrigger>
                    </TabsList>
                </div>

                {message && (
                    <Alert variant={message.type === 'error' ? 'destructive' : 'default'} className={message.type === 'success' ? 'border-green-500 text-green-700 bg-green-50' : ''}>
                        {message.type === 'success' ? <Check className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                        <AlertTitle>{message.type === 'success' ? 'Success' : 'Error'}</AlertTitle>
                        <AlertDescription>{message.text}</AlertDescription>
                    </Alert>
                )}

                {/* Appearance Tab */}
                <TabsContent value="appearance">
                    <Card>
                        <CardHeader>
                            <CardTitle>Theme Preferences</CardTitle>
                            <CardDescription>
                                Customize how the application looks on your device.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 pt-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div
                                    className={`cursor-pointer rounded-lg border-2 p-4 hover:bg-accent hover:text-accent-foreground transition-all ${theme === 'light' ? 'border-primary bg-accent' : 'border-muted'}`}
                                    onClick={() => setTheme("light")}
                                >
                                    <div className="mb-2 rounded-md bg-[#ecedef] p-2 h-20 w-full" />
                                    <div className="flex items-center gap-2 font-medium">
                                        <Sun className="w-4 h-4" /> Light
                                    </div>
                                </div>
                                <div
                                    className={`cursor-pointer rounded-lg border-2 p-4 hover:bg-accent hover:text-accent-foreground transition-all ${theme === 'dark' ? 'border-primary bg-accent' : 'border-muted'}`}
                                    onClick={() => setTheme("dark")}
                                >
                                    <div className="mb-2 rounded-md bg-slate-950 p-2 h-20 w-full" />
                                    <div className="flex items-center gap-2 font-medium">
                                        <Moon className="w-4 h-4" /> Dark
                                    </div>
                                </div>
                                <div
                                    className={`cursor-pointer rounded-lg border-2 p-4 hover:bg-accent hover:text-accent-foreground transition-all ${theme === 'system' ? 'border-primary bg-accent' : 'border-muted'}`}
                                    onClick={() => setTheme("system")}
                                >
                                    <div className="mb-2 rounded-md bg-gradient-to-r from-[#ecedef] to-slate-950 p-2 h-20 w-full" />
                                    <div className="flex items-center gap-2 font-medium">
                                        <Laptop className="w-4 h-4" /> System
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Profile Tab */}
                <TabsContent value="profile">
                    <Card>
                        <CardHeader>
                            <CardTitle>Profile Information</CardTitle>
                            <CardDescription>
                                Update your personal details.
                            </CardDescription>
                        </CardHeader>
                        <form onSubmit={handleProfileUpdate}>
                            <CardContent className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="fullName">Full Name</Label>
                                    <Input
                                        id="fullName"
                                        value={profile.fullName}
                                        onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        value={profile.email}
                                        disabled
                                        className="bg-muted"
                                    />
                                    <p className="text-xs text-muted-foreground">Email cannot be changed directly.</p>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="phone">Phone Number</Label>
                                    <Input
                                        id="phone"
                                        value={profile.phone}
                                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                                    />
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button type="submit" disabled={loading}>
                                    {loading ? <Loader size="xs" /> : "Update Profile"}
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>
                </TabsContent>

                {/* Security Tab */}
                <TabsContent value="security">
                    <Card>
                        <CardHeader>
                            <CardTitle>Change Password</CardTitle>
                            <CardDescription>
                                Ensure your account is using a strong password.
                            </CardDescription>
                        </CardHeader>
                        <form onSubmit={handlePasswordChange}>
                            <CardContent className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="new-password">New Password</Label>
                                    <Input
                                        id="new-password"
                                        type="password"
                                        value={passwords.new}
                                        onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="confirm-password">Confirm Password</Label>
                                    <Input
                                        id="confirm-password"
                                        type="password"
                                        value={passwords.confirm}
                                        onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                                    />
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button type="submit" disabled={loading || !passwords.new}>
                                    {loading ? <Loader size="xs" /> : "Update Password"}
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>
                </TabsContent>
                269:
                270:                 {/* System Tab */}
                <TabsContent value="system" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="hover:border-primary/50 transition-colors">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Fuel className="w-5 h-5 text-primary" /> Dispensers & Nozzles
                                </CardTitle>
                                <CardDescription>Configure pumps, nozzles and fuel assignments.</CardDescription>
                            </CardHeader>
                            <CardFooter>
                                <Link href="/dashboard/settings/dispensers" className="w-full">
                                    <Button variant="outline" className="w-full">Manage Equipment</Button>
                                </Link>
                            </CardFooter>
                        </Card>

                        <Card className="hover:border-primary/50 transition-colors">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Database className="w-5 h-5 text-primary" /> Fuel Tanks
                                </CardTitle>
                                <CardDescription>Manage storage tanks, capacity and dry levels.</CardDescription>
                            </CardHeader>
                            <CardFooter>
                                <Link href="/dashboard/settings/tanks" className="w-full">
                                    <Button variant="outline" className="w-full">Manage Tanks</Button>
                                </Link>
                            </CardFooter>
                        </Card>

                        <Card className="hover:border-primary/50 transition-colors">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Droplet className="w-5 h-5 text-primary" /> Lubricants
                                </CardTitle>
                                <CardDescription>Manage engine oils and packed lubricant inventory.</CardDescription>
                            </CardHeader>
                            <CardFooter>
                                <Link href="/dashboard/settings/lubricants" className="w-full">
                                    <Button variant="outline" className="w-full">Manage Lubricants</Button>
                                </Link>
                            </CardFooter>
                        </Card>

                        <Card className="hover:border-primary/50 transition-colors">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <CreditCard className="w-5 h-5 text-primary" /> Payment Methods
                                </CardTitle>
                                <CardDescription>Manage cash, bank cards and credit terms.</CardDescription>
                            </CardHeader>
                            <CardFooter>
                                <Link href="/dashboard/settings/payment-methods" className="w-full">
                                    <Button variant="outline" className="w-full">Manage Payments</Button>
                                </Link>
                            </CardFooter>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Shield className="w-5 h-5 text-primary" /> Admin Security
                                </CardTitle>
                                <CardDescription>Update administrative PIN for overrides.</CardDescription>
                            </CardHeader>
                            <form onSubmit={handlePinUpdate}>
                                <CardContent className="pt-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="adminPin">Admin PIN</Label>
                                        <Input
                                            id="adminPin"
                                            type="password"
                                            maxLength={4}
                                            value={systemConfig.adminPin}
                                            onChange={(e) => setSystemConfig({ ...systemConfig, adminPin: e.target.value })}
                                        />
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    <Button type="submit" variant="secondary" className="w-full">Update PIN</Button>
                                </CardFooter>
                            </form>
                        </Card>
                    </div>
                </TabsContent>

                {/* Banks Tab */}
                <TabsContent value="banks" className="space-y-4">
                    <div className="flex justify-between items-center">
                        <div className="space-y-1">
                            <h3 className="text-lg font-medium">Bank Accounts</h3>
                            <p className="text-sm text-muted-foreground">Manage your payment methods and balances.</p>
                        </div>
                        <Button onClick={() => {
                            setBankFormData({ id: '', account_name: '', account_number: '', opening_balance: '', status: 'active' })
                            setIsEditingBank(false)
                            setIsBankDialogOpen(true)
                        }}>
                            <Plus className="w-4 h-4 mr-2" /> Add Bank
                        </Button>
                    </div>

                    <div className="grid gap-4">
                        {bankAccounts.map(bank => (
                            <Card key={bank.id} className={`overflow-hidden transition-all hover:shadow-md border-2 ${bank.status === 'inactive' ? 'opacity-50 grayscale' : 'hover:border-primary/50'}`}>
                                <div className={`h-1.5 w-full ${bank.status === 'inactive' ? 'bg-muted' : 'bg-gradient-to-r from-primary/80 to-primary'}`} />
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 py-5">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 rounded-2xl bg-primary/5 border border-primary/10 shadow-inner">
                                            <Landmark className="w-6 h-6 text-primary" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg font-bold tracking-tight">{bank.account_name}</CardTitle>
                                            <CardDescription className="font-mono text-[10px] uppercase tracking-widest font-bold text-muted-foreground/70 flex items-center gap-2 mt-0.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                                                {bank.account_number || 'No Account Number'}
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right px-4 py-2 rounded-xl bg-secondary/30 border border-secondary/50 backdrop-blur-sm">
                                            <div className="text-[9px] text-muted-foreground uppercase font-black tracking-tighter mb-0.5">Current Balance</div>
                                            <div className="text-lg font-black text-primary tracking-tight">
                                                <span className="text-xs mr-0.5 opacity-60">Rs.</span>
                                                {bank.current_balance.toLocaleString()}
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-primary/5 hover:text-primary transition-colors" onClick={() => {
                                            setBankFormData({
                                                id: bank.id,
                                                account_name: bank.account_name,
                                                account_number: bank.account_number || '',
                                                opening_balance: bank.opening_balance.toString(),
                                                status: bank.status
                                            })
                                            setIsEditingBank(true)
                                            setIsBankDialogOpen(true)
                                        }}>
                                            <Edit2 className="w-5 h-5" />
                                        </Button>
                                    </div>
                                </CardHeader>
                            </Card>
                        ))}

                        {bankAccounts.length === 0 && (
                            <div className="text-center py-12 border-2 border-dashed rounded-xl">
                                <Landmark className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                                <p className="text-muted-foreground font-medium">No bank accounts configured yet.</p>
                                <Button variant="link" onClick={() => setIsBankDialogOpen(true)}>Add your first bank account</Button>
                            </div>
                        )}
                    </div>

                    {/* Bank Dialog */}
                    <Dialog open={isBankDialogOpen} onOpenChange={setIsBankDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{isEditingBank ? 'Edit Bank Account' : 'Add New Bank Account'}</DialogTitle>
                                <DialogDescription>
                                    Provide details for your bank account. Opening balance sets the starting point.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleBankSubmit}>
                                <div className="grid gap-6 py-6">
                                    <div className="grid gap-2">
                                        <Label htmlFor="bank-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Bank Name / Display Name</Label>
                                        <Input
                                            id="bank-name"
                                            required
                                            value={bankFormData.account_name}
                                            onChange={(e) => setBankFormData({ ...bankFormData, account_name: e.target.value })}
                                            placeholder="e.g. Meezan Bank Main"
                                            className="h-12 rounded-xl border-2 focus-visible:ring-primary/20 bg-background/50"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="bank-account" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Account Number (Optional)</Label>
                                        <Input
                                            id="bank-account"
                                            value={bankFormData.account_number}
                                            onChange={(e) => setBankFormData({ ...bankFormData, account_number: e.target.value })}
                                            placeholder="XXXX-XXXX-XXXX"
                                            className="h-12 rounded-xl border-2 focus-visible:ring-primary/20 font-mono bg-background/50"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="bank-opening" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Opening Balance (Rs)</Label>
                                        <div className="relative">
                                            <Input
                                                id="bank-opening"
                                                type="number"
                                                required
                                                disabled={isEditingBank}
                                                value={bankFormData.opening_balance}
                                                onChange={(e) => setBankFormData({ ...bankFormData, opening_balance: e.target.value })}
                                                placeholder="0.00"
                                                className="h-12 rounded-xl border-2 focus-visible:ring-primary/20 font-bold text-lg bg-background/50 pl-10"
                                            />
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">Rs</span>
                                        </div>
                                        {isEditingBank && <p className="text-[10px] text-muted-foreground italic ml-1 opacity-70">Opening balance cannot be changed after creation.</p>}
                                    </div>
                                    <div className="grid gap-2">
                                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Account Status</Label>
                                        <div className="flex p-1.5 bg-secondary/50 backdrop-blur-sm rounded-2xl gap-1.5 border-2 border-secondary">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                className={`flex-1 rounded-xl h-10 transition-all duration-300 ${bankFormData.status === 'active' ? 'bg-background shadow-md text-primary font-bold' : 'text-muted-foreground hover:text-foreground'}`}
                                                onClick={() => setBankFormData({ ...bankFormData, status: 'active' })}
                                            >
                                                Active
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                className={`flex-1 rounded-xl h-10 transition-all duration-300 ${bankFormData.status === 'inactive' ? 'bg-background shadow-md text-destructive font-bold' : 'text-muted-foreground hover:text-foreground'}`}
                                                onClick={() => setBankFormData({ ...bankFormData, status: 'inactive' })}
                                            >
                                                Inactive
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter className="pt-2">
                                    <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl font-bold text-lg shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                                        {loading ? <Loader size="xs" /> : (isEditingBank ? 'Update Bank Account' : 'Register Bank Account')}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </TabsContent>

                {/* About Tab */}
                <TabsContent value="about">
                    <Card>
                        <CardHeader>
                            <CardTitle>System Information</CardTitle>
                            <CardDescription>
                                Details about the current application version.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="font-medium">App Name</p>
                                    <p className="text-muted-foreground">Petrol Pump Manager</p>
                                </div>
                                <div>
                                    <p className="font-medium">Version</p>
                                    <p className="text-muted-foreground">v1.2.0 (Beta)</p>
                                </div>
                                <div>
                                    <p className="font-medium">Environment</p>
                                    <p className="text-muted-foreground">Production</p>
                                </div>
                                <div>
                                    <p className="font-medium">License</p>
                                    <p className="text-muted-foreground">Pro License</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
