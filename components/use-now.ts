"use client"

import { useEffect, useState } from "react"

/**
 * A minute-ticking clock seeded from a server-rendered instant.
 *
 * Seeded from the prop so hydration matches the server markup, then corrected on
 * mount: the page is statically revalidated hourly, so the server's clock can be
 * up to an hour behind by the time this renders. The interval keeps it honest on
 * a long-open tab.
 */
export function useNow(initialNow: Date, intervalMs = 60_000): Date {
  const [now, setNow] = useState(initialNow)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
