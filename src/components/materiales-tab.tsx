"use client"

import { useMemo, useState } from "react"
import {
  type AnyNodeId,
  type MaterialCategory,
  MATERIAL_CATEGORIES,
  getMaterialsForCategory,
  toLibraryMaterialRef,
  useScene,
} from "@pascal-app/core"
import { buildResetSurfaceMaterialUpdates, useEditor } from "@pascal-app/editor"
import { resolveCdnUrl, useViewer } from "@pascal-app/viewer"
import { ChevronRight, Eraser, RotateCcw, Search } from "lucide-react"

/** Nombre en español de cada categoría de la biblioteca de materiales. */
const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  colors: "Colores",
  wood: "Madera",
  stone: "Piedra",
  brick: "Ladrillo",
  tile: "Baldosa",
  concrete: "Hormigón y revoco",
  metal: "Metal",
  fabric: "Tela",
  leather: "Cuero",
  roofing: "Cubierta",
  ground: "Terreno",
  glass: "Vidrio",
}

/**
 * Traducción de los nombres de la biblioteca. Los ids no se traducen (son la
 * clave del preset) pero el texto que ve el usuario sí.
 */
const MATERIAL_LABELS: Record<string, string> = {
  // Colores
  "preset-white": "Blanco",
  "preset-softwhite": "Blanco suave",
  "preset-cream": "Crema",
  "preset-beige": "Beige",
  "preset-lightgrey": "Gris claro",
  "preset-greige": "Greige",
  "preset-midgrey": "Gris medio",
  "preset-charcoal": "Grafito",
  "preset-nearblack": "Negro intenso",
  "preset-blush": "Rubor",
  "preset-tomato": "Tomate",
  "preset-brickred": "Rojo ladrillo",
  "preset-oxblood": "Granate",
  "preset-peach": "Durazno",
  "preset-terracotta": "Terracota",
  "preset-burntorange": "Naranja tostado",
  "preset-clay": "Arcilla",
  "preset-paleyellow": "Amarillo pálido",
  "preset-mustard": "Mostaza",
  "preset-ochre": "Ocre",
  "preset-gold": "Dorado",
  "preset-mint": "Menta",
  "preset-sage": "Salvia",
  "preset-olive": "Oliva",
  "preset-forest": "Bosque",
  "preset-paleteal": "Verde agua claro",
  "preset-teal": "Verde azulado",
  "preset-deepteal": "Verde azulado oscuro",
  "preset-powderblue": "Azul polvo",
  "preset-softblue": "Azul suave",
  "preset-sky": "Cielo",
  "preset-slateblue": "Azul pizarra",
  "preset-royalblue": "Azul real",
  "preset-navy": "Azul marino",
  "preset-lavender": "Lavanda",
  "preset-plum": "Ciruela",
  "preset-aubergine": "Berenjena",
  "preset-petal": "Pétalo",
  "preset-rose": "Rosa",
  "preset-dustyrose": "Rosa apagado",
  "preset-berry": "Baya",
  "preset-sand": "Arena",
  "preset-tan": "Canela",
  "preset-taupe": "Taupe",
  "preset-espresso": "Expreso",
  // Metal y vidrio
  "preset-metal": "Metal",
  "preset-glass": "Vidrio",
}

function materialLabel(id: string, fallback: string): string {
  const base = MATERIAL_LABELS[id] ?? fallback
  // Quita el sufijo numérico de los presets de textura ("Wood Parquet 14").
  return base.replace(/\s+\d+$/, "")
}

/**
 * Pestaña de pinturas y materiales.
 *
 * No reutiliza el panel de pintura del paquete: es propio y está en español.
 * Al elegir un material se arma el modo `material-paint` con ese preset como
 * pincel, y el siguiente clic en la escena lo aplica sobre la superficie
 * apuntada. El borrador paints con material vacío, que es como el editor
 * interpreta "resetear esta superficie".
 */
