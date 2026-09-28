# Aislamiento del visor

*El visor debe ser agnóstico al editor — se controla desde fuera mediante props e hijos (children).*

Se aplica a: `packages/viewer/**`.

`@pascal-app/viewer` es una librería de lienzo 3D independiente. Nunca debe conocer características específicas del editor, estado de UI ni herramientas. Esto la mantiene utilizable en la ruta de solo lectura `/viewer/[id]` y en cualquier contexto de incrustación futuro.

## La regla

> El visor se controla desde fuera. Expone puntos de control (props, callbacks, children). Nunca se inmiscuye en `apps/editor`.

## Prohibido en `packages/viewer`

```ts
// ❌ Never import from the editor app
import { useEditor } from '@/store/use-editor'
import { ToolManager } from '@/components/tools/tool-manager'

// ❌ Never reference editor-specific concepts
if (isEditorMode) { … }
```

## Patrón correcto — pase el control desde fuera

El editor monta el visor y le pasa lo que necesita:

```tsx
// apps/editor/components/editor-canvas.tsx  ✅
import { Viewer } from '@pascal-app/viewer'
import { ToolManager } from '../tools/tool-manager'
import { useEditor } from '../../store/use-editor'

export function EditorCanvas() {
  const { selection } = useViewer()

  return (
    <Viewer
      theme="light"
      onSelect={(id) => useViewer.getState().setSelection(id)}
      onExport={handleExport}
    >
      {/* Editor injects tools as children — viewer renders them inside the canvas */}
      <ToolManager />
    </Viewer>
  )
}
```

El visor acepta `children` y los renderiza dentro del lienzo R3F. Este es el punto de extensión para herramientas, superposiciones (overlays) y sistemas específicos del editor.

## Estado propio del visor (`useViewer`)

El store del visor contiene **solo estado de presentación**:

- `selection` — qué nodos están resaltados
- `cameraMode` — perspectiva / ortográfico
- `levelMode` — apilado / explosionado / solo / manual
- `wallMode` — arriba / corte / abajo
- `theme` — claro / oscuro
- Conmutadores de visualización: `showScans`, `showGuides`, `showGrid`

Si un estado solo tiene sentido dentro del editor (p. ej. herramienta activa, fase, modo de edición) — pertenece a `useEditor`, no a `useViewer`.

## Visor anidado para características específicas del editor

Cuando una característica del editor necesita vivir «dentro» del lienzo pero no debe contaminar el paquete del visor, inyéctela como un hijo (child):

```tsx
// ✅ Editor-specific overlay injected as child
<Viewer>
  <SelectionBoxOverlay />   {/* editor only */}
  <SnapIndicator />         {/* editor only */}
  <ToolManager />           {/* editor only */}
</Viewer>
```

Este patrón permite que el visor permanezca ignorante de estos componentes mientras ellos siguen teniendo acceso al contexto R3F.

## Contribuciones de presentación de plugins

El contenido de plugins solo de presentación usa el registro propiedad del visor en lugar de
una ranura de escena específica de una ruta. El manifiesto `Plugin` de core permanece
agnóstico al renderizado: el anfitrión registra una contribución separada durante el arranque
(bootstrap) y monta el registro una vez dentro de cada visor que deba mostrar presentación.

```tsx
import {
  registerViewerPresentation,
  Viewer,
  ViewerPresentations,
  type ViewerPresentationContribution,
} from '@pascal-app/viewer'

const presentation: ViewerPresentationContribution = {
  id: 'acme:landscape:presentation',
  pluginId: 'acme:landscape',
  component: () => import('./presentation'),
}

registerViewerPresentation(presentation)

<Viewer>
  <ViewerPresentations />
</Viewer>
```

`ViewerPresentations` filtra `pluginId` a través de los
`installedPlugins` del proyecto actual. Desinstalar un plugin, por lo tanto, desmonta su contribución;
reinstalarlo la vuelve a montar sin quitar en caliente (hot-remove) el código de la sesión ni las
definiciones de nodos. Cada contribución perezosa (lazy) tiene su propio Suspense y su propio error boundary,
de modo que un plugin fallido no derriba la escena de autoría ni a sus hermanos.

El montaje es un hermano de `scene-renderer`, nunca un descendiente suyo. No
debe crear nodos semánticos, objetivos de selección, entradas de historial ni resultados
de consultas. La exportación del modelo de autoría sigue teniendo su raíz en `scene-renderer`. Una presentación
registrada puede además proporcionar un constructor (builder) de `staticExport`: GLB y USDZ
incluyen esa contribución solo cuando se selecciona explícitamente. El constructor deriva de
sus entradas una geometría finita, propiedad de la exportación, en lugar de clonar la visibilidad
dependiente de cámara o el LOD de la presentación en vivo.

Los incrustadores crudos de `<Viewer>` optan a la presentación registrada montando
`<ViewerPresentations />`; la inclusión en la instantánea sigue siendo una política explícita del anfitrión.
El `<Editor>` reutilizable ya lo monta en sus composiciones normal y de vista previa.

El registro no persiste la configuración del plugin. Un plugin que expone
exportación/importación de configuración versionada aún necesita que su anfitrión almacene ese valor
en un sidecar del proyecto y lo restaure antes o después de que el visor se monte.

Los constructores estáticos reciben una instantánea completa de nodos semánticos, una configuración
separada capturada cuando comienza la exportación, y filtros de visibilidad/tipo de salida.
Devuelven una raíz separada en espacio mundial sin crear nodos de escena ni historial.
La geometría, los materiales y las texturas devueltos pertenecen al artefacto. Los manejadores de
textura de presentación cacheados deben marcarse con
`markViewerPresentationTextureBorrowed`; el anfitrión clona esos manejadores antes de
fijar la contribución y nunca desecha la fuente prestada.

## Lista de verificación antes de agregar código a `packages/viewer`

- [ ] ¿Esta característica tiene sentido en la ruta de visor de solo lectura?
- [ ] ¿Hace referencia a `useEditor`, al estado de herramientas, o a fase/modo?
- [ ] ¿Podría pasarse como prop o como hijo en su lugar?

Si alguna respuesta es «específica del editor», manténgala en `apps/editor` e inyéctela mediante children o props.