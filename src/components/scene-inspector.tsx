"use client"

import { useScene } from "@pascal-app/core"
import { type AnyNode, type AnyNodeId } from "@pascal-app/core/schema"
import { useEffect, useMemo, useState } from "react"
import { formatJson } from "@/lib/format-json"
import { toPlanDoc } from "@/lib/ai/plan-document"

const SCENE_STORAGE_KEY = "pascal-editor-scene"
const SELECTION_STORAGE_KEY = "pascal-editor-selection"

type ChildrenList = string[]

function getChildren(node: AnyNode): ChildrenList {
  const maybe = (node as unknown as { children?: unknown }).children
  return Array.isArray(maybe) ? (maybe as string[]) : []
}

const TYPE_ICONS: Record<string, string> = {
  site: "🏠",
  building: "🏢",
  level: "📏",
  wall: "🧱",
  door: "🚪",
  window: "🪟",
  slab: "🧩",
  ceiling: "⬆️",
  roof: "🔺",
  "roof-segment": "🔻",
  zone: "📍",
  item: "🛋️",
  stair: "🪜",
  column: "🏛️",
  fence: "🚧",
  guide: "🖼️",
  scan: "🌀",
  elevator: "🛗",
  measurement: "📐",
  spawn: "▶️",
  shelf: "📚",
  "solar-panel": "🔆",
  chimney: "🏭",
  skylight: "💡",
  dormer: "🏚️",
  cabinet: "🗄️",
  gutter: "🚿",
  downspout: "〰️",
  duct: "🌀",
  pipe: "🔧",
  hvac: "🌬️",
  vent: "💨",
  default: "📦",
}

function typeIcon(type: string): string {
  return TYPE_ICONS[type] ?? TYPE_ICONS.default
}

const TYPE_CHIP_COLOR: Record<string, string> = {
  container: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  element: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  object: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  reference: "border-purple-500/40 bg-purple-500/10 text-purple-300",
}

function chipColorFor(type: string): string {
  const group = ["site", "building", "level"].includes(type)
    ? "container"
    : ["guide", "scan", "measurement", "spawn", "zone"].includes(type)
      ? "reference"
      : ["item", "door", "window", "cabinet", "shelf", "elevator"].includes(type)
        ? "object"
        : "element"
  return TYPE_CHIP_COLOR[group]
}

function shortId(id: string): string {
  const parts = id.split("_")
  return parts.length > 1 ? `_${parts[parts.length - 1]}` : id
}

function getNode(nodes: Record<AnyNodeId, AnyNode>, id: string): AnyNode | undefined {
  return nodes[id as AnyNodeId]
}

function NodeRow({
  node,
  depth,
  nodes,
}: {
  node: AnyNode
  depth: number
  nodes: Record<AnyNodeId, AnyNode>
}) {
  const [collapsed, setCollapsed] = useState(depth >= 3)
  const children = getChildren(node)
  const visibleChildren = children.filter((id) => getNode(nodes, id))
  const hasChildren = visibleChildren.length > 0

  return (
    <>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-xs transition-colors hover:bg-accent"
        style={{ paddingLeft: `${depth * 14}px` }}
        onClick={() => hasChildren && setCollapsed((c) => !c)}
      >
        <span className="w-3 shrink-0 text-muted-foreground">
          {hasChildren ? (collapsed ? "▸" : "▾") : ""}
        </span>
        <span className="shrink-0">{typeIcon(node.type)}</span>
        <span className="min-w-0 flex-1 truncate text-foreground">
          {node.name || node.type}
        </span>
        <span
          className={`shrink-0 rounded border px-1 font-mono text-[10px] uppercase ${chipColorFor(node.type)}`}
        >
          {node.type}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
          {shortId(node.id)}
        </span>
      </button>
      {!collapsed &&
        visibleChildren.map((childId) => {
          const child = getNode(nodes, childId)
          if (!child) return null
          return (
            <NodeRow
              depth={depth + 1}
              key={childId}
              node={child}
              nodes={nodes}
            />
          )
        })}
    </>
  )
}

