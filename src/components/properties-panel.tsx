"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { nodeRegistry, useScene, type AnyNode, type AnyNodeId } from "@pascal-app/core"
import { useViewer } from "@pascal-app/viewer"
import { useEditor } from "@pascal-app/editor"
import {
  ChevronDown,
  Copy,
  Move,
  Search,
  Trash2,
  X,
} from "lucide-react"
import {
  displayValue,
  formatValue,
  groupsForNode,
  optionsFor,
  patchFor,
  rangeFor,
  readPath,
  type FieldGroup,
  type FieldSpec,
} from "@/lib/node-fields"

const FALLBACK_ICON = "/icons/item.webp"

const KIND_LABELS: Record<string, string> = {
  wall: "Muro",
  slab: "Piso",
  ceiling: "Cielo raso",
  zone: "Zona",
  column: "Columna",
  item: "Objeto",
  door: "Puerta",
  window: "Ventana",
  stair: "Escalera",
  "stair-segment": "Tramo",
  shelf: "Estante",
  elevator: "Ascensor",
  roof: "Cubierta",
  "roof-segment": "Faldón",
  fence: "Cercado",
  building: "Edificio",
  level: "Nivel",
  site: "Terreno",
}

function kindLabel(kind: string): string {
  const fromRegistry = nodeRegistry.get(kind)?.presentation?.label
  return fromRegistry ?? KIND_LABELS[kind] ?? kind
}

function kindIcon(kind: string): string {
  const icon: unknown = nodeRegistry.get(kind)?.presentation?.icon
  return typeof icon === "string" && icon.startsWith("/") ? icon : FALLBACK_ICON
}

