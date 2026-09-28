# Definiciones de nodos

*El modelo de composición impulsado por registro para los tipos de nodos.*

Se aplica a: `packages/core/src/registry/`, `packages/nodes/src/<kind>/`, `packages/viewer/src/components/viewer/{registered-systems.tsx,node-renderer.tsx}`.

Un *tipo de nodo (node kind)* — estante, muro, puerta, elemento, spawn, zona — se describe mediante un `NodeDefinition` registrado con `nodeRegistry`. La definición son datos planos + referencias de módulos perezosos. Tres campos opcionales deciden cómo aparece el tipo en la escena en tiempo de ejecución; elige la combinación que se ajuste a las necesidades del tipo.

Esta página cubre esos tres campos. Para el contrato más amplio del registro (esquemas, capacidades, paramétricos, MCP), consulta [el plan del registro](../../../plans/editor-node-registry.md) en el repositorio privado.

## El modelo de las tres casillas

| Campo | Propósito | Elígelo cuando |
|---|---|---|
| `geometry?: (node, ctx, shading, textures, colorPreset, sceneTheme) => Object3D` | Constructor puro. Devuelve las mallas de este nodo. Los argumentos de apariencia (después de `ctx`) son opcionales — tómalos solo si el constructor elige sus propios materiales. | El tipo tiene mallas paramétricas que deben reconstruirse cuando se ejecuta `updateNode`. |
| `renderer?: () => Promise<{ default: ComponentType<{ node }> }>` | Componente React personalizado opcional. Es el dueño de la creación de mallas. | El tipo necesita funcionalidades solo-JSX: `<Html>`, `useGLTF`, ayudas de drei, instanciación, materiales de shader TSL, portales R3F. |
| `system?: () => Promise<{ default: ComponentType }>` | Componente opcional por fotograma (`useFrame` que devuelve `null`). | El tipo necesita trabajo imperativo por fotograma: animaciones, transiciones de opacidad, manipulación de materiales por malla con nombre, cascadas sucias entre tipos. |

Los tres campos son **independientes**. No hay una etiqueta discriminadora — la presencia es la participación:

```ts
// shelf — pure geometry, no React, no per-frame work
export const shelfDefinition: NodeDefinition<typeof ShelfNode> = {
  // ...
  geometry: buildShelfGeometry,         // pure function in geometry.ts
}

// zone — built once via React (uses <Html>), animated per-frame via system
export const zoneDefinition: NodeDefinition<typeof ZoneNode> = {
  // ...
  renderer: () => import('./renderer'),  // composes <Html> + TSL materials
  system: { module: () => import('./system') },  // pokes uniforms per frame
}

// door — pure geometry + animation system
export const doorDefinition: NodeDefinition<typeof DoorNode> = {
  // ...
  geometry: buildDoorGeometry,
  system: { module: () => import('./animation') },  // advances operationState
}
```

## En tiempo de ejecución: cómo se cablean los tres campos

Dos componentes del framework viven en `packages/viewer/src/components/viewer/`:

- **`<NodeRenderer>`** elige qué monta React para un nodo:
  1. Si `def.renderer` está definido → monta el renderizador personalizado.
  2. Si no → monta `<ParametricNodeRenderer>` — un `<group>` vacío y ligero que se registra en `sceneRegistry`, adjunta los manejadores de puntero mediante `useNodeEvents`, lee `useLiveTransforms` para las anulaciones de arrastre, y llama a `useScene.getState().markDirty(node.id)` al montarse.
