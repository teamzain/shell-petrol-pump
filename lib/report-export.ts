import { format } from "date-fns"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { getTodayPKT } from "./utils"

export type ExportType = "csv" | "pdf"

interface ExportOptions {
    activeTab: string
    reportData: any
    filters: any
    stationName?: string
    scope?: string // e.g. "full", "purchases", "ledger", "holds"
}

export function exportReport({ activeTab, reportData, filters, stationName = "United Filling Station", scope = "full" }: ExportOptions, type: ExportType) {
    if (!reportData) return

    try {
        const dateRangeStr = filters.dateRange?.from && filters.dateRange?.to
            ? `${format(new Date(filters.dateRange.from), "MMM dd, yyyy")} - ${format(new Date(filters.dateRange.to), "MMM dd, yyyy")}`
            : format(new Date(), "MMM dd, yyyy")

        if (type === "csv") {
            exportToCSV(activeTab, reportData, dateRangeStr, filters)
        } else {
            exportToPDF(activeTab, reportData, dateRangeStr, stationName, filters, scope)
        }
    } catch (error) {
        console.error(`Error exporting ${type} report:`, error)
        alert(`Failed to export ${type} report. Please check the console for details.`)
    }
}

function exportToCSV(activeTab: string, reportData: any, dateRangeStr: string, filters: any) {
    let csvContent = "data:text/csv;charset=utf-8,"
    const fileName = `report-${activeTab}-${getTodayPKT()}.csv`

    // Multi-tab metadata mapping
    let categoryLabel = "All Categories"
    if (filters.productType === "fuel") categoryLabel = "Fuel Only"
    if (filters.productType === "oil_lubricant") categoryLabel = "Lubricants Only"

    let itemLabel = "All Items"
    if (filters.productId !== "all") {
        const found = reportData.productBreakdown?.find((p: any) => p.product_id === filters.productId)
        itemLabel = found ? found.name : "Specific Item"
    }

    if (activeTab === "profit-loss") {
        const data = reportData
        const netMargin = data.total.revenue > 0
            ? ((data.total.netProfit / data.total.revenue) * 100).toFixed(1)
            : "0.0"

        // Header
        csvContent += "PROFIT & LOSS REPORT\n"
        csvContent += `Period,${dateRangeStr}\n`
        csvContent += `Category,${categoryLabel}\n`
        csvContent += `Item,${itemLabel}\n`
        csvContent += `Generated,${format(new Date(), "PPpp")}\n`
        csvContent += "\n"

        // Section 1: Financial Statement
        csvContent += "FINANCIAL STATEMENT\n"
        csvContent += "Metric,Amount (Rs.)\n"
        csvContent += `Gross Sales,${data.total.grossSales.toLocaleString()}\n`
        csvContent += `Less: Discounts Given,${data.total.discount.toLocaleString()}\n`
        csvContent += `Net Revenue,${data.total.revenue.toLocaleString()}\n`
        csvContent += `Cost of Sales (COGS),${data.total.cogs.toLocaleString()}\n`
        csvContent += `Gross Profit,${data.total.grossProfit.toLocaleString()}\n`
        csvContent += `Operating Expenses,${data.total.expense.toLocaleString()}\n`
        csvContent += `Net Profit / Loss,${data.total.netProfit.toLocaleString()}\n`
        csvContent += `Net Margin,${netMargin}%\n`
        csvContent += "\n"

        // Section 2: Category Breakdown
        csvContent += "CATEGORY BREAKDOWN\n"
        csvContent += "Category,Quantity,Revenue (Rs.),COGS (Rs.),Gross Profit (Rs.),GP Margin\n"
        if (data.fuel.qty > 0) {
            const fuelMargin = data.fuel.revenue > 0
                ? ((data.fuel.profit / data.fuel.revenue) * 100).toFixed(1) + "%"
                : "0.0%"
            csvContent += `Fuels,${data.fuel.qty.toLocaleString()} Liters,${data.fuel.revenue.toLocaleString()},${data.fuel.cost.toLocaleString()},${data.fuel.profit.toLocaleString()},${fuelMargin}\n`
        }
        if (data.lube.qty > 0) {
            const lubeMargin = data.lube.revenue > 0
                ? ((data.lube.profit / data.lube.revenue) * 100).toFixed(1) + "%"
                : "0.0%"
            csvContent += `Lubricants,${data.lube.qty.toLocaleString()} Units,${data.lube.revenue.toLocaleString()},${data.lube.cost.toLocaleString()},${data.lube.profit.toLocaleString()},${lubeMargin}\n`
        }
        csvContent += "\n"

        // Section 3: Per-Product Breakdown
        if (data.productBreakdown && data.productBreakdown.length > 0) {
            csvContent += "PER-PRODUCT BREAKDOWN\n"
            csvContent += "Product,Type,Quantity,Revenue (Rs.),COGS (Rs.),Gross Profit (Rs.),Margin\n"
            data.productBreakdown.forEach((p: any) => {
                const margin = p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) + "%" : "0.0%"
                const type = p.type === "fuel" ? "Fuel" : "Lubricant"
                const qty = p.type === "fuel" ? `${p.qty.toLocaleString()} L` : `${p.qty.toLocaleString()} Units`
                csvContent += `"${p.name}",${type},${qty},${p.revenue.toLocaleString()},${p.cost.toLocaleString()},${p.profit.toLocaleString()},${margin}\n`
            })
        }

    } else if (activeTab === "purchase-history" && (Array.isArray(reportData) || (reportData && reportData.orders))) {
        const orders = Array.isArray(reportData) ? reportData : reportData.orders
        csvContent += "PURCHASE HISTORY REPORT\n"
        csvContent += `Period,${dateRangeStr}\n`
        csvContent += `Generated,${format(new Date(), "PPpp")}\n\n`
        
        if (!Array.isArray(reportData)) {
            csvContent += "SUMMARY\n"
            csvContent += `Total Purchase Orders,${reportData.totalOrders || 0}\n`
            csvContent += `Total Order Value,Rs. ${reportData.totalOrderValue || 0}\n`
            csvContent += `Total Arrivals,Rs. ${reportData.totalArrivalValue || 0}\n`
            csvContent += `Total On Hold,Rs. ${reportData.totalOnHold || 0}\n`
            csvContent += `Total Released,Rs. ${reportData.totalReleased || 0}\n`
            csvContent += `Net Paid,Rs. ${reportData.totalPaid || 0}\n\n`
        }

        const headers = ["Date", "Invoice", "Supplier", "Order Value", "Arrival Value", "Hold/Release", "Net Paid", "Status", "Payment Method"]
        csvContent += headers.join(",") + "\n"
        orders.forEach((o: any) => {
            const adj = (o.release_amount || 0) - (o.hold_amount || 0)
            const row = [ 
                format(new Date(o.display_date || o.created_at), "yyyy-MM-dd"), 
                o.invoice_number, 
                o.supplier_name || o.suppliers?.name || "N/A", 
                o.order_value || o.total_amount,
                o.total_amount,
                adj,
                o.net_paid || o.total_amount,
                o.status,
                o.payment_method || "N/A"
            ]
            csvContent += row.join(",") + "\n"
        })
    } else if (activeTab === "expense-breakdown" && reportData.expenses) {
        csvContent += "EXPENSE BREAKDOWN REPORT\n\n"
        const headers = ["Date", "Category", "Amount", "Method", "Notes"]
        csvContent += headers.join(",") + "\n"
        reportData.expenses.forEach((e: any) => {
            const row = [ e.expense_date, e.expense_categories?.category_name || "N/A", e.amount, e.payment_method, e.description || "" ]
            csvContent += row.join(",") + "\n"
        })
    } else if (activeTab === "supplier-tracking" && reportData.suppliers) {
        csvContent += "SUPPLIER PERFORMANCE REPORT\n"
        csvContent += `Period,${dateRangeStr}\n`
        csvContent += `Category,${categoryLabel}\n`
        csvContent += `Generated,${format(new Date(), "PPpp")}\n`
        csvContent += "\n"

        // Section 1: KPI Summary
        csvContent += "SUPPLIER SUMMARY\n"
        csvContent += "Metric,Value\n"
        csvContent += `Total Suppliers,${reportData.totalSuppliers}\n`
        csvContent += `Total Orders,${reportData.totalOrders}\n`
        csvContent += `Total Amount On Hold,Rs. ${reportData.totalOnHold?.toLocaleString() || 0}\n`
        csvContent += `Total Released,Rs. ${reportData.totalReleased?.toLocaleString() || 0}\n`
        csvContent += `Total Outstanding Dues,Rs. ${reportData.totalOutstanding?.toLocaleString() || 0}\n`
        csvContent += "\n"

        // Section 2: Details
        csvContent += "SUPPLIER DETAILS\n"
        const headers = ["Supplier", "Type", "Period Purchases", "Lifetime Total", "Outstanding Dues"]
        csvContent += headers.join(",") + "\n"
        reportData.suppliers.forEach((s: any) => {
            const row = [ s.name, (s.supplier_type || "").replace(/_/g, " "), s.periodPurchases, s.total_purchases, s.outstandingDues ]
            csvContent += row.join(",") + "\n"
        })

        if (reportData.purchases && reportData.purchases.length > 0) {
            csvContent += "\nPURCHASE ORDERS\n"
            const poHeaders = ["Date", "PO Number", "Supplier", "Product", "Est Total", "Status"]
            csvContent += poHeaders.join(",") + "\n"
            let totalPO = 0
            reportData.purchases.forEach((p: any) => {
                totalPO += Number(p.estimated_total || 0)
                const row = [
                    format(new Date(p.created_at || p.purchase_date), "dd MMM yyyy"),
                    p.po_number,
                    `"${p.suppliers?.name || '-'}"`,
                    `"${p.products?.name || '-'}"`,
                    p.estimated_total || 0,
                    p.status
                ]
                csvContent += row.join(",") + "\n"
            })
            csvContent += `PERIOD PURCHASE TOTAL,,,,${totalPO},\n`
        }

        if (reportData.transactions && reportData.transactions.length > 0) {
            csvContent += "\nTRANSACTIONS\n"
            const txHeaders = ["Date", "Supplier", "Amount", "Type"]
            csvContent += txHeaders.join(",") + "\n"
            let inTotal = 0, outTotal = 0
            reportData.transactions.forEach((t: any) => {
                const amt = Number(t.amount || 0)
                if (t.transaction_type === "credit") inTotal += amt
                else outTotal += amt

                const supplierName = t.company_accounts?.suppliers?.name || t.bank_accounts?.account_name || '-'
                const row = [
                    format(new Date(t.transaction_date), "dd MMM yyyy"),
                    `"${supplierName}"`,
                    t.amount || 0,
                    t.transaction_type
                ]
                csvContent += row.join(",") + "\n"
            })
            csvContent += `TOTAL PAYMENTS IN: ${inTotal},TOTAL DEDUCTIONS: ${outTotal},NET MOVEMENT: ${inTotal - outTotal},\n`
        }

        if (reportData.holds && reportData.holds.length > 0) {
            csvContent += "\nCARD HOLDS\n"
            const holdHeaders = ["Date", "Supplier", "Card Name", "Amount", "Status"]
            csvContent += holdHeaders.join(",") + "\n"
            let pendingTotal = 0, receivedTotal = 0
            reportData.holds.forEach((h: any) => {
                const amt = Number(h.hold_amount || 0)
                if (h.status === "pending") pendingTotal += amt
                else if (h.status === "received") receivedTotal += amt

                const supplierName = h.supplier_cards?.suppliers?.name || '-'
                const cardName = h.supplier_cards?.card_name || '-'
                const row = [
                    format(new Date(h.created_at), "dd MMM yyyy"),
                    `"${supplierName}"`,
                    `"${cardName}"`,
                    h.hold_amount || 0,
                    h.status
                ]
                csvContent += row.join(",") + "\n"
            })
            csvContent += `TOTAL PENDING: ${pendingTotal},,TOTAL RECEIVED: ${receivedTotal},,\n`
        }
    } else if (activeTab === "sales-report" && Array.isArray(reportData)) {
        csvContent += "SALES REPORT\n"
        csvContent += `Period,${dateRangeStr}\n`
        csvContent += `Category,${categoryLabel}\n`
        csvContent += `Generated,${format(new Date(), "PPpp")}\n\n`
        const headers = ["Date", "Description", "Category", "Quantity", "Rate", "Discount", "Total", "Profit", "Payment"]
        csvContent += headers.join(",") + "\n"
        reportData.forEach((s: any) => {
            const row = [ 
                s.date, 
                `"${s.description}"`, 
                s.type, // 'Fuel' or 'Lubricant'
                s.quantity, 
                s.rate, 
                s.discount || 0,
                s.total, 
                s.profit, 
                s.payment 
            ]
            csvContent += row.join(",") + "\n"
        })
    } else if (activeTab === "bank-card-report" && Array.isArray(reportData)) {
        csvContent += "BANK CARD REPORT\n"
        csvContent += `Period,${dateRangeStr}\n`
        csvContent += `Generated,${format(new Date(), "PPpp")}\n\n`
        const headers = ["Date", "Card Name", "Bank", "Hold Amount", "Tax", "Net Amount", "Status"]
        csvContent += headers.join(",") + "\n"
        reportData.forEach((r: any) => {
            const row = [ 
                r.sale_date, 
                `"${r.bank_cards?.card_name || 'Bank Card'}"`, 
                `"${r.bank_cards?.bank_accounts?.bank_name || 'N/A'}"`, 
                r.hold_amount, 
                r.tax_amount, 
                r.net_amount, 
                r.status 
            ]
            csvContent += row.join(",") + "\n"
        })
    } else if (activeTab === "daily-recap" && reportData.financials) {
        const d = reportData
        csvContent += "DAILY RECAP REPORT\n"
        csvContent += `Date,${d._date || dateRangeStr}\n`
        csvContent += `Generated,${format(new Date(), "PPpp")}\n\n`

        const totalOpening = (d.financials.cash.opening || 0) + (d.financials.bank.opening || 0)
        const totalClosing = (d.financials.cash.closing || 0) + (d.financials.bank.closing || 0)
        csvContent += "TOTAL BUSINESS BALANCE (CASH + BANK)\n"
        csvContent += "Metric,Amount (Rs.)\n"
        csvContent += `Total Opening Balance,${totalOpening}\n`
        csvContent += `Total Closing Balance,${totalClosing}\n`
        csvContent += `Net Change,${totalClosing - totalOpening}\n`
        if (d.financials.totalDiscounts > 0) csvContent += `Discounts Given,${d.financials.totalDiscounts}\n`
        csvContent += "\n"


        csvContent += "CASH ACCOUNT\n"
        csvContent += "Metric,Amount (Rs.)\n"
        csvContent += `Opening Balance,${d.financials.cash.opening}\n`
        csvContent += `Cash Sales (In),${d.financials.cash.sale}\n`
        csvContent += `Cash Expenses (Out),${d.financials.cash.expense}\n`
        csvContent += `Closing Balance,${d.financials.cash.closing}\n\n`

        csvContent += "BANK ACCOUNT\n"
        csvContent += "Metric,Amount (Rs.)\n"
        csvContent += `Opening Balance,${d.financials.bank.opening}\n`
        csvContent += `Card Sales (In),${d.financials.bank.sale}\n`
        csvContent += `Bank Payments (Out),${d.financials.bank.expense}\n`
        csvContent += `Card Holds (Today),${d.financials.bank.hold}\n`
        csvContent += `Card Releases (Today),${d.financials.bank.released}\n`
        csvContent += `Closing Balance,${d.financials.bank.closing}\n\n`

        csvContent += "SUPPLIER LIABILITIES\n"
        csvContent += "Metric,Amount (Rs.)\n"
        csvContent += `Initial Balance,${d.suppliers.opening}\n`
        csvContent += `Purchases Added,${d.suppliers.additions}\n`
        csvContent += `Payments Made,${d.suppliers.payments}\n`
        csvContent += `Closing Debt,${d.suppliers.closing}\n`
        csvContent += `Supplier Card On Hold,${d.suppliers.cardOnHold}\n`
        csvContent += `Supplier Card Released,${d.suppliers.cardReleased}\n`
        csvContent += `Shortage Holds (Today),${d.suppliers.purchaseHoldOnHold}\n`
        csvContent += `Shortage Releases (Today),${d.suppliers.purchaseHoldReleased}\n\n`

        if (d.inventory && d.inventory.length > 0) {
            csvContent += "STOCK MOVEMENTS\n"
            csvContent += "Item,Opening Stock,Received (In),Sold (Out),Without Dip,Dip Qty,Gain/Loss,Actual Stock,Unit\n"
            d.inventory.forEach((item: any) => {
                const dipStr = item.dipQty !== null ? item.dipQty : "-"
                const gainStr = item.gainLoss !== null ? (item.gainLoss > 0 ? `+${item.gainLoss}` : item.gainLoss) : "-"
                csvContent += `"${item.name}",${item.opening},${item.in},${item.out},${item.withoutDip},${dipStr},"${gainStr}",${item.closing},${item.unit}\n`
            })
        }
    } else if (activeTab === "stock" && Array.isArray(reportData)) {
        csvContent += "STOCK MOVEMENT & DIP REPORT\n"
        csvContent += `Period,${dateRangeStr}\n`
        csvContent += `Category,${categoryLabel}\n`
        csvContent += `Generated,${format(new Date(), "PPpp")}\n\n`
        const headers = ["Date", "Product", "Type", "Prev. Stock", "Sale Qty", "Purchase", "Dip Qty", "Gain / Loss", "Net Stock", "Reference / Note"]
        csvContent += headers.join(",") + "\n"
        reportData.forEach((s: any) => {
            const isNegative = s.quantity && s.quantity < 0
            const isPositive = s.quantity && s.quantity > 0
            const isDip = s.row_type === "dip_reading"
            const rawQty = s.quantity ? Math.abs(s.quantity) : 0
            
            const row = [ 
                s.movement_date, 
                `"${s.product_name}"`, 
                s.movement_type,
                s.previous_stock || 0,
                isNegative ? `-${rawQty}` : "0",
                isPositive ? `+${rawQty}` : "0",
                isDip ? s.dip_quantity || 0 : "0",
                isDip ? (Number(s.gain_amount || 0) > 0 ? `+${s.gain_amount}` : Number(s.loss_amount || 0) > 0 ? `-${s.loss_amount}` : "0") : "0",
                s.balance_after || 0,
                `"${s.notes || ''}"`
            ]
            csvContent += row.join(",") + "\n"
        })
    } else if (activeTab === "gain-loss" && reportData.records) {
        csvContent += "STOCK GAIN / LOSS DISCREPANCY REPORT\n"
        csvContent += `Period,${dateRangeStr}\n`
        csvContent += `Generated,${format(new Date(), "PPpp")}\n\n`
        csvContent += `TOTAL GAIN,${reportData.totalGain.toFixed(1)}\n`
        csvContent += `TOTAL LOSS,${reportData.totalLoss.toFixed(1)}\n`
        csvContent += `NET VARIANCE,${reportData.netVariance.toFixed(1)}\n\n`
        
        const headers = ["Date", "Tank", "Product", "System Stock", "Dip Stock", "Variance (L)", "New Stock", "Var %", "Notes"]
        csvContent += headers.join(",") + "\n"
        reportData.records.forEach((r: any) => {
            const row = [ 
                r.reading_date, 
                `"${r.tank_name}"`, 
                `"${r.product_name}"`, 
                r.system_stock, 
                r.dip_stock, 
                r.variance.toFixed(2), 
                r.dip_stock, // Use dip stock as final new stock
                r.variance_percentage.toFixed(2), 
                `"${r.notes || ''}"`
            ]
            csvContent += row.join(",") + "\n"
        })
    } else {
        csvContent += "Data Error: Export not fully configured for this tab yet."
    }

    const encodedUri = encodeURI(csvContent)
    const link = document.body.appendChild(document.createElement("a"))
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", fileName)
    link.click()
    document.body.removeChild(link)
}

