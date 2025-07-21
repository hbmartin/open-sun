import { z } from "zod"

export const CurrentWeatherApiResponseSchema = z.object({
    data: z.object({
      inTemp: z.number().nullable(),
      inHumi: z.number().nullable(),
      AbsPress: z.number().nullable(),
      RelPress: z.number().nullable(),
      outTemp: z.number(),
      outHumi: z.number(),
      windir: z.number(),
      avgwind: z.number(),
      gustspeed: z.number(),
      dailygust: z.number(),
      solarrad: z.number(),
      uv: z.number(),
      uvi: z.number(),
      pm25: z.number().nullable(),
      rainofhourly: z.number(),
      eventrain: z.number(),
    }),
  })
  
  export const HourlyApiResponseSchema = z.object({
    data: z.record(
      z.string(),
      z.array(
        z.object({
          date: z.string(),
          hour: z.string(),
          min_outTemp: z.number(),
          avg_outTemp: z.number(),
          max_outTemp: z.number(),
          min_outHumi: z.number(),
          avg_outHumi: z.number(),
          max_outHumi: z.number(),
          max_gustspeed: z.number(),
          min_avgwind: z.number(),
          max_avgwind: z.number(),
          avg_avgwind: z.number(),
          avg_rainofhourly: z.number(),
          avg_uvi: z.number(),
          avg_solarrad: z.number(),
          min_uvi: z.number(),
          max_uvi: z.number(),
          min_solarrad: z.number(),
          max_solarrad: z.number(),
        }).nullable(),
      ),
    ),
  })

export const DailyApiResponseSchema = z.object({
    data: z.array(z.object({
      date: z.string(),
      min_outTemp: z.number(),
      avg_outTemp: z.number(),
      max_outTemp: z.number(),
      min_outHumi: z.number(),
      avg_outHumi: z.number(),
      max_outHumi: z.number(),
      max_gustspeed: z.number(),
      min_avgwind: z.number(),
      max_avgwind: z.number(),
      avg_avgwind: z.number(),
      avg_rainofhourly: z.number(),
      avg_uvi: z.number(),
      avg_solarrad: z.number(),
      min_uvi: z.number(),
      max_uvi: z.number(),
      min_solarrad: z.number(),
      max_solarrad: z.number(),
    })),
  })