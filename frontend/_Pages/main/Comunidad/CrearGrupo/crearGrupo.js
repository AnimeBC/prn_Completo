'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/_Pages/main/Perfil/perfil.module.css';
import local from './crearGrupo.module.css';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import AuthModal from '@/_Pages/main/Auth/AuthModal';
import ImageCropModal from '@/_Extras/Imagen/ImageCropModal.js';
import { apiComunidad } from '@/_Extras/Comunidad/api.js';

/** Formulario dedicado para crear un grupo (/comunidad/crear-grupo).
 *  Usa el mismo diseño (portada + foto + tarjeta) que /perfil. */
export default function CrearGrupo() {
  const router = useRouter();
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const { authed, userKey } = useAuth();

  const [authOpen, setAuthOpen] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState('');

  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    reglas: '',
    privacidad: 'publica',
  });

  // Portada y foto: se encuadran con el mismo modal que en /perfil.
  const [bannerFile, setBannerFile] = useState(null);   // File recortado (banner)
  const [bannerPrev, setBannerPrev] = useState('');     // URL local para la vista previa
  const [avatarFile, setAvatarFile] = useState(null);   // File recortado (circulo)
  const [avatarPrev, setAvatarPrev] = useState('');

  const [bannerPick, setBannerPick] = useState(null);   // archivo crudo a encuadrar
  const [avatarPick, setAvatarPick] = useState(null);

  const bannerInputRef = useRef(null);
  const avatarInputRef = useRef(null);

  const privada = form.privacidad === 'privada';
  const initial = (form.nombre || 'G').trim().charAt(0).toUpperCase();

  function onPickBanner(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) setBannerPick(f);
  }

  function onPickAvatar(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) setAvatarPick(f);
  }

  function guardarBanner(blob) {
    const f = new File([blob], 'banner.jpg', { type: 'image/jpeg' });
    setBannerPick(null);
    if (bannerPrev) URL.revokeObjectURL(bannerPrev);
    setBannerFile(f);
    setBannerPrev(URL.createObjectURL(f));
  }

  function guardarAvatar(blob) {
    const f = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
    setAvatarPick(null);
    if (avatarPrev) URL.revokeObjectURL(avatarPrev);
    setAvatarFile(f);
    setAvatarPrev(URL.createObjectURL(f));
  }

  async function crear() {
    if (!authed) { setAuthOpen(true); return; }
    if (!form.nombre.trim()) { setMsg(es ? 'Ponle un nombre al grupo.' : 'Give the group a name.'); return; }
    setMsg('');
    setSubiendo(true);
    const fd = new FormData();
    fd.append('userKey', userKey);
    fd.append('nombre', form.nombre.trim());
    fd.append('descripcion', form.descripcion);
    fd.append('reglas', form.reglas);
    fd.append('privacidad', form.privacidad);
    // El modo de union va implicito: privado -> con aprobacion.
    fd.append('modo_union', form.privacidad === 'privada' ? 'invitacion' : 'libre');
    if (avatarFile) fd.append('avatar', avatarFile);
    const r = await apiComunidad.crearGrupo(fd);
    if (r?.error) { setSubiendo(false); setMsg(r.error); return; }

    // Portada: se sube despues de crear (el endpoint necesita el grupo).
    const grupo = r?.grupo;
    if (grupo && bannerFile) {
      try { await apiComunidad.grupoBanner(grupo.id, userKey, bannerFile); } catch { /* opcional */ }
    }
    setSubiendo(false);
    const slug = grupo?.slug || grupo?.id;
    router.push(slug ? `/comunidad/grupo/${slug}` : '/comunidad');
  }

  return (
    <main className={styles.main}>
      <input ref={bannerInputRef} className={styles.avatarInput} type="file" accept="image/*" onChange={onPickBanner} />
      <input ref={avatarInputRef} className={styles.avatarInput} type="file" accept="image/*" onChange={onPickAvatar} />

      <ImageCropModal
        open={!!bannerPick}
        file={bannerPick}
        shape="banner"
        outputSize={1600}
        title={es ? 'Ajusta la portada del grupo' : 'Adjust the group cover'}
        subtitle={es ? 'Arrastra la imagen y usa el zoom para elegir qué parte se muestra.' : 'Drag and zoom to choose which part is shown.'}
        onCancel={() => setBannerPick(null)}
        onSave={guardarBanner}
      />
      <ImageCropModal
        open={!!avatarPick}
        file={avatarPick}
        shape="circle"
        title={es ? 'Ajusta la foto del grupo' : 'Adjust the group photo'}
        subtitle={es ? 'Arrastra y usa el zoom para encuadrarla.' : 'Drag and zoom to frame it.'}
        onCancel={() => setAvatarPick(null)}
        onSave={guardarAvatar}
      />

      {/* ===== Cabecera: portada + foto (mismo diseño que /perfil) ===== */}
      <section className={styles.hero}>
        <div
          className={`${styles.banner} ${styles.bannerEditable}`}
          style={bannerPrev ? { backgroundImage: `url(${bannerPrev})` } : undefined}
          onClick={() => bannerInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) setBannerPick(f); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bannerInputRef.current?.click(); } }}
          aria-label={es ? 'Elegir portada' : 'Choose cover'}
        >
          {!bannerPrev && <span className={styles.bannerGlow} aria-hidden="true" />}
          {!bannerPrev && (
            <div className={styles.bannerHint}>
              <ion-icon name="image-outline" suppressHydrationWarning></ion-icon>
              <span>{es ? 'Toca o arrastra una imagen para la portada' : 'Tap or drop an image for the cover'}</span>
              <button type="button" className={styles.bannerHintBtn} onClick={(e) => { e.stopPropagation(); bannerInputRef.current?.click(); }}>
                <ion-icon name="cloud-upload-outline" suppressHydrationWarning></ion-icon>
                {es ? 'Subir portada' : 'Upload cover'}
              </button>
            </div>
          )}
          {bannerPrev && (
            <button type="button" className={styles.bannerEdit} onClick={(e) => { e.stopPropagation(); bannerInputRef.current?.click(); }}>
              <ion-icon name="image-outline" suppressHydrationWarning></ion-icon>
              {es ? 'Editar portada' : 'Edit cover'}
            </button>
          )}
        </div>

        <div className={styles.head}>
          <div
            className={styles.avatarWrap}
            onClick={() => avatarInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); avatarInputRef.current?.click(); } }}
            aria-label={es ? 'Elegir foto del grupo' : 'Choose group photo'}
          >
            {avatarPrev
              ? <img className={styles.avatarImg} src={avatarPrev} alt="" />
              : <span className={styles.avatarInitial}>{initial}</span>}
            <button
              type="button"
              className={styles.avatarEdit}
              onClick={(e) => { e.stopPropagation(); avatarInputRef.current?.click(); }}
              aria-label={es ? 'Cambiar foto del grupo' : 'Change group photo'}
            >
              <ion-icon name="camera-outline" suppressHydrationWarning></ion-icon>
            </button>
          </div>

          <div className={styles.headInfo}>
            <div className={styles.heroTopLine}>
              <h1 className={styles.heroName}>{form.nombre || (es ? 'Nuevo grupo' : 'New group')}</h1>
              <span className={styles.badge}>
                <ion-icon name="people-outline" className={styles.badgeIcon} suppressHydrationWarning></ion-icon>
                {es ? 'Grupo' : 'Group'}
              </span>
            </div>
            <p className={styles.heroMail}>
              <ion-icon name={privada ? 'lock-closed-outline' : 'globe-outline'} suppressHydrationWarning></ion-icon>
              {privada
                ? (es ? 'Privado · con aprobación' : 'Private · by approval')
                : (es ? 'Público · unirse directo' : 'Public · join directly')}
            </p>
          </div>
        </div>
      </section>

      {/* ===== Formulario del grupo ===== */}
      <div className={local.wrap} style={{ marginTop: 18 }}>
        <form
          className={styles.card}
          onSubmit={(e) => { e.preventDefault(); crear(); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
        >
          <h3 className={styles.cardTitle}>
            <ion-icon name="create-outline" suppressHydrationWarning></ion-icon>
            {es ? 'Datos del grupo' : 'Group details'}
          </h3>

          <div className={local.fieldsGrid}>
            <label className={styles.field}>
              <span className={styles.label}>{es ? 'Nombre del grupo' : 'Group name'}</span>
              <input
                className={styles.input}
                type="text"
                maxLength={120}
                placeholder={es ? 'Ej: Amigos del barrio' : 'e.g. Neighborhood friends'}
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>{es ? 'Privacidad' : 'Privacy'}</span>
              <select
                className={styles.input}
                value={form.privacidad}
                onChange={(e) => setForm({ ...form, privacidad: e.target.value })}
              >
                <option value="publica">{es ? 'Pública' : 'Public'}</option>
                <option value="privada">{es ? 'Privada' : 'Private'}</option>
              </select>
              <span className={styles.hint}>
                <ion-icon name={privada ? 'lock-closed-outline' : 'globe-outline'} suppressHydrationWarning></ion-icon>
                {privada
                  ? (es ? 'Solo por invitación / aprobación.' : 'By invitation / approval only.')
                  : (es ? 'Cualquiera puede unirse directo.' : 'Anyone can join directly.')}
              </span>
            </label>

            <label className={`${styles.field} ${local.full}`}>
              <span className={styles.label}>{es ? 'Descripción' : 'Description'}</span>
              <textarea
                className={styles.input}
                rows={3}
                maxLength={500}
                placeholder={es ? 'De qué trata el grupo' : 'What the group is about'}
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </label>

            <label className={`${styles.field} ${local.full}`}>
              <span className={styles.label}>{es ? 'Reglas' : 'Rules'}</span>
              <textarea
                className={styles.input}
                rows={3}
                maxLength={500}
                placeholder={es ? 'Normas del grupo' : 'Group rules'}
                value={form.reglas}
                onChange={(e) => setForm({ ...form, reglas: e.target.value })}
              />
            </label>
          </div>

          {msg && <p className={styles.msgError}>{msg}</p>}

          <div className={local.actions}>
            <button className={local.cancelBtn} type="button" onClick={() => router.back()}>
              {es ? 'Cancelar' : 'Cancel'}
            </button>
            <button className={styles.primaryBtn} type="submit" disabled={subiendo}>
              <ion-icon name={subiendo ? 'sync-outline' : 'people-outline'} suppressHydrationWarning></ion-icon>
              {subiendo ? (es ? 'Creando…' : 'Creating…') : (es ? 'Crear grupo' : 'Create group')}
            </button>
          </div>
        </form>
      </div>

      <AuthModal open={authOpen} reason="like" onClose={() => setAuthOpen(false)} />
    </main>
  );
}
