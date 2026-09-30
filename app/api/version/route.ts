import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The version that is live right now; the app compares it with the version it is running. */
export function GET() {
  return NextResponse.json({ build: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}
