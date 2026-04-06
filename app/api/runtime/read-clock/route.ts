import { handleRuntimePost } from "@/lib/runtime/post-action"

export const runtime = "nodejs"

export async function POST(req: Request) {
  return handleRuntimePost(req, (adapter, body) => adapter.readClock(body))
}
