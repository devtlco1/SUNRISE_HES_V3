import { AlarmsList } from "@/components/alarms/alarms-list"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { mockAlarmListRows } from "@/lib/mock/alarms"

const useMockAlarms = process.env.NEXT_PUBLIC_ALARMS_USE_MOCK === "true"

export default function AlarmsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Alarms"
        subtitle={
          useMockAlarms
            ? "Static catalog (mock mode). Clear NEXT_PUBLIC_ALARMS_USE_MOCK to use the read-only /api/alarms feed."
            : "Read-only alarm queue from /api/alarms. Search and filters run in the browser; no realtime pipeline in this build."
        }
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

      <AlarmsList rows={useMockAlarms ? mockAlarmListRows : undefined} />
    </div>
  )
}
