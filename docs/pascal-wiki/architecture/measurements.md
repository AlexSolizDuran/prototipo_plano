# Mediciones (Measurements)

*Anotaciones de medición genéricas y persistentes, asociaciones semánticas de elementos y el contrato de dibujo (drafting) 2D/3D compartido.*

Aplica a: `packages/core/src/{lib/measurement-geometry.ts,lib/zone-quantities.ts,schema/nodes/measurement.ts,registry/types.ts}`, `packages/nodes/src/{measurement/**,wall/measurement.ts,roof-segment/measurement.ts,shared/polygon-measurement.ts,shared/quick-measurement.ts,zone/quantities-panel.tsx}`, `packages/editor/src/{store/use-measurement-draft.ts,components/editor-2d/floorplan-measurement-tool-layer.tsx,components/editor-2d/floorplan-quick-measure-layer.tsx}`.

Las mediciones son hijos regulares de nivel (level children). Su geometría se resuelve en metros locales
al nivel en unidades SI, mientras que la representación y el formato se derivan de las preferencias en
vivo del visor. Las vistas previas de borrador (draft) permanecen transitorias y una medición completada
entra al historial de la escena mediante una sola llamada a `createNode`.

## Implementación actual

- Las mediciones de distancia, ángulo, área, perímetro y volumen de prisma son nodos `measurement`
  persistentes en el grafo de escena ordinario.
- Los anclas libres y los anclas semánticos estables coexisten. Las contribuciones de pared (wall),
  segmento de techo (roof-segment), losa (slab), cielo raso (ceiling), zona y sitio resuelven la
  geometría actual, de modo que los valores asociados se actualicen con sus anfitriones sin reescribir la
  medición.
- Las mediciones seleccionadas se editan a través de puntos finales en escena o vértices de polígono en 2D
  y 3D. Las mediciones no montan el menú flotante genérico de acciones ni el inspector paramétrico.
- Escape valida y finaliza la medición actual, y luego conserva el tipo seleccionado para que otra medición
  pueda comenzar de inmediato. Un Área con al menos tres puntos colocados se confirma; si esos puntos no
  encierran un área plana válida, se mantienen visibles con el error de validación en lugar de descartarse.
  Con menos de tres puntos colocados el borrador aún se cancela.
- El dibujo tridimensional usa raycasts de superficie de toda la escena, selección de superficie de
  polígono consciente de la intención, ejes magnéticos verificados por superficie, ejes de proximidad
  estructural y anillos huecos de intersección de normales de superficie. La geometría de anotación
  persistente permanece en la capa superpuesta (`OVERLAY_LAYER`) para no enmascarar el pase WebGPU de la
  escena.
- Los puntos finales de distancia confirmados se representan como anillos de contacto del tamaño de la
  pantalla, probados en profundidad, alineados con la normal de cada ancla resuelta. Por lo tanto, los
  anclas semánticos de cara de pared permanecen a ras del host editado en lugar de volverse marcadores
  orientados a la cámara o flotantes.
- La medida inteligente (Smart measure) es una lente de medición 2D/3D transitoria. Al pasar el cursor se
  resuelven los informes de pared, losa y zona propiedad del registro en un solo HUD del viewport del
  editor y un marcador de superficie en vivo; al hacer clic se fija el informe y se deja un ancla más firme
  en la vista hasta que otra superficie la reemplace o Smart salga. Nunca crea nodos, cambia la selección
  ni escribe historial.
- Una zona seleccionada expone un informe de plano derivado con huella/perímetro, dimensiones de bordes,
  superficie bruta de paredes, superficie correspondiente de pisos y volumen plano de la habitación, solo
  cuando la evidencia actual de la escena prueba cada valor.
- Las etiquetas de valor real usan el tratamiento de anotación delineada. La herramienta 3D omite las
  píldoras que siguen al cursor (característica, segmento activo y nombre de eje); la herramienta 2D aún
  presenta etiquetas semánticas y de segmento activo mientras esa decisión de paridad permanezca abierta.

## Inspección inteligente y cantidades de zona

