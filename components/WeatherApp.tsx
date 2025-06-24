"use client"

import React, { useState } from 'react';
import { Search, Settings, MapPin, Clock, Eye, Wind, Droplets, Sun, Cloud, CloudRain, CloudSnow, Umbrella } from 'lucide-react';

interface WeatherData {
  inTemp: number | null;
  inHumi: number | null;
  AbsPress: number | null;
  RelPress: number | null;
  outTemp: number;
  outHumi: number;
  windir: number;
  avgwind: number;
  gustspeed: number;
  dailygust: number;
  solarrad: number;
  uv: number;
  uvi: number;
  pm25: number | null;
  rainofhourly: number;
  eventrain: number;
}

interface DayForecast {
  day: string;
  icon: string;
  precipChance: number;
  lowTemp: number;
  highTemp: number;
  date: string;
  description: string;
  hourlyData: HourlyData[];
}

interface HourlyData {
  time: string;
  temp: number;
  condition: string;
  precipChance: number;
  precipIntensity: number; // 0-1 scale for color intensity
}

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

const WeatherIcon = ({ type, size = 24 }: { type: string; size?: number }) => {
  const iconProps = { size, className: "text-orange-500" };
  
  switch (type) {
    case 'sunny':
      return <Sun {...iconProps} className="text-yellow-500" />;
    case 'partly-cloudy':
      return <Cloud {...iconProps} className="text-gray-500" />;
    case 'rainy':
      return <Umbrella {...iconProps} className="text-blue-500" />;
    case 'snowy':
      return <CloudSnow {...iconProps} className="text-blue-300" />;
    default:
      return <Sun {...iconProps} />;
  }
};

const TemperatureBar = ({ low, high, minTemp = 70, maxTemp = 95 }: { low: number; high: number; minTemp?: number; maxTemp?: number }) => {
  const range = maxTemp - minTemp;
  const lowPercent = ((low - minTemp) / range) * 100;
  const highPercent = ((high - minTemp) / range) * 100;
  const barWidth = highPercent - lowPercent;
  
  return (
    <div className="flex items-center space-x-2 flex-1">
      <span className="text-sm font-medium text-gray-700 w-8 text-right">{low}°</span>
      <div className="relative flex-1 h-1 bg-gray-200 rounded-full">
        <div 
          className="absolute h-full bg-gradient-to-r from-blue-400 to-orange-400 rounded-full"
          style={{
            left: `${lowPercent}%`,
            width: `${barWidth}%`
          }}
        />
      </div>
      <span className="text-sm font-medium text-gray-900 w-8">{high}°</span>
    </div>
  );
};

