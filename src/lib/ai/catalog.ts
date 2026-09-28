import type { AnyNode, AnyNodeId } from "@pascal-app/core/schema"
import type { PlanCatalogEntry } from "./types"

function asRaw(node: AnyNode): Record<string, any> {
  return node as unknown as Record<string, any>
}

export function collectCatalog(nodes: Record<AnyNodeId, AnyNode>): PlanCatalogEntry[] {
  const seen = new Set<string>()
  const catalog: PlanCatalogEntry[] = []
  for (const node of Object.values(nodes)) {
    if (node.type !== "item") continue
    const asset: Record<string, any> =
      typeof asRaw(node).asset === "object" && asRaw(node).asset !== null
        ? asRaw(node).asset
        : {}
    const assetId = typeof asset.id === "string" && asset.id ? asset.id : ""
    if (!assetId || seen.has(assetId)) continue
    seen.add(assetId)
    catalog.push({
      assetId,
      category: typeof asset.category === "string" ? asset.category : "",
      name: typeof asset.name === "string" ? asset.name : "",
    })
  }
  return catalog
}