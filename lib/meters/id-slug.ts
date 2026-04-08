/** Allocate a stable internal registry id from serial; must stay unique in `used`. */
export function slugId(serial: string, used: Set<string>): string {
  const base = serial
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
  let id = `hes-${base || "meter"}`
  let n = 0
  while (used.has(id)) {
    n += 1
    id = `hes-${base || "meter"}-${n}`
  }
  used.add(id)
  return id
}
