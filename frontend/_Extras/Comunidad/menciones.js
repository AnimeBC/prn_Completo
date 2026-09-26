// Autocompletado de menciones "@usuario" (composer, comentarios y visor).
// Al escribir "@" aparecen sugerencias; al elegirla se inserta la etiqueta y
// el backend (notificarMenciones) avisa a la persona etiquetada.
'use client';

import { useEffect, useRef, useState } from 'react';
import { apiComunidad, comunidadMedia } from '@/_Extras/Comunidad/api.js';
import styles from './menciones.module.css';

// "@consulta" justo antes del cursor (inicio de linea, tras un espacio o "(").
const RE_MENCION = /(^|[\s(])@([A-Za-z0-9_.-]{0,39})$/;
const ES_MENCION = /^@[A-Za-z0-9_.-]{3,40}$/;

/** Estado y comportamiento del autocompletado (interno de MencionCampo). */
function useMenciones({ userKey, setValor }) {
  const [q, setQ] = useState(null); // null = cerrado; '' = "@ " recien escrito
  const [lista, setLista] = useState([]);
  const [sel, setSel] = useState(0);
  const [cargando, setCargando] = useState(false);
  // Posicion de la "@" y del final de la consulta + el campo (para recolocar el cursor).
  const posRef = useRef({ inicio: 0, fin: 0, el: null });
  // Cierre al salir del campo (con un pelin de espera para que un clic en
  // una sugerencia llegue a tiempo, sobre todo en movil).
  const blurT = useRef(null);

  // Busqueda con retardo (la consulta vacia muestra las primeras personas).
  useEffect(() => {
    if (q === null) { setLista([]); return undefined; }
    let vivo = true;
    const t = setTimeout(async () => {
      if (vivo) setCargando(true);
      let datos = [];
      try {
        const r = await apiComunidad.buscarUsuarios(q, userKey);
        datos = Array.isArray(r?.data) ? r.data : [];
      } catch { datos = []; }
      if (!vivo) return;
      setLista(datos.slice(0, 8));
      setSel(0);
      setCargando(false);
    }, q ? 200 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, userKey]);

  /** Llamado en cada change del campo: detecta si hay "@" activo. */
  function cambio(e) {
    if (blurT.current) { clearTimeout(blurT.current); blurT.current = null; }
    const el = e.target;
    const v = String(el?.value || '');
    let pos = v.length;
    try {
      if (typeof el?.selectionStart === 'number') pos = el.selectionStart;
    } catch { pos = v.length; } // tipos de input sin posicion de cursor
    const m = RE_MENCION.exec(v.slice(0, pos));
    if (!m) { setQ(null); setLista([]); return; }
    const consulta = m[2];
    posRef.current = { inicio: pos - consulta.length - 1, fin: pos, el };
    setQ(consulta);
    setSel(0);
  }

  /** Cierra el popup (al salir del campo, por ejemplo). */
  function cerrar() {
    if (blurT.current) clearTimeout(blurT.current);
    blurT.current = setTimeout(() => { setQ(null); setLista([]); }, 200);
  }

  /** Inserta "@usuario " donde estaba la "@" y recoloca el cursor. */
  function elegir(u) {
    const { inicio, fin, el } = posRef.current;
    const handle = String(u?.usuario || u?.nombre || '').trim();
    if (!el || !handle) return;
    const v = String(el.value || '');
    const insert = `@${handle} `;
    const nuevo = v.slice(0, inicio) + insert + v.slice(Math.max(fin, inicio));
    setValor(nuevo);
    setQ(null);
    setLista([]);
    const caret = inicio + insert.length;
    requestAnimationFrame(() => {
      try { el.focus(); el.setSelectionRange(caret, caret); } catch { /* sin soporte */ }
    });
  }

  /** Teclado del popup: flechas, Escape, Enter/Tab para elegir.
   *  Devuelve true si consumio el evento (asi NO se envia el comentario ni
   *  se cierra el modal/visor con Escape mientras se escribe). */
  function teclas(e) {
    if (q === null) return false;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setSel((s) => (lista.length ? (s + 1) % lista.length : 0));
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setSel((s) => (lista.length ? (s - 1 + lista.length) % lista.length : 0));
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setQ(null);
      setLista([]);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      if (lista.length) elegir(lista[Math.min(sel, lista.length - 1)]);
      else setQ(null);
      return true;
    }
    return false;
  }

  return { q, lista, sel, setSel, cargando, cambio, cerrar, teclas, elegir };
}

/** Lista de sugerencias (se pinta sobre el campo). */
function Pop({ men, es }) {
  const { q, lista, sel, cargando } = men;
  if (q === null) return null;
  return (
    <div className={styles.pop} role="listbox">
      {cargando && lista.length === 0 && (
        <p className={styles.popVacio}>{es ? 'Buscando personas...' : 'Searching people...'}</p>
      )}
      {!cargando && lista.length === 0 && (
        <p className={styles.popVacio}>{es ? 'Sin resultados.' : 'No results.'}</p>
      )}
      {lista.map((u, i) => (
        <button
          key={u.id || u.usuario}
          type="button"
          role="option"
          aria-selected={i === sel}
          className={`${styles.popItem} ${i === sel ? styles.popItemOn : ''}`}
          // Evita que el campo pierda el foco al hacer clic en la sugerencia.
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => men.setSel(i)}
          onClick={() => men.elegir(u)}
        >
          <span className={styles.popAvatar}>
            {u.avatar
              ? <img src={comunidadMedia(u.avatar)} alt="" />
              : String(u.usuario || u.nombre || '?').slice(0, 1).toUpperCase()}
          </span>
          <span className={styles.popTxt}>
            <strong>@{u.usuario || u.nombre}</strong>
            {u.nombre && u.nombre !== u.usuario && <small>{u.nombre}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Campo (input o textarea) con autocompletado "@".
 *  as: 'input' | 'textarea'   |   wrapClass: clase extra del contenedor.
 *  El resto de props van tal cual al campo (className, value, onChange,
 *  onKeyDown, ref via inputRef, placeholder, maxLength...).
 */
export function MencionCampo({
  as = 'input',
  className,
  wrapClass = '',
  value,
  onChange,
  onKeyDown,
  userKey = '',
  es = true,
  inputRef,
  ...rest
}) {
  const men = useMenciones({
    userKey,
    // El host solo conoce e.target.value, asi que le pasamos un evento simple.
    setValor: (v) => { if (onChange) onChange({ target: { value: v } }); },
  });
  const Tag = as === 'textarea' ? 'textarea' : 'input';
  return (
    <div className={`${styles.wrap} ${wrapClass}`}>
      <Pop men={men} es={es} />
      <Tag
        ref={inputRef}
        className={className}
        value={value}
        onChange={(e) => { if (onChange) onChange(e); men.cambio(e); }}
        onKeyDown={(e) => { if (men.teclas(e)) return; if (onKeyDown) onKeyDown(e); }}
        onFocus={(e) => men.cambio(e)}
        onBlur={men.cerrar}
        {...rest}
      />
    </div>
  );
}

/** Texto con las menciones (@usuario) resaltadas. */
export function TextoMenciones({ children }) {
  const t = String(children ?? '');
  if (!t.includes('@')) return t;
  return t.split(/(@[A-Za-z0-9_.-]{3,40})/g).map((p, i) => (
    ES_MENCION.test(p) ? <span key={`m${i}`} className={styles.men}>{p}</span> : p
  ));
}
