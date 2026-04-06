import { isDevRuntimeHarnessAllowed } from "@/lib/dev/runtime-harness-allowed"
import { DevRuntimeHarnessClient } from "@/components/dev/dev-runtime-harness"

export const dynamic = "force-dynamic"

export default function DevRuntimePage() {
  if (!isDevRuntimeHarnessAllowed()) {
    return (
      <div className="space-y-2 font-mono text-sm text-muted-foreground">
        <p className="text-foreground">Runtime test harness disabled</p>
        <p>
          It runs in <code className="rounded bg-muted px-1">NODE_ENV=development</code>{" "}
          or when{" "}
          <code className="rounded bg-muted px-1">ALLOW_DEV_RUNTIME_HARNESS=1</code> is
          set (then restart the server).
        </p>
      </div>
    )
  }

  return <DevRuntimeHarnessClient />
}
