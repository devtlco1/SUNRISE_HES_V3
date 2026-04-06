# `lib/jobs`

Placeholder for **async meter read / command** orchestration.

- **Now:** `foundation.ts` exports domain types only.
- **Later:** enqueue from Next.js server actions or a dedicated worker; consume in **Python** (protocol runtime) or a queue worker process.

Do not add Redis or job runners here until the sidecar read path is proven on hardware.
