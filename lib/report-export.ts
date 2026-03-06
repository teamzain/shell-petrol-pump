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
        const dateRangeStr = filters.dateRange.from && filters.dateRange.to
            ? `${format(filters.dateRange.from, "MMM dd, yyyy")} - ${format(filters.dateRange.to, "MMM dd, yyyy")}`
            : format(new Date(), "MMM dd, yyyy")

        if (type === "csv") {
            exportToCSV(activeTab, reportData, dateRangeStr)
        } else {
            exportToPDF(activeTab, reportData, dateRangeStr, stationName)
        }
    } catch (error) {
        console.error(`Error exporting ${type} report:`, error)
        alert(`Failed to export ${type} report. Please check the console for details.`)
    }
}

function exportToCSV(activeTab: string, reportData: any, dateRangeStr: string) {
    let csvContent = "data:text/csv;charset=utf-8,"
    let fileName = `report-${activeTab}-${getTodayPKT()}.csv`

    if (activeTab === "purchase-history" && Array.isArray(reportData)) {
        const headers = ["Date", "Invoice", "Supplier", "Amount", "Status"]
        csvContent += headers.join(",") + "\n"
        reportData.forEach((o: any) => {
            const row = [
                o.purchase_date,
                o.invoice_number,
                o.suppliers?.supplier_name || "N/A",
                o.total_amount,
                o.status
            ]
            csvContent += row.join(",") + "\n"
        })
    } else if (activeTab === "expense-breakdown" && reportData.expenses) {
        const headers = ["Date", "Category", "Amount", "Method", "Notes"]
        csvContent += headers.join(",") + "\n"
        reportData.expenses.forEach((e: any) => {
            const row = [
                e.expense_date,
                e.expense_categories?.category_name || "N/A",
                e.amount,
                e.payment_method,
                e.description || ""
            ]
            csvContent += row.join(",") + "\n"
        })
    } else if (activeTab === "supplier-tracking" && Array.isArray(reportData)) {
        const headers = ["Supplier", "Type", "Period Purchases", "Lifetime Total", "Outstanding Dues"]
        csvContent += headers.join(",") + "\n"
        reportData.forEach((s: any) => {
            const row = [
                s.supplier_name,
                s.supplier_type,
                s.periodPurchases,
                s.total_purchases,
                s.outstandingDues
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

function exportToPDF(activeTab: string, reportData: any, dateRangeStr: string, stationName: string) {
    const doc = new jsPDF()
    const title = activeTab.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")

    // Header
    doc.setFontSize(20)
    doc.setTextColor(40)
    doc.text(stationName, 14, 22)

    doc.setFontSize(14)
    doc.setTextColor(100)
    doc.text(`${title} Report`, 14, 32)

    doc.setFontSize(10)
    doc.text(`Period: ${dateRangeStr}`, 14, 40)
    doc.text(`Generated on: ${format(new Date(), "PPpp")}`, 14, 46)

    let tableData: any[] = []
    let tableHeaders: string[] = []

    // Helper for Summary Cards
    const addSummarySection = (title: string, data: [string, string][]) => {
        doc.setFontSize(12)
        doc.setFont("helvetica", "bold")
        doc.text(title, 14, 52)
        autoTable(doc, {
            startY: 55,
            body: data,
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 2 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 } },
            margin: { left: 14, right: 14 }
        })
        return (doc as any).lastAutoTable.finalY + 10
    }

    let nextY = 55

    if (activeTab === "purchase-history" && reportData.orders) {
        nextY = addSummarySection("Purchase Overview", [
            ["Total Purchase Value", `Rs. ${reportData.totalValue?.toLocaleString() || "0"}`],
            ["Total Paid Amount", `Rs. ${reportData.totalPaid?.toLocaleString() || "0"}`],
            ["Outstanding Dues", `Rs. ${reportData.outstandingDues?.toLocaleString() || "0"}`],
        ])

        tableHeaders = ["Date", "Invoice", "Supplier", "Amount (Rs.)", "Status"]
        tableData = reportData.orders.map((o: any) => [
            o.purchase_date,
            o.invoice_number,
            o.suppliers?.supplier_name || "N/A",
            o.total_amount.toLocaleString(),
            o.status
        ])
    } else if (activeTab === "expense-breakdown" && reportData.expenses) {
        nextY = addSummarySection("Expense Summary", [
            ["Total Expenses", `Rs. ${reportData.totalExpenses?.toLocaleString() || "0"}`],
            ["Number of Records", `${reportData.expenses.length}`],
        ])

        tableHeaders = ["Date", "Category", "Amount (Rs.)", "Method", "Notes"]
        tableData = reportData.expenses.map((e: any) => [
            e.expense_date,
            e.expense_categories?.category_name || "N/A",
            e.amount.toLocaleString(),
            e.payment_method,
            e.description || ""
        ])
    } else if (activeTab === "supplier-tracking" && reportData.suppliers) {
        nextY = addSummarySection("Supplier Position", [
            ["Total Suppliers", `${reportData.totalSuppliers || 0}`],
            ["Total Outstanding Dues", `Rs. ${reportData.totalOutstanding?.toLocaleString() || "0"}`],
            ["Active Orders in Period", `${reportData.totalOrders || 0}`],
        ])

        tableHeaders = ["Supplier", "Type", "Period Purchases", "Lifetime Total", "Outstanding Dues"]
        tableData = reportData.suppliers.map((s: any) => [
            s.supplier_name,
            s.supplier_type,
            s.periodPurchases.toLocaleString(),
            s.total_purchases.toLocaleString(),
            s.outstandingDues.toLocaleString()
        ])
    }

    if (tableHeaders.length > 0) {
        autoTable(doc, {
            startY: nextY,
            head: [tableHeaders],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            margin: { top: 55 },
        })
    } else {
        doc.setFontSize(12)
        doc.text("No data available for this report type or export not yet fully implemented.", 14, 60)
    }

    doc.save(`report-${activeTab}-${getTodayPKT()}.pdf`)
}
