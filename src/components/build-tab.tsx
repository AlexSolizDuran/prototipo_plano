"use client"

import Image from "next/image"
import { useState, useEffect, useCallback } from "react"
import { ChevronDown, Sparkles } from "lucide-react"
import { useEditor } from "@pascal-app/editor"

/**
 * Las 9 herramientas de estructura.
 *
 * Los `id` son los del union `StructureTool` del paquete: `stair` (no
 * `stairs`), `ceiling`, `slab`, `column`, `zone`, `roof`, `wall`, `door`,
 * `window`. Un id que no exista deja la herramienta muda.
 */
type StructureTool =
  | "wall"
  | "door"
  | "window"
  | "slab"
  | "ceiling"
  | "column"
  | "stair"
  | "roof"
  | "zone"

const tools: { id: StructureTool; icon: string; label: string; shortcut: string }[] = [
  { id: "wall", icon: "/icons/wall.webp", label: "Muro", shortcut: "1" },
  { id: "door", icon: "/icons/door.webp", label: "Puerta", shortcut: "2" },
  { id: "window", icon: "/icons/window.webp", label: "Ventana", shortcut: "3" },
  { id: "slab", icon: "/icons/floor.webp", label: "Piso", shortcut: "4" },
  { id: "column", icon: "/icons/column.webp", label: "Columna", shortcut: "5" },
  { id: "ceiling", icon: "/icons/ceiling.webp", label: "Techo", shortcut: "6" },
  { id: "stair", icon: "/icons/stairs.webp", label: "Escalera", shortcut: "7" },
  { id: "roof", icon: "/icons/roof.webp", label: "Tejado", shortcut: "8" },
  { id: "zone", icon: "/icons/zone.webp", label: "Zona", shortcut: "Z" },
]

const SHORTCUT_MAP: Record<string, StructureTool> = {
  "1": "wall",
  "2": "door",
  "3": "window",
  "4": "slab",
  "5": "column",
  "6": "ceiling",
  "7": "stair",
  "8": "roof",
  z: "zone",
}

export function BuildTab() {
  const [activeTool, setActiveTool] = useState<StructureTool | null>(null)
  const viewMode = useEditor((s) => s.viewMode)
  const setViewMode = useEditor((s) => s.setViewMode)

  const selectTool = useCallback((toolId: StructureTool) => {
    const state = useEditor.getState()
    state.setPhase("structure")
    // `zone` dibuja sobre la capa de zonas; el resto sobre elementos.
    state.setStructureLayer(toolId === "zone" ? "zones" : "elements")
    state.setMode("build")
    state.setTool(toolId)
    setActiveTool(toolId)
  }, [])

  const selectMode = useCallback((mode: string) => {
    const state = useEditor.getState()
    state.setMode(mode as never)
    state.setTool(null)
    setActiveTool(null)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const toolId = SHORTCUT_MAP[e.key.toLowerCase()]
      if (toolId) selectTool(toolId)
      if (e.key.toLowerCase() === "v") selectMode("select")
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectTool, selectMode])

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-baseline justify-between">
        <span className="tech-label">Herramientas</span>
        <span className="tool-key">{tools.length} activas</span>
      </div>

      <div className="tool-grid">
        {tools.map((t) => (
          <button
            className="tool-btn"
            data-active={activeTool === t.id}
            key={t.id}
            onClick={() => selectTool(t.id)}
            title={`${t.label} (${t.shortcut})`}
            type="button"
          >
            <Image alt={t.label} height={26} src={t.icon} width={26} />
            <span className="text-[9px] leading-none tracking-wide uppercase">{t.label}</span>
            <span className="tool-key">{t.shortcut}</span>
          </button>
        ))}
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Elegí una herramienta y hacé clic en el plano. <kbd className="tool-key">V</kbd> vuelve a
        selección, <kbd className="tool-key">1–8</kbd> cambia de herramienta.
      </p>

      <div className="tech-divider" />

      <div className="flex flex-col gap-2">
        <span className="tech-label">Vista</span>
        <div className="seg w-full">
          <button
            className="flex-1 justify-center"
            data-active={viewMode === "2d"}
            onClick={() => setViewMode("2d")}
            type="button"
          >
            Planta 2D
          </button>
          <button
            className="flex-1 justify-center"
            data-active={viewMode === "3d"}
            onClick={() => setViewMode("3d")}
            type="button"
          >
            Modelo 3D
          </button>
        </div>
      </div>

      <div className="tech-divider" />

      <button
        className="flex w-full items-center justify-between border border-border px-2 py-1.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase hover:bg-accent hover:text-accent-foreground"
        onClick={() => selectMode("select")}
        type="button"
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          Asistente
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