`NodeDefinition.quickMeasure` es el punto de extensión propiedad del nodo para una inspección rápida. Un
informe contiene un título, un subtítulo, un ancla local a la escena, filas de métricas compactas y una
nota opcional de calificación. Los informes de pared exponen la longitud de la línea central, la altura
efectiva, la superficie bruta de la cara antes de aberturas y el espesor. Los informes de losa exponen la
superficie sustraída de orificios, el perímetro exterior y el espesor. Los informes de zona exponen huella
y perímetro, y dicen explícitamente que el envolvente de la habitación no está probado.

El modo Smart no es un tipo de medición persistente. Seleccionarlo no sobrescribe el último tipo creable
usado por `M`; salir de él no crea ninguna entrada de escena ni de historial. La herramienta 3D reutiliza
la sesión de consulta de superficie acotada y muestra un anillo de contacto de normal de superficie. La
capa 2D usa el objetivo de impacto del plano de piso del registro y mapea el puntero a coordenadas de
escena para el marcador de contacto correspondiente. Ambas vistas publican en un HUD de informe propiedad
de un solo editor, fijado en el centro superior del viewport combinado. En modo dividido, el panel bajo
inspección activa es dueño de ese único HUD; en modo solo-2D o solo-3D, la fuente correspondiente se
selecciona directamente. Cámara, paneo, zoom, rotación de escena y el divisor del modo dividido nunca
mueven los datos. Un clic captura solo estado de herramienta transitorio: el hover puede inspeccionar
temporalmente otra superficie, la salida del puntero vuelve al informe fijado y un clic posterior reemplaza
la fijación.

El manejo del puntero de Smart es de último evento gana (latest-event-wins). Un solo planificador de
fotogramas compartido descarta los eventos crudos intermedios, limita las consultas de superficie a una
cada 30 milisegundos e ignora el movimiento por debajo de un píxel de pantalla. Sobre el mismo nodo
objetivo, 2D y 3D actualizan solo la transformación del marcador en vivo de manera imperativa; el estado de
React y la reconciliación de la tarjeta del informe ocurren solo cuando la identidad del objetivo cambia o
el usuario fija un resultado. La capa 2D limpia el hover solo cuando el puntero sale del SVG raíz, no
cuando cruza paths hijos. El HUD compartido del editor permanece transparente al puntero, de modo que
montar o cambiar el informe no pueda forzar una falsa salida de canvas.

Los visuales de zona se desmontan intencionalmente fuera de la presentación de zona, por lo que un impacto
de piso Smart 3D no puede depender solo de una malla de zona. Cuando el impacto visible es una cara de losa
hacia arriba/abajo, Smart revisa los polígonos de zona del nivel activo en el espacio de planta local al
nivel y resuelve la zona contenedora más pequeña. Nunca reemplaza un impacto de pared. Cuando la geometría
de zona está montada, una zona casi coplanar también puede ganar sobre su losa dentro de la tolerancia de
superficie acotada.

`deriveZoneQuantityReport` es un informe Core puro y conservador. El área de huella, el perímetro y las
longitudes individuales de borde siempre están disponibles. La clasificación de habitación cerrada requiere
que la zona esté sustancialmente cubierta por espacios detectados que a su vez estén contenidos por la
zona, o una cobertura completa de paredes del límite cerrado de la zona dentro de la tolerancia de
modelado. Cada espacio detectado superpuesto contribuye con sus tramos ordenados de caras límite orientadas
al interior recortados a la zona: una pared exterior contribuye solo con su lado orientado a la habitación,
un separador interno contribuye con ambos lados orientados a la habitación, y una subzona semántica nunca
inventa una pared a lo largo de un límite abierto. Por lo tanto, la superficie de pared puede estar
disponible incluso cuando la zona se clasifica como huella. La evidencia de piso y cielo raso puede combinar
múltiples superficies solo cuando su unión cubre al menos el 95% de la zona y sus elevaciones o alturas
coinciden; los orificios contenidos se restan, los orificios que se cruzan permanecen no disponibles. El
volumen plano usa el área de piso probada y la altura libre positiva sin requerir un envolvente de pared
fabricado. La evidencia faltante o conflictiva devuelve una razón de no disponibilidad orientada al usuario
en lugar de una estimación plausible.

