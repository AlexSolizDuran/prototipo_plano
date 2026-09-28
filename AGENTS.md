<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Traducción ES + parches de `node_modules`

La interfaz del editor (`@pascal-app/editor`, `@pascal-app/nodes`, `@pascal-app/core`)
viene como paquetes de npm con los textos en inglés incrustados en el código.
`src/app/editor/page.tsx` tiene ~127 líneas y solo monta `<Editor />`; todo el resto
(188 componentes, ~5000 líneas de paneles) vive en `node_modules`.

### Las dos piezas

```
src/i18n/es/*.ts   →  el DICCIONARIO (997 claves). Git normal, se edita libre.
patches/*.patch    →  el ENCHUFE. Conecta el editor al diccionario.
```

Los parches contienen: (a) la reescritura de `import` para que los controles
pasen por el envoltorio, (b) la inyección de llamadas `ts("...")` en strings
que no pasan por un control envuelto (inyectadas por `scripts/traducir.mjs`)
y (c) las dos eliminaciones de UI de abajo. Las **traducciones en sí** (las
palabras en español) viven solo en el diccionario; el parche solo coloca
`ts(...)` alrededor del texto inglés.

### Dónde va cada tipo de cambio

| Cambio | ¿Toca parches? |
|---|---|
| Agregar/cambiar/quitar una palabra | **No** — `src/i18n/es/*.ts` |
| Quitar/ocultar algo dentro de un panel o toolbar | **Sí** |
| Cambiar la estructura de un panel | **Sí** |

Al tocar parches, **avisar al usuario antes** y acordarlo. Casi siempre es solo
actualizar los mismos 3 archivos (no se acumulan).

### `src/i18n/`

- `es/{comun,paneles,menus,inspector,tipos,materiales}.ts` — diccionarios por área.
  La clave es el **texto inglés original** (p. ej. `"Wall surface": "Superficie de muros"`).
  Si falta una clave, `t()`/`ts()` devuelve el original: no rompe nada.
- `editorial.tsx` —involucra 7 controles (`PanelWrapper`, `PanelSection`, `ActionButton`,
  `SliderControl`, `MetricControl`, `ToggleControl`, `SegmentedControl`) y hace
  `export * from "@pascal-app/editor"` para el resto. Traduce **solo props de
  presentación** (`title`, `label`); nunca valores internos (`value`, `trimKey`, `onChange`).
- `index.ts` — combina los diccionarios y expone `t()` / `ts()` / `tieneTraduccion()`.

Regla de oro: para reescribir un panel, **cambiar solo la línea del import** de
`'@pascal-app/editor'` a `'@/i18n/editorial'`. Eso basta para que todo el texto
de ese panel pase por el diccionario.

`next.config.ts` ya incluye core/editor/nodes/viewer en `transpilePackages`, y el
alias `@/*` viene de `tsconfig.json`. Sin eso los imports desde `node_modules` fallan.

### Eliminaciones de UI (viven en los parches)

1. **Panel `Plugins`** (botón `+` del sidebar) — `editor/.../use-plugin-panels.tsx`
   fuerza `const manager: ExtraPanel[] = []`.
2. **`Skirting` y `Crown molding`** — `nodes/dist/wall/panel.js`. Se conserva
   `Chair rail`. Las traducciones de los dos siguen en `paneles.ts` a propósito.

No tocar otras secciones de `ActionMenu` sin que el usuario lo pida.

### Regenerar los parches — OJO con este entorno

`npx patch-package` **falla aquí**: el entorno bloquea la descarga de tarballs
remotos (`npm error EALLOWREMOTE`), que es justo lo que usa para reinstalar el
paquete y calcular el diff. Generar los parches a mano:

```bash
WORK=/tmp/patchgen2
rm -rf $WORK && mkdir -p $WORK/node_modules/@pascal-app && cd $WORK
git init -q . && git config user.email p@l && git config user.name p

# 1. base prístina (instalación normal por nombre, NO por URL .tgz)
mkdir -p /tmp/pristine && cd /tmp/pristine
printf '{"name":"p","version":"1.0.0","dependencies":{"@pascal-app/core":"0.9.2","@pascal-app/editor":"0.9.2","@pascal-app/nodes":"0.1.1"}}' > package.json
npm i --force

# 2. commitear la base, excluyendo node_modules anidados (si no, hay ruido)
cd $WORK
for p in core editor nodes; do
  mkdir -p node_modules/@pascal-app/$p
  ( cd /tmp/pristine/node_modules/@pascal-app/$p && tar cf - --exclude=node_modules --exclude=.bin . ) \
    | ( cd node_modules/@pascal-app/$p && tar xf - )
done
git add -A && git commit -qm base

# 3. un parche por paquete
copiar() { ( cd "$1" && tar cf - --exclude=node_modules --exclude=.bin . ) | ( cd "$2" && tar xf - ); }
for p in core editor nodes; do
  git reset -q; git checkout -q -- .; git clean -qfd
  rm -rf node_modules/@pascal-app/$p; mkdir -p node_modules/@pascal-app/$p
  copiar "$PWD/node_modules/@pascal-app/$p" "node_modules/@pascal-app/$p"
  git add -A
  git diff --cached --no-color --binary > patches/@pascal-app+$p+<version>.patch
done
```

