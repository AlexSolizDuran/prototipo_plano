# Modelo vertical

*Cómo se apilan los edificios: alturas de nivel almacenadas, tops de pared/cielorraso limitados por plano, colocación y grosor de losas, hosts de soporte, y las reglas de clamp que lo mantienen todo coherente.*

Aplica a: cualquier cosa que lee o escribe geometría vertical — niveles, paredes, losas, cielorrasos, techos, escaleras, cercas, items colocados en el piso.

La invariante, en una frase:

> Los tops de pared ordinarios limitados por plano están fijados al plano del nivel. Una pared
> dibujada sobre terreno u otro soporte elevado conserva la altura del cuerpo del fantasma al
> materializar esa altura y trasladar la pared desde su base elegida. El relleno opcional de
> terreno extiende solo la parte inferior; nunca cambia la altura autorada de la pared ni su top.

**Fuentes**: `packages/core/src/services/storey.ts`, `packages/core/src/systems/wall/wall-top.ts`, `packages/core/src/systems/slab/slab-support.ts`, `packages/core/src/systems/stair/stair-rise.ts`, `packages/core/src/utils/vertical-scene-migration.ts`

## Verdad almacenada

| Campo | Significado | Ausente significa |
|---|---|---|
| `level.height` | Altura de nivel en metros, de piso a piso. El Y mundial del nivel se resuelve con `getLevelElevations`, ordenado por el ordinal `level`. | Datos legados sin migrar (nunca vistos tras la carga; la migración los escribe). Los consumidores caen a `DEFAULT_LEVEL_HEIGHT` (2.5). |
| `level.baseElevation` | Offset aditivo desde la posición de pila calculada. Desplaza este nivel y desplaza acumulativamente a cada nivel más alto en el mismo edificio; los offsets negativos son válidos. | Cero (el default del schema). |
| `wall.height` | Altura explícita del cuerpo (medio muro, parapeto, o un dibujo con soporte elevado cuya altura de fantasma debe permanecer invariante). Las paredes hospedadas en el suelo siempre resuelven top = base elegida + altura, incluido por debajo del datum; otros soportes hundidos legados conservan su restricción de top absoluto. | **Limitado por plano** (el default para colocación ordinaria con datum): el top sigue a `getWallPlaneTop` — `min(altura de nivel, parte inferior de la losa de cobertura más baja sobre el tramo)`. |
| `ceiling.height` | Altura personalizada explícita, con clamp de escritura al límite. | **Sigue al nivel**: se resuelve en vivo a `getCeilingClampBound` = `min(altura de nivel, parte inferior de cobertura) − 0.01`. |
| `roof.support.kind` | `walls` sigue el top de pared espacialmente coincidente más alto en el marco de nivel del techo; `level` mantiene un Y personalizado; `roof` conserva su regla de fijación a las superficies del techo. La creación de habitaciones y paredes curvas escribe `walls`; los rectángulos dibujados libremente escriben `level` en Y 0. | Los techos existentes permanecen personalizados (`level`); ninguna migración de carga habilita el seguimiento. |
| `slab.elevation` | La superficie de tránsito (top), local al nivel. | Default 0.05. |
| `slab.thickness` | Crece **hacia abajo**: el sólido ocupa `[elevation − thickness, elevation]`. | Default 0.05. |
| `slab.recessed` | Intento de receso: concha abierta cuyo piso es `elevation` y cuyo borde es `recessedRimElevation`. Excluido de las consultas de "cobertura" y de la adopción de caras de pared. | Losa sólida. |
| `slab.recessedRimElevation` | Anclaje de borde opcional para un receso elevado/bajado. Los presets relativos conservan este anclaje mientras cambian la profundidad. | Plano de nivel (`0`), conservando las piscinas legadas. |
| `slab.fillToTerrain` | Agrega una base perimetral que sigue el terreno bajo la parte inferior fija de una losa sólida. La superficie de tránsito y el grosor estructural autorado permanecen planos. | Sin base de terreno. |
| `supportSlabId` | Host de soporte persistido en paredes y en todos los tipos colocados en el piso. Se escribe en el commit **solo cuando los soportes en solapamiento discrepan en elevación**; el centinela `'ground'` fija el suelo desnudo bajo una cubierta. Los bloques estructurales siempre fijan su host del momento de colocación para que una losa de habitación generada encima de ellos no pueda realimentarse y elevar la plataforma. | El soporte se elige por consulta (elección por cobertura para paredes, huella máxima para items). |
| `wall.supportOffset` | Delta opcional local al nivel desde el soporte elegido. Las cadenas de paredes de terreno lo usan para mantener cada segmento en el plano de construcción del primer punto mientras almacenan solo un número, nunca muestras de terreno. | Offset cero: la pared se asienta directamente sobre su losa elegida o fuente de suelo esculpida. |
| `fence.supportOffset` | Delta opcional local al nivel desde el host de losa de la cerca o el plano de nivel. Traslada la cerca completa mientras conserva la altura. | Offset cero: la cerca se asienta directamente sobre su host o el plano de nivel. |
| `wall.fillToTerrain` | Extiende la pared hacia abajo desde su base autorada hasta el terreno con caras izquierda/derecha muestreadas de forma independiente. La altura del cuerpo y el top de la pared no cambian. | Base fija sin relleno de terreno. |
| `stair.deckSlabId` | Cubierta de destino: el ascenso sigue `deck.elevation − la propia base elegida de la escalera` en vivo; el recorte de aberturas se sincroniza desactivado mientras está fijado. | El destino es un nivel. |
| `stair.totalRise` | Ascenso personalizado explícito (gana por encima de todo). | Sigue: la `elevation` de la cubierta, si no la altura piso-a-piso del nivel contenedor — cada una **menos la propia base elegida de la escalera**, de modo que una losa bajo la escalera acorta el ascenso tal como acorta a una pared limitada por plano; `syncStairRises` converge los segmentos rectos de escalera al ascenso resuelto. |

