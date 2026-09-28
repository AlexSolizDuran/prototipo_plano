/**
 * Barre el codigo del editor en busca de strings visibles que siguen en
 * ingles. Clasifica cada hallazgo:
 *
 *   cubierta   -> la clave existe en el diccionario (OK)
 *   dict       -> pasa por un traductor (envoltorio editorial / ts()) pero
 *                 la clave NO existe: se arregla agregando una linea al
 *                 diccionario (`src/i18n/es/*.ts`).
 *   crudo      -> texto que NO pasa por ningun traductor (nodo de texto
 *                 directo en el DOM). Requiere parche para envolverlo
 *                 con `ts()`.
 *   ignorado   -> en la lista IGNORAR (coordenadas, unidades, ejemplos,
 *                 catalogo de materiales dejado en ingles a proposito, ...).
 *
 * Salida exit 0 = no queda nada visible sin traducir (fuera del ignore).
 * Salida exit 1 = hay pendientes. Con --json para integrarse a CI.
 *
 *   node scripts/barrer.mjs [--json] [--incluir-materiales]
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const I18N = join(RAIZ, "src/i18n");
const EDITOR = join(RAIZ, "node_modules/@pascal-app/editor/src");
const NODES = join(RAIZ, "node_modules/@pascal-app/nodes/dist");
const CORE = join(RAIZ, "node_modules/@pascal-app/core/dist");

const INCLUIR_MATERIALES = process.argv.includes("--incluir-materiales");
const JSON_OUT = process.argv.includes("--json");

/** ── diccionario ─────────────────────────────────────────────────── */
function cargarDiccionario() {
  const claves = new Set();
  for (const f of readdirSync(join(I18N, "es")).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(I18N, "es", f), "utf8");
    for (const m of src.matchAll(/^\s*(?:"([^"]+)"|([^\s"][^:"\n]*?))\s*:\s*"/gm)) {
      claves.add(m[1] ?? m[2]);
    }
  }
  return claves;
}

/** ── strings a ignorar (no son trabajo de traduccion) ─────────────── */
const IGNORAR = new Set(
  ["X", "Y", "Z", "-45°", "+45°", "±45°", "pos", "rot", "scale"].map((s) =>
    s.trim().toLowerCase(),
  ),
);
const IGNORAR_RE = [
  /^-?\d/,
  /^[C-R]\d+$/i,
  /^[0-9.,°\-+%]+\s*[0-9.,°\-+%]*$/,
  /^(const|let|return|state|candidate|nodes|restAnchors|liveOverrides|levelNodeIdsByType|vertices|buildSceneGraphValue|onMoveHandlePointerDown|setSpaces|element)(\b|\()/,
  /(\b(Array|Map|Record|ReturnType|ReadonlyMap|ReactPointerEvent|Partial|Math\.PI|Promise)\b)/,
  /&&/,
  /^intersection\./,
];

function esIgnorable(texto) {
  const t = texto.trim();
  if (IGNORAR.has(t.toLowerCase())) return true;
  return IGNORAR_RE.some((re) => re.test(t));
}

/** ── archivos ─────────────────────────────────────────────────────── */
function walk(d, salida = []) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      walk(p, salida);
    } else if (/\.(tsx?|jsx?)$/.test(e.name) && !e.name.endsWith(".d.ts") && !e.name.includes(".test.")) {
      salida.push(p);
    }
  }
  return salida;
}

const PROPS = ["label", "title", "detail", "aria-label", "alt", "placeholder"];

/** strings dentro de una prop conocida:  prop="X" / prop: 'X' */
function extraerPorProp(src, claves) {
  const re = new RegExp(
    `\\b(${PROPS.join("|")})(?:=|\\s*:)\\s*["']([^"']{1,60})["']`,
    "g",
  );
  const res = new Map();
  for (const m of src.matchAll(re)) {
    const v = decodif(m[2]).trim();
    if (!v || v.length < 2) continue;
    res.set(v, claves.has(v) ? "cubierta" : "dict");
  }
  return res;
}

