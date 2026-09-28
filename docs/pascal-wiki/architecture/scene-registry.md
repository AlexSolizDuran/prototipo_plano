# Registro de escena

*Mapear los IDs de nodos a instancias vivas de `THREE.Object3D`.*

Se aplica a: `packages/core/src/hooks/scene-registry/**`, `packages/viewer/**`.

El registro de escena es un mapa global y mutable que vincula los IDs de nodos con sus instancias vivas de `THREE.Object3D`. Evita el recorrido de árboles y permite que los sistemas y los gestores de selección hagan búsquedas O(1).

**Fuente**: `packages/core/src/hooks/scene-registry/scene-registry.ts`

## Estructura

```ts
export const sceneRegistry = {
  nodes: new Map<string, THREE.Object3D>(),   // id → Object3D
  byType: {
    wall: new Set<string>(),
    slab: new Set<string>(),
    item: new Set<string>(),
    // … one Set per node type
  },
}
```

`nodes` es la búsqueda principal. `byType` permite que los sistemas iterene todos los objetos de un tipo sin recorrer todo el mapa.

## Registrar en un renderizador

Cada renderizador debe llamar a `useRegistry` con un `ref` a su malla o grupo raíz. El registro es síncrono (`useLayoutEffect`) para que esté disponible antes de la primera pintura.

```tsx
import { useRegistry } from '@pascal-app/core'

export function WallRenderer({ node }: { node: WallNode }) {
  const ref = useRef<Mesh>(null!)
  useRegistry(node.id, 'wall', ref)   // ← required in every renderer

  return <mesh ref={ref} … />
}
```

El hook maneja tanto el registro al montar como la limpieza al desmontar automáticamente.

## Buscar objetos

En cualquier lugar fuera del renderizador — en sistemas, gestores de selección, lógica de exportación:

```ts
// Single lookup
const obj = sceneRegistry.nodes.get(nodeId)
if (obj) { /* use obj */ }

// Iterate all walls
for (const id of sceneRegistry.byType.wall) {
  const obj = sceneRegistry.nodes.get(id)
}
```

## Reglas

- **Un registro por ID de nodo.** Si un renderizador genera varias mallas, registra el grupo más externo (el que representa al nodo).
- **Nunca conserves una referencia obsoleta.** Lee siempre de `sceneRegistry.nodes.get(id)` en el momento en que lo necesites — no guardes el resultado en caché entre fotogramas.
- **No mutas el registro manualmente.** Solo `useRegistry` debe añadir/eliminar entradas. Los sistemas y los gestores de selección son consumidores de solo lectura.
- **Los sistemas de core no deben usar el registro.** Trabajan con datos planos de nodos. Solo los sistemas del visor y los gestores de selección pueden hacer búsquedas de objetos Three.js.

## Sincronización del outliner

El `outliner` en `useViewer` mantiene arreglos vivos de `Object3D[]` usados por la pasada de contorno de post-procesamiento. Los gestores de selección los sincronizan imperativamente por rendimiento (mutación de arreglos en lugar de nuevas asignaciones):

```ts
outliner.selectedObjects.length = 0
for (const id of selection.selectedIds) {
  const obj = sceneRegistry.nodes.get(id)
  if (obj) outliner.selectedObjects.push(obj)
}
```

Consulta `packages/viewer/src/components/viewer/selection-manager.tsx` para el patrón completo de sincronización.