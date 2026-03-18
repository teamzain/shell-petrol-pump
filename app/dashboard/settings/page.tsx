"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
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
    Moon, Sun, Laptop, User, Shield, Info, Check, Plus, Edit2, Trash2, Power, RefreshCw,
    ArrowRightLeft,
    PlusCircle,
    Fuel,
    CreditCard,
    Database,
    Droplet,
    Landmark as BankIcon,
    Eye, EyeOff
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
    const router = useRouter()
    const { setTheme, theme } = useTheme()
    const [loading, setLoading] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [showPin, setShowPin] = useState(false)
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
        setMounted(true)
        const loadInitialData = async () => {
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
        loadInitialData()
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
        if (passwords.new !== passwords.confirm) {
            setMessage({ type: 'error', text: 'Passwords do not match' })
            return
        }

        setLoading(true)
        try {
            const supabase = createClient()
            const { error } = await supabase.auth.updateUser({
                password: passwords.new
            })

            if (error) throw error

            toast.success("Password updated successfully. You are now using your new password.")
            setMessage({ type: 'success', text: 'Password updated successfully' })
            setPasswords({ current: '', new: '', confirm: '' })
        } catch (error: any) {
            toast.error(error.message || "Failed to update password")
            setMessage({ type: 'error', text: error.message || "Failed to update password" })
        } finally {
            setLoading(false)
            setTimeout(() => setMessage(null), 5000)
        }
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
                        <TabsTrigger value="security" className="flex items-center gap-2 whitespace-nowrap">
                            <Shield className="w-4 h-4" /> Security
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
                                    className={`cursor-pointer rounded-lg border-2 p-4 hover:bg-accent hover:text-accent-foreground transition-all ${mounted && theme === 'light' ? 'border-primary bg-accent' : 'border-muted'}`}
                                    onClick={() => setTheme("light")}
                                >
                                    <div className="mb-2 rounded-md bg-[#ecedef] p-2 h-20 w-full" />
                                    <div className="flex items-center gap-2 font-medium">
                                        <Sun className="w-4 h-4" /> Light
                                    </div>
                                </div>
                                <div
                                    className={`cursor-pointer rounded-lg border-2 p-4 hover:bg-accent hover:text-accent-foreground transition-all ${mounted && theme === 'dark' ? 'border-primary bg-accent' : 'border-muted'}`}
                                    onClick={() => setTheme("dark")}
                                >
                                    <div className="mb-2 rounded-md bg-slate-950 p-2 h-20 w-full" />
                                    <div className="flex items-center gap-2 font-medium">
                                        <Moon className="w-4 h-4" /> Dark
                                    </div>
                                </div>
                                <div
                                    className={`cursor-pointer rounded-lg border-2 p-4 hover:bg-accent hover:text-accent-foreground transition-all ${mounted && theme === 'system' ? 'border-primary bg-accent' : 'border-muted'}`}
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


                {/* Security Tab */}
                <TabsContent value="security" className="space-y-4">
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
                                    <div className="relative">
                                        <Input
                                            id="adminPin"
                                            type={showPin ? "text" : "password"}
                                            maxLength={4}
                                            value={systemConfig.adminPin}
                                            onChange={(e) => setSystemConfig({ ...systemConfig, adminPin: e.target.value })}
                                            className="pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPin(!showPin)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {showPin ? (
                                                <EyeOff className="w-4 h-4" />
                                            ) : (
                                                <Eye className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button type="submit" variant="secondary" className="w-full">Update PIN</Button>
                            </CardFooter>
                        </form>
                    </Card>
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