const HourlyRow = ({ hour, minTemp = 70, maxTemp = 95 }: { hour: HourlyData; minTemp?: number; maxTemp?: number }) => {
  // Calculate temperature position (0-100%)
  const tempRange = maxTemp - minTemp;
  const tempPosition = ((hour.temp - minTemp) / tempRange) * 100;
  
  // Calculate rain color intensity
  const getRainColor = (intensity: number) => {
    if (intensity === 0) return 'bg-gray-200';
    if (intensity <= 0.2) return 'bg-blue-200';
    if (intensity <= 0.4) return 'bg-blue-300';
    if (intensity <= 0.6) return 'bg-blue-400';
    if (intensity <= 0.8) return 'bg-blue-500';
    return 'bg-blue-600';
  };
  
  return (
    <div className="flex items-center border-b border-gray-100 last:border-b-0 relative">
      {/* Rain intensity bar */}
      <div className={`w-1 h-full absolute left-0 ${getRainColor(hour.precipIntensity)}`} />
      
      <div className="flex items-center w-full pl-4 pr-4 py-3">
        <div className="w-16 text-sm font-semibold text-gray-900">
          {hour.time}
        </div>
        
        <div className="flex-1 px-3">
          {hour.condition && (
            <div className="text-sm text-gray-700 mb-1">{hour.condition}</div>
          )}
          {hour.precipChance > 0 && (
            <div className="text-xs text-gray-500">({hour.precipChance}%)</div>
          )}
        </div>
        
        {/* Temperature positioning area */}
        <div className="relative w-24 h-12 flex items-center">
          <div 
            className="absolute w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center transition-all duration-300"
            style={{ left: `${Math.max(0, Math.min(56, (tempPosition / 100) * 56))}px` }}
          >
            <span className="text-white text-sm font-medium">{hour.temp}°</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function WeatherApp() {
  const [activeTab, setActiveTab] = useState('TEMP');
  const [activeNavItem, setActiveNavItem] = useState('Forecast');
  const [expandedDayIndex, setExpandedDayIndex] = useState<number | null>(null);
  
  const tabs = ['TEMP (°F)', 'FEELS-LIKE (°F)', 'PRECIP (%)', 'WIND (MPH)'];
  const navItems = ['Forecast', 'Map', 'Notifications', 'Report'];

  const handleDayClick = (index: number) => {
    setExpandedDayIndex(expandedDayIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-gray-50 max-w-sm mx-auto relative">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center space-x-3">
          <Search size={20} className="text-gray-600" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Lassen, LA</h1>
          </div>
        </div>
        <Settings size={20} className="text-gray-600" />
      </div>

      {/* Navigation Tabs */}
      <div className="px-4 mb-4">
        <div className="flex space-x-6 border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab.split(' ')[0])}
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === tab.split(' ')[0]
                  ? 'text-orange-500 border-b-2 border-orange-500'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Sunrise Info */}
      <div className="px-4 py-3 text-center">
        <div className="flex items-center justify-center space-x-2">
          <Sun size={16} className="text-orange-500" />
          <span className="text-gray-700">Sunrise 8½ hours (6:41 AM)</span>
        </div>
      </div>

      {/* Current Weather Stats */}
      <div className="px-4 py-2 bg-white mx-4 rounded-lg shadow-sm mb-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{mockWeatherData.outTemp}°</div>
            <div className="text-sm text-gray-500">Temperature</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-500">{mockWeatherData.outHumi}%</div>
            <div className="text-sm text-gray-500">Humidity</div>
          </div>
        </div>
      </div>

      {/* Weekly Forecast */}
      <div className="px-4">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Next 7 Days</h2>
        <p className="text-gray-600 text-sm mb-4 italic">
          Light rain throughout the week, with high temperatures rising to 90°F tomorrow.
        </p>
        
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {weeklyForecast.map((day, index) => (
            <div key={index}>
              <button
                onClick={() => handleDayClick(index)}
                className="w-full flex items-center px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <div className="w-12 text-sm font-semibold text-gray-900">
                  {day.day}
                </div>
                
                <div className="flex items-center space-x-3 w-20">
                  <div className="flex items-center space-x-1">
                    <Droplets size={12} className="text-blue-400" />
                    <span className="text-sm text-blue-500 font-medium">{day.precipChance}%</span>
                  </div>
                  <WeatherIcon type={day.icon} size={20} />
                </div>
                
                <TemperatureBar low={day.lowTemp} high={day.highTemp} />
              </button>
              
              {/* Expanded Hourly View */}
              <div className={`overflow-hidden transition-all duration-500 ease-in-out ${
                expandedDayIndex === index ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
              }`}>
                {expandedDayIndex === index && day.hourlyData.length > 0 && (
                  <div className="bg-gray-50 border-t border-gray-200">
                    {/* Day Header */}
                    <div className="px-4 py-3 border-b border-gray-200">
                      <div className="text-sm font-semibold text-gray-900 mb-1">
                        {day.date}
                      </div>
                      <div className="text-xs text-gray-600 italic">
                        High: {day.highTemp}° Low: {day.lowTemp}°. {day.description}
                      </div>
                    </div>
                    
                    {/* Hourly Data */}
                    <div className="bg-white">
                      {day.hourlyData.map((hour, hourIndex) => (
                        <HourlyRow key={hourIndex} hour={hour} />
                      ))}
                    </div>
                    
                    {/* Sunrise/Sunset */}
                    <div className="px-4 py-3 text-center text-sm text-gray-600 border-t border-gray-200">
                      Sunrise 6:37 AM; Sunset 7:27 PM
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-sm bg-white border-t border-gray-200">
        <div className="flex justify-around py-2">
          {navItems.map((item) => {
            const IconComponent = item === 'Forecast' ? Eye : 
                                item === 'Map' ? MapPin : 
                                item === 'Notifications' ? Clock : 
                                Wind;
            
            return (
              <button
                key={item}
                onClick={() => setActiveNavItem(item)}
                className={`flex flex-col items-center py-2 px-4 transition-colors ${
                  activeNavItem === item
                    ? 'text-blue-500'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <IconComponent size={20} />
                <span className="text-xs mt-1">{item}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom padding to account for fixed navigation */}
      <div className="h-16"></div>
    </div>
  );
}