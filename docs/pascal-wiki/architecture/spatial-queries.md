# Consultas espaciales

*Validación de colocación para herramientas — `canPlaceOnFloor`, `canPlaceOnWall`, `canPlaceOnCeiling`.*

Se aplica a: `apps/editor/components/tools/**`.

`useSpatialQuery()` valida si un elemento puede colocarse en una posición dada sin superponerse a elementos existentes. Toda herramienta de colocación debe llamarla antes de confirmar un nodo en la escena.

**Fuente**: `packages/core/src/hooks/spatial-grid/use-spatial-query.ts`

## Hook

```ts
const { canPlaceOnFloor, canPlaceOnWall, canPlaceOnCeiling } = useSpatialQuery()
```

Los tres métodos devuelven `{ valid: boolean; conflictIds: string[] }`.
`canPlaceOnWall` devuelve además `adjustedY: number` (altura ajustada).

---

## canPlaceOnFloor

```ts
canPlaceOnFloor(
  levelId: string,
  position: [number, number, number],
  dimensions: [number, number, number],   // scaled width/height/depth
  rotation: [number, number, number],
  ignoreIds?: string[],                   // pass [draftItem.id] to exclude self
): { valid: boolean; conflictIds: string[] }
```

**Uso en una herramienta:**
```ts
const pos: [number, number, number] = [x, 0, z]
const { valid } = canPlaceOnFloor(levelId, pos, getScaledDimensions(item), item.rotation, [item.id])
if (valid) createNode(item, levelId)
```

---

## canPlaceOnWall

```ts
canPlaceOnWall(
  levelId: string,
  wallId: string,
  localX: number,          // distance along wall from start
  localY: number,          // height from floor
  dimensions: [number, number, number],
  attachType: 'wall' | 'wall-side',  // 'wall' needs clearance both sides; 'wall-side' only one
  side?: 'front' | 'back',
  ignoreIds?: string[],
): { valid: boolean; conflictIds: string[]; adjustedY: number }
```

`adjustedY` contiene la Y ajustada para que los elementos queden a ras sobre la losa — úsala siempre en lugar del `localY` bruto:

```ts
const { valid, adjustedY } = canPlaceOnWall(levelId, wallId, x, y, dims, 'wall', undefined, [item.id])
if (valid) updateNode(item.id, { wallT: x, wallY: adjustedY })
```

---

## canPlaceOnCeiling

```ts
canPlaceOnCeiling(
  ceilingId: string,
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
  ignoreIds?: string[],
): { valid: boolean; conflictIds: string[] }
```

---

## Elevación de losas

Cuando los elementos descansan sobre una losa (no sobre suelo plano), usa esto para obtener la Y correcta:

```ts
import { spatialGridManager } from '@pascal-app/core'

// Y at a single point
const y = spatialGridManager.getSlabElevationAt(levelId, x, z)

// Y considering the item's full footprint (highest slab point under item)
const y = spatialGridManager.getSlabElevationForItem(levelId, position, dimensions, rotation)
```

---

## Reglas

- **Pasa siempre `[item.id]` en `ignoreIds`** al validar un elemento en borrador que ya existe en la escena — de lo contrario colisiona consigo mismo.
- **Usa `adjustedY` de `canPlaceOnWall`** — no uses la Y del cursor bruta para elementos montados en muros.
- **Usa `getScaledDimensions(item)`** (`packages/core/src/schema/nodes/item.ts`) para tener en cuenta la escala del elemento, no el `asset.dimensions` bruto.
- Valida en cada movimiento del puntero para obtener retroalimentación en vivo (resalta el fantasma en rojo/verde). Solo hace `createNode` / `updateNode` al soltar el puntero o al hacer clic.

Consulta `apps/editor/components/tools/item/use-placement-coordinator.tsx` para una implementación completa.

## Descanso en superficies host

`resolveSurfacePlacement` comprueba el centro de la huella después del ajuste (snapping) y la rotación activos,
expresado en el marco de la superficie. Transforma el punto medio de los límites locales escalados; los límites
omitidos usan por defecto una caja centrada en la base. Proyectar una caja rotada sobre XZ conserva ese centro.
El límite exterior incluye la pequeña tolerancia existente; los límites y los interiores de agujeros se rechazan.
El voladizo y un hijo más grande que su host son válidos. La comprobación de ajuste nunca recorta ni mueve la pose.
Las superficies derivadas de impactos usan el rectángulo de límites locales del host cuando hay dimensiones disponibles.

El catálogo y los movilizadores del registro usan este predicado para la colocación y el movimiento. Salir de la región
desvincula a través de la vía existente de vista previa suelo/soporte. Los rechazos conservan razones legibles por máquina
y el color normal de vista previa inválida, sin etiqueta de texto. El evento de rejilla emparejado no puede convertir una
vista previa de superficie rechazada en una confirmación de suelo oculta. La validación de adjuntos procedurales usa la misma
regla de centro para que un voladizo permitido sobreviva a la validación. La retención de planos de planta comparte el resolutor;
su comportamiento de desvinculación existente no cambia.