import { MetersPageClient } from "@/components/meters/meters-page-client"

const useMockMeters = process.env.NEXT_PUBLIC_METERS_USE_MOCK === "true"

export default function MetersPage() {
  return <MetersPageClient useMockMeters={useMockMeters} />
}
