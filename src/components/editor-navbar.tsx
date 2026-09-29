"use client"

import { useCallback, useEffect, useState } from "react"
import { Box, Compass, Moon, Ruler, Scan, Settings, Sun, Zap } from "lucide-react"
import { useEditor } from "@pascal-app/editor"
import { useViewer } from "@pascal-app/viewer"

const THEME_KEY = "pascal-theme"

export function EditorNavbar({ projectName = "PROYECTO" }: { projectName?: string }) {
  const viewMode = useEditor((s) => s.viewMode)
  const gridSnapStep = useEditor((s) => s.gridSnapStep)
  const magneticSnap = useEditor((s) => s.magneticSnap)
  const mode = useEditor((s) => s.mode)
  const setViewMode = useEditor((s) => s.setViewMode)
  const setGridSnapStep = useEditor((s) => s.setGridSnapStep)
  const setMagneticSnap = useEditor((s) => s.setMagneticSnap)
  const setMode = useEditor((s) => s.setMode)
  const setTool = useEditor((s) => s.setTool)
  const sceneTheme = useViewer((s) => s.sceneTheme)
  const setSceneTheme = useViewer((s) => s.setSceneTheme)

  const [theme, setTheme] = useState<"dark" | "light">("dark")

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY)
    const next = stored === "light" ? "light" : "dark"
    setTheme(next)
    document.documentElement.classList.toggle("dark", next === "dark")
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark"
      document.documentElement.classList.toggle("dark", next === "dark")
      localStorage.setItem(THEME_KEY, next)
      return next
    })
  }, [])

  const snapTo = useCallback(
    (step: 0.5 | 0.25 | 0.1 | 0.05) => {
      setGridSnapStep(step)
    },
    [setGridSnapStep],
  )

  return (
    <div className="topbar">
      <div className="brand-mark">P</div>
      <span className="brand-name">Pascal</span>
      <span className="tech-divider h-4 w-px" />
      <span className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
        {projectName}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <div className="seg">
          <button
            data-active={viewMode === "2d"}
            onClick={() => setViewMode("2d")}
            type="button"
          >
            <Scan className="h-3.5 w-3.5" />
            2D
          </button>
          <button
            data-active={viewMode === "3d"}
            onClick={() => setViewMode("3d")}
            type="button"
          >
            <Box className="h-3.5 w-3.5" />
            3D
          </button>
        </div>

        <div className="seg">
          <button
            data-active={mode === "select"}
            onClick={() => {
              setMode("select")
              setTool(null)
            }}
            type="button"
          >
            <Compass className="h-3.5 w-3.5" />
            Select
          </button>
        </div>

        <div className="hud">
          <Ruler className="h-3.5 w-3.5" />
          Snap
          {[0.5, 0.25, 0.1, 0.05].map((step) => (
            <button
              key={step}
              className="hover:text-foreground"
              onClick={() => snapTo(step as 0.5 | 0.25 | 0.1 | 0.05)}
              type="button"
            >
              <strong
                className={
                  gridSnapStep === step
                    ? "text-primary underline underline-offset-2"
                    : undefined
                }
              >
                {step}
              </strong>
            </button>
          ))}
        </div>

        <button
          aria-label="Imantado"
          className="icon-btn"
          data-active={magneticSnap}
          onClick={() => setMagneticSnap(!magneticSnap)}
          title="Imantado"
          type="button"
        >
          <Zap className="h-3.5 w-3.5" />
        </button>

        <button
          aria-label="Tema de escena"
          className="icon-btn"
          onClick={() => setSceneTheme(sceneTheme === "night" ? "overcast" : "night")}
          title="Ambiente 3D"
          type="button"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>

        <button
          aria-label="Tema claro/oscuro"
          className="icon-btn"
          onClick={toggleTheme}
          title="Tema"
          type="button"
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}
