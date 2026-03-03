import React from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background" suppressHydrationWarning>
      <DashboardSidebar />
      <div className="lg:pl-64" suppressHydrationWarning>
        <DashboardHeader />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
