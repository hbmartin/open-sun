"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid a hydration mismatch: the resolved theme is only known on the client.
  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = resolvedTheme === "dark"
  const showDark = mounted && isDark

  return (
    <button
      type="button"
      onClick={() => setTheme(showDark ? "light" : "dark")}
      aria-label={showDark ? "Switch to light theme" : "Switch to dark theme"}
      className="rounded-full p-2 text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
    >
      {showDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
