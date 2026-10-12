"use client"

import { useEffect, useState } from "react"

/**
 * A minute-ticking clock seeded from a server-rendered instant.
 *
 * Seeded from the prop so hydration matches the server markup, then corrected on
 * mount: the page is statically revalidated hourly, so its clock can be behind.
 * Readiness changes together with the corrected instant, allowing freshness
 * labels to wait for the browser clock. The interval keeps a long-open tab current.
 */
export function useNow(
  initialNow: Date,
  intervalMs = 60_000,
): { now: Date; hasClientTime: boolean } {
  const [clock, setClock] = useState({ now: initialNow, hasClientTime: false })
  useEffect(() => {
    const update = () => setClock({ now: new Date(), hasClientTime: true })
    update()
    const id = setInterval(update, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return clock
}
