import type { Metadata } from "next"
import "./globals.css"
import type React from "react"
import { getAppUrl } from "@/lib/environment"

function getMetadataBase() {
  return new URL(getAppUrl())
}

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: "Lassen - Open Sun",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
