import type { TariffProfileRow } from "@/types/configuration"

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

function bool(v: unknown, fallback: boolean): boolean {
  if (v === true || v === "true" || v === 1) return true
  if (v === false || v === "false" || v === 0) return false
  return fallback
}

export function normalizeTariffProfileRow(raw: unknown): TariffProfileRow | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const id = str(r.id)
  const name = str(r.name)
  const code = str(r.code)
  if (!id || !name || !code) return null
  return {
    id,
    name,
    code,
    description: str(r.description),
    active: bool(r.active, true),
    notes: str(r.notes),
  }
}

export function normalizeTariffProfileRows(input: unknown): TariffProfileRow[] {
  if (!Array.isArray(input)) return []
  return input
    .map(normalizeTariffProfileRow)
    .filter((row): row is TariffProfileRow => row !== null)
}
