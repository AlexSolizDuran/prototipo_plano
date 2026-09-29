"use client"

import Image from "next/image"
import { loadPlugin } from "@pascal-app/core"
import { builtinPlugin } from "@pascal-app/nodes"
import { Editor, type SceneGraph, useEditor } from "@pascal-app/editor"
import { useCallback, useEffect, useState } from "react"
import { BuildTab } from "@/components/build-tab"
import { EditorNavbar } from "@/components/editor-navbar"
import { EstructuraTab } from "@/components/estructura-tab"
import { LevelBootstrap } from "@/components/level-bootstrap"
import { MaterialesTab } from "@/components/materiales-tab"
import { MueblesTab } from "@/components/muebles-tab"
import { PropertiesPanel } from "@/components/properties-panel"
import { ViewerHud } from "@/components/viewer-hud"

const registryReady = loadPlugin(builtinPlugin)

const SCENE_STORAGE_KEY = "pascal-editor-scene"

function createDefaultScene(): SceneGraph {
  const siteId = "site_default"
  const buildingId = "building_default"
  const levelId = "level_default"

  return {
    nodes: {
      [siteId]: {
        id: siteId,
        type: "site",
        polygon: {
          type: "polygon",
          points: [
            [-15, -15],
            [15, -15],
            [15, 15],
            [-15, 15],
          ],
        },
        children: [buildingId],
      },
      [buildingId]: {
        id: buildingId,
        type: "building",
        children: [levelId],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      },
      [levelId]: {
        id: levelId,
        type: "level",
        level: 0,
        children: [],
      },
    },
    rootNodeIds: [siteId],
  }
}

function loadSceneWithFallback(): SceneGraph | null {
  try {
    const raw = localStorage.getItem(SCENE_STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (data?.nodes && Object.keys(data.nodes).length > 0) {
        return data as SceneGraph
      }
    }
  } catch {}
  const defaultScene = createDefaultScene()
  try {
    localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(defaultScene))
  } catch {}
  return defaultScene
}

export default function EditorPage() {
  const [registryLoaded, setRegistryLoaded] = useState(false)
  const [editorLoading, setEditorLoading] = useState(true)

  useEffect(() => {
    void registryReady.then(() => {
      setRegistryLoaded(true)
    })
  }, [])
  const handleLoaderChange = useCallback((loading: boolean) => {
    setEditorLoading(loading)
    if (!loading) {
      requestAnimationFrame(() => {
        useEditor.setState({ navigationSyncPose: null })
        useEditor.getState().setViewMode("2d")
      })
    }
  }, [])

  const showLoading = !registryLoaded || editorLoading

  return (
    <div className="pascal-shell" style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      {registryLoaded && (
        <Editor
          layoutVersion="v2"
          projectId="mi-prototipo"
          onLoad={async () => loadSceneWithFallback()}
          onLoaderChange={handleLoaderChange}
          navbarSlot={<EditorNavbar projectName="Casa" />}
          viewerToolbarLeft={<ViewerHud />}
          sidebarTabs={[
            {
              id: "build",
              label: "Construir",
              icon: (
                <Image alt="" height={24} src="/icons/wall.webp" width={24} />
              ),
              component: BuildTab,
            },
            {
              id: "items",
              label: "Muebles",
              icon: (
                <Image alt="" height={24} src="/icons/couch.webp" width={24} />
              ),
              component: MueblesTab,
            },
            {
              id: "materials",
              label: "Materiales",
              icon: (
                <Image alt="" height={24} src="/icons/paint.webp" width={24} />
              ),
              component: MaterialesTab,
            },
            {
              id: "structure",
              label: "Estructura",
              icon: (
                <Image alt="" height={24} src="/icons/mesh.webp" width={24} />
              ),
              component: EstructuraTab,
            },
          ]}
        />
      )}
      <LevelBootstrap />
      <PropertiesPanel />
      {showLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background text-foreground">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">
            {!registryLoaded ? "Cargando módulos…" : "Cargando escena…"}
          </p>
        </div>
      )}
    </div>
  )
}
