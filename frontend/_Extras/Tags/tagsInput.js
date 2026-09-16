/**
 * Utilidades para el campo de tags de los paneles de admin.
 *
 * Permite pegar una lista tipo: "#TikTok #porno #4K, Latina" y convertirla
 * en tags limpios (sin "#"), sin duplicados y comparando sin distinguir
 * mayúsculas/minúsculas.
 */

/** Separa la lista pegada y limpia cada tag (quita "#", espacios y vacíos). */
export function parseTags(input) {
  if (!input) return [];
  const parts = String(input).split(/[\s,;]+/);
  const seen = new Set();
  const out = [];
  for (const raw of parts) {
    const tag = raw.replace(/^#+/, '').trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/**
 * Igual que parseTags pero, si el tag ya existe en el catálogo, usa el
 * nombre tal cual está en el catálogo (no importa mayúsculas/minúsculas).
 */
export function resolveTags(input, catalog = []) {
  const byKey = new Map(catalog.map((t) => [String(t).toLowerCase(), t]));
  return parseTags(input).map((t) => byKey.get(t.toLowerCase()) || t);
}

/** Une dos listas de tags sin duplicados (comparando sin mayúsculas). */
export function mergeTags(current = [], incoming = []) {
  const list = [...current];
  const keys = new Set(list.map((t) => String(t).toLowerCase()));
  for (const t of incoming) {
    const key = String(t).toLowerCase();
    if (keys.has(key)) continue;
    keys.add(key);
    list.push(t);
  }
  return list;
}