- **`<GeometrySystem>`** se ejecuta en cada fotograma:
  1. Lee `dirtyNodes` de `useScene`.
  2. Para cada nodo sucio cuyo tipo tenga `def.geometry`, busca el `Group` registrado en `sceneRegistry`, construye un `GeometryContext`, llama a `def.geometry(node, ctx, shading, textures, colorPreset, sceneTheme)`, elimina los hijos antiguos, adjunta los nuevos, y llama a `clearDirty(id)`. Se vuelve a ejecutar cada vez que cualquiera de esos valores de apariencia cambia.
  3. Después de construir, si `textures` está desactivado y el tipo declara `def.surfaceRole`, `GeometrySystem` anula los materiales de las mallas construidas con el color temático del rol (`applyDefaultSurfaceRole`).
  4. Los tipos sin `def.geometry` se omiten — su `def.renderer` personalizado maneja la geometría por sí solo.

### Declaraciones de hospedaje

`rendersChildren` describe si un renderizador paramétrico personalizado monta nodos hijos arbitrarios.
Por defecto es `true` para renderizadores personalizados; un renderizador que filtra hijos o
solo dibuja sus propias mallas declara `rendersChildren: false`. Las definiciones de solo-geometría
heredan el montaje de hijos del renderizador genérico. El hospedaje también requiere que el esquema
del host conserve el ID real del hijo en `children`; la capacidad de renderizado por sí sola es insuficiente.

`capabilities.surfaces.hosting: false` desactiva el hospedaje de superficies para un tipo.
`capabilities.surfacePlacement: 'floor-only'` impide que ese tipo se convierta en un hijo
hospedado; no impide que el tipo hospede otros objetos. Los gabinetes, columnas, escaleras,
ascensores y cercas usan esta restricción de colocación de hijos.

### `surfaceRole`

Un tipo puede declarar `surfaceRole?: SurfaceRole` en su definición. Es solo un token de color (`core` no almacena material), utilizado para resolver el color de arcilla/tema por rol de las superficies sin textura. Consulta [materials-and-themes](materials-and-themes.md).

Los componentes `def.system` por tipo se montan junto mediante `<RegisteredSystems>`. Ejecutan su propio `useFrame` y pueden marcar nodos como sucios, abordar mallas mediante `getObjectByName`, avanzar el estado de animación, etc. Se ejecutan **además** de `GeometrySystem`, no en lugar de él.

### `dirtyTracking`

`dirtyNodes` es la cola de reconstrucción por fotograma consumida por `<GeometrySystem>` (`def.geometry`), `<FloorElevationSystem>` (`capabilities.floorPlaced`), y los sistemas de visor heredados por tipo. Los tipos que ninguno de esos consumidores usa — tipos estructurales/organizativos como site, building, level, zone, guide — declaran `dirtyTracking: false`. El conjunto del store es un `GuardedDirtySet`: `add()` por sí mismo rechaza las marcas para los tipos marcados, de modo que tanto `markDirty` como las llamadas directas a `dirtyNodes.add(...)` quedan cubiertas (marcar a ciegas `node.parentId` es seguro — el padre de un muro es un level, y el guardián lo descarta). Una marca sin consumidor se quedaría de otro modo toda la sesión, anularía la salida temprana del conjunto vacío de cada consumidor en cada fotograma, y contaminaría la lectura DIRTY de la superposición de rendimiento. Si un tipo así más tarde gana `def.geometry` (o cualquier otro consumidor de suciedad), elimina la bandera.

## `GeometryContext`

El segundo argumento de `geometry()` es el acceso de lectura a la escena para constructores que referencian otros nodos por ID. La mayoría de los tipos lo ignoran.

```ts
type GeometryContext = {
  resolve: <N = AnyNode>(id: AnyNodeId) => N | undefined
  children: AnyNode[]    // resolved children of this node
  siblings: AnyNode[]    // same kind, same parent (drives wall mitering)
  parent: AnyNode | null
}
```

- **Shelf, spawn, item, column, fence segment** — el constructor lee solo `node`. El argumento `ctx` no se usa.
- **Wall** — `ctx.siblings` para el inglete de esquinas con muros adyacentes. `ctx.children` para las huellas de recortes (puertas / ventanas hospedadas en el muro).
- **Door / window** — `ctx.parent` para el grosor del muro padre, de modo que la profundidad del marco se alinee con el muro en el que se recorta.

