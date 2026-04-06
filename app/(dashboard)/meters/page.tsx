import { MetersList } from "@/components/meters/meters-list"
import { PageHeader } from "@/components/shared/page-header"
import { mockMeterListRows } from "@/lib/mock/meters"
import Link from "next/link"

const useMockMeters = process.env.NEXT_PUBLIC_METERS_USE_MOCK === "true"

export default function MetersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Meters"
        subtitle={
          useMockMeters
            ? "Mock catalog (NEXT_PUBLIC_METERS_USE_MOCK)."
            : "Registry from data/meters.json. Primary key: serial number."
        }
        actions={
          <Link
            href="/scanner"
            className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted"
          >
            Scanner
          </Link>
        }
      />

      <MetersList rows={useMockMeters ? mockMeterListRows : undefined} />
    </div>
  )
}
