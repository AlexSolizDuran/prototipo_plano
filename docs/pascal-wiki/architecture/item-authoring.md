# Autoría de elementos (GLBs pintables)

Cómo construir un GLB de elemento de catálogo para que el editor conserve sus materiales como
apariencia predeterminada **y** exponga las partes con nombre como **ranuras (slots)** pintables.
Este es el contrato de autoría de contenido para el formato de archivo; el lado del entorno de
ejecución (cómo se resuelve y se vuelve a aplicar el color de una ranura) vive en
[materials-and-themes](materials-and-themes.md), y las declaraciones procedimentales de ranuras
viven en [node-definitions](node-definitions.md).

Toda la convención es opt-in según el nombre del material: un elemento sin materiales de ranura se
representa con su aspecto creado/horneado intacto y no expone nada para pintar.

## El contrato de ranura (slot)

Un **material** de glTF cuyo nombre comienza con `slot_` (sin distinguir mayúsculas/minúsculas)
marca una parte pintable. Las reglas canónicas viven en `packages/core/src/lib/slots.ts` y las
comparten tanto el análisis de carga (upload scan) como el renderizador, de modo que los nombres
creados, los metadatos de ranura almacenados y las mallas en tiempo de ejecución jamás pueden
divergir:

- **Un material por parte pintable, llamado `slot_<part>`.** Por ejemplo: `slot_frame`,
  `slot_seat`, `slot_bed_frame`.
- **El id de ranura se deriva** mediante `deriveSlotId`: elimina el prefijo `slot_`, quita un
  sufijo numérico de Blender por de-duplicación (`.001`) y convierte el resto a minúsculas. Así,
  tanto `slot_Bed_Frame` como `slot_bed_frame.001` resuelven a la ranura `bed_frame`. Dividir una
  parte lógica entre varios materiales de Blender que se de-duplican al mismo id los **combina**
  en una sola ranura — intencional, para que una parte dividida por razones de modelado se siga
  pintando como una sola.
- **Los materiales sin marcar se mantienen como se crearon, para siempre.** Un material sin el
  prefijo `slot_` se representa exactamente como fue creado y no expone ninguna ranura. Esta es la
  opción correcta para etiquetas fijas, calcomanías (decals), señalética y detalle horneado (por
  ejemplo, el letrero de una alarma de incendios, el panel frontal de un aire acondicionado).
- **Pintable solo con el nombre.** Una ranura de color sólido no muestra UVs, por lo que un elemento
  de color plano se vuelve totalmente pintable con solo renombrar sus materiales — sin necesidad de
  rehacer el desenvuelto (re-unwrap).

## Apariencia predeterminada

La apariencia predeterminada de una ranura son **los datos del propio material creado** (su
`baseColorFactor` / mapas), nunca codificados en el nombre de la ranura. Pintar una ranura
sobrescribe ese valor predeterminado; restablecerlo regresa a él.

Los valores predeterminados seleccionados entre elementos (por ejemplo, "este asiento usa por
defecto la lona del catálogo") viajan **con el activo (asset)** como extras de material glTF
`pascal_material`, leídos en tiempo de ejecución desde `material.userData.pascal_material`. Son
opcionales — si no hay ninguno, el material creado es el predeterminado.

## Nombres reservados

- **`cutout`** — una **malla (mesh)** (no un material) llamada `cutout` se trata como un ayudante de
  corte booleano: se oculta en tiempo de ejecución y nunca se vuelve una ranura ni una superficie
  visible. Úsalo para el volumen negativo que sustrae una abertura del host, no para geometría que
  quieras mostrar.

## Escala mundial UV (~1 unidad por metro)

Los acabados repetibles (tileable) asumen el mismo contrato de escala mundial UV que las superficies
procedimentales: **1 unidad UV = 1 m** (ver [materials-and-themes](materials-and-themes.md) →
*Escala mundial de texturas (Texture world scale)*). Este es un **requisito de autoría, no una
corrección al momento de renderizar** — el validador de ranuras marca por presencia de UV las
ranuras que necesitan UVs y no las tienen. Las ranuras de color plano no necesitan UVs en absoluto.

Para detalles fijos multicolor *dentro* de una ranura, hornéalo en **colores de vértice**: pintar
intercambia el material de la ranura, pero los colores de vértice viajan junto con él, así que una
parte de dos tonos se mantiene en dos tonos bajo cualquier acabado.

## Receta en Blender (validada)

1. **Aplicar escala** — `Ctrl+A` → Scale, para que 1 unidad de Blender se exporte como 1 m y se
   cumpla la promesa de escala mundial UV.
2. **Renombrar materiales** a `slot_<part>` para cada parte pintable.
3. **Ranuras de superficie dura** — UV → **Cube Projection** con **Cube Size = 1.0**. Esto da
   exactamente 1 unidad UV/m por construcción; las islas superpuestas están bien porque los acabados
   se repiten y nada se hornea.
4. **Ranuras curvas / suaves** — usa el complemento (addon) **Texel Density** a
   **10.24 px/cm @ 1024 px**.
5. **Verificar** con una textura de rejilla UV antes de exportar.

## Exportación (crítica)

- **Las Propiedades personalizadas deben estar habilitadas.** En el exportador glTF de Blender,
  activa *Include → Custom Properties*, o los extras `pascal_material` nunca llegan al GLB y los
  valores predeterminados seleccionados se pierden silenciosamente.
- **Preserva los extras a través de la optimización.** Ejecuta un optimizador que preserve los
  extras — gltfpack con `-ke` (keep extras). Los extras del lado de la autoría se leen una sola vez
  en la carga, así que cualquier extracción entre la exportación y la carga los pierde; el validador
  advierte cuando los extras parecen extraídos.

## Cómo lee el editor el resultado

Al cargar, el renderizador conserva los materiales creados del GLB y, para cada material cuyo nombre
derive un id de ranura, captura esa ranura en la instancia para que la herramienta de pintura pueda
apuntar a `(nodeId, slotId)`. Los elementos creados sin materiales `slot_` simplemente se
representan con su aspecto creado y no exponen ranuras — no hay un "modo" separado por configurar; el
comportamiento se deriva de los nombres de los materiales en el archivo.