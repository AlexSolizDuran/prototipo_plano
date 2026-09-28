# Límites de los campos del inspector

*Cuándo un campo numérico del inspector puede y no puede tener `min`/`max`.*

Aplica a: `packages/nodes/src/**/parametrics.ts`, `packages/nodes/src/**/panel.tsx` y cualquier uso de `<SliderControl>`.

`SliderControl` es una entrada numérica arrastrable, no un slider de rango: arrastrar aplica un delta basado en pasos (`dx/4 × step`), y la rueda/las teclas de flecha dan pasos de igual manera. `min`/`max` no juegan ningún papel en la interacción — son puros clamps, con default a ±Infinity, y un valor escrito más allá de ellos se limita **silenciosamente**. Un `max` por lo tanto nunca "suaviza" nada; solo bloquea a los usuarios, y el bloqueo se lee como "la app me ignoró". Barrido de 2026-08: todos los máximos arbitrarios fueron eliminados (PR del editor para `chore/field-limit-sweep`).

## Reglas

- **Nunca limites una dimensión física en su tamaño "típico".** La longitud de una pared no es 20 m, los paños de techo no son 25 m. Para campos de dimensión (width / height / depth / length / span / thickness / spacing / diameter en metros) usa `max: 1000` — un valor que nadie alcanza legítimamente pero que aún así atrapa un número pegado o pulsado por error antes de que produzca geometría degenerada (grid espacial, sombras, bake). Si incluso un error de tipeo es inofensivo (ver posiciones abajo), omite `max` por completo.
- **Las posiciones y offsets no reciben límites estáticos.** Omite `min`/`max`. Nunca alimentes una ventana de arrastre (`value ± N`) en `min`/`max` — eso convierte una conveniencia de UI en un clamp oculto sobre la entrada escrita.
- **Los mins son solo de validez.** Las dimensiones necesitan un piso positivo pequeño (típicamente 0.01–0.1 m) para que la geometría cero/negativa no pueda existir. Un min nunca debe codificar lo "típico" (el antiguo `min: 1.5` de pared bloqueaba parapetos y muros de jardín).
- **Los límites geométricos dinámicos son bienvenidos.** Los límites derivados del nodo o de su host codifican validez real y se mantienen: ancho de puerta ≤ pared anfitriona (`maxDoorWidth`), la flecha de la curva (sagitta) ≤ la cuerda, las posiciones de accesorios de techo dentro de la cara de su segmento, el carcasa de gabinete ≥ el módulo más alto.
- **Mantén los límites que no son dimensiones:** conteos (rows, posts, steps, louvers — multiplican la geometría generada, así que el tope es un guardia de perf), porcentajes y fracciones 0–1, rangos de ángulos (pitch, tilt, opening), rotación −180..180.

## Exenciones deliberadas

- **Campos de pulgadas MEP** (duct, pipe, lineset, collares HVAC): los límites reflejan los tamaños comerciales reales y tienen significado de dominio.
- **Ancho de corrida de gabinete (3 m):** el ancho impulsa módulos de carcasa generados automáticamente, así que el max es un guardia de conteo de geometría, no gusto.
- **Dimensiones de items:** el envolvente de 30 m está ligado al item-builder de studio y a los topes de bake; cámbialo allí, no aquí.
- **Perillas de detalle** (bevels, insets, overhangs, flanges, rails, sills, trim): los rangos limitados están bien — parametrizan una forma, y los valores extremos producen geometría auto-intersecante en lugar de un objeto válido más grande.

Las longitudes que generan hijos periódicos (gutter hangers, fence posts, correas de downspout) escalan los conteos de instancias con el valor. Ese costo es visible para el usuario y deshacible — no es una razón para reintroducir un tope.

Los nuevos tipos y campos siguen estas reglas; la revisión de PR debería rechazar máximos estáticos en campos de dimensión.