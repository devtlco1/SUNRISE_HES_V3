import { OperationalAlarmsClient } from "@/components/alarms/operational-alarms-client"
import { PagePermissionGate } from "@/components/rbac/page-permission-gate"
import { PageHeader } from "@/components/shared/page-header"

export default function AlarmsPage() {
  return (
    <PagePermissionGate permission="alarms.view" title="Alarms">
      <div className="space-y-6">
        <PageHeader
          title="Alarms"
          subtitle="Operational conditions derived from connectivity history and command runs. Notification preferences control the header bell only."
        />
        <OperationalAlarmsClient />
      </div>
    </PagePermissionGate>
  )
}
