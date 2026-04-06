import { MetersList } from "@/components/meters/meters-list"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { mockMeterListRows } from "@/lib/mock/meters"

const useMockMeters = process.env.NEXT_PUBLIC_METERS_USE_MOCK === "true"

export default function MetersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Meters"
        subtitle={
          useMockMeters
            ? "Static catalog (mock mode). Clear NEXT_PUBLIC_METERS_USE_MOCK to use the read-only /api/meters feed."
            : "Read-only meter registry from /api/meters. Search and filters run in the browser; no writes or realtime."
        }
        actions={
          <>
            <Button type="button" size="sm" variant="outline" disabled>
              Export (mock)
            </Button>
            <Button type="button" size="sm" disabled>
              Add meter (mock)
            </Button>
          </>
        }
      />

      <MetersList rows={useMockMeters ? mockMeterListRows : undefined} />
    </div>
  )
}
