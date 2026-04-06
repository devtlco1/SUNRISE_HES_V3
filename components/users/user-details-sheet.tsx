"use client"

import {
  DetailBlock,
  DlGrid,
} from "@/components/shared/entity-detail-blocks"
import { StatusBadge } from "@/components/shared/status-badge"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatUserRole, formatUserStatus } from "@/lib/users/format"
import type { UserListRow } from "@/types/user"

type UserDetailsSheetProps = {
  user: UserListRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserDetailsSheet({
  user,
  open,
  onOpenChange,
}: UserDetailsSheetProps) {
  const role = user ? formatUserRole(user.role) : null
  const st = user ? formatUserStatus(user.status) : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md md:max-w-lg"
        showCloseButton
      >
        {user ? (
          <>
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <SheetTitle className="text-base">User details</SheetTitle>
              <SheetDescription className="text-sm">
                {user.fullName} · {user.email}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-5 py-4">
              <DetailBlock title="Identity">
                <DlGrid
                  items={[
                    { label: "User ID", value: user.id },
                    { label: "Full name", value: user.fullName },
                    { label: "Username", value: user.username },
                  ]}
                />
              </DetailBlock>

              <Separator />

              <DetailBlock title="Role & status">
                <div className="flex flex-wrap gap-2">
                  {role ? (
                    <StatusBadge variant={role.variant}>{role.label}</StatusBadge>
                  ) : null}
                  {st ? (
                    <StatusBadge variant={st.variant}>{st.label}</StatusBadge>
                  ) : null}
                </div>
              </DetailBlock>

              <Separator />

              <DetailBlock title="Team & scope">
                <DlGrid
                  items={[
                    { label: "Team / department", value: user.team },
                    { label: "Assigned scope", value: user.assignedScope },
                  ]}
                />
              </DetailBlock>

              <Separator />

              <DetailBlock title="Activity summary">
                <p className="text-sm text-muted-foreground">
                  Last sign-in and command activity will aggregate here (mock).
                </p>
                <DlGrid
                  items={[
                    {
                      label: "Last active",
                      value: (
                        <span className="tabular-nums">{user.lastActiveAt}</span>
                      ),
                    },
                  ]}
                />
              </DetailBlock>

              <Separator />

              <DetailBlock title="Contact">
                <DlGrid
                  items={[
                    { label: "Email", value: user.email },
                    { label: "Phone", value: user.phone },
                  ]}
                />
              </DetailBlock>

              <Separator />

              <DetailBlock title="Timestamps">
                <DlGrid
                  items={[
                    {
                      label: "Created",
                      value: (
                        <span className="tabular-nums">{user.createdAt}</span>
                      ),
                    },
                    {
                      label: "Profile updated",
                      value: (
                        <span className="tabular-nums">{user.updatedAt}</span>
                      ),
                    },
                  ]}
                />
              </DetailBlock>

              <Separator />

              <DetailBlock title="Permissions (placeholder)">
                <p className="text-sm text-muted-foreground">
                  Fine-grained permissions and policy groups will display here
                  after identity integration. Role above is the coarse HES
                  mapping.
                </p>
              </DetailBlock>
            </div>
          </>
        ) : (
          <SheetHeader className="px-5 py-4 text-left">
            <SheetTitle>User details</SheetTitle>
            <SheetDescription>Select a user to inspect.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}
