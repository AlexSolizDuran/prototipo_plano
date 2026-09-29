import type { AnyNode, AnyNodeId } from "@pascal-app/core"

/** Lectura segura de un campo: si no existe, devuelve `undefined`. */
function f(node: unknown, key: string): unknown {
  if (node && typeof node === "object") return (node as Record<string, unknown>)[key]
  return undefined
}

/** Igual que `f`, pero garantiza string. */
function str(node: unknown, key: string, fallback = "—"): string {
  const v = f(node, key)
  return typeof v === "string" && v ? v : fallback
}

function num(value: unknown, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return value.toFixed(digits)
}

function round(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/**
 * Estructura cruda del editor: el árbol site → building → level → nodos tal
 * como lo guarda `useScene`. Sirve para depurar y para ver exactamente qué
 * está almacenando el editor.
 */
export function buildEditorStructure(nodes: Record<AnyNodeId, AnyNode>): string {
  const out: string[] = []
  const byParent = new Map<string, AnyNode[]>()

  for (const node of Object.values(nodes)) {
    const parent = (node as { parentId?: string | null }).parentId
    const key = parent ?? "∅"
    const bucket = byParent.get(key)
    if (bucket) bucket.push(node)
    else byParent.set(key, [node])
  }

  for (const bucket of byParent.values()) {
    bucket.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
  }

  const label = (node: AnyNode): string => {
    const name = f(node as never, "name")
    const level = f(node as never, "level")
    const kind = f(node as never, "kind")
    const bits: string[] = []
    if (typeof name === "string" && name) bits.push(`"${name}"`)
    if (typeof level === "number") bits.push(`nivel=${level}`)
    if (typeof kind === "string" && kind) bits.push(`kind=${kind}`)
    return bits.length ? `${node.type} ${bits.join(" ")}` : node.type
  }

  const walk = (node: AnyNode, depth: number): void => {
    const pad = "  ".repeat(depth)
    out.push(`${pad}${node.type}  ${node.id}`)
    const kids = byParent.get(node.id) ?? []
    for (const child of kids) walk(child, depth + 1)
  }

  const roots = byParent.get("∅") ?? []
  roots.sort((a, b) => a.id.localeCompare(b.id))
  for (const root of roots) walk(root, 0)

  const orphans = Object.values(nodes).filter(
    (n) => n.parentId && !nodes[n.parentId as AnyNodeId],
  )
  if (orphans.length) {
    out.push("")
    out.push(`── huérfanos (${orphans.length}) ──`)
    for (const o of orphans.sort((a, b) => a.id.localeCompare(b.id))) {
      out.push(`  ${label(o)}  ${o.id}  (parentId=${o.parentId})`)
    }
  }

  return out.join("\n")
}

/** Polígono de un nodo: lista de [x, z]. */
function polygon(node: Record<string, unknown>): [number, number][] | null {
  const p = f(node, "polygon") as
    | { type?: string; points?: [number, number][] }
    | undefined
  if (!p || !Array.isArray(p.points) || p.points.length < 3) return null
  return p.points
}

/** Área con la fórmula del polígono (shoelace). */
function area(points: [number, number][]): number {
  let a = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

/** Perímetro cerrado. */
function perimeter(points: [number, number][]): number {
  let p = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    p += Math.hypot(x2 - x1, y2 - y1)
  }
  return p
}

/** Distancia de un punto al segmento. */
function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Distancia de un punto al borde de un polígono (0 si está dentro). */
function distToPolygonEdge(px: number, py: number, pts: [number, number][]): number {
  let min = Infinity
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[(i + 1) % pts.length]
    min = Math.min(min, distToSegment(px, py, ax, ay, bx, by))
  }
  return min
}

