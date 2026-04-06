import { evaluateBasicRegistersAgainstDiscoverySnapshot } from "@/lib/runtime/catalog/evaluate-basic-registers-catalog"
import { getRequiredObisForBasicRegistersProfile } from "@/lib/runtime/catalog/basic-registers-profile"
import { getLatestDiscoverySnapshotFromSidecarOrNull } from "@/lib/runtime/python-sidecar/client"
import type { CatalogReadCompatibilityDiagnostics } from "@/types/runtime"

/**
 * Load the latest discovery snapshot from the Python sidecar and evaluate the
 * basic-registers OBIS profile. Used by internal Next routes before proxying reads.
 */
export async function loadBasicRegistersCatalogDiagnostics(
  meterId: string
): Promise<CatalogReadCompatibilityDiagnostics> {
  const snapshot = await getLatestDiscoverySnapshotFromSidecarOrNull(
    meterId.trim()
  )
  return evaluateBasicRegistersAgainstDiscoverySnapshot(
    snapshot,
    getRequiredObisForBasicRegistersProfile()
  )
}
