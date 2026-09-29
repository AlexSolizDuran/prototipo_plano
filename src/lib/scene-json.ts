/**
 * Serializadores de la escena en JSON.
 *
 * Dos representaciones del MISMO estado del editor, para dos consumidores:
 *
 *  - `buildEditorJson` → el `SceneGraph` crudo, tal cual lo persiste el editor.
 *    Es la fuente de verdad. Si algo se pierde, se perdió acá.
 *
 *  - `buildAiJson` → un resumen del plano reagrupado por categoría, con
 *    superficies, relaciones entre estancias y los datos de los objetos. Es
 *    SOLO lectura: describe el plano, no dice cómo modificarlo. El contrato de
 *    escritura —si alguna vez hace falta— se define aparte, en el modelo de IA.
 */
import type { AnyNode, AnyNodeId } from "@pascal-app/core"

/** Ancho máximo de una línea antes de envolver. */
const WIDTH = 100

function isNumTuple(v: unknown): v is number[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number")
}

/**
 * Pretty-printer de JSON que compacta lo numérico.
 *
 * `JSON.stringify(x, null, 2)` abre cada número en su propia línea: un vector
 * de 3 ocupa 5 líneas y un polígono de 4 puntos, 20. Para coordenadas eso es
 * ilegible y duplica el tamaño del payload.
 *
 * Reglas: los vectores numéricos van siempre en una línea; las listas de
 * puntos se empaquetan varias por línea hasta `WIDTH`; los objetos y los
 * arrays de objetos van con una clave o elemento por línea. La salida sigue
 * siendo JSON válido — el separador siempre es coma.
 */
function fmt(value: unknown, indent: number): string {
  const pad = "  ".repeat(indent)
  const padIn = "  ".repeat(indent + 1)

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"

    // Vector: `[9.5, 1.5, 0]`
    if (isNumTuple(value)) return JSON.stringify(value)

    // Lista de puntos: se empaquetan varias tuplas por línea.
    if (value.every(isNumTuple)) {
      const flat = value.map((v) => JSON.stringify(v)).join(", ")
      if (padIn.length + flat.length + 2 <= WIDTH) return `[${flat}]`
      const lines: string[] = []
      let cur = ""
      for (const el of value) {
        const s = JSON.stringify(el)
        if (cur === "") cur = s
        else if (cur.length + 2 + s.length <= WIDTH - padIn.length) cur += `, ${s}`
        else {
          lines.push(cur)
          cur = s
        }
      }
      if (cur !== "") lines.push(cur)
      return `[\n${lines.map((l) => padIn + l).join(",\n")}\n${pad}]`
    }

    const parts = value.map((v) => padIn + fmt(v, indent + 1))
    return `[\n${parts.join(",\n")}\n${pad}]`
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    )
    if (entries.length === 0) return "{}"
    const parts = entries.map(([k, v]) => `${padIn}${JSON.stringify(k)}: ${fmt(v, indent + 1)}`)
    return `{\n${parts.join(",\n")}\n${pad}}`
  }

  return JSON.stringify(value) ?? "null"
}

/** JSON indentado con compaction numérica. */
export function prettyJson(value: unknown): string {
  return fmt(value, 0)
}

/** Estado completo del editor tal como lo expone `useScene`. */
export interface SceneStateLike {
  nodes: Record<AnyNodeId, AnyNode>
  rootNodeIds: AnyNodeId[]
  collections?: Record<string, unknown>
  materials?: Record<string, unknown>
  installedPlugins?: string[]
}

/**
 * Campos sin default en el schema Zod → sin ellos el nodo está incompleto.
 * Derivado de los 43 schemas de nodo. No se usa como contrato de escritura:
 * solo garantiza que el resumen no descarte un campo obligatorio cuando el
 * tipo está en la lista `KEEP` y el schema gana un campo nuevo.
 */
const REQUIRED_FIELDS: Record<string, string[]> = {
  "box-vent": ["style"],
  ceiling: ["polygon"],
  "duct-segment": ["path"],
  fence: ["start", "end"],
  guide: ["url"],
  item: ["asset"],
  lineset: ["path"],
  "liquid-line": ["path"],
  measurement: ["measurement"],
  "pipe-segment": ["path"],
  scan: ["url"],
  slab: ["polygon"],
  wall: ["start", "end"],
  zone: ["name", "polygon"],
}

// ── Utilidades de lectura segura ─────────────────────────────────────────

function rec(node: unknown): Record<string, unknown> {
  return node && typeof node === "object" ? (node as Record<string, unknown>) : {}
}

