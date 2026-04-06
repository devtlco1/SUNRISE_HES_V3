import { handleRuntimePost } from "@/lib/runtime/post-action"

export async function POST(req: Request) {
  return handleRuntimePost(req, (adapter, body) => adapter.probeConnection(body))
}
