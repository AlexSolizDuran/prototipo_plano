import { CATALOG_ITEMS } from "@pascal-app/editor"

/**
 * Grupos del catálogo. El `slug` es el identificador de taxonomía: se ata a
 * cada ítem vía `functionTags` para que `FunctionTreePanel` pueda matchear.
 * El `icon` sale de `public/icons`.
 */
/**
 * Grupos del catálogo.
 *
 * El matcher usa los campos que el catálogo oficial REALMENTE tiene:
 * `category` (furniture, appliance, bathroom, kitchen, outdoor) y `tags`.
 * No existe `functionTags` — una versión anterior de este panel filtraba por
 * ese campo inexistente y por eso no mostraba ningún objeto.
 *
 * Un ítem entra al grupo si coincide la categoría o CUALQUIERA de los tags.
 * Los nombres se matchean por substring, sin distinguir mayúsculas, para los
 * casos sin tag usable (ej: "Television" solo tiene `electronics`, que también
 * corresponde a-Toaster y Computer).
 */
export type CatalogGroup = {
  slug: string
  label: string
  icon: string
  category?: string
  tags?: string[]
  names?: string[]
}

export const CATALOG_GROUPS: CatalogGroup[] = [
  { slug: "todos", label: "Todos", icon: "/icons/room.webp" },
  {
    slug: "asientos",
    label: "Sillones y sillas",
    icon: "/icons/couch.webp",
    // `lounge` fuera: la Mesa ratona lo lleva y no es un asiento.
    tags: ["seating", "seat", "chair", "armchair", "lounger", "stool", "bench"],
  },
  {
    slug: "camas",
    label: "Camas",
    icon: "/icons/room.webp",
    tags: ["bed", "bunkbed", "bedside", "bedroom", "sleep", "sleeper", "nightstand"],
  },
  {
    slug: "mesas",
    label: "Mesas y escritorios",
    icon: "/icons/floorplan.webp",
    tags: ["table", "tabletop", "desk", "workstation", "workspace", "writing"],
  },
  {
    slug: "roperos",
    label: "Roperos y estantes",
    icon: "/icons/shelf.webp",
    // `storage` fuera: lo también llevan el cactus y el mueble de TV.
    tags: ["wardrobe", "shelf", "shelving", "cabinet", "dresser", "bookcase", "closet", "cubby"],
  },
  {
    slug: "cocina",
    label: "Cocina",
    icon: "/icons/kitchen.webp",
    category: "kitchen",
    // `countertop` fuera: la lámpara de mesa también lo lleva.
    tags: ["kitchen", "cooking", "cookware", "kitchenware", "counter", "island", "pantry", "refrigerator", "fridge", "stove", "oven", "microwave", "toaster", "serving", "baking"],
  },
  {
    slug: "bano",
    label: "Baño",
    icon: "/icons/bathroom.webp",
    category: "bathroom",
    tags: ["bathroom", "bath", "bathtub", "tub", "vanity", "washbasin", "basin", "sink", "mirror", "hygiene"],
  },
  {
    slug: "ducha",
    label: "Ducha",
    icon: "/icons/bathroom.webp",
    tags: ["shower", "soaking"],
  },
  {
    slug: "lavadero",
    label: "Lavadero",
    icon: "/icons/appliance.webp",
    // Ni `iron` (la barra de pesas y la hidrante son de hierro) ni `washing`
    // (que también lo llevan el lavabo y la ducha). Se matchea por nombre.
    names: ["washing machine", "dryer", "ironing board", "iron", "laundry", "hamper", "drying rack"],
  },
  {
    slug: "tv",
    label: "TV y audio",
    icon: "/icons/room.webp",
    names: ["television", "tv stand", "stereo", "speaker", "soundbar"],
    tags: ["audio", "acoustics"],
  },
  {
    slug: "pc",
    label: "PC y electrónica",
    icon: "/icons/appliance.webp",
    // Ni `gaming` (la mesa de pool) ni `electronics` (también el microondas).
    names: ["computer", "keyboard", "printer", "router", "modem", "laptop"],
  },
  { slug: "exterior", label: "Exterior", icon: "/icons/plant.webp", category: "outdoor" },
  { slug: "electro", label: "Electrodomésticos", icon: "/icons/appliance.webp", category: "appliance" },
]

/** Un ítem pertenece al grupo si el matcher lo acepta. */
export function matchesGroup(
  item: { category?: string; tags?: string[]; name?: string },
  group: CatalogGroup,
): boolean {
  if (group.slug === "todos") return true
  if (group.category && item.category === group.category) return true
  if (group.tags?.some((t) => (item.tags ?? []).includes(t))) return true
  if (group.names?.some((n) => (item.name ?? "").toLowerCase().includes(n))) return true
  return false
}