function f(node: unknown, key: string): unknown {
  return rec(node)[key]
}

function str(node: unknown, key: string, fallback = "—"): string {
  const v = f(node, key)
  return typeof v === "string" && v ? v : fallback
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === "object") return Object.keys(v as object).length === 0
  return false
}

/**
 * Polígono como array plano de tuplas `[x, z]` — la forma real del schema
 * (`z.ZodArray<z.ZodTuple<[number, number]>>`). Tolera además la forma
 * envuelta `{ type: "polygon", points }` por si aparece en datos viejos.
 */
function polygon(node: unknown): [number, number][] | null {
  const p = f(node, "polygon")
  if (Array.isArray(p) && p.length > 0) {
    const pts = p.filter(
      (pt): pt is [number, number] =>
        Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === "number" && typeof pt[1] === "number",
    )
    return pts.length >= 3 ? pts : null
  }
  if (p && typeof p === "object") {
    const pts = f(p, "points")
    if (Array.isArray(pts) && pts.length >= 3) {
      const out = pts.filter(
        (pt): pt is [number, number] =>
          Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === "number" && typeof pt[1] === "number",
      )
      return out.length >= 3 ? out : null
    }
  }
  return null
}

function area(pts: [number, number][]): number {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1])
  }
  return Math.abs(a / 2)
}

function perimeter(pts: [number, number][]): number {
  let p = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    p += Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])
  }
  return p
}

function pointInPolygon(x: number, z: number, pts: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]
    const [xj, zj] = pts[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** Distancia de un punto al segmento más cercano del polígono. */
function distToPolygonEdge(x: number, z: number, pts: [number, number][]): number {
  let best = Infinity
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [x1, z1] = pts[j]
    const [x2, z2] = pts[i]
    const dx = x2 - x1
    const dz = z2 - z1
    const len2 = dx * dx + dz * dz
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / len2))
    best = Math.min(best, Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz)))
  }
  return best
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function pos(node: unknown): [number, number, number] | null {
  const p = f(node, "position")
  return Array.isArray(p) && p.length >= 3 ? [p[0], p[1], p[2]] : null
}

// ── 1. JSON crudo del editor ────────────────────────────────────────────

/**
 * El documento que el editor persiste, sin tocar. Mapea 1:1 con `SceneGraph`
 * (`@pascal-app/editor/src/lib/scene.ts:18`).
 */
export function buildEditorJson(state: SceneStateLike): string {
  return prettyJson({
    nodes: state.nodes,
    rootNodeIds: state.rootNodeIds,
    collections: state.collections ?? {},
    materials: state.materials ?? {},
    installedPlugins: state.installedPlugins ?? [],
  })
}

// ── 2. JSON resumido para IA ────────────────────────────────────────────

/** Campos que nunca aportan a una IA y solo inflan el payload. */
const NOISE = new Set(["object", "camera", "metadata", "slots", "holeMetadata"])

/**
 * Campos que solo se incluyen si el nodo los usa de verdad. El resto se
 * descarta para que el JSON no crezca con los ~120 campos de `column`.
 */
const KEEP: Record<string, string[]> = {
  site: ["polygon", "children"],
  building: ["children", "position", "rotation"],
  level: ["name", "level", "children"],
  zone: ["name", "polygon", "autoFromWalls", "boundaryWallIds", "color", "parentId"],
  wall: ["name", "start", "end", "thickness", "height", "children", "parentId", "materialPreset"],
  slab: ["name", "polygon", "holes", "elevation", "autoFromWalls", "parentId", "materialPreset"],
  ceiling: ["name", "polygon", "holes", "height", "autoFromWalls", "parentId", "materialPreset"],
  roof: ["name", "parentId", "children", "pitch", "materialPreset"],
  "roof-segment": ["name", "parentId", "children", "materialPreset"],
  column: ["name", "position", "rotation", "width", "depth", "height", "style", "parentId"],
  stair: [
    "name", "position", "rotation", "stairType", "width", "totalRise", "stepCount",
    "thickness", "fromLevelId", "toLevelId", "children", "parentId",
  ],
  "stair-segment": ["name", "parentId"],
  door: [
    "name", "wallId", "position", "rotation", "side", "width", "height",
    "doorType", "doorCategory", "openingKind", "swingDirection", "leafCount", "parentId",
  ],
  window: [
    "name", "wallId", "position", "rotation", "side", "width", "height",
    "windowType", "openingKind", "sill", "parentId",
  ],
  fence: ["name", "start", "end", "thickness", "height", "parentId"],
  elevator: ["name", "position", "width", "depth", "parentId", "children"],
  item: ["name", "position", "rotation", "scale", "asset", "parentId", "wallId", "collectionIds"],
  cabinet: ["name", "position", "rotation", "width", "depth", "height", "parentId"],
  shelf: ["name", "position", "rotation", "width", "depth", "height", "parentId"],
  measurement: ["name", "measurement", "parentId"],
  guide: ["name", "url", "parentId"],
  spawn: ["name", "parentId", "position", "rotation"],
}

