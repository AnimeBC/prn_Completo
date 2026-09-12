'use client';

import { useState } from 'react';
import styles from './comentarios.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

const SEED = [
  { id: 1, user: 'LatinoHot88', time: 'hace 2 horas', text: 'Ese plano del minuto 6 es cine puro.', likes: 214, replies: [] },
  { id: 2, user: 'MorochaFan', time: 'hace 5 horas', text: 'La química entre los dos es otra cosa.', likes: 156, replies: [] },
  { id: 3, user: 'NocturnoPe', time: 'hace 8 horas', text: '¿Alguien más repitió la escena 3 veces?', likes: 98, replies: [] },
];

export default function Comentarios({ videoId }) {
  const { t } = useLanguage();
  const [comments, setComments] = useState(SEED);
  const [draft, setDraft] = useState('');
  const [sort, setSort] = useState('top');
  const [likedIds, setLikedIds] = useState({});
  const [openReplies, setOpenReplies] = useState({});

  function post() {
    const text = draft.trim();
    if (!text) return;
    setComments((prev) => [
      { id: Date.now(), user: 'You', time: 'just now', text, likes: 0, replies: [] },
      ...prev,
    ]);
    setDraft('');
  }

  function toggleLike(id) {
    setLikedIds((prev) => {
      const liked = !prev[id];
      setComments((list) =>
        list.map((c) =>
          c.id === id ? { ...c, likes: c.likes + (liked ? 1 : -1) } : c
        )
      );
      return { ...prev, [id]: liked };
    });
  }

  function toggleReplies(id) {
    setOpenReplies((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const shown = [...comments].sort((a, b) =>
    sort === 'new' ? b.id - a.id : b.likes - a.likes
  );

  return (
    <section className={styles.box}>
      <div className={styles.head}>
        <h3 className={styles.title}>{comments.length} {t('comentarios.titulo')}</h3>
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
        <div className={styles.avatar}>T</div>
        <div className={styles.addBox}>
          <input
            className={styles.input}
            type="text"
            placeholder={t('comentarios.agrega')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled
          />
          <div className={styles.addActions}>
            <button className={styles.cancelBtn} type="button" onClick={() => setDraft('')} disabled>
              {t('comentarios.cancelar')}
            </button>
            <button
              className={styles.postBtn}
              type="button"
              disabled
            >
              {t('comentarios.comentar')}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.lockWrap}>
        <div className={`${styles.list} ${styles.locked}`} key={`${videoId}-${sort}`} aria-hidden="true">
        {shown.map((c) => (
          <div key={c.id} className={styles.comment}>
            <div className={styles.avatar}>{c.user.charAt(0).toUpperCase()}</div>
            <div className={styles.commentBody}>
              <div className={styles.commentHead}>
                <span className={styles.user}>{c.user}</span>
                <span className={styles.time}>{c.time}</span>
              </div>
              <p className={styles.text}>{c.text}</p>
              <div className={styles.commentActions}>
                <button
                  className={`${styles.likeBtn} ${likedIds[c.id] ? styles.liked : ''}`}
                  type="button"
                  onClick={() => toggleLike(c.id)}
                  aria-label="Like comment"
                >
                  <ion-icon name={likedIds[c.id] ? 'thumbs-up-sharp' : 'thumbs-up-outline'} className={styles.likeIcon} suppressHydrationWarning></ion-icon>
                  {c.likes}
                </button>
                <button className={styles.replyBtn} type="button">
                  <ion-icon name="thumbs-down-outline" className={styles.likeIcon} suppressHydrationWarning></ion-icon>
                </button>
                {c.replies.length > 0 && (
                  <button className={styles.repliesToggle} type="button" onClick={() => toggleReplies(c.id)}>
                    <ion-icon name={openReplies[c.id] ? 'chevron-up-outline' : 'chevron-down-outline'} className={styles.likeIcon} suppressHydrationWarning></ion-icon>
                    {c.replies.length} {c.replies.length === 1 ? t('comentarios.respuesta') : t('comentarios.respuestas')}
                  </button>
                )}
                <button className={styles.replyBtn} type="button">{t('comentarios.responder')}</button>
              </div>
              {openReplies[c.id] && c.replies.length > 0 && (
                <div className={styles.replies}>
                  {c.replies.map((r) => (
                    <div key={r.id} className={styles.reply}>
                      <div className={styles.avatarSm}>{r.user.charAt(0).toUpperCase()}</div>
                      <div>
                        <div className={styles.commentHead}>
                          <span className={styles.user}>{r.user}</span>
                          <span className={styles.time}>{r.time}</span>
                        </div>
                        <p className={styles.text}>{r.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        </div>
        <div className={styles.lockOverlay}>
          <div className={styles.lockCard}>
            <ion-icon name="construct-outline" className={styles.lockIcon} suppressHydrationWarning></ion-icon>
            <p className={styles.lockTitle}>{t('comentarios.mantenimiento')}</p>
            <p className={styles.lockText}>{t('comentarios.mantenimientoSub')}</p>
            <p className={styles.lockFav}>
              <ion-icon name="star-outline" className={styles.lockStar} suppressHydrationWarning></ion-icon>
              {t('comentarios.favoritos')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
