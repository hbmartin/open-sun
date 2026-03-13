import type { NextRequest} from "next/server"
import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"

// biome-ignore lint/complexity/useLiteralKeys: env
const REVALIDATE_SECRET = process.env["REVALIDATE_SECRET"]

// Vercel cron jobs only support GET requests, so we support both GET (for cron) and POST (for manual/secure triggers)

export async function GET(req: NextRequest) {
  // Prevent caching
  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  }

  const { searchParams } = new URL(req.url)
  const secret = searchParams.get("secret")
  if (!secret || secret !== REVALIDATE_SECRET) {
    return NextResponse.json({ message: "Invalid secret" }, { status: 401, headers })
  }
  revalidatePath("/", "layout")
  return NextResponse.json({
    message: "Revalidated successfully (GET)",
    timestamp: new Date().toISOString(),
  }, { status: 200, headers })
} 