/** Tipos poco frecuentes: se agrupan en `otros` en vez de perderlos. */
const BUCKETS: { key: string; title: string; kinds: string[] }[] = [
  { key: "site", title: "Terreno", kinds: ["site"] },
  { key: "buildings", title: "Edificios", kinds: ["building"] },
  { key: "levels", title: "Niveles", kinds: ["level"] },
  { key: "zones", title: "Estancias", kinds: ["zone"] },
  { key: "walls", title: "Muros", kinds: ["wall", "fence"] },
  { key: "slabs", title: "Losas y techos", kinds: ["slab", "ceiling"] },
  { key: "roofs", title: "Cubiertas", kinds: ["roof", "roof-segment"] },
  { key: "columns", title: "Columnas", kinds: ["column"] },
  { key: "stairs", title: "Escaleras y elevación", kinds: ["stair", "stair-segment", "elevator"] },
  { key: "openings", title: "Aberturas", kinds: ["door", "window"] },
  { key: "items", title: "Objetos", kinds: ["item", "cabinet", "shelf"] },
]

/** Materiales referenciados por id: se listan aparte para no duplicarlos. */
function materialRef(node: unknown): string | undefined {
  const m = f(node, "material") ?? f(node, "materialPreset")
  if (typeof m === "string" && m) return m
  const id = f(m, "id")
  if (typeof id === "string" && id) return id
  const preset = f(m, "preset")
  if (typeof preset === "string" && preset) return `preset:${preset}`
  return undefined
}