function pointInPolygon(px: number, py: number, pts: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function position(node: Record<string, unknown>): [number, number, number] | null {
  const p = f(node, "position")
  if (Array.isArray(p) && p.length >= 3 && p.every((v) => typeof v === "number")) {
    return p as [number, number, number]
  }
  return null
}

/**
 * Estructura semántica recomendada para un modelo de IA.
 *
 * El árbol crudo del editor no sirve para razonar: los ids son opacos
 * (`wall_l3k9x2`), las relaciones hay que deducirlas y no hay magnitudes.
 * Acá se reagrupa el mismo estado en cinco secciones estables:
 *
 *   1. RESUMEN      contadores y superficies agregadas
 *   2. ESTANCIAS    ambientes con área, perímetro, altura y aberturas
 *   3. ABERTURAS    puertas y ventanas con la estancia que conectan
 *   4. ELEMENTOS    muros, losas, techos, columnas, escaleras
 *   5. CONTENIDO    mobiliario con su estancia y relación de apoyo
 *
 * Unidades en metros, ids con prefijo de tipo, orden estable y sin campos
 * vacíos: se puede(diff) y se puede leer en voz alta.
 */
export function buildAiStructure(nodes: Record<AnyNodeId, AnyNode>): string {
  const all = Object.values(nodes)
  const rec = (n: AnyNode) => n as unknown as Record<string, unknown>
  // Los ids son strings en runtime aunque el tipo sea un union de plantillas.
  const byId = new Map<string, { type: string } & Record<string, unknown>>(
    all.map((n) => [n.id as string, rec(n) as { type: string } & Record<string, unknown>]),
  )

  const childrenOf = (id: string): AnyNode[] => all.filter((n) => n.parentId === (id as AnyNodeId))

  const levels = all
    .filter((n) => n.type === "level")
    .sort((a, b) => Number(f(rec(a), "level") ?? 0) - Number(f(rec(b), "level") ?? 0))

  const zones = all.filter((n) => n.type === "zone")
  const walls = all.filter((n) => n.type === "wall")
  const doors = all.filter((n) => n.type === "door")
  const windows = all.filter((n) => n.type === "window")
  const slabs = all.filter((n) => n.type === "slab")
  const ceilings = all.filter((n) => n.type === "ceiling")
  const columns = all.filter((n) => n.type === "column")
  const stairs = all.filter((n) => n.type === "stair")
  const items = all.filter((n) => n.type === "item")
  const roofs = all.filter((n) => n.type === "roof")

  // ── Estancias: cada zona con su geometría y sus aberturas ──────────────
  // `openingsById` mapea cada abertura a TODAS las estancias que toca: una
  // puerta en un muro compartido pertenece a las dos, y esa es exactamente la
  // información que necesita un modelo para razonar adyacencias.
  const openingsById = new Map<string, string[]>()
  const zoneInfo = zones.map((z) => {
    const r = rec(z)
    const pts = polygon(r)
    const openings: string[] = []

    for (const w of walls) {
      const wr = rec(w)
      const s = f(wr, "start") as [number, number] | undefined
      const e = f(wr, "end") as [number, number] | undefined
      if (!s || !e) continue
      const d = distToPolygonEdge((s[0] + e[0]) / 2, (s[1] + e[1]) / 2, pts ?? [])
      if (d > 0.35) continue

      for (const childId of (f(wr, "children") as string[] | undefined) ?? []) {
        const child = byId.get(childId)
        if (!child) continue
        if (child.type !== "door" && child.type !== "window") continue
        if (str(child, "wallId", w.id) !== w.id) continue
        openings.push(childId)
        const bucket = openingsById.get(childId)
        const ziName = typeof f(r, "name") === "string" && f(r, "name") ? (f(r, "name") as string) : z.id
        if (bucket) bucket.push(ziName)
        else openingsById.set(childId, [ziName])
      }
    }

    return {
      node: z,
      name: typeof f(r, "name") === "string" && f(r, "name") ? (f(r, "name") as string) : z.id,
      area: pts ? area(pts) : null,
      perim: pts ? perimeter(pts) : null,
      holes: Array.isArray(f(r, "holes")) ? ((f(r, "holes") as unknown[]) ?? []).length : 0,
      openings: [...new Set(openings)].sort(),
      pts,
    }
  })

  // ── Contenido: cada objeto, en qué estancia cae y en qué se apoya ─────
  const itemsInfo = items.map((it) => {
    const r = rec(it)
    const pos = position(r)
    const dims = f(r, "dimensions") as number[] | undefined
    const name =
      (typeof f(r, "name") === "string" && (f(r, "name") as string)) ||
      (typeof f(r, "kind") === "string" && (f(r, "kind") as string)) ||
      it.id

    let host = "libre"
    if (pos) {
      // Si las zonas se superponen, gana la más específica (la de menor
      // superficie): un sillón dentro de una habitación de 4x4 pertenece a la
      // habitación, no a la parcela de 20x20 que la contiene.
      const candidates = zoneInfo
        .filter((zi) => zi.pts && pointInPolygon(pos[0], pos[2], zi.pts))
        .sort((a, b) => (a.area ?? Infinity) - (b.area ?? Infinity))
      if (candidates.length > 0) host = candidates[0].name
    }
    if (host === "libre" && pos) {
      let best: { name: string; d: number } | null = null
      for (const zi of zoneInfo) {
        if (!zi.pts) continue
        const d = distToPolygonEdge(pos[0], pos[2], zi.pts)
        if (!best || d < best.d) best = { name: zi.name, d }
      }
      if (best && best.d < 1.5) host = `${best.name} (borde)`
    }

    return {
      node: it,
      name,
      category: typeof f(r, "category") === "string" ? (f(r, "category") as string) : null,
      pos,
      dims,
      rotation: f(r, "rotation") as number[] | undefined,
      host,
      attachTo: typeof f(r, "attachTo") === "string" ? (f(r, "attachTo") as string) : null,
      surface: typeof f(r, "surface") === "object" ? (f(r, "surface") as { height?: number }) : null,
    }
  })

  // ── Emisión ───────────────────────────────────────────────────────────
  const L: string[] = []
  const totalArea = zoneInfo.reduce((a, z) => a + (z.area ?? 0), 0)

  /** Estancias que toca una abertura, deduplicadas y ordenadas. */
  const roomsOf = (openingId: string): string => {
    const list = [...new Set(openingsById.get(openingId) ?? [])].sort()
    return list.length ? list.join(" + ") : "—"
  }

  /**
   * Pares de estancias unidas por una misma abertura. Solo las puertas
   * generan conectividad real; una ventana las separa pero las vincula.
   */
  const adjacencies: { from: string; to: string; via: string; kind: string }[] = []
  for (const [openingId, roomsRaw] of openingsById) {
    const rooms = [...new Set(roomsRaw)].sort()
    if (rooms.length < 2) continue
    const kind = byId.get(openingId)?.type === "door" ? "puerta" : "ventana"
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        adjacencies.push({ from: rooms[i], to: rooms[j], via: openingId, kind })
      }
    }
  }
  adjacencies.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))

  L.push("MANIFIESTO DE MODELO — consumo recomendado por IA")
  L.push("unidades: metros · ids estables · orden fijo")
  L.push("")

  L.push("== RESUMEN ==")
  L.push(`niveles: ${levels.length}`)
  L.push(`estancias: ${zones.length}  superficie_total: ${round(totalArea)} m2`)
  L.push(`muros: ${walls.length}  puertas: ${doors.length}  ventanas: ${windows.length}`)
  L.push(`losas: ${slabs.length}  techos: ${ceilings.length}  tejados: ${roofs.length}`)
  L.push(`columnas: ${columns.length}  escaleras: ${stairs.length}`)
  L.push(`objetos: ${items.length}`)
  L.push("")

  L.push("== ESTANCIAS ==")
  if (zoneInfo.length === 0) {
    L.push("(ninguna: crear zonas para que el modelo entienda los ambientes)")
  } else {
    for (const zi of [...zoneInfo].sort((a, b) => (b.area ?? 0) - (a.area ?? 0))) {
      const nPuertas = zi.openings.filter((id) => byId.get(id)?.type === "door").length
      const nVents = zi.openings.filter((id) => byId.get(id)?.type === "window").length
      L.push(`${zi.name}  id=${zi.node.id}`)
      L.push(
        `  superficie=${zi.area != null ? round(zi.area) : "?"} m2  perimetro=${zi.perim != null ? round(zi.perim) : "?"} m  puertas=${nPuertas}  ventanas=${nVents}`,
      )
      if (zi.holes > 0) L.push(`  huecos_interiores=${zi.holes}`)
    }
  }
  L.push("")

  L.push("== ABERTURAS ==")
  if (doors.length + windows.length === 0) {
    L.push("(ninguna)")
  } else {
    for (const d of [...doors].sort((a, b) => a.id.localeCompare(b.id))) {
      const r = rec(d)
      L.push(
        `puerta  id=${d.id}  ancho=${num(f(r, "width"))} m  alto=${num(f(r, "height"))} m  tipo=${str(r, "doorType", "estandar")}  vano=${str(r, "openingKind", "hoja")}  estancias=${roomsOf(d.id)}`,
      )
    }
    for (const w of [...windows].sort((a, b) => a.id.localeCompare(b.id))) {
      const r = rec(w)
      const sill = f(r, "sill")
      L.push(
        `ventana id=${w.id}  ancho=${num(f(r, "width"))} m  alto=${num(f(r, "height"))} m  tipo=${str(r, "windowType", "estandar")}  antepecho=${typeof sill === "number" ? num(sill) : "—"} m  estancias=${roomsOf(w.id)}`,
      )
    }
  }
  L.push("")

  L.push("== ADYACENCIAS ==")
  if (adjacencies.length === 0) {
    L.push("(ninguna: se deduce cuando una puerta o ventana une dos estancias)")
  } else {
    for (const a of adjacencies) L.push(`${a.from} <-> ${a.to}  via=${a.via} (${a.kind})`)
  }
  L.push("")

  L.push("== ELEMENTOS ==")
  if (walls.length === 0 && slabs.length === 0 && stairs.length === 0) {
    L.push("(ninguno)")
  } else {
    for (const w of [...walls].sort((a, b) => a.id.localeCompare(b.id))) {
      const r = rec(w)
      const s = f(r, "start") as [number, number] | undefined
      const e = f(r, "end") as [number, number] | undefined
      const length =
        s && e ? Math.hypot(e[0] - s[0], e[1] - s[1]) + (Number(f(r, "curveOffset")) || 0) : null
      L.push(
        `muro    id=${w.id}  largo=${length != null ? round(length) : "?"} m  espesor=${num(f(r, "thickness"))} m  alto=${num(f(r, "height"))} m  aberturas=${((f(r, "children") as AnyNodeId[]) ?? []).length}`,
      )
    }
    for (const s of [...slabs].sort((a, b) => a.id.localeCompare(b.id))) {
      const r = rec(s)
      const pts = polygon(r)
      L.push(
        `losa    id=${s.id}  superficie=${pts ? round(area(pts)) : "?"} m2  cota=${num(f(r, "elevation"))} m  huecos=${Array.isArray(f(r, "holes")) ? (f(r, "holes") as unknown[]).length : 0}`,
      )
    }
    for (const c of [...ceilings].sort((a, b) => a.id.localeCompare(b.id))) {
      L.push(`techo   id=${c.id}  altura=${num(f(rec(c), "height"))} m`)
    }
    for (const c of [...columns].sort((a, b) => a.id.localeCompare(b.id))) {
      const r = rec(c)
      L.push(
        `columna id=${c.id}  seccion=${num(f(r, "width"), 3)}x${num(f(r, "depth"), 3)} m  alto=${num(f(r, "height"))} m`,
      )
    }
    for (const s of stairs) {
      const r = rec(s)
      const segs = childrenOf(s.id).filter((c) => c.type === "stair-segment")
      L.push(
        `escalera id=${s.id}  tramos=${segs.length}  nombre=${String(f(r, "name") ?? "—")}`,
      )
    }
  }
  L.push("")

  L.push("== CONTENIDO ==")
  if (itemsInfo.length === 0) {
    L.push("(ninguno)")
  } else {
    const groups = new Map<string, typeof itemsInfo>()
    for (const it of itemsInfo) {
      const key = it.host
      const bucket = groups.get(key)
      if (bucket) bucket.push(it)
      else groups.set(key, [it])
    }
    for (const host of [...groups.keys()].sort()) {
      L.push(`${host}:`)
      for (const it of groups.get(host)!.sort((a, b) => a.name.localeCompare(b.name))) {
        const pos = it.pos ? `xyz=${round(it.pos[0])},${round(it.pos[1])},${round(it.pos[2])}` : "xyz=—"
        const dims = it.dims
          ? `${round(it.dims[0])}x${round(it.dims[1])}x${round(it.dims[2])}`
          : "dims=?"
        const extra = it.attachTo ? `  apoyo=${it.attachTo}` : ""
        L.push(`  ${it.name}  id=${it.node.id}  ${dims} m  ${pos}${extra}`)
      }
    }
  }

  return L.join("\n")
}