/** `id` del ítem en `CATALOG_ITEMS` → nombre en español. */
const SPANISH_NAMES: Record<string, string> = {
  // Asientos
  sofa: "Sofá",
  "my-leather-couch-modp80ha": "Sofá de cuero",
  "lounge-chair": "Sillón",
  "livingroom-chair": "Sillón living",
  "dining-chair": "Silla de comedor",
  "office-chair": "Silla de oficina",
  stool: "Taburete",
  // Camas
  "single-bed": "Cama simple",
  "double-bed": "Cama doble",
  bunkbed: "Cama cucheta",
  "bedside-table": "Mesita de luz",
  // Mesas
  "coffee-table": "Mesa ratona",
  "dining-table": "Mesa de comedor",
  "office-table": "Escritorio",
  "standing-desk-mo8wgz95": "Escritorio regulable",
  // Roperos y estantes
  closet: "Ropero",
  dresser: "Cómoda",
  bookshelf: "Biblioteca",
  shelf: "Estante",
  "ikea-kallax-1x4-moa2y49n": "Kallax 2x4",
  "coat-rack": "Perchero",
  // Cocina
  kitchen: "Cocina",
  "kitchen-cabinet": "Mueble de cocina",
  "kitchen-counter": "Mesada de cocina",
  "wooden-kitchen-bar-moa2hhh4": "Barra de cocina",
  "kitchen-shelf": "Estante de cocina",
  fridge: "Heladera",
  stove: "Cocina",
  microwave: "Microondas",
  hood: "Campana",
  // Baño
  toilet: "Inodoro",
  "bathroom-sink": "Lavabo",
  bathtub: "Banheira",
  // Ducha
  "shower-square": "Ducha cuadrada",
  "shower-angle": "Ducha de esquina",
  // Lavadora
  "washing-machine": "Lavarropas",
  // TV
  television: "Televisor",
  "tv-stand": "Mueble de TV",
  // PC
  computer: "Computadora",
  "herman-miller-aeron-mo8x36k9": "Silla Aeron",
}

/** Sinónimos de búsqueda en español: ampliar el término también trae el inglés. */
const SEARCH_ALIASES: Record<string, string[]> = {
  sofa: ["sofa", "sillon", "living"],
  "my-leather-couch-modp80ha": ["cuero", "sofa"],
  "lounge-chair": ["sillon", "living"],
  "livingroom-chair": ["sillon", "living"],
  "dining-chair": ["silla", "comedor"],
  "office-chair": ["silla", "oficina", "pc"],
  stool: ["taburete", "banqueta"],
  "single-bed": ["cama", "simple", "individual"],
  "double-bed": ["cama", "doble", "matrimonio"],
  bunkbed: ["cama", "cucheta", "dormitorio"],
  "bedside-table": ["mesita", "luz", "cama"],
  "coffee-table": ["mesa", "ratona", "living"],
  "dining-table": ["mesa", "comedor"],
  "office-table": ["escritorio", "pc", "trabajo"],
  "standing-desk-mo8wgz95": ["escritorio", "altura", "pc"],
  closet: ["ropero", "placard", "armario"],
  dresser: ["comoda", "ropero"],
  bookshelf: ["biblioteca", "librero", "estante"],
  shelf: ["estante", "repisa"],
  "ikea-kallax-1x4-moa2y49n": ["kallax", "librero", "ikea"],
  "coat-rack": ["perchero", "abrigos"],
  kitchen: ["cocina", "amueblada"],
  "kitchen-cabinet": ["mueble", "cocina", "alacena"],
  "kitchen-counter": ["mesada", "cocina", "meson"],
  "wooden-kitchen-bar-moa2hhh4": ["barra", "cocina"],
  "kitchen-shelf": ["estante", "cocina"],
  fridge: ["heladera", "nevera", "refrigerador"],
  stove: ["cocina", "horno", "anafe"],
  microwave: ["microondas", "horno"],
  hood: ["campana", "extractora", "cocina"],
  toilet: ["inodoro", "sanitario", "bano"],
  "bathroom-sink": ["lavabo", "bacha", "bano"],
  bathtub: ["banheira", "bano"],
  "shower-square": ["ducha", "cuadrada"],
  "shower-angle": ["ducha", "esquina"],
  "washing-machine": ["lavarropas", "lavadora", "washer"],
  television: ["tv", "televisor", "tele"],
  "tv-stand": ["mueble", "tv", "televisor"],
  computer: ["pc", "computadora", "escritorio"],
  "herman-miller-aeron-mo8x36k9": ["silla", "aeron", "oficina", "pc"],
}


type CatalogSource = (typeof CATALOG_ITEMS)[number]

function findSource(id: string): CatalogSource | undefined {
  return CATALOG_ITEMS.find((item) => item.id === id)
}

/**
 * Catálogo completo con nombre en español y alias de búsqueda.
 *
 * Se parte de los 111 ítems que trae el paquete, NO de una lista curada: la
 * versión anterior armaba la lista a partir de los grupos, así que cualquier
 * objeto no listado quedaba inalcanzable — y con el filtro roto, todos.
 */
export const CATALOG_ES_ITEMS = CATALOG_ITEMS.map((source) => {
  const aliases = SEARCH_ALIASES[source.id] ?? []
  return {
    ...source,
    name: SPANISH_NAMES[source.id] ?? source.name,
    tags: [...(source.tags ?? []), ...aliases],
  }
})

/** Índice por id para resolver un grupo de una vez. */
export const CATALOG_BY_ID = new Map(CATALOG_ES_ITEMS.map((i) => [i.id, i]))
