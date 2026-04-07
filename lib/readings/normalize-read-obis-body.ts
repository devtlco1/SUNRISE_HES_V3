import type { ObisSelectionItemInput, ReadObisSelectionRequest } from "@/types/runtime"

/** Pydantic int fields reject null and non-integer floats; align outbound JSON with Python ObisSelectionItem. */
function toBoundedTruncInt(
  v: number,
  min: number,
  max: number
): number | null {
  if (!Number.isFinite(v)) return null
  const t = Math.trunc(v)
  if (Math.abs(v - t) > 1e-9) return null
  if (t < min || t > max) return null
  return t
}

function coerceItem(raw: unknown): ObisSelectionItemInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const obis = typeof r.obis === "string" ? r.obis.trim() : ""
  const objectType =
    typeof r.objectType === "string"
      ? r.objectType.trim()
      : typeof (r as { object_type?: string }).object_type === "string"
        ? String((r as { object_type: string }).object_type).trim()
        : ""
  let classIdRaw: number
  if (typeof r.classId === "number" && Number.isFinite(r.classId)) {
    classIdRaw = r.classId
  } else if (typeof r.class_id === "number" && Number.isFinite(r.class_id)) {
    classIdRaw = r.class_id
  } else if (typeof r.classId === "string" && r.classId.trim() !== "") {
    classIdRaw = Number(r.classId)
  } else if (typeof r.class_id === "string" && r.class_id.trim() !== "") {
    classIdRaw = Number(r.class_id)
  } else {
    return null
  }
  if (!Number.isFinite(classIdRaw)) return null
  const classId = toBoundedTruncInt(classIdRaw, 0, 65535)
  if (classId === null) return null
  if (!obis || !objectType) return null

  const attrRaw = r.attribute ?? r.attr
  let attribute: number | undefined
  if (typeof attrRaw === "number" && Number.isFinite(attrRaw)) {
    const a = toBoundedTruncInt(attrRaw, 0, 255)
    if (a !== null) attribute = a
  } else if (typeof attrRaw === "string" && attrRaw.trim() !== "") {
    const n = Number(attrRaw)
    const a = toBoundedTruncInt(n, 0, 255)
    if (a !== null) attribute = a
  }

  const su = r.scalerUnitAttribute ?? r.scaler_unit_attribute
  let scalerUnitAttribute: number | undefined
  if (typeof su === "number" && Number.isFinite(su)) {
    const s = toBoundedTruncInt(su, 0, 255)
    if (s !== null) scalerUnitAttribute = s
  } else if (typeof su === "string" && su.trim() !== "") {
    const n = Number(su)
    const s = toBoundedTruncInt(n, 0, 255)
    if (s !== null) scalerUnitAttribute = s
  }

  const description =
    typeof r.description === "string" ? r.description : undefined
  const unit = typeof r.unit === "string" ? r.unit : undefined
  const packKey =
    typeof r.packKey === "string"
      ? r.packKey
      : typeof (r as { pack_key?: string }).pack_key === "string"
        ? (r as { pack_key: string }).pack_key
        : undefined

  const item: ObisSelectionItemInput = {
    obis,
    objectType,
    classId,
    description,
    unit,
    packKey,
  }
  if (attribute !== undefined && Number.isFinite(attribute)) {
    item.attribute = attribute
  }
  if (scalerUnitAttribute !== undefined && Number.isFinite(scalerUnitAttribute)) {
    item.scalerUnitAttribute = scalerUnitAttribute
  }
  return item
}

/** Normalize JSON body so Python Pydantic accepts it (camelCase + numeric classId). */
export function normalizeReadObisSelectionBody(
  v: unknown
): ReadObisSelectionRequest | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  let meterId = typeof o.meterId === "string" ? o.meterId.trim() : ""
  if (
    !meterId &&
    typeof o.meterId === "number" &&
    Number.isFinite(o.meterId)
  ) {
    meterId = String(Math.trunc(o.meterId))
  }
  if (!meterId) return null
  const rawItems = o.selectedItems
  if (!Array.isArray(rawItems) || rawItems.length === 0) return null
  const selectedItems: ObisSelectionItemInput[] = []
  for (const it of rawItems) {
    const row = coerceItem(it)
    if (row) selectedItems.push(row)
  }
  if (selectedItems.length === 0) return null

  const req: ReadObisSelectionRequest = { meterId, selectedItems }
  if (typeof o.endpointId === "string") req.endpointId = o.endpointId
  if (typeof o.channelHint === "string") req.channelHint = o.channelHint
  return req
}
