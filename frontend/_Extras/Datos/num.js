/** Formato compacto de contadores (como las vistas del sitio):
 *  999 -> "999", 1240 -> "1.2K", 1500000 -> "1.5M". */
export function fmtNum(n) {
  const num = Number(n) || 0;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1).replace('.0', '')}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1).replace('.0', '')}K`;
  return String(num);
}