Dos reglas del schema protegen estas semánticas:

- **Sin defaults de Zod en campos con significado.** `level.height`, `wall.height`, `ceiling.height`, `stair.totalRise` son `.optional()` sin `.default()` — la ausencia es dato. Los sitios de creación escriben valores explícitamente; la salida de `migrateNodes` se castea, no se parsea, así que un default del schema nunca se materializaría en la carga legada de todos modos.
- **El store elimina las claves explícitamente `undefined`.** `updateNode(id, { height: undefined })` elimina la clave (ver `mergeNodeUpdate` en `node-actions.ts`). Las paredes legadas limitadas por plano pueden seguir omitiendo `height`; el panel de pared resuelve y materializa su altura de cuerpo actual antes de habilitar el relleno de terreno. Los modos de seguimiento de cielorraso y escalera continúan derivándose de la presencia del campo — sin enums de modo persistidos.

## Helpers de resolución (usa estos, nunca `?? 2.5`)

| Helper | Hogar | Resuelve |
|---|---|---|
| `getStoredLevelHeight`, `getLevelElevations`, `getLevelAbove/Below` | `services/storey.ts` | Alturas de nivel, apilamiento por edificio consciente de offsets, vecinos |
| `getWallPlaneTop` | `services/storey.ts` | El top de una pared limitada por plano: altura de nivel limitada a las partes inferiores de losas de cobertura, muestreado por tramo con solape de banda inclusivo de límites |
| `resolveWallTop`, `resolveWallEffectiveHeight`, `MIN_WALL_HEIGHT` | `systems/wall/wall-top.ts` | El top / la altura efectiva de una pared dados el plano y la base elegida |
| `getWallBaseElevationForNodes`, `getWallEffectiveHeightForNodes` | manager del grid espacial | La base elegida y la altura del cuerpo con offsets de terreno/soporte, para overlays de UI |
| `getCeilingClampBound`, `getCoveringSlabUndersideAt` | `services/storey.ts` | El límite del cielorraso; la consulta de cobertura entre niveles (nivel superior, losas no recesadas) |
| `resolveCeilingHeight` | `services/level-height.ts` | La altura efectiva de un cielorraso (explícita o que sigue) |
| `resolveStairTotalRise`, `syncStairRises` | `systems/stair/stair-rise.ts` | Precedencia del ascenso de escalera + convergencia de tramos rectos |
| `resolveRoofElevation`, `resolveRoofWallTopElevation` | `systems/roof/roof-elevation.ts` | El top de pared espacialmente coincidente más alto para el soporte `walls`, incluidas alturas explícitas y bases elegidas, convertido al marco de nivel del techo |
| `computeWallSlabSupport`, `getSlabSupportForItem`, `getSupportCandidatesForFootprint` | `systems/slab/slab-support.ts` + manager del grid espacial | Elección de soporte (polígonos renderizados, preferente al host, tope opcional `maxElevation`) |
| `resolveSlabPlacementElevation` | `systems/slab/slab-placement.ts` | Traslada el intervalo autorado top/grosor de una losa sólida sobre un plano base capturado; las losas recesadas permanecen relativas al nivel |
| `getSlabBaseElevation`, `applySlabBaseElevationChange`, `applySlabThicknessChange` | `nodes/slab/elevation-limit.ts` | Separa la colocación de la parte inferior de todo el cuerpo de la edición de grosor con base fija |
| `resolveFenceLiftElevation` | `nodes/fence/lift.ts` | La elevación del host de losa de la cerca más su offset de soporte manual opcional |
| `clampSlabElevationForWalls` | slab-support + `nodes/slab/elevation-limit.ts` | Clamp del top de losa bajo paredes limitadas por plano |

