export type PlanPoint = [number, number]

export interface PlanSite {
  id: string
  boundary: PlanPoint[]
}

export interface PlanCatalogEntry {
  assetId: string
  category: string
  name: string
}

export interface PlanDoor {
  id: string
  name?: string
  u: number
  width: number
  height: number
  type?: string
}

export interface PlanWindow {
  id: string
  name?: string
  u: number
  width: number
  height: number
  bottom: number
}

export interface PlanWall {
  id: string
  name?: string
  from: PlanPoint
  to: PlanPoint
  thickness: number
  height: number
  curve?: number
  doors: PlanDoor[]
  windows: PlanWindow[]
}

export interface PlanSlab {
  id: string
  name?: string
  outline: PlanPoint[]
  elevation?: number
  holes: PlanPoint[][]
}

export interface PlanZone {
  id: string
  name: string
  outline: PlanPoint[]
}

export interface PlanItem {
  id: string
  assetId: string
  category: string
  name: string
  position: [number, number, number]
  rotation: number
  scale: [number, number, number]
}

export interface PlanLevel {
  id: string
  number: number
  label: string
  elements: {
    walls: PlanWall[]
    slabs: PlanSlab[]
    zones: PlanZone[]
    items: PlanItem[]
  }
}

export interface PlanBuilding {
  id: string
  name?: string
  position: [number, number]
  yaw: number
  levels: PlanLevel[]
}

export interface PlanDocument {
  schema: "pascal.plan.v1"
  unit: "m"
  site: PlanSite | null
  catalog: PlanCatalogEntry[]
  buildings: PlanBuilding[]
}

export const PLAN_SCHEMA_VERSION = "pascal.plan.v1" as const
export const PLAN_UNIT = "m" as const