function exportToPDF(activeTab: string, reportData: any, dateRangeStr: string, stationName: string, filters: any, scope: string = "full") {
    const doc = new jsPDF()
    const title = activeTab.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")

    // 1. HEADER
    doc.setFontSize(20)
    doc.setTextColor(40)
    doc.text(stationName, 14, 22)

    doc.setFontSize(14)
    doc.setTextColor(100)
    doc.text(`${title} Report`, 14, 32)

    // 2. FILTERS & METADATA TABLE
    const metadataBody: any[] = [
        ["Report Period", dateRangeStr]
    ]

    if (activeTab === "expense-breakdown") {
        // Special Header for Expenses - Remove Product references
        metadataBody.push(["Expense Category", reportData.selectedCategoryName || "All Categories"])
        if (reportData.searchQuery) {
            metadataBody.push(["Search Term", reportData.searchQuery])
        }
    } else {
        // Standard Header for Sales/Purchases/etc.
        let categoryLabel = "All Categories"
        if (filters.productType === "fuel") categoryLabel = "Fuel Only"
        if (filters.productType === "oil_lubricant") categoryLabel = "Lubricants Only"
        metadataBody.push(["Category", categoryLabel])

        let productLabel = "All Products"
        if (filters.productId !== "all" && reportData.productBreakdown?.length > 0) {
            const found = reportData.productBreakdown.find((p: any) => p.product_id === filters.productId)
            productLabel = found ? found.name : "Specific Product"
        } else if (filters.productId !== "all") {
            productLabel = "Specific Product"
        }
        metadataBody.push(["Selected Product", productLabel])

        if (filters.supplierId && filters.supplierId !== "all") {
            metadataBody.push(["Supplier", "Filtered Specific"])
        }
    }

    metadataBody.push(["Generated On", format(new Date(), "PPpp")])

    autoTable(doc, {
        startY: 38,
        body: metadataBody,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 2, textColor: 50 },
        columnStyles: {
            0: { fontStyle: "bold", cellWidth: 40, fillColor: [245, 245, 245] },
            1: { cellWidth: 100 }
        },
        margin: { left: 14 }
    })

    let nextY = (doc as any).lastAutoTable.finalY + 10

    // Helper: Add Horizontal Summary / KPI Table
    const addKPIGrid = (sectionTitle: string, headers: string[], values: string[], color: [number, number, number] = [44, 62, 80]) => {
        doc.setFontSize(11)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(50)
        doc.text(sectionTitle, 14, nextY)
        
        autoTable(doc, {
            startY: nextY + 3,
            head: [headers],
            body: [values],
            theme: "grid",
            headStyles: { fillColor: color, textColor: 255, halign: "center", fontSize: 9 },
            styles: { fontSize: 10, halign: "center", fontStyle: "bold", cellPadding: 4 },
            margin: { left: 14, right: 14 }
        })
        nextY = (doc as any).lastAutoTable.finalY + 10
    }

    // Tab-specific Exports
    if (activeTab === "daily-recap" && reportData.financials) {
        const d = reportData
        const fmt = (n: number) => `Rs. ${Number(n || 0).toLocaleString("en-PK", { minimumFractionDigits: 2 })}`

        // Total Balance KPI (hero card)
        const totalOpening = (d.financials.cash.opening || 0) + (d.financials.bank.opening || 0)
        const totalClosing = (d.financials.cash.closing || 0) + (d.financials.bank.closing || 0)
        const totalDiscounts = d.financials.totalDiscounts || 0
        const netChange = totalClosing - totalOpening
        
        addKPIGrid(
            "Total Business Balance (Cash + Bank Combined)",
            ["TOTAL OPENING", "TOTAL CLOSING BALANCE", "NET CHANGE", "DISCOUNTS GIVEN"],
            [fmt(totalOpening), fmt(totalClosing), `${netChange >= 0 ? '+' : ''}${fmt(netChange)}`, fmt(totalDiscounts)],
            [49, 46, 129]
        )

        // Cash & Bank KPIs
        addKPIGrid(
            "Cash Account Summary",
            ["OPENING BALANCE", "CASH SALES (IN)", "CASH EXPENSES (OUT)", "CLOSING BALANCE"],
            [fmt(d.financials.cash.opening), fmt(d.financials.cash.sale), fmt(d.financials.cash.expense), fmt(d.financials.cash.closing)],
            [39, 78, 19]
        )

        addKPIGrid(
            "Bank Account Summary",
            ["OPENING BALANCE", "CARD SALES (IN)", "BANK PAYMENTS (OUT)", "CARD HOLDS", "CARD RELEASES", "CLOSING BALANCE"],
            [fmt(d.financials.bank.opening), fmt(d.financials.bank.sale), fmt(d.financials.bank.expense), fmt(d.financials.bank.hold), fmt(d.financials.bank.released), fmt(d.financials.bank.closing)],
            [31, 97, 141]
        )

        // Supplier Liabilities
        doc.setFontSize(11)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(50)
        doc.text("Supplier Liabilities Summary", 14, nextY)
        autoTable(doc, {
            startY: nextY + 3,
            body: [
                ["Initial Balance", fmt(d.suppliers.opening)],
                ["Purchases Added", `+ ${fmt(d.suppliers.additions)}`],
                ["Payments Made", `- ${fmt(d.suppliers.payments)}`],
                ["Closing Debt", fmt(d.suppliers.closing)],
                ["Supplier Card — On Hold", fmt(d.suppliers.cardOnHold)],
                ["Supplier Card — Released", fmt(d.suppliers.cardReleased)],
                ["Shortage Holds (Today)", fmt(d.suppliers.purchaseHoldOnHold)],
                ["Shortage Releases (Today)", fmt(d.suppliers.purchaseHoldReleased)],
            ],
            theme: "grid",
            styles: { fontSize: 9, cellPadding: 2.5 },
            columnStyles: { 0: { fontStyle: "bold", cellWidth: 80, fillColor: [245, 245, 245] }, 1: { halign: "right" } },
            margin: { left: 14, right: 14 }
        })
        nextY = (doc as any).lastAutoTable.finalY + 10

        // Stock Movements
        if (d.inventory && d.inventory.length > 0) {
            doc.setFontSize(11)
            doc.setFont("helvetica", "bold")
            doc.text("Stock Movements Summary", 14, nextY)
            autoTable(doc, {
                startY: nextY + 3,
                head: [["Item", "Opening Stock", "Received (In)", "Sold (Out)", "Without Dip", "Dip Qty", "Gain/Loss", "Actual Stock"]],
                body: d.inventory.map((item: any) => [
                    item.name,
                    `${Number(item.opening).toFixed(1)} ${item.unit}`,
                    `+${Number(item.in).toFixed(1)}`,
                    `-${Math.abs(Number(item.out)).toFixed(1)}`,
                    `${Number(item.withoutDip).toFixed(1)} ${item.unit}`,
                    item.dipQty !== null ? `${Number(item.dipQty).toFixed(1)} ${item.unit}` : "-",
                    item.gainLoss !== null ? (item.gainLoss > 0 ? `+${Number(item.gainLoss).toFixed(1)}` : `${Number(item.gainLoss).toFixed(1)}`) : "-",
                    `${Number(item.closing).toFixed(1)} ${item.unit}`,
                ]),
                theme: "grid",
                headStyles: { fillColor: [52, 73, 94], textColor: 255 },
                alternateRowStyles: { fillColor: [248, 249, 250] },
                styles: { fontSize: 8, cellPadding: 2 },
                columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" }, 2: { halign: "right", textColor: [39, 174, 96] }, 3: { halign: "right", textColor: [192, 57, 43] }, 4: { halign: "right" }, 5: { halign: "right", textColor: [41, 128, 185] }, 6: { halign: "right", fontStyle: "bold" }, 7: { halign: "right" } },
                margin: { left: 14, right: 14 }
            })
        }

    } else if (activeTab === "profit-loss") {
        const data = reportData
        const netMargin = data.total.revenue > 0 ? ((data.total.netProfit / data.total.revenue) * 100).toFixed(1) : "0.0"

        // Section 1: Top KPIs Grid
        addKPIGrid(
            "Overall Key Performance Indicators (KPIs)",
            ["GROSS REVENUE", "DISCOUNTS GIVEN", "COST OF GOODS SOLD", "OPERATING EXPENSE", "NET PROFIT / LOSS"],
            [
                `Rs. ${data.total.grossSales.toLocaleString()}`,
                `Rs. ${data.total.discount.toLocaleString()}`,
                `Rs. ${data.total.cogs.toLocaleString()}`,
                `Rs. ${data.total.expense.toLocaleString()}`,
                `Rs. ${data.total.netProfit.toLocaleString()}`
            ],
            [52, 73, 94]
        )

        // Section 2: Financial Statement Detail (Vertical Table)
        doc.setFontSize(11)
        doc.setFont("helvetica", "bold")
        doc.text("Financial Statement Detail", 14, nextY)
        autoTable(doc, {
            startY: nextY + 3,
            body: [
                ["Gross Sales", `+ Rs. ${data.total.grossSales.toLocaleString()}`],
                ["Less: Discounts Given", `- Rs. ${data.total.discount.toLocaleString()}`],
                ["Net Revenue", `+ Rs. ${data.total.revenue.toLocaleString()}`],
                ["Cost of Goods Sold (COGS)", `- Rs. ${data.total.cogs.toLocaleString()}`],
                ["Gross Profit", `Rs. ${data.total.grossProfit.toLocaleString()}`],
                ["Operating Expenses", `- Rs. ${data.total.expense.toLocaleString()}`],
                ["NET PROFIT / LOSS", `Rs. ${data.total.netProfit.toLocaleString()} (${netMargin}% margin)`]
            ],
            theme: "grid",
            styles: { fontSize: 9, cellPadding: 2 },
            columnStyles: { 0: { fontStyle: "bold", cellWidth: 80 }, 1: { halign: "right" } },
            margin: { left: 14, right: 14 }
        })
        nextY = (doc as any).lastAutoTable.finalY + 10

        // Section 3: Category Breakdown
        const categoryRows = []
        if (data.fuel.qty > 0) {
            categoryRows.push(["Fuels", `${data.fuel.qty.toLocaleString()} L`, `Rs. ${data.fuel.revenue.toLocaleString()}`, `Rs. ${data.fuel.profit.toLocaleString()}`, `${(data.fuel.profit/(data.fuel.revenue||1)*100).toFixed(1)}%`])
        }
        if (data.lube.qty > 0) {
            categoryRows.push(["Lubricants", `${data.lube.qty.toLocaleString()} Units`, `Rs. ${data.lube.revenue.toLocaleString()}`, `Rs. ${data.lube.profit.toLocaleString()}`, `${(data.lube.profit/(data.lube.revenue||1)*100).toFixed(1)}%`])
        }

        doc.setFontSize(11)
        doc.setFont("helvetica", "bold")
        doc.text("Category Comparison", 14, nextY)
        autoTable(doc, {
            startY: nextY + 3,
            head: [["Category", "Qty Sold", "Revenue", "Gross Profit", "Margin"]],
            body: categoryRows,
            theme: "grid",
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            alternateRowStyles: { fillColor: [242, 247, 252] },
            styles: { fontSize: 9, cellPadding: 3 },
            columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
            margin: { left: 14, right: 14 }
        })
        nextY = (doc as any).lastAutoTable.finalY + 10

        // Section 4: Product Detail
        if (data.productBreakdown && data.productBreakdown.length > 0) {
            if (nextY > 230) { doc.addPage(); nextY = 20; }
            doc.setFontSize(11)
            doc.setFont("helvetica", "bold")
            doc.text("Product-wise Performance", 14, nextY)
            autoTable(doc, {
                startY: nextY + 3,
                head: [["Product", "Type", "Qty", "Revenue", "Profit", "Margin"]],
                body: data.productBreakdown.map((p: any) => [
                    p.name,
                    p.type === "fuel" ? "Fuel" : "Lube",
                    p.type === "fuel" ? `${p.qty.toLocaleString()} L` : `${p.qty.toLocaleString()} U`,
                    p.revenue.toLocaleString(),
                    p.profit.toLocaleString(),
                    `${(p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0).toFixed(1)}%`
                ]),
                theme: "grid",
                headStyles: { fillColor: [39, 174, 96], textColor: 255 },
                alternateRowStyles: { fillColor: [242, 252, 246] },
                styles: { fontSize: 8, cellPadding: 3 },
                columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
                margin: { left: 14, right: 14 }
            })
        }

    } else if (activeTab === "purchase-history" && reportData.orders) {
        // Display all 6 KPIs in two rows
        addKPIGrid("Purchase Summary - Highlights", 
            ["PURCHASE ORDERS", "TOTAL ORDER VALUE", "TOTAL ARRIVALS"], 
            [
                (reportData.totalOrders || 0).toString(), 
                `Rs. ${(reportData.totalOrderValue || 0).toLocaleString()}`, 
                `Rs. ${(reportData.totalArrivalValue || 0).toLocaleString()}`
            ],
            [41, 128, 185]
        )
        addKPIGrid("Financial Reconciliation", 
            ["TOTAL ON HOLD", "TOTAL RELEASED", "NET PAID"], 
            [
                `Rs. ${(reportData.totalOnHold || 0).toLocaleString()}`, 
                `Rs. ${(reportData.totalReleased || 0).toLocaleString()}`, 
                `Rs. ${(reportData.totalPaid || 0).toLocaleString()}`
            ],
            [52, 73, 94]
        )
        autoTable(doc, {
            startY: nextY,
            head: [["Date", "Invoice #", "Supplier", "Order Value", "Arrival Value", "Hold/Rel", "Net Paid", "Status", "Payment"]],
            body: (reportData.orders || []).map((o: any) => {
                let dateStr = "N/A"
                try {
                    dateStr = o.display_date ? format(new Date(o.display_date), "dd MMM yyyy") : "N/A"
                } catch (e) {
                    dateStr = String(o.display_date || "N/A")
                }

                const adj = (o.release_amount || 0) > 0 ? `+Rs. ${o.release_amount.toLocaleString()}` : 
                            (o.hold_amount || 0) > 0 ? `-Rs. ${o.hold_amount.toLocaleString()}` : "None"

                return [
                    dateStr,
                    o.invoice_number || o.po_number || "N/A", 
                    o.supplier_name || o.suppliers?.name || "N/A", 
                    `Rs. ${Number(o.order_value || 0).toLocaleString()}`,
                    `Rs. ${Number(o.total_amount || 0).toLocaleString()}`,
                    adj,
                    `Rs. ${Number(o.net_paid || 0).toLocaleString()}`,
                    (o.status || "").replace(/_/g, " ").toUpperCase(),
                    o.payment_method || "N/A"
                ]
            }),
            theme: "grid",
            headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 6.5 },
            alternateRowStyles: { fillColor: [242, 247, 252] },
            styles: { fontSize: 6.5, cellPadding: 1.5 },
            margin: { left: 14, right: 14 }
        })
    } else if (activeTab === "expense-breakdown" && reportData.expenses) {
        addKPIGrid("Expense Summary", ["TOTAL EXPENSES", "RECORD COUNT"], [`Rs. ${reportData.totalExpenses?.toLocaleString()}`, `${reportData.expenses.length}`])
        autoTable(doc, {
            startY: nextY,
            head: [["Date", "Category", "Amount", "Method", "Notes"]],
            body: reportData.expenses.map((e: any) => [e.expense_date, e.expense_categories?.category_name || "N/A", e.amount.toLocaleString(), e.payment_method, e.description || ""]),
            theme: "grid",
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            alternateRowStyles: { fillColor: [242, 247, 252] },
            styles: { fontSize: 9, cellPadding: 3 },
            margin: { left: 14, right: 14 }
        })
    } else if (activeTab === "balance-ledger" && reportData.transactions) {
        const sum = reportData.summary || {}
        addKPIGrid("Ledger Summary", ["CURRENT BALANCE", "INFLOW", "OUTFLOW", "NET MOVEMENT"], [`Rs. ${sum.currentBalance?.toLocaleString()}`, `Rs. ${sum.totalCredits?.toLocaleString()}`, `Rs. ${sum.totalDebits?.toLocaleString()}`, `Rs. ${sum.netMovement?.toLocaleString()}`])
        autoTable(doc, {
            startY: nextY,
            head: [["Date", "Entity", "Description", "Before", "Change", "After"]],
            body: reportData.transactions.map((t: any) => [t.display_date, t.display_entity, t.display_desc, t.balance_before.toLocaleString(), `${t.is_credit ? '+' : '-'} ${t.amount.toLocaleString()}`, t.balance_after.toLocaleString()]),
            theme: "grid",
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            alternateRowStyles: { fillColor: [242, 247, 252] },
            styles: { fontSize: 9, cellPadding: 3 },
            margin: { left: 14, right: 14 }
        })
    } else if (activeTab === "supplier-tracking" && reportData.suppliers) {
        const titleSuffix = scope === "full" ? "" : ` - ${scope.charAt(0).toUpperCase() + scope.slice(1)}`
        doc.setFontSize(14)
        doc.text(titleSuffix, 80, 32)
        
        // 1. DATA EXTRACTION
        const totalSuppliers = reportData.totalSuppliers || 0
        const totalBalance = reportData.totalOutstanding !== undefined ? reportData.totalOutstanding : (reportData.totalAccountBalance || 0)
        const onHold = reportData.totalOnHold || 0
        const grossReleased = reportData.totalReleased || 0
        const netReceived = reportData.totalReleasedNet || 0
        
        const periodOrders = reportData.totalOrders || reportData.purchases?.length || 0
        const periodPurchases = reportData.totalPurchased || 0
        const paymentsIn = reportData.totalPaid || 0
        const deductions = reportData.totalDeducted || 0
        const netMovement = reportData.netPeriodBalance || 0

        // 2. KPI / CARDS SECTION
        if (scope === "holds") {
            // ONLY 3 CARDS for Card Holds Report
            doc.setFontSize(11)
            doc.setFont("helvetica", "bold")
            doc.setTextColor(50)
            doc.text("Card Payment Holds & Releases Summary", 14, nextY)
            
            autoTable(doc, {
                startY: nextY + 3,
                head: [["AMOUNT ON HOLD", "GROSS TOTAL RELEASED", "TOTAL RELEASED AMOUNT (NET)"]],
                body: [
                    [
                        `Rs. ${onHold.toLocaleString()}`, 
                        `Rs. ${grossReleased.toLocaleString()}`, 
                        `Rs. ${netReceived.toLocaleString()}`
                    ],
                    ["Pending holds", "Before deductions", "Actual Received"]
                ],
                theme: "grid",
                headStyles: { fillColor: [217, 119, 6], textColor: 255, halign: "center", fontSize: 9 },
                bodyStyles: { halign: "center", fontStyle: "bold" },
                didParseCell: (data) => {
                    if (data.row.index === 1) {
                        data.cell.styles.fontSize = 7
                        data.cell.styles.fontStyle = "normal"
                        data.cell.styles.textColor = [100, 100, 100]
                        data.cell.styles.cellPadding = 1
                    }
                },
                margin: { left: 14, right: 14 }
            })
            nextY = (doc as any).lastAutoTable.finalY + 10
        } else {
            // ALL 10 CARDS in two rows
            // Row 1: Overview
            addKPIGrid("Business Overview", 
                ["TOTAL SUPPLIERS", "TOTAL BALANCE", "AMOUNT ON HOLD", "GROSS RELEASED", "NET RECEIVED"], 
                [
                    totalSuppliers.toString(), 
                    `Rs. ${totalBalance.toLocaleString()}`, 
                    `Rs. ${onHold.toLocaleString()}`, 
                    `Rs. ${grossReleased.toLocaleString()}`,
                    `Rs. ${netReceived.toLocaleString()}`
                ],
                [41, 128, 185] // Blue
            )
            // Row 2: Performance
            addKPIGrid("Period Movement Performance", 
                ["PERIOD ORDERS", "PERIOD PURCHASES", "PAYMENTS RECEIVED", "DEDUCTIONS MADE", "NET PERIOD MOVEMENT"], 
                [
                    periodOrders.toString(), 
                    `Rs. ${periodPurchases.toLocaleString()}`, 
                    `Rs. ${paymentsIn.toLocaleString()}`,
                    `Rs. ${deductions.toLocaleString()}`,
                    `${netMovement >= 0 ? '+' : ''}Rs. ${netMovement.toLocaleString()}`
                ],
                [52, 73, 94] // Dark grey/blue
            )
        }

        if (scope === "full") {
            autoTable(doc, {
                startY: nextY,
                head: [["Supplier", "Type", "Period Purchases", "Lifetime Total", "Outstanding Balance"]],
                body: reportData.suppliers.map((s: any) => [
                    s.name, 
                    (s.supplier_type || "general").replace(/_/g, " "), 
                    (s.periodPurchases || 0).toLocaleString(), 
                    (s.total_purchases || 0).toLocaleString(), 
                    (s.outstandingDues || 0).toLocaleString()
                ]),
                theme: "grid",
                headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                alternateRowStyles: { fillColor: [242, 247, 252] },
                styles: { fontSize: 8, cellPadding: 2.5 },
                margin: { left: 14, right: 14 }
            })
            nextY = (doc as any).lastAutoTable.finalY + 10
        }

        if ((scope === "full" || scope === "purchases") && reportData.purchases && reportData.purchases.length > 0) {
            doc.setFontSize(11)
            doc.setTextColor(40)
            doc.text("Purchase Orders Ledger Detail", 14, nextY)
            
            const totalPO = reportData.purchases.reduce((sum: number, p: any) => sum + Number(p.estimated_total || p.total_amount || 0), 0)
            
            autoTable(doc, {
                startY: nextY + 4,
                head: [["Date", "PO Number", "Supplier", "Product", "Ordered", "Delivered", "Rate", "Total", "Status"]],
                body: reportData.purchases.map((p: any) => {
                    const items = p.items || [];
                    const productNames = items.length > 0
                        ? items.map((i: any) => i.product_name).filter(Boolean)
                        : [p.products?.name || p.product_type].filter(Boolean);

                    const uniqueNames = Array.from(new Set(productNames));
                    const displayProductName = uniqueNames.length > 1
                        ? `${uniqueNames[0]} (+${uniqueNames.length - 1} more)`
                        : uniqueNames[0] || "—";

                    return [
                        format(new Date(p.purchase_date || p.created_at), "dd MMM yyyy"),
                        p.po_number,
                        p.suppliers?.name || '-',
                        displayProductName,
                        `${Number(p.ordered_quantity || 0).toLocaleString()} L`,
                        `${Number(p.delivered_quantity || 0).toLocaleString()} L`,
                        `Rs. ${Number(p.rate_per_liter || 0).toLocaleString()}`,
                        Number(p.estimated_total || p.total_amount || 0).toLocaleString(),
                        (p.status || "").replace(/_/g, " ").toUpperCase()
                    ]
                }),
                foot: [[
                    { content: "PURCHASE ORDERS PERIOD TOTAL", colSpan: 7, styles: { halign: "left", fontStyle: "bold", textColor: [41, 128, 185] } },
                    { content: "Rs. " + totalPO.toLocaleString(), styles: { halign: "right", fontStyle: "bold", textColor: [41, 128, 185] } },
                    ""
                ]],
                theme: "grid",
                headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                footStyles: { fillColor: [242, 247, 252], textColor: [41, 128, 185] },
                alternateRowStyles: { fillColor: [250, 252, 255] },
                styles: { fontSize: 7, cellPadding: 2 },
                columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
                margin: { left: 14, right: 14 }
            })
            nextY = (doc as any).lastAutoTable.finalY + 10
        }

        if ((scope === "full" || scope === "ledger") && reportData.transactions && reportData.transactions.length > 0) {
            doc.setFontSize(11)
            doc.setTextColor(40)
            doc.text("Supplier Payment & Transaction Ledger", 14, nextY)
            
            let inTotal = 0, outTotal = 0
            reportData.transactions.forEach((t: any) => {
                const amt = Number(t.amount || 0)
                if (t.transaction_type === "credit") inTotal += amt
                else outTotal += amt
            })
            
            autoTable(doc, {
                startY: nextY + 4,
                head: [["Date", "Supplier / Account", "Type", "Ref / Bank", "Note", "Amount", "Balance"]],
                body: reportData.transactions.map((t: any) => [
                    format(new Date(t.transaction_date), "dd MMM yyyy"),
                    t.company_accounts?.suppliers?.name || t.bank_accounts?.account_name || '-',
                    t.transaction_type.toUpperCase(),
                    `${t.reference_number || '-'} ${t.bank_accounts?.account_name ? `(${t.bank_accounts.account_name})` : ''}`,
                    (t.description || t.note || "").substring(0, 30),
                    `${t.transaction_type === 'credit' ? '+' : '-'} ${Number(t.amount || 0).toLocaleString()}`,
                    Number(t.balance_after || 0).toLocaleString()
                ]),
                foot: [[
                    { content: `Total Payments In: Rs. ${inTotal.toLocaleString()}`, colSpan: 3, styles: { halign: "left", fontStyle: "bold", textColor: [22, 163, 74] } },
                    { content: `Total Deductions: Rs. ${outTotal.toLocaleString()}`, colSpan: 2, styles: { fontStyle: "bold", textColor: [220, 38, 38] } },
                    { content: `Net Period Movement: Rs. ${(inTotal - outTotal).toLocaleString()}`, colSpan: 2, styles: { fontStyle: "bold", halign: "right" } }
                ]],
                theme: "grid",
                headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                footStyles: { fillColor: [242, 247, 252] },
                alternateRowStyles: { fillColor: [250, 252, 255] },
                styles: { fontSize: 6.5, cellPadding: 1.5 },
                columnStyles: { 5: { halign: "right" }, 6: { halign: "right" } },
                margin: { left: 14, right: 14 }
            })
            nextY = (doc as any).lastAutoTable.finalY + 10
        }

        if ((scope === "full" || scope === "holds") && reportData.holds && reportData.holds.length > 0) {
            doc.setFontSize(11)
            doc.setTextColor(40)
            doc.text("Card Hold & Settlement Details", 14, nextY)
            
            let pendingGross = 0, receivedGross = 0, receivedNet = 0
            reportData.holds.forEach((h: any) => {
                const amt = Number(h.hold_amount || 0)
                const net = Number(h.net_amount || h.hold_amount || 0)
                if (h.status !== "released") pendingGross += amt
                else {
                    receivedGross += amt
                    receivedNet += net
                }
            })
            
            autoTable(doc, {
                startY: nextY + 4,
                head: [["Date", "Supplier", "Card Name", "Gross Amt", "Tax", "Net Amount", "Status"]],
                body: reportData.holds.map((h: any) => [
                    format(new Date(h.sale_date || h.created_at), "dd MMM yyyy"),
                    h.supplier_cards?.suppliers?.name || '-',
                    h.supplier_cards?.card_name || '-',
                    Number(h.hold_amount || 0).toLocaleString(),
                    Number(h.tax_amount || 0).toLocaleString(),
                    Number(h.net_amount || h.hold_amount || 0).toLocaleString(),
                    (h.status || "").replace(/_/g, " ").toUpperCase()
                ]),
                foot: [[
                    { content: "TOTAL PENDING: Rs. " + pendingGross.toLocaleString(), colSpan: 3, styles: { halign: "left", fontStyle: "bold", textColor: [217, 119, 6] } },
                    { content: "GROSS RELEASED: Rs. " + receivedGross.toLocaleString(), colSpan: 2, styles: { fontStyle: "bold", textColor: [41, 128, 185] } },
                    { content: "NET RECEIVED: Rs. " + receivedNet.toLocaleString(), colSpan: 2, styles: { fontStyle: "bold", textColor: [22, 163, 74], halign: "right" } }
                ]],
                theme: "grid",
                headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                footStyles: { fillColor: [242, 247, 252] },
                alternateRowStyles: { fillColor: [250, 252, 255] },
                styles: { fontSize: 7, cellPadding: 2 },
                columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
                margin: { left: 14, right: 14 }
            })
        }
    } else if (activeTab === "sales-report") {
        // 1. DATA EXTRACTION
        const products = reportData.products || (Array.isArray(reportData) ? reportData : [])
        const bankCards = reportData.bankCards || []
        
        const showProducts = scope === "full" || scope === "products"
        const showCards = scope === "full" || scope === "bank-cards"

        // 2. PRODUCT SALES SECTION
        if (showProducts && products.length > 0) {
            const totalRevenue = products.reduce((sum: number, s: any) => sum + Number(s.total || 0), 0)
            const totalDiscount = products.reduce((sum: number, s: any) => sum + Number(s.discount || 0), 0)
            const totalProfit = products.reduce((sum: number, s: any) => sum + Number(s.profit || 0), 0)
            const grossSales = totalRevenue + totalDiscount

            addKPIGrid("Product & Fuel Performance Summary", 
                ["GROSS SALES", "DISCOUNTS GIVEN", "NET REVENUE", "EST. PROFIT"], 
                [
                    `Rs. ${grossSales.toLocaleString()}`,
                    `Rs. ${totalDiscount.toLocaleString()}`,
                    `Rs. ${totalRevenue.toLocaleString()}`,
                    `Rs. ${totalProfit.toLocaleString()}`
                ],
                [41, 128, 185] // Blue
            )

            doc.setFontSize(11)
            doc.setFont("helvetica", "bold")
            doc.text("Detailed Product & Fuel Sales Log", 14, nextY)
            autoTable(doc, {
                startY: nextY + 3,
                head: [["Date", "Description", "Category", "Qty", "Rate", "Discount", "Net Total", "Profit"]],
                body: products.map((s: any) => [
                    format(new Date(s.date), "dd MMM yyyy"),
                    s.description || s.item_name || "-",
                    s.type,
                    `${Number(s.quantity || 0).toLocaleString()} ${s.unit || ""}`,
                    `Rs. ${Number(s.rate || 0).toLocaleString()}`,
                    Number(s.discount || 0) > 0 ? `Rs. ${Number(s.discount).toLocaleString()}` : "-",
                    `Rs. ${Number(s.total || 0).toLocaleString()}`,
                    s.profit ? `Rs. ${Number(s.profit).toLocaleString()}` : "-"
                ]),
                foot: [[
                    { content: `TOTALS — ${products.length} record(s)`, colSpan: 5, styles: { halign: "left", fontStyle: "bold", fillColor: [44, 62, 80], textColor: 255 } },
                    { content: totalDiscount > 0 ? `Rs. ${totalDiscount.toLocaleString()}` : "-", styles: { halign: "right", fontStyle: "bold", fillColor: [230, 126, 34], textColor: 255 } },
                    { content: `Rs. ${totalRevenue.toLocaleString()}`, styles: { halign: "right", fontStyle: "bold", fillColor: [44, 62, 80], textColor: 255 } },
                    { content: `Rs. ${totalProfit.toLocaleString()}`, styles: { halign: "right", fontStyle: "bold", fillColor: [39, 174, 96], textColor: 255 } },
                ]],
                theme: "grid",
                headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                footStyles: { fontStyle: "bold" },
                alternateRowStyles: { fillColor: [248, 249, 250] },
                styles: { fontSize: 7, cellPadding: 2 },
                columnStyles: {
                    3: { halign: "right" },
                    4: { halign: "right" },
                    5: { halign: "right", textColor: [230, 126, 34] },
                    6: { halign: "right", fontStyle: "bold" },
                    7: { halign: "right", textColor: [39, 174, 96] }
                },
                didParseCell: (data: any) => {
                    if (data.section === "body" && data.column.index === 5) {
                        const rowData = products[data.row.index]
                        if (rowData && Number(rowData.discount) > 0) {
                            data.cell.styles.fillColor = [255, 243, 224]
                            data.cell.styles.textColor = [180, 80, 0]
                            data.cell.styles.fontStyle = "bold"
                        }
                    }
                },
                margin: { left: 14, right: 14 }
            })
            nextY = (doc as any).lastAutoTable.finalY + 15
        } else if (showProducts) {
             doc.setFontSize(10)
             doc.setTextColor(150)
             doc.text("No product sales data found for the selected range.", 14, nextY)
             nextY += 10
        }

        // 3. BANK CARDS SECTION
        if (showCards && bankCards.length > 0) {
            // If starting fresh page
            if (nextY > 200 && showProducts) {
                doc.addPage()
                nextY = 20
            }

            const totalHold = bankCards.reduce((sum: number, r: any) => sum + Number(r.hold_amount || 0), 0)
            const totalTax = bankCards.reduce((sum: number, r: any) => sum + Number(r.tax_amount || 0), 0)
            const totalNet = bankCards.reduce((sum: number, r: any) => sum + Number(r.net_amount || 0), 0)

            addKPIGrid("Bank Card Settlements Summary", 
                ["TOTAL CARD SALES", "TOTAL CARD TAX", "NET BANK AMOUNT"], 
                [
                    `Rs. ${totalHold.toLocaleString()}`,
                    `Rs. ${totalTax.toLocaleString()}`,
                    `Rs. ${totalNet.toLocaleString()}`
                ],
                [22, 163, 74] // Green
            )

            doc.setFontSize(11)
            doc.setFont("helvetica", "bold")
            doc.setTextColor(50)
            doc.text("Bank Card Settlements Log", 14, nextY)

            autoTable(doc, {
                startY: nextY + 3,
                head: [["Date", "Card Name", "Bank Account", "Hold Amount", "Tax (Deducted)", "Net Expected", "Status"]],
                body: bankCards.map((r: any) => [
                    format(new Date(r.sale_date), "dd MMM yyyy"),
                    r.bank_cards?.card_name || "Bank Card",
                    r.bank_cards?.bank_accounts?.bank_name || "N/A",
                    `Rs. ${Number(r.hold_amount || 0).toLocaleString()}`,
                    `- Rs. ${Number(r.tax_amount || 0).toLocaleString()}`,
                    `Rs. ${Number(r.net_amount || 0).toLocaleString()}`,
                    (r.status || "").toUpperCase()
                ]),
                foot: [[
                    { content: `TOTALS — ${bankCards.length} record(s)`, colSpan: 3, styles: { halign: "left", fontStyle: "bold", fillColor: [44, 62, 80], textColor: 255 } },
                    { content: `Rs. ${totalHold.toLocaleString()}`, styles: { halign: "right", fontStyle: "bold", fillColor: [44, 62, 80], textColor: 255 } },
                    { content: `- Rs. ${totalTax.toLocaleString()}`, styles: { halign: "right", fontStyle: "bold", fillColor: [220, 38, 38], textColor: 255 } },
                    { content: `Rs. ${totalNet.toLocaleString()}`, styles: { halign: "right", fontStyle: "bold", fillColor: [22, 163, 74], textColor: 255 } },
                    { content: "", styles: { fillColor: [44, 62, 80] } }
                ]],
                theme: "grid",
                headStyles: { fillColor: [22, 163, 74], textColor: 255 },
                footStyles: { fontStyle: "bold" },
                alternateRowStyles: { fillColor: [248, 252, 248] },
                styles: { fontSize: 7, cellPadding: 2 },
                columnStyles: { 3: { halign: "right" }, 4: { halign: "right", textColor: [180, 0, 0] }, 5: { halign: "right", fontStyle: "bold" }, 6: { halign: "center" } },
                margin: { left: 14, right: 14 }
            })
            nextY = (doc as any).lastAutoTable.finalY + 15
        } else if (showCards) {
             doc.setFontSize(10)
             doc.setTextColor(150)
             doc.text("No bank card transaction data found for the selected range.", 14, nextY)
        }

    } else if (activeTab === "bank-card-report" && Array.isArray(reportData)) {
        doc.setFontSize(11)
        doc.setFont("helvetica", "bold")
        doc.text("Bank Card Settlement Log", 14, nextY)
        autoTable(doc, {
            startY: nextY + 3,
            head: [["Date", "Card", "Bank", "Hold", "Tax", "Net", "Status"]],
            body: reportData.map((r: any) => [
                format(new Date(r.sale_date), "dd MMM yyyy"),
                r.bank_cards?.card_name || "Card",
                r.bank_cards?.bank_accounts?.bank_name || "N/A",
                `Rs. ${Number(r.hold_amount || 0).toLocaleString()}`,
                `Rs. ${Number(r.tax_amount || 0).toLocaleString()}`,
                `Rs. ${Number(r.net_amount || 0).toLocaleString()}`,
                r.status
            ]),
            theme: "grid",
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
            margin: { left: 14, right: 14 }
        })
    } else if (activeTab === "stock" && Array.isArray(reportData)) {
        doc.setFontSize(11)
        doc.setFont("helvetica", "bold")
        doc.text("Stock Movement & Dip History", 14, nextY)
        
        autoTable(doc, {
            startY: nextY + 4,
            head: [["Date", "Product", "Type", "Prev", "Sale", "Purch", "Dip", "G/L", "Net", "Note"]],
            body: reportData.map((s: any) => {
                const isNegative = s.quantity && s.quantity < 0
                const isPositive = s.quantity && s.quantity > 0
                const isDip = s.row_type === "dip_reading"
                const rawQty = s.quantity ? Math.abs(s.quantity) : 0

                return [
                    format(new Date(s.movement_date), "dd MMM yyyy HH:mm"),
                    s.product_name,
                    s.movement_type.toUpperCase(),
                    (s.previous_stock || 0).toLocaleString(),
                    isNegative ? `-${rawQty.toLocaleString()}` : "—",
                    isPositive ? `+${rawQty.toLocaleString()}` : "—",
                    isDip ? (s.dip_quantity || 0).toLocaleString() : "—",
                    isDip ? (Number(s.gain_amount || 0) > 0 ? `+${s.gain_amount}` : Number(s.loss_amount || 0) > 0 ? `-${s.loss_amount}` : "0") : "—",
                    (s.balance_after || 0).toLocaleString(),
                    (s.notes || "").substring(0, 30)
                ]
            }),
            theme: "grid",
            headStyles: { fillColor: [52, 73, 94], textColor: 255 },
            alternateRowStyles: { fillColor: [248, 249, 250] },
            styles: { fontSize: 7, cellPadding: 2 },
            columnStyles: { 
                3: { halign: "right" }, 
                4: { halign: "right", textColor: [192, 57, 43] }, 
                5: { halign: "right", textColor: [39, 174, 96] }, 
                6: { halign: "right", textColor: [31, 97, 141] }, 
                7: { halign: "right", textColor: [31, 97, 141], fontStyle: "bold" },
                8: { halign: "right", fontStyle: "bold" } 
            },
            margin: { left: 14, right: 14 }
        })
    } else if (activeTab === "gain-loss" && reportData.records) {
        doc.setFontSize(11)
        doc.setFont("helvetica", "bold")
        doc.text("Stock Gain / Loss Summary", 14, nextY)
        
        addKPIGrid(
            "Volumetric Variance Highlights",
            ["TOTAL GAIN (L)", "TOTAL LOSS (L)", "NET VARIANCE (L)"],
            [
                `+${reportData.totalGain.toLocaleString(undefined, { minimumFractionDigits: 1 })}`,
                `-${reportData.totalLoss.toLocaleString(undefined, { minimumFractionDigits: 1 })}`,
                `${reportData.netVariance >= 0 ? '+' : ''}${reportData.netVariance.toLocaleString(undefined, { minimumFractionDigits: 1 })}`
            ],
            [41, 128, 185]
        )

        doc.setFontSize(11)
        doc.setFont("helvetica", "bold")
        doc.text("Detailed Discrepancy Log", 14, nextY)
        
        autoTable(doc, {
            startY: nextY + 4,
            head: [["Date", "Tank", "Product", "System", "Dip", "Variance", "New Stk", "Var %"]],
            body: reportData.records.map((r: any) => [
                format(new Date(r.reading_date), "dd MMM yyyy"),
                r.tank_name,
                r.product_name,
                r.system_stock.toLocaleString(),
                r.dip_stock.toLocaleString(),
                `${r.variance >= 0 ? '+' : ''}${r.variance.toLocaleString(undefined, { minimumFractionDigits: 1 })}`,
                r.dip_stock.toLocaleString(),
                `${r.variance_percentage.toFixed(2)}%`
            ]),
            theme: "grid",
            headStyles: { fillColor: [52, 73, 94], textColor: 255 },
            alternateRowStyles: { fillColor: [248, 249, 250] },
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: { 
                3: { halign: "right" }, 
                4: { halign: "right" }, 
                5: { halign: "right", fontStyle: "bold" },
                6: { halign: "right", fontStyle: "bold", textColor: [31, 97, 141] },
                7: { halign: "right" }
            },
            didParseCell: (data) => {
                if (data.column.index === 5 && data.section === 'body') {
                    const row = reportData.records[data.row.index];
                    if (row.variance < 0) data.cell.styles.textColor = [220, 38, 38];
                    else if (row.variance > 0) data.cell.styles.textColor = [22, 163, 74];
                }
            },
            margin: { left: 14, right: 14 }
        })
    }

    doc.save(`report-${activeTab}-${getTodayPKT()}.pdf`)
}