El inspector paramétrico de zona deriva este informe del polígono de zona actual y de los nodos de la
escena, y luego representa una vista superior SVG compacta con cada dimensión de borde más las filas de
pared, piso y volumen. Ninguno de estos valores se persiste en `ZoneNode.metadata`, se representan mediante
nodos de medición ocultos ni se escriben durante la representación. La sustracción neta de aberturas de
pared, los parámetros de tramo normalizados persistidos y las superficies superiores inclinadas siguen
siendo trabajo futuro de topología.

Una zona exacta de huella de habitación puede ser procedimental. La detección de espacio conserva los ids
de pared recorridos por el ciclo de media-arista que la prueba; la zona almacena esos ids en
`boundaryWallIds` con `autoFromWalls`. Su geometría 2D/3D, el informe Smart, las características semánticas
y el informe de cantidades resuelven el polígono actual desde esas paredes efectivas, incluidos los
reemplazos en vivo por pared. El movimiento del puntero no escribe la escena. La confirmación de la pared
actualiza el polígono almacenado como respaldo mientras el historial de la escena está pausado. Mover o
editar la zona misma limpia la asociación, de modo que un límite manual deliberado no pueda ser re-capturado
por la reconciliación de habitaciones. Las zonas de sitio/césped que no coinciden exactamente con un recinto
detectado siguen siendo manuales.

## Datos persistentes

`MeasurementNode.measurement` es una carga útil discriminada:

- `distance`: exactamente dos anclas 3D finitas.
- `angle`: tres anclas, con la ancla del medio como vértice.
- `area`: un polígono plano con al menos tres puntos 3D finitos.
- `perimeter`: la longitud cerrada de un polígono plano con al menos tres anclas.
- `volume`: la misma base plana más un vector de extrusión finito con una componente distinta de cero a lo
  largo de la normal de la base.

Una ancla es una tupla de punto libre o `{ kind: 'feature', reference, fallback }`. La referencia contiene
un id de nodo de escena, un id de característica semántica propiedad del tipo de nodo y parámetros opcionales
finitos/cadena/booleanos como la posición normalizada de ruta `t` y la altura de pared. El fallback no es un
valor en caché: es el punto de presentación explícito de desvinculación/colgante que se usa solo cuando la
referencia no se puede resolver.

El área no depende de la dirección de enrollado (winding). El volumen es `abs(dot(areaVector, extrusion))`,
por lo que un prisma oblicuo válido usa solo la componente de extrusión normal a su base. Mantén estos
cálculos en `@pascal-app/core`; los renderizadores y paneles no deben reimplementarlos.

Los nodos de medición deben permanecer en `AnyNode`, `LevelNode.children`, el registro de nodos integrados y
la validación del grafo alojado, todo junto. Son seleccionables, eliminables y duplicables, pero `bake: strip`
mantiene las anotaciones de análisis fuera de la salida del modelo horneado.

## Características semánticas y asociatividad

`NodeDefinition.measurement` es el punto de extensión genérico. Puede exponer:

- `features(node, ctx)` para enumerar geometrías de tupla estables y etiquetadas para ajuste (snapping) y
  vistas previas;
- `resolve(node, ctx, reference)` cuando un parámetro almacenado cambia cómo se reconstruye la característica;
- `match(node, ctx, point, maxDistance)` cuando el tipo de nodo sabe más que una búsqueda genérica de
  segmento más cercano, como elegir la cara de pared más cercana a un impacto de superficie.

Estas funciones son puras y reciben el mismo `GeometryContext` de solo lectura que usa la geometría
registrada. No deben importar Three.js, estado del editor ni `useScene`. Los ids de características describen
roles semánticos (`wall:face:left`, `wall:height`, `roof:ridge:0`); las etiquetas jamás actúan como
identificadores.

