# Sistemas

*Arquitectura de los sistemas de core y viewer.*

Aplica a: `packages/core/src/systems/**`, `packages/viewer/src/systems/**`.

Los sistemas son dueños de la lógica de negocio, la generación de geometría y las restricciones. Se ejecutan dentro del bucle de frames de Three.js y nunca se renderizan directamente.

> **Para los tipos (kinds) impulsados por registro, prefiere no tener un sistema por tipo.** Si lo único que hace tu tipo es "reconstruir geometría al marcarse como sucio (dirty)", define `def.geometry` y deja que el `<GeometrySystem>` del framework maneje el bucle de reconstrucción. Los sistemas por tipo siguen existiendo para responsabilidades *extra*: animaciones, cascadas de suciedad entre tipos, manipulación de materiales de mallas con nombre. Consulta [node-definitions.md](node-definitions.md).

## Dos clases de sistemas

### Sistemas de Core — `packages/core/src/systems/`

Lógica pura: sin renderizado, sin objetos de Three.js. Leen nodos desde `useScene`, calculan valores derivados (geometría, restricciones) y escriben los resultados de vuelta.

| Sistema | Responsabilidad |
|---|---|
| `WallSystem` | Ingleteado de muros, uniones de esquina |
| `CeilingSystem` | Generación de cielos basada en polígonos |
| `RoofSystem` | Forma de cubierta inclinada |
| `DoorSystem` | Restricciones de colocación en muros |
| `WindowSystem` | Restricciones de colocación en muros |
| `ItemSystem` | Transformaciones de items, colisiones |

La geometría de losas no tiene un sistema dedicado: se renderiza a través del `def.geometry` del registro (`packages/nodes/src/slab/geometry.ts`, que llama a los generadores puros en `packages/viewer/src/systems/slab/slab-system.tsx`) con un pequeño `def.system` para el seguimiento de suciedad.

La geometría de cielos consume marcas de suciedad en la prioridad de frame 2, como `GeometrySystem` (losas).
El lote de nodos toma instantáneas de las marcas en la prioridad 1 y procesa la pertenencia en la prioridad 5,
de modo que libera la geometría antigua y reúne los reemplazos después de las reconstrucciones. El
`system.priority` de una definición ordena los componentes montados; no define la prioridad de `useFrame`.

Los items, columnas, partes inferiores de cielos y cuerpos de losas directamente bajo un nivel, además de
puertas/ventanas alojadas en muros, pueden unirse a los contenedores `BatchedMesh` del nivel. Las fuentes
permanecen montadas y ocultas al dibujo. Los cielos modulares (grids) y los subárboles de hijos alojados quedan
excluidos; los contenedores preservan las banderas de sombra de origen. La selección (incluida la selección
externa), las transformaciones en vivo y cada objetivo de vista previa de pintura por slot liberan las fuentes
hasta que se estabilizan. Los cambios de modo de nivel / nivel seleccionado vuelven a ofrecer las fuentes
rechazadas mientras estén solo-sombras.

### Construcción inicial de muros

`setScene` asigna una identidad de hidratación no persistida y luego publica su
`hydrationToken` elegible después de que terminen la reconciliación síncrona y la
normalización diferida de propiedad de la hidratación. Las aberturas de ascensor y la
reconciliación de niveles reemplazados se ejecutan dentro del límite síncrono; la
normalización en cola de tramos/aberturas de escaleras extiende ese límite a través de
su microtask. El store es dueño de esos pases de aberturas incluso si sus sistemas
reactivos se montan después de la hidratación, y respeta el bloqueo de mutación de la
escena. Las escrituras ordinarias de documentos cancelan la publicación pendiente o
invalidan un token emitido atómicamente antes de que se ejecuten los suscriptores,
incluidas las escrituras en pausa, remotas y de undo/redo. La pausa de historial por sí
sola no otorga exención. Las marcas de suciedad por sí solas no lo invalidan, de modo
que la finalización de aberturas puede volver a ensuciar su muro padre.

El ref del canvas instala la captura de `pointerdown`, `pointermove` y rueda antes de que
se monten los sistemas diferidos. La interrupción de overrides/transformaciones en vivo
pertenece al store de la escena; los mapas no vacíos cancelan la hidratación incluso si
se limpian antes de que se monte el consumidor de muros. `applySceneSnapshot` limpia los
mapas en vivo obsoletos antes de comenzar el reemplazo. El propietario del ciclo de vida
de muros ansioso (eager) observa los tokens independientemente de `WallSystem`, de modo
que un re-montaje de consumidor conserva el mismo lapso, contadores, identidades de
muros construidos y vecinos pendientes. Una hidratación nueva reinicia ese estado; una
interrupción no puede reingresar con el mismo token. Estos registros con ámbito de
hidratación son una excepción a la regla habitual de limpieza de cachés al desmontar el
sistema; el consumidor igualmente limpia su caché de ingleteados.