`GeometryContext` existe para que los constructores sigan siendo puros (sin importar `useScene`, sin mutación del store) y trivialmente comprobables con unit tests. El genérico `<GeometrySystem>` construye `ctx` a partir de la instantánea actual de la escena una vez por nodo sucio; el costo son unas pocas llamadas a `Map.get`.

Para datos por lotes con alcance de nivel (inglete de muros a lo largo de un nivel completo), `ctx` puede extender con `ctx.levelData?.miters` en una revisión futura — decidido junto con la migración de muros (Fase 3 del plan del registro).

## Alcance del plano de planta

`def.floorplan` es un constructor puro `FloorplanGeometry` sobre la misma
forma de `GeometryContext`. `def.floorplanScope` controla el descubrimiento:

| Alcance | Padre persistido | Coordenadas del constructor | `ctx.parent` |
|---|---|---|---|
| `'level'` (por defecto) | subárbol del nivel activo | metros locales al edificio | padre semántico |
| `'building'` | edificio activo | metros locales al edificio | nivel activo |
| `'site'` | Site del edificio activo | metros locales al sitio | Site real |

La capa del plano de planta aplica la transformada inversa del edificio activo a la
salida con alcance de sitio y pinta esa salida debajo de la arquitectura de nivel. Un plugin
mantiene por tanto un hijo Site semántico mientras la misma representación aparece
desde cada nivel de cada edificio de ese Site. El descubrimiento del alcance está
impulsado por registro; el código del editor no debe nombrar tipos de plugins.

`FloorplanStyle.fillRule` es la regla de enrollado para contornos compuestos. Usa
`'evenodd'` cuando los anillos anidados representan agujeros; tanto el renderizador
SVG interactivo como la exportación PDFKit la conservan. `FloorplanImage.url` también puede ser una
URL `data:` en línea, que la exportación PDF pasa directamente a PDFKit en lugar de
a través del resolutor de activos.

## Geometría solo para exportación

`def.bakeGeometry(node, ctx)` reemplaza el subárbol clonado del nodo registrado
solo dentro de `prepareSceneForExport()`. Existe para árboles procedurales en tiempo de ejecución
cuya representación GPU en vivo no es un artefacto portátil fiel — por ejemplo,
una población máxima instanciada enmascarada por un material TSL.

El hook recibe los datos de escena persistidos a través de `GeometryContext` y devuelve un
nuevo `Object3D` separado, en espacio local. Ese valor de retorno es la instantánea
estática completa del nodo. Debe usar geometría y materiales compatibles con
`GLTFExporter`; el exportador conserva la transformada y la
identidad del nodo registrado. El árbol del editor en vivo no se pasa al hook ni se muta.

Usa `bake: 'replace'` con `bakeGeometry` cuando el GLB genérico deba conservar la
instantánea estática portátil mientras el visor horneado de Pascal lo oculta y monta
`bakeReplaceRenderer` para el resultado vivo más rico.

`def.bakeGeometryAsync(node, ctx)` es la contraparte asíncrona para el horneado
de materiales y las lecturas de texturas. La exportación portátil espera una vez en lugar de invocar el
hook síncrono; los llamadores de solo geometría síncrona conservan `bakeGeometry`.
Ambos devuelven árboles separados en espacio local propiedad del artefacto de exportación. El contexto
incluye materiales capturados y datos de nivel además de la búsqueda semántica de nodos.

Las exportaciones de modelos aceptan `excludedNodeTypes?: readonly string[]`. Los subárboles
registrados coincidentes se omiten antes de clonar o invocar cualquiera de los constructores. El filtrado afecta a la
salida, no al contexto semántico completo disponible para los constructores retenidos.