export function buildAiJson(state: SceneStateLike): string {
  const all = Object.values(state.nodes)
  const byType = new Map<string, AnyNode[]>()
  for (const n of all) {
    const t = String(f(n, "type") ?? "node")
    const list = byType.get(t)
    if (list) list.push(n)
    else byType.set(t, [n])
  }
  const of = (kinds: string[]): AnyNode[] => kinds.flatMap((k) => byType.get(k) ?? [])

  const byId = new Map<string, AnyNode>(all.map((n) => [n.id as string, n]))

  // ── Estancias y aberturas: deducimos a qué ambientes toca cada abertura ──
  const openingsById = new Map<string, string[]>()
  const walls = of(["wall"])
  const zoneList = of(["zone"])

  const zones = zoneList.map((z) => {
    const r = rec(z)
    const pts = polygon(r)
    const name = str(r, "name", z.id as string)
    const openings: string[] = []

    for (const w of walls) {
      const wr = rec(w)
      const s = f(wr, "start") as [number, number] | undefined
      const e = f(wr, "end") as [number, number] | undefined
      if (!s || !e) continue
      if (distToPolygonEdge((s[0] + e[0]) / 2, (s[1] + e[1]) / 2, pts ?? []) > 0.35) continue

      for (const childId of (f(wr, "children") as string[] | undefined) ?? []) {
        const child = byId.get(childId)
        if (!child) continue
        const ct = f(child, "type")
        if (ct !== "door" && ct !== "window") continue
        if (str(child, "wallId", w.id as string) !== (w.id as string)) continue
        openings.push(childId)
        const bucket = openingsById.get(childId)
        if (bucket) bucket.push(name)
        else openingsById.set(childId, [name])
      }
    }

    return {
      node: z,
      name,
      pts,
      area: pts ? round(area(pts)) : null,
      perim: pts ? round(perimeter(pts)) : null,
      openings: [...new Set(openings)],
    }
  })

  const roomsOf = (openingId: string): string[] => [...new Set(openingsById.get(openingId) ?? [])].sort()

  // Pares de estancias unidas por una misma abertura.
  const adjacencies: { from: string; to: string; via: string; kind: string }[] = []
  for (const [openingId, roomsRaw] of openingsById) {
    const rooms = [...new Set(roomsRaw)].sort()
    if (rooms.length < 2) continue
    const kind = f(byId.get(openingId), "type") === "door" ? "puerta" : "ventana"
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        adjacencies.push({ from: rooms[i], to: rooms[j], via: openingId, kind })
      }
    }
  }
  adjacencies.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))

  // ── Condensado de un nodo ──────────────────────────────────────────────
  const condensed = (n: AnyNode): Record<string, unknown> => {
    const type = String(f(n, "type") ?? "node")
    const allowed = KEEP[type]
    // Los campos requeridos por el schema se incluyen SIEMPRE, aunque no estén
    // en KEEP: si un tipo gana un campo obligatorio, no puede perderse aquí o
    // una IA no podría recrear el nodo.
    const keys = allowed
      ? [...new Set([...allowed, ...(REQUIRED_FIELDS[type] ?? [])])]
      : Object.keys(rec(n))
    const out: Record<string, unknown> = { id: n.id, type }

    const src = rec(n)
    for (const key of keys) {
      if (NOISE.has(key)) continue
      const v = src[key]
      if (isEmpty(v)) continue
      out[key] = v
    }

    // El material no se embebe: viaja por referencia.
    const mat = materialRef(n)
    if (mat && out.materialPreset === undefined) out.material = mat

    return out
  }

  // Métricas derivadas que una IA no puede calcular a ojo.
  const zonesOut: Record<string, unknown> = {}
  for (const zi of zones) {
    zonesOut[zi.node.id as string] = {
      ...condensed(zi.node),
      area_m2: zi.area,
      perimeter_m: zi.perim,
      connects: zi.openings.map((id) => ({
        id,
        type: f(byId.get(id), "type"),
        to: roomsOf(id),
      })),
    }
  }

  const openingsOut: Record<string, unknown> = {}
  for (const o of of(["door", "window"])) {
    openingsOut[o.id as string] = {
      ...condensed(o),
      rooms: roomsOf(o.id as string),
    }
  }

  // Un objeto pertenece a la estancia más específica que lo contiene.
  const itemsOut: Record<string, unknown> = {}
  for (const it of of(["item", "cabinet", "shelf"])) {
    const p = pos(it)
    let room: string | null = null
    if (p) {
      const hit = zones
        .filter((zi) => zi.pts && pointInPolygon(p[0], p[2], zi.pts))
        .sort((a, b) => (a.area ?? Infinity) - (b.area ?? Infinity))[0]
      room = hit?.name ?? null
    }
    itemsOut[it.id as string] = { ...condensed(it), room }
  }

  const others: Record<string, unknown> = {}
  for (const [type, list] of byType) {
    if (BUCKETS.some((b) => b.kinds.includes(type))) continue
    for (const n of list) others[n.id as string] = condensed(n)
  }

  // ── Counts por tipo ────────────────────────────────────────────────────
  const counts: Record<string, number> = {}
  for (const [type, list] of byType) counts[type] = list.length

  // ── Materiales referenciados ──────────────────────────────────────────
  const materialsOut: Record<string, unknown> = {}
  for (const [id, mRaw] of Object.entries(state.materials ?? {})) {
    const m = rec(mRaw)
    const mat = rec(m.material)
    materialsOut[id] = {
      name: str(m, "name", id),
      ...(mat.preset ? { preset: mat.preset } : {}),
      ...(f(mat, "properties") ? { properties: f(mat, "properties") } : {}),
      ...(f(mat, "texture") ? { texture: f(mat, "texture") } : {}),
    }
  }

  const totalArea = round(zones.reduce((a, z) => a + (z.area ?? 0), 0))

  const doc: Record<string, unknown> = {
    $schema: "pascal/ai-scene@1",
    units: "m",
    coords: "xz en planta · y es la altura",
    rootNodeIds: state.rootNodeIds,
    counts,
    summary: {
      niveles: byType.get("level")?.length ?? 0,
      estancias: zones.length,
      superficie_total_m2: totalArea,
      muros: byType.get("wall")?.length ?? 0,
      puertas: byType.get("door")?.length ?? 0,
      ventanas: byType.get("window")?.length ?? 0,
      objetos: Object.keys(itemsOut).length,
    },
    adjacencies,
    materials: materialsOut,
  }

  for (const b of BUCKETS) {
    const list = of(b.kinds)
    const bucket: Record<string, unknown> = {}
    for (const n of list) {
      if (b.key === "zones") bucket[n.id as string] = zonesOut[n.id as string]
      else if (b.key === "openings") bucket[n.id as string] = openingsOut[n.id as string]
      else if (b.key === "items") bucket[n.id as string] = itemsOut[n.id as string]
      else bucket[n.id as string] = condensed(n)
    }
    doc[b.key] = bucket
  }
  if (Object.keys(others).length > 0) doc.otros = others

  return prettyJson(doc)
}
