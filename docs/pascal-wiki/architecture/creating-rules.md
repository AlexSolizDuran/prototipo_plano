# Crear páginas de arquitectura

*Cómo agregar o actualizar una página en `wiki/architecture/`.*

Las páginas en `wiki/architecture/` son la fuente canónica de las reglas arquitectónicas. Los agentes de IA (Claude, Codex, Cursor, Gemini) las leen a demanda vía `AGENTS.md`.

## Flujo de trabajo

1. Elige un tema enfocado (un concepto por página — layers, events, registry, …).
2. Crea `wiki/architecture/<slug>.md`. Los slugs son cortos, en kebab-case.
3. Agrega una entrada a `wiki/architecture/README.md` para que la nueva página sea descubrible.
4. Si la página debe leerse para revisiones de PR, enlázala desde `.agents/skills/review-architecture/SKILL.md`.

## Formato de la página

```markdown
# Título de la página

*Descripción en una línea, en cursiva, de lo que cubre esta página.*

Aplica a: `path/glob/**`.

Breve párrafo de introducción.

## Sección

Orientación concreta con ejemplos de código y reglas.
```

La descripción en cursiva y la línea `Aplica a:` reemplazan el frontmatter antiguo de Cursor — son markdown plano para que todo agente las vea.

## Buenas prácticas

- Mantén una página enfocada en un solo concepto. Divídela si crece más allá de ~500 líneas.
- Encabeza con la regla, sigue con el ejemplo. Muestra la forma correcta antes de listar prohibiciones.
- Referencia archivos fuente reales con una ruta entre acentos graves (p. ej. `packages/core/src/schema/base.ts`).
- Agrega una página nueva cuando el mismo error se haya cometido dos veces — no de forma preventiva.
- Nunca dupliques contenido entre páginas. Enlaza en su lugar.

## Páginas existentes

Consulta `wiki/architecture/README.md` para el índice actual.