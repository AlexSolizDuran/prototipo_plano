# Alcance de interacción

_La máquina de estados de interacción autoritativa («la columna vertebral») — un solo alcance (scope) describe «lo que el usuario está haciendo actualmente»._

Se aplica a: `packages/editor/src/lib/interaction/**`, `packages/editor/src/store/use-interaction-scope.ts`.

Antes de esto, «¿qué está haciendo el usuario ahora mismo?» se volvía a derivar de 7+ banderas independientes de `useEditor` (`movingNode`, `placementDragMode`, `activeHandleDrag`, `curvingWall`, `curvingFence`, `editingHole`, `movingWallEndpoint`, `movingFenceEndpoint`). Cada superposición (overlay) y sitio de selección volvía a derivar su comportamiento de un subconjunto distinto, de modo que las banderas podían derivar hacia combinaciones ilegales (mover y curvar a la vez; un `movingNode` obsoleto después de que un arrastre terminara). El alcance (scope) las colapsa en una sola unión discriminada, haciendo que esas combinaciones sean irrepresentables: un alcance es exactamente una interacción a la vez, e `idle` no lleva ningún payload.

---

## El modelo

`InteractionScope` (`lib/interaction/scope.ts`) es una unión discriminada sobre `kind`:

| `kind`         | Payload                                                                     | Qué                                                                                                                                                                |
| -------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`         | —                                                                           | Nada en vuelo. El único estado donde la selección/el picking por hover es significativo.                                                                                      |
| `placing`      | `node`, `nodeId`, `nodeType`, `view`, `pressDrag`, `driver`                 | Colocando un nodo nuevo (del catálogo/preset/herramienta de construcción). `node` lleva el borrador aún no confirmado; `pressDrag` = press-drag de gizmo (confirmar al soltar) frente a clic-para-colocar. `driver` identifica el único cuerpo de interacción que posee la vista previa y la confirmación. |
| `moving`       | `node`, `nodeId`, `nodeType`, `view`                                        | Moviendo un nodo existente.                                                                                                                                            |
| `handle-drag`  | `nodeId`, `handle`                                                          | Arrastrando una manija de redimensionar/trasladar/rotar de un nodo seleccionado.                                                                                                       |
| `mesh-editing` | `nodeId`, `phase`, `operator?`                                              | Editando los componentes internos de malla de un nodo. Se mantiene durante toda la sesión del modo de edición; `phase` distingue la selección de componentes de un operador en curso.         |
| `drafting`     | `tool`                                                                      | Dibujado (drafting) de clic-a-clic de un tipo de polilínea/polígono (wall/fence/slab/…).                                                                                             |
| `reshaping`    | `nodeId`, `reshape`, `driver`, `holeIndex?`, `endpoint?`, `index?`, `side?` | Remodelando la geometría de un nodo seleccionado. `driver` identifica el cuerpo de interacción que posee la vista previa y la confirmación.                                                        |
| `box-select`   | —                                                                           | Arrastre de selección por marquesina.                                                                                                                                             |
| `painting`     | —                                                                           | Aplicación de pintura de material.                                                                                                                                         |

`reshaping` agrupa las ediciones de extremo/curva/agujero/límite/punto de control/tangente como sub-estados de un solo alcance — hay un solo nodo y un solo reshape en curso, de modo que «curvar y editar agujeros a la vez» sigue siendo irrepresentable. Su `driver` es `'tool' | 'floorplan'`: las herramientas del framework poseen las interacciones impulsadas por herramientas, mientras que una funcionalidad (affordance) del plano de planta posee el ciclo de vida completo de vista previa/confirmación de una interacción impulsada por el plano. El driver evita que ambos cuerpos de interacción se monten para el mismo gesto. La colocación (placing) y el movimiento (moving) usan `view: '2d' | '3d'`.

### Ayudantes

- `isIdle(scope)` / `isActive(scope)` — `idle` frente a cualquier otra cosa (`ActiveInteractionScope`).
- `scopeNodeId(scope)` — el nodo sobre el que actúa un alcance, o `null`. `drafting`/`box-select`/`painting`/`idle` no apuntan a ningún nodo existente único. Un alcance `mesh-editing` apunta al bloque cuya topología posee la sesión.
- `isToolDrivenReshape(scope)` / `isFloorplanDrivenReshape(scope)` — acotan la propiedad del reshape para que solo se monte el cuerpo de interacción correspondiente.
- `selectionEnabled(scope)` — solo es true mientras está `idle`. Durante cualquier interacción activa el puntero pertenece al cuerpo de esa interacción, no a seleccionar un objeto distinto; el punto de estrangulamiento del picking no debe enrutar un hover/clic hacia la selección mientras esto sea false.

---

## El contrato del store

`useInteractionScope` (exportación por defecto de `store/use-interaction-scope.ts`) es el dueño único. Exactamente un alcance a la vez; la única forma escribible es `InteractionScope`, así que no hay ningún setter que pueda dejar un estado a medias.

| Método                                 | Comportamiento                                                                                                                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | 
| `begin(scope: ActiveInteractionScope)` | Entra en una interacción. Si ya hay una activa, se reemplaza (dueño único, sin carreras de productores).                                                                                                                  |
| `update(patch)`                        | Aplica el parche al payload del alcance actual. **Se ignora en `idle`, y se ignora cuando el `kind` del parche difiere del kind activo** — las actualizaciones de payload no deben cambiar qué interacción está en curso (use `begin` para eso). |
| `end()`                                | Vuelve a `idle` atómicamente. Tanto la confirmación como la cancelación lo llaman; la distinción escribir-vs-revertir vive en el cuerpo de interacción, no aquí.                                                                               |
| `endIf(match)`                         | Vuelve a `idle` solo si el alcance activo satisface `match`.                                                                                                                                                        |

El alcance `mesh-editing` es el resumen global de propiedad, no un contenedor del estado de componentes específico de cada tipo (kind). El tipo `block` mantiene su modo de vértice/borde/cara, los IDs seleccionados, el componente activo y la ranura de material activa en un store transitorio propiedad del tipo bajo `packages/nodes/src/block/`. La funcionalidad del lienzo y el inspector personalizado comparten ese store mientras el alcance posee la sesión. Entrar en otra malla transfiere la propiedad; la pérdida del alcance, la salida explícita y el desmontaje limpian solo la sesión del nodo correspondiente. La topología y las ranuras de material persistidas permanecen en `useScene`.

**Invariante de fin atómico.** `end()` devuelve el alcance a `IDLE_SCOPE` en una sola escritura — ningún payload de interacción puede filtrarse más allá del final de su interacción (sin `nodeId` obsoleto, sin banderas a medio limpiar). `endIf` existe porque el alcance actualmente se impulsa desde limpiezas de banderas heredadas independientes (más abajo): limpiar una bandera (p. ej. una curva de cerca) no debe pisotear un alcance activo no relacionado (p. ej. un movimiento de muro), de modo que la limpieza solo termina el alcance si lo posee.

---

## Conjunto caliente (hot-set): qué es elegible para el raycast durante una interacción

`lib/interaction/hot-set.ts` responde «¿qué objetos de la escena puede apuntar la interacción activa?». Nunca se escribe a mano por interacción — surge del `asset.attachTo` del nodo más si un candidato expone una superficie superior.

`attachClassOf(attachTo)` reduce la fijación a tres valores de `AttachClass`:

- `wall` — `attachTo` de `wall` o `wall-side`.
- `ceiling` — `attachTo` de `ceiling`.
- `surface` — todo lo demás («objeto de piso (floor item)» en realidad significa _que se apoya en una superficie_: descansa en el piso **o** en la superficie superior de cualquier anfitrión).

`isPickableForAttach(placed, candidate)` decide, para un nodo de clase de fijación `placed`, si un `HotSetCandidate` es un anfitrión/superficie válido:

- `wall` → solo candidatos `wall`.
- `ceiling` → solo candidatos `ceiling`.
- `surface` → el piso (`isFloorLike`), o cualquier candidato que `exposesTop` (`capabilities.surfaces.top` del registro) — pero **nunca** un anfitrión montado en el techo. Una lámpara de piso no debe aterrizar sobre un ventilador de techo; el `attachClass` de un ventilador de techo es `ceiling` y queda excluido como superficie superior de anfitrión (Track E).

`isCandidateInHotSet(scope, placedAttachClass, candidate)` eleva esto a un alcance completo:

- `idle` → `true` (el filtrado de selección/fase permanece en el administrador de selección; el hot-set solo reduce lo que una interacción _activa_ puede apuntar).
- `placing` / `moving` → `isPickableForAttach`, o `true` cuando `placedAttachClass` es `null`.
- cualquier otro alcance activo → `false`: nada en la escena es un objetivo de colocación, de modo que el raycast propio del cuerpo de interacción posee el puntero.

`HotSetCandidate` (`type`, `isFloorLike`, `exposesTop`, `attachClass`) lo deriva el llamador a partir del nodo candidato + su definición de registro, manteniendo este módulo puro y unit-testable sin la escena ni el registro.

---

## Política de superposición (overlay): la matriz del alcance

`resolveOverlayPolicy(scope)` (`lib/interaction/overlay-policy.ts`) devuelve el comportamiento de superposición «Sims-ligero»: apagado por defecto, opt-in (de suscripción) para la acción activa. Durante cualquier alcance no `idle`, los objetos de la escena permanecen visibles pero no seleccionables, y las superposiciones de DOM/HUD dan un paso atrás diferenciado por lo distractivas que son.

| Superposición                                                                      | Idle  | Cualquier alcance activo                                                                               |
| ---------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------- |
| Etiquetas de zona                                                                  | mostradas | ocultas (no es una preocupación de edición primaria)                                                         |
| Insignias de contexto (píldoras de nombre por hover)                                            | mostradas | atenuadas + `pointer-events: none`                                                                 |
| Controles en conflicto (manijas de otros objetos, menú de acciones flotante)          | mostrados | ocultos                                                                                         |
| Objetos de escena seleccionables                                                       | sí   | no (el hot-set posee el apuntado; el contexto se preserva, no se puede agarrar lo incorrecto)                 |
| Funcionalidades activas (fantasma, guías de snap, etiquetas de dimensión, la manija activa) | mostradas | mostradas                                                                                          |
| HUD contextual de controles interactivo                                           | sí   | sí (es _precisamente_ la de los controles propios de la interacción activa — exenta del retroceso de pointer-events) |

La política es binaria (`IDLE_POLICY` frente a `ACTIVE_POLICY`) y se selecciona según `isActive`.

---

## Modo de snapping y modificadores (el modelo unificado)

El snapping es un modo persistente, **por contexto** y siempre visible — no una elusión con Shift mantenido. El alcance activo selecciona el _contexto_; el modo actual del contexto selecciona el _comportamiento_. No hay un conmutador de snapping por tipo (kind).

- **Contextos** (`lib/snapping-mode.ts`, `SNAP_PROFILES`): `wall` (grid/lines/angles/off, cuadrícula por defecto),
  `item` (lines/grid/off, líneas por defecto), `polygon` (grid/lines/off, cuadrícula por defecto). Un tipo (kind) opta al
  declarar `NodeDefinition.snapProfile` (`'item' | 'structural'`); `snapContextOf(scope × profile)` lo mapea
  — `structural` al **fijar la dirección** (drafting / arrastre de extremo) → `wall` (con ángulos),
  `structural` en los demás casos (trasladar / curvar) → `polygon` (sin ángulos), `item` → `item`. Sin perfil → sin chip.
  Las herramientas que no son tipos registrados se mapean a través de `TOOL_SNAP_CONTEXTS` en el mismo archivo (el sello `room`
  de los room-presets anfitriones); sin una entrada, una herramienta no tiene contexto de snap, por lo que el ciclado con Shift y el chip
  del HUD quedan inertes mientras corre. El reshape propio de un tipo (la división de muro, `reshape: 'split'`) corre como un
  alcance `reshaping` y hereda el mapeo de ese alcance (`polygon` a menos que fije dirección), de modo que
  nunca necesita una entrada de herramienta.
- **Una sola vía de lectura.** Las herramientas leen `isGridSnapActive()` / `isMagneticSnapActive()` / `isAngleSnapActive()`
  (`store/use-editor`); el paso de cuadrícula es `useEditor.getState().gridSnapStep` condicionado a `isGridSnapActive()`.
  Estas resuelven el modo desde el alcance mediante `getActiveSnapContext()` → `snappingModeByContext[context]`.
- **Modificadores.** Shift (pulsación) cicla el modo del contexto activo; Ctrl (pulsación) cicla el paso de cuadrícula;
  Alt (mantenido) es fuerza / libre (cursor crudo + confirmar más allá de lo inválido; para los recorridos MEP, la excepción del montante vertical (vertical-riser)).
  Shift **no** es una elusión de snap. Alt **no** es un conmutador de snap. La continuación de colocación (habitación/simple de muro,
  continua/simple de cerca, punto una vez/repetir) es un modo separado por contexto, que se cicla con **C** y se muestra como
  un chip del HUD clicable.
- **El chip es del alcance.** El HUD contextual muestra el modo del contexto activo y es el único lugar donde se
  cicla el modo — de modo que una herramienta que quiera su chip debe correr dentro de un alcance cuyo `snapContextOf` resuelva
  (una herramienta de construcción, `drafting`, `placing`/`moving`, o `reshaping`).

**Legado conocido (migrarlo al tocarlo).** Dos patrones heredados de modificadores preceden a este modelo y sobreviven en
puntos aún no tocados; ambos están rastreados en `plans/editor-placement-interaction-overhaul.md`. Un PR que
**toque** uno debe migrarlo al modelo anterior, no extender la vía heredada:

1. **`event.shiftKey` como elusión de snap con pasos codificados** — las herramientas MEP de mover/extremo
   (`packages/nodes/src/{duct-segment,pipe-segment,liquid-line,lineset,duct-fitting}/{move-tool,selection}.tsx`).
   Abrir un alcance `moving` desde un mover hecho a medida **no** es la migración — `useMovingNode()` lee el alcance,
   de modo que `tool-manager` re-monta el `MoveRegistryNodeTool` genérico junto a él (el error de doble vía FPS/teleport).
   Resuelva el modo sin un alcance global `moving`/`reshaping`; ver la nota de doble vía del plan.
2. **`event.altKey` como elusión de alineación** — las vistas previas de pointer-move del roof / polygon / slab en
   `components/editor/floorplan-panel.tsx` y las vías ceiling/slab `resolveSlabPlanPointSnap` / `resolveCeilingPlanPointSnap`
   todavía pasan `event.altKey` para suprimir la alineación estilo Figma. La alineación debe seguir en cambio el modo
   de snap magnético (`bypass: !isMagneticSnapActive()`). **Ya migrado (no regresionar):** el drafting de wall + fence (3D
   `{wall,fence}/tool.tsx` + las vías 2D de `use-floorplan-background-placement.ts` / `floorplan-panel.tsx`), donde
   Alt se liberó para el conmutador de modo de cadena anterior.

---

## Estado de la migración (higuera estranguladora)

El alcance es la fuente de verdad objetivo, pero las banderas heredadas de `useEditor` todavía
existen como espejo y se están retirando lector por lector. Hoy el alcance está **impulsado desde** los setters
centrales de `useEditor` — `setMovingNode`,
`setActiveHandleDrag`, `setCurvingWall`/`setCurvingFence`, `setEditingHole`,
`setMovingWallEndpoint`/`setMovingFenceEndpoint`, `setMode` (para pintura) — y
desde la herramienta de selección por marquesina. Cada setter llama a `begin`/`end` (y a `endIf`, para que
la limpieza de una bandera independiente no pueda pisotear un alcance no relacionado) con el fin de mantener
el alcance en sincronía.

**Colaboradores:**

- Agregue una interacción nueva llamando a `begin(...)` / `end()` en `useInteractionScope`, **no** agregando una bandera nueva de `useEditor`.
- Lea «lo que el usuario está haciendo» a través del alcance y sus ayudantes (`isActive`, `scopeNodeId`, `selectionEnabled`), no recombinando banderas. Los nuevos lectores deben consumir el alcance para que la bandera heredada pueda eliminarse una vez que no tenga lectores.
- Agregue un comportamiento de fijación nuevo estableciendo `attachTo` en el asset — el hot-set le sigue sin ningún cableado por tipo (kind).

---

## Reglas

- **Un solo dueño, un solo alcance.** Solo `useInteractionScope` escribe el alcance, y solo mediante `begin`/`update`/`end`/`endIf`. Nunca reconstruya el estado de interacción desde una combinación privada de banderas.
- **Un solo driver de reshape.** Un reshape impulsado por el plano de planta se previsualiza y confirma
  mediante su funcionalidad del plano; un reshape impulsado por herramienta lo posee la herramienta
  del framework. Condicione los cuerpos de interacción con el driver para que ambos no puedan actuar sobre un mismo
  gesto.
- **`end` es atómico y sin payload.** Nunca deje un `nodeId`/payload atrás al pasar a `idle`; la lógica confirmar-vs-revertir pertenece al cuerpo de interacción antes de `end`.
- **`update` no puede cambiar `kind`.** Cambiar de interacción es un `begin`, no un parche.
- **El hot-set y la política de superposición son derivaciones puras del alcance** (y, para el hot-set, de los metadatos del candidato). No bifurque el comportamiento de superposición/picking en banderas heredadas — bifurque en el alcance.
- **No agregue banderas de interacción nuevas a `useEditor`.** Las interacciones nuevas pasan por el alcance.
- **El snapping es impulsado por modo.** Lea el estado de snap a través de `isGridSnapActive` / `isMagneticSnapActive` / `isAngleSnapActive` (condicione cualquier paso de cuadrícula al primero); nunca eluda el snapping mediante `event.shiftKey` / `modifiers.shiftKey`, y nunca codifique un paso de cuadrícula sin condicionar. Los tipos (kinds) que admiten snapping declaran `snapProfile`. Shift cicla el modo; Alt es fuerza/libre.