export function PropertiesPanel() {
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const zoneId = useViewer((s) => s.selection.zoneId)
  const setSelection = useViewer((s) => s.setSelection)
  const setSelectedReferenceId = useEditor((s) => s.setSelectedReferenceId)
  const setMovingNode = useEditor((s) => s.setMovingNode)
  const setMode = useEditor((s) => s.setMode)
  const setTool = useEditor((s) => s.setTool)
  const [query, setQuery] = useState("")
  const [restOpen, setRestOpen] = useState(false)

  const ids = selectedIds as AnyNodeId[]
  const targetId: AnyNodeId | null =
    ids.length === 1 ? ids[0] : zoneId && ids.length === 0 ? (zoneId as AnyNodeId) : null

  const node = useScene((s) => (targetId ? (s.nodes[targetId] ?? null) : null))

  useEffect(() => {
    setQuery("")
  }, [targetId])

  /** Réplica exacta del path del inspector oficial: derive → reconcile → un updateNodes. */
  const commit = useCallback(
    (spec: FieldSpec, value: unknown) => {
      if (!targetId) return
      const scene = useScene.getState()
      const current = scene.nodes[targetId]
      if (!current) return
      const parametrics = nodeRegistry.get(current.type)?.parametrics

      let patch = patchFor(current, spec, value)
      if (parametrics?.derive) {
        patch = { ...patch, ...parametrics.derive({ ...current, ...patch } as AnyNode, patch) }
      }
      const updates: { id: AnyNodeId; data: Partial<AnyNode> }[] = [
        { id: targetId, data: patch as Partial<AnyNode> },
      ]
      if (parametrics?.reconcile) {
        updates.push(...parametrics.reconcile(current, { ...current, ...patch } as AnyNode))
      }
      scene.updateNodes(updates)
    },
    [targetId],
  )

  const close = useCallback(() => {
    setSelection({ selectedIds: [], zoneId: null })
    setSelectedReferenceId(null)
  }, [setSelection, setSelectedReferenceId])

  const handleMove = useCallback(() => {
    if (!node) return
    setMovingNode(node as never)
    close()
  }, [node, setMovingNode, close])

  const handleDuplicate = useCallback(() => {
    if (!node) return
    const scene = useScene.getState()
    const { id: _id, parentId, ...rest } = node
    const nextId = `${node.type}_${Math.random().toString(36).slice(2, 18)}`
    scene.createNode({ ...rest, id: nextId } as never, (parentId ?? undefined) as never)
  }, [node])

  const handleDelete = useCallback(() => {
    if (!targetId) return
    useScene.getState().deleteNodes([targetId])
    close()
  }, [targetId, close])

  const { curated, rest } = useMemo(
    () => (node ? groupsForNode(node) : { curated: [], rest: [] }),
    [node],
  )

  const filterGroups = (groups: FieldGroup[]) => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((group) => ({
        ...group,
        fields: group.fields.filter(
          (f) =>
            f.label.toLowerCase().includes(q) ||
            (f.path ? f.path.join(".").toLowerCase().includes(q) : false),
        ),
      }))
      .filter((group) => group.fields.length > 0)
  }

  const visibleCurated = filterGroups(curated)
  const visibleRest = filterGroups(rest)

  if (!node) {
    return (
      <aside className="props">
        <header className="props-head">
          <span className="tech-label">Propiedades</span>
          <button aria-label="Cerrar" className="props-x" onClick={close} type="button">
            <X className="h-3.5 w-3.5" />
          </button>
        </header>
        <div className="props-empty">
          {selectedIds.length > 1 ? (
            <>
              <p className="tech-label" style={{ color: "var(--primary)" }}>
                {selectedIds.length} seleccionados
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Seleccioná un único elemento para editar sus parámetros.
              </p>
            </>
          ) : (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Ningún elemento seleccionado. Hacé clic en una figura del plano.
            </p>
          )}
        </div>
      </aside>
    )
  }

  const def = nodeRegistry.get(node.type)
  const canMove = !!def?.capabilities.movable
  const canDelete = def?.capabilities.deletable !== false
  const totalRest = rest.reduce((acc, group) => acc + group.fields.length, 0)

  return (
    <aside className="props">
      <header className="props-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" className="props-kind-icon" src={kindIcon(node.type)} />
        <div className="min-w-0 flex-1">
          <p className="props-kind">{kindLabel(node.type)}</p>
          <p className="props-subid">{node.type}</p>
        </div>
        <button aria-label="Cerrar" className="props-x" onClick={close} type="button">
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="props-search">
        <Search className="h-3 w-3 shrink-0 opacity-60" />
        <input
          aria-label="Filtrar propiedades"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrar…"
          value={query}
        />
      </div>

      <div className="props-body">
        <div className="props-cols">
          <span>Parámetro</span>
          <span>Valor</span>
          <span>u.</span>
        </div>

        {visibleCurated.map((group) => (
          <Group key={group.id} group={group} node={node} onWrite={commit} />
        ))}

        {visibleRest.length > 0 && (
          <div className="mt-2">
            <button
              className="props-fold"
              onClick={() => setRestOpen((v) => !v)}
              type="button"
            >
              <span className="tech-label">Avanzado</span>
              <span className="stat">{totalRest}</span>
              <ChevronDown
                className={`h-3 w-3 transition-transform ${restOpen ? "rotate-180" : ""}`}
              />
            </button>
            {restOpen &&
              visibleRest.map((group) => (
                <Group key={group.id} group={group} node={node} onWrite={commit} />
              ))}
          </div>
        )}
      </div>

      <footer className="props-foot">
        {canMove && (
          <button className="props-act" onClick={handleMove} type="button">
            <Move className="h-3.5 w-3.5" />
            Mover
          </button>
        )}
        <button
          className="props-act"
          onClick={() => {
            setMode("select")
            setTool(null)
            handleDuplicate()
          }}
          type="button"
        >
          <Copy className="h-3.5 w-3.5" />
          Duplicar
        </button>
        {canDelete && (
          <button className="props-act props-act-danger" onClick={handleDelete} type="button">
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </button>
        )}
      </footer>
    </aside>
  )
}

/* ── Fila / celda ─────────────────────────────────────────────────────── */