La contribución de pared muestrea la línea central existente de la pared curva y resuelve los impactos de
cara con `t` normalizada más la altura limitada. Los vértices exactos a nivel de plano se vinculan a
`wall:start` o `wall:end` antes de que se ejecute el emparejador de caras consciente del espesor. Las paredes
curvas además publican `wall:curve:center`, lo que permite que las dimensiones de construcción de radio,
marca central, cuerda, longitud de arco y angular se vinculen a su geometría definitoria completa y sigan las
ediciones posteriores de la curva. El dibujo de longitud de arco y angular usa cuatro clics explícitos:
primer punto de arco/rayo, centro/vértice, segundo punto de arco/rayo y luego la posición de la línea de
etiqueta; sus anclas persisten en orden punto-centro-punto. La contribución de segmento de techo reutiliza
`getRoofSegmentPlanLinework` y el cálculo existente de altura de superficie del techo, y luego aplica las
transformaciones del segmento y del techo padre. La losa, el cielo raso, la zona y el sitio usan una
contribución de polígono compartida con roles estables `vertex:<index>`, `boundary` y `center`. Una esquina
exacta usa la característica de punto para seguir siendo una esquina cuando la forma del polígono cambia; las
anclas continuas de límite almacenan la posición normalizada del perímetro. No dupliques ninguna de esas
implementaciones de topología en el código de medición.

`resolveMeasurementNode` deriva la geometría actual de punto libre desde la instantánea de la escena. Los
renderizadores se suscriben a los nodos referenciados, a sus padres y a los reemplazos de nodo efímeros; la
caché del plano de piso usa `def.floorplanDependencies` y el mismo resolutor fusionado con reemplazos. Por lo
tanto, una edición del host cambia la geometría y el valor de la medición durante el arrastre y después de
confirmar, sin escribir el nodo de medición ni agregar entradas de historial.

Si el tipo de nodo o la característica falta, la resolución usa el fallback almacenado e informa una
referencia colgante. Ambos renderizadores muestran la anotación en rojo con una etiqueta `Unlinked`, y el
inspector ofrece una acción explícita de desvincular que convierte la geometría resuelta/fallback en puntos
libres. Eliminar un host nunca elimina ni congela silenciosamente una medición.

Todas las rutas de clonación de escena reasignan los ids de nodos de características cuando el host
referenciado es parte del mismo mapa de ids de clonación. Las referencias a hosts fuera de la selección
duplicada siguen siendo externas. Cualquier ruta nueva de duplicación debe llamar al mismo reasignador puro.

## Propiedad del borrador y marcos

`useMeasurementDraft` es el único store transitorio de borradores. El primer punto confirmado captura tanto
un propietario (`2d` o `3d`) como el id del nivel seleccionado. Hasta confirmar o cancelar:

- solo el propietario puede añadir, cerrar o extruir el borrador;
- cualquiera de las vistas puede presentar el mismo borrador mientras su nivel seleccionado aún coincida;
- una discrepancia de nivel suprime las vistas previas y restablece el borrador;
- la confirmación re-verifica el nivel capturado y crea el nodo bajo ese nivel solamente.

Todos los puntos de borrador almacenados, puntos hover, normales y guías usan el marco local del nivel
capturado. Una vista previa puede transformar esos valores para la visualización, pero jamás debe
reinterpretarlos en el marco del nivel seleccionado en vivo.

Las actualizaciones de movimiento del puntero permanecen en `useMeasurementDraft`; nunca escriben en
`useScene`. La finalización llama a `commitMeasurementDraft`, que analiza un `MeasurementNode` y realiza una
escritura de escena deshacible.

La edición de vértices del borrador usa la misma regla. Un gesto de puntero captura un punto indexado y su
ancla de característica opcional, reemplaza ambos durante el arrastre y los conserva o restaura al
soltar/cancelar. El gesto permanece dentro del alcance `drafting` de la medición y nunca escribe historial de
escena. Un vértice de polígono arrastrado usa ambos vértices adyacentes como posibles anclas de eje.

