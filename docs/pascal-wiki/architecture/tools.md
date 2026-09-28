# Herramientas

*Herramientas del editor e interacciones de colocación propiedad del registro.*

Se aplica a: `apps/editor/components/tools/**` y `packages/nodes/src/*/{tool,floorplan-tool}.tsx`.

Las herramientas son componentes de React que capturan la entrada del usuario (puntero, teclado) y la traducen en mutaciones de `useScene`. Las herramientas de nivel de aplicación y de varios tipos (kinds) viven en `apps/editor/components/tools/`. Un tipo de nodo (kind) propiedad del registro puede colocar su `def.tool` 3D y su extensión de herramienta de plano de planta en `packages/nodes/src/<kind>/`; esto mantiene el registro completo del tipo eliminable y descubrible como una sola unidad. Estos componentes pueden consumir las APIs públicas de interacción del editor, pero no deben agregar estado específico de la aplicación ni importar desde `apps/editor`.

## Ciclo de vida

`ToolManager` lee `useEditor` (fase + modo + herramienta) y monta el componente de la herramienta activa. Cuando la herramienta cambia, el componente anterior se desmonta y limpia cualquier estado transitorio.

Ver `apps/editor/components/tools/tool-manager.tsx`.

> **Lo que el usuario está haciendo ahora mismo** lo posee la máquina de estados de interacción, no las banderas locales de la herramienta. Una herramienta que inicia una interacción de colocación / movimiento / manija (handle) / remodelación (reshape) / selección por marquesina (box-select) / pintura entra en ella mediante `useInteractionScope.begin(...)` y sale mediante `end()` — ver [alcance de interacción](interaction-scope.md) § «Modo de snapping y modificadores». No agregue una nueva bandera de `useEditor` para una interacción nueva.

## Categorías de herramientas por fase

**Sitio**
- `site-boundary-editor` — dibuja/edita el polígono del límite de la propiedad

**Estructura**
- `wall-tool` — dibuja muros segmento por segmento
- `slab-tool` + `slab-boundary-editor` + `slab-hole-editor`
- `ceiling-tool` + `ceiling-boundary-editor` + `ceiling-hole-editor`
- `roof-tool`
- `door-tool` + `door-move-tool`
- `window-tool` + `window-move-tool`
- `item-tool` + `item-move-tool`
- `zone-tool` + `zone-boundary-editor`

**Mobiliario**
- `item-tool` — coloca el mobiliario

**Utilidades compartidas**
- `polygon-editor` — lógica reutilizable de edición de límites/agujeros
- `cursor-sphere` — visualización del cursor 3D

## Patrón

```tsx
// apps/editor/components/tools/my-tool/index.tsx
import { useScene } from '@pascal-app/core'
import { useEditor } from '../../store/use-editor'

export function MyTool() {
  const createNode = useScene(s => s.createNode)
  const setTool = useEditor(s => s.setTool)

  // Pointer handlers mutate the scene store directly.
  // No local geometry — use a renderer for any preview mesh.

  return (
    <mesh onPointerDown={handleDown} onPointerMove={handleMove}>
      {/* ghost / preview geometry only */}
    </mesh>
  )
}
```

## Reglas

- **Las herramientas mutan `useScene` para los cambios confirmados y `useLiveTransforms` para el estado efímero de arrastre.** La escritura de fin de interacción de una herramienta (clic para confirmar, soltar para confirmar) va a `useScene` y queda capturada en el historial de deshacer. Las vistas previas por movimiento de ratón van a `useLiveTransforms` para no saturar el historial ni a los suscriptores.
- **Excepción de arrastre en vivo para transformaciones directas de la malla.** Durante un arrastre activo, una herramienta puede aplicar un desplazamiento de transformación directamente a `sceneRegistry.nodes.get(id).position`/`rotation`/`scale` *únicamente cuando* el mismo desplazamiento se refleja en `useLiveTransforms` para ese nodo. Esta excepción existe porque los renderizadores 3D todavía no concilian `useLiveTransforms` sobre `mesh.position`; cuando un `LiveTransformSystem` lo haga, esta excepción desaparecerá. Condiciones:
  - El desplazamiento de la malla debe reflejar la entrada de `useLiveTransforms` (**el mismo valor exacto**, no «la misma traslación conceptual»), de modo que cualquier cosa que lea `useLiveTransforms` vea la misma vista previa que la vista 3D. `ParametricNodeRenderer` (que se usa para cada tipo (kind) que proporciona `def.geometry`) vincula `<group position={liveTransform.position}>` mediante React — cada notificación de Zustand re-renderiza y reconcilia la posición del grupo de vuelta al valor que tenga `useLiveTransforms`. Si `mesh.position.set(delta)` y `useLiveTransforms.set({ position: someOtherValue })` no coinciden, las dos escrituras se pelean en cada fotograma y el usuario ve vibración (jitter) durante el arrastre.
  - **Para los tipos (kinds) basados en posición (spawn / item / column)**: el campo `position` del nodo ES la posición del grupo en su marco local, por lo que `useLiveTransforms.position` debe contener la posición mundial en vivo del nodo (coincide con el `scene.update` final).
  - **Para los tipos (kinds) basados en polígonos (slab / fence / ceiling / wall)**: el nodo no tiene un campo `position` — la posición canónica del grupo es `[0,0,0]` con la geometría construida en coordenadas locales de nivel. `useLiveTransforms.position` debe contener el **delta** por el cual la herramienta quiere trasladar (`[deltaX, 0, deltaZ]`), no la ubicación mundial del centro del polígono. La posición de la esfera del cursor (que ES el centro del polígono trasladado) se rastrea por separado mediante el `useState` de React, no con `useLiveTransforms`.
  - El desplazamiento debe limpiarse al desmontar la herramienta, al cancelar *y* al confirmar — tanto `mesh.position.set(0, 0, 0)` como `useLiveTransforms.clear(id)`.
  - La herramienta no debe generar ni mutar geometría en esta vía — solo escrituras de transformación. La generación de geometría sigue perteneciendo a un sistema central (core).