function Group({
  group,
  node,
  onWrite,
}: {
  group: FieldGroup
  node: AnyNode
  onWrite: (spec: FieldSpec, value: unknown) => void
}) {
  const [open, setOpen] = useState(true)
  const collapsible = group.fields.length > 6

  return (
    <section className="props-group">
      <button
        className="props-fold"
        onClick={() => collapsible && setOpen((v) => !v)}
        type="button"
      >
        <span className="tech-label">{group.label}</span>
        <span className="stat">{group.fields.length}</span>
        {collapsible && (
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? "" : "-rotate-90"}`} />
        )}
      </button>
      {(!collapsible || open) &&
        group.fields.map((field) => (
          <Row key={field.label + (field.path?.join(".") ?? "")} field={field} node={node} onWrite={onWrite} />
        ))}
    </section>
  )
}

function Row({
  field,
  node,
  onWrite,
}: {
  field: FieldSpec
  node: AnyNode
  onWrite: (spec: FieldSpec, value: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const shown = displayValue(node, field)
  const isReadOnly = field.kind === "metric" || !field.path

  useEffect(() => {
    if (!editing) return
    setDraft(typeof shown === "number" ? String(Number(shown.toFixed(field.precision ?? 3))) : shown)
    requestAnimationFrame(() => inputRef.current?.select())
  }, [editing, shown, field.precision])

  if (field.kind === "bool") {
    const raw = readPath(node, field.path ?? [])
    const on = raw === true
    return (
      <div className="props-row">
        <span className="props-label">{field.label}</span>
        <button
          aria-pressed={on}
          className="props-check"
          data-on={on}
          onClick={() => onWrite(field, !on)}
          type="button"
        >
          <span />
        </button>
        <span />
      </div>
    )
  }

  if (field.kind === "enum") {
    const options = optionsFor(node, field)
    if (options.length === 0) return <MetricRow field={field} shown={shown} />
    return (
      <div className="props-row">
        <span className="props-label">{field.label}</span>
        <select
          className="props-select"
          onChange={(e) => onWrite(field, e.target.value)}
          value={String(shown)}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span />
      </div>
    )
  }

  if (field.kind === "text" || field.kind === "color") {
    const raw = readPath(node, field.path ?? [])
    if (typeof raw !== "string") return <MetricRow field={field} shown={shown} />
    if (field.kind === "color") {
      return (
        <div className="props-row">
          <span className="props-label">{field.label}</span>
          <span className="props-colorwrap">
            <input
              aria-label={field.label}
              className="props-color"
              onChange={(e) => onWrite(field, e.target.value)}
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(raw) ? raw : "#ffffff"}
            />
            <span className="props-colortxt">{raw}</span>
          </span>
          <span />
        </div>
      )
    }
    return (
      <div className="props-row">
        <span className="props-label">{field.label}</span>
        {editing ? (
          <input
            autoFocus
            className="props-input"
            onBlur={() => {
              onWrite(field, draft)
              setEditing(false)
            }}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
              if (e.key === "Escape") setEditing(false)
            }}
            ref={inputRef}
            value={draft}
          />
        ) : (
          <button
            className="props-input props-input-idle"
            onClick={() => setEditing(true)}
            type="button"
          >
            {shown}
          </button>
        )}
        <span />
      </div>
    )
  }

  if (isReadOnly) return <MetricRow field={field} shown={shown} />

  const range = rangeFor(node, field)
  const display = field.kind === "number" ? formatValue(field, Number(shown)) : String(shown)

  return (
    <div className="props-row props-row-num">
      <span className="props-label">{field.label}</span>
      {editing ? (
        <input
          autoFocus
          className="props-input"
          inputMode="decimal"
          onBlur={() => {
            const parsed = Number(draft)
            if (Number.isFinite(parsed)) onWrite(field, parsed)
            setEditing(false)
          }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            if (e.key === "Escape") setEditing(false)
          }}
          ref={inputRef}
          value={draft}
        />
      ) : (
        <button
          className="props-input props-input-idle"
          onClick={() => setEditing(true)}
          onDoubleClick={() => setEditing(true)}
          type="button"
        >
          {display}
        </button>
      )}
      <span className="props-unit">{field.unit ?? ""}</span>
      {range && (
        <input
          aria-label={`Ajustar ${field.label}`}
          className="props-range"
          max={range.max}
          min={range.min}
          onChange={(e) => onWrite(field, Number(e.target.value))}
          step={field.step ?? 0.01}
          type="range"
          value={Number(shown)}
        />
      )}
    </div>
  )
}

function MetricRow({ field, shown }: { field: FieldSpec; shown: number | string }) {
  return (
    <div className="props-row" data-read="true">
      <span className="props-label">{field.label}</span>
      <span className="props-metric">
        {field.kind === "number" ? formatValue(field, Number(shown)) : String(shown)}
      </span>
      <span className="props-unit">{field.unit ?? ""}</span>
    </div>
  )
}