Una vez que un polígono tiene tres puntos, cada borde cerrado expone un manejador de punto medio más pequeño.
Cruzar el umbral normal de arrastre inserta ese punto medio y lo convierte de inmediato en el vértice activo;
cancelar elimina la inserción transitoria, mientras que soltar la conserva. Un clic sin arrastre no hace nada.
El vértice activo y sus dos bordes conectados reciben un feedback más fuerte, igual que la edición de
polígonos de losa y cielo raso, sin importar sus supuestos de geometría XZ horizontal.

## Edición confirmada

Una medición confirmada con selección única expone sus puntos finales o vértices existentes directamente en
la vista activa. Distancia y ángulo exponen sus tuplas de puntos; área y perímetro exponen sus anillos
completos; el volumen expone solo su anillo base porque los vértices superiores siguen derivándose del vector
de extrusión. Estos manejadores son affordances de selección, no un segundo modo de herramienta, y desaparecen
cuando la medición no está seleccionada. La edición confirmada no inserta vértices de punto medio.

Arrastrar un manejador actualiza cada fallback semántico desde la geometría resuelta actual y luego reemplaza
solo el ancla movida. Las anclas semánticas intactas conservan sus referencias. Un arrastre 3D usa el mismo
resolutor de superficie visible, ejes de vértices adyacentes, anclas de proximidad y coincidencia de
características semánticas que el dibujo; se re-asocia cuando el punto final restringido aún está sobre la
característica coincidente. La affordance 2D usa el pipeline compartido de alineación de pared, rejilla y
estructural y puede re-asociarse a la característica de pared que ganó el ajuste magnético. De lo contrario,
la ancla movida se convierte en un punto libre.

Las ediciones de área, perímetro y volumen permanecen en el plano arbitrario original de la medición. Un
impacto 3D se proyecta de vuelta a ese plano; una edición 2D en planta resuelve la altura faltante desde la
ecuación del plano, incluidos los planos inclinados, y proyecta el punto en planta a un plano vertical cuando
la altura no se puede resolver de manera única. Distancia y ángulo conservan la altura existente del punto
movido en 2D.

Ambos caminos de edición confirmada previsualizan mediante `useLiveNodeOverrides`. Al soltar el puntero se
limpia la vista previa y se realiza un `updateNode` rastreado; cancelar el puntero, Escape, el blur, el
desmontaje o un resultado de esquema inválido limpian el reemplazo sin escritura de escena. El renderizador
persistente consume su propio reemplazo en vivo para que la geometría y los valores se muevan en sincronía
durante el gesto.

Las mediciones fijan `presentation.actionMenu: false` y no registran `parametrics`. Ambos menús de acción
genéricos 2D y 3D respetan el indicador del registro, mientras que el manager genérico de inspector no
devuelve ningún panel flotante para un tipo sin parametrics. Los manejadores directos de geometría son la
interacción primaria de nodo seleccionado; la selección, la eliminación/duplicación por teclado, el nombre y
la visibilidad en el árbol en línea y la persistencia de escena permanecen en sus contratos ordinarios de
nodo.

## Selección (picking) y ajuste (snapping)

El ajuste de mediciones es siempre magnético. El chip de modo de ajuste de construcción (`grid` / `lines` /
`angles` / `off`) rige las herramientas de construcción; los anclas de medición existen para vincular
geometría real, por lo que los caminos de dibujo y de edición confirmada en ambas vistas aplican el
magnetismo de pared, característica semántica y eje de manera incondicional y nunca consultan
`isMagneticSnapActive()`. Mantener Alt es la vía temporal de anulación en ambas vistas: la atracción de eje,
el magnetismo de pared y la atracción de geometría proyectada 2D se liberan, y una característica semántica
se vincula solo en la tolerancia de contacto (0.012 m) en lugar de por atracción. Los puntos libres de
medición nunca se cuantizan a la rejilla de construcción — la capa de dibujo y la affordance confirmada 2D
ambas enrutan el fallback a través del puntero crudo. El único lector impulsado por modo que queda es la
altura de extrusión de volumen, que se cuantiza al paso de rejilla en modo `grid`. En 2D, un ajuste discreto
de pared (punto final, punto medio o cruce) supera a la atracción de eje bloqueado: mientras se adquiere un
punto así, la asistencia de eje permanece pasiva para que el bloqueo no pueda arrastrar el punto fuera de la
esquina.

