# Arquitectura

Reglas canónicas para el código que toca `packages/core`, `packages/viewer`, `packages/editor`, `packages/mcp` o `apps/editor`. Se leen a demanda desde `AGENTS.md` y desde `.agents/skills/review-architecture/SKILL.md`.

## Páginas

| Página | Cubre |
|---|---|
| [layers](layers.md) | Constantes de capas de Three.js, propiedad y separación de renderizado |
| [systems](systems.md) | Arquitectura de los sistemas de core y viewer |
| [renderers](renderers.md) | Patrón de renderizador de nodos en `packages/viewer` |
| [node-definitions](node-definitions.md) | Modelo de composición de tres casillas para los tipos (kinds) impulsados por registro (`geometry` / `renderer` / `system`) |
| [materials-and-themes](materials-and-themes.md) | Color de superficie: roles de superficie, presets de color, el eje de texturas y los temas de escena (apariencia / terreno / tintes de arcilla) |
| [item-authoring](item-authoring.md) | Contrato de autor de contenido para los GLB de elementos del catálogo: nomenclatura de materiales `slot_`, valores predeterminados de autoría + extras de `pascal_material`, la malla reservada `cutout`, la escala mundial UV y la receta validada de Blender/exportación |
| [plugin-authoring](plugin-authoring.md) | Contrato público para plugins externos: forma de `Plugin`, `setPluginDiscovery`, ciclo de vida, qué entra y qué queda fuera de v1 |
| [tools](tools.md) | Estructura de las herramientas del editor, paridad de comportamiento 2D↔3D, restricciones de manipulación y valores predeterminados de anulación (bypass) con Shift |
| [measurements](measurements.md) | Datos de medición persistentes, propiedad de bocetos 2D/3D, snapping, unidades y visibilidad |
| [interaction-scope](interaction-scope.md) | La máquina de estados de interacción autoritativa ("la espina dorsal"): unión de `InteractionScope`, el contrato begin/update/end/endIf, el conjunto caliente (hot-set) de raycast y la matriz de alcance de overlays |
| [viewer-isolation](viewer-isolation.md) | Mantener `@pascal-app/viewer` agnóstico al editor |
| [capture-runtime](capture-runtime.md) | Protocolo de captura abierto, límite del host de origen, capas de viewer estáticas/en vivo y extensión de stream |
| [selection-managers](selection-managers.md) | Selección de dos capas (viewer + editor), eventos, outliner |
| [selection-groups](selection-groups.md) | Grupos de multi-selección de sesión (Ctrl/Cmd+G), expandir al hacer clic, cómo difieren de las colecciones |
| [scene-registry](scene-registry.md) | Mapa global ID de nodo → Object3D y `useRegistry` |
| [spatial-queries](spatial-queries.md) | Validación de colocación (`canPlaceOnFloor`/`Wall`/`Ceiling`) para herramientas |
| [node-schemas](node-schemas.md) | Patrón de esquema Zod para tipos de nodos, `createNode`, `updateNode` |
| [inspector-field-limits](inspector-field-limits.md) | Cuándo un campo numérico del inspector puede y no puede tener `min`/`max` — sin límites arbitrarios en las dimensiones |
| [vertical-model](vertical-model.md) | Alturas de nivel almacenadas, topes de muros/cielos limitados por plano, colocación y grosor de losas, hosts de soporte, reglas de clamp y la migración de carga |
| [space-detection](space-detection.md) | Contrato de commit y replicación para la reconciliación de habitaciones impulsada por muros |
| [events](events.md) | Bus de eventos tipado: emitir y escuchar eventos de nodos y de la cuadrícula |
| [creating-rules](creating-rules.md) | Cómo agregar o actualizar una página en esta carpeta |

## Orden de lectura para una revisión de arquitectura

1. [layers](layers.md), [systems](systems.md), [renderers](renderers.md), [tools](tools.md), [viewer-isolation](viewer-isolation.md) — requeridos en cada revisión.
   - Cuando el diff toca colocación / mover / manija / remodelar / selección por caja / pintura o cualquier comportamiento de overlays o picking, lee también [interaction-scope](interaction-scope.md).
2. El resto de páginas a demanda, según lo que toque el diff.