Configuración → Export → **Include in file** (Incluir en el archivo) descubre los tipos procedurales a partir de
`bakeGeometry`, `bakeGeometryAsync` o `bake: 'replace'`, incluidos los tipos ocultos de la paleta.
Los filtros de nodos se aplican a las descargas de modelos, no a los artefactos del visor guardado, perfiles de
impresión, JSON de escena ni PDF de planos de planta. GLB y USDZ aceptan además
`includedPresentationIds` para constructores de presentación estática seleccionados explícitamente;
los subárboles de presentación en vivo permanecen fuera de `scene-renderer` y nunca se clonan.

Las salidas portátiles GLB/USDZ congelan la instanciación y la deformación, y normalizan
las texturas de materiales, colores de vértices, caras y geometría reflejada. Los artefactos
del visor guardado conservan sus clips de animación creados. La preparación captura la fuente
de forma síncrona, restaura el estado del visor antes del trabajo asíncrono, y devuelve un
artefacto propio que los llamadores deben liberar (dispose) después de la serialización o el fallo.

## Presentación de selección

`capabilities.selectionHighlight` controla solo la presentación de selección y hover basada en
material del Editor. Su valor por defecto es `true`, incluso para tipos heredados
y no registrados. Ponlo en `false` cuando un nodo debe permanecer semánticamente
seleccionado mientras su subárbol renderizado conserva materiales creados por plugin — por
ejemplo, una capa de pintura cuyo `NodeMaterial` lleva el resultado que se está editando.

El gestor de selección y el outliner consultan esta capacidad a través del registro,
incluso después del registro tardío de plugins. La capacidad no cambia la capacidad de
selección, la propiedad del inspector, la activación de herramientas, el comportamiento del
teclado ni la política de eliminación. El código del host no debe tratar de manera especial el tipo que opta por salir.

## Elegir la combinación correcta

### Solo `geometry`

Usa esto cuando las mallas del tipo sean una función pura de sus datos de nodo. **Shelf, spawn, item, column, fence segment, wall (lado de geometría), window (lado de geometría).**

```ts
// packages/nodes/src/shelf/geometry.ts
export function buildShelfGeometry(node: ShelfNode): Group {
  const group = new Group()
  group.add(buildTopBoard(node))
  group.add(buildBracket(node, -1))
  group.add(buildBracket(node, +1))
  return group
}

// packages/nodes/src/shelf/definition.ts
export const shelfDefinition: NodeDefinition<typeof ShelfNode> = {
  // ...
  geometry: buildShelfGeometry,
}
```

Sin `renderer.tsx`, sin `system.tsx`. El renderizador genérico monta un grupo vacío, el sistema genérico lo rellena.

### Solo `renderer` (sin `geometry`, sin `system`)

Usa esto cuando el tipo compone su escena mediante funcionalidades solo-JSX y nunca necesita trabajo imperativo por fotograma. **Elementos respaldados por GLB, tipos que montan ayudas de drei.**

```tsx
// packages/nodes/src/<kind>/renderer.tsx
import { useGLTF } from '@react-three/drei'
import { useRegistry } from '@pascal-app/core'
import { useNodeEvents } from '@pascal-app/viewer'

const FurnitureRenderer = ({ node }: { node: FurnitureNode }) => {
  const ref = useRef<Group>(null!)
  const { scene } = useGLTF(node.asset.url)
  const handlers = useNodeEvents(node, 'furniture')
  useRegistry(node.id, 'furniture', ref)
  return <primitive object={scene.clone()} ref={ref} {...handlers} />
}
```

Sin `def.geometry` — la geometría es el GLB. Sin `def.system` — no hay nada que animar.

### `renderer` + `system` (sin `geometry`)

Usa esto cuando el árbol del tipo contenga primitivas solo-React (p. ej. `<Html>`) y necesite trabajo imperativo por fotograma que no reconstruya geometría. **Zone.**

El renderizador compone el árbol una vez. El sistema manipula uniformes / opacidad / transformadas por nombre:

```tsx
// renderer.tsx
<group ref={ref} {...handlers}>
  <Html name="label" position={centroid}>{node.name}</Html>
  <mesh name="floor" geometry={floorGeometry} material={floorMaterial} />
  <mesh name="walls" geometry={wallGeometry} material={wallMaterial} />
</group>

// system.tsx
useFrame(() => {
  sceneRegistry.byType.zone.forEach((id) => {
    const group = sceneRegistry.nodes.get(id) as Group
    const walls = group.getObjectByName('walls') as Mesh
    const material = walls.material as MeshBasicNodeMaterial
    material.userData.uOpacity.value = lerp(currentOpacity, targetOpacity, lerpSpeed)
  })
})
```

### `geometry` + `system`

Usa esto cuando el tipo tenga geometría paramétrica **y** responsabilidades extra. **Door, window.**

- `geometry` construye las mallas visibles (marco, paneles, herrajes) como función pura del estado del nodo + muro padre.
- `system` avanza la animación (`operationState`) en `useInteractive`. El *registro de la animación en sí* es la señal de reconstrucción por fotograma — el sistema consumidor reconstruye cualquier nodo con una entrada activa (puertas) o posa las partes con nombre directamente (ventanas). No hagas `markDirty` por cada tick de animación: una marca sucia es un trabajo de una sola pasada que debe drenar a cero, y las marcas por tick impiden que la escena se asiente alguna vez (rompe el detector de asentamiento de `?perf` y cualquier puerta silenciosa de renderizado bajo demanda). Marca una vez cuando la animación se complete para que la pose asentada reciba su reconstrucción.

Esta división mantiene el estado de animación fuera del esquema del nodo (es efímero — vive en `useInteractive`) a la vez que reutiliza la vía genérica de reconstrucción.

## Las mallas con nombre funcionan en cualquiera de los dos patrones

Poner `mesh.name = 'walls'` es solo una propiedad de three.js. Un sistema que apunta a `getObjectByName('walls')` no importa si la malla se creó en JSX (`<mesh name="walls" />`) o de forma imperativa en un constructor puro (`mesh.name = 'walls'; group.add(mesh)`). Usa la que se ajuste al tipo.

## Migrar de archivos de renderizador+sistema personalizados a `def.geometry`

Si el sistema actual de tu tipo *solo* reconstruye geometría en sucio (sin animaciones, sin cascadas, sin manipulación de materiales), puede reducirse a una única función `def.geometry`:

1. Extrae el imperativo `updateXMesh(node, group)` del sistema a un `buildXGeometry(node): Group` puro en `packages/nodes/src/<kind>/geometry.ts`.
2. Reemplaza `def.renderer` por nada — el `<ParametricNodeRenderer>` del framework lo cubre.
3. Reemplaza `def.system` por `def.geometry: buildXGeometry`.
4. Elimina `renderer.tsx` y `system.tsx`.

Si el sistema también maneja cascadas, animaciones o actualizaciones de materiales, mantén `def.system` y *también* establece `def.geometry` — se ejecutan lado a lado.

## Reglas

- **Los constructores deben ser puros.** Sin importar `useScene` dentro de una función `def.geometry`. Lee el estado de la escena mediante `ctx`. Mutar el store desde un constructor rompe la idempotencia.
- **Los constructores emiten hijos en espacio local.** El `<group>` registrado se posiciona/rota mediante `<ParametricNodeRenderer>` vía JSX (`position={liveTransform?.position ?? node.position}`). Los constructores devuelven geometría como si el padre estuviera en el origen — nunca hornees la posición mundial del nodo en las coordenadas de los vértices.
- **Una malla registrada por ID de nodo.** El renderizador genérico registra un único `<group>` por nodo. Si un renderizador personalizado monta varias mallas, registra el grupo padre (o el objeto que el sistema necesite abordar).
- **Los sistemas personalizados se ejecutan además del sistema genérico, no en lugar de él.** Un tipo con `def.geometry` + `def.system` verá al sistema genérico reconstruir los hijos en sucio Y al sistema por tipo ejecutar su `useFrame`. Planifica las prioridades en consecuencia: `GeometrySystem` y el consumo de suciedad del techo se ejecutan con prioridad de fotograma 2, después de la instantánea de suciedad de prioridad 1 del lote de nodos. `def.system.priority` ordena componentes, no callbacks de fotograma.
- **Libera (dispose) en la reconstrucción.** El sistema genérico libera la geometría + material de los hijos anteriores antes de intercambiarlos. Los sistemas personalizados que añaden hijos de forma imperativa deben liberar lo que reemplazan, o aceptar el costo de memoria de GPU.
- **`def.renderer` anula el renderizador genérico.** Una vez que lo estableces, eres dueño del montaje — `<ParametricNodeRenderer>` no se invoca. El sistema genérico de geometría sigue ejecutándose para el tipo si `def.geometry` está definido, de modo que un renderizador personalizado puede registrar un grupo vacío y dejar que el sistema lo rellene.