La herramienta 3D registrada hace raycast de la geometría visible bajo las raíces de escena registradas y
convierte el punto y la normal ganadores del espacio mundial al marco del nivel activo. Una malla renderizada
por sistema fuera de esas raíces debe optar por participar con `userData.measurementSurface = true`; este es
el contrato usado por las mallas de plantas instanciadas colectivas. Una raíz de ayuda del editor anidada bajo
geometría registrada debe optar por quedar fuera con `userData.measurementSurface = false`, que es heredado
por sus descendientes. La activación de la medición limpia la selección de objetos, y los nodos de
medición/guía/scan, los objetos invisibles, los materiales de opacidad cero o sin prueba de profundidad y los
colliders con `colorWrite: false` quedan excluidos. Los impactos instanciados deben incluir la matriz de la
instancia intersectada cuando sus normales se transforman.

El dibujo de área, perímetro y volumen trata la primera superficie como un plano de referencia rígido. Antes
del primer punto, una losa horizontal, un cielo raso o una superficie de sitio pueden superar a una pared que
la ocluye por no más de 0.45 metros a lo largo del rayo del puntero, lo que hace estables las esquinas de piso
sin convertir un hover a media pared en una selección de piso. El primer contacto confirmado suministra
entonces el plano para cada vértice y edición de borrador posteriores. Las consultas de puntero aceptan solo
impactos en ese plano, incluso a través de un oclusor más cercano; cuando el rayo del puntero no tiene un
impacto de superficie coincidente, no se ofrece ningún candidato. Alt aún libera los ejes magnéticos y la
atracción de características, pero jamás libera el plano de polígono capturado. El store compartido de
borradores proyecta los puntos aceptados y los fallbacks de características sobre el plano como invariante
final. Distancia y ángulo siguen siendo herramientas de superficie más cercana.

La asistencia de eje parte del vértice anterior. X, Y o Z se vuelve un ajuste solo cuando el candidato
proyectado se verifica sobre la superficie de impacto dentro del umbral de espacio de pantalla. De lo
contrario, el impacto de superficie crudo sigue siendo la autoridad y el eje más cercano se muestra como una
guía pasiva. Un bloqueo magnético entra a los 16 píxeles de pantalla y conserva el mismo eje y ancla hasta los
24 píxeles; debe liberarse de inmediato si ese candidato ya no se verifica sobre la superficie.

La vista previa 3D también hace raycast en ambas direcciones a lo largo de cada eje local al nivel y marca las
superficies elegibles visibles que esos ejes cruzan. Estos objetivos son orientación, no anclas almacenadas ni
candidatos de ajuste independientes: la colocación del puntero aún debe adquirir y verificar el candidato de
eje ordinario que preserva la superficie. Las consultas de intersección usan por lo tanto el mismo contrato de
raíces registradas, visibilidad, exclusión de ayudas y superficie de sistemas que la selección por puntero, y
están acotadas por dirección de eje.

La herramienta 3D en vivo es dueña de una `MeasurementSurfaceQuerySession`. La sesión reutiliza raycasters
dedicados de puntero, verificación y eje; guarda en caché el contexto de raíz/propietario elegible por
`sceneRegistry.revision`; y actualiza periódicamente los opt-ins explícitos `measurementSurface` no
registrados. La resolución de puntero, la verificación de superficie y la recolección de intersecciones de eje
comparten así un contrato de elegibilidad sin reconstruir raíces registradas para cada evento de puntero. El
desmontaje de la herramienta dispone la sesión invalidando su contexto en caché.