function TreeView() {
  const nodes = useScene((s) => s.nodes)
  const rootNodeIds = useScene((s) => s.rootNodeIds)

  const { treeRoots, orphans } = useMemo(() => {
    const reachable = new Set<string>()
    const roots: AnyNode[] = []
    for (const id of rootNodeIds) {
      const node = getNode(nodes, id)
      if (!node) continue
      reachable.add(id)
      roots.push(node)
    }
    const orphanIds = Object.keys(nodes).filter(
      (id) => !reachable.has(id) && !getNode(nodes, id)?.metadata,
    )
    const parentIds = new Set(
      Object.values(nodes)
        .map((n) => (n as { parentId?: string | null }).parentId)
        .filter((p): p is string => Boolean(p)),
    )
    const finalOrphans = orphanIds.filter((id) => !parentIds.has(id))
    return { treeRoots: roots, orphans: finalOrphans }
  }, [nodes, rootNodeIds])

  if (treeRoots.length === 0) {
    return <p className="p-3 text-xs text-muted-foreground">La escena está vacía.</p>
  }

  return (
    <div className="flex flex-col gap-1">
      {treeRoots.map((root) => (
        <NodeRow depth={0} key={root.id} node={root} nodes={nodes} />
      ))}
      {orphans.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Huérfanos
          </p>
          {orphans.map((id) => {
            const node = getNode(nodes, id)
            if (!node) return null
            return <NodeRow depth={0} key={id} node={node} nodes={nodes} />
          })}
        </div>
      )}
    </div>
  )
}

function JsonView() {
  const nodes = useScene((s) => s.nodes)
  const rootNodeIds = useScene((s) => s.rootNodeIds)
  const collections = useScene((s) => s.collections)
  const materials = useScene((s) => s.materials)
  const installedPlugins = useScene((s) => s.installedPlugins)

  const json = useMemo(
    () =>
      formatJson({
        nodes,
        rootNodeIds,
        collections,
        materials,
        installedPlugins,
      }),
    [nodes, rootNodeIds, collections, materials, installedPlugins],
  )

  return (
    <pre className="max-h-full overflow-auto rounded-md bg-zinc-950/60 p-2 font-mono text-[10px] leading-relaxed text-zinc-300 outline outline-1 outline-white/10">
      {json}
    </pre>
  )
}

function PlanStructureView() {
  const nodes = useScene((s) => s.nodes)
  const rootNodeIds = useScene((s) => s.rootNodeIds)

  const json = useMemo(
    () => formatJson(toPlanDoc(nodes, rootNodeIds)),
    [nodes, rootNodeIds],
  )

  return (
    <pre className="max-h-full overflow-auto rounded-md bg-zinc-950/60 p-2 font-mono text-[10px] leading-relaxed text-zinc-300 outline outline-1 outline-white/10">
      {json}
    </pre>
  )
}

export function SceneInspector() {
  const nodes = useScene((s) => s.nodes)
  const materials = useScene((s) => s.materials)
  const collections = useScene((s) => s.collections)
  const [view, setView] = useState<"tree" | "json" | "plan">("tree")
  const [confirming, setConfirming] = useState(false)

  const stats = useMemo(() => {
    const byType = new Map<string, number>()
    for (const node of Object.values(nodes)) {
      byType.set(node.type, (byType.get(node.type) ?? 0) + 1)
    }
    return { total: Object.keys(nodes).length, byType }
  }, [nodes])

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(timer)
  }, [confirming])

  function handleClearProject() {
    useScene.getState().clearScene()
    try {
      localStorage.removeItem(SCENE_STORAGE_KEY)
      localStorage.removeItem(SELECTION_STORAGE_KEY)
    } catch {}
    setConfirming(false)
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex overflow-hidden rounded-lg border border-border">
          <button
            className={`px-3 py-1 text-xs transition-colors ${
              view === "tree"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setView("tree")}
            type="button"
          >
            Árbol
          </button>
          <button
            className={`border-l px-3 py-1 text-xs transition-colors ${
              view === "json"
                ? "bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setView("json")}
            type="button"
          >
            JSON
          </button>
          <button
            className={`border-l px-3 py-1 text-xs transition-colors ${
              view === "plan"
                ? "bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setView("plan")}
            type="button"
          >
            Estructura
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {stats.total} nodos · {Object.keys(materials).length} mat. ·{" "}
            {Object.keys(collections).length} col.
          </span>
          {confirming ? (
            <span className="flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-300">
              ¿Limpiar todo?
              <button
                className="rounded bg-red-600 px-1.5 py-0.5 font-semibold text-white hover:bg-red-500"
                onClick={handleClearProject}
                type="button"
              >
                Sí
              </button>
              <button
                className="rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setConfirming(false)}
                type="button"
              >
                No
              </button>
            </span>
          ) : (
            <button
              className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
              onClick={() => setConfirming(true)}
              title="Limpiar todo el proyecto"
              type="button"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {view === "tree" ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-muted/30 p-1">
          <TreeView />
        </div>
      ) : view === "plan" ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
          <PlanStructureView />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
          <JsonView />
        </div>
      )}

      {view === "tree" && (
        <div className="flex flex-wrap gap-1.5">
          {[...stats.byType.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <span
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${chipColorFor(type)}`}
                key={type}
              >
                {typeIcon(type)} {type}
                <span className="font-mono opacity-80">{count}</span>
              </span>
            ))}
        </div>
      )}
    </div>
  )
}