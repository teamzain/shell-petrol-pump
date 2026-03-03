"use client"

import { useState, useEffect } from "react"
import { format, isBefore, isAfter, startOfDay } from "date-fns"
import { getTodayPKT, getNextDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Wallet,
  Banknote,
  Calendar,
  Lock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Save,
  RefreshCw,
  ArrowRightLeft,
  PlusCircle,
  Truck,
  CreditCard,
  Percent,
  Pencil,
  List,
  History,
  Plus,
  Trash2
} from "lucide-react"
import { BrandLoader as Loader, BrandLoader } from "@/components/ui/brand-loader"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  getBalanceOverviewData,
  recordBalanceTransaction,
  updateDailyOpeningBalances,
  closeDayForBalance,
  syncOpeningFromPreviousClosing,
  addBankCard,
  addBankAccount
} from "@/app/actions/balance"
import { toast } from "sonner"
import { createClient as createBrowserClient } from "@/lib/supabase/client"

interface DailyBalance {
  id: string
  balance_date: string
  cash_opening: number
  cash_closing: number | null
  bank_opening: number
  bank_closing: number | null
  is_closed: boolean
  closed_by: string | null
  closed_at: string | null
  notes: string | null
}

interface BankAccount {
  id: string
  account_name: string
  account_number: string | null
  bank_name: string | null
  current_balance: number
  account_type: string
}

interface Supplier {
  id: string
  supplier_name: string
  account_balance: number
  tax_percentage: number
}

interface BankCard {
  id: string;
  bank_account_id: string;
  card_name: string;
  card_number: string | null;
  tax_percentage: number;
  current_balance: number;
  bank_accounts?: { account_name: string };
}

interface SupplierCard {
  id: string;
  supplier_id: string;
  card_name: string;
  card_number: string | null;
  tax_percentage: number;
  is_active: boolean;
  suppliers?: { name: string };
}

