export const INDENT = 2

export const inlineValue = (value: unknown): string =>
  value === null ? "null" : JSON.stringify(value)

export const isPrimitive = (value: unknown): boolean =>
  value === null || typeof value !== "object"

export function formatJson(value: unknown, depth = 0): string {
  if (isPrimitive(value)) return inlineValue(value)

  const pad = " ".repeat(INDENT * depth)
  const childPad = " ".repeat(INDENT * (depth + 1))

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    if (value.every(isPrimitive)) {
      return `[${value.map(inlineValue).join(", ")}]`
    }
    const allPointLike =
      value.length <= 512 &&
      value.every(
        (p) =>
          Array.isArray(p) &&
          p.length >= 2 &&
          p.length <= 4 &&
          p.every(isPrimitive),
      )
    if (allPointLike) {
      const rows = value.map((p) => `[${(p as unknown[]).map(inlineValue).join(", ")}]`)
      return `[\n${rows.map((r) => `${childPad}${r}`).join(",\n")}\n${pad}]`
    }
    const rows = value.map((x) => formatJson(x, depth + 1))
    return `[\n${rows.map((r) => `${childPad}${r}`).join(",\n")}\n${pad}]`
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length === 0) return "{}"

  const allCompact =
    keys.length <= 4 && keys.every((k) => isPrimitive(record[k]))

  if (allCompact) {
    return `{ ${keys
      .map((k) => `${inlineValue(k)}: ${inlineValue(record[k])}`)
      .join(", ")} }`
  }

  const rows = keys.map(
    (k) => `${childPad}${inlineValue(k)}: ${formatJson(record[k], depth + 1)}`,
  )
  return `{\n${rows.join(",\n")}\n${pad}}`
}