/** nodos de texto JSX:  >Text<   (solo fuente .tsx/.jsx) */
function extraerTextoFuente(src, claves) {
  const res = new Map();
  for (const m of src.matchAll(/>\s*([A-Za-z][A-Za-z0-9 .,&()/:'\u00B0\u00D7\u2195\u00E1-\u00FC\u00C1-\u00DC]{2,60})\s*</g)) {
    const v = decodif(m[1]).trim();
    res.set(v, claves.has(v) ? "cubierta" : "crudo");
  }
  return res;
}

/** nodos de texto compilados:  children: "Text"   (solo .js de dist) */
function extraerTextoDist(src, claves) {
  const res = new Map();
  for (const m of src.matchAll(/children:\s*"([A-Za-z][A-Za-z0-9 .,&()/:'\u00B0\u00D7\u2195\u00E1-\u00FC\u00C1-\u00DC]{2,60})"/g)) {
    const v = decodif(m[1]).trim();
    res.set(v, claves.has(v) ? "cubierta" : "crudo");
  }
  return res;
}


/** Desescapa \u2026 / \x1F dentro de strings compilados. */
function decodif(s) {
  return s.replace(/\\u\{([a-fA-F0-9]+)\}|\\u([a-fA-F0-9]{4})|\\x([a-fA-F0-9]{2})/g, (_, a, c, d) => String.fromCodePoint(parseInt(a || c || d, 16)));
}
function main() {
  const claves = cargarDiccionario();
  const hallazgos = new Map(); // texto -> { categoria, archivos:Set, scope }

  const registrar = (texto, categoria, archivo, scope) => {
    if (esIgnorable(texto)) return;
    if (!hallazgos.has(texto))
      hallazgos.set(texto, { categoria, archivos: new Set(), scope });
    const h = hallazgos.get(texto);
    h.archivos.add(relative(RAIZ, archivo));
    if (categoria === "crudo") h.categoria = "crudo";
  };

  // 1) editor/src: todo pasa por traducir.mjs (props + texto JSX)
  for (const p of walk(EDITOR)) {
    if (p.includes("slider-demo")) continue;
    const src = readFileSync(p, "utf8");
    for (const [t, c] of extraerPorProp(src, claves)) registrar(t, c, p, "editor/src");
    if (/\.(tsx|jsx)$/.test(p)) {
      for (const [t, c] of extraerTextoFuente(src, claves)) registrar(t, c, p, "editor/src");
    }
  }

  // 2) nodes/dist: paneles envueltos (props pasan por envoltorio) + texto crudo
  for (const p of walk(NODES)) {
    const src = readFileSync(p, "utf8");
    if (!src.includes("@/i18n/editorial")) continue;
    for (const [t, c] of extraerPorProp(src, claves)) registrar(t, c, p, "nodes/dist");
    for (const [t, c] of extraerTextoDist(src, claves)) registrar(t, c, p, "nodes/dist");
  }

  // 3) core/dist: inyectado por traducir.mjs
  for (const p of walk(CORE)) {
    if (!INCLUIR_MATERIALES && p.includes("material-library")) continue;
    const src = readFileSync(p, "utf8");
    for (const [t, c] of extraerPorProp(src, claves)) registrar(t, c, p, "core/dist");
    for (const [t, c] of extraerTextoDist(src, claves)) registrar(t, c, p, "core/dist");
  }

  const dict = [...hallazgos.values()].filter((h) => h.categoria === "dict");
  const crudo = [...hallazgos.values()].filter((h) => h.categoria === "crudo");

  const orden = (h) => h.texto = hallazgosTexto(h);

  function textoDe(h) {
    for (const [t, x] of hallazgos) if (x === h) return t;
    return "";
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({
      diccionario: claves.size,
      pendientes: [
        ...dict.map((h) => ({ tipo: "dict", texto: textoDe(h), archivos: [...h.archivos].sort() })),
        ...crudo.map((h) => ({ tipo: "crudo", texto: textoDe(h), archivos: [...h.archivos].sort() })),
      ],
    }, null, 2));
  } else {
    console.log(`diccionario: ${claves.size} claves — arbol ${EDITOR ? "" : ""}`);
    const pendientes = dict.length + crudo.length;
    if (!pendientes) {
      console.log("No queda texto visible sin traducir. OK.");
    } else {
      console.log(`\n== ${dict.length} para agregar al diccionario ==`);
      for (const h of dict.sort((a, b) => a.archivos.size - b.archivos.size)) {
        console.log(`  ${textoDe(h)}`);
      }
      console.log(`\n== ${crudo.length} texto crudo (requiere parche) ==`);
      for (const h of crudo.sort((a, b) => a.archivos.size - b.archivos.size)) {
        console.log(`  ${textoDe(h)}   [${[...h.archivos].sort().join(", ")}]`);
      }
    }
  }
  process.exit(dict.length + crudo.length ? 1 : 0);
}

main();