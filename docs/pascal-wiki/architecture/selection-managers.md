# Administradores de selección

*Arquitectura de selección en dos capas: administrador del visor (jerárquico) + administrador del editor (consciente de fase).*

Se aplica a: `packages/viewer/src/components/viewer/selection-manager.tsx`, `apps/editor/components/editor/selection-manager.tsx`.

Hay dos administradores de selección. Son componentes separados, no el mismo componente configurado de forma distinta.

| Componente | Ubicación | Conoce sobre |
|---|---|---|
| `SelectionManager` | `packages/viewer/src/components/viewer/selection-manager.tsx` | Solo estado del visor |
| `SelectionManager` (editor) | `apps/editor/components/editor/selection-manager.tsx` | Fase, modo, estado de herramientas |

El administrador del visor es el predeterminado. El editor monta su propio administrador como un hijo de `<Viewer>`, anulando el comportamiento predeterminado mediante el patrón de aislamiento del visor.

---

## Cómo funciona la selección

**Flujo de eventos:**

```
useNodeEvents(node, type) on a renderer mesh
  → emitter.emit('wall:click', NodeEvent)
  → SelectionManager listens via emitter.on(…)
  → calls useViewer.setSelection(…)
  → outliner sync re-runs → Three.js outline updates
```

`useNodeEvents` devuelve manejadores de puntero de R3F. Distribúyalos sobre la malla:

```tsx
const events = useNodeEvents(node, 'wall')
return <mesh ref={ref} {...events} />
```

Los eventos se suprimen durante el arrastre de cámara (`useViewer.getState().cameraDragging`).

La captura por selección/hover solo tiene sentido mientras el alcance (scope) de interacción está `idle`
(`selectionEnabled(scope)`). Durante una colocación/movimiento/etc. activos, el puntero
pertenece al cuerpo de esa interacción y el hot-set reduce qué objetos de la escena
son elegibles para el raycast — ver [alcance de interacción](interaction-scope.md) para la
derivación del hot-set y la matriz de alcance de superposiciones.

---

## Administrador de selección del visor

Ruta jerárquica: **Edificio → Nivel → Zona → Elementos**

En cada nivel, solo la siguiente capa es seleccionable. Hacer clic fuera deselecciona. La ruta se almacena en `useViewer`:

```ts
type SelectionPath = {
  buildingId: string | null
  levelId: string | null
  zoneId: string | null
  selectedIds: string[]   // walls, items, slabs, etc.
}
```

`setSelection` tiene una guarda de jerarquía: establecer `levelId` sin `buildingId` restablece a los hijos. Use `resetSelection()` para limpiar todo.

Multiselección: `Ctrl/Meta + click` conmuta un ID en `selectedIds`; `Shift + click` conmuta de la misma manera. El clic normal lo reemplaza.

---

## Administrador de selección del editor

Extiende la selección con conciencia de fase desde `useEditor`. El `SelectionManager` del visor **no** se monta en el editor; este ocupa su lugar (inyectado como un hijo de `<Viewer>`).

```
phase: 'site'      → selectable: buildings
phase: 'structure' → selectable: walls, zones, slabs, ceilings, roofs, doors, windows
  structureLayer: 'zones'    → only zones
  structureLayer: 'elements' → all structure types
phase: 'furnish'   → selectable: furniture items only
```

Hacer clic en un nodo de otra fase cambia automáticamente de fase. El doble clic desciende a un nivel de contexto.

En el modo de selección, la selección en los lienzos 3D y 2D comparte el mismo vocabulario de modificadores:

- `Ctrl/Meta + click` conmuta el objeto clicado en `selectedIds`.
- `Shift + click` también conmuta el objeto clicado del lienzo para que los usuarios puedan multiseleccionar desde
  cualquiera de los dos viewports. El grafo de escena conserva las semánticas del explorador de archivos: `Shift + click`
  selecciona el rango visible entre la última fila seleccionada y la fila clicada.
- `Ctrl/Meta + left-drag` sobre un objeto móvil seleccionado inicia el movimiento directo desde el lienzo.
- `Ctrl/Meta + right-drag` sobre un objeto rotable seleccionado inicia la rotación directa desde el
  lienzo. La rotación hace snap al incremento de ángulo predeterminado a menos que se mantenga Shift durante el
  arrastre.

El ayudante flotante en `packages/editor/src/components/ui/helpers/helper-manager.tsx`
refleja estas reglas a partir del estado de selección actual y de los modificadores mantenidos. Mantenga ese ayudante y
el diálogo de atajos sincronizados al cambiar los gestos de selección.

### Grupos de sesión (solo editor)

`Ctrl/Cmd+G` / `Ctrl/Cmd+Shift+G` crean y disuelven **grupos de selección de sesión** en
`use-session-groups` (no en el grafo de escena). El clic simple se expande a los miembros en vivo mediante
`expandIdsForNode`, enhebrado en las tres vías de clic:
`resolveSelectedIdsForNodeClick` (3D), el `applyEntrySelection` de la capa del registro (entradas
2D) y `resolveFloorplanBackgroundSelection` (hit-test de fondo 2D). Alt+clic opta por
no participar. Ver [grupos de selección](selection-groups.md).

---

## Reglas

- **Nunca agregue lógica de selección a los renderizadores.** Los renderizadores distribuyen los eventos de `useNodeEvents` y se detienen ahí. Todas las decisiones de selección viven en el administrador de selección.
- **Nunca agregue lógica de fases del editor al `SelectionManager` del visor.** La conciencia de fase, modo y herramientas pertenece exclusivamente al administrador de selección del editor.
- **`useViewer` es la única fuente de verdad del estado de selección.** Ambos administradores leen y escriben a través de `setSelection` / `resetSelection`. Nada más debe mutar `selection` directamente.
- **Los arreglos del outliner se mutan in-place** (no se reemplazan) por rendimiento. No asigne arreglos nuevos a `outliner.selectedObjects` ni a `outliner.hoveredObjects`.
- **El hover es un escalar separado** (`hoveredId: string | null`), no parte de `selectedIds`. Actualícelo mediante `setHoveredId`.

---

## Cómo agregar capacidad de selección a un nuevo tipo de nodo

1. Agregue el tipo a `SelectableNodeType` en el store / administrador de selección del visor.
2. Asegúrese de que su renderizador llame a `useNodeEvents(node, type)` y distribuya los manejadores.
3. Agregue un caso a la estrategia de selección que lo necesite (nivel de jerarquía del visor o fase del editor).
4. Asegúrese de que se llame a `useRegistry` en el renderizador para que el outliner pueda resaltarlo.