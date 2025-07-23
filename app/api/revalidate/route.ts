import { NextRequest, NextResponse } from "next/server";

const REVALIDATE_SECRET = process.env["REVALIDATE_SECRET"];

export async function POST(req: NextRequest) {
  // Prevent caching
  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };

  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  if (!secret || secret !== REVALIDATE_SECRET) {
    return NextResponse.json({ message: "Invalid secret" }, { status: 401, headers });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400, headers });
  }

  const { type, date } = body;
  // Here you would trigger revalidation logic, e.g. revalidateTag or revalidatePath
  // For now, just return a success response as a placeholder
  return NextResponse.json({
    message: "Revalidated successfully",
    type,
    date: date ?? null,
    timestamp: new Date().toISOString(),
  }, { status: 200, headers });
} 