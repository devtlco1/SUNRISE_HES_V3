import { UsersList } from "@/components/users/users-list"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Operator and admin directory — roles, scopes, and status are mock-only until identity is integrated."
        actions={
          <>
            <Button type="button" size="sm" variant="outline" disabled>
              SSO settings (mock)
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled>
              Audit log (mock)
            </Button>
          </>
        }
      />

      <UsersList />
    </div>
  )
}
