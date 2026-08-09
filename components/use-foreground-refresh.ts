"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

/** How long backgrounded before the payload is assumed stale. */
export const FOREGROUND_REFRESH_MS = 3_600_000

/**
 * Refetch the page when it comes back after an hour or more in the background.
 *
 * Nothing else refetches on focus: the page is ISR at 3600s and the cron
 * revalidates it hourly, but a phone waking from sleep renders whatever the
 * server sent whenever it last navigated. Installed to a home screen there is
 * not even a reload button to fall back on.
 *
 * router.refresh() rather than location.reload(): it re-fetches the RSC payload
 * while leaving client state alone, so the open day rows, the selected metric
 * and the current view all survive the update. It bypasses the client router
 * cache, so it does reach the server; the server may still answer from the ISR
 * cache, which is correct -- that copy is at most an hour old by construction.
 */
export function useForegroundRefresh(thresholdMs: number = FOREGROUND_REFRESH_MS): void {
  const router = useRouter()
  // 0 is "not currently backgrounded". A sentinel rather than undefined because
  // useRef needs an initial value and lint strips a literal undefined argument.
  const hiddenAt = useRef(0)

  useEffect(() => {
    const refreshIfStale = () => {
      const since = hiddenAt.current
      hiddenAt.current = 0
      if (since !== 0 && Date.now() - since >= thresholdMs) {
        router.refresh()
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Only the first hide counts: visibilitychange can fire repeatedly while
        // backgrounded, and restamping would reset the clock each time.
        if (hiddenAt.current === 0) {
          hiddenAt.current = Date.now()
        }
        return
      }
      refreshIfStale()
    }

    // iOS restores from the back/forward cache without always running the
    // visibility path, and a restored page is exactly the stale one this exists
    // to catch.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        refreshIfStale()
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    globalThis.addEventListener("pageshow", onPageShow)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      globalThis.removeEventListener("pageshow", onPageShow)
    }
  }, [router, thresholdMs])
}