`--exclude=node_modules` es obligatorio: los `node_modules` anidados de cada paquete
producen diffs espurios (`.bin`, `nanoid`).

**Fallback offline (probado el 2026-09-28):** si `npm i --force` o `patch-package`
fallan por bloqueo de red, el prístino se reconstruye invirtiendo los parches viejos
sobre el snapshot guardado en `/tmp/proto-snapshot/{core,editor,nodes}`:

```bash
WORK=/tmp/patchgen2 && cd $WORK
# base = reverse-apply de cada patch viejo sobre el snapshot
for p in core editor nodes; do cp -r /tmp/proto-snapshot/$p node_modules/@pascal-app/$p; done
# patch viejo según su nombre real (core/editor → 0.9.2, nodes → 0.1.1)
git apply -R -p1 <ruta>/patches/@pascal-app+$p+0.9.2.patch   (...)
git add -A && git commit -qm base   # luego el punto 3 de arriba
```

Verificación alternativa a patch-package (envíos de red bloqueados):

```bash
cd $WORK
git reset -q; git checkout -q -- .; git clean -qfd
git apply -p1 <repo>/patches/@pascal-app+core+0.9.2.patch
git apply -p1 <repo>/patches/@pascal-app+editor+0.9.2.patch
git apply -p1 <repo>/patches/@pascal-app+nodes+0.1.1.patch
# comparar árbol por contenido (md5 por archivo) contra node_modules del repo
```

**Siempre verificar así antes de dar por terminado:**

```bash
# revertir los 3 paquetes a prístino, aplicar parches, y comprobar
npx patch-package          # debe imprimir los 3 con ✔
npm run build              # debe compilar
npx tsc --noEmit           # debe estar limpio
node scripts/barrer.mjs    # debe acabar con "No queda texto visible sin traducir. OK." (exit 0)
```

Tamaños esperados hoy: `core` 2 archivos, `editor` 55, `nodes` 39.

### Scripts

- `scripts/traducir.mjs` — inyecta `ts("...")` y el `import` necesario: barre todo
  `editor/src` (excluye tests/demos), los `.js` de `nodes/dist` que importan
  `@pascal-app/editor`/`@/i18n/editorial` (`children`, `label`, `title`, …) y
  `core/dist/material-library.js`. Idempotente. Compara las claves **desescapando**
  `\u2026`/`\xNN` que deja el compilador. No toca valores internos.
- `scripts/barrer.mjs` — semáforo: `cubierta` / `dict` (falta clave) / `crudo`
  (texto sin envolver, requiere parche) / `ignorado`. `--json` para CI. Salida 0 = OK.

Al agregar una palabra nueva al diccionario, re-correr `node scripts/traducir.mjs`
y regenerar los 3 parches con el método de arriba. El caso especial
`children: option.label` (grilla de tipos de `window/panel.js`) se parchea a mano.

### Verificar que no quedó inglés

```bash
npm run build && npx tsc --noEmit && node scripts/barrer.mjs
```

`barrer.mjs` reemplazó al barrido manual: clasifica los hallazgos y solo reclama
los que faltan. Los 48 materiales del catálogo quedan en inglés a propósito, al
igual que `XYZ`, `+45°` y las siglas (DWV, R/T).

### Pendiente / no decidido

- **48 materiales de catálogo** quedaron en inglés a propósito (`R-19 Insulation`,
  `C-3 Concrete`…); solo se tradujeron los 66 descriptivos.
- **Paleta y tipografía** del tema visual: sin definir.
- **IA**: implementado el lado de **lectura** (`src/lib/ai/`, tab "IA" en el editor):
  proyección en vivo `pascal.plan.v1` (árbol site → buildings → levels → elements,
  puertas/ventanas incrustadas en muros con `u`, redondeo a 3 decimales, catálogo de
  ítems). No toca parches. Falta el lado de **escritura** (aplicar diffs del modelo
  sobre el scene) y decidir persistencia/colaboración.
- **Costeo**: utilidades geométricas pero faltan precios y cantidades.
