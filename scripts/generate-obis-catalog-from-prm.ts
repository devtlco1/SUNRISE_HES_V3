/**
 * Deterministic catalog build: join PRM_CODE_OBIS + PRM_CODE_OBJECT from data1.sql → data/obis-catalog.json
 *
 *   npx tsx scripts/generate-obis-catalog-from-prm.ts [path-to-dump.sql]
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs"
import path from "path"

import { inferDlmsFromPrm } from "../lib/obis/infer-dlms-from-prm"
import {
  castIntField,
  decodeNString,
  extractValuesFields,
  parseTopLevelParenTuple,
} from "../lib/obis/prm-sql-insert-parser"
import { splitVendorObjectCode } from "../lib/obis/split-vendor-object-code"
import { isValidCosemObisLogicalName } from "../lib/obis/obis-logical-name"
import type { ObisCatalogEntry } from "../lib/obis/types"

const OBIS_MARKER = "INSERT [dbo].[PRM_CODE_OBIS]"
const OBJECT_MARKER = "INSERT [dbo].[PRM_CODE_OBJECT]"

function collectInsertStatements(sql: string, marker: string): string[] {
  const chunks = sql.split(marker)
  const out: string[] = []
  for (let i = 1; i < chunks.length; i++) {
    const t = `${marker}${chunks[i]!}`
    const vi = t.search(/\bVALUES\s*\(/i)
    if (vi < 0) continue
    const open = t.indexOf("(", vi + 6)
    if (open < 0) continue
    try {
      parseTopLevelParenTuple(t, open)
      out.push(t)
    } catch {
      /* skip malformed */
    }
  }
  return out
}

function parseObisRow(stmt: string): {
  protocol: number
  objectCode: string
  obisHex: string
  dataType: string
  analyticType: string
  unit: string
  scaler: number
  readBatch: string
  readSingle: string
  collectPlan: string
  collectPlanType: string
  setting: string
  display: string
  xslt: string
  crtOn: string
  mdfOn: string
} | null {
  const fields = extractValuesFields(stmt)
  if (!fields || fields.length < 18) return null
  return {
    protocol: castIntField(fields[0]!),
    objectCode: decodeNString(fields[1]!),
    obisHex: decodeNString(fields[2]!),
    dataType: decodeNString(fields[3]!),
    analyticType: decodeNString(fields[4]!),
    unit: decodeNString(fields[5]!),
    scaler: castIntField(fields[6]!),
    readBatch: String(castIntField(fields[7]!)),
    readSingle: String(castIntField(fields[8]!)),
    collectPlan: String(castIntField(fields[9]!)),
    collectPlanType: String(castIntField(fields[10]!)),
    setting: String(castIntField(fields[11]!)),
    display: String(castIntField(fields[12]!)),
    xslt: decodeNString(fields[13]!),
    crtOn: fields[14]!.trim(),
    mdfOn: fields[16]!.trim(),
  }
}

function parseObjectRow(stmt: string): {
  code: string
  className: string
  subClassName: string
  name: string
  status: string
  cimCode: string
  phase: string
  sortNo: number
  deviceType: string
  crtOn: string
  mdfOn: string
} | null {
  const fields = extractValuesFields(stmt)
  if (!fields || fields.length < 17) return null
  const subRaw = fields[2]!.trim()
  const subNull = subRaw === "NULL"
  return {
    code: decodeNString(fields[0]!),
    className: decodeNString(fields[1]!),
    subClassName: subNull ? "" : decodeNString(fields[2]!),
    name: decodeNString(fields[3]!),
    status: fields[4]!.trim(),
    cimCode: decodeNString(fields[5]!),
    phase: fields[10]!.trim(),
    sortNo: castIntField(fields[11]!),
    deviceType: fields[12]!.trim(),
    crtOn: fields[13]!.trim(),
    mdfOn: fields[15]!.trim(),
  }
}