## Reglas de clamp (clampea, nunca preguntes)

- Una losa bajo paredes limitadas por plano limita su elevación a `altura de nivel − MIN_WALL_HEIGHT` (0.5).
- Los cielorrasos se limitan (al escribir, y reactivamente hacia abajo vía space-detection) a `min(top de nivel, parte inferior de losa de cobertura) − 0.01`.
- Los tops de paredes limitadas por plano se limitan a las partes inferiores de las losas de cobertura — una losa de nivel superior gruesa o a ras acorta las paredes que están debajo (attach-to-floor-bottom de Revit, automático). Las paredes con altura explícita están exentas.
- Los controles de losa sólida tienen contratos no superpuestos: el cubo traslada el intervalo ocupado mientras conserva `thickness`; el chevron y el control de grosor del panel mantienen fija la parte inferior y mueven la superficie de tránsito escribiendo `thickness` y `elevation` juntos. La elevación del panel traslada el cuerpo mientras conserva `thickness`. Los recesos almacenan su borde por separado para que los controles de piso/borde/profundidad y los presets permanezcan relativos al mismo anclaje.
- Los rastreadores de elevación estructural mueven la base de referencia, no las dimensiones del cuerpo. Un rastreador de losa mueve su parte inferior y mantiene `thickness`; un rastreador de pared escribe `supportOffset` y materializa su `height` de cuerpo actual; un rastreador de cerca escribe `supportOffset` y mantiene `height`. Las losas recesadas conservan su control separado de borde/profundidad.
- La adopción de caras de pared en `getRenderableSlabPolygon` aplica solo a losas con suelo (`elevation − thickness ≤ 0.01`, no recesadas) — las cubiertas flotantes mantienen su polígono dibujado y se omiten como candidatas de costura.

## Colocación decidida por el puntero

Los eventos del grid intersecan un plano que monta la elevación del fantasma, así que cualquier decisión de superficie apilada debe venir del rayo real de la cámara, no del impacto del plano: `getPointedSupportSurface` devuelve la superficie elegible más cercana más el punto de cruce, y tanto el tope de elección de soporte (`maxElevation`) como el XZ del cursor derivan de ese único cálculo. Apuntar bajo una cubierta elige el piso; apuntar al top de la cubierta elige la cubierta. La geometría de bloques con cara hacia arriba es una superficie de colocación compartida para losas, cercas, columnas, escaleras, items y objetos de piso guiados por registry; el dibujo de paredes puede incluir además geometría de paredes, items apilables y columnas con cara hacia arriba. Esos impactos en el top de un nodo congelan un plano de construcción escalar para el lanzamiento; no son un borde de hosting persistente y no siguen ediciones posteriores del host. Las losas almacenan el plano como `elevation`, las paredes y cercas como `supportOffset`, y los nodos de posición colocados en el piso como su offset Y canónico. Cada uno también fija la losa o el suelo bajo el bloque, evitando que una losa generada posteriormente se realimente y eleve el objeto colocado. Los impactos ordinarios de losa/suelo persisten su fuente de soporte elegida y conservan el comportamiento normal de base escalonada. La colocación del plan 2D no tiene rayo de cámara y mantiene la elección máxima (max-election).

