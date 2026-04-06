import { MetersList } from "@/components/meters/meters-list"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"

export default function MetersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Meters"
        subtitle="Installed meter registry with communication, relay, and alarm context. Data is mock; filters run client-side only."
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

      <MetersList />
    </div>
  )
}
