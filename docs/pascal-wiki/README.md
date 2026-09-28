# Wiki de arquitectura — Pascal Editor (en español)

Documentación de arquitectura del motor **Pascal Editor** (paquetes npm `@pascal-app/core`, `@pascal-app/viewer`, `@pascal-app/editor`, `@pascal-app/nodes`), traducida del repositorio `pascalorg/editor` (`wiki/architecture`).

## Orden de lectura recomendado

Para entender el código, el propio repo recomienda empezar por:

1. `layers.md` — convenciones de capas Three.js
2. `systems.md` — arquitectura de sistemas (core y viewer)
3. `renderers.md` — patrón de renderers de nodos
4. `tools.md` — herramientas del editor y paridad 2D/3D
5. `viewer-isolation.md` — por qué `@pascal-app/viewer` es agnóstico del editor
6. `interaction-scope.md` — máquina de estados de interacción (alcance, raycasts, overlays)

Si un cambio toca colocación/movimiento/manijas/remodelado/selección por marquesina o pintura, leer también `interaction-scope.md`.

El resto se lee bajo demanda según lo que se toque:

| Página | Cubre |
|---|---|
| `node-schemas.md` | Schemas Zod de nodos, evolución y compatibilidad |
| `node-definitions.md` | Definición de tipos (kinds), geometría, registro |
| `scene-registry.md` | Registro node-ID → objetos Three.js |
| `events.md` | Bus de eventos |
| `space-detection.md` | Detección de espacios (habitaciones) |
| `spatial-queries.md` | Validación de colocación (canPlaceOnFloor/Wall/Ceiling) |
| `selection-managers.md` | Selección en dos capas (viewer + editor), outsiner |
| `selection-groups.md` | Grupos de selección |
| `vertical-model.md` | Alturas de niveles, muros top/solo plano, losas, restricciones |
| `materials-and-themes.md` | Materiales y temas |
| `measurements.md` | Mediciones y rendering de medidas |
| `item-authoring.md` | Autoría de ítems del catálogo |
| `plugin-authoring.md` | Cómo escribir un plugin (node kinds, paneles) |
| `capture-runtime.md` | Runtime de captura (escaneos 3D) |
| `inspector-field-limits.md` | Límites de campos del inspector |
| `creating-rules.md` | Reglas de creación/contribución |

## Nota

- Los bloques de código, rutas, identificadores y nombres de tipo se mantuvieron **en inglés** (idénticos al original) para que sean busables en el código real.
- Traducción: español neutro, según `wiki/architecture` del repo `pascalorg/editor` (licencia del original aplica).