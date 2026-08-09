"use client"

import type React from "react"
import { ArrowUp } from "lucide-react"
import { useEffect, useState } from "react"

/**
 * A way back up, once the thing at the top of the page has gone.
 *
 * Watches an element rather than window.scrollY: the page has no scroll
 * container of its own -- the document body scrolls -- and an observer costs
 * nothing per frame where a scroll listener would fire on every one.
 */
export default function ScrollToTop({
  watch,
}: {
  watch: React.RefObject<HTMLElement | null>
}): React.JSX.Element | undefined {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const element = watch.current
    if (element === null) {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        // The bottom check is what distinguishes "scrolled past" from "not laid
        // out yet": on first paint an element can report not-intersecting with a
        // bottom below the fold, and without this the button flashes in.
        setShow(entry !== undefined && !entry.isIntersecting && entry.boundingClientRect.bottom < 0)
      },
      { threshold: 0 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [watch])

  if (!show) {
    return undefined
  }

  return (
    // fixed ignores the app column's `relative`, so the wrapper repeats the
    // centring the bottom nav uses and pins the button to the column's right
    // edge instead of the viewport's. pointer-events-none keeps the empty band
    // from swallowing taps meant for the cards underneath.
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 w-full max-w-sm md:max-w-2xl flex justify-end px-4 pointer-events-none">
      <button
        type="button"
        aria-label="Scroll to top"
        onClick={() => globalThis.scrollTo({ top: 0, behavior: "smooth" })}
        className="pointer-events-auto rounded-full p-3 bg-white/70 dark:bg-gray-900/70 backdrop-blur-md ring-1 ring-gray-900/10 dark:ring-white/10 shadow-lg text-gray-700 dark:text-gray-200"
      >
        <ArrowUp size={20} aria-hidden="true" />
      </button>
    </div>
  )
}