Las mediciones también tratan los anclas de alineación estructural del nivel activo como ejes de proximidad.
En 3D esta asistencia se limita a superficies de impacto casi horizontales y cada proyección X/Z adquirida se
vuelve a proyectar sobre la superficie original antes de que pueda mover el punto. En ambas vistas, un eje de
escena cercano puede anunciarse hasta a 40 píxeles de pantalla, se vuelve magnético en el umbral ordinario de
adquisición de 16 píxeles y conserva el ancla de origen exacta hasta el umbral de liberación de 24 píxeles.
Mantén este estado en el borrador de medición hasta que el store compartido de guías de alineación tenga
sesiones conscientes del propietario; publicar guías globales sin propietario permitiría que el panel inactivo
sobrescriba la medición activa.

La capa 2D lee la geometría SVG registrada del plano de piso y los mismos anclas de alineación estructural que
usan las herramientas de colocación. Da prioridad a los vértices sobre los bordes, adquiere esquinas
registradas a menos de 16 píxeles de pantalla, acota la recolección de elementos y segmentos, de-duplica los
anclas de proximidad en el espacio de planta y aplica la asistencia X/Z en el espacio de planta. Antes de la
asistencia de eje también ejecuta el pipeline compartido de ajuste de plano de superficie losa/cielo raso: los
puntos finales, puntos medios, cruces y bordes de pared magnéticos publican el resaltado común de pared y la
baliza de ajuste, y el id de pared ganador se convierte en el objetivo de asociación semántica. Ambas vistas
usan las mismas transiciones de borrador y el mismo camino de confirmación.

Después del ajuste ordinario de superficie/plano, el nodo registrado ganador puede refinar el impacto mediante
`NodeDefinition.measurement.match`. Una coincidencia exitosa almacena el ancla de característica semántica y
usa su punto resuelto; los nodos no soportados conservan el punto libre ordinario. Esto mantiene la selección
genérica disponible para cada nodo representado sin pretender que los triángulos de malla inestables son
topología persistente.

Cuando una característica semántica está bajo el puntero, ambas vistas de dibujo pueden distinguir la
retícula. La vista 3D no agrega una píldora de texto que sigue al cursor; la vista 2D conserva actualmente su
etiqueta semántica. Esto es solo presentación: hacer clic sigue creando un ancla de medición persistente
ordinaria, y las superficies no soportadas mantienen el mismo flujo de trabajo de punto libre.

## Representación y visibilidad

El renderizador 3D persistente combina tres fuentes de visibilidad:

1. `MeasurementNode.visible` para una sola anotación.
2. `useViewer.showMeasurements` para la preferencia de visualización del proyecto.
3. Visibilidad de ancestros de Three.js para la presentación de nivel, edificio y sitio.

La verificación de ancestros también debe controlar la etiqueta de valor `Html` de Drei porque los portales
DOM no heredan la visibilidad de Three.js. La definición 2D de plano de piso aplica los indicadores de nodo y
globales antes de emitir geometría semántica.

Los rellenos, trazos y puntos finales 3D persistentes se representan en `OVERLAY_LAYER`. Mantenlos fuera del
MRT de profundidad/difusa/normal de la escena: los rellenos de área y volumen son anotaciones de plano
arbitrario de doble cara, y un NodeMaterial de doble cara en ese MRT puede invalidar el pipeline de renderizado
WebGPU. La capa de cámara superpuesta sigue siendo raycasteable, por lo que esta separación no elimina la
selección de nodos.

Las etiquetas persistentes y de borrador leen `useViewer.unit` al renderizar. El JSON del nodo siempre
permanece en metros; los cambios de unidad no deben mutar los datos de escena ni crear entradas de historial.
En 3D, las mediciones vinculadas en reposo permanecen casi negras y las mediciones activas usan el acento de
producto índigo. En 2D, la geometría de medición vinculada permanece índigo en reposo como pista de capa de
análisis distinta de la geometría física del plano de piso, con las mediciones activas usando el acento más
brillante; las mediciones colgantes permanecen rojas. Mantén consistente la jerarquía de cada vista entre
geometría, puntos finales y rellenos, reteniendo suficiente contraste de etiquetas sobre la escena.

