import { Rss, Sunrise, Sunset } from "lucide-react"
import type React from "react"
import { useMemo } from "react"
import type { TimesData } from "@/lib/types"
import { getSunTimes } from "@/lib/utils"

export default function SunInfo(): React.JSX.Element {
  const loadTime = useMemo(() => {
    const now = new Date()
    const hours = now.getHours() % 12 || 12
    const minutes = now.getMinutes().toString().padStart(2, "0")
    const period = now.getHours() >= 12 ? "PM" : "AM"
    return `${hours}:${minutes} ${period}`
  }, [])

  const timesData: TimesData = getSunTimes(new Date())

  return (
    <div className="px-4 py-3 text-center">
      <div className="flex items-center justify-center">
        <Sunrise size={16} className="text-orange-600 mr-2" />
        <span className="text-gray-700 mr-4">
          {timesData.dawn.getHours()}:{timesData.dawn.getMinutes()} AM
        </span>
        <Rss size={16} className="text-gray-800 mr-2" />
        <span className="text-gray-700 mr-4">{loadTime}</span>
        <Sunset size={16} className="text-purple-800 mr-2" />
        <span className="text-gray-700">
          {timesData.dusk.getHours()}:{timesData.dusk.getMinutes()} PM
        </span>
      </div>
    </div>
  )
}
