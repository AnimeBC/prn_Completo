'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './compositor.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { mediaUrl } from '@/_Extras/Api/api.js';
import { apiComunidad } from '@/_Extras/Comunidad/api.js';

export default function Compositor({ open, onClose, userKey, onSent }) {
  const { locale } = useLanguage();
  const es = locale !== 'en';

  const [q, setQ] = useState('');
  const [usuarios, setUsuarios] = useState([]);
  const [sel, setSel] = useState([]);
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const buscar = useCallback(async (query) => {
    if (!userKey) return;
    const r = await apiComunidad.buscarUsuarios(query, userKey);
    setUsuarios(r?.data || []);
  }, [userKey]);

  useEffect(() => {
    if (!open) return;
    setMsg('');
    setTexto('');
    setSel([]);
    setQ('');
    buscar('');
  }, [open, buscar]);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => buscar(q.trim()), 260);
    return () => clearTimeout(t);
  }, [q, open, buscar]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function toggle(u) {
    setSel((cur) => (cur.some((x) => x.id === u.id) ? cur.filter((x) => x.id !== u.id) : [...cur, u]));
  }

  async function enviar() {
    if (!sel.length) { setMsg(es ? 'Elige al menos un destinatario.' : 'Pick at least one recipient.'); return; }
    if (!texto.trim()) { setMsg(es ? 'Escribe un mensaje.' : 'Write a message.'); return; }
    setBusy(true); setMsg('');
    const r = await apiComunidad.mensajeMasivo(userKey, sel.map((u) => u.id), texto.trim());
    setBusy(false);
    if (r?.error) { setMsg(r.error); return; }
    setMsg('');
    if (onSent) onSent(r?.enviados || sel.length);
    onClose();
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.card}>
        <div className={styles.head}>
          <h3 className={styles.title}>{es ? 'Nuevo mensaje' : 'New message'}</h3>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
            <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
          </button>
        </div>

        <div className={styles.searchBox}>
          <ion-icon name="search-outline" className={styles.searchIcon} suppressHydrationWarning></ion-icon>
          <input
            className={styles.searchInput}
            placeholder={es ? 'Buscar usuario' : 'Search user'}
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {sel.length > 0 && (
          <div className={styles.chips}>
            {sel.map((u) => (
              <button key={u.id} type="button" className={styles.chip} onClick={() => toggle(u)}>
                {u.usuario || u.nombre}
                <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
              </button>
            ))}
          </div>
        )}

        <div className={styles.list}>
          {usuarios.length === 0 ? (
            <p className={styles.muted}>{es ? 'Sin usuarios.' : 'No users.'}</p>
          ) : usuarios.map((u) => {
            const active = sel.some((x) => x.id === u.id);
            return (
              <button
                key={u.id}
                type="button"
                className={`${styles.userRow} ${active ? styles.userActive : ''}`}
                onClick={() => toggle(u)}
              >
                {u.avatar
                  ? <img className={styles.avatar} src={mediaUrl(u.avatar)} alt="" />
                  : <span className={styles.avatarFallback}>{(u.usuario || u.nombre || '?').charAt(0).toUpperCase()}</span>}
                <span className={styles.userInfo}>
                  <strong className={styles.userName}>{u.nombre || u.usuario}</strong>
                  {u.usuario && <span className={styles.userHandle}>@{u.usuario}</span>}
                </span>
                <ion-icon
                  name={active ? 'checkmark-circle' : 'ellipse-outline'}
                  className={active ? styles.checkOn : styles.checkOff}
                  suppressHydrationWarning
                ></ion-icon>
              </button>
            );
          })}
        </div>

        <textarea
          className={styles.textarea}
          rows={3}
          maxLength={1000}
          placeholder={es ? 'Escribe tu mensaje…' : 'Write your message…'}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />

        {msg && <p className={styles.error}>{msg}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onClose}>{es ? 'Cancelar' : 'Cancel'}</button>
          <button type="button" className={styles.primary} onClick={enviar} disabled={busy}>
            <ion-icon name={busy ? 'sync-outline' : 'paper-plane-outline'} className={busy ? styles.spin : ''} suppressHydrationWarning></ion-icon>
            {busy ? (es ? 'Enviando…' : 'Sending…') : (es ? `Enviar a ${sel.length || ''}`.trim() : `Send to ${sel.length || ''}`.trim())}
          </button>
        </div>
      </div>
    </div>
  );
}