La construcción inicial termina en el primer frame sin muros sucios ni vecinos
pendientes, o al interrumpirse. Si ningún muro se reconstruye durante 30 frames
consecutivos mientras hay muros sucios sin mallas registradas (un intervalo de barrido de
placeholders), el privilegio se revoca. Este período de gracia de render acotado deja sus
marcas de suciedad intactas y no reporta finalización de geometría; un montaje posterior
aún los reconstruye. Los muros no disponibles no postergan continuamente el reloj de
silencio de vecinos pendientes. `isWallInitialBuildActive()` y
`getPendingWallRebuildCount()` siguen siendo legibles sin `?perf`.

La construcción inicial consume muros bajo el **presupuesto existente de 8 ms**, verificado
entre muros, sin el tope interactivo de **8 muros/frame**. Un muro con al menos seis
recortes de abertura ocupa su propio frame. El primer build de cada muro durante la
construcción inicial activa omite el escaneo de adyacencia y la re-invalidación de
vecinos porque las entradas hidratadas son estables y sus vecinos están en cola para sus
propios primeros builds. Los builds posteriores conservan la invalidación de vecinos y la
ventana de silencio final de **80 ms**. Una vez que termina la construcción inicial, se
aplica la programación interactiva existente (límites progresivos para colas mayores de
ocho; las ediciones pequeñas se reconstruyen de inmediato).

Solo con `?perf`, `__pascalPerf.batchStats().wallDrain` publica el estado activo, el
consumo de este frame, las salidas acumuladas de presupuesto/pesado/vaciado/tope, el
conteo de vecinos pendientes, primeros builds, builds de re-invalidación y encolados
únicos de vecinos. La publicación reutiliza un único objeto de estadísticas mutable sin
asignar instantáneas por frame. Los contadores se reinician en cada identidad de
hidratación, incluida una interrumpida antes de la publicación del token. `firstBuilds`
cuenta el primer build de geometría de cada muro en esa hidratación, incluso después de
una interrupción; `reinvalidationBuilds` cuenta los builds posteriores de esos muros. El
lapso `wall-initial-build` comienza en la publicación del token elegible y termina al
vaciar o al interrumpirse, abarcando desmontajes de consumidor. Los contadores no
implican que la finalización del sistema de aberturas se haya vaciado: builds tardíos de
aberturas pueden volver a ensuciar muros.

El lote de muros aún espera su cola de vecinos pendientes. El agrupamiento de nodos
conserva por ahora su reloj de silencio global de 180 ms. El agrupamiento de drenaje
inicial es un seguimiento: las uniones acotadas deben preservar las decisiones enteras de
ola `MIN_BATCH_ENTRIES` y el ingreso parcial/restante, incluidos los candidatos más
grandes que la asignación de un solo frame.

### Sistemas de Viewer — `packages/viewer/src/systems/`

Acceden a objetos de Three.js (vía `useRegistry`) y gestionan los efectos secundarios de renderizado.

`FloorElevationSystem` escribe la Y de la malla solo para nodos directamente padreados a un nivel.
Los hijos alojados heredan de su host y de cualquier frame de superficie con nombre; una elevación
de soporte cero no hace que una posición de mundo en vivo sea segura para escribir en su
transform local. Una salida de vista en planta puede anular el padre lógico a un nivel mientras la
malla permanece montada bajo su host original. El pase de vista previa de elevación de piso
convierte esa pose de nivel a través de la ascendencia montada inversa, incluido un wrapper de
superficie con nombre y la elevación de losa heredada. Guarda el estado local de matriz original y
lo restaura cuando la anulación termina por cancelación, re-ingreso o desmontaje; los commits
re-padreados conservan su nueva pose local. Las vistas previas 3D alojadas ordinarias conservan su
frame local montado.

La matriz de preview/commit renderizada en
`packages/nodes/src/cabinet/__tests__/hosting-preview-pose.test.tsx` monta los movers,
renderers y frame systems juntos para verificar posición y rotación contra la caja de
vista previa y la pose de mundo comprometida.

