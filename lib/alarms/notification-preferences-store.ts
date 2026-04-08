import { mkdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@/types/operational-alarm"

const FILE = "notification-preferences.json"
export const DISMISSED_NOTIFICATION_IDS_MAX = 3000

export function notificationPreferencesPath(): string {
  return path.join(process.cwd(), "data", FILE)
}

function clampDismissed(ids: string[]): string[] {
  if (ids.length <= DISMISSED_NOTIFICATION_IDS_MAX) return ids
  return ids.slice(-DISMISSED_NOTIFICATION_IDS_MAX)
}

function isSeverity(v: unknown): v is NotificationPreferences["minimumSeverity"] {
  return v === "info" || v === "warning" || v === "critical"
}

export async function readNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const text = await readFile(notificationPreferencesPath(), "utf-8")
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_NOTIFICATION_PREFERENCES }
    const o = parsed as Record<string, unknown>
    const base: NotificationPreferences = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      enableConnectivityNotifications:
        typeof o.enableConnectivityNotifications === "boolean"
          ? o.enableConnectivityNotifications
          : DEFAULT_NOTIFICATION_PREFERENCES.enableConnectivityNotifications,
      enableCommandFailureNotifications:
        typeof o.enableCommandFailureNotifications === "boolean"
          ? o.enableCommandFailureNotifications
          : DEFAULT_NOTIFICATION_PREFERENCES.enableCommandFailureNotifications,
      enableRelayFailureNotifications:
        typeof o.enableRelayFailureNotifications === "boolean"
          ? o.enableRelayFailureNotifications
          : DEFAULT_NOTIFICATION_PREFERENCES.enableRelayFailureNotifications,
      enableReadFailureNotifications:
        typeof o.enableReadFailureNotifications === "boolean"
          ? o.enableReadFailureNotifications
          : DEFAULT_NOTIFICATION_PREFERENCES.enableReadFailureNotifications,
      criticalOnly:
        typeof o.criticalOnly === "boolean"
          ? o.criticalOnly
          : DEFAULT_NOTIFICATION_PREFERENCES.criticalOnly,
      minimumSeverity: isSeverity(o.minimumSeverity)
        ? o.minimumSeverity
        : DEFAULT_NOTIFICATION_PREFERENCES.minimumSeverity,
      dismissedNotificationIds: Array.isArray(o.dismissedNotificationIds)
        ? clampDismissed(
            o.dismissedNotificationIds.filter((x): x is string => typeof x === "string")
          )
        : [],
      updatedAt:
        typeof o.updatedAt === "string"
          ? o.updatedAt
          : DEFAULT_NOTIFICATION_PREFERENCES.updatedAt,
    }
    return base
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err?.code === "ENOENT") return { ...DEFAULT_NOTIFICATION_PREFERENCES }
    return { ...DEFAULT_NOTIFICATION_PREFERENCES }
  }
}

export async function writeNotificationPreferences(
  next: NotificationPreferences
): Promise<{ ok: true } | { ok: false; error: string }> {
  const filePath = notificationPreferencesPath()
  try {
    const dir = path.dirname(filePath)
    await mkdir(dir, { recursive: true })
    const tmp = `${filePath}.${process.pid}.tmp`
    const body: NotificationPreferences = {
      ...next,
      dismissedNotificationIds: clampDismissed(next.dismissedNotificationIds),
      updatedAt: new Date().toISOString(),
    }
    await writeFile(tmp, `${JSON.stringify(body, null, 2)}\n`, "utf-8")
    await rename(tmp, filePath)
    return { ok: true }
  } catch {
    return { ok: false, error: "NOTIFICATION_PREFERENCES_WRITE_FAILED" }
  }
}

export function mergePreferencePatch(
  current: NotificationPreferences,
  patch: Partial<NotificationPreferences>
): NotificationPreferences {
  return {
    ...current,
    ...patch,
    dismissedNotificationIds: clampDismissed(
      patch.dismissedNotificationIds ?? current.dismissedNotificationIds
    ),
  }
}
