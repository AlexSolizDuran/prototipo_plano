# Materiales y temas (color de superficie)

Cómo las superficies de un nodo obtienen su color. Aplica a: `packages/viewer/src/lib/{materials.ts,scene-themes.ts}`, la lógica de material por tipo en `packages/viewer/src/systems/<kind>/` y `packages/nodes/src/<kind>/`, y el estado de apariencia en `packages/viewer/src/store/use-viewer.ts`.

## Los ejes

La apariencia es un conjunto de ejes ortogonales, todos contenidos en `useViewer`:

| Estado | Valores | Qué controla |
|---|---|---|
| `shading` | `'solid' \| 'rendered'` | `solid` = `MeshLambertNodeMaterial`, sin SSGI/AO. `rendered` = `MeshStandardNodeMaterial` + SSGI/AO. |
| `textures` | `boolean` | Si las superficies que tienen un material/preset real muestran su textura. |
| `colorPreset` | `'clay' \| 'white' \| 'mono' \| 'blueprint'` | La paleta base por rol para superficies sin textura. |
| `sceneTheme` | id de tema (`studio`, `mediterranean`, `night`, `verdant`, …) | Iluminación + fondo + suelo + tintes de color por rol. Ver [temas de escena](#temas-de-escena). |
| `shadows` | `boolean` | Proyección de sombras direccionales (luz clave siempre encendida; ver `lights.tsx`). |
| `edges` | `'off' \| 'soft' \| 'strong'` | Contorno de tinta en espacio de pantalla en `post-processing.tsx` (`lib/ink-edges.ts`). |

`shading`/`textures`/`colorPreset` se persisten por contexto; `shadingByContext` permite que el editor use por defecto `solid` y el viewer de la comunidad `rendered`.

## Roles de superficie

Cada tipo del registry puede declarar un token en su `NodeDefinition` (`packages/core/src/registry/types.ts`):

```ts
surfaceRole?: 'wall' | 'floor' | 'ceiling' | 'roof' | 'joinery' | 'glazing' | 'furnishing'
```

`core` solo almacena el token — no lleva color y nunca importa three.js. El token es lo que permite que una pared, una losa, una columna, etc. resuelvan cada una un color *diferente* desde la misma paleta.

## Resolver un color

La única fuente de verdad está en `packages/viewer/src/lib/materials.ts`:

```ts
resolveSurfaceColor(role, colorPreset, sceneThemeId?)
  // = getSceneTheme(sceneThemeId).clayTints?.[role]   // override del tema, si existe
  //   ?? PRESET_PALETTES[colorPreset][role]            // si no, la paleta del preset
```

`createSurfaceRoleMaterial(role, colorPreset, side?, sceneThemeId?)` envuelve eso en un `MeshLambertNodeMaterial` iluminado, **con caché por `role-preset-side-sceneTheme`**. La clave de la caché es la razón por la que todo consumidor debe pasar `sceneTheme` — de lo contrario, cambiar de tema devuelve un material en caché obsoleto.

## La regla: las superficies sin textura usan el color del tema en ambos modos

Para los tipos sin defaults de slots declarados, una superficie está "texturizada" solo si su nodo tiene un `materialPreset` o `material` explícito. Los tipos con defaults de slots usan el contrato de slots descrito abajo.

- **`textures` desactivado** → cada superficie usa `resolveSurfaceColor(role, …)`.
- **`textures` activado** → las superficies texturizadas muestran su textura; **las superficies sin textura siguen usando `resolveSurfaceColor`** (no un default blanco/gris codificado).

Así que elegir el tema Mediterráneo da un techo azul + paredes cálidas sin tocar el toggle de texturas. No existe un modo "todo blanco" — sin textura siempre significa "color de rol según el tema".

### Dónde está conectado por tipo

| Tipo | Dónde se aplica el color de rol |
|---|---|
| wall | `systems/wall/wall-materials.ts` (`getMaterialsForWall`), re-aplicado cada frame por `wall-cutout.tsx` |
| roof / roof-segment | `systems/roof/roof-materials.ts` (`getRoofMaterialArray`) |
| slab | `nodes/slab/geometry.ts` (`getSlabSlotMaterial`) |
| ceiling | `nodes/ceiling/renderer.tsx` |
| tipos genéricos del registry | `systems/geometry/geometry-system.tsx` → `applyDefaultSurfaceRole` (sin texturas) |
| door / window | `systems/{door,window}/*-system.tsx` |
| stair / column / item / elevator | `nodes/<kind>/renderer.tsx` |

Cada uno de estos lee `shading`/`textures`/`colorPreset`/`sceneTheme` desde `useViewer` (o los recibe propagados desde `GeometrySystem`) y **debe incluir `sceneTheme` en la clave de su caché de materiales y en su arreglo de dependencias de reconstrucción**, o los cambios de tema no re-colorearán. `GeometrySystem` marca como sucios todos los nodos de geometría cuando cualquiera de esos cambia.

Los cielorrasos y las losas usan defaults de slots declarados en el modo de color (`textures` activado).
Los revestimientos inferiores de los cielorrasos usan un material `BackSide` opaco en ambas
apariencias; solo `ceiling-grid` hace mezcla. La cara superior de la losa, los costados/revestimiento
inferior y las mallas opcionales de falda de terreno pueden agruparse por separado. Los defaults de
slots planos comparten la caché del viewer por color, rugosidad y shading; los materiales en caché
de losas legadas llevan `__pascalCachedMaterial` para que las reconstrucciones de geometría dejen
vivos los materiales compartidos. Los overrides de slots transparentes se dibujan a sí mismos.

## Acabados de recetas de items procedimentales

Los slots de recetas guardan un color hex autorado obligatorio y pueden declarar
`finish: 'glass' | 'metal' | 'wood'`. En el primer guardado de catálogo de un diseño generado,
`snapProceduralSlotsToLibrary` llama a `resolveProceduralFinishRef(finish, color)` para
seleccionar el preset curado más cercano al color autorado en CIE76 Lab (D65).
Los empates siguen el orden de la lista siguiente. Glass siempre selecciona `library:preset-glass`;
los slots sin acabado seleccionan el color plano de la librería más cercano. Los overrides explícitos,
incluido un hex autorado elegido, se conservan. El hex de la receta nunca se reescribe.
Las recetas existentes y las instancias de escena no se re-ajustan automáticamente.

| Acabado | Id de preset de librería | Etiqueta | Tono representativo |
|---|---|---|---|
| Glass | `preset-glass` | Glass | `#87ceeb` |
| Metal | `metal-steel` | Brushed Steel | `#636363` |
| Metal | `metal-chrome` | Chrome | `#c8ccce` |
| Metal | `metal-brass` | Brass | `#b08d57` |
| Metal | `metal-copper` | Copper | `#cc845b` |
| Metal | `metal-polished` | Polished Metal | `#f3f3f3` |
| Metal | `preset-metal` | Metal | `#c7ccd2` |
| Wood | `wood-finewood27` | Finewood 27 | `#a77440` |
| Wood | `wood-woodplank48` | Wood Plank 48 | `#88654c` |
| Wood | `wood-hungarianparquet2` | Hungarian Parquet 2 | `#663020` |
| Wood | `wood-squareparquet21` | Square Parquet 21 | `#3e220d` |

La lista de wood está curada por el propietario: dos marrones claros, un marrón medio y el más
oscuro. Metal incluye solo los seis acabados de superficie listados, excluyendo Garage Panel
y otras texturas de panel. Brushed Steel, Copper y Polished Metal todavía tienen mapas de
textura de superficie; Chrome, Brass y Metal usan propiedades de material planas.

Los tonos representativos viven junto a las referencias curadas en `library-colors.ts`.
Para wood, son la media aritmética de los canales R/G/B de cada píxel sRGB en los
WebP de color base de origen 1024×1024 en `apps/editor/public/material/wood/`:
`finewood_27/finewood_27_basecolor.webp`, `woodplank_48/woodplank_48_BaseColor.webp`,
`hungarian_parquet_2/Hungarian Parquet_2_baseColor.webp` y
`square_parquet_21/Square Pattern Parquet_21_baseColor.webp`.
Para los metals con textura, la media equivalente usa el nivel base 512×512 decodificado desde
`metal/{stainless_steel_brushed,copper_metal,polished_metal}/*_basecolor_512.ktx2`
con `basisu -unpack -no_ktx -etc1_only`. Un pequeño script de Python usó
`ImageStat.Stat(image.convert('RGB')).mean` de Pillow, redondeando cada canal al entero
más cercano antes del codificado hex. Los acabados planos usan `mapProperties.color`.

Studio y el renderer de escena de color resuelven el preset real de la librería, conservando
sus mapas de textura y la repetición a escala mundial (actualmente una baldosa por metro para
estos acabados). Los tonos representativos solo impulsan la coincidencia de color más cercano y el
glifo de límites 2D: `proceduralSlotColor` los usa para overrides de librería curados de modo que
un tinte de textura blanco no produzca un glifo blanco. Ante ausencia de overrides y de
selecciones Authorado se usa el hex de la receta; la resolución de color de otras librerías y
materiales de escena no cambia.

Glass sigue siendo azul `#87ceeb`, con transparencia habilitada, opacidad 0.3, con reflejos
Fresnel en el shading rendered. El hex de la receta no re-tiñe ese preset.
La apariencia de escena monocromática sigue usando el material de tema de furnishing. La opción
Authorado de Studio limpia un override de slot guardado (o almacena el hex en un borrador
no guardado), restaurando el material autorado opaco.

## Materiales de caras de mallas personalizadas

Los bloques usan el modelo reutilizable `MaterialRef` a través de slots de objeto estables con nombre de usuario. `BlockNode.slots` mapea los ids de slot a referencias `scene:` o `library:`, `slotNames` almacena sus etiquetas editables, y cada `BlockFace.materialSlot` almacena un id de slot. `body` es el slot base permanente y el respaldo para slots no vinculados o no resueltos.

El builder de geometría emite un grupo de Three.js por cara de topología y un arreglo de materiales ordenado por los ids de slot estables del nodo. Publica ese orden de materiales de render como `userData.slotIds` y registra el rango de vértices de cada cara en `geometry.userData.blockFaces`. La capacidad de pintura re-ejecuta el raycast sobre la malla y mapea el triángulo impactado a través de esos rangos a un id de cara de topología estable, de modo que la previsualización y el commit afecten solo esa cara. Las UV de las caras conservan el contrato de proyección a escala mundial siguiente.

El inspector de bloques llama a esta colección **Slots**. Los usuarios pueden renombrar slots, y la herramienta Paint cambia el material de un slot usando datablocks de material de escena reutilizables. Mientras una o más caras estén seleccionadas en modo de edición, hacer clic en un slot vincula esas caras a él inmediatamente; no hay una fila separada de botones Assign / Select / Deselect.

Agregar un slot con caras seleccionadas crea el slot, vincula esas caras a él y asigna un material de acento generado y distinto en la misma actualización de escena. Esto hace que la nueva superficie se vea visiblemente diferente tanto en modo de edición como en el modelo renderizado antes de que el usuario elija un material de pintura final. Sin caras seleccionadas, Add Slot es un no-op para que no pueda crear un slot invisible sin uso.

Eliminar un slot que no sea `body` re-mapea cada cara asignada a `body` en la misma actualización de nodo, y `body` se convierte en la fuente activa de asignación. El material reutilizable de escena o librería permanece disponible para otros nodos.

La herramienta global Paint resuelve el slot asignado a la cara impactada y cambia el vínculo de material de ese slot. Una malla nueva tiene cada cara asignada a `body`, así que su primera pintura actualiza toda la malla. Una vez que las caras están asignadas a slots con nombre, pintar cualquiera de esas caras actualiza cada cara que usa ese slot. Un material de una sola vez reutiliza un material de escena estructuralmente equivalente antes de crear un material de escena reutilizable. Borrar limpia el vínculo del slot; `body` vuelve al default del rol de pared y otros slots no vinculados caen en `body`.

Los operadores de topología conservan las asignaciones de forma determinista:

- las caras conservadas y transformadas mantienen su slot;
- las tapas/costados de extrusión y las tapas/anillos de inset heredan la cara de origen;
- las piezas de loop-cut heredan la cara que dividen;
- las bandas de bevel y la disolución de materiales mixtos usan la primera cara adyacente en el orden estable de `topology.faces`;
- eliminar la última cara que usa un slot no elimina su material reutilizable.

### Renderers de plugins externos

Los renderers de plugins siguen los mismos cuatro ejes a través de la superficie pública
`@pascal-app/viewer`. Para una jerarquía importada, captura sus materiales autorados una vez y aplica
este mapeo de forma reactiva:

| Estado del host | Material importado |
|---|---|
| Colored + Rendered | Material autorado |
| Colored + Solid | Variante Lambert en caché que conserva color, mapa de albedo, alfa y slots |
| Monochrome | `createSurfaceRoleMaterial(surfaceRole, colorPreset, side, sceneTheme)` |

El adaptador pertenece al renderer del plugin porque es dueño de la jerarquía y sabe
qué superficies son furnishing, glazing u otro rol. Los intercambios de material ocurren en
cambios de preferencias, nunca en `useFrame`. Restaura los materiales autorados antes de desechar
la jerarquía propiedad del loader, desecha solo las variantes propiedad del plugin y deja en paz
los materiales de rol en caché del host.

Los edges y el pipeline de render costoso no necesitan un hook de material de plugin: son
pasadas host en espacio de pantalla sobre `SCENE_LAYER`. Los fantasmas de colocación deben usar
la capa de overlay del editor para que permanezcan nítidos y no entren en los targets de
profundidad/normales de la escena.

## Temas de escena

Un `SceneTheme` (`lib/scene-themes.ts`) agrupa todo lo que define un "look":

| Campo | Impulsa |
|---|---|
| `appearance: 'light' \| 'dark'` | El chrome 2D de la escena — el backdrop del canvas, los colores de la rejilla, el contraste de las etiquetas de medición/cursor. (**No** hay un toggle separado de claro/oscuro; el tema es dueño de esto.) |
| `background` | El fondo 3D, mezclado en `post-processing.tsx` donde no hay geometría. |
| `ground` | El relleno del suelo del sitio (`nodes/site/renderer.tsx`) y el plano oclusor de suelo infinito (`viewer/ground-occluder.tsx`). Se mantiene separado de `background` para que los temas oscuros obtengan un suelo de tono medio iluminado en lugar de casi negro. |
| `lights` / `ambient` / `hemi` | El rig de luces (`lights.tsx`). Una luz clave proyecta sombras. |
| `toneMappingExposure` | Exposición del renderer. |
| `clayTints?` | Overrides de color por `SurfaceRole` superpuestos sobre `colorPreset` (ver [resolver un color](#resolver-un-color)). |

El chrome de la UI del editor es siempre oscuro (un `document.body.classList.add('dark')` fijo) y es independiente de `appearance`.

## Agregar un tema

Añade un `SceneTheme` a `SCENE_THEMES` con todos los campos obligatorios. `clayTints` es un `Partial` — cualquier rol que omitas cae al `colorPreset` activo. Los selectores de tema (toolbar + overlay de la comunidad) renderizan una muestra 2×2 de `clayTints` sobre `background`, así que puebla al menos `wall`/`roof`/`floor`/`glazing` para una buena muestra.

## Escala mundial de texturas (UV en metros)

Cada superficie procedimental genera UV en metros: 1 unidad de UV = 1 m.

Este contrato es compartido por wall `systems/wall/wall-system.tsx` (`ExtrudeGeometry`), slab `systems/slab/slab-system.tsx` (`generatePositiveSlabGeometry`, y `generatePoolGeometry`), ceiling `systems/ceiling/ceiling-system.tsx`, roof `systems/roof/roof-system.tsx`, y chimney/dormer `nodes/src/chimney/geometry.ts`.

Los slots de items GLB siguen la misma convención de autorado de ~1 unidad de UV/m, impuesta por la verificación de presencia de UV del validador de slots y por la receta de Blender en [item-authoring](item-authoring.md). Este es un requisito de autorado, no una corrección en tiempo de render.

Por lo tanto, el `repeat` de un material de catálogo (`mapProperties.repeatX/repeatY` en `packages/core/src/material-library.ts`) es un ajuste de escala mundial por material: baldosas por metro.

`repeat: 1` significa 1 baldosa/m, `0.4` significa una baldosa cada 2.5 m, y `1.5` significa 1.5 baldosas/m.

Repeat es una propiedad del material, idéntica para cada superficie que lo usa, nunca por item ni por superficie. Los valores de repeat personalizados son escala de material intencional, no hacks por superficie.