El dibujo de paredes y losas comparte el resolver de plano de construcción horizontal. Una losa congela el
plano del primer vértice encajado, mantiene los vértices posteriores sobre ese plano plano y traslada su
intervalo vertical autorado sobre la base capturada en el commit. Nunca drapea el grosor ni los vértices
individuales sobre el terreno. El seguimiento opcional de terreno es una base perimetral separada de la
parte inferior fija; nunca cambia el intervalo de la losa. Las losas recesadas mantienen un anclaje de
borde explícito. Un plano de construcción bloqueado se etiqueta `fixed-plane` para que un plano en Y
mundial 0 no pueda confundirse con el plano de consulta de terreno en movimientos posteriores del puntero.

Las superficies de Auto-room derivan su colocación vertical de las paredes que las encierran. La
base de cada pared limítrofe se resuelve a través de la misma elección que usa el renderer — incluido el
suelo bajo ella, de modo que una habitación estampada o dibujada sobre terreno desnudo reciba entrada
de terreno aunque ninguna pared lleve un `supportSlabId` explícito. El piso toma la base de pared **más
alta** y mantiene su offset establecido de 0.05 m sobre la superficie de tránsito; el cielorraso toma el
top de pared **más bajo** y se asienta 0.01 m debajo de él.
Ambas superficies permanecen planas: un recinto de elevación mixta ya no cae a una colocación de
respaldo, y se elige la base más alta porque de todos modos las paredes más bajas se extienden hacia
abajo dentro del suelo, así que no se abre luz del día bajo ninguna pared. Las superficies `autoFromWalls`
existentes se reconcilian con los cambios posteriores de support-offset de pared **y con los sculpts** —
la firma de estructura del nivel hashea la base de nivel resuelta de cada pared, de modo que mover el
suelo bajo una habitación terminada re-deriva su piso y cielorraso
(una vez por trazo, dentro del propio paso de undo del trazo). Las superficies manuales nunca se
reescriben. Las losas automáticas se excluyen de esta elección de base de pared para que un piso
derivado no pueda elevar recursivamente sus propias paredes y luego a sí mismo.

## Heredar el terreno (la costura genérica)

`levelBaseElevationAt(nodes, levelId, x, z)` es **la** respuesta a "sobre qué superficie descansa un nodo
cuando no hay nada construido debajo" — el suelo esculpido donde el terreno soporta ese nivel, `0`
en cualquier otro lugar. El terreno solía ser opt-in por tipo porque cada sitio escribía la pregunta
`terrainSupportLift(…) ?? 0` y todo consumidor que olvidaba preguntar asumía silenciosamente el plano
`y = 0`. Resolver una base a través de esta función es todo lo que un tipo necesita para seguir el
terreno; no hay nada que registrar. Los llamadores que deben distinguir el suelo plano de una superficie
construida a ras de la base del nivel todavía necesitan el null de `terrainSupportLift` — ambos leen `0`
y solo el primero drapea.

Tres formas en que el Y de un tipo llega al suelo, en el orden en que hay que preferirlas:

1. **`capabilities.floorPlaced`** — el resolver (`getFloorPlacedElevation`) elige por huella
   entre las losas en solapamiento y la base del nivel, y `FloorElevationSystem` escribe el resultado en
   la malla registrada cada frame. Correcto para cualquier cosa que se apoya en una superficie.
