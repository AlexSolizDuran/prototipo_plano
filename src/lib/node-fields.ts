import { type AnyNode, nodeRegistry } from "@pascal-app/core"

const RAD2DEG = 180 / Math.PI
const DEG2RAD = Math.PI / 180

export type FieldKind = "number" | "text" | "bool" | "enum" | "color" | "metric"

export type Path = (string | number)[]

export type FieldSpec = {
  /** Dot-free path into the node. Absent for derived read-only fields. */
  path?: Path
  label: string
  kind: FieldKind
  unit?: string
  min?: number
  max?: number
  step?: number
  precision?: number
  /** Display multiplier (radians → degrees). */
  scale?: number
  /** Write multiplier, the inverse of `scale`. */
  inverse?: number
  options?: readonly string[]
  /** Resolve enum options from the kind's Zod schema. */
  fromSchema?: boolean
  /** Dynamic range around the current value when no min/max is declared. */
  span?: number
  metric?: (node: AnyNode) => number | string
  visibleIf?: (node: AnyNode) => boolean
}

export type FieldGroup = {
  id: string
  label: string
  fields: FieldSpec[]
}

const num = (
  path: Path,
  label: string,
  extra: Partial<FieldSpec> = {},
): FieldSpec => ({ path, label, kind: "number", step: 0.01, precision: 3, ...extra })

const deg = (path: Path, label: string): FieldSpec =>
  num(path, label, {
    unit: "°",
    step: 1,
    precision: 0,
    scale: RAD2DEG,
    inverse: DEG2RAD,
    span: 180,
  })

