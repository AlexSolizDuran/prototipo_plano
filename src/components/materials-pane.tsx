"use client"

import { MaterialPaintPanel, useEditor } from "@pascal-app/editor"
import { useEffect } from "react"

export function MaterialsPane() {
  useEffect(() => {
    const editor = useEditor.getState()
    editor.setPhase("structure")
    editor.setStructureLayer("elements")
    editor.setMode("material-paint")
    return () => {
      useEditor.getState().setMode("select")
    }
  }, [])

  return <MaterialPaintPanel />
}