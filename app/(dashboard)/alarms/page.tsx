import { AlarmsList } from "@/components/alarms/alarms-list"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"

export default function AlarmsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Alarms"
        subtitle="Review and triage alarms by severity, state, and ownership. The feed is mock; there is no realtime pipeline in this build."
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
