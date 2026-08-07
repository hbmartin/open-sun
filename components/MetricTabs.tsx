"use client"

import type React from "react"
import { useRef } from "react"

/**
 * The metric tablist, shared by the history and forecast views.
 *
 * Generic over the metric enum because the two views expose different metric
 * sets: the forecast has no UV index or solar radiation, and the station has no
 * probability of precipitation. The roving-tabindex keyboard handling was
 * already written against the tab array rather than a specific enum, so it
 * transfers unchanged.
 *
 * Callers should key this by view. The ref array is positional, so going from
 * five tabs to three would otherwise leave stale entries at the tail.
 */
export default function MetricTabs<T extends string>({
  tabs,
  labels,
  activeTab,
  onSelect,
  panelId,
  label,
}: {
  tabs: readonly T[]
  labels: Record<T, string>
  activeTab: T
  onSelect: (tab: T) => void
  panelId: string
  label: string
}): React.JSX.Element {
  const tabReferences = useRef<(HTMLButtonElement | null)[]>([])

  const handleTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    let nextIndex: number | undefined
    switch (event.key) {
    case "ArrowRight": {
      nextIndex = (index + 1) % tabs.length

    break
    }
    case "ArrowLeft": {
      nextIndex = (index - 1 + tabs.length) % tabs.length

    break
    }
    case "Home": {
      nextIndex = 0

    break
    }
    case "End": {
      nextIndex = tabs.length - 1

    break
    }
    // No default
    }
    if (nextIndex === undefined) {
      return
    }
    event.preventDefault()
    onSelect(tabs[nextIndex])
    tabReferences.current[nextIndex]?.focus()
  }

  return (
    <div className="px-4 pt-2 mb-2">
      <div
        role="tablist"
        aria-label={label}
        className="flex space-x-6 border-b border-gray-200 dark:border-gray-800"
      >
        {tabs.map((tab, index) => (
          <button
            type="button"
            key={tab}
            role="tab"
            id={`tab-${tab}`}
            aria-selected={activeTab === tab}
            aria-controls={panelId}
            tabIndex={activeTab === tab ? 0 : -1}
            ref={(element) => {
              tabReferences.current[index] = element
            }}
            onClick={() => onSelect(tab)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            className={`pb-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "text-orange-500 border-b-2 border-orange-500"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {labels[tab]}
          </button>
        ))}
      </div>
    </div>
  )
}