- **Sin lógica de negocio en las herramientas** — delega las reglas de geometría/restricciones a los sistemas centrales.
- **El snapping es impulsado por modo, no un mecanismo de elusión con Shift mantenido.** La colocación, el movimiento, la rotación, el redimensionado, el arrastre de extremos y el arrastre de manijas son construcción guiada — snapping de cuadrícula/objetos, incrementos de ángulo canónicos, guías de alineación, retroalimentación de distancia — pero el comportamiento activo es un modo explícito, siempre visible y **por contexto** (el chip del HUD contextual), no una tecla oculta mantenida:
  - **Shift (pulsación)** cicla el modo de snapping del contexto activo (`wall` grid/lines/angles/off · `item` lines/grid/off · `polygon` grid/lines/off — un modo persistido por contexto).
  - **Alt (mantenido)** es fuerza / libre: confirma el cursor crudo más allá del snap *y* más allá de una colocación inválida o con colisión. Es la única tecla momentánea de «elusión» (además de la excepción del montante vertical (vertical-riser) para los recorridos MEP).
  - **Ctrl (pulsación)** cicla el paso de cuadrícula.
  - Lee el snapping por la única vía — `isGridSnapActive()` / `isMagneticSnapActive()` / `isAngleSnapActive()` (`store/use-editor`), que resuelven el modo activo desde el alcance (scope) de interacción mediante `getActiveSnapContext()`. **Nunca** leas `event.shiftKey` / `event.nativeEvent.shiftKey` / `modifiers.shiftKey` para eludir el snapping, y nunca apliques un paso de cuadrícula que no esté condicionado a `isGridSnapActive()` (`const step = isGridSnapActive() ? gridSnapStep : 0`). Un tipo (kind) que admite snapping declara `NodeDefinition.snapProfile` (`'item' | 'structural'`) para que su contexto, su conjunto de modos y su chip surjan sin un conmutador por tipo. El HUD contextual renderiza el chip de snapping para **cualquier** herramienta que resuelva a un contexto de snap — `helper-manager` condiciona el `RegisteredToolHelper` genérico a `snapContext` (o `continuationContext`), no a la presencia de `def.toolHints` escritos a mano, de modo que una herramienta de borrador (draft) que admite snapping y no tiene pistas particulares (p. ej. `zone`) sigue anunciando el control Shift = ciclar que ya respeta. Ver [alcance de interacción](interaction-scope.md) § «Modo de snapping y modificadores» y `lib/snapping-mode.ts`.
  - **Excepción sancionada — snap de conexión de muros.** El dibujado de muros mantiene un snap de «conexión» estricto e independiente del modo para que una habitación pueda seguir cerrándose en los modos no magnéticos (`grid` / `angles` / `off`): a menos de `WALL_CONNECT_SNAP_RADIUS` (0,05 m, `components/tools/wall/wall-snap-geometry.ts`) de un extremo / punto medio / cruce / cuerpo de un muro existente, el punto dibujado se pega a él (y la baliza se muestra). Esto es *conectividad*, no alineación — el snap corre desde el punto ya posicionado por el modo, de modo que la cuantización de cuadrícula / el bloqueo de ángulo / la colocación libre se respetan hasta el propio muro y solo se pegan los últimos centímetros. **No** es una elusión con Shift y no debe condicionarse a modificadores. Ver `snapWallDraftPointDetailed` en `components/tools/wall/wall-drafting.ts`.
  - **Excepción sancionada — snap de conexión estructural de la extensión apoyada (lean-to).** Mover o redimensionar una `lean-to-extension` mantiene un agarre de borde/altura estricto e independiente del modo hacia una extensión vecina. Esto es conectividad: los techos unidos se convierten en un solo recorrido estructural con extremos de canalón compartidos y un poste de unión único. Se aplica tras la propuesta activa de cuadrícula/libre y solo se elude con Alt mantenido. La misma regla se aplica en 2D y 3D.
- **Las restricciones y las guías pueden desacoplarse.** Cuando una restricción más fuerte posee la propuesta — el bloqueo de 45° de un segmento de muro estando en el modo `angles` — la herramienta puede seguir publicando guías pasivas discontinuas de alineación/proximidad siempre que no aplique el delta de snap de la guía. Use esto para segmentos de muro encadenados: los usuarios conservan el borrador restringido y veloz, pero siguen viendo la retroalimentación de proximidad para los puntos posteriores.
- **Las referencias de nivel (datums) estructurales verticales usan su propio canal de guía efímero.** Las manijas de elevación de slab, ceiling, wall-base y fence-base resuelven objetivos estructurales de Y del mismo nivel mediante callbacks de snap escalares, y luego publican una breve línea de referencia horizontal + lectura de elevación solo mientras están exactamente alineadas. El payload está delimitado al dueño y se limpia mediante el `onDragEnd` del descriptor de la manija; es retroalimentación del editor, nunca un nodo de escena. No codifique datums de Y en el store de alineación XZ del plano de piso ni en el store de guías de aberturas de muros — sus contratos de coordenadas y de ciclo de vida difieren.
- **La ayuda refleja el modelo.** El diálogo de atajos y el HUD contextual son parte del contrato de interacción: describen el chip de modo siempre visible + `Alt` = forzar, **no** una elusión oculta con Shift. El HUD está impulsado por el alcance de interacción activo, por lo que solo muestra los controles del contexto actual.
- **La geometría de vista previa es local** — las mallas transitorias que se muestran mientras una herramienta está activa viven en el componente de la herramienta, no en el store de la escena.
- **Limpia al desmontar** — elimina cualquier nodo pendiente/incompleto *y* cualquier transformación en vivo/desplazamiento de malla cuando la herramienta se desmonta.
- **Las herramientas no deben importar desde `@pascal-app/viewer`** — use solo el store de la escena y los hooks centrales. `sceneRegistry` se exporta desde `@pascal-app/core` y es la puerta permitida hacia el grafo de Three.js para los fines limitados anteriores.
- Cada herramienta debe manejar una única interacción bien delimitada. Divida las herramientas complejas (p. ej. «dibujar + mover») en componentes separados seleccionados por `useEditor`.

