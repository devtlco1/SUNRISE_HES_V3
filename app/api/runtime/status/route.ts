import { getRuntimeAdapterPublicStatus } from "@/lib/runtime/adapter-mode"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Read-only adapter status for developer tooling (no secrets).
 */
export async function GET() {
  const body = getRuntimeAdapterPublicStatus()
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  })
}