2. **`ctx.levelBaseAt(x, z)` en un builder puro de `def.geometry`** — para tipos que hornean su propio
   origen vertical en las mallas (el grupo de elevación interna de una cerca). Llamarlo además *inscribe*
   al tipo en la invalidación del terreno: `noteLevelBaseConsumer` registra el tipo en el primer build, y
   `markTerrainSupportDependents` ensucia esos nodos en cada cambio de terreno para que el origen horneado
   se reconstruya. Preguntar es el registro — deliberadamente, porque una bandera declarativa sería otro
   opt-in por tipo y "cada tipo con builder" reconstruiría toda la planta baja por pincelada.
   Ausente para `def.floorplan` (la vista de plano no dibuja elevación), así que los builders
   compartidos deben tratarlo como opcional en lugar de asumir suelo plano en 2D.
3. **`levelBaseElevationAt` directamente** — para resolvers fuera de la ruta de render que ya tienen el
   registro de nodos (elección de soporte, guías de snap, colocación de manijas). Muestrea en el *mismo*
   XZ que muestrea el renderer, o el overlay y la malla entrarán en desacuerdo.

Un renderer colectivo (un componente que dibuja muchos nodos, p. ej. mallas instanciadas) no obtiene
nada de esto gratis: `FloorElevationSystem` escribe en el objeto registrado del nodo, que para esos tipos
es el proxy de selección, no la instancia. Tales renderers deben resolver el Y de cada instancia a través
de `getFloorStackedPosition` ellos mismos.

## Migración de carga (vive en `migrateVerticalSceneNodes`, indefinidamente)

Como el autosave de la comunidad solo persiste después de la primera edición posterior a la carga, la migración debe permanecer en la ruta de carga. Es pura y segura para el servidor, de modo que el loader del editor y la autoridad de la escena hospedada canonicen campos idénticos antes de que la colaboración compare o persista una operación:

- Escribe la altura derivada **exacta** de cada nivel legado (un nivel de legado por default almacena 2.55 = losa 0.05 + pared 2.5) — nunca ajustada a presets.
- Compacta los ordinales `level` por edificio, anclados en cero (no negativos → 0,1,2…; negativos → −1,−2… — los sótanos siguen siendo sótanos). Se ejecuta en cada carga; idempotente.
- Clasifica los tops de pared contra el plano derivado: `|plane − top| < 0.20` **estricto** → limitado por plano (se elimina la clave de altura); si no, explícito (materializando 2.5 en paredes cortas sin altura). El ε se calibra con un censo de producción: existen paredes cortas intencionales de 0.20 y no deben encajarse.
- Los cielorrasos dentro de ε del límite (y todos los cielorrasos `autoFromWalls`) sueltan su altura → modo sigue; las escaleras sueltan el `totalRise: 2.5` ciego legado. Ambos condicionados a que la escena sea legada (algún nivel carecía de `height`).
- Las losas obtienen `thickness := elevation` (intervalo ocupado byte-idéntico, incluido el cero degenerado); las piscinas de elevación negativa se vuelven `recessed: true` con la elevación sin cambios.

## Gotchas

