import {
  dedupeRequiredObisPreserveOrder,
  normalizeObisCode,
  supportedObisKeySetFromDiscoveryObjects,
} from "@/lib/runtime/catalog/snapshot-obis"
import type {
  CatalogReadCompatibilityDiagnostics,
  DiscoverySnapshotRecord,
} from "@/types/runtime"

function snapshotSummaryFrom(record: DiscoverySnapshotRecord) {
  return {
    capturedAtUtc: record.capturedAtUtc,
    associationLogicalName: record.associationLogicalName,
    totalCount: record.totalCount,
    profileFingerprint: record.profileFingerprint,
    simulated: record.simulated,
  }
}

/**
 * Decide whether the latest discovery catalog supports the fixed basic-registers OBIS profile.
 * Does not call the network — pass `null` when no snapshot exists.
 */
export function evaluateBasicRegistersAgainstDiscoverySnapshot(
  snapshot: DiscoverySnapshotRecord | null,
  requiredObisInput: string[]
): CatalogReadCompatibilityDiagnostics {
  const requiredObis = dedupeRequiredObisPreserveOrder(requiredObisInput)

  if (!snapshot) {
    return {
      decision: "no_snapshot",
      readProfile: "basic_registers",
      requiredObis,
      supportedObisInSnapshot: [],
      missingObis: [],
      snapshotSummary: null,
      message:
        "No discovery snapshot for this meter. Run discover-supported-obis successfully once before using the catalog-guarded read-basic-registers path.",
    }
  }

  const keySet = supportedObisKeySetFromDiscoveryObjects(snapshot.objects)
  const supportedObisInSnapshot: string[] = []
  const missingObis: string[] = []

  for (const obis of requiredObis) {
    if (keySet.has(normalizeObisCode(obis))) {
      supportedObisInSnapshot.push(obis)
    } else {
      missingObis.push(obis)
    }
  }

  const summary = snapshotSummaryFrom(snapshot)

  if (missingObis.length > 0) {
    return {
      decision: "incompatible",
      readProfile: "basic_registers",
      requiredObis,
      supportedObisInSnapshot,
      missingObis,
      snapshotSummary: summary,
      message: `Latest discovery catalog (captured ${summary.capturedAtUtc}) does not list all OBIS required for basic_registers; missing: ${missingObis.join(", ")}.`,
    }
  }

  return {
    decision: "allowed",
    readProfile: "basic_registers",
    requiredObis,
    supportedObisInSnapshot,
    missingObis: [],
    snapshotSummary: summary,
    message:
      "Latest discovery catalog includes every OBIS required for the basic_registers profile.",
  }
}
