# Capas de Three.js

*Convenciones de capas de Three.js: en qué capa vive cada tipo de objeto y por qué.*

Aplica a: `packages/viewer/**`, `apps/editor/**`.

Las `Layers` de Three.js controlan qué objetos ve cada cámara y cada pase de renderizado. Las usamos para separar la geometría de la escena, las ayudas del editor y los overlays de zonas en distintos contenedores de renderizado sin duplicar la estructura de la escena.

## Mapa de capas

| Constante | Valor | Paquete | Propósito |
|---|---|---|---|
| `SCENE_LAYER` | `0` | `@pascal-app/viewer` | Capa predeterminada de Three.js — toda la geometría regular de la escena |
| `OVERLAY_LAYER` | `1` | `@pascal-app/viewer` | Overlays del editor: gizmos, manijas de movimiento, vistas previas de herramientas, mallas del cursor, guías de snapping. Compuesta al frente en su propio pase. |
| `ZONE_LAYER` | `2` | `@pascal-app/viewer` | Rellenos de piso de zonas y bordes de muros — compuestos en un pase de post-procesamiento separado |
| `GRID_LAYER` | `3` | `@pascal-app/viewer` | La cuadrícula del terreno del editor — renderizada *dentro* del pase de escena para una oclusión de profundidad correcta |
| `SHADOW_ONLY_LAYER` | `4` | `@pascal-app/viewer` | Geometría solo-emisora-de-sombras: techos/niveles ocultos en vistas recortadas (cutaway) o solitarias (solo). Ninguna cámara de color ni pase la habilita — solo la cámara de sombras del sol (`lights.tsx`), de modo que la geometría siga proyectando sombras en interiores. Se aplica por objeto vía `lib/shadow-only.ts` (`applyShadowOnly`/`clearShadowOnly`). |
| `BATCHED_LAYER` | `5` | `@pascal-app/viewer` | Geometría de origen ya representada por un lote (batch) colectivo. Ninguna cámara de render la habilita; los raycasters de superficie se suscriben mediante `setSurfaceRaycastLayers`. |

`apps/editor` expone `EDITOR_LAYER` para las mallas de ayuda del editor; **re-exporta** `OVERLAY_LAYER` (`EDITOR_LAYER === OVERLAY_LAYER`) de modo que el editor se mantenga desacoplado de la numeración de pases del viewer mientras aterriza en la misma capa.

```ts
// En código del viewer
import { SCENE_LAYER, OVERLAY_LAYER, ZONE_LAYER, GRID_LAYER } from '@pascal-app/viewer'

// En código del editor (alias de OVERLAY_LAYER)
import { EDITOR_LAYER } from '@/lib/constants'
```

## Por qué separar las zonas en la capa 2

Las zonas usan materiales semitransparentes con `depthTest: false` que deben componerse *por encima de* la escena sin alimentar a SSGI ni a TRAA. El pipeline de post-procesamiento en `post-processing.tsx` renderiza un `zonePass` dedicado con una máscara `Layers` que habilita solo `ZONE_LAYER` (y deshabilita `SCENE_LAYER`), y luego mezcla su salida en el compuesto final manualmente:

```ts
const zoneLayers = useMemo(() => {
  const l = new Layers()
  l.enable(ZONE_LAYER)
  l.disable(SCENE_LAYER)
  return l
}, [])

zonePass.setLayers(zoneLayers)
```

Esto mantiene las zonas fuera de los buffers de profundidad/normales de SSGI (que producirían un AO incorrecto en superficies transparentes) a la vez que les permite aparecer correctamente sobre la escena.

## Por qué separar los overlays en la capa 1 (`OVERLAY_LAYER`)

Los gizmos, manijas de movimiento y vistas previas de herramientas deben leerse como UI nítida — nunca entintados por el pase de bordes (edges) en espacio de pantalla ni oscurecidos por SSGI/AO. El pase de escena renderiza solo `SCENE_LAYER` (+ `GRID_LAYER`, abajo), de modo que los overlays queden fuera de su MRT de profundidad/normales. Un `overlayPass` dedicado renderiza entonces solo `OVERLAY_LAYER` y se compone al frente después del tinte y los contornos de selección:

```ts
const overlayPass = pass(scene, camera)
overlayPass.setLayers(overlayLayers) // solo OVERLAY_LAYER
// …compuesto al final, con compuerta de profundidad contra la profundidad de la escena
// de modo que los overlays que escriben profundidad sigan ocluidos por la geometría al frente.
```

La cámara del editor habilita `OVERLAY_LAYER`; el generador de miniaturas la deshabilita para que las exportaciones salgan limpias.

## Por qué la cuadrícula está en su propia capa 3 (`GRID_LAYER`)

La cuadrícula del terreno es un plano plano que no escribe profundidad y que debe estar **ocluido por muros/objetos** — lo que solo funciona si comparte el buffer de profundidad de la escena. Así que, a diferencia de otros overlays, se renderiza *dentro* del pase de escena (`scenePass` habilita `SCENE_LAYER` + `GRID_LAYER`), no en el pase de overlays. Al ser plana, nunca dispara el entintado en espacio de pantalla. La cámara de miniaturas también deshabilita `GRID_LAYER`, para que quede fuera de las exportaciones.

## Por qué las fuentes agrupadas (batched) pasan a la capa 5 (`BATCHED_LAYER`)

Un renderer colectivo puede dibujar muchos nodos semánticos a través de una sola malla fusionada mientras sus objetos originales permanecen montados para la selección, los hijos alojados (hosted) y las consultas de superficie. Mover esos objetos de origen de `SCENE_LAYER` a `BATCHED_LAYER` evita envíos de color y sombras duplicados sin quitarlos del grafo de escena.

Las cámaras de render normales no habilitan `BATCHED_LAYER`. Los raycasters que necesitan la superficie modelada original — mediciones y consultas geométricas similares — llaman a `setSurfaceRaycastLayers`, que habilita tanto `SCENE_LAYER` como `BATCHED_LAYER`. El picking de puntero genérico sigue ignorando la geometría fuente oculta e interactúa a través de los proxies y children conservados del nodo.

## Reglas

- **Nunca codifiques números de capa.** Usa siempre las constantes con nombre.
- **Todas las constantes de capa pertenecen a `@pascal-app/viewer`** — son asuntos del renderer. El `EDITOR_LAYER` de `apps/editor` es un alias re-exportado de `OVERLAY_LAYER`.
- **Las mallas de zonas deben definir `layers={ZONE_LAYER}`** para que las recoja `zonePass` y queden excluidas de los buffers de profundidad de `scenePass`.
- **Las mallas de overlay/ayuda deben definir `layers={EDITOR_LAYER}`** (= `OVERLAY_LAYER`) para que rendericen al frente, permanezcan fuera de los buffers de entintado/SSGI y sean invisibles para la cámara de miniaturas.
- **La cuadrícula usa `GRID_LAYER`**, no la capa de overlays, porque necesita oclusión por profundidad de escena.
- **Los renderers colectivos mueven la geometría de origen a `BATCHED_LAYER`** y deben restaurarla a través del propietario compartido de visibilidad de escena cuando el lote la libera.
- **Los raycasters de superficie usan `setSurfaceRaycastLayers`** en lugar de codificar una máscara de capas, de modo que las superficies modeladas sigan siendo consultables ya sea que las dibuje su malla de origen o un lote colectivo.
- **No agregues capas nuevas sin actualizar esta página** y el pipeline de post-procesamiento en consecuencia.