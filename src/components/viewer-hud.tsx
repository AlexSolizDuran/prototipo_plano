"use client"

import { Grid2x2, Layers, Magnet, Ruler } from "lucide-react"
import { useEditor } from "@pascal-app/editor"

const STEPS: Array<{ value: 0.5 | 0.25 | 0.1 | 0.05; label: string }> = [
  { value: 0.5, label: "50cm" },
  { value: 0.25, label: "25cm" },
  { value: 0.1, label: "10cm" },
  { value: 0.05, label: "5cm" },
]

export function ViewerHud() {
  const gridSnapStep = useEditor((s) => s.gridSnapStep)
  const magneticSnap = useEditor((s) => s.magneticSnap)
  const setGridSnapStep = useEditor((s) => s.setGridSnapStep)
  const setMagneticSnap = useEditor((s) => s.setMagneticSnap)

  return (
    <div className="flex items-center gap-2">
      <div className="hud">
        <Ruler className="h-3.5 w-3.5 text-primary" />
        <span className="text-[9px]">Paso</span>
        {STEPS.map((step) => (
          <button
            key={step.value}
            className="hover:text-foreground"
            onClick={() => setGridSnapStep(step.value)}
            type="button"
          >
            <strong
              className={
                gridSnapStep === step.value
                  ? "text-primary underline underline-offset-2"
                  : undefined
              }
            >
              {step.label}
            </strong>
          </button>
        ))}
      </div>

      <button
        className="icon-btn"
        data-active={magneticSnap}
        onClick={() => setMagneticSnap(!magneticSnap)}
        title="Imantado a Bordes"
        type="button"
      >
        <Magnet className="h-3.5 w-3.5" />
      </button>

      <div className="hud">
        <Grid2x2 className="h-3.5 w-3.5 text-primary" />
        <span>Malilla</span>
        <strong>{gridSnapStep.toFixed(2)}m</strong>
      </div>

      <div className="hud">
        <Layers className="h-3.5 w-3.5 text-primary" />
        <span>Nivel</span>
        <strong>0</strong>
      </div>
    </div>
  )
}
