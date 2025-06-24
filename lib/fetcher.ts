import type { DayForecast, WeatherData } from "./types";


const mockWeatherData: WeatherData = {
    inTemp: null,
    inHumi: null,
    AbsPress: null,
    RelPress: null,
    outTemp: 84.0,
    outHumi: 21.0,
    windir: 303.0,
    avgwind: 0.0,
    gustspeed: 0.0,
    dailygust: 3.4,
    solarrad: 748.7,
    uv: 2847.0,
    uvi: 7.0,
    pm25: null,
    rainofhourly: 0.0,
    eventrain: 0.0
  };
  
  const weeklyForecast: DayForecast[] = [
    { 
      day: 'TUE', 
      icon: 'partly-cloudy', 
      precipChance: 56, 
      lowTemp: 78, 
      highTemp: 86,
      date: 'Tuesday, August 30, 2005',
      description: 'Light rain throughout the day, with high temperatures rising to 86°F.',
      hourlyData: [
        { time: '12 AM', temp: 79, condition: 'Light Rain and Breezy', precipChance: 100, precipIntensity: 0.6 },
        { time: '2 AM', temp: 78, condition: 'Heavy Rain and Breezy', precipChance: 100, precipIntensity: 0.8 },
        { time: '4 AM', temp: 77, condition: 'Heavy Rain and Windy', precipChance: 100, precipIntensity: 0.9 },
        { time: '6 AM', temp: 77, condition: 'Heavy Rain and Dangerously Windy...', precipChance: 100, precipIntensity: 1.0 },
        { time: '8 AM', temp: 77, condition: '', precipChance: 95, precipIntensity: 0.8 },
        { time: '10 AM', temp: 76, condition: '', precipChance: 90, precipIntensity: 0.7 },
        { time: '12 PM', temp: 75, condition: 'Heavy Rain and Breezy', precipChance: 100, precipIntensity: 0.9 },
        { time: '2 PM', temp: 75, condition: '', precipChance: 85, precipIntensity: 0.6 },
        { time: '4 PM', temp: 78, condition: 'Heavy Rain', precipChance: 100, precipIntensity: 0.8 },
        { time: '6 PM', temp: 81, condition: 'Humid and Partly Cloudy', precipChance: 20, precipIntensity: 0.2 },
        { time: '8 PM', temp: 81, condition: '', precipChance: 15, precipIntensity: 0.1 },
        { time: '10 PM', temp: 80, condition: '', precipChance: 10, precipIntensity: 0.1 }
      ]
    },
    { 
      day: 'WED', 
      icon: 'partly-cloudy', 
      precipChance: 60, 
      lowTemp: 74, 
      highTemp: 90,
      date: 'Wednesday, August 31, 2005',
      description: 'Partly cloudy with occasional showers, temperatures reaching 90°F.',
      hourlyData: [
        { time: '12 AM', temp: 79, condition: 'Clear', precipChance: 5, precipIntensity: 0.1 },
        { time: '2 AM', temp: 78, condition: 'Clear', precipChance: 5, precipIntensity: 0.1 },
        { time: '4 AM', temp: 76, condition: 'Partly Cloudy', precipChance: 15, precipIntensity: 0.2 },
        { time: '6 AM', temp: 75, condition: 'Partly Cloudy', precipChance: 20, precipIntensity: 0.2 },
        { time: '8 AM', temp: 78, condition: 'Light Rain', precipChance: 60, precipIntensity: 0.4 },
        { time: '10 AM', temp: 82, condition: 'Light Rain', precipChance: 65, precipIntensity: 0.5 },
        { time: '12 PM', temp: 86, condition: 'Partly Cloudy', precipChance: 30, precipIntensity: 0.3 },
        { time: '2 PM', temp: 90, condition: 'Sunny', precipChance: 10, precipIntensity: 0.1 },
        { time: '4 PM', temp: 88, condition: 'Partly Cloudy', precipChance: 25, precipIntensity: 0.2 },
        { time: '6 PM', temp: 85, condition: 'Light Rain', precipChance: 55, precipIntensity: 0.4 },
        { time: '8 PM', temp: 82, condition: 'Clear', precipChance: 15, precipIntensity: 0.1 },
        { time: '10 PM', temp: 80, condition: 'Clear', precipChance: 10, precipIntensity: 0.1 }
      ]
    },
    { 
      day: 'THU', 
      icon: 'rainy', 
      precipChance: 88, 
      lowTemp: 77, 
      highTemp: 88,
      date: 'Thursday, September 1, 2005',
      description: 'Heavy rain expected throughout the day with strong winds.',
      hourlyData: [
        { time: '12 AM', temp: 78, condition: 'Light Rain', precipChance: 70, precipIntensity: 0.5 },
        { time: '2 AM', temp: 77, condition: 'Heavy Rain', precipChance: 90, precipIntensity: 0.8 },
        { time: '4 AM', temp: 77, condition: 'Heavy Rain', precipChance: 95, precipIntensity: 0.9 },
        { time: '6 AM', temp: 78, condition: 'Heavy Rain and Windy', precipChance: 100, precipIntensity: 1.0 },
        { time: '8 AM', temp: 79, condition: 'Heavy Rain', precipChance: 95, precipIntensity: 0.9 },
        { time: '10 AM', temp: 81, condition: 'Heavy Rain', precipChance: 90, precipIntensity: 0.8 },
        { time: '12 PM', temp: 84, condition: 'Heavy Rain', precipChance: 88, precipIntensity: 0.8 },
        { time: '2 PM', temp: 86, condition: 'Heavy Rain', precipChance: 85, precipIntensity: 0.7 },
        { time: '4 PM', temp: 88, condition: 'Light Rain', precipChance: 75, precipIntensity: 0.6 },
        { time: '6 PM', temp: 85, condition: 'Light Rain', precipChance: 65, precipIntensity: 0.5 },
        { time: '8 PM', temp: 82, condition: 'Partly Cloudy', precipChance: 40, precipIntensity: 0.3 },
        { time: '10 PM', temp: 80, condition: 'Partly Cloudy', precipChance: 30, precipIntensity: 0.2 }
      ]
    },
    { day: 'FRI', icon: 'partly-cloudy', precipChance: 41, lowTemp: 76, highTemp: 90, date: 'Friday, September 2, 2005', description: 'Partly cloudy with scattered showers.', hourlyData: [] },
    { day: 'SAT', icon: 'sunny', precipChance: 26, lowTemp: 77, highTemp: 88, date: 'Saturday, September 3, 2005', description: 'Mostly sunny with light clouds.', hourlyData: [] },
    { day: 'SUN', icon: 'rainy', precipChance: 44, lowTemp: 76, highTemp: 88, date: 'Sunday, September 4, 2005', description: 'Light rain in the afternoon.', hourlyData: [] },
    { day: 'MON', icon: 'rainy', precipChance: 52, lowTemp: 74, highTemp: 87, date: 'Monday, September 5, 2005', description: 'Rainy day with moderate temperatures.', hourlyData: [] },
    { day: 'TUE', icon: 'partly-cloudy', precipChance: 38, lowTemp: 74, highTemp: 86, date: 'Tuesday, September 6, 2005', description: 'Partly cloudy with occasional sun breaks.', hourlyData: [] }
  ];

  export async function fetchCurrentWeatherData() {
    return mockWeatherData;
  }

  export async function fetchLastWeekData() {
    return weeklyForecast;
  }