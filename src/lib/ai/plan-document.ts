import { getLevelDisplayName } from "@pascal-app/core"
import type { AnyNode, AnyNodeId } from "@pascal-app/core/schema"
import { collectCatalog } from "./catalog"
import {
  PLAN_SCHEMA_VERSION,
  PLAN_UNIT,
  type PlanBuilding,
  type PlanDoor,
  type PlanItem,
  type PlanLevel,
  type PlanSlab,
  type PlanWall,
  type PlanWindow,
  type PlanZone,
} from "./types"

const WALL_THICKNESS_FALLBACK = 0.1
const WALL_HEIGHT_FALLBACK = 2.5
const SLAB_ELEVATION_FALLBACK = 0.05
const DOOR_WIDTH_FALLBACK = 0.9
const DOOR_HEIGHT_FALLBACK = 2.1
const WINDOW_WIDTH_FALLBACK = 1.5
const WINDOW_HEIGHT_FALLBACK = 1.5

const round3 = (value: number): number => Math.round(value * 1000) / 1000

function asRaw(node: AnyNode): Record<string, any> {
  return node as unknown as Record<string, any>
}

function resolveChildren(nodes: Record<AnyNodeId, AnyNode>, node: AnyNode): AnyNode[] {
  const raw = asRaw(node)
  const ids: unknown = raw.children
  if (!Array.isArray(ids)) return []
  return ids
    .map((id) => nodes[id as AnyNodeId])
    .filter((child): child is AnyNode => Boolean(child))
}

function polygonPoints(raw: Record<string, any>): [number, number][] {
  const points: unknown = raw.polygon?.points
  if (!Array.isArray(points)) return []
  return points.map((p: any) => [
    round3(typeof p?.[0] === "number" ? p[0] : 0),
    round3(typeof p?.[1] === "number" ? p[1] : 0),
  ])
}

function projectDoor(node: AnyNode): PlanDoor {
  const raw = asRaw(node)
  const position: number[] = Array.isArray(raw.position) ? raw.position : [0, 0, 0]
  const name = typeof node.name === "string" && node.name ? node.name : undefined
  return {
    id: node.id,
    ...(name !== undefined ? { name } : {}),
    u: round3(position[0] ?? 0),
    width: round3(raw.width ?? DOOR_WIDTH_FALLBACK),
    height: round3(raw.height ?? DOOR_HEIGHT_FALLBACK),
    ...(raw.doorType ? { type: raw.doorType } : {}),
  }
}

function projectWindow(node: AnyNode): PlanWindow {
  const raw = asRaw(node)
  const position: number[] = Array.isArray(raw.position) ? raw.position : [0, 0, 0]
  const height = raw.height ?? WINDOW_HEIGHT_FALLBACK
  const name = typeof node.name === "string" && node.name ? node.name : undefined
  return {
    id: node.id,
    ...(name !== undefined ? { name } : {}),
    u: round3(position[0] ?? 0),
    width: round3(raw.width ?? WINDOW_WIDTH_FALLBACK),
    height: round3(height),
    bottom: round3((position[1] ?? 0) - height / 2),
  }
}

function projectWall(nodes: Record<AnyNodeId, AnyNode>, node: AnyNode): PlanWall {
  const raw = asRaw(node)
  const start: number[] = Array.isArray(raw.start) ? raw.start : [0, 0]
  const end: number[] = Array.isArray(raw.end) ? raw.end : [0, 0]
  const name = typeof node.name === "string" && node.name ? node.name : undefined

  const hosted: { doors: PlanDoor[]; windows: PlanWindow[] } = {
    doors: [],
    windows: [],
  }
  for (const child of resolveChildren(nodes, node)) {
    if (asRaw(child).parentId !== node.id) continue
    if (child.type === "door") hosted.doors.push(projectDoor(child))
    else if (child.type === "window") hosted.windows.push(projectWindow(child))
  }

  return {
    id: node.id,
    ...(name !== undefined ? { name } : {}),
    from: [round3(start[0] ?? 0), round3(start[1] ?? 0)],
    to: [round3(end[0] ?? 0), round3(end[1] ?? 0)],
    thickness: round3(raw.thickness ?? WALL_THICKNESS_FALLBACK),
    height: round3(raw.height ?? WALL_HEIGHT_FALLBACK),
    ...(typeof raw.curveOffset === "number" && raw.curveOffset !== 0
      ? { curve: round3(raw.curveOffset) }
      : {}),
    doors: hosted.doors,
    windows: hosted.windows,
  }
}

