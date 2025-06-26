import type { DayData, Ranges, WeatherData, WeekData } from "./types.ts"

function getAbbreviatedDay(dateString: string): string {
    const date = new Date(dateString);
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    return days[date.getDay()];
}


export async function fetchCurrentWeatherData(): Promise<WeatherData> {
    const response = await fetch("http://localhost:8080/")
    const body = await response.json()
    return body.data
}

export async function fetchLastWeekData(): Promise<WeekData> {
    const response = await fetch("http://localhost:8080/daily?q=min_outTemp&q=max_outTemp&q=min_outHumi&q=max_outHumi&q=max_gustspeed&q=avg_avgwind&q=max_gustspeed&q=avg_rainofhourly")
    const body = await response.json()
    const data: DayData[] = body.data.map((item: any) => ({
        day: getAbbreviatedDay(item.date),
        date: item.date,
        icon: "partly-cloudy",
        precipChance: 50,
        min_outTemp: item.min_outTemp,
        max_outTemp: item.max_outTemp,
        min_outHumi: item.min_outHumi,
        max_outHumi: item.max_outHumi,
        max_gustspeed: item.max_gustspeed,
        avg_avgwind: item.avg_avgwind,
        avg_rainofhourly: item.avg_rainofhourly,
        description: "Description",
        hourlyData: [],
    }))
    const ranges: Ranges = {
        min_outTemp: Math.min(...data.map(d => d.min_outTemp)),
        max_outTemp: Math.max(...data.map(d => d.max_outTemp)),
        min_outHumi: Math.min(...data.map(d => d.min_outHumi)),
        max_outHumi: Math.max(...data.map(d => d.max_outHumi)),
        max_gustspeed: Math.max(...data.map(d => d.max_gustspeed)),
    };

    return { data: data.reverse(), ranges }
}
