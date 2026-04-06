import type { ObisSelectionItemInput, ReadObisSelectionRequest } from "@/types/runtime"

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
  let classId: number
  if (typeof r.classId === "number" && Number.isFinite(r.classId)) {
    classId = r.classId
  } else if (typeof r.class_id === "number" && Number.isFinite(r.class_id)) {
    classId = r.class_id
  } else if (typeof r.classId === "string" && r.classId.trim() !== "") {
    classId = Number(r.classId)
  } else if (typeof r.class_id === "string" && r.class_id.trim() !== "") {
    classId = Number(r.class_id)
  } else {
    return null
  }
  if (!Number.isFinite(classId)) return null
  if (!obis || !objectType) return null

  const attrRaw = r.attribute ?? r.attr
  let attribute: number | undefined
  if (typeof attrRaw === "number" && Number.isFinite(attrRaw)) attribute = attrRaw
  else if (typeof attrRaw === "string" && attrRaw.trim() !== "")
    attribute = Number(attrRaw)

  const su = r.scalerUnitAttribute ?? r.scaler_unit_attribute
  let scalerUnitAttribute: number | undefined
  if (typeof su === "number" && Number.isFinite(su)) scalerUnitAttribute = su
  else if (typeof su === "string" && su.trim() !== "")
    scalerUnitAttribute = Number(su)

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
  const meterId = typeof o.meterId === "string" ? o.meterId.trim() : ""
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
