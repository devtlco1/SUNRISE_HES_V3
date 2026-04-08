import { NextResponse } from "next/server"

import { hasPermission } from "@/lib/rbac/resolve"
import { getRbacSession } from "@/lib/rbac/session-server"
import type { RbacSessionPayload } from "@/types/rbac"

export type ApiPermissionResult =
  | { ok: true; session: RbacSessionPayload }
  | { ok: false; response: NextResponse }

export async function requireApiPermission(key: string): Promise<ApiPermissionResult> {
  const session = await getRbacSession()
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
    }
  }
  const set = new Set(session.permissions)
  if (!hasPermission(set, key)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "FORBIDDEN", requiredPermission: key },
        { status: 403 }
      ),
    }
  }
  return { ok: true, session }
}