## Cómo agregar una nueva herramienta

1. Cree `apps/editor/components/tools/<name>/index.tsx`.
2. Registre la herramienta en `ToolManager` bajo la fase y el modo correctos.
3. Agregue el identificador de la herramienta al tipo unión de herramientas de `useEditor`.
4. Si la herramienta requiere nuevos tipos de nodo, agregue primero el esquema + renderizador + sistema.

## Paridad de comportamiento 2D ↔ 3D (expectativa por defecto)

La vista de plano de planta 2D y la vista 3D son dos presentaciones de la **misma** edición. Siempre que un comportamiento sea aplicable a ambas, debe existir en ambas — el *mecanismo* puede diferir (un hover por raycast 3D frente a una consulta del muro más cercano en el espacio del plano; un fantasma (ghost) de malla real frente a un símbolo SVG), pero el *comportamiento percibido* debe coincidir. Cuando agregue o cambie una interacción en una vista, trasládela también a la otra en el mismo cambio, o documente por qué genuinamente no aplica.

Concretamente, la colocación/movimiento de puertas/ventanas mantiene estos aspectos en sintonía a través de `{door,window}/move-tool.tsx` (3D) y `{door,window}/floorplan-move.ts` (2D):

- **Objetivo del snap**: el muro más cercano al cursor real (comparte `findClosestWallInPlan` / raycast de muro), seguimiento libre fuera del muro, confirmación solo sobre un anfitrión (host).
- **SFX de movimiento**: un clic suave de `sfx:grid-snap` por paso de cuadrícula al deslizar (seguimiento libre en el XZ del plano o sobre el muro a lo largo de X, cuantizado y deduplicado para que no sea una ráfaga) y una señal suave de `sfx:item-pick` al hacer snap suelo→muro. Ambas herramientas llevan un par idéntico `tickGridStep` / `tickWallSnap` — manténgalos sincronizados.
- **R-flip** de orientación a mitad de colocación, **Shift** para snap/alineación libre (las guías permanecen visibles) y colocación forzada sobre colisiones, fantasma/símbolo fiel, confirmación determinista de una sola anulación (undo).

Señales de que rompió la paridad: un sonido/guía/snap que se dispara en 3D pero es silencioso en 2D (o viceversa), o una corrección aplicada en un archivo de movimiento pero no en su gemelo. Los dos archivos de movimiento son casi espejos a propósito — hágales diff ante la duda.

**La navegación es parte de la paridad.** El movimiento aprendido en una vista funciona en la otra (WASD, Espacio + arrastre, arrastre con botón central, rueda, órbita), y la vista dividida mantiene ambas sincronizadas mediante `navigationSyncPose`. En la vista solo 2D el lienzo 3D está en pausa (`renderPaused`), de modo que nada impulsado por su bucle de fotogramas llega al plano: el plano posee el WASD y los botones de órbita por sí mismo (`components/editor/floorplan-panel.tsx`, que comparte `lib/keyboard-pan.ts` con `custom-camera-controls.tsx` — teclas físicas, mismas salvaguardas y velocidad) y publica la pose en 3D cuando el movimiento termina, mientras la cámara permanece inactiva. Una entrada de navegación que solo existe del lado de la cámara es una regresión 2D a punto de suceder.

**La selección de grupo actúa sobre la selección.** El movimiento / rotación / duplicado de grupo transforman solo a los participantes seleccionados; los muros conectados fuera de la selección se estiran en sus extremos compartidos (`LinkedNeighbor`). Su huella proviene de los datos del plano, nunca de las mallas: `groupPlanBounds` (`components/editor/group-transform-shared.ts`) lee los contornos de los muros, los anillos de polígonos y los recorridos de cercas (fence runs) en el marco de nivel, y mide las mallas solo para los objetos colocados (límites recién calculados, `userData.placeholder` omitido, ancla como respaldo). Una caja de malla en espacio mundial mapeada al marco de nivel aterriza al lado de las mallas bajo un edificio rotado, y en la vista solo 2D las mallas pueden no estar construidas. La caja discontinua 2D, el gizmo de rotación 3D y las teclas R/T giran alrededor del centro de esa caja.

**La losa y el techo de una habitación se deseleccionan juntos en el plano.** El plano de planta dibuja el techo como un contorno sin relleno bajo los muros (`fill="none"` es click-through, ver más abajo), de modo que una marquesina puede seleccionarlo pero un clic no lo alcanza. Quitar cualquiera de las dos superficies de la selección elimina su contraparte de mismo contorno: la losa y el techo declaran `extensions['pascal:editor/floorplan'].selectionCounterparts` (`packages/nodes/src/shared/surface-counterparts.ts`) y `applyEntrySelection` consulta al registro, de modo que el plano nunca nombra un tipo (kind). Agregar se mantiene individual, y en 3D se conservan los conmutadores individuales porque allí cada superficie es clicable.

