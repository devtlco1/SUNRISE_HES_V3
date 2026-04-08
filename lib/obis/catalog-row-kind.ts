import type { ObisCatalogEntry } from "@/lib/obis/types"

/**
 * Operator-facing hint for how a catalog row is typically read on the wire.
 * Derived from COSEM class / PRM names — not a second classification layer.
 */
export type CatalogRowKind = "scalar" | "capture_object" | "profile_generic"

const BILLING_PROFILE_RE =
  /\b(loadprofile|dailybilling|monthlybilling|consumption|billing)\b/i

export function inferCatalogRowKind(r: ObisCatalogEntry): CatalogRowKind {
  const ot = (r.object_type || "").trim().toLowerCase()
  if (r.class_id === 7 || ot === "profilegeneric") return "profile_generic"

  const hay = [
    r.class_name,
    r.subclass_name,
    r.object_name,
    r.description,
    r.obis,
  ]
    .join("\0")
    .toLowerCase()

  if (BILLING_PROFILE_RE.test(hay)) return "capture_object"
  if (/^0\.0\.99\./.test(r.obis.trim())) return "capture_object"

  return "scalar"
}

export function catalogRowKindShortLabel(kind: CatalogRowKind): string {
  switch (kind) {
    case "profile_generic":
      return "PG"
    case "capture_object":
      return "Cap"
    default:
      return "·"
  }
}

export function catalogRowKindTitle(kind: CatalogRowKind): string {
  switch (kind) {
    case "profile_generic":
      return "Profile-generic (class 7) — dated buffer reads use dedicated flows"
    case "capture_object":
      return "Billing / load-profile capture object (identify in class+subclass; table reads TBD)"
    default:
      return "Scalar / standard register-style read"
  }
}
