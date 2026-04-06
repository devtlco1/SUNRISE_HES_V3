import { MetersList } from "@/components/meters/meters-list"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"

export default function MetersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Meters"
        subtitle="Fleet registry with communication, relay, and alarm context — mock data and client-side filters only."
        actions={
          <>
            <Button type="button" size="sm" variant="outline">
              Export
            </Button>
            <Button type="button" size="sm">
              Add meter
            </Button>
          </>
        }
      />

      <MetersList />
    </div>
  )
}
