'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './comentarios.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { API_URL, mediaUrl } from '@/_Extras/Api/api.js';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import AuthModal from '@/_Pages/main/Auth/AuthModal';

function timeAgo(dateStr, es) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return es ? 'hace un momento' : 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return es ? `hace ${m} min` : `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return es ? `hace ${h} h` : `${h} h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return es ? `hace ${days} d` : `${days} d ago`;
  return d.toLocaleDateString(es ? 'es-PE' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Avatar({ user, small }) {
  const src = user?.avatar ? mediaUrl(user.avatar) : '';
  const initial = String(user?.name || '?').trim().charAt(0).toUpperCase() || '?';
  const cls = small ? styles.avatarSm : styles.avatar;
  return src
    ? <img className={`${cls} ${styles.avatarImg}`} src={src} alt="" />
    : <div className={cls}>{initial}</div>;
}

function updateLike(list, id, myLike, likes) {
  return list.map((c) => ({
    ...c,
    ...(c.id === id ? { my_like: myLike, likes } : {}),
    replies: (c.replies || []).map((r) => (r.id === id ? { ...r, my_like: myLike, likes } : r)),
  }));
}

export default function Comentarios({ videoId }) {
  const { t, locale } = useLanguage();
  const es = locale !== 'en';

  const [comments, setComments] = useState([]);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState('top');
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [openReplies, setOpenReplies] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [error, setError] = useState('');

  const { user: me, authed, userKey: key } = useAuth();

  const loadComments = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/videos/${videoId}/comments?userKey=${encodeURIComponent(key)}&sort=${sort}`);
      const j = await r.json().catch(() => ({}));
      setComments(j.data || []);
      setTotal(j.total || 0);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [videoId, key, sort]);

  useEffect(() => { setLoading(true); loadComments(); }, [loadComments]);

  async function submit(texto, parentId = null) {
    if (!authed) { setAuthOpen(true); return; }
    const body = String(texto || '').trim();
    if (!body) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`${API_URL}/api/videos/${videoId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey: key, texto: body, parent_id: parentId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || (es ? 'No se pudo enviar el comentario' : 'Could not send the comment')); return; }
      if (parentId) { setReplyTo(null); setReplyDraft(''); setOpenReplies((p) => ({ ...p, [parentId]: true })); }
      else { setDraft(''); }
      await loadComments();
    } catch {
      setError(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleLike(id) {
    if (!authed) { setAuthOpen(true); return; }
    try {
      const r = await fetch(`${API_URL}/api/comments/${id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey: key }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return;
      setComments((list) => updateLike(list, id, j.my_like, j.likes));
    } catch { /* noop */ }
  }

  async function remove(id) {
    if (typeof window !== 'undefined' && !window.confirm(es ? '¿Eliminar este comentario?' : 'Delete this comment?')) return;
    try {
      const r = await fetch(`${API_URL}/api/comments/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey: key }),
      });
      if (r.ok) loadComments();
    } catch { /* noop */ }
  }

  const list = comments;

  return (
    <section className={styles.box}>
      <div className={styles.head}>
        <h3 className={styles.title}>{total} {t('comentarios.titulo')}</h3>
        <div className={styles.sortBtns}>
          <button
            className={`${styles.sortBtn} ${sort === 'top' ? styles.sortActive : ''}`}
            type="button"
            onClick={() => setSort('top')}
          >
            {t('comentarios.relevantes')}
          </button>
          <button
            className={`${styles.sortBtn} ${sort === 'new' ? styles.sortActive : ''}`}
            type="button"
            onClick={() => setSort('new')}
          >
            {t('comentarios.recientes')}
          </button>
        </div>
      </div>

      <div className={styles.addRow}>
        <Avatar user={authed ? { name: me.nombre || me.usuario, avatar: me.avatar } : { name: '?' }} />
        <div className={styles.addBox}>
          <input
            className={styles.input}
            type="text"
            maxLength={2000}
            placeholder={authed ? t('comentarios.agrega') : (es ? 'Inicia sesión para comentar...' : 'Sign in to comment...')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => { if (!authed) setAuthOpen(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(draft); } }}
          />
          {draft.trim() && (
            <div className={styles.addActions}>
              <button className={styles.cancelBtn} type="button" onClick={() => setDraft('')}>
                {t('comentarios.cancelar')}
              </button>
              <button
                className={`${styles.postBtn} ${styles.postReady}`}
                type="button"
                disabled={busy}
                onClick={() => submit(draft)}
              >
                {busy ? (es ? 'Enviando...' : 'Sending...') : t('comentarios.comentar')}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className={styles.error}>
          <ion-icon name="alert-circle-outline" suppressHydrationWarning></ion-icon> {error}
        </p>
      )}

      {loading ? (
        <div className={styles.loading}>
          <ion-icon name="sync-outline" className={styles.spin} suppressHydrationWarning></ion-icon>
          {es ? 'Cargando comentarios...' : 'Loading comments...'}
        </div>
      ) : list.length === 0 ? (
        <div className={styles.empty}>
          <ion-icon name="chatbubbles-outline" suppressHydrationWarning></ion-icon>
          <p>{es ? 'Sé el primero en comentar.' : 'Be the first to comment.'}</p>
        </div>
      ) : (
        <div className={styles.list}>
          {list.map((c) => (
            <div key={c.id} className={styles.comment}>
              <Avatar user={c.author} />
              <div className={styles.commentBody}>
                <div className={styles.commentHead}>
                  <span className={styles.user}>{c.author.name}</span>
                  {c.author.verified && <ion-icon name="checkmark-circle" className={styles.verified} suppressHydrationWarning></ion-icon>}
                  <span className={styles.time}>{timeAgo(c.created_at, es)}</span>
                </div>
                <p className={styles.text}>{c.texto}</p>
                <div className={styles.commentActions}>
                  <button
                    className={`${styles.likeBtn} ${c.my_like ? styles.liked : ''}`}
                    type="button"
                    onClick={() => toggleLike(c.id)}
                    aria-label="Like comment"
                  >
                    <ion-icon name={c.my_like ? 'thumbs-up-sharp' : 'thumbs-up-outline'} className={styles.likeIcon} suppressHydrationWarning></ion-icon>
                    {c.likes}
                  </button>
                  <button className={styles.replyBtn} type="button" onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyDraft(''); }}>
                    {t('comentarios.responder')}
                  </button>
                  {c.mine && (
                    <button className={styles.deleteBtn} type="button" onClick={() => remove(c.id)}>
                      <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Eliminar' : 'Delete'}
                    </button>
                  )}
                  {c.replies.length > 0 && (
                    <button className={styles.repliesToggle} type="button" onClick={() => setOpenReplies((p) => ({ ...p, [c.id]: !p[c.id] }))}>
                      <ion-icon name={openReplies[c.id] ? 'chevron-up-outline' : 'chevron-down-outline'} className={styles.likeIcon} suppressHydrationWarning></ion-icon>
                      {c.replies.length} {c.replies.length === 1 ? t('comentarios.respuesta') : t('comentarios.respuestas')}
                    </button>
                  )}
                </div>

                {replyTo === c.id && (
                  <div className={styles.replyBox}>
                    <input
                      className={styles.input}
                      type="text"
                      maxLength={2000}
                      placeholder={es ? 'Responde a ' + c.author.name + '...' : 'Reply to ' + c.author.name + '...'}
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(replyDraft, c.id); } }}
                    />
                    <div className={styles.addActions}>
                      <button className={styles.cancelBtn} type="button" onClick={() => { setReplyTo(null); setReplyDraft(''); }}>
                        {t('comentarios.cancelar')}
                      </button>
                      <button
                        className={`${styles.postBtn} ${replyDraft.trim() ? styles.postReady : ''}`}
                        type="button"
                        disabled={busy || !replyDraft.trim()}
                        onClick={() => submit(replyDraft, c.id)}
                      >
                        {t('comentarios.comentar')}
                      </button>
                    </div>
                  </div>
                )}

                {openReplies[c.id] && c.replies.length > 0 && (
                  <div className={styles.replies}>
                    {c.replies.map((rep) => (
                      <div key={rep.id} className={styles.reply}>
                        <Avatar user={rep.author} small />
                        <div className={styles.commentBody}>
                          <div className={styles.commentHead}>
                            <span className={styles.user}>{rep.author.name}</span>
                            {rep.author.verified && <ion-icon name="checkmark-circle" className={styles.verified} suppressHydrationWarning></ion-icon>}
                            <span className={styles.time}>{timeAgo(rep.created_at, es)}</span>
                          </div>
                          <p className={styles.text}>{rep.texto}</p>
                          <div className={styles.commentActions}>
                            <button
                              className={`${styles.likeBtn} ${rep.my_like ? styles.liked : ''}`}
                              type="button"
                              onClick={() => toggleLike(rep.id)}
                              aria-label="Like reply"
                            >
                              <ion-icon name={rep.my_like ? 'thumbs-up-sharp' : 'thumbs-up-outline'} className={styles.likeIcon} suppressHydrationWarning></ion-icon>
                              {rep.likes}
                            </button>
                            <button className={styles.replyBtn} type="button" onClick={() => { setReplyTo(c.id); setReplyDraft(''); }}>
                              {t('comentarios.responder')}
                            </button>
                            {rep.mine && (
                              <button className={styles.deleteBtn} type="button" onClick={() => remove(rep.id)}>
                                <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
                                {es ? 'Eliminar' : 'Delete'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AuthModal open={authOpen} reason="default" onClose={() => setAuthOpen(false)} />
    </section>
  );
}
