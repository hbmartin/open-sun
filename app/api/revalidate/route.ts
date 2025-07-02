import { NextRequest, NextResponse } from "next/server"
import { revalidatePath, revalidateTag } from "next/cache"
import { writeFileSync } from "fs"
import { join } from "path"

export async function POST(request: NextRequest) {
  const secret = request.headers.get("Authorization")?.replace("Bearer ", "")
  
  if (!secret || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ message: "Invalid secret" }, { status: 401 })
  }

  try {
    const body = await request.json()
    // Example of basic validation, consider a schema validation library for robust checks
    if (!body || typeof body.type !== 'string' || !body.data) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 })
    }
    const { type, date, data } = body

    // Write static data files
    const dataDir = join(process.cwd(), "data")
    
    switch (type) {
      case "current":
        await writeFileSync(
          join(dataDir, "current.json"),
          JSON.stringify({ data }, null, 2)
        )
        revalidateTag("current-weather")
        break
        
      case "daily":
        await writeFileSync(
          join(dataDir, "daily.json"),
          JSON.stringify({ data }, null, 2)
        )
        revalidateTag("daily-weather")
        break
        
      case "hourly":
        if (typeof date !== 'string' || !date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return NextResponse.json({ message: "Invalid or missing date for hourly data. Expected YYYY-MM-DD format." }, { status: 400 })
        }
        writeFileSync(
          join(dataDir, `hourly-${date}.json`),
          JSON.stringify({ data }, null, 2)
        )
        revalidateTag(`hourly-weather-${date}`)
        break
        
      default:
        return NextResponse.json({ message: "Invalid type" }, { status: 400 })
    }

    // Revalidate all weather pages
    revalidatePath("/")
    
    return NextResponse.json({ 
      message: "Revalidated successfully",
      type,
      date: date || null,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error("Revalidation error:", error)
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    )
  }
}