export function MaterialesTab() {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState<Set<string>>(new Set())

  const activePaintMaterial = useEditor((s) => s.activePaintMaterial)
  const activePaintTarget = useEditor((s) => s.activePaintTarget)
  const setActivePaintMaterial = useEditor((s) => s.setActivePaintMaterial)
  const setMode = useEditor((s) => s.setMode)
  const setTool = useEditor((s) => s.setTool)
  const paintEraser = useEditor((s) => s.paintEraser)
  const setPaintEraser = useEditor((s) => s.setPaintEraser)

  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const nodes = useScene((s) => s.nodes)
  const updateNodes = useScene((s) => s.updateNodes)
  const selectedId = selectedIds.length === 1 ? (selectedIds[0] as AnyNodeId) : null
  const selectedNode = selectedId ? nodes[selectedId] : null

  /**
   * Categorías con sus materiales, todas desplegadas. Antes había una barra
   * que elegía una sola categoría y una grilla con scroll propio: eso forzaba
   * a un mini-scroll por tipo para recorrer las 114 pinturas.
   */
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase()
    return MATERIAL_CATEGORIES.map((c) => ({
      category: c,
      materials: getMaterialsForCategory(c).filter(
        (m) =>
          !q ||
          materialLabel(m.id, m.label).toLowerCase().includes(q) ||
          (m.description ?? "").toLowerCase().includes(q),
      ),
    })).filter((s) => s.materials.length > 0)
  }, [query])

  const total = sections.reduce((a, s) => a + s.materials.length, 0)

  // Con el buscador escrito se muestran abiertas las categorías con resultados:
  // si no, un Materiales de 45 colores taparía el resto.
  const searching = query.trim().length > 0
  const isOpen = (key: string) => searching || open.has(key)

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const apply = (materialId: string) => {
    setPaintEraser(false)
    setActivePaintMaterial({
      materialPreset: toLibraryMaterialRef(materialId),
      sourceTarget: activePaintTarget,
    })
    setTool(null)
    setMode("material-paint")
  }

  const toggleEraser = () => {
    const next = !paintEraser
    setPaintEraser(next)
    if (next) {
      setActivePaintMaterial({ materialPreset: undefined, sourceTarget: activePaintTarget })
      setTool(null)
      setMode("material-paint")
    }
  }

  /** Resetea todas las superficies del nodo seleccionado a su material por defecto. */
  const resetSelection = () => {
    if (!selectedNode) return
    const updates = buildResetSurfaceMaterialUpdates(nodes, selectedNode)
    if (updates.length > 0) updateNodes(updates)
  }

  return (
    <div className="mat-panel">
      <div className="mat-actions">
        <button
          aria-pressed={paintEraser}
          className="mat-btn"
          data-active={paintEraser}
          onClick={toggleEraser}
          type="button"
        >
          <Eraser className="h-3.5 w-3.5" />
          Borrar
        </button>
        <button
          className="mat-btn"
          disabled={!selectedNode}
          onClick={resetSelection}
          type="button"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restablecer
        </button>
      </div>

      <div className="tech-divider" />

      <div className="cat-search">
        <Search className="h-3 w-3 shrink-0 opacity-60" />
        <input
          aria-label="Buscar materiales"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar material…"
          value={query}
        />
      </div>

      <div className="panel-scroll">
        {sections.length === 0 ? (
          <p className="cat-empty">Sin resultados para “{query}”.</p>
        ) : (
          sections.map(({ category: c, materials }) => (
            <section className="panel-section" key={c}>
              <button
                aria-expanded={isOpen(c)}
                className="panel-section-head"
                data-open={isOpen(c)}
                onClick={() => toggle(c)}
                type="button"
              >
                <ChevronRight className="panel-section-chev h-3 w-3 shrink-0" />
                <span className="panel-section-title">{CATEGORY_LABELS[c]}</span>
                <span className="panel-section-n">{materials.length}</span>
              </button>

              {isOpen(c) && (
                <div className="mat-grid">
                  {materials.map((m) => {
                    const active =
                      activePaintMaterial?.materialPreset === toLibraryMaterialRef(m.id)
                    return (
                      <button
                        className="mat-tile"
                        data-active={active}
                        key={m.id}
                        onClick={() => apply(m.id)}
                        title={m.description ?? materialLabel(m.id, m.label)}
                        type="button"
                      >
                        <span className="mat-thumb">
                          {m.previewThumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              alt={materialLabel(m.id, m.label)}
                              loading="lazy"
                              src={resolveCdnUrl(m.previewThumbnailUrl) ?? ""}
                            />
                          ) : (
                            <span
                              className="mat-swatch"
                              style={{ backgroundColor: m.previewColor ?? "#20231d" }}
                            />
                          )}
                        </span>
                        <span className="mat-name">{materialLabel(m.id, m.label)}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          ))
        )}
      </div>

      <p className="mat-hint">
        {total} materiales. Elegí uno y hacé clic en una superficie para aplicarlo.
      </p>
    </div>
  )
}
