import { AlarmsList } from "@/components/alarms/alarms-list"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"

export default function AlarmsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Alarms"
        subtitle="Monitor, filter, and triage fleet alarms — mock feed only; no realtime or backend integration."
        actions={
          <>
            <Button type="button" size="sm" variant="outline" disabled>
              Alarm policies (mock)
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled>
              Subscription rules (mock)
            </Button>
          </>
        }
      />

      <AlarmsList />
    </div>
  )
}
