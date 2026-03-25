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
}

export function exportReport({ activeTab, reportData, filters, stationName = "United Filling Station" }: ExportOptions, type: ExportType) {
    if (!reportData) return

    try {
        const dateRangeStr = filters.dateRange?.from && filters.dateRange?.to
            ? `${format(new Date(filters.dateRange.from), "MMM dd, yyyy")} - ${format(new Date(filters.dateRange.to), "MMM dd, yyyy")}`
            : format(new Date(), "MMM dd, yyyy")

        if (type === "csv") {
            exportToCSV(activeTab, reportData, dateRangeStr, filters)
        } else {
            exportToPDF(activeTab, reportData, dateRangeStr, stationName, filters)
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
        csvContent += `Gross Revenue,${data.total.revenue.toLocaleString()}\n`
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

    } else if (activeTab === "purchase-history" && Array.isArray(reportData)) {
        csvContent += "PURCHASE HISTORY REPORT\n"
        csvContent += `Period,${dateRangeStr}\n`
        csvContent += `Generated,${format(new Date(), "PPpp")}\n\n`
        const headers = ["Date", "Invoice", "Supplier", "Amount", "Status"]
        csvContent += headers.join(",") + "\n"
        reportData.forEach((o: any) => {
            const row = [ o.purchase_date, o.invoice_number, o.suppliers?.name || "N/A", o.total_amount, o.status ]
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
        const headers = ["Date", "Description", "Category", "Quantity", "Rate", "Total", "Profit", "Payment"]
        csvContent += headers.join(",") + "\n"
        reportData.forEach((s: any) => {
            const row = [ 
                s.date, 
                `"${s.description}"`, 
                s.type, // 'Fuel' or 'Lubricant'
                s.quantity, 
                s.rate, 
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

function exportToPDF(activeTab: string, reportData: any, dateRangeStr: string, stationName: string, filters: any) {
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

    // Category Filter
    let categoryLabel = "All Categories"
    if (filters.productType === "fuel") categoryLabel = "Fuel Only"
    if (filters.productType === "oil_lubricant") categoryLabel = "Lubricants Only"
    metadataBody.push(["Category", categoryLabel])

    // Product Filter
    let productLabel = "All Products"
    if (filters.productId !== "all" && reportData.productBreakdown?.length > 0) {
        const found = reportData.productBreakdown.find((p: any) => p.product_id === filters.productId)
        productLabel = found ? found.name : "Specific Product"
    } else if (filters.productId !== "all") {
        productLabel = "Specific Product"
    }
    metadataBody.push(["Selected Product", productLabel])

    // Supplier Filter (if exists in filters)
    if (filters.supplierId && filters.supplierId !== "all") {
        metadataBody.push(["Supplier", "Filtered Specific"])
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
    if (activeTab === "profit-loss") {
        const data = reportData
        const netMargin = data.total.revenue > 0 ? ((data.total.netProfit / data.total.revenue) * 100).toFixed(1) : "0.0"

        // Section 1: Top KPIs Grid
        addKPIGrid(
            "Overall Key Performance Indicators (KPIs)",
            ["TOTAL REVENUE", "COST OF GOODS SOLD", "OPERATING EXPENSE", "NET PROFIT / LOSS"],
            [
                `Rs. ${data.total.revenue.toLocaleString()}`,
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
                ["Gross Revenue", `+ Rs. ${data.total.revenue.toLocaleString()}`],
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
        addKPIGrid("Purchase Summary", ["TOTAL VALUE", "PAID AMOUNT", "OUTSTANDING"], [`Rs. ${reportData.totalValue?.toLocaleString()}`, `Rs. ${reportData.totalPaid?.toLocaleString()}`, `Rs. ${reportData.outstandingDues?.toLocaleString()}`])
        autoTable(doc, {
            startY: nextY,
            head: [["Date", "Invoice", "Supplier", "Amount", "Status"]],
            body: reportData.orders.map((o: any) => [o.purchase_date, o.invoice_number, o.suppliers?.name || "N/A", o.total_amount.toLocaleString(), o.status]),
            theme: "grid",
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            alternateRowStyles: { fillColor: [242, 247, 252] },
            styles: { fontSize: 9, cellPadding: 3 },
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
        addKPIGrid("Supplier Summary", 
            ["SUPPLIERS", "TOTAL ORDERS", "ON HOLD", "OUTSTANDING DUES"], 
            [`${reportData.totalSuppliers}`, `${reportData.totalOrders}`, `Rs. ${reportData.totalOnHold?.toLocaleString() || 0}`, `Rs. ${reportData.totalOutstanding?.toLocaleString() || 0}`]
        )
        autoTable(doc, {
            startY: nextY,
            head: [["Supplier", "Type", "Period Purchases", "Lifetime Total", "Outstanding"]],
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
            styles: { fontSize: 9, cellPadding: 3 },
            margin: { left: 14, right: 14 }
        })

        if (reportData.purchases && reportData.purchases.length > 0) {
            nextY = (doc as any).lastAutoTable.finalY + 10
            doc.setFontSize(12)
            doc.setTextColor(40)
            doc.text("Purchase Orders", 14, nextY)
            
            const totalPO = reportData.purchases.reduce((sum: number, p: any) => sum + Number(p.estimated_total || 0), 0)
            
            autoTable(doc, {
                startY: nextY + 4,
                head: [["Date", "PO Number", "Supplier", "Product", "Est Total", "Status"]],
                body: reportData.purchases.map((p: any) => [
                    format(new Date(p.created_at || p.purchase_date), "dd MMM yyyy"),
                    p.po_number,
                    p.suppliers?.name || '-',
                    p.products?.name || '-',
                    p.estimated_total?.toLocaleString() || '0',
                    (p.status || "").replace(/_/g, " ")
                ]),
                foot: [[
                    { content: "PERIOD PURCHASE TOTAL", colSpan: 4, styles: { halign: "left", fontStyle: "bold", textColor: [41, 128, 185] } },
                    { content: "Rs. " + totalPO.toLocaleString(), styles: { fontStyle: "bold", textColor: [41, 128, 185] } },
                    ""
                ]],
                theme: "grid",
                headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                footStyles: { fillColor: [242, 247, 252], textColor: [41, 128, 185] },
                alternateRowStyles: { fillColor: [250, 252, 255] },
                styles: { fontSize: 8, cellPadding: 3 },
                margin: { left: 14, right: 14 }
            })
        }

        if (reportData.transactions && reportData.transactions.length > 0) {
            nextY = (doc as any).lastAutoTable.finalY + 10
            doc.setFontSize(12)
            doc.setTextColor(40)
            doc.text("Transactions", 14, nextY)
            
            let inTotal = 0, outTotal = 0
            reportData.transactions.forEach((t: any) => {
                const amt = Number(t.amount || 0)
                if (t.transaction_type === "credit") inTotal += amt
                else outTotal += amt
            })
            
            autoTable(doc, {
                startY: nextY + 4,
                head: [["Date", "Supplier", "Amount", "Type"]],
                body: reportData.transactions.map((t: any) => [
                    format(new Date(t.transaction_date), "dd MMM yyyy"),
                    t.company_accounts?.suppliers?.name || t.bank_accounts?.account_name || '-',
                    t.amount?.toLocaleString() || '0',
                    t.transaction_type
                ]),
                foot: [[
                    { content: "PAYMENTS IN: Rs. " + inTotal.toLocaleString(), colSpan: 2, styles: { halign: "left", fontStyle: "bold", textColor: [22, 163, 74] } },
                    { content: "DEDUCTIONS: Rs. " + outTotal.toLocaleString(), styles: { fontStyle: "bold", textColor: [220, 38, 38] } },
                    { content: "NET: Rs. " + (inTotal - outTotal).toLocaleString(), styles: { fontStyle: "bold" } }
                ]],
                theme: "grid",
                headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                footStyles: { fillColor: [242, 247, 252] },
                alternateRowStyles: { fillColor: [250, 252, 255] },
                styles: { fontSize: 8, cellPadding: 3 },
                margin: { left: 14, right: 14 }
            })
        }

        if (reportData.holds && reportData.holds.length > 0) {
            nextY = (doc as any).lastAutoTable.finalY + 10
            doc.setFontSize(12)
            doc.setTextColor(40)
            doc.text("Card Holds", 14, nextY)
            
            let pendingTotal = 0, receivedTotal = 0
            reportData.holds.forEach((h: any) => {
                const amt = Number(h.hold_amount || 0)
                if (h.status === "pending") pendingTotal += amt
                else if (h.status === "received") receivedTotal += amt
            })
            
            autoTable(doc, {
                startY: nextY + 4,
                head: [["Date", "Supplier", "Card Name", "Amount", "Status"]],
                body: reportData.holds.map((h: any) => [
                    format(new Date(h.created_at), "dd MMM yyyy"),
                    h.supplier_cards?.suppliers?.name || '-',
                    h.supplier_cards?.card_name || '-',
                    h.hold_amount?.toLocaleString() || '0',
                    (h.status || "").replace(/_/g, " ")
                ]),
                foot: [[
                    { content: "TOTAL PENDING: Rs. " + pendingTotal.toLocaleString(), colSpan: 3, styles: { halign: "left", fontStyle: "bold", textColor: [217, 119, 6] } },
                    { content: "TOTAL RECEIVED: Rs. " + receivedTotal.toLocaleString(), colSpan: 2, styles: { fontStyle: "bold", textColor: [22, 163, 74] } }
                ]],
                theme: "grid",
                headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                footStyles: { fillColor: [242, 247, 252] },
                alternateRowStyles: { fillColor: [250, 252, 255] },
                styles: { fontSize: 8, cellPadding: 3 },
                margin: { left: 14, right: 14 }
            })
        }
    } else if (activeTab === "sales-report" && Array.isArray(reportData)) {
        doc.setFontSize(11)
        doc.setFont("helvetica", "bold")
        doc.text("Sales Transactions Log", 14, nextY)
        autoTable(doc, {
            startY: nextY + 3,
            head: [["Date", "Description", "Category", "Qty", "Total", "Profit"]],
            body: reportData.map((s: any) => [
                format(new Date(s.date), "dd MMM"),
                s.description,
                s.type,
                s.quantity.toLocaleString(),
                s.total.toLocaleString(),
                s.profit.toLocaleString()
            ]),
            theme: "grid",
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
            margin: { left: 14, right: 14 }
        })
    } else if (activeTab === "bank-card-report" && Array.isArray(reportData)) {
        doc.setFontSize(11)
        doc.setFont("helvetica", "bold")
        doc.text("Bank Card Settlement Log", 14, nextY)
        autoTable(doc, {
            startY: nextY + 3,
            head: [["Date", "Card", "Bank", "Hold", "Tax", "Net", "Status"]],
            body: reportData.map((r: any) => [
                format(new Date(r.sale_date), "dd MMM"),
                r.bank_cards?.card_name || "Card",
                r.bank_cards?.bank_accounts?.bank_name || "N/A",
                r.hold_amount.toLocaleString(),
                r.tax_amount.toLocaleString(),
                r.net_amount.toLocaleString(),
                r.status
            ]),
            theme: "grid",
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
            margin: { left: 14, right: 14 }
        })
    }

    doc.save(`report-${activeTab}-${getTodayPKT()}.pdf`)
}
