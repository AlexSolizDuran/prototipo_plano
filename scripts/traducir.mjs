/**
 * Aplica las traducciones de `src/i18n` sobre archivos que viven en
 * `node_modules/@pascal-app`.
 *
 * Solo toca props de presentacion (label / title / detail / aria-label /
 * alt / placeholder) y nodos de texto cuyo contenido sea exactamente una
 * clave del diccionario. Nunca toca identificadores, clases CSS, valores
 * `value`, event handlers ni claves de estado.
 *
 *   node scripts/traducir.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EDITOR = join(RAIZ, "node_modules/@pascal-app/editor/src");
const NODES = join(RAIZ, "node_modules/@pascal-app/nodes/dist");
const I18N = join(RAIZ, "src/i18n");

/** ── carga el diccionario ─────────────────────────────────────────── */
function cargarDiccionario() {
  const archivos = [
    "es/comun.ts",
    "es/paneles.ts",
    "es/menus.ts",
    "es/inspector.ts",
    "es/tipos.ts",
    "es/materiales.ts",
  ];
  const claves = new Set();
  for (const rel of archivos) {
    const src = readFileSync(join(I18N, rel), "utf8");
    for (const m of src.matchAll(/^\s{2}"?([A-Za-z][^"]*?)"?\s*:\s*"/gm)) {
      claves.add(m[1]);
    }
  }
  return claves;
}

/** ── listar archivos recursivamente ───────────────────────────────── */
function listar(dir, ext, excluirDir) {
  const out = [];
  const rec = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (excluirDir(e.name)) continue;
        rec(p);
      } else if (
        !/\.(test|spec)\./.test(e.name) && !/demo/i.test(e.name) &&
        ext.some((x) => e.name.endsWith(x))
      ) out.push(p);
    }
  };
  rec(dir);
  return out;
}

const PROPS = ["label", "title", "detail", "aria-label", "alt", "placeholder"];

/** Desescapa \u2026 / \x1F dentro de strings compilados antes de comparar. */
function decodif(s) {
  return s.replace(/\\u\{([a-fA-F0-9]+)\}|\\u([a-fA-F0-9]{4})|\\x([a-fA-F0-9]{2})/g, (_, a, c, d) => String.fromCodePoint(parseInt(a || c || d, 16)));
}

