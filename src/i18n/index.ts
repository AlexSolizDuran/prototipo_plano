import { comun } from "./es/comun";
import { paneles } from "./es/paneles";
import { menus } from "./es/menus";
import { inspector } from "./es/inspector";
import { materiales } from "./es/materiales";
import { tipos } from "./es/tipos";

/**
 * La clave es el texto en ingles tal cual aparece en el codigo del editor.
 * No inventamos claves tipo "nodes.wall.skirting": la traduccion se aplica
 * con `t("Skirting")` en el punto exacto donde el editor tenga el string.
 *
 * El orden importa: los archivos mas especificos van al final para que
 * pisen a los compartidos.
 */
const DICCIONARIO: Record<string, string> = {
  ...comun,
  ...paneles,
  ...menus,
  ...inspector,
  ...tipos,
  ...materiales,
};

export const IDIOMA = "es";

/**
 * Traduce un texto. Si no hay traduction devuelve el original, para que un
 * string nuevo nunca rompa la interfaz ni aparezcaundefined.
 */
export function t(texto: unknown): unknown {
  if (typeof texto !== "string") return texto;
  return DICCIONARIO[texto] ?? texto;
}

/** Igual que `t` pero garantiza string (para props que exigen string). */
export function ts(texto: string): string {
  return DICCIONARIO[texto] ?? texto;
}

/** Traduce un texto ya interpolado, p.ej. "Hide skirting" / "Box Vent 1". */
export function tp(plantilla: string, valor: string | number): string {
  return plantilla.replace(/\{i\}/g, String(valor));
}

export function tieneTraduccion(texto: string): boolean {
  return Object.prototype.hasOwnProperty.call(DICCIONARIO, texto);
}

/** Exportado para pruebas: cuantos strings hay traducidos. */
export const TOTAL_TRADUCIDOS = Object.keys(DICCIONARIO).length;
