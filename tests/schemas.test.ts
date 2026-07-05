import {
  CurrentWeatherApiResponseSchema,
  DailyApiResponseSchema,
  HourlyApiResponseSchema,
} from "@/lib/schemas"

describe("CurrentWeatherApiResponseSchema", () => {
  const validData = {
    data: {
      inTemp: 72.5,
      inHumi: 45,
      AbsPress: 29.92,
      RelPress: 30.1,
      outTemp: 68.3,
      outHumi: 55,
      windir: 180,
      avgwind: 5.2,
      gustspeed: 12.1,
      dailygust: 18.5,
      solarrad: 450,
      uv: 3.2,
      uvi: 4,
      pm25: 8.5,
      rainofhourly: 0,
      eventrain: 0,
    },
  }

  it("parses valid current weather data", () => {
    const result = CurrentWeatherApiResponseSchema.parse(validData)
    expect(result.data.outTemp).toBe(68.3)
    expect(result.data.outHumi).toBe(55)
  })

  it("allows nullable fields to be null", () => {
    const data = {
      data: {
        ...validData.data,
        inTemp: null,
        inHumi: null,
        AbsPress: null,
        RelPress: null,
        pm25: null,
      },
    }
    const result = CurrentWeatherApiResponseSchema.parse(data)
    expect(result.data.inTemp).toBeNull()
    expect(result.data.pm25).toBeNull()
  })

  it("rejects missing required fields", () => {
    const { outTemp: _, ...incomplete } = validData.data
    expect(() =>
      CurrentWeatherApiResponseSchema.parse({ data: incomplete }),
    ).toThrow()
  })
})

describe("DailyApiResponseSchema", () => {
  const validItem = {
    date: "2025-07-01",
    min_outTemp: 60,
    avg_outTemp: 72,
    max_outTemp: 85,
    min_outHumi: 30,
    avg_outHumi: 50,
    max_outHumi: 70,
    max_gustspeed: 15,
    min_avgwind: 2,
    max_avgwind: 10,
    avg_avgwind: 5,
    avg_rainofhourly: 0,
    avg_uvi: 6,
    avg_solarrad: 600,
    min_uvi: 0,
    max_uvi: 10,
    min_solarrad: 0,
    max_solarrad: 900,
  }

  it("parses valid daily data", () => {
    const result = DailyApiResponseSchema.parse({ data: [validItem] })
    expect(result.data).toHaveLength(1)
    expect(result.data[0].date).toBe("2025-07-01")
  })

  it("parses multiple days", () => {
    const result = DailyApiResponseSchema.parse({
      data: [validItem, { ...validItem, date: "2025-07-02" }],
    })
    expect(result.data).toHaveLength(2)
  })

  it("rejects non-number fields", () => {
    expect(() =>
      DailyApiResponseSchema.parse({
        data: [{ ...validItem, min_outTemp: "not a number" }],
      }),
    ).toThrow()
  })
})

describe("HourlyApiResponseSchema", () => {
  const validHourItem = {
    date: "2025-07-01",
    hour: "14",
    min_outTemp: 70,
    avg_outTemp: 75,
    max_outTemp: 80,
    min_outHumi: 40,
    avg_outHumi: 50,
    max_outHumi: 60,
    max_gustspeed: 10,
    min_avgwind: 3,
    max_avgwind: 8,
    avg_avgwind: 5,
    avg_rainofhourly: 0,
    avg_uvi: 5,
    avg_solarrad: 500,
    min_uvi: 3,
    max_uvi: 7,
    min_solarrad: 300,
    max_solarrad: 700,
  }

  it("parses valid hourly data grouped by date", () => {
    const result = HourlyApiResponseSchema.parse({
      data: { "2025-07-01": [validHourItem] },
    })
    expect(result.data["2025-07-01"]).toHaveLength(1)
  })

  it("allows null entries in hourly arrays", () => {
    const result = HourlyApiResponseSchema.parse({
      data: { "2025-07-01": [validHourItem, null] },
    })
    expect(result.data["2025-07-01"]).toHaveLength(2)
    expect(result.data["2025-07-01"][1]).toBeNull()
  })

  it("handles multiple dates", () => {
    const result = HourlyApiResponseSchema.parse({
      data: {
        "2025-07-01": [validHourItem],
        "2025-07-02": [{ ...validHourItem, date: "2025-07-02" }],
      },
    })
    expect(Object.keys(result.data)).toHaveLength(2)
  })
})
