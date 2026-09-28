/**
 * Materiales descriptivos: los que describen el material en palabras comunes
 * y por eso se traducen.
 *
 * Los nombres de catalogo NO se traducen: son identificadores de un asset
 * concreto (con numero o sufijo) y deben coincidir con el nombre del archivo.
 * Ejemplos que se quedan en ingles:
 *   "Finewood 27", "Hungarian Parquet 2", "Statuaretto White",
 *   "Green Quartzite A", "Wood Plank 48", "Wooden Ceramic 3"
 *
 * Regla: si tiene numero o sufijo de catalogo -> ingles. Si es una palabra
 * o dos -> traducido.
 */
export const materiales: Record<string, string> = {
  // --- Colores ---
  White: "Blanco",
  "Soft White": "Blanco suave",
  Cream: "Crema",
  Beige: "Beige",
  "Light grey": "Gris claro",
  Greige: "Greige",
  "Mid grey": "Gris medio",
  Charcoal: "Grafito",
  "Near-black": "Casi negro",
  Blush: "Rubor",
  Tomato: "Tomate",
  "Brick red": "Ladrillo rojo",
  Oxblood: "Granate",
  Peach: "Durazno",
  Terracotta: "Terracota",
  "Burnt orange": "Naranja quemado",
  Clay: "Arcilla",
  "Pale yellow": "Amarillo pálido",
  Mustard: "Mostaza",
  Ochre: "Ocre",
  Gold: "Oro",
  Mint: "Menta",
  Sage: "Salvia",
  Olive: "Oliva",
  Forest: "Bosque",
  "Pale teal": "Verde azulado pálido",
  Teal: "Verde azulado",
  "Deep teal": "Verde azulado profundo",
  "Powder blue": "Azul empolvado",
  "Soft Blue": "Azul suave",
  Sky: "Cielo",
  "Slate Blue": "Azul pizarra",
  "Royal blue": "Azul real",
  Navy: "Azul marino",
  Lavender: "Lavanda",
  Plum: "Ciruela",
  Aubergine: "Berenjena",
  Petal: "Pétalo",
  Rose: "Rosa",
  "Dusty Rose": "Rosa empolvado",
  Berry: "Frambuesa",
  Sand: "Arena",
  Tan: "Canela",
  Taupe: "Topo",
  Espresso: "Espresso",

  // --- Materiales ---
  Metal: "Metal",
  Glass: "Vidrio",
  Linen: "Lino",
  Cotton: "Algodón",
  Velvet: "Terciopelo",
  Wool: "Lana",
  Suede: "Ante",
  "Bouclé": "Bouclé",
  "Black Leather": "Cuero negro",
  "Calf Leather": "Cuero de becerro",
  "Painted Plaster": "Yeso pintado",
  "Polished Concrete": "Concreto pulido",
  "Raw Concrete": "Concreto crudo",
  "Concrete Plate": "Placa de concreto",
  "White Stucco": "Estuco blanco",
  "Prepared Drywall": "Tablero de yeso",
  Copper: "Cobre",
  "Polished Metal": "Metal pulido",
  "Brushed Steel": "Acero cepillado",
  Brass: "Latón",
  Chrome: "Cromo",

  // --- Categorías del panel de materiales ---
  Colors: "Colores",
  Wood: "Madera",
  Stone: "Piedra",
  Brick: "Ladrillo",
  Tile: "Cerámica",
  Concrete: "Concreto",
  Fabric: "Tela",
  Leather: "Cuero",
  Roofing: "Cubiertas",
  Ground: "Suelo",

  // --- Textos del panel de materiales ---
  "Used by": "Usado por",
  part: "parte",
  parts: "partes",
  "No custom materials yet — add one with +.": "Aún no hay materiales personalizados — añade uno con +.",
};