## `toolHints`

`toolHints?: ToolHint[]` es la fuente propiedad del registro para el asistente flotante que se muestra mientras
una herramienta registrada de colocación o dibujo está activa.

```ts
type ToolHint = {
  key: string
  label: string
}
```

Mantén las etiquetas cortas y orientadas a la acción. Prefiere el lenguaje por defecto de construcción guiada:
el ajuste (snapping), los incrementos de ángulo, las guías y la validación están activos a menos que el usuario mantenga Shift
durante el gesto. Una pista `Shift` debe describir el bypass en términos de usuario, como
`Free angle`, `Free place`, o `Bypass guided constraints`.

`HelperManager` renderiza `def.toolHints` mediante `RegisteredToolHelper`, y el estado
activo de Shift puede actualizar la fila para mostrar que las restricciones guiadas están actualmente omitidas.
`affordanceHints?: Record<string, ToolHint[]>` es el mismo contrato para las propias redimensiones
de un tipo, con claves como `affordanceTools`: mientras un nodo del tipo está en ese alcance
`reshaping`, el HUD muestra esas pistas en lugar de las filas genéricas de reforma (el chip
de recuento de cortes de la división de muros vive ahí). El modo de selección
no es propiedad de una definición de nodo, por lo que su asistente se deriva por separado del
estado de selección, las capacidades de mover/rotar del nodo seleccionado y los modificadores mantenidos.

## Escollos

### `<GeometrySystem>` no debe mutar `group.position` / `group.rotation`

`ParametricNodeRenderer` vincula `<group position={liveTransform?.position ?? node.position}>` y la rotación correspondiente mediante JSX. React vuelve a aplicar la prop solo cuando su valor subyacente cambia. Si el sistema de geometría pone a cero imperativamente `group.position` después de una reconstrucción — como solían hacer los sistemas heredados por tipo — R3F no tiene razón para re-renderizar en el siguiente tick y el grupo permanece en el origen. Síntoma: el nodo se ajusta visualmente a `(0, 0, 0)` cada vez que su geometría se reconstruye (confirmación de movimiento, cambio de dimensión, pintura).

El contrato es ahora al revés: los constructores producen hijos en espacio local; el renderizador es dueño de la transformada; el sistema solo intercambia hijos.

### Marca los hijos construidos por geometría con `userData.__fromGeometry`

Un `<group>` registrado puede hospedar **dos** tipos de hijos: las mallas que creó el constructor de geometría (tableros, postes, divisores) y los nodos hospedados renderizados por React (elementos reasignados a una superficie de estante). Cuando el sistema se reconstruye, debe liberar solo la pasada de geometría anterior — liberar hijos montados por React arrancaría sus mallas a mitad del montaje, dejando al nodo hospedado en el estado de la escena pero invisible. Síntoma: arrastrar un elemento a un estante hace que el elemento desaparezca y nunca vuelva.