function projectSlab(node: AnyNode): PlanSlab {
  const raw = asRaw(node)
  const name = typeof node.name === "string" && node.name ? node.name : undefined
  const holes: number[][] = Array.isArray(raw.holes) ? raw.holes : []
  return {
    id: node.id,
    ...(name !== undefined ? { name } : {}),
    outline: polygonPoints(raw),
    elevation: round3(raw.elevation ?? SLAB_ELEVATION_FALLBACK),
    holes: holes.map((points) =>
      (Array.isArray(points) ? points : []).map((p: any) => [
        round3(typeof p?.[0] === "number" ? p[0] : 0),
        round3(typeof p?.[1] === "number" ? p[1] : 0),
      ]),
    ),
  }
}

function projectZone(node: AnyNode): PlanZone {
  const raw = asRaw(node)
  return {
    id: node.id,
    name: typeof node.name === "string" ? node.name : (raw.name ?? ""),
    outline: polygonPoints(raw),
  }
}

function projectItem(node: AnyNode): PlanItem {
  const raw = asRaw(node)
  const position: number[] = Array.isArray(raw.position) ? raw.position : [0, 0, 0]
  const rotation: number[] = Array.isArray(raw.rotation) ? raw.rotation : [0, 0, 0]
  const scale: number[] = Array.isArray(raw.scale) ? raw.scale : [1, 1, 1]
  const asset: Record<string, any> =
    typeof raw.asset === "object" && raw.asset !== null ? raw.asset : {}
  return {
    id: node.id,
    assetId: asset.id ?? "",
    category: asset.category ?? "",
    name: asset.name ?? (typeof node.name === "string" ? node.name : ""),
    position: [round3(position[0] ?? 0), round3(position[1] ?? 0), round3(position[2] ?? 0)],
    rotation: round3(rotation[1] ?? 0),
    scale: [
      round3(scale[0] ?? 1),
      round3(scale[1] ?? 1),
      round3(scale[2] ?? 1),
    ],
  }
}

function projectLevel(nodes: Record<AnyNodeId, AnyNode>, node: AnyNode): PlanLevel {
  const raw = asRaw(node)
  const elements = { walls: [], slabs: [], zones: [], items: [] } as {
    walls: PlanWall[]
    slabs: PlanSlab[]
    zones: PlanZone[]
    items: PlanItem[]
  }
  for (const child of resolveChildren(nodes, node)) {
    switch (child.type) {
      case "wall":
        elements.walls.push(projectWall(nodes, child))
        break
      case "slab":
        elements.slabs.push(projectSlab(child))
        break
      case "zone":
        elements.zones.push(projectZone(child))
        break
      case "item":
        if (asRaw(child).parentId === node.id) elements.items.push(projectItem(child))
        break
      default:
        break
    }
  }
  return {
    id: node.id,
    number: typeof raw.level === "number" ? raw.level : 0,
    label: getLevelDisplayName(node as Parameters<typeof getLevelDisplayName>[0]),
    elements,
  }
}

function projectBuilding(nodes: Record<AnyNodeId, AnyNode>, node: AnyNode): PlanBuilding {
  const raw = asRaw(node)
  const position: number[] = Array.isArray(raw.position) ? raw.position : [0, 0, 0]
  const rotation: number[] = Array.isArray(raw.rotation) ? raw.rotation : [0, 0, 0]
  const levels = resolveChildren(nodes, node)
    .filter((child) => child.type === "level")
    .map((child) => projectLevel(nodes, child))
    .sort((a, b) => a.number - b.number)
  return {
    id: node.id,
    ...(typeof node.name === "string" && node.name ? { name: node.name } : {}),
    position: [round3(position[0] ?? 0), round3(position[2] ?? 0)],
    yaw: round3(rotation[1] ?? 0),
    levels,
  }
}

export function toPlanDoc(
  nodes: Record<AnyNodeId, AnyNode>,
  rootNodeIds: AnyNodeId[],
): import("./types").PlanDocument {
  const nodeList = Object.values(nodes)
  const site = nodeList.find((node) => node.type === "site")

  const buildings: AnyNode[] = site
    ? resolveChildren(nodes, site).filter((child) => child.type === "building")
    : nodeList.filter((node) => node.type === "building")

  return {
    schema: PLAN_SCHEMA_VERSION,
    unit: PLAN_UNIT,
    site: site
      ? {
          id: site.id,
          boundary: polygonPoints(asRaw(site)),
        }
      : null,
    catalog: collectCatalog(nodes),
    buildings: buildings.map((building) => projectBuilding(nodes, building)),
  }
}