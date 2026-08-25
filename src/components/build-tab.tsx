"use client"

import Image from "next/image"
import { useState, useEffect, useCallback } from "react"
import { useEditor } from "@pascal-app/editor"

const tools = [
  { id: "wall", icon: "/icons/wall.webp", label: "Muro", shortcut: "1" },
  { id: "door", icon: "/icons/door.webp", label: "Puerta", shortcut: "2" },
  { id: "window", icon: "/icons/window.webp", label: "Ventana", shortcut: "3" },
  { id: "slab", icon: "/icons/floor.webp", label: "Piso", shortcut: "4" },
  { id: "column", icon: "/icons/column.webp", label: "Columna", shortcut: "5" },
  { id: "zone", icon: "/icons/zone.webp", label: "Zona", shortcut: "Z" },
]

export function BuildTab() {
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const viewMode = useEditor((s) => s.viewMode)

  const selectTool = useCallback((toolId: string) => {
    const state = useEditor.getState()
    state.setPhase("structure")
    state.setStructureLayer(toolId === "zone" ? "zones" : "elements")
    state.setMode("build")
    state.setTool(toolId === "zone" ? null : toolId)
    setActiveTool(toolId)
  }, [])

  const selectMode = useCallback((mode: string) => {
    const state = useEditor.getState()
    state.setMode(mode as any)
    state.setTool(null)
    setActiveTool(null)
  }, [])

  const toggleView = useCallback(() => {
    const state = useEditor.getState()
    state.setViewMode(state.viewMode === "2d" ? "3d" : "2d")
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const map: Record<string, string> = { "1": "wall", "2": "door", "3": "window", "4": "slab", "5": "column", z: "zone" }
      const toolId = map[e.key.toLowerCase()]
      if (toolId) selectTool(toolId)
      if (e.key === "v") selectMode("select")
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectTool, selectMode])

  return (
    <div className="flex flex-col gap-3 p-3">
      <h3 className="text-sm font-semibold text-foreground">Herramientas</h3>
      <div className="grid grid-cols-3 gap-2">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => selectTool(t.id)}
            className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-all ${
              activeTool === t.id
                ? "border-blue-500 bg-blue-500/20 text-blue-400"
                : "border-border hover:border-muted-foreground/50 hover:bg-accent"
            }`}
          >
            <Image
              src={t.icon}
              alt={t.label}
              width={32}
              height={32}
              className={`object-contain ${activeTool === t.id ? "opacity-100" : "opacity-70"}`}
            />
            <span className="text-xs">{t.label}</span>
            <span className="text-[10px] text-muted-foreground">{t.shortcut}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Seleccioná una herramienta y hacé clic en el plano para dibujar.
      </p>
      <hr className="border-border" />
      <button
        onClick={toggleView}
        className="flex items-center justify-center gap-2 rounded-lg border border-border p-2 text-sm transition-all hover:bg-accent"
      >
        <span className="text-base">{viewMode === "2d" ? "📐" : "🧊"}</span>
        <span>{viewMode === "2d" ? "Ver en 3D" : "Ver en 2D"}</span>
      </button>
    </div>
  )
}
