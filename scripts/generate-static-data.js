#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

async function generateStaticData() {
  const dataDir = path.join(process.cwd(), 'data')
  
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  try {
    // Fetch current weather data
    console.log('Fetching current weather data...')
    const currentResponse = await fetch('http://localhost:8080/')
    const currentBody = await currentResponse.json()
    
    fs.writeFileSync(
      path.join(dataDir, 'current.json'),
      JSON.stringify({ data: currentBody.data }, null, 2)
    )
    console.log('✓ Generated current.json')

    // Fetch daily data
    console.log('Fetching daily weather data...')
    const dailyResponse = await fetch(
      'http://localhost:8080/daily.json?tz=America/Los_Angeles&q=min_outTemp&q=max_outTemp' + 
      '&q=avg_outTemp&q=min_outHumi&q=avg_outHumi&q=max_outHumi&q=max_gustspeed&q=avg_avgwind' + 
      '&q=avg_uvi&q=avg_solarrad&q=avg_rainofhourly&q=min_avgwind&q=max_avgwind' +
      '&q=min_uvi&q=max_uvi&q=min_solarrad&q=max_solarrad'
    )
    const dailyBody = await dailyResponse.json()
    
    fs.writeFileSync(
      path.join(dataDir, 'daily.json'),
      JSON.stringify({ data: dailyBody.data }, null, 2)
    )
    console.log('✓ Generated daily.json')

    // Generate hourly data for recent dates
    const dates = generateRecentDates(7) // Last 7 days
    
    for (const date of dates) {
      console.log(`Fetching hourly data for ${date}...`)
      try {
        const hourlyResponse = await fetch(
          `http://localhost:8080/hourly.json?tz=America/Los_Angeles&date=${date}` + 
          '&q=min_outTemp&q=max_outTemp&q=min_outHumi&q=max_outHumi&q=max_gustspeed&q=avg_avgwind&' + 
          'q=max_gustspeed&q=avg_rainofhourly&q=avg_outHumi&q=avg_outTemp&q=avg_uvi&q=avg_solarrad' +
          '&q=min_avgwind&q=max_avgwind&q=min_uvi&q=max_uvi&q=min_solarrad&q=max_solarrad'
        )
        
        if (hourlyResponse.ok) {
          const hourlyBody = await hourlyResponse.json()
          fs.writeFileSync(
            path.join(dataDir, `hourly-${date}.json`),
            JSON.stringify({ data: hourlyBody.data }, null, 2)
          )
          console.log(`✓ Generated hourly-${date}.json`)
        } else {
          console.log(`⚠ No data available for ${date}`)
        }
      } catch (error) {
        console.log(`⚠ Error fetching data for ${date}:`, error.message)
      }
    }

    console.log('\n✅ Static data generation complete!')
    console.log('Files generated in:', dataDir)
    
  } catch (error) {
    console.error('Error generating static data:', error)
    process.exit(1)
  }
}

function generateRecentDates(days) {
  const dates = []
  const today = new Date()
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    dates.push(date.toISOString().split('T')[0])
  }
  
  return dates
}

// Run if called directly
if (require.main === module) {
  generateStaticData()
}

module.exports = { generateStaticData }