const txt = (path: Path, label: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({
  path,
  label,
  kind: "text",
  ...extra,
})

const bool = (path: Path, label: string): FieldSpec => ({ path, label, kind: "bool" })

const metric = (
  label: string,
  fn: (node: AnyNode) => number | string,
  unit?: string,
): FieldSpec => ({ label, kind: "metric", metric: fn, unit })

/* ── Lectura / escritura por path ──────────────────────────────────────── */

export function readPath(source: unknown, path: Path): unknown {
  let cursor: unknown = source
  for (const key of path) {
    if (cursor == null) return undefined
    cursor = (cursor as Record<string | number, unknown>)[key]
  }
  return cursor
}

/** Clona `node` aplicando `value` en `path`. Devuelve el subárbol raíz. */
function writePath(node: unknown, path: Path, value: unknown): unknown {
  if (path.length === 0) return value
  const [head, ...rest] = path
  if (typeof head === "number") {
    const arr = Array.isArray(node) ? [...(node as unknown[])] : []
    arr[head] = writePath(arr[head], rest, value)
    return arr
  }
  const obj =
    node && typeof node === "object" ? { ...(node as Record<string, unknown>) } : {}
  obj[head] = writePath(obj[head], rest, value)
  return obj
}

/** `{ position: [1, 2, 3] }`-style patch for a single field write. */
export function patchFor(node: AnyNode, spec: FieldSpec, rawValue: unknown) {
  if (!spec.path || spec.path.length === 0) return {}
  const value = spec.inverse && typeof rawValue === "number" ? rawValue * spec.inverse : rawValue
  const next = writePath(node, spec.path, value) as Record<string, unknown>
  const root = spec.path[0]
  return { [root]: next[root] }
}

/* ── Métricas derivadas ───────────────────────────────────────────────── */

type Pt = readonly [number, number]

function pointsOf(node: AnyNode): Pt[] {
  const poly = (node as { polygon?: unknown }).polygon
  if (Array.isArray(poly)) return poly as Pt[]
  const inner = (poly as { points?: unknown } | undefined)?.points
  return Array.isArray(inner) ? (inner as Pt[]) : []
}

export function polygonArea(points: Pt[]): number {
  if (points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

export function polygonPerimeter(points: Pt[]): number {
  if (points.length < 2) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    sum += Math.hypot(x2 - x1, y2 - y1)
  }
  return sum
}

function spanLength(node: AnyNode): number | null {
  const n = node as { start?: Pt; end?: Pt }
  if (!Array.isArray(n.start) || !Array.isArray(n.end)) return null
  return Math.hypot(n.end[0] - n.start[0], n.end[1] - n.start[1])
}

const areaMetric = metric("Superficie", (n) => polygonArea(pointsOf(n)), "m²")
const perimeterMetric = metric("Perímetro", (n) => polygonPerimeter(pointsOf(n)), "m")
const spanMetric = metric("Largo (cuerda)", (n) => spanLength(n) ?? 0, "m")

/* ── Zod: clasificación e introspección genérica ──────────────────────── */

type ZodDef = Record<string, unknown>

/** Envolturas que hay que atravesar para llegar al tipo real. */
const ZOD_WRAPPERS = new Set([
  "optional",
  "nullable",
  "default",
  "prefault",
  "catch",
  "readonly",
  "nonoptional",
  "pipe",
  "branded",
])

function unwrapZod(zod: unknown): { zod: ZodDef; def: ZodDef } | null {
  let cursor = zod as ZodDef | null
  for (let depth = 0; depth < 8 && cursor; depth++) {
    const def = (cursor._zod as { def?: ZodDef } | undefined)?.def
    if (!def) return null
    const type = def.type
    if (typeof type === "string" && ZOD_WRAPPERS.has(type)) {
      cursor = (def.innerType ?? def.in ?? def.out ?? null) as ZodDef | null
      continue
    }
    return { zod: cursor, def }
  }
  return null
}

function zodTypeName(zod: unknown): string | null {
  const unwrapped = unwrapZod(zod)
  if (unwrapped) return typeof unwrapped.def.type === "string" ? unwrapped.def.type : null
  const legacy = (zod as { _def?: { typeName?: string } } | null)?._def?.typeName
  return legacy ? legacy.replace(/^Zod/, "").toLowerCase() : null
}

export function unwrapZodEnum(zod: unknown): string[] | null {
  const unwrapped = unwrapZod(zod)
  if (!unwrapped || unwrapped.def.type !== "enum") {
    const legacy = (zod as { options?: unknown[]; _def?: { values?: unknown[] } } | null)
    if (Array.isArray(legacy?.options)) return legacy.options.map(String)
    if (Array.isArray(legacy?._def?.values)) return legacy._def.values.map(String)
    return null
  }
  const entries = unwrapped.def.entries
  if (entries && typeof entries === "object") return Object.values(entries).map(String)
  const values = unwrapped.def.values
  if (Array.isArray(values)) return values.map(String)
  return null
}

export function enumOptionsFor(kind: string, path: Path): string[] | null {
  try {
    const def = nodeRegistry.get(kind)
    const shape = (def as { schema?: { shape?: Record<string, unknown> } })?.schema?.shape
    if (!shape) return null
    return unwrapZodEnum(readPath(shape, path))
  } catch {}
  return null
}

/* ── Grupos comunes ───────────────────────────────────────────────────── */

const identityGroup = (): FieldGroup => ({
  id: "identidad",
  label: "Identidad",
  fields: [txt(["name"], "Nombre"), bool(["visible"], "Visible")],
})

const transformGroup = (): FieldGroup => ({
  id: "transform",
  label: "Transformación",
  fields: [
    num(["position", 0], "Pos X", { unit: "m", span: 5 }),
    num(["position", 1], "Pos Y", { unit: "m", span: 5 }),
    num(["position", 2], "Pos Z", { unit: "m", span: 5 }),
    deg(["rotation", 0], "Rot X"),
    deg(["rotation", 1], "Rot Y"),
    deg(["rotation", 2], "Rot Z"),
  ],
})

const materialGroup = (): FieldGroup => ({
  id: "apariencia",
  label: "Apariencia",
  fields: [
    { path: ["material", "preset"], label: "Preset", kind: "enum", options: [] as string[], fromSchema: true },
    txt(["material", "properties", "color"], "Color", { kind: "color" }),
    num(["material", "properties", "roughness"], "Rugosidad", { min: 0, max: 1, step: 0.01, precision: 2 }),
    num(["material", "properties", "metalness"], "Metalness", { min: 0, max: 1, step: 0.01, precision: 2 }),
    num(["material", "properties", "opacity"], "Opacidad", { min: 0, max: 1, step: 0.01, precision: 2 }),
  ],
})

const idMetric = metric("ID", (n) => n.id)

/* ── Catálogo por tipo de nodo ────────────────────────────────────────── */

type Catalog = FieldGroup[]

const CATALOG: Record<string, Catalog> = {
  wall: [
    {
      id: "dimensiones",
      label: "Geometría",
      fields: [
        num(["thickness"], "Espesor", { unit: "m", min: 0.05, max: 0.6 }),
        num(["height"], "Altura", { unit: "m", min: 0.1, max: 8, step: 0.05 }),
        num(["curveOffset"], "Curva", { unit: "m", min: -3, max: 3, step: 0.05 }),
        spanMetric,
        num(["start", 0], "Inicio X", { unit: "m" }),
        num(["start", 1], "Inicio Z", { unit: "m" }),
        num(["end", 0], "Fin X", { unit: "m" }),
        num(["end", 1], "Fin Z", { unit: "m" }),
      ],
    },
    materialGroup(),
  ],
  slab: [
    {
      id: "geometria",
      label: "Geometría",
      fields: [num(["elevation"], "Elevación", { unit: "m", min: -2, max: 4 }), areaMetric, perimeterMetric],
    },
    {
      id: "flags",
      label: "Opciones",
      fields: [bool(["autoFromWalls"], "Auto desde muros")],
    },
    materialGroup(),
  ],
  ceiling: [
    {
      id: "geometria",
      label: "Geometría",
      fields: [num(["height"], "Altura", { unit: "m", min: 0, max: 8, step: 0.05 }), areaMetric],
    },
    {
      id: "flags",
      label: "Opciones",
      fields: [bool(["autoFromWalls"], "Auto desde muros")],
    },
    materialGroup(),
  ],
  zone: [
    {
      id: "geometria",
      label: "Geometría",
      fields: [
        areaMetric,
        perimeterMetric,
        metric("Muros de borde", (n) => {
          const ids = (n as unknown as { boundaryWallIds?: unknown[] }).boundaryWallIds
          return Array.isArray(ids) ? ids.length : 0
        }),
      ],
    },
    {
      id: "apariencia",
      label: "Apariencia",
      fields: [txt(["color"], "Color", { kind: "color" })],
    },
  ],
  column: [
    {
      id: "dimensiones",
      label: "Dimensiones",
      fields: [
        num(["height"], "Altura", { unit: "m", min: 0.1, max: 20, step: 0.05 }),
        num(["width"], "Ancho", { unit: "m", min: 0.02, max: 3 }),
        num(["depth"], "Profundidad", { unit: "m", min: 0.02, max: 3 }),
        num(["radius"], "Radio", { unit: "m", min: 0.01, max: 3 }),
        num(["baseHeight"], "Base", { unit: "m", min: 0, max: 3 }),
        num(["capitalHeight"], "Capitel", { unit: "m", min: 0, max: 3 }),
      ],
    },
    {
      id: "estilo",
      label: "Estilo",
      fields: [
        { path: ["style"], label: "Estilo", kind: "enum", fromSchema: true },
        { path: ["crossSection"], label: "Sección", kind: "enum", fromSchema: true },
      ],
    },
    materialGroup(),
  ],
  item: [
    {
      id: "dimensiones",
      label: "Dimensiones",
      fields: [
        num(["asset", "dimensions", 0], "Ancho", { unit: "m" }),
        num(["asset", "dimensions", 1], "Alto", { unit: "m" }),
        num(["asset", "dimensions", 2], "Profundidad", { unit: "m" }),
        num(["scale", 0], "Esc X", { step: 0.01, precision: 3, min: 0.01, max: 20 }),
        num(["scale", 1], "Esc Y", { step: 0.01, precision: 3, min: 0.01, max: 20 }),
        num(["scale", 2], "Esc Z", { step: 0.01, precision: 3, min: 0.01, max: 20 }),
      ],
    },
    {
      id: "estilo",
      label: "Estilo",
      fields: [
        { path: ["side"], label: "Cara", kind: "enum", fromSchema: true },
        txt(["color"], "Color", { kind: "color" }),
      ],
    },
  ],
  door: [
    {
      id: "dimensiones",
      label: "Dimensiones",
      fields: [
        num(["width"], "Ancho", { unit: "m", min: 0.2, max: 6 }),
        num(["height"], "Altura", { unit: "m", min: 0.2, max: 6, step: 0.05 }),
        num(["swingAngle"], "Apertura", { unit: "°", min: 0, max: 180, step: 1, precision: 0 }),
      ],
    },
    {
      id: "estilo",
      label: "Estilo",
      fields: [
        { path: ["doorType"], label: "Tipo", kind: "enum", fromSchema: true },
        { path: ["swingDirection"], label: "Sentido", kind: "enum", fromSchema: true },
        { path: ["side"], label: "Cara", kind: "enum", fromSchema: true },
        bool(["panicBar"], "Barra antipánico"),
      ],
    },
    materialGroup(),
  ],
  window: [
    {
      id: "dimensiones",
      label: "Dimensiones",
      fields: [
        num(["width"], "Ancho", { unit: "m", min: 0.1, max: 8 }),
        num(["height"], "Altura", { unit: "m", min: 0.1, max: 8, step: 0.05 }),
        num(["sill"], "Antepecho", { unit: "m", min: 0, max: 4, step: 0.05 }),
        num(["sillHeight"], "Alto del dintel", { unit: "m", min: 0, max: 8, step: 0.05 }),
      ],
    },
    {
      id: "estilo",
      label: "Estilo",
      fields: [
        { path: ["windowType"], label: "Tipo", kind: "enum", fromSchema: true },
        { path: ["casementStyle"], label: "Hoja", kind: "enum", fromSchema: true },
        { path: ["side"], label: "Cara", kind: "enum", fromSchema: true },
      ],
    },
    materialGroup(),
  ],
  stair: [
    {
      id: "dimensiones",
      label: "Dimensiones",
      fields: [
        num(["totalRise"], "Desnivel", { unit: "m", min: 0.1, max: 20, step: 0.05 }),
        num(["stepCount"], "Escalones", { step: 1, precision: 0, min: 1, max: 80 }),
        num(["width"], "Ancho", { unit: "m", min: 0.4, max: 4 }),
        num(["thickness"], "Espesor", { unit: "m", min: 0.02, max: 0.6 }),
        num(["railingHeight"], "Baranda", { unit: "m", min: 0, max: 2, step: 0.05 }),
      ],
    },
    {
      id: "estilo",
      label: "Estilo",
      fields: [{ path: ["stairType"], label: "Tipo", kind: "enum", fromSchema: true }],
    },
    materialGroup(),
  ],
  "stair-segment": [
    { id: "estilo", label: "Estilo", fields: [{ path: ["segmentType"], label: "Tipo", kind: "enum", fromSchema: true }] },
  ],
  shelf: [
    {
      id: "dimensiones",
      label: "Dimensiones",
      fields: [
        num(["width"], "Ancho", { unit: "m", min: 0.1, max: 6 }),
        num(["depth"], "Profundidad", { unit: "m", min: 0.05, max: 2 }),
        num(["height"], "Altura", { unit: "m", min: 0.1, max: 6, step: 0.05 }),
        num(["thickness"], "Espesor", { unit: "m", min: 0.005, max: 0.2, step: 0.005 }),
        num(["rows"], "Filas", { step: 1, precision: 0, min: 0, max: 20 }),
        num(["columns"], "Columnas", { step: 1, precision: 0, min: 0, max: 20 }),
      ],
    },
    {
      id: "opciones",
      label: "Opciones",
      fields: [bool(["withBack"], "Con fondo"), bool(["withSides"], "Con laterales"), bool(["withBottom"], "Con base")],
    },
    materialGroup(),
  ],
  elevator: [
    {
      id: "dimensiones",
      label: "Dimensiones",
      fields: [
        num(["width"], "Ancho cabina", { unit: "m", min: 0.5, max: 5 }),
        num(["depth"], "Profundidad", { unit: "m", min: 0.5, max: 5 }),
        num(["cabHeight"], "Altura cabina", { unit: "m", min: 1.2, max: 4, step: 0.05 }),
        num(["shaftWidth"], "Ancho hueco", { unit: "m", min: 0.6, max: 6 }),
        num(["shaftDepth"], "Profundidad hueco", { unit: "m", min: 0.6, max: 6 }),
        num(["doorWidth"], "Ancho puerta", { unit: "m", min: 0.4, max: 3 }),
        num(["doorHeight"], "Alto puerta", { unit: "m", min: 1.2, max: 3, step: 0.05 }),
      ],
    },
    materialGroup(),
  ],
  roof: [{ id: "apariencia", label: "Apariencia", fields: [{ path: ["material"], label: "Material", kind: "enum", fromSchema: true }] }],
  "roof-segment": [{ id: "dimensiones", label: "Dimensiones", fields: [num(["slope"], "Pendiente", { unit: "°", min: 0, max: 90, step: 1, precision: 0 })] }],
  fence: [
    {
      id: "dimensiones",
      label: "Dimensiones",
      fields: [
        num(["height"], "Altura", { unit: "m", min: 0.2, max: 4, step: 0.05 }),
        num(["thickness"], "Espesor", { unit: "m", min: 0.01, max: 0.4 }),
        num(["postSpacing"], "Densidad", { unit: "m", min: 0.2, max: 4, step: 0.05 }),
        num(["postSize"], "Postes", { unit: "m", min: 0.02, max: 0.4 }),
        num(["baseHeight"], "Zócalo", { unit: "m", min: 0, max: 2, step: 0.05 }),
        spanMetric,
      ],
    },
    {
      id: "estilo",
      label: "Estilo",
      fields: [
        { path: ["style"], label: "Estilo", kind: "enum", fromSchema: true },
        txt(["color"], "Color", { kind: "color" }),
      ],
    },
  ],
  building: [
    { id: "info", label: "Nodo", fields: [txt(["name"], "Nombre"), metric("Nivel", () => 0)] },
  ],
  level: [
    {
      id: "info",
      label: "Nivel",
      fields: [num(["level"], "Índice", { step: 1, precision: 0, min: -20, max: 200 }), metric("Altura", (n) => numOf(n, "height"), "m")],
    },
  ],
  site: [{ id: "geometria", label: "Geometría", fields: [areaMetric, perimeterMetric] }],
}

function numOf(node: AnyNode, key: string): number {
  const value = (node as unknown as Record<string, unknown>)[key]
  return typeof value === "number" ? value : 0
}

/* ── Fallback genérico desde el schema Zod ────────────────────────────── */

const SKIP_KEYS = new Set([
  "object",
  "id",
  "type",
  "parentId",
  "children",
  "camera",
  "metadata",
  "slots",
  "holeMetadata",
  "asset",
  "material",
  "materialPreset",
  "interiorMaterial",
  "exteriorMaterial",
  "start",
  "end",
  "polygon",
  "holes",
  "path",
  "tangents",
  "wallId",
  "hostId",
  "assetId",
  "fromLevelId",
  "toLevelId",
  "boundaryWallIds",
  "servedLevelIds",
  "faceBands",
  "skirting",
  "crown",
  "chairRail",
  "skirtingInterior",
  "skirtingExterior",
  "crownInterior",
  "crownExterior",
  "chairRailInterior",
  "chairRailExterior",
])

function humanise(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
}

function zodScalarType(zod: unknown): "number" | "boolean" | "enum" | null {
  if (unwrapZodEnum(zod) !== null) return "enum"
  const type = zodTypeName(zod)
  if (type === "number" || type === "int") return "number"
  if (type === "boolean" || type === "bool") return "boolean"
  return null
}

function genericGroup(node: AnyNode): FieldGroup | null {
  const def = nodeRegistry.get(node.type)
  const shape = (def as { schema?: { shape?: Record<string, unknown> } })?.schema?.shape
  if (!shape) return null

  const fields: FieldSpec[] = []
  for (const [key, zod] of Object.entries(shape)) {
    if (SKIP_KEYS.has(key)) continue
    const scalar = zodScalarType(zod)
    if (scalar === "number") {
      fields.push(num([key], humanise(key), { step: 0.01, precision: 3 }))
    } else if (scalar === "boolean") {
      fields.push(bool([key], humanise(key)))
    } else if (scalar === "enum") {
      fields.push({ path: [key], label: humanise(key), kind: "enum", fromSchema: true })
    }
  }
  return fields.length > 0 ? { id: "avanzado", label: "Avanzado", fields } : null
}

/* ── API pública ──────────────────────────────────────────────────────── */

export function groupsForNode(node: AnyNode): { curated: FieldGroup[]; rest: FieldGroup[] } {
  const record = node as unknown as Record<string, unknown>
  const curated: FieldGroup[] = []

  curated.push(identityGroup())

  if (Array.isArray(record.position) || Array.isArray(record.rotation)) {
    curated.push(transformGroup())
  }

  const forKind = CATALOG[node.type] ?? []
  curated.push(...forKind.filter((group) => group.fields.every((f) => !f.visibleIf || f.visibleIf(node))))

  const curatedKeys = new Set(forKind.flatMap((group) => group.fields.map((f) => f.path?.[0] ?? "")))
  const rest: FieldGroup[] = []
  const extra = genericGroup(node)
  if (extra) {
    const remaining = extra.fields.filter((f) => !curatedKeys.has(f.path?.[0] ?? ""))
    if (remaining.length > 0) rest.push({ ...extra, fields: remaining })
  }
  rest.push({ id: "meta", label: "Nodo", fields: [idMetric] })

  return { curated, rest }
}

export function optionsFor(node: AnyNode, spec: FieldSpec): string[] {
  if (spec.options && spec.options.length > 0) return [...spec.options]
  if (spec.fromSchema && spec.path) {
    return enumOptionsFor(node.type, spec.path) ?? (typeof readPath(node, spec.path) === "string" ? [String(readPath(node, spec.path))] : [])
  }
  return []
}

export function displayValue(node: AnyNode, spec: FieldSpec): number | string {
  if (spec.kind === "metric") return spec.metric ? spec.metric(node) : "—"
  const raw = spec.path ? readPath(node, spec.path) : undefined
  if (typeof raw === "number") return spec.scale ? raw * spec.scale : raw
  if (typeof raw === "boolean") return raw ? "sí" : "no"
  if (raw == null) return "—"
  if (Array.isArray(raw)) return `${raw.length}`
  if (typeof raw === "object") return "{…}"
  return String(raw)
}

export function formatValue(spec: FieldSpec, value: number | string): string {
  if (typeof value === "string") return value
  const precision = spec.precision ?? 3
  return value.toFixed(precision)
}

export function rangeFor(node: AnyNode, spec: FieldSpec): { min: number; max: number } | null {
  if (spec.kind !== "number") return null
  const current = spec.path ? Number(readPath(node, spec.path)) : NaN
  if (spec.min != null && spec.max != null) return { min: spec.min, max: spec.max }
  if (!Number.isFinite(current)) return null
  const span = spec.span ?? Math.max(Math.abs(current) * 0.25, spec.step ?? 0.01) * 4
  return { min: current - span, max: current + span }
}
