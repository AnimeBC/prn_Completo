'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';
import { useTheme } from '@/_Extras/CambiodeColor/ThemeProvider.js';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function AdminLogin() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  const logoSrc = isDark ? '/logo.png' : '/logo_oscuro.png';

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'No se pudo iniciar sesión');
        return;
      }
      const store = remember ? localStorage : sessionStorage;
      store.setItem('pkp_admin_token', data.token);
      store.setItem('pkp_admin', JSON.stringify(data.admin || {}));
      setOk(true);
      setTimeout(() => router.push('/admin'), 700);
    } catch {
      setError('No hay conexión con el servidor. ¿El backend está corriendo en :3001?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <img src={logoSrc} alt="PIKANTE PE" className={styles.logo} />
          <span className={styles.tag}>Panel Admin</span>
          <h1 className={styles.title}>Acceso administrador</h1>
          <p className={styles.subtitle}>Ingresa tus credenciales para continuar</p>
        </div>

        <form className={styles.form} onSubmit={onSubmit}>
          {error && (
            <div className={styles.error}>
              <ion-icon name="alert-circle-outline" suppressHydrationWarning></ion-icon>
              <span>{error}</span>
            </div>
          )}
          {ok && (
            <div className={styles.success}>
              <ion-icon name="checkmark-circle-outline" suppressHydrationWarning></ion-icon>
              <span>Bienvenido. Redirigiendo…</span>
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="usuario">Usuario o correo</label>
            <div className={styles.inputWrap}>
              <ion-icon name="person-outline" className={styles.inputIcon} suppressHydrationWarning></ion-icon>
              <input
                id="usuario"
                className={styles.input}
                type="text"
                autoComplete="username"
                placeholder="admin"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">Contraseña</label>
            <div className={styles.inputWrap}>
              <ion-icon name="lock-closed-outline" className={styles.inputIcon} suppressHydrationWarning></ion-icon>
              <input
                id="password"
                className={styles.input}
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                className={styles.eye}
                type="button"
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPass((v) => !v)}
              >
                <ion-icon name={showPass ? 'eye-off-outline' : 'eye-outline'} suppressHydrationWarning></ion-icon>
              </button>
            </div>
          </div>

          <div className={styles.row}>
            <label className={styles.check}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Recordarme
            </label>
            <a className={styles.link} href="mailto:admin@pikantepe.com">¿Olvidaste tu contraseña?</a>
          </div>

          <button className={styles.submit} type="submit" disabled={loading}>
            {loading ? (
              <ion-icon name="sync-outline" suppressHydrationWarning></ion-icon>
            ) : (
              <ion-icon name="log-in-outline" suppressHydrationWarning></ion-icon>
            )}
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>

          <p className={styles.foot}>
            © {new Date().getFullYear()} PIKANTE PE · <a href="https://www.pikantepe.com">pikantepe.com</a>
          </p>
        </form>
      </div>
    </main>
  );
}