function escapar(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Primer import completo del archivo, con o sin punto y coma. */
const RE_IMPORT = /^import\s+[^;]*?\s+from\s+['"][^'"]+['"];?[ \t]*\n/m;
const RE_DESDE_I18N = /from ['"]@\/i18n(?:\/editorial)?['"]/;

/** Inserta `import { ts } from '@/i18n'` tras el primer import, o al inicio. */
function asegurarImport(src, rel) {
  if (!/\bts\(/.test(src)) return src;
  if (RE_DESDE_I18N.test(src)) return src;
  const m = src.match(RE_IMPORT);
  if (m) return src.replace(RE_IMPORT, `${m[0]}import { ts } from '@/i18n'\n`);
  console.log(`  ! sin import previo, antepongo en ${rel}`);
  return `import { ts } from '@/i18n'\n${src}`;
}

/** En .js compilado: suma `ts` al import existente de editorial. */
function asegurarImportCompilado(src, rel) {
  if (!/\bts\(/.test(src)) return src;
  if (/\bts\b/.test(src.match(/^import\s*\{([^}]*)\}\s*from\s*['"]@\/i18n\/editorial['"]/m)?.[1] ?? "")) {
    return src;
  }
  const m = src.match(/^import\s*\{([^}]*)\}\s*from\s*['"]@\/i18n\/editorial['"];?[ \t]*\n/m);
  if (m) {
    const nomb = m[1].trim().replace(/,\s*$/, "");
    return src.replace(m[0], `import { ${nomb ? `${nomb}, ` : ""}ts } from '@/i18n/editorial'\n`);
  }
  const i = src.match(RE_IMPORT);
  if (i) return src.replace(RE_IMPORT, `${i[0]}import { ts } from '@/i18n/editorial'\n`);
  console.log(`  ! sin import previo, antepongo en ${rel}`);
  return `import { ts } from '@/i18n/editorial'\n${src}`;
}

/** ── fuente TSX del paquete editor ────────────────────────────────── */
function traducirTSX(ruta, claves) {
  const src0 = readFileSync(ruta, "utf8");
  let src = src0;
  let n = 0;

  // 1) props JSX con string literal:  label="X"  ->  label={ts("X")}
  for (const prop of PROPS) {
    const re = new RegExp(`(\\b${escapar(prop)}=)("|')([^"']*)\\2`, "g");
    src = src.replace(re, (m, p1, q, val) => {
      if (!claves.has(decodif(val))) return m;
      n++;
      return `${p1}{ts(${q}${val}${q})}`;
    });
  }

  // 2) propiedad de objeto:  { label: 'X' }  ->  { label: ts('X') }
  for (const prop of PROPS) {
    const re = new RegExp(`(\\b${escapar(prop)}:\\s*)(["'])([^"']*)\\2`, "g");
    src = src.replace(re, (m, p1, q, val) => {
      if (!claves.has(decodif(val))) return m;
      n++;
      return `${p1}ts(${q}${val}${q})`;
    });
  }

  // 3) nodos de texto: >X<  ->  {ts("X")}
  for (const clave of claves) {
    if (!/^[A-Za-z][A-Za-z0-9 ()/&.'-]*$/.test(clave)) continue;
    const re = new RegExp(`>\\s*${escapar(clave)}\\s*<`, "g");
    const matches = src.match(re);
    if (matches) {
      n += matches.length;
      src = src.replace(re, `>{ts(${JSON.stringify(clave)})}<`);
    }
  }

  src = asegurarImport(src, rel(ruta));

  if (src !== src0) {
    writeFileSync(ruta, src);
    if (n > 0) console.log(`  ok ${rel(ruta)}: ${n}`);
  }
  return n;
}

/** ── .js compilado de nodes (solo paneles) ────────────────────────── */
function traducirJS(ruta, claves) {
  const src0 = readFileSync(ruta, "utf8");
  if (!/from ['"]@\/i18n\/editorial['"]|from ['"]@pascal-app\/editor['"]/.test(src0)) {
    return 0;
  }
  let src = src0;
  let n = 0;

  // a) `children: "X"`                            -> ts("X")
  src = src.replace(/(\bchildren:\s*)(["'])([^"']*)\2/g, (m, p1, q, val) => {
    if (!claves.has(decodif(val))) return m;
    n++;
    return `${p1}ts(${q}${val}${q})`;
  });

  // b) `children: ["A", "B"]`                     -> [ts("A"), ts("B")]
  src = src.replace(
    /(\bchildren:\s*\[)((?:["'][^"']*["']\s*,\s*)+["'][^"']*["'])(\])/g,
    (m, p1, items, p3) => {
      const nuevo = items.replace(/(["'])([^"']*)\1/g, (m2, q, val) => {
        if (!claves.has(decodif(val))) return m2;
        n++;
        return `ts(${q}${val}${q})`;
      });
      return `${p1}${nuevo}${p3}`;
    },
  );

  // c) props de presentación en objetos:  { label: "X" }              -> ts("X")
  for (const prop of PROPS) {
    const re = new RegExp(`(\\b${escapar(prop)}\\s*:\\s*)(["'])([^"']*)\\2`, "g");
    src = src.replace(re, (m, p1, q, val) => {
      if (!claves.has(decodif(val))) return m;
      n++;
      return `${p1}ts(${q}${val}${q})`;
    });
  }

  src = asegurarImportCompilado(src, rel(ruta));

  if (src !== src0) {
    writeFileSync(ruta, src);
    if (n > 0) console.log(`  ok ${rel(ruta)}: ${n}`);
  }
  return n;
}

/** ── material library (paquete core) ──────────────────────────────── */
function traducirMateriales(claves) {
  const ruta = join(RAIZ, "node_modules/@pascal-app/core/dist/material-library.js");
  let src0;
  try {
    src0 = readFileSync(ruta, "utf8");
  } catch {
    console.log("  ? core/dist/material-library.js no existe");
    return 0;
  }
  let src = src0;
  let n = 0;

  src = src.replace(/(\blabel:\s*)(["'])([^"']*)\2/g, (m, p1, q, val) => {
    if (!claves.has(decodif(val))) return m;
    n++;
    return `${p1}ts(${q}${val}${q})`;
  });

  if (n > 0) {
    src = asegurarImport(src, rel(ruta));
    writeFileSync(ruta, src);
  }
  return n;
}

const rel = (p) => relative(RAIZ, p);

function main() {
  const claves = cargarDiccionario();
  console.log(`diccionario: ${claves.size} claves\n`);

  const editorFiles = listar(EDITOR, [".ts", ".tsx"], (d) =>
    /^(node_modules|testing|__tests__|__stories__|stories|demo|fixtures)$/.test(d) ||
    /test|demo|fixture/i.test(d),
  );

  let total = 0;
  let tocados = 0;
  for (const ruta of editorFiles) {
    const n = traducirTSX(ruta, claves);
    if (n > 0) {
      tocados++;
      total += n;
    }
  }
  console.log(`\neditor/src: ${total} traducciones en ${tocados} archivos\n`);

  const nodesFiles = listar(NODES, [".js"], (d) => /^node_modules$/.test(d));
  let totalN = 0;
  let tocadosN = 0;
  for (const ruta of nodesFiles) {
    const n = traducirJS(ruta, claves);
    if (n > 0) {
      tocadosN++;
      totalN += n;
    }
  }
  console.log(`\nnodes/dist: ${totalN} traducciones en ${tocadosN} archivos\n`);

  const nMat = traducirMateriales(claves);
  console.log(`core/material-library: ${nMat} labels\n`);

  console.log(`TOTAL: ${total + totalN + nMat} traducciones`);
}

main();