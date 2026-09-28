# Esquemas de nodos

*Definiciones de tipos de nodos, patrón de esquema Zod, y cómo crear nodos en la escena.*

Se aplica a: `packages/core/src/schema/**`.

Todos los tipos de nodos se definen como esquemas Zod en `packages/core/src/schema/nodes/`. Cada esquema extiende `BaseNode` y exporta tanto el esquema como su tipo de TypeScript inferido.

**Fuentes**: `packages/core/src/schema/base.ts`, `packages/core/src/schema/nodes/`

## BaseNode

Cada nodo comparte estos campos:

```ts
{
  object: 'node'            // always literal 'node'
  id: string                // typed ID e.g. "wall_abc123"
  type: string              // node type discriminator e.g. "wall"
  name?: string             // optional display name
  parentId: string | null   // parent node ID; null = root
  visible: boolean          // defaults to true
  metadata: Record<string, unknown>  // arbitrary JSON, defaults to {}
}
```

`visible: false` saca al nodo y a todo lo que está debajo de él del plano 2D y de todas las exportaciones. `site` es la única excepción: es la referencia del lote (parcel), por lo que ocultarlo oculta solo su propio relleno de suelo y su límite, y los edificios sobre él conservan su propia bandera. La regla vive en `hidesDescendants` (`packages/core/src/lib/node-visibility.ts`); `validate_scene` y Load Build advierten cuando un Site está oculto.

## Definir un nuevo tipo de nodo

```ts
// packages/core/src/schema/nodes/my-node.ts
import { z } from 'zod'
import { BaseNode, objectId, nodeType } from '../base'

export const MyNode = BaseNode.extend({
  id: objectId('my-node'),      // generates IDs like "my-node_abc123"
  type: nodeType('my-node'),    // sets literal type discriminator
  // add node-specific fields:
  width: z.number().default(1),
  label: z.string().optional(),
}).describe('My node — one-line description of what it represents')

export type MyNode = z.infer<typeof MyNode>
export type MyNodeId = MyNode['id']
```

Luego añade `MyNode` a la unión `AnyNode` en `packages/core/src/schema/types.ts`.

## Crear nodos en las herramientas

Usa siempre `.parse()` para validar y generar un ID tipado correcto. Nunca construyas un objeto plano manualmente.

```ts
import { WallNode } from '@pascal-app/core'
import { useScene } from '@pascal-app/core'

// 1. Parse validates and fills defaults (including auto-generated id)
const wall = WallNode.parse({ name: 'Wall 1', start: [0, 0], end: [5, 0] })

// 2. createNode(node, parentId?) inserts it into the scene
const { createNode } = useScene.getState()
createNode(wall, levelId)
```

Para creación en lote:

```ts
const { createNodes } = useScene.getState()
createNodes([
  { node: WallNode.parse({ start: [0, 0], end: [5, 0] }), parentId: levelId },
  { node: WallNode.parse({ start: [5, 0], end: [5, 4] }), parentId: levelId },
])
```

## Actualizar nodos

```ts
const { updateNode } = useScene.getState()
updateNode(wall.id, { height: 2.8 })   // partial update, merges with existing
```

`parseUpdatedNode` conserva el arreglo actual de `children` cuando el parche omite
`children`, incluso cuando un esquema integrado o uno registrado estricto elimina el campo.
Esto protege los enlaces del gráfico a través de actualizaciones simples, en lote y atómicas. Un
parche explícito de `children` sigue igualmente el esquema y la semántica de eliminación existente. Esta
protección de actualización no cambia el análisis directo de esquemas ni las migraciones de carga.

Las losas (slabs) son soportes de suelo, no padres anfitriones de superficies: los nodos de
suelo permanecen como hijos del nivel con `supportSlabId`. El resolutor compartido de superficies
difiere los impactos de losas a la colocación del suelo sin producir un rechazo que bloquearía el
evento de rejilla (grid).

## Evolución de esquemas y compatibilidad retroactiva

Las escenas guardadas son JSON persistido que se analiza de nuevo a través de `AnyNode` en la carga (`SceneState.setScene` → `migrateNodes` → `markDirty`, en `packages/core/src/store/use-scene.ts`). Cualquier cambio a las propiedades de un nodo existente debe mantener cargables las escenas antiguas guardadas — una escena escrita hace meses debe seguir analizándose y renderizándose.

- **Añadir un campo** → dale un `.default(...)` de Zod (o `.optional()`). `AnyNode.parse` lo rellena entonces para los nodos heredados que carecen de él. Un campo requerido sin valor por defecto hace fallar la validación de todas las escenas preexistentes.
- **Renombrar, eliminar o cambiar el tipo de un campo** → un `.default()` no basta; descarta silenciosamente el valor antiguo. Añade una entrada a `migrateNodes` (`use-scene.ts`) que lea la forma heredada y la reescriba a la nueva *antes* del análisis. Aquí es también donde van los cambios estructurales (dividir un material en interior/exterior, derivar `pitch` de un `roofHeight` heredado, sembrar `children: []` en un nuevo tipo de host).
- **Subir `schemaVersion`** en el `NodeDefinition` registra que la forma de un tipo cambió. El mapa `def.migrate` por tipo está reservado para uso futuro; hoy toda la migración en tiempo de carga está centralizada en `migrateNodes`.

En caso de duda, carga una escena antigua (o un fixture) después del cambio y confirma que sigue analizándose y renderizándose.

## Ejemplos reales

- **Nodo de geometría simple**: `packages/core/src/schema/nodes/wall.ts` — `start`, `end`, `thickness`, `height`
- **Nodo poligonal**: `packages/core/src/schema/nodes/slab.ts` — `polygon: [number, number][]`, `holes`
- **Nodo posicionado**: `packages/core/src/schema/nodes/item.ts` — `position`, `rotation`, `scale`, `asset`

## Reglas

- **Usa siempre `.parse()`** — genera el prefijo de ID correcto y rellena los valores por defecto. `WallNode.parse({...})` y no `{ type: 'wall', id: '...' }`.
- **Nunca codifiques IDs.** Deja que `objectId('type')` los genere.
- **Añade los nuevos tipos de nodos a `AnyNode`** en `types.ts` o el store no los aceptará.
- **Mantén los esquemas en `packages/core`**, no en el visor o el editor — el esquema es compartido por todos los paquetes.
- **Nunca rompas escenas antiguas.** Los campos nuevos reciben un `.default()`; los renombres/eliminaciones/cambios de tipo reciben una entrada en `migrateNodes`. Consulta *Evolución de esquemas y compatibilidad retroactiva* más arriba.