- **Solo los techos con `support.kind: 'walls'` siguen a las paredes.** El resolver proyecta el centro XZ del techo sobre el vecino inferior de su nivel padre, seleccionado por `findLevelBelowId` desde `getLevelElevations` en la misma pila de edificios (los ordinales no necesitan ser consecutivos). Usa la habitación envolvente más pequeña en ese punto y toma el top de pared resuelto más alto sin limitarlo al nivel. Los techos cónicos coinciden con paredes curvas por el centro y radio del arco contra su huella de segmento transformada, sin un vínculo de id de pared. Sin recinto o arco coincidente, se congela el Y y se conserva la intención de seguimiento, así que redibujar paredes reanuda el seguimiento. El Y local al nivel negativo es válido: paredes de 2.5 m bajo un nivel de 3 m colocan el techo a −0.5 m. `RoofElevationSystem` re-deriva el Y solo para techos que siguen, en ediciones de pared, losa, nivel, edificio, sitio y techo, pausado por historial y un microtask después de las actualizaciones del store para que el grid espacial se haya asentado. Las actualizaciones asentadas publican un commit de escena separado sin agregar un paso de undo; la pausa de historial de un gesto externo conserva la propiedad del commit. La elección "Follows walls" del panel habilita esta regla; "Custom" escribe `level` y mantiene el Y. Un cambio de Y explícito que supere 1e-4 m en el panel o en la manija de movimiento 3D cambia a `level` en el mismo patch; los movimientos solo-XZ conservan `walls` y re-resuelven espacialmente. Undo/redo restaura modo y Y juntos. Las fijaciones a superficies de techo ocultan este control de modo y conservan su propia regla. La versión del schema permanece en 3 y la carga nunca opta a los techos existentes al seguimiento.
- **Los ordinales son semánticos.** `level < 0` renderiza "Basement N"; `level === 0` es la búsqueda de la planta baja. Nunca renumeres sin el anclaje de cero.
- **Geometría limítrofe.** Las losas automáticas derivan los polígonos de las líneas centrales de pared, así que las muestras de clamp de pared/cielorraso caen exactamente sobre los bordes del polígono — usa siempre los helpers de solape de banda inclusivo de límites (`wallOverlapsSlabFootprint`, `slabCoversPoint`), nunca point-in-polygon crudo por ray-cast en esas rutas.
- **Las escaleras rectas se construyen desde las alturas de segmento almacenadas**, no desde el ascenso resuelto — cualquier cambio de ascenso debe pasar por `syncStairRises` (aplicado por `StairOpeningSystem`, pausado por historial, un microtask después de las actualizaciones del store para que el grid espacial se asiente).
- **La reactividad es explícita.** Un cambio de `level.height` ensucia las paredes/escaleras/cielorrasos/cercas de ese nivel; un cambio de losa ensucia los soportes del mismo nivel en solapamiento, las paredes/cielorrasos del nivel inferior y las escaleras fijadas a cubierta. Cada pincelada de terreno en vivo ensucia las estructuras hospedadas en el suelo, las paredes/losas `fillToTerrain`, cada nodo `floorPlaced` a nivel del suelo y cada tipo cuyo builder pidió `ctx.levelBaseAt`, a través de la suscripción transitoria `useLiveTerrain` en `spatial-grid-sync.ts`; el graph de escena y el historial de undo aún se escriben solo una vez cuando el trazo se confirma. Terminar o cancelar un trazo ejecuta el mismo sweep para que los dependientes se asienten sobre el campo persistido. Las manijas de losa reutilizan el helper de dependencias de cambio de losa para previsualizaciones en vivo. Si un nuevo consumidor lee estos límites, conecta su regla de suciedad allí.
- **La re-derivación de Auto-room es por trazo, no por pincelada.** Las pinceladas en vivo publican solo a `useLiveTerrain` y nunca tocan el store de escena, así que el diff de firma de estructura que re-deriva pisos y cielorrasos de habitación corre una sola vez al soltar. A mitad de arrastre, las paredes hospedadas en el suelo siguen al pincel mientras que el piso espera el soltar — deliberado: re-derivar por pincelada significaría una escritura de escena por pincelada y un piso que tiembla bajo el cursor.
- **Ciclo de vida del host.** Eliminar una losa quita `supportSlabId`/`deckSlabId` de los sobrevivientes en el mismo commit de undo; un host meramente re-formado fuera de alcance cae en silencio y se reanuda si la losa vuelve.
- **Las rutas de clonado difieren.** `clone-scene-graph.ts` re-mapea `supportSlabId`/`deckSlabId`; el portapapeles del editor (`scene-clipboard.ts`) intencionalmente no lo hace (re-elige); la colocación de habitaciones los re-mapea (corregido en `room-placement.ts` del repo privado). Al agregar una nueva ruta de clonado/instanciación, re-mapea ambos campos.

## Diferido por decisión (ver el archivo de planes del repo privado)

La identidad persistente de habitaciones, la navegación de niveles parciales, los enums de cara de referencia de losas, los cielorrasos suspendidos y un datum de sitio para terreno inclinado tienen todos gates con nombre en `plans/` — ninguno bloquea este modelo. Las cubiertas se entregan como habitaciones/presets de catálogo; las herramientas de mezzanine/balcón de un gesto se eliminaron (código conservado en el editor `e30042db`).