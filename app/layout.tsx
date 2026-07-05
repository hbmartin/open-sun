import type { Metadata } from "next"
import "./globals.css"
import type React from "react"

function getMetadataBase() {
  const configuredUrl = process.env.SITE_URL
  const vercelUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  return new URL(
    configuredUrl ?? (vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000"),
  )
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