`<GeometrySystem>` etiqueta cada hijo devuelto por el constructor con `userData.__fromGeometry = true` y `disposeChildren` solo elimina/libera los hijos que llevan el marcador. Los sistemas personalizados que añaden hijos imperativamente a un grupo registrado deben seguir la misma convención si son posibles los hijos hospedados.

### Las vistas previas deben clonar los materiales antes de mutarlos

`def.preview` normalmente llama al constructor de geometría del tipo y luego recorre las mallas resultantes y establece `material.transparent = true; material.opacity = 0.5` para un aspecto fantasma. Si el constructor almacena en caché los materiales a nivel de módulo — y estante, elemento y la mayoría de los tipos compatibles con caché lo hacen, con clave en `material` / `materialPreset` — cada instancia confirmada del tipo en la escena comparte una única instancia de material. Mutarla en la vista previa filtra la translucidez a cada nodo real que usa el material por defecto; los estantes colocados se renderizan translúcidos, los elementos colocados pierden su opacidad, etc.

La solución es clonar en la vista previa, mutar el clon y reasignar `mesh.material` al clon. Al desmontar, libera solo los clones — **nunca** el original devuelto por el constructor, al que otros nodos todavía hacen referencia. `nodes/src/shelf/preview.tsx` es la implementación de referencia.

### Los tipos host necesitan un campo `children` en el esquema

Si tu tipo declara `relations.hosts: [...]`, añade `children: z.array(...).default([])` al esquema. `useScene.createNode(child, parentId)` escribe `child.parentId = parentId` **y** añade `child.id` a `parent.children`. Sin el campo, la escritura del lado padre es un no-op — `n.children.map(...)` de `<ParametricNodeRenderer>` no tiene entonces nada que montar y el renderizador del host nunca ve el nuevo hijo. Síntoma: el nodo hospedado vive en `useScene.nodes` pero no se dispara ningún montaje de React, por lo que la entrada del árbol de nodos del host está vacía y la escena 3D no muestra nada donde el host debería recogerlo.

Las migraciones importan: si tu tipo se publicó antes de que se añadiera el hospedaje, remienda los nodos existentes en `migrateNodes` para que `Array.isArray(node.children)` se cumpla para cada escena cargada antes de que el renderizador lo lea.

## Referencia de capacidades

### `capabilities.roofAccessory`

Marca un tipo como accesorio montado en segmentos de techo (chimenea, buhardilla, tragaluz, panel solar, ventilación de cumbrera, ventilación de caja). La presencia le dice al bucle de fusión de techos del visor dos cosas:

1. **Cascada sucia.** Cuando el accesorio se ensucia (mover / redimensionar / reasignar padre), el techo del padre del segmento host encola una re-fusión para que su capa fusionada se re-CSG con el recorte actualizado. El bucle de fusión limpia el bit sucio del accesorio y encola el techo padre.
2. **Recorte CSG opcional.** Cuando `buildCut` está definido, el bucle de fusión resta la geometría devuelta de los pinceles de shin / deck / wall del segmento host. La geometría devuelta debe ser **local al segmento**; el visor maneja la soldadura de vértices, la asociación de grupos de materiales y el envoltorio de pinceles de `three-bvh-csg` para que `core` permanezca libre de dependencias de three-bvh-csg.

```ts
type RoofAccessoryConfig = {
  buildCut?: (node: AnyNode, hostSegment: AnyNode) => BufferGeometry | null
}
```

Establece `buildCut` para los tipos que atraviesan **el** techo (tragaluz, buhardilla). Los tipos que se apoyan **encima** (ventilaciones, paneles solares) declaran la capacidad sin `buildCut` — la cascada sigue disparándose pero no se ejecuta ningún recorte CSG.

```ts
// skylight — cuts through the roof
capabilities: {
  roofAccessory: {
    buildCut: (node, hostSegment) => buildSkylightRoofCut(node, hostSegment),
  },
},

// box-vent — sits on top, no cut needed
capabilities: {
  roofAccessory: {},
},
```

---

### `capabilities.paint`

