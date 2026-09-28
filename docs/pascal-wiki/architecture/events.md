# Eventos

*Bus de eventos tipado — emitir y escuchar eventos de nodos y de la cuadrícula.*

Aplica a: `packages/core/src/events/**`, `packages/viewer/**`, `apps/editor/**`.

El bus de eventos (`emitter`) es una instancia global de `mitt` tipada con `EditorEvents`. Desacopla los renderers (que emiten) de los managers de selección y las herramientas (que escuchan).

**Fuente**: `packages/core/src/events/bus.ts`

## Formato de las claves de evento

```
<nodeType>:<suffix>
node:<suffix>
```

Claves de ejemplo: `wall:click`, `block:enter`, `node:click`, `grid:pointerdown`

### Tipos de nodo
Cada discriminador de `AnyNode` registrado está disponible como prefijo de
evento de nodo tipado, incluido `block`. `node:*` es el canal entre tipos para
los consumidores que manejan deliberadamente cada tipo de nodo sin mantener una
lista paralela.

### Sufijos
```ts
'click' | 'move' | 'enter' | 'leave' | 'pointerdown' | 'pointerup' | 'context-menu' | 'double-click'
```

Los eventos `grid:*` se disparan cuando el usuario interactúa con espacio vacío (sin acierto de nodo). **No** los emite una malla — `useGridEvents(gridY)` (`apps/editor/hooks/use-grid-events.ts`) hace raycast manualmente contra un plano de suelo y llama a `emitter.emit('grid:click', …)`. Móntalo en cualquier herramienta o componente del editor que necesite interacciones con espacio vacío.

## Forma de NodeEvent

```ts
interface NodeEvent<T extends AnyNode = AnyNode> {
  node: T                                  // typed node that triggered the event
  position: [number, number, number]       // world-space hit position
  localPosition: [number, number, number]  // object-local hit position
  normal?: [number, number, number]        // face normal, if available
  stopPropagation: () => void
  nativeEvent: ThreeEvent<PointerEvent>
}
```

Los eventos de cuadrícula llevan `position`, `localPosition`, metadatos de acierto
opcionales y `nativeEvent` (pero sin `node`).

## Eventos de intención de selección

`selection:canvas-node-click` se dispara después de que el editor acepta un clic de
nodo 2D o 3D y resuelve el nodo que la selección realmente apunta. Los hosts pueden
usarlo para navegación contextual sin reaccionar a llamadas programáticas de
`setSelection`. La carga útil es el `AnyNode` resuelto.

`selection:find-node` es la intención explícita de revelar emitida por el menú de
acciones del nodo. Los hosts y plugins que son dueños de catálogos o paneles escuchan
este evento y revelan los controles o presets relacionados con el nodo.

## Emisión

Los renderers emiten vía `useNodeEvents` — nunca llames `emitter.emit` directamente en un renderer:

```tsx
// packages/viewer/src/hooks/use-node-events.ts
const events = useNodeEvents(node, 'wall')
return <mesh ref={ref} {...events} />
```

`useNodeEvents` convierte el `ThreeEvent` de R3F en un `NodeEvent` y emite tanto el
evento específico del tipo (`wall:click`, `block:enter`, etc.) como su contraparte
genérica `node:*`. Suprime los eventos mientras la cámara está arrastrando.

## Escucha

Escucha en un `useEffect`. Limpia siempre con `emitter.off` usando **la misma referencia de función**:

```ts
// Single event
useEffect(() => {
  const handler = (e: WallEvent) => { /* … */ }
  emitter.on('wall:click', handler)
  return () => emitter.off('wall:click', handler)
}, [])

// Multiple node types, same handler
useEffect(() => {
  const types = ['wall', 'slab', 'door'] as const
  const handler = (e: NodeEvent) => { /* … */ }
  types.forEach(t => emitter.on(`${t}:click`, handler as any))
  return () => types.forEach(t => emitter.off(`${t}:click`, handler as any))
}, [])
```

Consulta `apps/editor/components/editor/selection-manager.tsx` para un ejemplo completo de listener de múltiples tipos.

## Reglas

- **Los renderers solo emiten, nunca escuchan.** Escuchar pertenece a los managers de selección, las herramientas o los sistemas.
- **Limpia siempre.** Olvidar `emitter.off` provoca handlers duplicados y fugas de memoria.
- **Usa la misma referencia de función** para `on` y `off`. Las funciones anónimas dentro de `useEffect` están bien siempre que la ref se capture en el mismo scope.
- **No uses el emitter para estado.** Sirve para eventos de interacción de una sola vez. El estado persistente va en `useScene`, `useViewer` o `useEditor`.
- **`stopPropagation`** evita que el evento sea manejado por listeners superpuestos (p. ej. una puerta sobre un muro). Llamalo cuando un handler deba ser el consumidor final.