El movimiento de superficies en la vista de plano conserva solo el anfitrión original mientras el centro de la huella esté soportado. Salir confirma una pose de piso en el marco de nivel con el soporte reelegido y los vínculos de fijación eliminados atómicamente. La vista de plano nunca adquiere un nuevo anfitrión ni cicla superficies; la colocación nueva permanece en el piso. Los diseños generados habilitan el arrastre de cuerpo mediante `extensions['pascal:editor/floorplan'].directDrag`, que no habilita un arrastre de cuerpo simple en 3D.

## Coexistencia de movimientos: `FloorplanRegistryMoveOverlay` 2D + mover 3D heredado

Mientras un tipo (kind) está a mitad de migración, su movimiento puede ejecutarse por dos vías a la vez: el `FloorplanRegistryMoveOverlay` 2D impulsado por el registro (`def.floorplanMoveTarget`) y el mover 3D heredado (p. ej. `MoveItemContent`). Ambos reaccionan a `setMovingNode(node)`, ambos se montan, ambos quieren confirmar. Surgieron dos escollos con correcciones estables; replique estos patrones al trasladar otro tipo para que coexista.

### Escollo: la limpieza 2D pisando la confirmación 3D

`FloorplanRegistryMoveOverlay` pausa el historial de la escena al montarse y toma una instantánea (snapshot) del nodo en movimiento. Si el usuario realmente confirma en 3D, la vía 3D escribe el nuevo estado y limpia `movingNode`. Entonces la superposición (overlay) 2D se desmonta — y su `useEffect` de limpieza llamaría a `updateNodes(snapshot)`, sobrescribiendo el estado 3D recién confirmado con el original.

Corrección en `floorplan-registry-move-overlay.tsx`: condicione la reversión de la limpieza a una bandera `hasMovedSinceStart` que solo se establece dentro de `onMove` **después** de la guarda `target.closest('[data-floorplan-scene]')`. Si ninguna aplicación 2D se ejecutó jamás, la divergencia en el estado de la escena debe ser de un confirmador externo — omita la reversión y solo reanude el historial. Síntoma si falta: los objetos (items) vuelven a su posición / rotación previa al arrastre al confirmar en 3D.

### Escollo: `useDraftNode.destroy()` pisando la confirmación 2D

Problema espejo en la otra dirección. La limpieza de `usePlacementCoordinator` del mover 3D heredado llama incondicionalmente a `draftNode.destroy()`, que para los movimientos adoptados escribe la posición original de vuelta en la escena. Si la vía 2D confirmó primero, el destroy lo revierte.

Corrección en `use-draft-node.ts`: en el `destroy()` del modo de movimiento, compare la posición en vivo de la escena con la instantánea del momento de `adopt()`. Si divergen, un confirmador externo ya escribió el nuevo valor — omita la restauración (y el reinicio de la malla). Las vías de cancelación (Escape) siguen revirtiendo, porque revierten antes del desmontaje, de modo que en vivo == instantánea al momento del destroy.

### Escollo: pointermove se dispara globalmente; trate los eventos del lienzo 3D como fuera de alcance

`FloorplanRegistryMoveOverlay` escucha el pointermove de `window`. Cuando el usuario arrastra en 3D el listener igualmente se dispara — sin una comprobación de destino convierte las coordenadas de cliente del lienzo 3D a través del CTM del SVG del plano de planta, produciendo coordenadas de plano basura que pelean con las actualizaciones de malla del mover 3D.

Condicione siempre `onMove` (y `onPointerUp`) con `target.closest('[data-floorplan-scene]')` para que la vía 2D solo actúe cuando el puntero esté realmente sobre la escena del plano de planta.

## El contrato de `useLiveTransforms` es por tipo (kind), no genérico

El nombre del store sugiere un contrato uniforme; las escrituras en la práctica no lo son. Documente el marco del lado del escritor; los consumidores deben conocer el tipo (kind) o estar acotados.

| Escritor | Marco de `position` | Marco de `rotation` |
|---|---|---|
| `usePlacementCoordinator` (item en piso / muro / techo) | plano mundial (local al nivel) | Y mundial |
| herramientas de mover de `door` / `window` | local al muro | local al muro (0 o π) |
| movers de `slab` / `ceiling` / `fence` y basados en polígonos | **delta** de posición (`[Δx, 0, Δz]`) | sin uso / 0 |
| `column` / `roof` / `elevator` / `spawn` / tipos de posición única | plano mundial | Y mundial |

Todo lo que se suscriba a `useLiveTransforms` para informar el renderizado 2D debe manejar estos marcos explícitamente. La superposición `FloorplanRegistryLayer` actualmente bifurca por tipo (kind): `item` / `shelf` / `column` se tratan como plano mundial (copia `live.position` sobre el nodo efectivo y fuerza `parentId: null` para que el resolvedor omita la transformación de la cadena de padres), mientras que `slab` / `ceiling` / `zone` se tratan como un **delta** de polígono (traslada los vértices del polígono por `live.position`). Cada tipo (kind) agregado a la vía de arrastre en vivo hace crecer este conmutador del lado del consumidor; la corrección preferida a largo plazo es estandarizar el marco en el escritor para que el consumidor deje de bifurcar por `node.type`.

## Arrastre en vivo impulsado por datos: `useLiveNodeOverrides`, nunca `useScene` por tick

