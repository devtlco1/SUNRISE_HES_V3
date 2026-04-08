import { OperationalAlarmsClient } from "@/components/alarms/operational-alarms-client"
import { PageHeader } from "@/components/shared/page-header"

export default function AlarmsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Alarms"
        subtitle="Operational conditions derived from connectivity history and command runs. Notification preferences control the header bell only."
      />
      <OperationalAlarmsClient />
    </div>
  )
}
