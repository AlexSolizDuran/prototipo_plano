"use client"

import { useEffect, useRef } from "react"
import { useScene, type AnyNode, type AnyNodeId } from "@pascal-app/core"
import { useViewer } from "@pascal-app/viewer"

type LevelLike = AnyNode & { level: number }

/**
 * Selecciona el primer edificio y nivel disponibles al cargar la escena.
 *
 * Varias herramientas de colocación (escalera, ascensor) leen
 * `selection.levelId` y hacen `return` temprano si es `null`, así que sin
 * esta selección quedan mudas hasta que el usuario toque el selector de
 * niveles flotante. Solo actúa cuando no hay nivel elegido, de modo que no
 * compite con la selección manual.
 */
export function LevelBootstrap() {
  const didRun = useRef(false)
  const nodes = useScene((s) => s.nodes)
  const selectedLevelId = useViewer((s) => s.selection.levelId)
  const selectedBuildingId = useViewer((s) => s.selection.buildingId)
  const setSelection = useViewer((s) => s.setSelection)

  useEffect(() => {
    if (didRun.current) return
    if (selectedLevelId) {
      didRun.current = true
      return
    }

    const list = Object.values(nodes) as AnyNode[]
    const building = list.find((n) => n?.type === "building")
    if (!building) return

    const levels = ((building.children ?? []) as AnyNodeId[])
      .map((id) => nodes[id] as LevelLike | undefined)
      .filter((n): n is LevelLike => n?.type === "level")
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))

    if (levels.length === 0) return

    didRun.current = true
    setSelection({
      buildingId: selectedBuildingId ?? building.id,
      levelId: levels[0].id as never,
    })
  }, [nodes, selectedLevelId, selectedBuildingId, setSelection])

  return null
}
