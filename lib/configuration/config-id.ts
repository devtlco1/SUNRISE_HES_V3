/** Allocate a unique configuration record id within `used`. */
export function allocateConfigId(prefix: string, seed: string, used: Set<string>): string {
  const base = seed
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
  let id = `cfg-${prefix}-${base || prefix}`
  let n = 0
  while (used.has(id)) {
    n += 1
    id = `cfg-${prefix}-${base || prefix}-${n}`
  }
  used.add(id)
  return id
}
