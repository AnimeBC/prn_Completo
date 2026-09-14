'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './authModal.module.css';
import { useTheme } from '@/_Extras/CambiodeColor/ThemeProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { API_URL } from '@/_Extras/Api/api.js';
import { getUserKey } from '@/_Extras/Interacciones/interactions.js';
import { verifyField } from '@/_Extras/Auth/availability.js';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';

const REASONS = {
  like: { es: 'Para votar necesitas iniciar sesión', en: 'Sign in to vote' },
  follow: { es: 'Para seguir un canal necesitas iniciar sesión', en: 'Sign in to follow a channel' },
  save: { es: 'Para guardar este video necesitas iniciar sesión', en: 'Sign in to save this video' },
  report: { es: 'Para reportar necesitas iniciar sesión', en: 'Sign in to report' },
  download: { es: 'Para descargar necesitas iniciar sesión', en: 'Sign in to download' },
  default: { es: 'Para interactuar necesitas iniciar sesión', en: 'Sign in to interact' },
};

const GoogleIcon = () => (
  <svg className={styles.googleIcon} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.3 0 10.2-2 13.8-5.3l-6.4-5.4C29.3 35 26.8 36 24 36c-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.4 5.4C41.9 34.6 44 29.7 44 24c0-1.3-.1-2.3-.4-3.5z" />
  </svg>
);

