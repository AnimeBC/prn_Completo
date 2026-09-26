// Sentimientos y actividades que se pueden poner en una publicacion.
// Se guarda el id corto en la BD (comunidad_posts.sentimiento) y aqui vive
// la traduccion + icono para pintarlo en el feed y en el selector.
export const SENTIMIENTOS = [
  // --- Sentimientos ---
  { id: 'feliz', tipo: 'sentimiento', icon: 'happy-outline', es: 'feliz', en: 'happy' },
  { id: 'enamorado', tipo: 'sentimiento', icon: 'heart-outline', es: 'enamorado', en: 'in love' },
  { id: 'sorprendido', tipo: 'sentimiento', icon: 'star-outline', es: 'sorprendido', en: 'surprised' },
  { id: 'triste', tipo: 'sentimiento', icon: 'sad-outline', es: 'triste', en: 'sad' },
  { id: 'enojado', tipo: 'sentimiento', icon: 'flame-outline', es: 'enojado', en: 'angry' },
  { id: 'aburrido', tipo: 'sentimiento', icon: 'tv-outline', es: 'aburrido', en: 'bored' },
  { id: 'cansado', tipo: 'sentimiento', icon: 'bed-outline', es: 'cansado', en: 'tired' },
  { id: 'motivado', tipo: 'sentimiento', icon: 'rocket-outline', es: 'motivado', en: 'motivated' },
  { id: 'orgulloso', tipo: 'sentimiento', icon: 'trophy-outline', es: 'orgulloso', en: 'proud' },
  { id: 'emocionado', tipo: 'sentimiento', icon: 'flash-outline', es: 'emocionado', en: 'excited' },
  { id: 'nervioso', tipo: 'sentimiento', icon: 'time-outline', es: 'nervioso', en: 'nervous' },
  { id: 'tranquilo', tipo: 'sentimiento', icon: 'moon-outline', es: 'tranquilo', en: 'chill' },
  // --- Actividades ---
  { id: 'comiendo', tipo: 'actividad', icon: 'restaurant-outline', es: 'comiendo', en: 'eating' },
  { id: 'viajando', tipo: 'actividad', icon: 'airplane-outline', es: 'viajando', en: 'traveling' },
  { id: 'escuchando', tipo: 'actividad', icon: 'musical-notes-outline', es: 'escuchando música', en: 'listening to music' },
  { id: 'jugando', tipo: 'actividad', icon: 'game-controller-outline', es: 'jugando', en: 'gaming' },
  { id: 'estudiando', tipo: 'actividad', icon: 'school-outline', es: 'estudiando', en: 'studying' },
  { id: 'entrenando', tipo: 'actividad', icon: 'barbell-outline', es: 'entrenando', en: 'working out' },
];

/** Texto de la cabecera del post: "sintiendo feliz" o "comiendo". */
export function sentimientoTexto(s, es) {
  if (!s) return '';
  if (s.tipo === 'actividad') return es ? s.es : s.en;
  return es ? `sintiéndose ${s.es}` : `feeling ${s.en}`;
}

/** Busca un sentimiento/actividad por su id. */
export function sentimientoPorId(id) {
  return SENTIMIENTOS.find((s) => s.id === id) || null;
}
