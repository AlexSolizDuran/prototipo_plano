# Grupos de selección

*Grupos de multiselección de sesión (Ctrl/Cmd+G) frente a colecciones y futuros grupos persistentes.*

Se aplica a: `packages/editor/src/lib/session-groups.ts`, `packages/editor/src/store/use-session-groups.ts`, la UI de multiselección bajo `packages/editor/src/components/ui/panels/` y los menús flotantes, y la expansión de selección en `packages/editor/src/lib/selection-routing.ts` y `packages/editor/src/components/editor/floorplan-background-selection.ts`.

## Qué es esto

**Grupos de selección de sesión**, solo del editor. Recuerdan un conjunto de multiselección para que un clic simple en cualquier miembro vuelva a seleccionar todo el conjunto. **No** son nodos del grafo de escena y **no** se escriben en el JSON del proyecto.

| Atajo | Comportamiento |
|---|---|
| Ctrl/Cmd+G | Crea un grupo de sesión desde 2+ nodos seleccionados. Etiqueta automática `Group N`. |
| Ctrl/Cmd+Shift+G | Disuelve los grupos de sesión que intersectan la selección. La selección se conserva. |
| Alt+clic | Selecciona un solo miembro sin expandir. |

También disponibles como iconos de **Agrupar (Group) / Desagrupar (Ungroup)** en la píldora flotante de multiselección (Mover · Agrupar · Copiar · Eliminar) y en el panel derecho de multiselección.

## La membresía nunca se poda

Eliminar un miembro **no** reescribe la membresía almacenada. Cada lectura se reduce a
la escena en vivo en su lugar (`liveSessionGroups`, `expandSessionGroupMembers`), y un grupo
con menos de dos miembros en vivo es inerte en lugar de eliminarse.

Esto es lo que hace funcionar eliminar + deshacer: una poda destructiva sacaría al nodo
eliminado del grupo, y eliminaría el grupo por completo una vez que cayera bajo el mínimo de
dos miembros — sin retorno, porque los grupos de sesión no están en el historial de deshacer. También
significa que ninguna vía de eliminación necesita un hook; `deleteNodes` tiene varios llamadores y el
filtrado en tiempo de lectura los cubre a todos.

El almacenamiento solo se limpia por completo, mediante `clearGroups()`, al cargar la escena y al entrar
en la vista previa de versión, donde los ids de los nodos cambian por completo.

## Grupos de sesión frente a colecciones

`packages/core` también tiene **colecciones** (`schema/collections.ts`): conjuntos nombrados, coloreados y
persistidos de ids de nodos, gestionados desde el popover *Gestionar colecciones…* del inspector de objetos. Se superponen
con los grupos de sesión pero responden a una pregunta distinta:

| | Grupo de sesión | Colección |
|---|---|---|
| Persistido | No | Sí (JSON del proyecto) |
| Creado por | Ctrl/Cmd+G sobre una selección | Nombrado explícitamente en el inspector |
| Clic en un miembro | Vuelve a seleccionar todo el conjunto | Sin comportamiento de selección |
| Duración | Hasta recargar | Hasta eliminarlo |
| Capa | `packages/editor` | `packages/core` |

Use un grupo de sesión para el caso desechable de «mantener estas seis sillas juntas mientras
ordeno esta habitación», y una colección para etiquetar un conjunto al que volverá. Están
deliberadamente no respaldados por el mismo store: darle persistencia a Ctrl+G metería
un `Group 4` sin nombre en el proyecto guardado de todos con una pulsación accidental.

Si las colecciones alguna vez ganan el clic-para-expandir, esta división debería revisarse — eso
las convertiría en un superconjunto estricto, y los grupos de sesión podrían volverse la capa no
guardada de un solo concepto en lugar de un segundo concepto.

## Reglas de capas

| Capa | Grupos de sesión |
|---|---|
| `packages/core` | No |
| `packages/viewer` | No |
| `packages/editor` | Sí (store, expansión de selección, menús, teclado) |
| `packages/mcp` | No |

## Opciones futuras (no en este PR)

- **Grupos persistentes en el grafo de escena** — un padre/`groupId` reales en la escena, guardar/cargar.
- **Disposiciones de habitaciones guardadas** — presets de mobiliario reutilizables / colocaciones del catálogo.

## Relacionados

- [administradores de selección](selection-managers.md) — modificadores de multiselección
- [herramientas](tools.md) — paridad 2D ↔ 3D de mover/rotar en multiselección