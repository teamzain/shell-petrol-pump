"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { getTodayPKT } from "@/lib/utils"
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
  Truck
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

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
  current_balance: number
  account_type: string
}

interface Supplier {
  id: string
  supplier_name: string
  account_balance: number
}

export default function BalanceManagementPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [todayBalance, setTodayBalance] = useState<DailyBalance | null>(null)
  const [balanceHistory, setBalanceHistory] = useState<DailyBalance[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [openingDialogOpen, setOpeningDialogOpen] = useState(false)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)

  // Transaction State
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false)
  const [transactionType, setTransactionType] = useState<"deposit" | "add_cash" | "add_bank" | "withdraw" | "transfer_to_supplier">("deposit")
  const [transactionData, setTransactionData] = useState({
    amount: "",
    description: "",
    bankId: "",
    supplierId: ""
  })

  const [openingBalances, setOpeningBalances] = useState({
    cash: "0",
    bank: "0"
  })

  useEffect(() => {
    // Backend logic removed for system recreation
  }, [])

  const handleSetOpeningBalance = async () => {
    setSuccess("Opening balance set (UI Only mode)")
    setOpeningDialogOpen(false)
    setTimeout(() => setSuccess(""), 3000)
  }

  const handleCloseDay = async () => {
    setSuccess("Day closed (UI Only mode)")
    setCloseDialogOpen(false)
    setTimeout(() => setSuccess(""), 3000)
  }

  const handleTransaction = async () => {
    setSuccess("Transaction recorded (UI Only mode)")
    setTransactionDialogOpen(false)
    setTransactionData({
      amount: "",
      description: "",
      bankId: "",
      supplierId: ""
    })
    setTimeout(() => setSuccess(""), 3000)
  }

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return "-"
    return `Rs. ${Number(amount).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const currentCashBalance = todayBalance?.cash_closing ?? todayBalance?.cash_opening ?? 0
  const currentBankBalance = todayBalance?.bank_closing ?? todayBalance?.bank_opening ?? 0
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

      {/* Action Buttons Row */}
      <div className="flex flex-col sm:flex-row justify-end gap-2">
        <Button onClick={() => {
          setTransactionType("deposit")
          setTransactionDialogOpen(true)
        }} className="w-full sm:w-auto">
          <ArrowRightLeft className="mr-2 h-4 w-4" />
          Transfer to Bank
        </Button>
        <Button variant="outline" onClick={() => {
          setTransactionType("add_cash")
          setTransactionDialogOpen(true)
        }} className="w-full sm:w-auto">
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Balance
        </Button>
        <Button variant="secondary" onClick={() => {
          setTransactionType("transfer_to_supplier")
          setTransactionDialogOpen(true)
        }} className="w-full sm:w-auto">
          <ArrowRightLeft className="mr-2 h-4 w-4" />
          Transfer to Supplier
        </Button>
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
                <span className="text-foreground">{formatCurrency(todayBalance?.cash_opening ?? 0)}</span>
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
              <div key={bank.id} className="p-4 border rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors">
                <p className="text-xs font-bold text-muted-foreground uppercase">{bank.account_name}</p>
                <p className="text-xl font-black mt-1">{formatCurrency(bank.current_balance)}</p>
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
            {suppliers.filter(s => (s.account_balance || 0) > 0).map(supplier => (
              <div key={supplier.id} className="p-4 border rounded-xl bg-amber-500/[0.03] hover:bg-amber-500/[0.08] transition-colors border-amber-200/50">
                <p className="text-xs font-bold text-muted-foreground uppercase">{supplier.supplier_name}</p>
                <p className="text-xl font-black mt-1 text-amber-700">{formatCurrency(supplier.account_balance || 0)}</p>
                <p className="text-[10px] text-muted-foreground mt-1 italic">Prepaid Company Account</p>
              </div>
            ))}
            {suppliers.filter(s => (s.account_balance || 0) > 0).length === 0 && (
              <div className="col-span-full py-10 text-center border-dashed border-2 rounded-xl">
                <p className="text-sm text-muted-foreground italic">No active supplier balances found.</p>
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

      {/* Daily Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Today - {new Date().toLocaleDateString("en-PK", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </CardTitle>
          <CardDescription>
            {todayBalance?.is_closed
              ? "Today's books are closed. Balances will roll over to tomorrow automatically."
              : "Manage today's opening balance and close the day when done."
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2 sm:gap-4">
          <Button
            onClick={() => {
              setOpeningBalances({
                cash: (todayBalance?.cash_opening || 0).toString(),
                bank: (todayBalance?.bank_opening || 0).toString()
              })
              setOpeningDialogOpen(true)
            }}
            disabled={todayBalance?.is_closed}
            variant={todayBalance?.is_closed ? "secondary" : "default"}
            className="w-full sm:w-auto"
          >
            <Save className="mr-2 h-4 w-4" />
            Set Opening
          </Button>
          <Button
            onClick={() => setCloseDialogOpen(true)}
            disabled={!todayBalance || todayBalance?.is_closed}
            variant="outline"
            className="w-full sm:w-auto"
          >
            <Lock className="mr-2 h-4 w-4" />
            Close Day
          </Button>
          <Button
            onClick={() => { }}
            variant="ghost"
            className="w-full sm:w-auto"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
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
                    const isToday = balance.balance_date === getTodayPKT()
                    const cashChange = (balance.cash_closing ?? balance.cash_opening) - balance.cash_opening
                    const displayBankClosing = isToday ? totalBankAssets : balance.bank_closing
                    const bankChange = (displayBankClosing ?? balance.bank_opening) - balance.bank_opening

                    return (
                      <TableRow key={balance.id} className={isToday ? "bg-muted/50 font-semibold" : ""}>
                        <TableCell className="font-medium">
                          {new Date(balance.balance_date).toLocaleDateString("en-PK", {
                            weekday: "short",
                            month: "short",
                            day: "numeric"
                          })}
                          {isToday && <Badge variant="outline" className="ml-2">Today</Badge>}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(balance.cash_opening)}</TableCell>
                        <TableCell className="text-right">
                          {balance.cash_closing !== null ? (
                            <span className="flex items-center justify-end gap-1">
                              {formatCurrency(balance.cash_closing)}
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
                        <TableCell className="text-right">{formatCurrency(balance.bank_opening)}</TableCell>
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
            <div className="space-y-2">
              <Label htmlFor="cash_opening" className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
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
            <div className="space-y-2">
              <Label htmlFor="bank_opening" className="flex items-center gap-2">
                <Banknote className="h-4 w-4" />
                Bank Opening Balance
              </Label>
              <Input
                id="bank_opening"
                type="number"
                step="0.01"
                min="0"
                value={openingBalances.bank}
                onChange={(e) => setOpeningBalances({ ...openingBalances, bank: e.target.value })}
                placeholder="Enter bank balance"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpeningDialogOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleSetOpeningBalance} disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader size="xs" /> : "Save Opening Balance"}
            </Button>
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
              {transactionType === "deposit" ? "Transfer Cash to Bank" :
                transactionType === "withdraw" ? "Withdraw Bank to Cash" :
                  transactionType === "add_cash" ? "Add Cash Balance" : "Add Bank Balance"}
            </DialogTitle>
            <DialogDescription>
              {transactionType === "deposit"
                ? "Record a deposit of cash earnings into a bank account."
                : transactionType === "withdraw" ? "Record a withdrawal from a bank account into cash."
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
                  <SelectItem value="deposit">🏦 Cash to Bank Deposit</SelectItem>
                  <SelectItem value="withdraw">🏧 Bank to Cash Withdrawal</SelectItem>
                  <SelectItem value="add_cash">💵 Add Manual Cash</SelectItem>
                  <SelectItem value="add_bank">🏦 Add Manual Bank Bal</SelectItem>
                  <SelectItem value="transfer_to_supplier">🤝 Transfer to Supplier</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(transactionType === "deposit" || transactionType === "withdraw" || transactionType === "add_bank" || transactionType === "transfer_to_supplier") && (
              <div className="space-y-2 animate-in slide-in-from-top-2">
                <Label>Select Bank Account {transactionType === "transfer_to_supplier" && "(Optional)"}</Label>
                <Select
                  value={transactionData.bankId}
                  onValueChange={(v: string) => setTransactionData(prev => ({ ...prev, bankId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={transactionType === "transfer_to_supplier" ? "Default to Cash" : "Choose Bank..."} />
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
            )}

            {transactionType === "transfer_to_supplier" && (
              <div className="space-y-2 animate-in slide-in-from-top-2">
                <Label>Select Supplier</Label>
                <Select
                  value={transactionData.supplierId}
                  onValueChange={(v: string) => setTransactionData(prev => ({ ...prev, supplierId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chose Supplier..." />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(supp => (
                      <SelectItem key={supp.id} value={supp.id}>
                        {supp.supplier_name} ({formatCurrency(supp.account_balance)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
    </div >
  )
}