Despacho de pintura por tipo. Permite que el `selection-manager` del editor enrute el hover / clic / vista previa de pintura a través de un despachador genérico en lugar de añadir un brazo `if (node.type === '<kind>')` para cada tipo pintable.

La capacidad decide cuatro cosas:

1. **`resolveRole`** — qué superficie lógica pulsó el puntero. Devuelve `null` cuando la cara no debe pintarse (ranura interior, normal oblicua, etc.).
2. **`buildPatch`** — el parcial de actualización de nodo a confirmar al hacer clic.
3. **`applyPreview`** — aplica un material de vista previa al subárbol de mallas y devuelve un callback de limpieza. Devuelve `null` cuando la malla aún no está montada; el editor recurre al cursor de no permitido.
4. **`getEffectiveMaterial`** *(opcional)* — lee el material actualmente efectivo de un rol, recorriendo cualquier cadena de respaldo del padre. Impulsa el indicador del valor actual del selector de color.

```ts
type PaintCapability = {
  resolveRole: (args: PaintResolveArgs) => string | null
  buildPatch: (args: PaintPatchArgs) => Partial<AnyNode>
  applyPreview: (args: PaintPreviewArgs) => (() => void) | null
  getEffectiveMaterial?: (args: PaintEffectiveMaterialArgs) => {
    material: MaterialSchema | undefined
    materialPreset: string | undefined
  } | null
}
```

Implementa la capacidad en un archivo `paint.ts` junto a `definition.ts`. Mantenla pura — sin `useScene`, sin mutación del store. Implementaciones de referencia: `packages/nodes/src/chimney/paint.ts` (división cuerpo/parte superior), `packages/nodes/src/wall/paint.ts` (interior/exterior + desambiguación basada en la normal).

```ts
capabilities: {
  paint: chimneyPaint,  // imported from ./paint.ts
},
```

---

### `keyboardActions`

Manejadores de teclas R / T impulsados por registro. Un tipo que quiera anular la pulsación de R (`rotate clockwise` — rotar en el sentido horario) o T (`rotate counter-clockwise` — rotar en sentido antihorario) establece este campo en su `NodeDefinition` en lugar de extender la cadena escrita a mano de `if/else` en `use-keyboard.ts`.

```ts
type KeyboardActions = {
  r?: KeyboardAction  // R / Shift+R primary action
  t?: KeyboardAction  // T / Shift+T secondary action
}

type KeyboardAction = {
  /**
   * Return false to fall through to the editor's default rotation
   * behaviour. Use this to short-circuit the action for non-operable
   * type variants (e.g. a fixed skylight should rotate, not toggle).
   */
  appliesTo: (node: AnyNode) => boolean
  /**
   * Execute the action. The editor handles preventDefault and the
   * shared sfx; only touch scene / interactive state here.
   */
  run: (node: AnyNode) => void
}
```

```ts
// skylight — R toggles open/closed on operable types; T forces close
keyboardActions: {
  r: {
    appliesTo: (node) => node.type === 'skylight' && isOperableSkylightNode(node),
    run: (node) => toggleSkylightOpenState(node.id),
  },
  t: {
    appliesTo: (node) => node.type === 'skylight' && isOperableSkylightNode(node),
    run: (node) => closeSkylightOpenState(node.id),
  },
},
```

Door y window todavía usan llamadas directas heredadas en `use-keyboard.ts`; migrarlas bajo esta capacidad es un seguimiento.

---

## Ver también

- [renderers.md](renderers.md) — el patrón de renderizador heredado (todavía autoritativo para tipos con `def.renderer` personalizado).
- [systems.md](systems.md) — sistemas por tipo, orden de prioridad de fotogramas y división core/visor.
- [scene-registry.md](scene-registry.md) — cómo `sceneRegistry` indexa los nodos por ID y tipo.
- [Plan del registro de nodos](../../../plans/editor-node-registry.md) *(en private-editor)* — la migración de múltiples fases que produjo este modelo.