| Sistema | Responsabilidad |
|---|---|
| `LevelSystem` | Posiciones de nivel apiladas / explotadas / solitarias (solo) / manuales |
| `WallCutout` | Corta orificios de puertas/ventanas en la geometría de muros |
| `ZoneSystem` | Visualización de zonas y colocación de etiquetas |
| `InteractiveSystem` | Alternadores (toggles) y sliders de items en la escena |
| `GuideSystem` | Geometría de ayuda temporal |
| `ScanSystem` | Renderizado de nubes de puntos |

## Patrón

Los sistemas son componentes de React que no renderizan nada (`return null`) y usan `useFrame` para la lógica por frame.

```tsx
// packages/core/src/systems/my-system.tsx
import { useFrame } from '@react-three/fiber'
import { useScene } from '../store/use-scene'

export function MySystem() {
  const nodes = useScene(s => s.nodes)

  useFrame(() => {
    // compute and write back derived state
  })

  return null
}
```

Los sistemas de core y viewer se montan dentro de `<Viewer>` junto a los renderizers. Consulta `packages/viewer/src/components/viewer/index.tsx` para el orden de montaje.

**Los sistemas son un punto de personalización.** Cualquier consumidor de `<Viewer>` — la app del editor, un embed, una vista previa de solo lectura — puede inyectar sus propios sistemas como hijos. Así se agrega comportamiento específico del editor (detección de espacios, retroalimentación de herramientas) sin tocar el paquete del viewer.

## Reglas

- **Los sistemas de core no deben importar Three.js** — trabajan con datos planos.
- **Los sistemas de viewer no deben contener lógica de negocio** — delega en core si la regla es de nivel de dominio.
- **Nunca dupliques lógica** entre un sistema y un renderer — si el renderer la necesita, el sistema debe calcularla y almacenarla, y el renderer lee el resultado.
- Los sistemas deben ser **idempotentes**: dados los mismos nodos, producen la misma salida.
- Marca los nodos como `dirty` en el store de la escena para señalar que un sistema debe volver a ejecutarse. Evita ejecutar lógica costosa cada frame sin una verificación de suciedad.
- **Limpia los cachés a nivel de módulo al desmontar.** Un caché que sobrevive entre frames también sobrevive al montaje, y uno claveado por nivel o ID de nodo crece con cada proyecto abierto en la pestaña. Reinícialo desde el efecto de desmontaje del sistema, igual que el teardown del editor llama a `spatialGridManager.clear()`.

## Reconciliación y commits de escena

La reconciliación que escribe datos de escena persistidos debe mantener cada escritura derivada dentro de un
commit de escena transmisible. La detección de espacios, por ejemplo, puede crear losas y cielos, actualizar la
clasificación de lados de muros y crecer `level.children` en respuesta a una edición de muro. Esas escrituras son
parte de la edición de origen: deben aparecer en la instantánea `SceneCommit.current` de esa edición y permanecer
como un solo paso de undo.

El ordenamiento actual de suscripciones al store satisface este contrato porque la reconciliación termina
antes de que el middleware de historial capture el commit. Mover la reconciliación a
`subscribeSceneCommits` rompe el contrato a menos que emita un commit transmisible separado: los
listeners de commit se ejecutan después de que las instantáneas ya fueron capturadas, y las escrituras realizadas
mientras el historial está en pausa existirían de otro modo solo en el store local en vivo.

Las operaciones remotas aplican los nodos generados transportados por el commit de origen. Los clientes
receptores no deben regenerarlos de forma independiente; el bloqueo de mutación y las protecciones de solo
lectura evitan que los clientes acuñen IDs distintos para las mismas superficies derivadas.

Cualquier optimización que limite la reconciliación a un subconjunto de nodos o habitaciones debe probarse
por equivalencia con un escaneo completo de nivel. Las ediciones representativas de crear, actualizar, eliminar,
cascada, dividir, fusionar y cierre de corredor deben producir los mismos espacios y superficies que una
reconciliación completa.

## Invalidación de undo y redo

Los saltos de historial independientes limpian las transformaciones en vivo y los overrides de nodos,
incluidas las vistas previas de orificios de superficie. Antes de un salto, el editor captura la disposición
efectiva fusionando los overrides en vivo sobre los nodos comprometidos. Antes de limpiar las vistas previas
ejecuta el mismo closure de dependencia pura usado para las instantáneas de historial comprometidas, con esa
disposición efectiva como `before` y el objetivo comprometido como `after`: los vecinos de muro en cualquiera
de las dos disposiciones y los hijos alojados ante cambios de dimensión del host deben reconstruirse incluso
cuando solo la vista previa descartada los conectaba. Los overrides publicados durante la restauración/limpieza
también contribuyen con su closure antes de ser limpiados. Los objetivos de transformación en vivo sobrevivientes
y sus padres también reciben marcas de restauración. Los comandos vacíos preservan las vistas previas, y los
delegados colaborativos son dueños de su propio refresco.