export default function BalanceManagementPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [todayBalance, setTodayBalance] = useState<any | null>(null)
  const [balanceHistory, setBalanceHistory] = useState<any[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankCards, setBankCards] = useState<BankCard[]>([])
  const [supplierCards, setSupplierCards] = useState<SupplierCard[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [workingDate, setWorkingDate] = useState<string>(getTodayPKT())
  const isFutureDate = isAfter(new Date(workingDate), new Date(getTodayPKT()))
  const [openingDialogOpen, setOpeningDialogOpen] = useState(false)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [cardDialogOpen, setCardDialogOpen] = useState(false)
  const [supplierCardDialogOpen, setSupplierCardDialogOpen] = useState(false)
  const [bankAccountDialogOpen, setBankAccountDialogOpen] = useState(false)
  const [supplierTaxDialogOpen, setSupplierTaxDialogOpen] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [newTaxPercentage, setNewTaxPercentage] = useState("0")

  // Editing State
  const [editingBankAccountId, setEditingBankAccountId] = useState<string | null>(null)
  const [editingBankCardId, setEditingBankCardId] = useState<string | null>(null)
  const [editingSupplierCardId, setEditingSupplierCardId] = useState<string | null>(null)

  // Transaction State
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false)
  const [transactionType, setTransactionType] = useState<"cash_to_bank" | "bank_to_cash" | "add_cash" | "add_bank" | "transfer_to_supplier" | "supplier_to_bank">("cash_to_bank")
  const [transactionData, setTransactionData] = useState({
    amount: "",
    description: "",
    bankId: "",
    selectedBankTarget: "",
    supplierId: "",
    selectedSupplierTarget: "",
    taxDeduction: "",
    isOpeningBalance: false
  })

  const [openingBalances, setOpeningBalances] = useState({
    cash: "0",
    bankAccounts: [{ id: "", amount: "" }]
  })

  const [cardData, setCardData] = useState({
    bank_account_id: "",
    card_name: "",
    card_number: "",
    tax_percentage: "0"
  })

  const [supplierCardData, setSupplierCardData] = useState({
    supplier_id: "",
    card_name: "",
    card_number: "",
    tax_percentage: "0"
  })

  const [bankAccountData, setBankAccountData] = useState({
    account_name: "",
    account_number: "",
    bank_name: "",
    opening_balance: "0"
  })

  const fetchData = async (date?: string) => {
    setLoading(true)
    const targetDate = date || workingDate
    try {
      const data = await getBalanceOverviewData(targetDate)
      setTodayBalance(data.todayBalance)
      setBalanceHistory(data.balanceHistory)
      setBankAccounts(data.bankAccounts)
      setBankCards(data.bankCards)
      setSupplierCards(data.supplierCards || [])
      setSuppliers(data.suppliers)
    } catch (err: any) {
      setError(err.message || "Failed to fetch data")
    } finally {
      setLoading(false)
    }
  }

  // Initial load logic to find current working date
  useEffect(() => {
    const init = async () => {
      const data = await getBalanceOverviewData(getTodayPKT())

      // Determine the best initial working date
      // 1. If today is already closed, maybe we want to look at history? 
      // Actually, the requirement: "find the first open day or the day after the last closed day"
      // Let's look at the history provided
      let initialDate = getTodayPKT()
      if (data.balanceHistory && data.balanceHistory.length > 0) {
        // Sort history by date ascending to find the earliest unclosed day
        const sortedHistory = [...data.balanceHistory].sort((a, b) => new Date(a.status_date).getTime() - new Date(b.status_date).getTime())
        const firstOpenDay = sortedHistory.find(h => !h.is_closed)

        if (firstOpenDay) {
          initialDate = firstOpenDay.status_date
        } else {
          // All history is closed. Go to next day *only if it's not in the future*.
          const lastClosedDay = sortedHistory[sortedHistory.length - 1]
          const nextDay = getNextDate(lastClosedDay.status_date)
          const today = getTodayPKT()
          // nextDay <= today means it has arrived
          if (nextDay <= today) {
            initialDate = nextDay
          } else {
            initialDate = today
          }
        }
      }

      setWorkingDate(initialDate)

      // We still need to populate initial state if it happens to be today, 
      // but the other useEffect will trigger fetchData(workingDate) anyway when workingDate changes.
      // However, if workingDate is already today, it won't change, so we set data here.
      if (initialDate === getTodayPKT()) {
        setTodayBalance(data.todayBalance)
        setBalanceHistory(data.balanceHistory)
        setBankAccounts(data.bankAccounts)
        setBankCards(data.bankCards)
        setSupplierCards(data.supplierCards || [])
        setSuppliers(data.suppliers)
        setLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    fetchData(workingDate)
  }, [workingDate])

  // Supabase Realtime Subscription
  useEffect(() => {
    const supabase = createBrowserClient()

    // Subscribe to all relevant tables
    const channel = supabase
      .channel('balance_pumps_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_accounts_status' }, () => {
        fetchData(workingDate)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'balance_transactions' }, () => {
        fetchData(workingDate)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_accounts' }, () => {
        fetchData(workingDate)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workingDate])

  // Auto-sync opening balances when cash or bank opening is 0 and there's a prior closed day
  useEffect(() => {
    if (
      todayBalance &&
      !todayBalance.is_closed &&
      ((todayBalance.opening_cash ?? 0) === 0 || (todayBalance.opening_bank ?? 0) === 0) &&
      balanceHistory.some(h => h.is_closed && h.status_date < workingDate)
    ) {
      syncOpeningFromPreviousClosing(workingDate)
        .then((result) => {
          if (result.success) {
            toast.info(`Opening balances synced from previous day's closing.`)
            fetchData(workingDate)
          }
        })
        .catch(() => { })
    }
  }, [todayBalance?.opening_cash, todayBalance?.opening_bank, workingDate])

  const handleSetOpeningBalance = async () => {
    const invalidBank = openingBalances.bankAccounts.some(b => Number(b.amount) > 0 && !b.id)
    if (invalidBank) {
      toast.error("Please select a bank account for all entered bank balances")
      return
    }

    setSaving(true)
    try {
      await updateDailyOpeningBalances(
        Number(openingBalances.cash),
        openingBalances.bankAccounts
          .filter(b => Number(b.amount) > 0)
          .map(b => ({ id: b.id, amount: Number(b.amount) })),
        workingDate
      )
      toast.success("Opening balance updated")
      setOpeningDialogOpen(false)
      fetchData(workingDate)
    } catch (err: any) {
      toast.error(err.message || "Failed to update balance")
    } finally {
      setSaving(false)
    }
  }

  const addBankOpeningRow = () => {
    setOpeningBalances({
      ...openingBalances,
      bankAccounts: [...openingBalances.bankAccounts, { id: "", amount: "" }]
    })
  }

  const removeBankOpeningRow = (index: number) => {
    const newAccounts = [...openingBalances.bankAccounts]
    newAccounts.splice(index, 1)
    setOpeningBalances({
      ...openingBalances,
      bankAccounts: newAccounts
    })
  }

  const updateBankOpeningRow = (index: number, field: 'id' | 'amount', value: string) => {
    const newAccounts = [...openingBalances.bankAccounts]
    newAccounts[index] = { ...newAccounts[index], [field]: value }
    setOpeningBalances({
      ...openingBalances,
      bankAccounts: newAccounts
    })
  }

  const handleCloseDay = async () => {
    setSaving(true)
    try {
      // totalBankAssets is the sum of all bank_accounts.current_balance — the true bank total
      // currentCashBalance is the running cash figure from daily_accounts_status
      const result = await closeDayForBalance(currentCashBalance, totalBankAssets, workingDate)
      toast.success("Day closed successfully")
      setCloseDialogOpen(false)

      // Only shift to next day if it has already arrived (not a future date)
      if (result.nextDateOpened && result.nextDate) {
        setWorkingDate(result.nextDate)
        toast.info(`Moved to ${result.nextDate}`)
      } else {
        // Next day is in the future — stay on current date and just refresh
        fetchData(workingDate)
        toast.info("Day closed. Next day will open when it arrives.")
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to close day")
    } finally {
      setSaving(false)
    }
  }

  const handleTransaction = async () => {
    setSaving(true)
    try {
      // Parse selected bank target: 'acc_<uuid>' or 'card_<uuid>'
      let bankAccountId: string | undefined
      let bankCardId: string | undefined
      const bankTarget = transactionData.selectedBankTarget
      if (bankTarget.startsWith('acc_')) bankAccountId = bankTarget.slice(4)
      else if (bankTarget.startsWith('card_')) bankCardId = bankTarget.slice(5)
      else if (transactionData.bankId) bankAccountId = transactionData.bankId

      // Parse selected supplier target: 'supp_<uuid>' or 'suppcard_<uuid>'
      let supplierId: string | undefined
      let supplierCardId: string | undefined
      const suppTarget = transactionData.selectedSupplierTarget
      if (suppTarget.startsWith('supp_')) supplierId = suppTarget.slice(5)
      else if (suppTarget.startsWith('suppcard_')) supplierCardId = suppTarget.slice(9)
      else if (transactionData.supplierId) supplierId = transactionData.supplierId

      await recordBalanceTransaction({
        transaction_type: transactionType as any,
        amount: Number(transactionData.amount),
        bank_account_id: bankAccountId,
        bank_card_id: bankCardId,
        supplier_id: supplierId,
        supplier_card_id: supplierCardId,
        description: transactionData.description,
        isOpeningBalance: transactionData.isOpeningBalance,
        date: workingDate
      })

      // If it's a supplier transfer and tax is specified, we could handle it here or in the server action.
      // For now, let's keep it simple as per implementation plan.

      toast.success("Transaction recorded")
      setTransactionDialogOpen(false)
      setTransactionData({
        amount: "",
        description: "",
        bankId: "",
        selectedBankTarget: "",
        supplierId: "",
        selectedSupplierTarget: "",
        taxDeduction: "",
        isOpeningBalance: false
      })
      fetchData(workingDate)
    } catch (err: any) {
      toast.error(err.message || "Failed to record transaction")
    } finally {
      setSaving(false)
    }
  }

  const handleAddSupplierCard = async () => {
    setSaving(true)
    try {
      const { addSupplierCard, updateSupplierCard } = await import("@/app/actions/balance")

      if (editingSupplierCardId) {
        await updateSupplierCard(editingSupplierCardId, {
          supplier_id: supplierCardData.supplier_id,
          card_name: supplierCardData.card_name,
          card_number: supplierCardData.card_number,
          tax_percentage: Number(supplierCardData.tax_percentage)
        })
        toast.success("Supplier card updated")
      } else {
        await addSupplierCard({
          supplier_id: supplierCardData.supplier_id,
          card_name: supplierCardData.card_name,
          card_number: supplierCardData.card_number,
          tax_percentage: Number(supplierCardData.tax_percentage)
        })
        toast.success("Supplier card added")
      }

      setSupplierCardDialogOpen(false)
      setEditingSupplierCardId(null)
      setSupplierCardData({
        supplier_id: "",
        card_name: "",
        card_number: "",
        tax_percentage: "0"
      })
      fetchData()
    } catch (err: any) {
      toast.error(err.message || "Failed to add supplier card")
    } finally {
      setSaving(false)
    }
  }

  const handleAddCard = async () => {
    setSaving(true)
    try {
      if (editingBankCardId) {
        const { updateBankCard } = await import("@/app/actions/balance")
        await updateBankCard(editingBankCardId, {
          bank_account_id: cardData.bank_account_id,
          card_name: cardData.card_name,
          card_number: cardData.card_number,
          tax_percentage: Number(cardData.tax_percentage)
        })
        toast.success("Bank card updated")
      } else {
        await addBankCard({
          bank_account_id: cardData.bank_account_id,
          card_name: cardData.card_name,
          card_number: cardData.card_number,
          tax_percentage: Number(cardData.tax_percentage)
        })
        toast.success("Bank card added")
      }
      setCardDialogOpen(false)
      setEditingBankCardId(null)
      setCardData({
        bank_account_id: "",
        card_name: "",
        card_number: "",
        tax_percentage: "0"
      })
      fetchData()
    } catch (err: any) {
      toast.error(err.message || "Failed to add card")
    } finally {
      setSaving(false)
    }
  }

  const handleAddBankAccount = async () => {
    setSaving(true)
    try {
      if (editingBankAccountId) {
        const { updateBankAccount } = await import("@/app/actions/balance")
        await updateBankAccount(editingBankAccountId, {
          account_name: bankAccountData.account_name,
          account_number: bankAccountData.account_number,
          bank_name: bankAccountData.bank_name,
          opening_balance: Number(bankAccountData.opening_balance)
        })
        toast.success("Bank account updated")
      } else {
        await addBankAccount({
          account_name: bankAccountData.account_name,
          account_number: bankAccountData.account_number,
          bank_name: bankAccountData.bank_name,
          opening_balance: Number(bankAccountData.opening_balance)
        })
        toast.success("Bank account added")
      }
      setBankAccountDialogOpen(false)
      setEditingBankAccountId(null)
      setBankAccountData({
        account_name: "",
        account_number: "",
        bank_name: "",
        opening_balance: "0"
      })
      fetchData()
    } catch (err: any) {
      toast.error(err.message || "Failed to add bank account")
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateSupplierTax = async () => {
    if (!selectedSupplier) return
    setSaving(true)
    try {
      const { updateSupplierTax } = await import("@/app/actions/balance")
      await updateSupplierTax(selectedSupplier.id, Number(newTaxPercentage))
      toast.success("Supplier tax percentage updated")
      setSupplierTaxDialogOpen(false)
      fetchData()
    } catch (err: any) {
      toast.error(err.message || "Failed to update tax percentage")
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return "-"
    return `Rs. ${Number(amount).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // daily_accounts_status uses opening_cash / closing_cash / opening_bank / closing_bank
  const currentCashBalance = todayBalance?.closing_cash ?? todayBalance?.opening_cash ?? 0
  const currentBankBalance = todayBalance?.closing_bank ?? todayBalance?.opening_bank ?? 0
  const totalBankAssets = bankAccounts.reduce((acc, bank) => acc + (bank.current_balance || 0), 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Balance Management</h1>
        <p className="text-muted-foreground">
          Manage daily cash and bank balances with automatic rollover
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-primary bg-primary/5">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Redesigned Action Section */}
      {/* Actions Dropdowns */}
      <div className="flex flex-wrap gap-3 mb-8">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="lg" className="bg-primary hover:bg-primary/90 shadow-md gap-2 px-6">
              <ArrowRightLeft className="h-5 w-5" />
              Transaction Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Money Movement</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => {
              setTransactionType("cash_to_bank")
              setTransactionDialogOpen(true)
            }}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Cash to Bank
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              setTransactionType("bank_to_cash")
              setTransactionDialogOpen(true)
            }}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Bank to Cash
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Manual Adjustments</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => {
              setTransactionType("add_cash")
              setTransactionDialogOpen(true)
            }}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Cash
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              setTransactionType("add_bank")
              setTransactionDialogOpen(true)
            }}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Bank Balance
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              setTransactionType("supplier_to_bank")
              setTransactionDialogOpen(true)
            }} className="text-emerald-600 focus:text-emerald-600">
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Supplier to Bank
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => {
              setTransactionType("transfer_to_supplier")
              setTransactionDialogOpen(true)
            }} className="text-amber-600 focus:text-amber-600">
              <Truck className="mr-2 h-4 w-4" />
              Transfer to Supplier
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="lg" variant="outline" className="border-primary/20 hover:bg-primary/5 shadow-sm gap-2 px-6 text-foreground">
              <List className="h-5 w-5" />
              Management & Setup
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Add New Entities</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => {
              setEditingBankAccountId(null)
              setBankAccountData({ account_name: "", account_number: "", bank_name: "", opening_balance: "0" })
              setBankAccountDialogOpen(true)
            }}>
              <Banknote className="mr-2 h-4 w-4" />
              Bank Account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              setEditingBankCardId(null)
              setCardData({ bank_account_id: "", card_name: "", card_number: "", tax_percentage: "0" })
              setCardDialogOpen(true)
            }}>
              <CreditCard className="mr-2 h-4 w-4" />
              Bank Card
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              setEditingSupplierCardId(null)
              setSupplierCardData({ supplier_id: "", card_name: "", card_number: "", tax_percentage: "0" })
              setSupplierCardDialogOpen(true)
            }}>
              <CreditCard className="mr-2 h-4 w-4" />
              Supplier Card
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Current Balance Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-2 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <Wallet className="h-4 w-4 text-primary" />
              Cash Balance
            </CardTitle>
            {todayBalance?.is_closed && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] gap-1 bg-amber-100 text-amber-700 border-amber-200">
                <Lock className="h-3 w-3" />
                Closed
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black tracking-tight text-foreground">{formatCurrency(currentCashBalance)}</div>
            <div className="mt-4 pt-4 border-t space-y-2 text-xs font-semibold">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                  Opening
                </span>
                <span className="text-foreground">{formatCurrency(todayBalance?.opening_cash ?? 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 shadow-sm hover:shadow-md transition-all bg-primary/[0.02]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <Banknote className="h-4 w-4 text-primary" />
              Total Bank Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black tracking-tight text-primary">{formatCurrency(totalBankAssets)}</div>
            <div className="mt-4 pt-4 border-t space-y-2 text-xs font-semibold">
              <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase tracking-wider">
                <span>Aggregate Funds across {bankAccounts.length} Banks</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-dashed flex flex-col items-center justify-center p-6 text-center bg-muted/30">
          <div className="p-3 rounded-full bg-background border shadow-sm mb-3">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <h4 className="font-bold text-sm">Total Supplier Balance</h4>
          <p className="text-2xl font-black mt-1">{formatCurrency(suppliers.reduce((sum, s) => sum + (s.account_balance || 0), 0))}</p>
          <p className="text-[10px] text-muted-foreground px-4 italic mt-2">Active prepaid balances across suppliers.</p>
        </Card>
      </div>

      <Tabs defaultValue="bank_accounts" className="space-y-4">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="bank_accounts" className="data-[state=active]:bg-background">
            <Banknote className="h-4 w-4 mr-2" />
            Bank Accounts
          </TabsTrigger>
          <TabsTrigger value="bank_cards" className="data-[state=active]:bg-background">
            <CreditCard className="h-4 w-4 mr-2" />
            Bank Cards
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="data-[state=active]:bg-background">
            <Truck className="h-4 w-4 mr-2" />
            Supplier Accounts
          </TabsTrigger>
          <TabsTrigger value="supplier_cards" className="data-[state=active]:bg-background">
            <CreditCard className="h-4 w-4 mr-2" />
            Supplier Cards
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bank_accounts" className="space-y-4">
          <Card className="border-2 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Banknote className="h-5 w-5 text-primary" />
                Bank Accounts Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {bankAccounts.map(bank => (
                  <div key={bank.id} className="p-4 border rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors group relative">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase">{bank.account_name}</p>
                        <p className="text-xl font-black mt-1">{formatCurrency(bank.current_balance)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          setEditingBankAccountId(bank.id)
                          setBankAccountData({
                            account_name: bank.account_name,
                            account_number: bank.account_number || "",
                            bank_name: bank.bank_name || "",
                            opening_balance: bank.current_balance.toString()
                          })
                          setBankAccountDialogOpen(true)
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                    {bank.account_number && <p className="text-[10px] text-muted-foreground font-mono mt-1">Acc: {bank.account_number}</p>}
                  </div>
                ))}
                {bankAccounts.length === 0 && <p className="text-sm text-muted-foreground italic col-span-full">No active bank accounts found.</p>}
              </div>
              <div className="mt-4 pt-4 border-t flex justify-between items-center">
                <span className="text-sm font-bold text-muted-foreground">Total Bank Assets:</span>
                <span className="text-xl font-black text-primary">{formatCurrency(bankAccounts.reduce((sum, b) => sum + Number(b.current_balance), 0))}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <Card className="border-2 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Truck className="h-5 w-5 text-amber-600" />
                Supplier Accounts Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {suppliers.map(supplier => (
                  <div key={supplier.id} className="p-4 border rounded-xl bg-amber-500/[0.03] hover:bg-amber-500/[0.08] transition-colors border-amber-200/50 group">
                    <div className="flex justify-between items-start">
                      <p className="text-xs font-bold text-muted-foreground uppercase">{supplier.supplier_name}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          setSelectedSupplier(supplier)
                          setNewTaxPercentage((supplier.tax_percentage || 0).toString())
                          setSupplierTaxDialogOpen(true)
                        }}
                      >
                        <Percent className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className={`text-xl font-black mt-1 ${(supplier.account_balance || 0) > 0 ? 'text-amber-700' : (supplier.account_balance || 0) < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {formatCurrency(supplier.account_balance || 0)}
                    </p>
                    <div className="flex justify-between items-center mt-2">
                      <p className="text-[10px] text-muted-foreground italic">
                        {(supplier.account_balance || 0) > 0 ? 'Prepaid Balance' : (supplier.account_balance || 0) < 0 ? 'Outstanding Payable' : 'No Balance'}
                      </p>
                      {supplier.tax_percentage > 0 && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-300 text-amber-700">
                          {supplier.tax_percentage}% Tax
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                {suppliers.length === 0 && (
                  <div className="col-span-full py-10 text-center border-dashed border-2 rounded-xl">
                    <p className="text-sm text-muted-foreground italic">No active suppliers found.</p>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t flex justify-between items-center">
                <span className="text-sm font-bold text-muted-foreground">Total Prepaid Funds:</span>
                <span className="text-xl font-black text-amber-600">
                  {formatCurrency(suppliers.reduce((sum, s) => sum + (s.account_balance || 0), 0))}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bank_cards" className="space-y-4">
          <Card className="border-none shadow-xl bg-background/50 backdrop-blur-sm overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <CreditCard className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-xl">Bank Cards</CardTitle>
                  <CardDescription>Individual cards linked to accounts</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {bankCards.map(card => (
                  <div key={card.id} className="p-4 border rounded-xl bg-blue-500/[0.03] hover:bg-blue-500/[0.08] transition-colors border-blue-200/50 group relative">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase">{card.card_name}</p>
                        <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-700 mt-1">
                          Linked: {card.bank_accounts?.account_name}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          setEditingBankCardId(card.id)
                          setCardData({
                            bank_account_id: card.bank_account_id,
                            card_name: card.card_name,
                            card_number: card.card_number || "",
                            tax_percentage: card.tax_percentage.toString()
                          })
                          setCardDialogOpen(true)
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="mt-2 flex justify-between items-center">
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {card.card_number || "**** **** **** ****"}
                      </p>
                      {card.tax_percentage > 0 && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-blue-300 text-blue-700">
                          {card.tax_percentage}% Tax
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                {bankCards.length === 0 && (
                  <div className="col-span-full py-8 text-center border-2 border-dashed rounded-xl border-muted/20">
                    <CreditCard className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No bank cards added yet.</p>
                  </div>
                )}
              </div>
              {bankCards.length > 0 && (
                <div className="mt-4 pt-4 border-t flex justify-between items-center">
                  <span className="text-sm font-bold text-muted-foreground">Total Card Balance:</span>
                  <span className="text-xl font-black text-blue-600">
                    {formatCurrency(bankCards.reduce((sum, c) => sum + (c.current_balance || 0), 0))}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="supplier_cards" className="space-y-4">
          <Card className="border-none shadow-xl bg-background/50 backdrop-blur-sm overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <CreditCard className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <CardTitle className="text-xl">Supplier Cards</CardTitle>
                  <CardDescription>Cards used for supplier payments (aliases)</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {supplierCards.map(card => (
                  <div key={card.id} className="p-4 border rounded-xl bg-orange-500/[0.03] hover:bg-orange-500/[0.08] transition-colors border-orange-200/50 group relative">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase">{card.card_name}</p>
                        <Badge variant="outline" className="text-[10px] border-orange-200 text-orange-700 mt-1">
                          Linked To: {card.suppliers?.name}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          setEditingSupplierCardId(card.id)
                          setSupplierCardData({
                            supplier_id: card.supplier_id,
                            card_name: card.card_name,
                            card_number: card.card_number || "",
                            tax_percentage: card.tax_percentage.toString()
                          })
                          setSupplierCardDialogOpen(true)
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {card.card_number || "NO CARD NUMBER"}
                      </p>
                      {card.tax_percentage > 0 && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-orange-300 text-orange-700">
                          {card.tax_percentage}% Tax
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                {supplierCards.length === 0 && (
                  <div className="col-span-full py-8 text-center border-2 border-dashed rounded-xl border-muted/20">
                    <CreditCard className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No supplier cards added yet.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Daily Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Manage Day
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={workingDate}
                max={getTodayPKT()}
                onChange={(e) => setWorkingDate(e.target.value)}
                className="w-40 h-9"
              />
            </div>
          </CardTitle>
          <CardDescription>
            {workingDate === getTodayPKT() ? "Managing Today" : `Managing ${new Date(workingDate).toLocaleDateString("en-PK", { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2 sm:gap-4">
          <Button
            onClick={() => {
              setOpeningBalances({
                cash: (todayBalance?.opening_cash || 0).toString(),
                bankAccounts: [{ id: "", amount: "" }]
              })
              setOpeningDialogOpen(true)
            }}
            disabled={todayBalance?.is_closed || todayBalance?.opening_balances_set || isFutureDate}
            variant={todayBalance?.is_closed || todayBalance?.opening_balances_set ? "secondary" : "default"}
            className="w-full sm:w-auto"
          >
            <Save className="mr-2 h-4 w-4" />
            Set Opening
          </Button>
          <Button
            onClick={() => setCloseDialogOpen(true)}
            disabled={!todayBalance || todayBalance?.is_closed || isFutureDate}
            variant="outline"
            className="w-full sm:w-auto"
          >
            <Lock className="mr-2 h-4 w-4" />
            Close Day
          </Button>
          <Button
            onClick={() => fetchData()}
            disabled={loading}
            variant="ghost"
            className="w-full sm:w-auto"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Balance History */}
      <Card>
        <CardHeader>
          <CardTitle>Balance History</CardTitle>
          <CardDescription>
            View historical daily balances. Previous days cannot be edited.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader size="lg" />
            </div>
          ) : balanceHistory.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-center">
              <Calendar className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No balance records found</p>
              <Button
                variant="link"
                className="mt-1"
                onClick={() => setOpeningDialogOpen(true)}
              >
                Set today's opening balance
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="whitespace-nowrap">Date</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Cash Opening</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Cash Closing</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Bank Opening</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Bank Closing</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balanceHistory.map((balance) => {
                    const isToday = balance.status_date === getTodayPKT()
                    const cashChange = (balance.closing_cash ?? balance.opening_cash) - (balance.opening_cash ?? 0)
                    const displayBankClosing = isToday ? totalBankAssets : balance.closing_bank
                    const bankChange = (displayBankClosing ?? balance.opening_bank ?? 0) - (balance.opening_bank ?? 0)

                    return (
                      <TableRow key={balance.id} className={isToday ? "bg-muted/50 font-semibold" : ""}>
                        <TableCell className="font-medium">
                          {new Date(balance.status_date).toLocaleDateString("en-PK", {
                            weekday: "short",
                            month: "short",
                            day: "numeric"
                          })}
                          {isToday && <Badge variant="outline" className="ml-2">Today</Badge>}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(balance.opening_cash)}</TableCell>
                        <TableCell className="text-right">
                          {balance.closing_cash !== null ? (
                            <span className="flex items-center justify-end gap-1">
                              {formatCurrency(balance.closing_cash)}
                              {cashChange !== 0 && (
                                <span className={`text-xs ${cashChange > 0 ? "text-primary" : "text-destructive"}`}>
                                  {cashChange > 0 ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(balance.opening_bank)}</TableCell>
                        <TableCell className="text-right">
                          {displayBankClosing !== null ? (
                            <span className="flex items-center justify-end gap-1">
                              {formatCurrency(displayBankClosing)}
                              {bankChange !== 0 && (
                                <span className={`text-xs ${bankChange > 0 ? "text-primary" : "text-destructive"}`}>
                                  {bankChange > 0 ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {balance.is_closed ? (
                            <Badge variant="secondary" className="gap-1">
                              <Lock className="h-3 w-3" />
                              Closed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Open
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Set Opening Balance Dialog */}
      <Dialog open={openingDialogOpen} onOpenChange={setOpeningDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Opening Balance</DialogTitle>
            <DialogDescription>
              Set today's opening balance for cash and bank accounts.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {todayBalance?.opening_balances_set ? (
              <Alert className="bg-amber-50 text-amber-800 border-amber-200">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Already Set</AlertTitle>
                <AlertDescription>
                  Opening balances for this day have already been set and cannot be modified.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="cash_opening" className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" />
                    Cash Opening Balance
                  </Label>
                  <Input
                    id="cash_opening"
                    type="number"
                    step="0.01"
                    min="0"
                    value={openingBalances.cash}
                    onChange={(e) => setOpeningBalances({ ...openingBalances, cash: e.target.value })}
                    placeholder="Enter cash balance"
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 text-primary font-semibold">
                      <Banknote className="h-4 w-4" />
                      Bank Account Balances
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addBankOpeningRow}
                      className="h-8 gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Account
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {openingBalances.bankAccounts.map((account, index) => (
                      <div key={index} className="flex gap-3 items-end animate-in fade-in slide-in-from-top-2">
                        <div className="flex-1 space-y-1.5">
                          <Label className="text-[10px] uppercase text-muted-foreground ml-1">Account</Label>
                          <Select
                            value={account.id}
                            onValueChange={(v) => updateBankOpeningRow(index, 'id', v)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Choose bank..." />
                            </SelectTrigger>
                            <SelectContent>
                              {bankAccounts.map(bank => (
                                <SelectItem key={bank.id} value={bank.id}>
                                  {bank.account_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-[140px] space-y-1.5">
                          <Label className="text-[10px] uppercase text-muted-foreground ml-1">Opening Amount</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="h-9"
                            value={account.amount}
                            onChange={(e) => updateBankOpeningRow(index, 'amount', e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeBankOpeningRow(index)}
                          className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={openingBalances.bankAccounts.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpeningDialogOpen(false)} className="w-full sm:w-auto">
              {todayBalance?.opening_balances_set ? "Close" : "Cancel"}
            </Button>
            {!todayBalance?.opening_balances_set && (
              <Button onClick={handleSetOpeningBalance} disabled={saving} className="w-full sm:w-auto">
                {saving ? <Loader size="xs" /> : "Save Opening Balance"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Day Confirmation Dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Day</DialogTitle>
            <DialogDescription>
              Are you sure you want to close today's books? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                Once closed, you cannot edit today's balances. Tomorrow's opening balance will be automatically set to today's closing balance.
              </AlertDescription>
            </Alert>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cash Closing:</span>
                <span className="font-medium">{formatCurrency(currentCashBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bank Closing:</span>
                <span className="font-medium">{formatCurrency(currentBankBalance)}</span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleCloseDay} disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader size="xs" /> : "Close Day"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction Dialog */}
      <Dialog open={transactionDialogOpen} onOpenChange={setTransactionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {transactionType === "cash_to_bank" ? "Transfer Cash to Bank" :
                transactionType === "bank_to_cash" ? "Withdraw Bank to Cash" :
                  transactionType === "add_cash" ? "Add Cash Balance" :
                    transactionType === "supplier_to_bank" ? "Transfer from Supplier to Bank" : "Transfer to Supplier"}
            </DialogTitle>
            <DialogDescription>
              {transactionType === "cash_to_bank"
                ? "Record a deposit of cash earnings into a bank account."
                : transactionType === "bank_to_cash" ? "Record a withdrawal from a bank account into cash."
                  : transactionType === "transfer_to_supplier" ? "Transfer funds to a supplier account."
                    : transactionType === "supplier_to_bank" ? "Record funds received from a supplier into your bank."
                      : "Manually add funds to the balance with a reason."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Transaction Type</Label>
              <Select
                value={transactionType}
                onValueChange={(v: any) => setTransactionType(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash_to_bank">🏦 Cash to Bank Deposit</SelectItem>
                  <SelectItem value="bank_to_cash">🏧 Bank to Cash Withdrawal</SelectItem>
                  <SelectItem value="add_cash">💵 Add Manual Cash</SelectItem>
                  <SelectItem value="add_bank">🏦 Add Manual Bank Bal</SelectItem>
                  <SelectItem value="transfer_to_supplier">🤝 Transfer to Supplier</SelectItem>
                  <SelectItem value="supplier_to_bank">🔄 Supplier to Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(transactionType === "cash_to_bank" || transactionType === "bank_to_cash" || transactionType === "add_bank" || transactionType === "transfer_to_supplier" || transactionType === "supplier_to_bank") && (
              <div className="space-y-2 animate-in slide-in-from-top-2">
                <Label>Select Bank / Card {transactionType === "transfer_to_supplier" && "(Optional)"}</Label>
                <Select
                  value={transactionData.selectedBankTarget}
                  onValueChange={(v: string) => setTransactionData(prev => ({ ...prev, selectedBankTarget: v, bankId: '' }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={transactionType === "transfer_to_supplier" ? "Default to Cash" : "Choose Bank or Card..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">🏦 Bank Accounts</div>
                        {bankAccounts.map(bank => (
                          <SelectItem key={bank.id} value={`acc_${bank.id}`}>
                            {bank.account_name} — {formatCurrency(bank.current_balance)}
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {bankCards.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">💳 Bank Cards</div>
                        {bankCards.map(card => (
                          <SelectItem key={card.id} value={`card_${card.id}`}>
                            {card.card_name} — {formatCurrency(card.current_balance)}
                            {card.tax_percentage > 0 && ` (Tax: ${card.tax_percentage}%)`}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(transactionType === "transfer_to_supplier" || transactionType === "supplier_to_bank") && (
              <div className="space-y-4 animate-in slide-in-from-top-2">
                <div className="space-y-2">
                  <Label>Select Supplier Account / Card</Label>
                  <Select
                    value={transactionData.selectedSupplierTarget}
                    onValueChange={(v: string) => {
                      let taxVal = ""
                      if (v.startsWith('suppcard_')) {
                        const cardId = v.slice(9)
                        const card = supplierCards.find(c => c.id === cardId)
                        if (card && card.tax_percentage > 0) {
                          taxVal = card.tax_percentage.toString()
                        }
                      } else if (v.startsWith('supp_')) {
                        const suppId = v.slice(5)
                        const supp = suppliers.find(s => s.id === suppId)
                        if (supp && supp.tax_percentage > 0) {
                          taxVal = supp.tax_percentage.toString()
                        }
                      }
                      setTransactionData(prev => ({
                        ...prev,
                        selectedSupplierTarget: v,
                        supplierId: '',
                        taxDeduction: taxVal
                      }))
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose Supplier or Card..." />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">🚚 Supplier Accounts</div>
                          {suppliers.map(supp => (
                            <SelectItem key={supp.id} value={`supp_${supp.id}`}>
                              {supp.supplier_name} — {formatCurrency(supp.account_balance)}
                            </SelectItem>
                          ))}
                        </>
                      )}
                      {supplierCards.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">💳 Supplier Cards</div>
                          {supplierCards.map(card => (
                            <SelectItem key={card.id} value={`suppcard_${card.id}`}>
                              {card.card_name} — via {card.suppliers?.name}
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tax_deduction" className="flex items-center gap-1">
                    <Percent className="h-3.5 w-3.5" />
                    Tax Deduction % (Optional)
                  </Label>
                  <Input
                    id="tax_deduction"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={transactionData.taxDeduction}
                    onChange={(e) => setTransactionData(prev => ({ ...prev, taxDeduction: e.target.value }))}
                    placeholder="Enter custom tax % for this transaction"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="tx_amount">Amount</Label>
              <Input
                id="tx_amount"
                type="number"
                min="0"
                value={transactionData.amount}
                onChange={(e) => setTransactionData({ ...transactionData, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>

            {(transactionType === "add_cash" || transactionType === "add_bank") && (
              <div className="flex items-center justify-between space-x-2 p-3 border rounded-lg bg-orange-500/5 border-orange-200/50 animate-in slide-in-from-top-2">
                <div className="space-y-0.5">
                  <Label className="text-sm font-bold flex items-center gap-2">
                    <History className="h-4 w-4 text-orange-600" />
                    Opening Balance Adjustment
                  </Label>
                  <p className="text-[10px] text-muted-foreground italic">
                    Toggle this to update the day's starting balance instead of a regular transaction.
                  </p>
                </div>
                <Switch
                  checked={transactionData.isOpeningBalance}
                  onCheckedChange={(checked) => setTransactionData(prev => ({ ...prev, isOpeningBalance: checked }))}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="tx_desc">Reason / Description</Label>
              <Textarea
                id="tx_desc"
                value={transactionData.description}
                onChange={(e) => setTransactionData({ ...transactionData, description: e.target.value })}
                placeholder="e.g., Owner contribution, Night deposit..."
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setTransactionDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleTransaction} disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader size="xs" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Bank Card Dialog */}
      <Dialog open={cardDialogOpen} onOpenChange={setCardDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-violet-600" />
              {editingBankCardId ? "Edit Bank Card" : "Add Bank Card"}
            </DialogTitle>
            <DialogDescription>
              {editingBankCardId ? "Update existing bank card details." : "Add a card linked to a bank account with its opening balance and tax deduction percentage."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Linked Bank Account</Label>
              <Select
                value={cardData.bank_account_id}
                onValueChange={(v) => setCardData(prev => ({ ...prev, bank_account_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account..." />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map(bank => (
                    <SelectItem key={bank.id} value={bank.id}>
                      {bank.account_name} ({formatCurrency(bank.current_balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="card_name">Card Name / Label</Label>
              <Input
                id="card_name"
                value={cardData.card_name}
                onChange={(e) => setCardData(prev => ({ ...prev, card_name: e.target.value }))}
                placeholder="e.g., Meezan Debit Card"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card_number">Card Number (last 4 digits, optional)</Label>
              <Input
                id="card_number"
                value={cardData.card_number}
                onChange={(e) => setCardData(prev => ({ ...prev, card_number: e.target.value }))}
                placeholder="e.g., 4242"
                maxLength={16}
              />
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tax_pct" className="flex items-center gap-1">
                  <Percent className="h-3.5 w-3.5" />
                  Whithholding Tax %
                </Label>
                <Input
                  id="tax_pct"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={cardData.tax_percentage}
                  onChange={(e) => setCardData(prev => ({ ...prev, tax_percentage: e.target.value }))}
                  placeholder="0.00"
                />
                <p className="text-[10px] text-muted-foreground italic">Tax percentage automatically applied to receipts from this card.</p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCardDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button
              onClick={handleAddCard}
              disabled={saving || !cardData.card_name || !cardData.bank_account_id}
              className="w-full sm:w-auto"
            >
              {saving ? <Loader size="sm" className="mr-2" /> : editingBankCardId ? <Save className="mr-2 h-4 w-4" /> : <PlusCircle className="mr-2 h-4 w-4" />}
              {editingBankCardId ? "Update Card" : "Add Card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Supplier Card Dialog */}
      <Dialog open={supplierCardDialogOpen} onOpenChange={setSupplierCardDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSupplierCardId ? "Edit Supplier Card" : "Add Supplier Card"}</DialogTitle>
            <DialogDescription>
              {editingSupplierCardId ? "Update existing supplier card details." : "Link a new card to a supplier account."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="supp_card_name">Card Name</Label>
              <Input
                id="supp_card_name"
                value={supplierCardData.card_name}
                onChange={(e) => setSupplierCardData(prev => ({ ...prev, card_name: e.target.value }))}
                placeholder="e.g., PSO Fleet Card"
              />
            </div>
            <div className="space-y-2">
              <Label>Linked Supplier</Label>
              <Select
                value={supplierCardData.supplier_id}
                onValueChange={(v) => setSupplierCardData(prev => ({ ...prev, supplier_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose Supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(supp => (
                    <SelectItem key={supp.id} value={supp.id}>{supp.supplier_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="supp_card_num">Card Number (Optional)</Label>
              <Input
                id="supp_card_num"
                value={supplierCardData.card_number}
                onChange={(e) => setSupplierCardData(prev => ({ ...prev, card_number: e.target.value }))}
                placeholder="e.g., 1234..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supp_tax_pct" className="flex items-center gap-1">
                <Percent className="h-3.5 w-3.5" />
                Default Tax Percentage
              </Label>
              <Input
                id="supp_tax_pct"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={supplierCardData.tax_percentage}
                onChange={(e) => setSupplierCardData(prev => ({ ...prev, tax_percentage: e.target.value }))}
                placeholder="0.00"
              />
              <p className="text-[10px] text-muted-foreground italic">Percentage automatically applied for payments through this card.</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSupplierCardDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleAddSupplierCard} disabled={saving || !supplierCardData.supplier_id || !supplierCardData.card_name} className="w-full sm:w-auto">
              {saving ? <Loader size="sm" className="mr-2" /> : editingSupplierCardId ? <Save className="mr-2 h-4 w-4" /> : <PlusCircle className="mr-2 h-4 w-4" />}
              {editingSupplierCardId ? "Update Card" : "Add Card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Bank Account Dialog */}
      <Dialog open={bankAccountDialogOpen} onOpenChange={setBankAccountDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" />
              {editingBankAccountId ? "Edit Bank Account" : "Add Bank Account"}
            </DialogTitle>
            <DialogDescription>
              {editingBankAccountId ? "Update existing bank account details." : "Create a new bank account to track deposits and withdrawals."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="acc_name">Account Name</Label>
              <Input
                id="acc_name"
                value={bankAccountData.account_name}
                onChange={(e) => setBankAccountData(prev => ({ ...prev, account_name: e.target.value }))}
                placeholder="e.g., Business Current Account"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank_name">Bank Name</Label>
              <Input
                id="bank_name"
                value={bankAccountData.bank_name}
                onChange={(e) => setBankAccountData(prev => ({ ...prev, bank_name: e.target.value }))}
                placeholder="e.g., Meezan Bank"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc_num">Account Number</Label>
              <Input
                id="acc_num"
                value={bankAccountData.account_number}
                onChange={(e) => setBankAccountData(prev => ({ ...prev, account_number: e.target.value }))}
                placeholder="e.g., 0123456789"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc_opening">Opening Balance</Label>
              <Input
                id="acc_opening"
                type="number"
                min="0"
                step="0.01"
                value={bankAccountData.opening_balance}
                onChange={(e) => setBankAccountData(prev => ({ ...prev, opening_balance: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setBankAccountDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button
              onClick={handleAddBankAccount}
              disabled={saving || !bankAccountData.account_name}
              className="w-full sm:w-auto"
            >
              {saving ? <Loader size="sm" className="mr-2" /> : editingBankAccountId ? <Save className="mr-2 h-4 w-4" /> : <PlusCircle className="mr-2 h-4 w-4" />}
              {editingBankAccountId ? "Update Account" : "Add Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Supplier Tax Edit Dialog */}
      <Dialog open={supplierTaxDialogOpen} onOpenChange={setSupplierTaxDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supplier Tax Settings</DialogTitle>
            <DialogDescription>
              Set the default withholding tax percentage for {selectedSupplier?.supplier_name}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="supplier_tax_pct" className="flex items-center gap-1">
                <Percent className="h-3.5 w-3.5" />
                Default Tax Percentage
              </Label>
              <Input
                id="supplier_tax_pct"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={newTaxPercentage}
                onChange={(e) => setNewTaxPercentage(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-[10px] text-muted-foreground italic">This percentage will be used as a reference for transfers to this supplier.</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSupplierTaxDialogOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleUpdateSupplierTax} disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader size="xs" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
