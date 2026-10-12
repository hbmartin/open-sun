"use client"

import { useEffect, useState } from "react"

/**
 * A minute-ticking clock seeded from a server-rendered instant.
 *
 * Seeded from the prop so hydration matches the server markup, then corrected on
 * mount: the page is statically revalidated hourly, so its clock can be behind.
 * Readiness changes together with the corrected instant, allowing freshness
 * labels to wait for the browser clock. Minute ticks keep an open tab current;
 * returning to a visible tab or restoring from bfcache corrects it immediately.
 * New server props do not reset a clock that already has browser time.
 */
export function useNow(
  initialNow: Date,
  intervalMs = 60_000,
): { now: Date; hasClientTime: boolean } {
  const [clock, setClock] = useState({ now: initialNow, hasClientTime: false })
  useEffect(() => {
    const update = () => setClock({ now: new Date(), hasClientTime: true })
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") update()
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) update()
    }
    update()
    const id = setInterval(update, intervalMs)
    document.addEventListener("visibilitychange", onVisibilityChange)
    globalThis.addEventListener("pageshow", onPageShow)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      globalThis.removeEventListener("pageshow", onPageShow)
    }
  }, [intervalMs])
  return clock
}
