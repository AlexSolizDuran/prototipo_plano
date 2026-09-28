# Renderers

*Patrón de renderer de nodos en `packages/viewer`.*

Aplica a: `packages/viewer/**`.

Los renderers viven en `packages/viewer/src/components/renderers/`. Cada renderer es responsable de la geometría y los materiales de Three.js de un tipo de nodo — y de nada más.

> **Para los tipos (kinds) impulsados por registro, el valor predeterminado es no usar renderer personalizado.** Define `def.geometry` en su lugar y el framework monta por ti un renderer genérico + sistema de geometría. Consulta [node-definitions.md](node-definitions.md). El patrón de abajo se aplica a los tipos que *sí* necesitan un renderer personalizado (GLB, `<Html>`, drei, instanciación, materiales de shader).

## Cadena de despacho

```
<SceneRenderer>          — itera rootNodeIds desde useScene
  └─ <NodeRenderer>      — hace switch sobre node.type, renderiza el componente coincidente
       └─ <WallRenderer> — (o SlabRenderer, DoorRenderer, …)
```

Consulta `packages/viewer/src/components/renderers/scene-renderer.tsx` y `packages/viewer/src/components/renderers/node-renderer.tsx`.

## Responsabilidades del renderer

Un renderer **debe**:
- Leer su nodo desde `useScene` mediante el ID del nodo
- Registrar su(s) malla(s) con `useRegistry()` para que otros sistemas puedan buscarlas
- Suscribirse a los eventos de puntero vía `useNodeEvents()`
- Renderizar la geometría y aplicar materiales según las propiedades del nodo

Un renderer **no debe**:
- Ejecutar lógica de generación de geometría (eso pertenece a un sistema)
- Importar nada desde `apps/editor`
- Gestionar directamente el estado de selección (usa `useViewer` para leer, emite eventos para escribir)
- Realizar cálculos costosos por frame en el cuerpo del componente

## `node.visible` Es Trabajo del Renderer

Un renderer personalizado **debe** aplicar `visible={node.visible !== false}` a su grupo raíz (o a su renderable exterior). Los tipos impulsados por registro lo obtienen gratis — `ParametricNodeRenderer` ya lo define — pero un tipo que trae su propio `renderer.tsx` y lo olvida se mantiene dibujado en el viewport 3D mientras ya desapareció en el resto: candidatos de selección, colisión de primera persona, el plano 2D y cada exportación respetan la bandera. El resultado es un nodo que está en pantalla pero no es clicable.

Si un sistema escribe `.visible` en el objeto de registro del tipo cada frame (el modo solo lo hace para los niveles, los sistemas de zona lo hacen para mantener vivas las etiquetas `<Html>`), esa escritura también debe incorporar la bandera del nodo, o deshará silenciosamente la prop en el siguiente frame.

**El Sitio (Site) es la única excepción**: su bandera gobierna solo su propia presentación — relleno de terreno, terreno esculpido, línea de límite — y termina ahí. Los edificios e items sobre un Site oculto conservan su propia bandera y aún se renderizan, y el disco del horizonte es un fondo de mundo en lugar de parte de la parcela, de modo que se renderiza siempre.

## Ejemplo — Renderer mínimo

```tsx
// packages/viewer/src/components/renderers/my-node/index.tsx
import { useRegistry } from '@pascal-app/core'
import { useNodeEvents } from '../../hooks/use-node-events'
import { useScene } from '@pascal-app/core'

export function MyNodeRenderer({ node }: { node: MyNode }) {
  const ref = useRef<Mesh>(null!)
  useRegistry(node.id, 'my-node', ref)   // 3 args: id, type, ref — no return value
  const events = useNodeEvents(node, 'my-node')

  return (
    <mesh ref={ref} {...events}>
      <boxGeometry args={[node.width, node.height, node.depth]} />
      <meshStandardMaterial color={node.color} />
    </mesh>
  )
}
```

## Agregar un tipo de nodo nuevo

Para tipos nuevos, prefiere el modelo impulsado por registro de [node-definitions.md](node-definitions.md). Los pasos heredados de abajo se aplican solo cuando un tipo necesita un renderer de React personalizado (cargadores de GLB, portales `<Html>`, etc.) **y** vive en `packages/viewer` en lugar de `packages/nodes/<kind>`:

1. Crea `packages/viewer/src/components/renderers/<type>/index.tsx`
2. Agrega un caso a `NodeRenderer` en `node-renderer.tsx`
3. Agrega el sistema correspondiente en `packages/core/src/systems/` si el nodo necesita geometría derivada
4. Exporta desde `packages/viewer/src/index.ts` si se necesita externamente

## Notas de rendimiento

- Usa `useMemo` para geometrías que dependen de las propiedades del nodo — evita recrearlas en cada render.
- Para geometrías complejas de recortes o booleanas, delega en un sistema (p. ej. `WallCutout`).
- Registra una malla por ID de nodo; si un renderer genera varias mallas, usa un ref de grupo o elige la principal para el registro.