function formatSqlDateToken(field: string): string {
  const t = field.trim()
  if (t === "NULL") return ""
  const m = t.match(/N'([^']*(?:''[^']*)*)'/)
  if (m) return m[1]!.replace(/''/g, "'")
  return ""
}

function main() {
  const sqlPath =
    process.argv[2] ?? path.join(process.cwd(), "data1.sql")
  const outPath = path.join(process.cwd(), "data", "obis-catalog.json")

  const buf = readFileSync(sqlPath)
  const sql =
    buf[0] === 0xff && buf[1] === 0xfe
      ? buf.slice(2).toString("utf16le")
      : buf.toString("utf-8")
  const sqlText = sql.replace(/^\uFEFF/, "")

  const objectByCode = new Map<string, ReturnType<typeof parseObjectRow>>()
  for (const stmt of collectInsertStatements(sqlText, OBJECT_MARKER)) {
    const row = parseObjectRow(stmt)
    if (row?.code) objectByCode.set(row.code, row)
  }

  const obisWinners = new Map<
    string,
    NonNullable<ReturnType<typeof parseObisRow>>
  >()
  for (const stmt of collectInsertStatements(sqlText, OBIS_MARKER)) {
    const row = parseObisRow(stmt)
    if (!row?.objectCode) continue
    const prev = obisWinners.get(row.objectCode)
    if (!prev || row.protocol === 2 || (prev.protocol !== 2 && row.protocol > prev.protocol)) {
      obisWinners.set(row.objectCode, row)
    }
  }

  const rows: ObisCatalogEntry[] = []
  for (const [objectCode, ob] of obisWinners) {
    const obj = objectByCode.get(objectCode)
    const { obis, attribute } = splitVendorObjectCode(objectCode)
    const dlms = inferDlmsFromPrm({
      obisLogical: obis,
      dataType: ob.dataType,
      analyticType: ob.analyticType,
    })
    const objectName = obj?.name?.trim() || objectCode
    const className = obj?.className?.trim() || "Unmapped"
    const subclassName = (obj?.subClassName ?? "").trim()
    const sortNo = obj?.sortNo ?? 9999
    const shapeOk = isValidCosemObisLogicalName(obis)

    const crtOn = obj ? formatSqlDateToken(obj.crtOn) : formatSqlDateToken(ob.crtOn)
    const mdfOn = obj ? formatSqlDateToken(obj.mdfOn) : formatSqlDateToken(ob.mdfOn)

    rows.push({
      object_code: objectCode,
      obis,
      description: objectName,
      object_name: objectName,
      class_name: className,
      subclass_name: subclassName,
      sort_no: sortNo,
      protocol: String(ob.protocol),
      obis_hex: ob.obisHex,
      data_type: ob.dataType,
      analytic_type: ob.analyticType,
      unit: ob.unit,
      scaler: ob.scaler,
      read_batch_status: ob.readBatch,
      read_single_status: ob.readSingle,
      collect_plan_status: ob.collectPlan,
      collect_plan_type_status: ob.collectPlanType,
      setting_status: ob.setting,
      display_status: ob.display,
      xslt: ob.xslt.trim(),
      phase: obj ? String(castIntField(obj.phase)) : "",
      device_type: obj ? String(castIntField(obj.deviceType)) : "",
      object_status: obj ? String(castIntField(obj.status)) : "",
      cim_code: obj?.cimCode ?? "",
      crt_on: crtOn,
      mdf_on: mdfOn,
      object_type: dlms.object_type,
      class_id: dlms.class_id,
      attribute,
      scaler_unit_attribute: 3,
      result_format: "scalar",
      status: "catalog_only",
      enabled: shapeOk,
      sort_order: sortNo,
      notes: shapeOk ? undefined : "INVALID_OBIS_SHAPE: expected six-group logical name from vendor code.",
    })
  }

  rows.sort((a, b) => {
    const c = a.class_name.localeCompare(b.class_name)
    if (c !== 0) return c
    const s = a.subclass_name.localeCompare(b.subclass_name)
    if (s !== 0) return s
    if (a.sort_no !== b.sort_no) return a.sort_no - b.sort_no
    return a.object_code.localeCompare(b.object_code)
  })

  mkdirSync(path.dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(rows, null, 2)}\n`, "utf-8")
  console.error(`Wrote ${rows.length} rows to ${outPath}`)
}

main()