`useLiveTransforms` (arriba) lleva un desplazamiento rígido de posición/rotación — correcto cuando el renderizador puede previsualizar el movimiento transformando el grupo del nodo. Es **incorrecto** cuando la geometría se *recalcula a partir de campos de datos* (un muro vuelve a hacer sus ingletes desde `start`/`end`, una abertura vuelve a cortar su muro anfitrión, un arrastre de extremo remodela el segmento y afecta en cascada a los muros enlazados): la forma misma cambia, así que no hay un desplazamiento rígido que aplicar. Aquellas se previsualizan mediante **`useLiveNodeOverrides`** (`@pascal-app/core`) — la herramienta publica los campos modificados por tick (`set(id, patch)` / `setMany(...)`) y los sistemas de geometría los fusionan (`getEffectiveWall` en 3D, la fusión de anulaciones hermanas del plano de planta en 2D, `getEffectiveNode` en los paneles). El store de la escena permanece intacto durante el arrastre; al confirmar, la herramienta limpia las anulaciones y escribe **una sola vez** (`resumeSceneHistory → updateNodes([...]) → pauseSceneHistory`), de modo que el gesto es un solo paso de deshacer. Esc/desmontaje solo limpia las anulaciones — cancelar es gratis.

**Escribir `useScene.updateNodes`/`updateNode` en cada tick de `grid:move` es un bloqueante:** reemplaza la ref del mapa `nodes`, de modo que cada suscriptor de `useScene(s => s.nodes)` en toda la aplicación (paneles, HUD, tooltips, plano de planta, catálogo) re-renderiza en cada fotograma → colapso de FPS. (`markDirty` por tick está bien para un gesto acotado — nunca llama a `set()` y las marcas se drenan en cada fotograma; un bucle de animación que marque dirty mientras se ejecuta no lo está, ver `node-definitions.md` § "`geometry` + `system`".) Referencia: `packages/nodes/src/wall/{move-tool,move-endpoint-tool}.tsx`.

## Registro del plano de planta: suscripciones por nodo, props estables

`FloorplanRegistryLayer` dibuja un `FloorplanRegistryEntry` por nodo. El invariante de rendimiento — un arrastre en vivo debe re-renderizar solo los nodos cambiados, no las ~150 entradas — se apoya en tres cosas, y romper cualquiera de ellas es una regresión de inundación de re-renderizados que igualmente compila y pasa las pruebas (ver `floorplan-registry-layer.tsx`):

- Cada entrada se suscribe a **su propia porción** — `useLiveTransforms(s => s.transforms.get(id))` / `useLiveNodeOverrides(s => s.overrides.get(id))`, nunca al Map completo. Esto funciona porque los stores en vivo escriben un valor nuevo solo para el nodo cambiado (el Map se clona pero las refs de valores sin cambios se reutilizan), de modo que el selector de un nodo sin cambios permanece estable por identidad y Zustand lo omite. El padre se suscribe solo a la lista estable de ids.
- `FloorplanRegistryEntry` e `InteractiveGeometry` están con `memo`, por lo que el padre debe pasar **props referencialmente estables** (estilos elevados, manejadores con `useCallback`, descriptores memoizados) — un objeto/manejador en línea nuevo por entrada anula el memo.
- La geometría dependiente de hermanos (ingletes de muros, cortes de aberturas) se invalida mediante una **época de hermanos por nodo** incrementada desde un `subscribe` del store (`computeAffectedSiblingIds`), no con un re-renderizado de toda la capa.

## Las rotaciones de los nodos fijados a muros deben ser locales al muro

`door` / `window` / los `item` fijados a muros son hijos de la malla del muro en 3D. La `mesh.rotation.y = -atan2(dy, dx)` del muro. Por lo tanto, la `rotation.y` del nodo hijo vive en el marco local del muro y se compone con la rotación del muro al momento de renderizar.

La fuente de verdad 3D es `calculateItemRotation(normal)` en `editor/src/components/tools/item/placement-math.ts`, que devuelve 0 (cara frontal) o π (cara trasera). Cualquier ayudante de movimiento 2D que escriba `node.rotation[1]` para nodos fijados a muros debe producir el mismo valor local al muro. Escribir una rotación en espacio mundial produce errores de orientación que varían con la dirección del muro — típicamente 90° en muros horizontales y 180° en muros verticales (que a veces «se ven bien» por simetría, lo cual es peor — corrupción silenciosa).

Ver `WallHit.itemRotation` de `nodes/src/shared/wall-attach-target.ts`. La determinación de lado allí está calibrada con la misma convención: en el espacio local al muro, el muro se extiende a lo largo de +X, la normal de la cara frontal es +Z, y `perpRaw >= 0` es el lado frontal.

## Movimiento / colocación: desactive el raycast sobre la malla movida

Una herramienta de movimiento 3D que sigue al cursor escribiendo `mesh.position.set(x, 0, z)` cae en un bucle de retroalimentación: a medida que la malla sigue al cursor, se interpone entre la cámara y el plano de la cuadrícula, de modo que el raycaster de R3F alcanza primero la malla movida → solo se dispara `${kind}:move` → `grid:move` deja de dispararse → la instantánea del cursor (usada como posición de confirmación) se congela en su valor inicial. El usuario hace clic en un punto nuevo y el nodo se confirma en el punto de partida.

Corrección en `MoveRegistryNodeTool`: al iniciar el arrastre, recorra la malla movida y sobrescriba `child.raycast = () => {}` en cada descendiente; restaure los originales en la limpieza del effect. Ahora el rayo atraviesa la malla movida, alcanza el plano de la cuadrícula, y `grid:move` sigue disparándose.