Las etiquetas usan una jerarquía comedida: la distancia muestra un valor desplazado de su segmento; el ángulo
dibuja el arco del ángulo menor entre sus dos rayos y coloca el valor en grados en ese arco; el área, el
perímetro y el volumen usan etiquetas agregadas `A`, `P` y `V` en un ancla de interior triangulada para que los
polígonos cóncavos mantengan la etiqueta dentro del relleno. En 3D, las píldoras que siguen al cursor
(característica, borde activo y nombre de eje) se omiten para que la geometría de guía cargue con el feedback
transitorio. La capa 2D de borrador aún muestra una etiqueta semántica de hover, la longitud del borde activo y
una etiqueta de eje/proximidad. El control de extrusión de volumen es dueño tanto de `H` como de la `V` en
vivo mientras está abierto, por lo que una etiqueta agregada duplicada no queda debajo. Las etiquetas
tridimensionales se mantienen de tamaño constante en pantalla; las etiquetas agregadas bidimensionales
compensan explícitamente la rotación de la escena y permanecen horizontales.

Los trazos de borrador usan `BufferGeometry` finita y no indexada con materiales de línea de nodo WebGPU. No
uses el helper ancho `Line` de Drei aquí: crea `LineMaterial` WebGL y geometría instanciada que el pase de
postprocesado WebGPU no puede renderizar.

La retícula de hover 3D es un anillo de doble cara del tamaño de la pantalla orientado hacia la normal de
superficie resuelta. Sus ejes RGB cortos permanecen en el marco de medición del nivel, mientras que un tallo
neutro comunica la normal de la superficie. Después del primer punto, las guías completas X/Y/Z pasan a través
del ancla activa; 2D refleja esto con una retícula vertical y guías X/Z. El eje candidato se ilumina y
engrosa, y luego se vuelve sólido cuando se bloquea magnéticamente. Una distancia bloqueada y su retícula
adoptan ese color de eje, y el punto final 2D gana una baliza de bloqueo concéntrica; los ejes inactivos
permanecen punteados pero visibles. Los objetivos de eje/superficie 3D son anillos huecos del tamaño de la
pantalla orientados a la normal de cada impacto del raycast, con un desplazamiento de polígono probado en
profundidad que los mantiene en contacto con la cara cruzada. Un halo blanco se asienta bajo el color del eje y
se fortalece con el mismo estado candidato/bloqueado. Una guía de proximidad de escena usa el mismo
tratamiento de halo sin píldora de nombre de eje y, en 2D, una baliza de origen para que la relación siga
siendo legible sobre geometría densa.

## Finalización de la interacción

- Distancia se confirma después del segundo punto.
- Ángulo se confirma después del tercer punto.
- Área y perímetro se cierran desde el gesto del primer punto, el doble clic o Enter.
- Volumen cierra primero la base y luego confirma una extrusión firmada explícita a lo largo de la normal de la
  base.
- Antes del cierre, presionar y arrastrar un punto de borrador existente lo reposiciona a través del mismo
  camino de superficie válida y ajuste magnético; tocar el primer punto aún cierra, mientras que tocar otro
  punto no hace nada.
- Arrastrar un punto medio de borde inserta un nuevo punto y continúa el mismo gesto ajustado a la superficie;
  cancelar restaura el anillo original.
- Retroceso (Backspace) elimina el punto base más reciente y reabre una base cerrada.
- Escape intenta la misma finalización validada que Enter. Un área o perímetro válido se confirma, y un volumen
  listo se confirma después de la extrusión; el borrador se restablece mientras conserva su tipo para que la
  herramienta siga armada para otra medición. Para volumen, el primer Escape después de una base válida avanza
  a la extrusión. Un borrador incompleto se limpia sin crear un nodo, y Escape igualmente se consume para que el
  modo de medición permanezca activo.

Mantén conectadas la selección de tipo en la barra de acciones, el atajo `M`, la ayuda de atajos, la
presentación en el árbol de escena, los valores del inspector y los controles de visibilidad de Display cada
vez que se extienda el tipo de medición.