export default function AuthModal({ open, onClose, reason = 'default' }) {
  const { isDark } = useTheme();
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const { setAccount } = useAuth();

  const [tab, setTab] = useState('login'); // login | register
  const [step, setStep] = useState('form'); // form | code
  const [logEmail, setLogEmail] = useState('');
  const [logPass, setLogPass] = useState('');
  const [logShow, setLogShow] = useState(false);
  const [regUsuario, setRegUsuario] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regShow, setRegShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const [codeVal, setCodeVal] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [googleCred, setGoogleCred] = useState('');
  const gisReady = useRef(false);

  const guestKey = getUserKey();
  const [uCheck, setUCheck] = useState({ state: 'idle', msg: '' });
  const [eCheck, setECheck] = useState({ state: 'idle', msg: '' });

  const subtitle = (REASONS[reason] || REASONS.default)[es ? 'es' : 'en'];
  const logoSrc = isDark ? '/logo.png' : '/logo_oscuro.png';

  function finishAndClose(userObj) {
    setAccount(userObj || { user_key: guestKey });
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    setStep('form'); setCodeVal(''); setMsg(''); setOk('');
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Google Identity Services
  useEffect(() => {
    if (!open) return;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || typeof window === 'undefined') return;

    function init() {
      if (!window.google?.accounts?.id) return;
      if (!gisReady.current) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => setGoogleCred(resp.credential || ''),
        });
        gisReady.current = true;
      }
      const el = document.getElementById('g_id_modal');
      if (el && !el.dataset.rendered) {
        const w = Math.min(400, Math.max(240, Math.round(el.clientWidth || 320)));
        window.google.accounts.id.renderButton(el, {
          theme: 'outline', size: 'large', width: w, text: 'continue_with', logo_alignment: 'left',
        });
        el.dataset.rendered = '1';
        const stretch = () => {
          el.querySelectorAll('div, iframe').forEach((n) => {
            n.style.setProperty('width', '100%', 'important');
            n.style.setProperty('min-width', '100%', 'important');
            n.style.setProperty('max-width', 'none', 'important');
            n.style.setProperty('height', '100%', 'important');
          });
        };
        stretch();
        setTimeout(stretch, 400);
      }
    }

    if (window.google?.accounts?.id) { init(); return; }
    let s = document.getElementById('gsi-script');
    if (!s) {
      s = document.createElement('script');
      s.id = 'gsi-script';
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = init;
      document.body.appendChild(s);
    } else {
      s.addEventListener('load', init);
      return () => s.removeEventListener('load', init);
    }
  }, [open, tab, step]);

  useEffect(() => {
    if (!googleCred) return;
    (async () => {
      setBusy(true);
      setMsg('');
      try {
        const r = await fetch(`${API_URL}/api/auth/profile/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: googleCred, userKey: getUserKey() }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setMsg(j.error || (es ? 'No se pudo entrar con Google' : 'Google sign-in failed')); return; }
        finishAndClose(j.user);
      } catch {
        setMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
      } finally {
        setGoogleCred('');
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleCred]);

  async function doLogin(e) {
    e.preventDefault();
    setBusy(true); setMsg(''); setOk('');
    try {
      const r = await fetch(`${API_URL}/api/auth/profile/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: logEmail, password: logPass, guestKey: getUserKey() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.code === 'email_not_verified') { setPendingEmail(logEmail); setStep('code'); }
        setMsg(j.error || (es ? 'No se pudo iniciar sesión' : 'Sign-in failed'));
        return;
      }
      finishAndClose(j.user);
    } catch {
      setMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    } finally {
      setBusy(false);
    }
  }

  async function doRegister(e) {
    e.preventDefault();
    setMsg(''); setOk('');
    setBusy(true);
    try {
      const [u, em] = await Promise.all([
        verifyField({ field: 'usuario', value: regUsuario, userKey: guestKey, es }),
        verifyField({ field: 'email', value: regEmail, userKey: guestKey, es }),
      ]);
      setUCheck(u); setECheck(em);
      if (u.state !== 'ok') { setMsg(u.msg); return; }
      if (em.state !== 'ok') { setMsg(em.msg); return; }

      const r = await fetch(`${API_URL}/api/auth/profile/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey: guestKey, nombre: regUsuario, usuario: regUsuario, email: regEmail, password: regPass }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error || (es ? 'No se pudo crear la cuenta' : 'Could not create the account')); return; }
      setPendingEmail(regEmail);
      setRegPass('');
      setCodeVal('');
      setStep('code');
    } catch {
      setMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    } finally {
      setBusy(false);
    }
  }

  async function doVerifyCode(e) {
    e.preventDefault();
    setCodeBusy(true); setMsg(''); setOk('');
    try {
      const r = await fetch(`${API_URL}/api/auth/profile/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey: guestKey, code: codeVal }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error || (es ? 'No se pudo verificar el código' : 'Could not verify the code')); return; }
      finishAndClose(j.user || { user_key: guestKey });
    } catch {
      setMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    } finally {
      setCodeBusy(false);
    }
  }

  async function resendVerification() {
    setMsg(''); setOk('');
    try {
      const r = await fetch(`${API_URL}/api/auth/profile/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey: guestKey }),
      });
      const j = await r.json().catch(() => ({}));
      setOk(j.ok ? (es ? 'Código reenviado. Revisa tu bandeja.' : 'Code resent. Check your inbox.') : (j.error || ''));
    } catch {
      setMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    }
  }

  const availCls = (a) => (a.state === 'ok' ? styles.hintOk : a.state === 'taken' || a.state === 'invalid' ? styles.hintBad : styles.hint);
  const availIcon = (a) => (a.state === 'ok' ? 'checkmark-circle-outline' : a.state === 'checking' ? 'sync-outline' : a.state === 'idle' ? null : 'alert-circle-outline');

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.card}>
        <button className={styles.close} type="button" onClick={onClose} aria-label={es ? 'Cerrar' : 'Close'}>
          <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
        </button>

        <img src={logoSrc} alt="PIKANTE PE" className={styles.logo} />

        <h2 className={styles.title}>{es ? 'Entra o crea tu cuenta' : 'Sign in or create your account'}</h2>
        <p className={styles.text}>
          <span className={styles.highlight}>{subtitle}.</span>{' '}
          {es ? 'Tu actividad se conserva.' : 'Your activity is kept.'}
        </p>

        {step === 'code' ? (
          <form className={styles.form} onSubmit={doVerifyCode}>
            <p className={styles.codeIntro}>
              <ion-icon name="mail-unread-outline" suppressHydrationWarning></ion-icon>
              {es ? `Enviamos un código de 6 dígitos a ${pendingEmail}.` : `We sent a 6-digit code to ${pendingEmail}.`}
            </p>
            <div className={styles.control}>
              <ion-icon name="keypad-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
              <input
                className={`${styles.ctrlInput} ${styles.codeInput}`}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={codeVal}
                onChange={(e) => setCodeVal(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </div>

            {msg && <p className={styles.msgError}>{msg}</p>}
            {ok && <p className={styles.okMsg}>{ok}</p>}

            <button className={styles.cta} type="submit" disabled={codeBusy || codeVal.length !== 6}>
              {codeBusy ? (es ? 'Verificando…' : 'Verifying…') : (es ? 'Verificar cuenta' : 'Verify account')}
            </button>
            <div className={styles.codeLinks}>
              <button type="button" className={styles.linkBtn} onClick={resendVerification}>
                {es ? 'Reenviar código' : 'Resend code'}
              </button>
              <button type="button" className={styles.linkBtn} onClick={() => { setStep('form'); setMsg(''); setOk(''); }}>
                {es ? 'Cambiar datos' : 'Change details'}
              </button>
            </div>
          </form>
        ) : (
        <>
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'login'}
            className={`${styles.tab} ${tab === 'login' ? styles.tabActive : ''}`}
            onClick={() => { setTab('login'); setMsg(''); setOk(''); }}
          >
            <ion-icon name="log-in-outline" suppressHydrationWarning></ion-icon>
            {es ? 'Iniciar sesión' : 'Sign in'}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'register'}
            className={`${styles.tab} ${tab === 'register' ? styles.tabActive : ''}`}
            onClick={() => { setTab('register'); setMsg(''); setOk(''); }}
          >
            <ion-icon name="person-add-outline" suppressHydrationWarning></ion-icon>
            {es ? 'Crear cuenta' : 'Sign up'}
          </button>
        </div>

        {tab === 'login' ? (
          <form className={styles.form} onSubmit={doLogin}>
            <div className={styles.control}>
              <ion-icon name="mail-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
              <input
                className={styles.ctrlInput}
                type="email"
                name="email"
                autoComplete="email"
                placeholder={es ? 'Correo electrónico' : 'Email'}
                value={logEmail}
                onChange={(e) => setLogEmail(e.target.value)}
                required
              />
            </div>
            <div className={styles.control}>
              <ion-icon name="lock-closed-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
              <input
                className={styles.ctrlInput}
                type={logShow ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder={es ? 'Contraseña' : 'Password'}
                value={logPass}
                onChange={(e) => setLogPass(e.target.value)}
                required
              />
              <button type="button" className={styles.ctrlEye} onClick={() => setLogShow((v) => !v)} aria-label="Ver contraseña">
                <ion-icon name={logShow ? 'eye-off-outline' : 'eye-outline'} suppressHydrationWarning></ion-icon>
              </button>
            </div>

            {msg && <p className={styles.msgError}>{msg}</p>}
            {ok && <p className={styles.okMsg}>{ok}</p>}
            {pendingEmail && !ok && (
              <button type="button" className={styles.linkBtn} onClick={resendVerification}>
                {es ? 'Reenviar correo de verificación' : 'Resend verification email'}
              </button>
            )}

            <button className={styles.cta} type="submit" disabled={busy}>
              {busy ? (es ? 'Ingresando…' : 'Signing in…') : (es ? 'Iniciar sesión' : 'Sign in')}
            </button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={doRegister}>
            <div className={styles.control}>
              <ion-icon name="at-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
              <input
                className={styles.ctrlInput}
                type="text"
                name="username"
                autoComplete="username"
                maxLength={30}
                placeholder={es ? 'Nombre de usuario (ej: juan_pe)' : 'Username (e.g. juan_pe)'}
                  value={regUsuario}
                  onChange={(e) => { setRegUsuario(e.target.value.replace(/\s/g, '')); setUCheck({ state: 'idle', msg: '' }); }}
                  required
              />
            </div>
            {availIcon(uCheck) && (
              <p className={availCls(uCheck)}>
                <ion-icon name={availIcon(uCheck)} className={uCheck.state === 'checking' ? styles.spin : ''} suppressHydrationWarning></ion-icon>
                {uCheck.msg || (es ? 'Verificando…' : 'Checking…')}
              </p>
            )}
            <div className={styles.control}>
              <ion-icon name="mail-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
              <input
                className={styles.ctrlInput}
                type="email"
                name="email"
                autoComplete="email"
                placeholder={es ? 'Correo electrónico' : 'Email'}
                  value={regEmail}
                  onChange={(e) => { setRegEmail(e.target.value); setECheck({ state: 'idle', msg: '' }); }}
                  required
              />
            </div>
            {availIcon(eCheck) && (
              <p className={availCls(eCheck)}>
                <ion-icon name={availIcon(eCheck)} className={eCheck.state === 'checking' ? styles.spin : ''} suppressHydrationWarning></ion-icon>
                {eCheck.msg || (es ? 'Verificando…' : 'Checking…')}
              </p>
            )}
            <div className={styles.control}>
              <ion-icon name="lock-closed-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
              <input
                className={styles.ctrlInput}
                type={regShow ? 'text' : 'password'}
                name="password"
                autoComplete="new-password"
                minLength={6}
                placeholder={es ? 'Contraseña (mín. 6)' : 'Password (min 6)'}
                value={regPass}
                onChange={(e) => setRegPass(e.target.value)}
                required
              />
              <button type="button" className={styles.ctrlEye} onClick={() => setRegShow((v) => !v)} aria-label="Ver contraseña">
                <ion-icon name={regShow ? 'eye-off-outline' : 'eye-outline'} suppressHydrationWarning></ion-icon>
              </button>
            </div>

            {msg && <p className={styles.msgError}>{msg}</p>}
            {ok && <p className={styles.okMsg}>{ok}</p>}

            <button className={styles.cta} type="submit" disabled={busy}>
              {busy ? (es ? 'Creando…' : 'Creating…') : (es ? 'Crear cuenta' : 'Create account')}
            </button>
          </form>
        )}

        <div className={styles.divider}>{es ? 'o continúa con' : 'or continue with'}</div>

        <div className={styles.googleWrap}>
          <button
            className={styles.googleBtn}
            type="button"
            onClick={() => { if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) setMsg(es ? 'Google no configurado (falta NEXT_PUBLIC_GOOGLE_CLIENT_ID).' : 'Google not configured.'); }}
          >
            <GoogleIcon />
            <span>{es ? 'Continuar con Google' : 'Continue with Google'}</span>
          </button>
          <div id="g_id_modal" className={styles.gsiMount} aria-hidden="true" />
        </div>
        </>
        )}

        <div className={styles.badges}>
          <span className={styles.badge}>
            <ion-icon name="shield-checkmark-outline" className={styles.badgeDanger} suppressHydrationWarning></ion-icon>
            {es ? 'Mayor 18' : '18+'}
          </span>
          <span className={styles.badge}>
            <ion-icon name="lock-closed-outline" className={styles.badgeIcon} suppressHydrationWarning></ion-icon>
            {es ? 'Seguridad' : 'Security'}
          </span>
        </div>

        <p className={styles.foot}>
          {es ? 'Al continuar aceptas nuestros ' : 'By continuing you accept our '}
          <a href="/legal#terminos" target="_blank" rel="noopener">{es ? 'Términos' : 'Terms'}</a>.
        </p>
      </div>
    </div>
  );
}