`MoveRegistryNodeTool` usa el resolvedor de superficies compartido para los tipos (kinds) cuya capacidad `floorPlaced` aplica. Ni `hostable` ni `hostable.parents` condicionan la sesión. Se suscribe a los tipos anfitriones físicos registrados y deja que sus proveedores de superficies acepten o rechacen al hijo; la lista de exclusión (denylist) no física del protocolo excluye contenedores y guías. Las recetas procedimentales montadas permanecen en su sesión separada. El resolvedor de superficies compartido posee la elección de fila del estante (shelf) y el ajuste (fit). La entrada del estante comprueba la normal hacia arriba; los movimientos posteriores pueden cambiar de fila a través de las caras laterales. Cada colocación de estante comprueba la región del tablero, incluidos el movimiento y la rotación; ver [Política de ajuste a superficie](#surface-fit-policy). Los límites procedimentales desplazados mantienen la huella centrada bajo un nuevo impacto del cursor y colocan su base sobre el tablero.

Mientras está hospedado, el despacho de la cuadrícula espera a que ambos listeners del DOM hayan corrido y empareja el evento de puntero nativo con el impacto del anfitrión. Los movimientos de piso del registro no hospedados se aplican de inmediato; un impacto de anfitrión posterior en el mismo despacho reemplaza la vista previa de piso. Tanto el coordinador del catálogo como el mover del registro usan `shared/shelf-stickiness.ts`: los eventos de salida del estante retienen el hospedaje, y un rayo de cuadrícula debe errar el volumen local del estante (con el margen existente de 8 cm) antes de desacoplarse. Las salidas de superficies de objetos (items) aún se desacoplan de inmediato. Los movimientos hospedados existentes conservan su desplazamiento de agarre hasta cambiar de anfitrión o desacoplarse; R/T rota alrededor de la posición local almacenada. La fijación limpia el soporte de losa del hijo; el desacople usa la elección de soporte de piso existente. Las consultas procedimentales componen las transformaciones del estante y de los gabinetes anidados y aplican la elevación de losa solo en el ancestro con padre de nivel.

Las transiciones de padre y las poses hospedadas se previsualizan en `useScene` con el historial en pausa para que React pueda reasignar el padre del renderizador. Las vistas previas hospedadas usan esa pose local almacenada (sin transformación en vivo de plano mundial); la caja de la huella se convierte al marco de nivel. La confirmación restaura el padre y la pose del inicio del arrastre antes de una única escritura rastreada. La limpieza restaura tanto los nodos nuevos como los existentes sin historial, restablece el estado del puntero/agarre y deja vivos los borradores nuevos; la cancelación explícita elimina los borradores nuevos. La vía de movimiento 2D de objetos, también usada por los objetos procedimentales, compone la transformación del anfitrión y conserva la fila de estante actual o la superficie de encimera mientras la huella rotada siga contenida. Fuera de ella, el comportamiento heredado de desacople de nivel / Y de origen sigue pendiente en el slice F, junto con la adquisición y el ciclado de superficies en la vista de plano.

`relations.hosts` del estante incluye hijos del catálogo y procedimentales. Los movimientos del registro, las vistas previas/limpieza de manijas 3D, y las vistas previas 2D de mover/redimensionar/rotar estantes propagan marcas dirty en cada tick para que los hijos se vuelvan a marcar después de que un renderizador drena el conjunto. El `geometryKey` del estante excluye a los hijos, manteniendo los tableros estables durante la fijación. La geometría del gabinete y las claves de vecinos incluyen solo los IDs de hijos de gabinete/módulo estructurales. `geometryChildTypes` también filtra la clave de anulación en vivo de hijos del visor: los estantes no declaran ninguna, los gabinetes/módulos solo declaran sus tipos hijos estructurales.

Ambos movers enrutan los eventos de gabinete a través de `resolveSurfacePlacement`. Las encimeras conservan el movimiento XZ libre con snapping de cuadrícula; no eligen centros de módulo ni de vano (span). El proveedor elige el vano real o la altura de la barra a partir del impacto, mientras que el `origin` opcional mantiene la pose del hijo agarrado o fuera de origen separada del contacto que lo eligió. Las huellas rotadas completas se comprueban después del snapping contra el vano y sus agujeros. La adherencia de la encimera intersecta las regiones de superficie publicadas, nunca el volumen delimitador del recorrido, de modo que los huecos reales y las aberturas de fregaderos siguen siendo salidas. El recorrido alcanzado posee al hijo, incluida una pata de esquina anidada. Las ediciones del inspector de recorridos y las manijas de redimensionado registradas preparan sus cambios estructurales, trasladan la Y del hijo según la altura de superficie estable anterior/nueva, y rechazan una edición que elimine o invalide una superficie ocupada. Son reglas de la vía de edición; las escrituras de escena arbitrarias no invocan esta reconciliación.

Lo mismo aplica a las vistas previas de colocación — ver `nodes/src/shelf/preview.tsx` por el patrón `(obj as { raycast: () => void }).raycast = () => {}`. Una vista previa que captura los rayos priva de su instantánea a la propia `grid:move` de la herramienta de colocación.

## Movimiento / colocación: los manejadores de confirmación escuchan cada `${kind}:click`

El raycaster de puntero de R3F despacha el evento de clic a la malla más cercana, incluso cuando el usuario cree que está haciendo clic en el suelo. Una herramienta que solo escucha `grid:click` pierde confirmaciones cada vez que el rayo del clic aterriza sobre una cara de muro, un lateral de estante, un objeto (item) o la propia malla del cursor aún en colocación. Síntoma: los clics golpean visiblemente «cerca» del cursor pero la herramienta no hace nada.

La corrección es el patrón usado por `ShelfTool` y `MoveRegistryNodeTool`: mantenga la última instantánea de `grid:move` en una ref, y luego registre un único manejador de confirmación compartido contra `grid:click` **y** cada evento común de clic de tipo (kind):

```ts
const CLICK_TRIGGER_KINDS = [
  'shelf', 'item', 'slab', 'ceiling', 'wall',
  'fence', 'column', 'roof', 'roof-segment',
  'stair', 'stair-segment',
] as const

emitter.on('grid:click', commitAtCursor)
for (const kind of CLICK_TRIGGER_KINDS) {
  emitter.on(`${kind}:click` as `${typeof kind}:${EventSuffix}`, commitAtCursor as never)
}
```

La confirmación lee `lastCursorRef.current` (establecida por `grid:move`), no la posición del evento de clic — los clics en superficies verticales llevan el punto de impacto en esa superficie, que puede estar a metros del cursor que el usuario apuntaba visualmente.

## Las herramientas de movimiento deben conservar la rotación real del nodo en `useLiveTransforms`

Una herramienta que escribe `useLiveTransforms.set(id, { position: [x, 0, z], rotation: 0 })` durante el arrastre borra la rotación Y real del nodo mientras dure el arrastre. `ParametricNodeRenderer` lee `liveTransform.rotation` y aplica `<group rotation={[0, liveTransform.rotation, 0]}>`, de modo que el nodo movido se des-rota visualmente a 0 en el momento en que la herramienta se monta, y luego vuelve de golpe a su rotación real al confirmar cuando la transformación en vivo se limpia. Los usuarios perciben ese salto como «el nodo se fue a una posición rara».

Capture la `node.rotation[1]` original al momento de montar y reenvíela en cada `set`:

```ts
const originalRotationY = useMemo(() => {
  const r = (node as { rotation?: unknown }).rotation
  return typeof r === 'number' ? r : Array.isArray(r) ? (r[1] ?? 0) : 0
}, [node])

// in onMove:
useLiveTransforms.getState().set(node.id, {
  position: [x, 0, z],
  rotation: originalRotationY,
})
```

Si la herramienta *además* rota el nodo durante el arrastre, debe impulsar `rotation` desde el estado actual de la herramienta — no desde 0, no desde el valor obsoleto del nodo.

## Ciclo de vida del muro: dibujar, dividir, fusionar

Los muros se dibujan como una cadena de líneas o un rectángulo (`R` conmuta dentro de la herramienta de muros; el chip Shape del HUD cicla el mismo store `useWallDrawingMode`, `packages/nodes/src/wall/drawing-mode.ts`). En 2D la herramienta de rectángulo solo reclama los clics y publica su primera esquina en `useFloorplanDraftPreview`; la capa de borrador lineal del panel dibuja los cuatro muros con ingletes usando los platos y las guías del borrador de línea, de modo que cursor, snapping y alineación son los del propio muro lineal (`packages/nodes/src/wall/floorplan-tool.tsx`).

La división (split) es un corte en bucle impulsado por el HUD que vive por completo en `packages/nodes/src/wall/`: `split-session.ts` abre el alcance `reshaping` propio del muro (`reshape: 'split'`, `driver: 'tool'`, que resuelve al contexto de snap `polygon` — ver `interaction-scope.md`) y posee cada transición del borrador de `split-store.ts`; el scroll establece de 1 a 32 cortes, un corte único sigue al puntero con los modos de snapping, varios dividen el muro de forma uniforme, y un clic los confirma como un solo paso de deshacer a través de `planWallDivisions` (core). El editor lo monta solo a través de costuras agnósticas al tipo: `def.affordanceTools.split` (marcadores 3D, `split-tool.tsx`), `extensions['pascal:editor/floorplan'].reshapeLayers.split` (la capa del plano, `split-floorplan-layer.tsx`, montada por `FloorplanRegisteredToolLayer` mientras el alcance corre), `def.affordanceHints.split` (el chip de recuento de cortes y pistas del HUD, renderizado por `HelperManager` como `toolHints`), y `actionMenu.actions` (`actions.tsx`, los botones Split y Merge que `NodeActionMenu` renderiza para los tipos seleccionados). Cualquier nombre de reshape sin un brazo dedicado en `ToolManager` se resuelve de la misma manera, de modo que el siguiente reshape propiedad de un tipo (kind) no requiere cambios en el editor. Fusionar (Merge) es el inverso (`planWallMerge` en core): los muros seleccionados que se continúan entre sí se unen en el muro con más fijaciones, las aberturas conservan su posición mundial, las habitaciones conservan una referencia de límite; los rechazos nombran la diferencia en el tooltip del botón. La regla de unión (`systems/wall/wall-merge.ts`) se comparte con la sanación al eliminar.

Los modos y parámetros de estas herramientas viven en teclas, la rueda y el HUD (`ToolHint.chip`), no en filas de opciones de la barra lateral ni en paneles flotantes.

## El `fill="none"` de SVG es click-through

Al emitir un polígono de `FloorplanGeometry` que debe seguir siendo interactivo pero visualmente invisible (p. ej. un objeto con una imagen en miniatura que carga el peso visual), use `fill="transparent"`, no `fill="none"`. El `pointer-events: visiblePainted` por defecto solo hace hit-test al interior cuando hay un servidor de pintura — `none` no es pintura, `transparent` sí lo es. Sin esto, el `<g>` envolvente de la capa del plano de planta nunca ve el `onPointerDown` y los clics no seleccionan el nodo.

## Colocación procedimental de techos

Las recetas procedimentales declaran `mounting: { attachTo: 'ceiling', reference }` con una superficie superior +Y nombrada y no repetida. La sesión compartida de movimiento procedimental montado maneja vistas previas de muro y techo, snapping, comprobaciones de colisión, colocación forzada con Alt ante colisiones, confirmaciones de subárbol nuevo y deshacer de un solo paso. Los eventos de entrada/movimiento/clic del techo usan el XZ local al techo; el respaldo de cuadrícula muestra un fantasma rojo sin hospedar y no puede confirmar. El padre es el techo, la Y almacenada es cero en la referencia, y solo gira el guiñado (yaw, R/T); la pose renderizada resta la referencia rotada para que el diseño cuelgue a ras bajo la parte inferior del techo. La validación de core aplica la contención de polígono, los agujeros y la altura de nivel incluso con Alt. El objetivo de movimiento 2D encuentra los polígonos del techo y usa la misma sesión; los glifos resuelven el marco del techo, mientras que las flechas de parámetros se transportan por el marco del techo y la elevación de piso nunca se aplica.

## Política de ajuste a superficie

`resolveSurfacePlacement` posee el ajuste (fit) para ambos movers. El rigor sigue lo que el proveedor conoce sobre la superficie:

- **Declarada (Declared):** un ID de superficie estable y no nulo requiere una `region`. El casco rotado del hijo debe caber dentro de esa región después del snapping, excluyendo agujeros. El casco proyecta las ocho esquinas cuando se suministran rotación XYZ completa o límites desplazados. La contención rectangular permite 1e-6 m por borde, de modo que un objeto centrado y sin rotar que coincide exactamente con un tablero cabe pese al ruido de punto flotante.
- **Derivada del impacto (Hit-derived):** `id: null` no tiene región. Un impacto hacia arriba identifica el soporte pero no puede describir el contorno de un reposabrazos o un cojín. La prueba de mejor esfuerzo compara los alcances XZ del hijo rotado con los límites disponibles del anfitrión, con una tolerancia de 1e-6 m. No restringe la posición del impacto a una parte superior plana ficticia. Los anfitriones sin límites medibles siguen siendo permisivos.

`HostSurface` es una unión: un ID no nulo requiere `region`, mientras que un ID nulo no tiene ninguna. `SurfaceProvider.surfaces()` devuelve solo `DeclaredHostSurface[]`. Los plugins sin tipos que resuelven una superficie declarada sin región lanzan un error de contrato explícito; nunca entran en silencio a la vía de ajuste derivada del impacto. La opción de bajo nivel `checkFootprint: false` es para propuestas de pose sin comprobar, no para colocaciones válidas: igualmente aplica la integridad de la declaración y la aceptación. Ambos movers de estante comprueban el ajuste al entrar y al moverse y revalidan las rotaciones antes de confirmar.

Auditoría de proveedores:

| Proveedor | Extensión publicada |
|---|---|
| Filas de estante | Rectángulos de tablero centrados. La profundidad es `D - 0.002 m`. Los estantes de muro usan el ancho `W`; las librerías con laterales y compartimentos usan `W - 2 × thickness`; las estanterías abiertas y las librerías sin laterales usan `W - 0.002 m`. El tablero inferior opcional de una librería sin laterales usa `W`, coincidiendo con su malla. La malla y el adaptador comparten el ayudante de dimensiones del tablero. |
| Encimeras y barras de gabinetes | Cada vano real de encimera y el rectángulo de la losa de la barra, con su centro real y semiejes. Los agujeros de encimera cubren las huellas de los bowls de fregadero, los grifos y los quemadores. Los vanos altos/de muro/deshabilitados no publican nada. |
| Superficies nombradas procedimentales | Ancho/profundidad de la receta evaluada divididos entre dos, en el marco propio de cada superficie. |
| Proveedor de impacto de objetos del catálogo | Sin extensión declarada: la `asset.surface.height` de autoría solo suministra Y, no un límite XZ utilizable. Conserva la colocación de forma libre seleccionada por rayo y la comprobación de límites de anfitrión por mejor esfuerzo con rotación. |
| Proveedor genérico derivado del impacto | Sin extensión declarada: el impacto ascendente de la malla suministra el soporte, opcionalmente acotado por `dragBounds` o `floorPlaced.footprint`. Los metadatos heredados de altura superior/lateral por sí solos no son una declaración de región. |

La elección de fila, los empates de primera fila, la adherencia del volumen del estante y las funciones existentes de snap de cuadrícula permanecen sin cambios. En 2D, la retención del anfitrión actual usa este mismo resolvedor y la región del tablero; su anterior comprobación extra del rectángulo del estante completo desapareció. La adquisición de anfitrión nuevo, el ciclado de superficies y el comportamiento existente de salida a nivel permanecen en el slice F de hospedaje en superficie. Una salida 2D actualmente elige el nivel en lugar de rechazar una colocación en anfitrión, de modo que no publica una etiqueta de rechazo de superficie.

Un rechazo en 3D pone la vista previa de huella existente en rojo y coloca una etiqueta de estado corta junto a ella. `onReject` llega a ambos movers; el evento de piso correspondiente no puede borrar el motivo ni confirmar la colocación rechazada en el piso. Un nuevo movimiento de piso o una superficie válida lo limpia, al igual que la limpieza/cancelación. Alt puede eludir las comprobaciones de colisión, pero no un rechazo de superficie. La rotación reintenta el anfitrión intentado cuando es necesario.

| Rechazo | Redacción de la vista previa |
|---|---|
| Huella fuera de la región declarada o que excede los límites de anfitrión derivados del impacto | No cabe en esta superficie |
| Impacto dentro de un agujero, o huella contenida que se superpone a un agujero | Sobre un recorte de fregadero o quemador |
| Anfitrión no elegible o hijo rechazado por su predicado de aceptación | Este anfitrión no acepta este tipo de objeto |
| Sin superficie de soporte o impacto inválido | No hay superficie de soporte aquí |

La tabla de ajuste congelada fija tanto la aceptación como el rechazo de cada adaptador, con conteos exactos por veredicto. La aceptación del estante barre cada tablero de fijación a través de colocaciones en el interior, cerca del borde, igualdad centrada y rotadas, incluidos los casos con cuadrícula activada. Las poses esperadas capturadas permanecen estáticas durante las pruebas; cambiar la política de ajuste exige revisar los cambios de veredicto y conservar la cobertura de ambos resultados.