Core compara las instantáneas before/after de nodos en un microtask antes del pintado. Marca los nodos
cambiados, los padres antiguos y nuevos, los vecinos de muro en ambas disposiciones (acotados al nivel del
muro) y las puertas/ventanas/items alojados cuando cambia el grosor, la altura o la curvatura del muro. La
eliminación conserva su refresco conservador de hermanos sobrevivientes y quita las marcas de IDs faltantes.
Ambas disposiciones se capturan por salto; las notificaciones de pausa/reanudación de historial de la
reconciliación no pueden reemplazarlas. El fallback de arranque en frío sin instantánea previa sigue siendo
conservador.

La restauración temporal escribe en el store de la escena, de modo que las suscripciones existentes siguen
siendo dueñas de las actualizaciones del índice espacial, el seguimiento de contexto de losas, la detección de
espacios, tramos/aberturas de escaleras, aberturas de ascensor y los dependientes de altura de nivel. La
sincronización espacial también verifica antes/después los límites de losas renderizadas: las bandas de muro y
las costuras entre hermanos pueden cambiar el soporte incluso cuando el polígono almacenado de la losa no
cambió. La invalidación de soporte prueba las bandas renderizadas ganadas/perdidas en ambas disposiciones, de
modo que los objetos en un límite anterior se re-elevan mientras los consumidores en el interior sin cambios se
mantienen limpios. Cada pase agrupa una vez los muros, losas y consumidores de los niveles afectados y cachea
una vez por disposición el polígono renderizado de cada losa. Descubrir cambios sigue escaneando las
instantáneas; no escanea la escena de nuevo por cada losa candidata.

El undo/redo independiente acota los candidatos de reconciliación a cada nodo de identidad modificada en las
instantáneas actual y objetivo, incluidas las adiciones/remociones y cada paso de un salto de múltiples pasos.
Las identidades de sitio, edificio o nivel modificadas conservan la reconciliación de nivel completo. El
rastreador de losas refleja el contexto del renderer a través de `slabPolygonContextForLevel`, preservando la
pertenencia y el orden de `level.children` para la adopción de muros y las costuras entre hermanos. Firma cada
polígono derivado, elevación, grosor y estado empotrado, además de las transformaciones de edificio para losas
rellenas de terreno. Las referencias de entrada sin cambios omiten la serialización; los niveles modificados
comparten bandas de muro preparadas y segmentos entre hermanos, y los límites conservadores en ambas
disposiciones limitan la derivación de polígonos. Las escrituras directas de losas conservan su invalidación
existente. Esto no es una firma completa de elegibilidad de relleno de terreno: las elevaciones base de nivel,
las alturas de pila (stack) y la ascendencia edificio-a-sitio permanecen fuera de ella.

No hay un refresco rutinario de historial de toda la escena ni un reinicio de lote. La instantánea de lote
existente de prioridad 1 libera las fuentes afectadas (incluidas las aberturas de muros sucios); los miembros
intactos permanecen agrupados, y los miembros afectados se reincorporan a través de la ventana de
estabilización normal.

## Agregar un sistema nuevo

1. Decide el alcance:
   - **Lógica de dominio** → `packages/core/src/systems/`
   - **Efecto secundario de renderizado de viewer** → `packages/viewer/src/systems/` — móntalo en `packages/viewer/src/components/viewer/index.tsx`
   - **Específico del editor o específico de integración** → mantenlo en la app consumidora (p. ej. `apps/editor/components/systems/`) e inyéctalo como hijo de `<Viewer>`

2. Crea `<nombre>-system.tsx` en el directorio apropiado.

3. Móntalo en el lugar correcto:
   - Los sistemas internos del viewer van en `packages/viewer/src/components/viewer/index.tsx`
   - Los sistemas específicos de la app se inyectan como hijos desde afuera:
     ```tsx
     // apps/editor — el editor inyecta sus propios sistemas sin modificar el viewer
     <Viewer>
       <MyEditorSystem />
       <ToolManager />
     </Viewer>
     ```

4. **El orden de montaje importa.** La mayoría de los sistemas del viewer se ejecutan *después* de los renderers en el árbol JSX — consumen datos de `sceneRegistry` que los renderers pueblan al montar. Solo coloca un sistema antes de los renderers si explícitamente no lee el registro.