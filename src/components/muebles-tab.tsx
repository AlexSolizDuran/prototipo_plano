"use client"

import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import type { AssetInput } from "@pascal-app/core"
import { useEditor } from "@pascal-app/editor"
import { useViewer } from "@pascal-app/viewer"
import { ChevronRight, Search } from "lucide-react"
import { CATALOG_ES_ITEMS, CATALOG_GROUPS, matchesGroup, type CatalogGroup } from "@/lib/catalog-es"

/** Grupo sintético para lo que no entra en ninguna categoría. */
const OTROS: CatalogGroup = { slug: "otros", label: "Otros", icon: "/icons/room.webp" }

/**
 * Catálogo de mobiliario y electrodomésticos.
 *
 * Panel propio, en español. No usa el `ItemsPanel` del paquete porque sus
 * controles vienen en inglés y su grilla de categorías muestra solo íconos.
 *
 * Los grupos van plegados: se ven los 13 títulos con su cantidad y se despliega
 * el que se cliquea. Antes había una barra que filtraba y una grilla con scroll
 * propio, que obligaba a un mini-scroll por tipo; ahora es un solo scroll y el
 * índice completo está a la vista.
 *
 * Colocar un objeto arma la herramienta `item` (o la que traiga el ítem, como
 * el gabinete paramétrico) y limpia la selección, que es el mismo gesto que
 * hace el catálogo oficial.
 */
export function MueblesTab() {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState<Set<string>>(new Set())

  const setPhase = useEditor((s) => s.setPhase)
  const setMode = useEditor((s) => s.setMode)
  const setTool = useEditor((s) => s.setTool)
  const setSelectedItem = useEditor((s) => s.setSelectedItem)
  const selectedItem = useEditor((s) => s.selectedItem)
  const setSelection = useViewer((s) => s.setSelection)

  // Los ítems viven en la fase de amenable: varias capas asumen esa fase para
  // que la colocación enganche.
  useEffect(() => {
    setPhase("furnish")
  }, [setPhase])

  /** Secciones a renderizar: cada grupo con los objetos que le pertenecen. */
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hit = (item: (typeof CATALOG_ES_ITEMS)[number]) =>
      !q ||
      item.name.toLowerCase().includes(q) ||
      (item.tags ?? []).some((t) => t.toLowerCase().includes(q))

    const out: { group: CatalogGroup; items: typeof CATALOG_ES_ITEMS }[] = []
    // "todos" no se renderiza: es la unión del resto y duplicaría cada objeto.
    for (const group of CATALOG_GROUPS) {
      if (group.slug === "todos") continue
      const items = CATALOG_ES_ITEMS.filter((i) => matchesGroup(i, group) && hit(i))
      if (items.length > 0) out.push({ group, items })
    }

    // Un objeto puede caer en varios grupos a propósito (la mesa de luz es
    // también mesa y también noche). "Otros" recoge lo que no entró en ninguno,
    // para que ningún objeto quede inalcanzable.
    const rest = CATALOG_ES_ITEMS.filter(
      (i) =>
        hit(i) &&
        !CATALOG_GROUPS.some(
          (g) => g.slug !== "todos" && matchesGroup(i, g),
        ),
    )
    if (rest.length > 0) out.push({ group: OTROS, items: rest })

    return out
  }, [query])

  const total = sections.reduce((a, s) => a + s.items.length, 0)

  // Con el buscador escrito no hay nada oculto que el usuario no haya pedido
  // ver, así que las secciones con resultados se muestran abiertas.
  const searching = query.trim().length > 0
  const isOpen = (slug: string) => searching || open.has(slug)

  const toggle = (slug: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })

  const place = (item: AssetInput) => {
    setSelection({ selectedIds: [], zoneId: null })
    setSelectedItem(item)
    setTool((item as { tool?: string }).tool ?? "item")
    setMode("build")
  }

  return (
    <div className="cat-panel">
      <div className="cat-search">
        <Search className="h-3 w-3 shrink-0 opacity-60" />
        <input
          aria-label="Buscar objetos"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar objeto…"
          value={query}
        />
      </div>

      <div className="panel-scroll">
        {sections.length === 0 ? (
          <p className="cat-empty">Sin resultados para “{query}”.</p>
        ) : (
          sections.map(({ group, items }) => (
            <section className="panel-section" key={group.slug}>
              <button
                aria-expanded={isOpen(group.slug)}
                className="panel-section-head"
                data-open={isOpen(group.slug)}
                onClick={() => toggle(group.slug)}
                type="button"
              >
                <ChevronRight className="panel-section-chev h-3 w-3 shrink-0" />
                <Image alt="" height={16} src={group.icon} width={16} />
                <span className="panel-section-title">{group.label}</span>
                <span className="panel-section-n">{items.length}</span>
              </button>

              {isOpen(group.slug) && (
                <div className="cat-grid">
                  {items.map((item) => {
                    // La key es el `id`, no el `src`: `cabinet` y
                    // `kitchen-cabinet` comparten el mismo model.glb, y con
                    // `src` React se queja de claves duplicadas.
                    const active =
                      (selectedItem as { id?: string } | null)?.id === item.id
                    return (
                      <button
                        className="cat-tile"
                        data-active={active}
                        key={item.id}
                        onClick={() => place(item)}
                        title={item.name}
                        type="button"
                      >
                        <span className="cat-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img alt={item.name} loading="lazy" src={item.thumbnail} />
                        </span>
                        <span className="cat-name">{item.name}</span>
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
        {total} objetos. Elegí uno y hacé clic en el plano para colocarlo.
      </p>
    </div>
  )
}
