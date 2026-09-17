'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './grupos.module.css';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { apiComunidad, comunidadMedia } from '@/_Extras/Comunidad/api.js';

const LIMIT = 12;

function ini(n) {
  return String(n || 'U').trim().slice(0, 1).toUpperCase();
}

/** Ventana de páginas centrada (máx 5). */
function rangoPaginas(actual, total2) {
  const hasta = Math.min(total2, Math.max(actual + 2, 5));
  const desde = Math.max(1, hasta - 4);
  const out = [];
  for (let n = desde; n <= hasta; n++) out.push(n);
  return out;
}

export default function GruposClient() {
  const router = useRouter();
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const { userKey, authed } = useAuth();

  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await apiComunidad.grupos(userKey, { q, page, limit: LIMIT });
    setData(Array.isArray(r.data) ? r.data : []);
    setTotal(r.total || 0);
    setPages(r.pages || 1);
    setCargando(false);
  }, [userKey, q, page]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const onChange = (e) => {
      const tipo = String(e?.detail?.type || '');
      if (tipo.startsWith('comunidad_')) cargar();
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => window.removeEventListener('pikantepe:change', onChange);
  }, [cargar]);

  function requiereAprobacion(g) {
    return g.privacidad === 'privada' || g.modo_union === 'invitacion';
  }

  async function unirse(g) {
    if (!authed) { router.push('/comunidad'); return; }
    const r = await apiComunidad.unirse(g.id, userKey);
    if (r.error) { setMsg(r.error); return; }
    if (r.pending) { setMsg(es ? 'Solicitud enviada al creador/admins.' : 'Request sent to the owner/admins.'); return; }
    setMsg(es ? (r.joined ? 'Te uniste al grupo.' : 'Saliste del grupo.') : (r.joined ? 'Joined the group.' : 'Left the group.'));
    cargar();
  }

  function abrir(g) {
    router.push(`/comunidad?grupo=${g.id}`);
  }

  return (
    <main className={styles.main}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>
            <ion-icon name="people-outline" suppressHydrationWarning></ion-icon>
            {es ? 'Todas las comunidades' : 'All communities'}
          </h1>
          <p className={styles.sub}>{total} {es ? 'comunidades' : 'communities'}</p>
        </div>
        <input
          className={styles.search}
          placeholder={es ? 'Buscar comunidad...' : 'Search community...'}
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
      </div>

      {msg && <p className={styles.msg}>{msg}</p>}

      {cargando ? (
        <p className={styles.empty}>{es ? 'Cargando...' : 'Loading...'}</p>
      ) : data.length === 0 ? (
        <p className={styles.empty}>{es ? 'No hay comunidades con esa búsqueda.' : 'No communities match that search.'}</p>
      ) : (
        <div className={styles.grid}>
          {data.map((g) => (
            <article key={g.id} className={styles.card}>
              <button type="button" className={styles.cardMain} onClick={() => abrir(g)}>
                {g.avatar
                  ? <img className={styles.avatar} src={comunidadMedia(g.avatar)} alt="" />
                  : <span className={styles.avatar}>{ini(g.nombre)}</span>}
                <div className={styles.info}>
                  <strong className={styles.name}>{g.nombre}</strong>
                  {g.descripcion && <p className={styles.desc}>{g.descripcion}</p>}
                  <span className={styles.meta}>
                    <ion-icon name="people-outline" suppressHydrationWarning></ion-icon>
                    {Number(g.miembros).toLocaleString(es ? 'es-PE' : 'en-US')} {es ? 'miembros' : 'members'}
                  </span>
                  <span className={styles.meta}>
                    <ion-icon name="radio-button-on" suppressHydrationWarning></ion-icon>
                    {g.activos || 0} {es ? 'activos' : 'active'}
                    <ion-icon name="folder-outline" suppressHydrationWarning></ion-icon>
                    {g.archivos || 0} {es ? 'archivos' : 'files'}
                  </span>
                  <span className={styles.badges}>
                    <span className={g.privacidad === 'privada' ? styles.priv : styles.pub}>
                      {g.privacidad === 'privada' ? (es ? 'Privada' : 'Private') : (es ? 'Pública' : 'Public')}
                    </span>
                    <span className={requiereAprobacion(g) ? styles.priv : styles.pub}>
                      {requiereAprobacion(g) ? (es ? 'Invitación' : 'Invite') : (es ? 'Unirse directo' : 'Open join')}
                    </span>
                    {g.destacado && <span className={styles.vip}>{es ? 'Destacada' : 'Featured'}</span>}
                    {g.miembro && <span className={styles.pub}>{es ? 'Miembro' : 'Member'}</span>}
                    {g.solicitud === 'pendiente' && <span className={styles.priv}>{es ? 'Pendiente' : 'Pending'}</span>}
                  </span>
                </div>
              </button>
              <button
                type="button"
                className={g.miembro ? styles.btnGhost : styles.btn}
                onClick={() => unirse(g)}
              >
                <ion-icon name={g.miembro ? 'exit-outline' : requiereAprobacion(g) ? 'lock-closed-outline' : 'person-add-outline'} suppressHydrationWarning></ion-icon>
                {g.miembro ? (es ? 'Salir' : 'Leave')
                  : requiereAprobacion(g) ? (es ? 'Pedir entrar' : 'Ask to join')
                    : (es ? 'Unirme' : 'Join')}
              </button>
            </article>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className={styles.pager}>
          <button type="button" className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ion-icon name="chevron-back-outline" suppressHydrationWarning></ion-icon>
          </button>
          {rangoPaginas(page, pages).map((n) => (
            <button
              key={n}
              type="button"
              className={`${styles.pageNum} ${page === n ? styles.pageActive : ''}`}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ))}
          <button type="button" className={styles.pageBtn} disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
            <ion-icon name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
          </button>
        </div>
      )}
    </main>
  );
}
