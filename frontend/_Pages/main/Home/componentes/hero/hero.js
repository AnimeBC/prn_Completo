'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hero.module.css';
import { useTheme } from '@/_Extras/CambiodeColor/ThemeProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { videoUrl } from '@/_Extras/Datos/urls.js';

const suggestions = [
  { label: 'nav.tendencias', href: '/tendencias', icon: 'trending-up-outline' },
  { label: 'nav.recienSubidos', href: '/videos', icon: 'sparkles-outline' },
  { label: 'nav.fetiches', href: '/fetiches', icon: 'flame-outline' },
  { label: 'nav.packs', href: '/packs', icon: 'cube-outline' },
  { label: 'nav.comunidad', href: '/comunidad', icon: 'people-outline' },
];

const slides = [
  {
    id: 'welcome',
    eyebrow: 'hero.bienvenida',
    title: 'hero.holaCasa',
    text: 'hero.holaSub',
    primary: { label: 'hero.explorar', href: '/tendencias' },
    secondary: { label: 'hero.verNuevo', href: '/videos' },
  },
  {
    id: 'aviso',
    eyebrow: 'hero.aviso',
    title: 'hero.mejoramos',
    text: 'hero.avisoTexto',
    primary: { label: 'hero.verNuevo', href: '/videos' },
    secondary: null,
  },
];

export default function Hero() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const { videos } = useContenido();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const logoSrc = isDark ? '/logo.png' : '/logo_oscuro.png';

  const tendencias = (videos || []).filter((v) => v.isTendencia).sort((a, b) => Number(b.id) - Number(a.id));
  const newest = [...(videos || [])].sort((a, b) => Number(b.id) - Number(a.id));
  const rec = tendencias[0] || newest[0] || null;

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, 7000);
    return () => clearInterval(t);
  }, [paused]);

  function go(dir) {
    setIndex((i) => (i + dir + slides.length) % slides.length);
  }

  const slide = slides[index];

  return (
    <section
      className={styles.hero}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className={styles.waves} aria-hidden="true" />

      <div className={styles.textCol} key={slide.id}>
        {slide.id === 'welcome' ? (
          <span className={styles.logoBadge}>
            <img src={logoSrc} alt="PICANTE.pe" className={styles.logoBadgeImg} />
            {t(slide.eyebrow)}
          </span>
        ) : (
          <span className={styles.eyebrow}>
            <ion-icon name="construct-outline" className={styles.eyebrowIcon} suppressHydrationWarning></ion-icon>
            {t(slide.eyebrow)}
          </span>
        )}
        <h2 className={styles.title}>{t(slide.title)}</h2>
        <p className={styles.text}>{t(slide.text)}</p>

        {slide.id === 'welcome' && (
          <div className={styles.suggestions}>
            {suggestions.map((s) => (
              <button
                key={s.label}
                className={styles.suggChip}
                type="button"
                onClick={() => router.push(s.href)}
              >
                <ion-icon name={s.icon} className={styles.suggIcon} suppressHydrationWarning></ion-icon>
                {t(s.label)}
              </button>
            ))}
          </div>
        )}

        <div className={styles.ctaRow}>
          <button className={styles.cta} type="button" onClick={() => router.push(slide.primary.href)}>
            {t(slide.primary.label)}
            <ion-icon name="arrow-forward-outline" className={styles.ctaIcon} suppressHydrationWarning></ion-icon>
          </button>
          {slide.secondary && (
            <button className={styles.ctaGhost} type="button" onClick={() => router.push(slide.secondary.href)}>
              {t(slide.secondary.label)}
            </button>
          )}
        </div>
      </div>

      <div className={styles.visual}>
        <div
          className={styles.visualMedia}
          role="link"
          tabIndex={0}
          onClick={() => router.push(rec ? videoUrl(rec) : '/videos/fetiches/1')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              router.push(rec ? videoUrl(rec) : '/videos/fetiches/1');
            }
          }}
        >
          <img src={rec?.thumb || rec?.src ? rec.thumb : "/home/hero1.png"} alt={rec?.title || "Bienvenida de la familia PICANTE.pe"} className={styles.visualImg} onError={(e)=>{e.currentTarget.src="/home/hero1.png"}} />
          <span className={styles.bestBadge}>
            <ion-icon name="star" className={styles.bestIcon} suppressHydrationWarning></ion-icon>
            {t('hero.mejorRec')}
          </span>
          <button
            className={styles.playBtn}
            type="button"
            aria-label="Reproducir video recomendado"
            onClick={(e) => {
              e.stopPropagation();
              router.push(rec ? videoUrl(rec) : '/videos/fetiches/1');
            }}
          >
            <ion-icon name="play-sharp" className={styles.playIcon} suppressHydrationWarning></ion-icon>
          </button>
        </div>
        <div className={styles.visualFoot}>
          <h3 className={styles.visualTitle}>{rec?.title || 'Familia Japonesa :3'}</h3>
          <div className={styles.visualTags}>
            {(rec?.tags?.length ? rec.tags : ['trending','HD','JAV']).slice(0,6).map((tag) => (
              <button
                key={tag}
                className={styles.visualTag}
                type="button"
                onClick={() => router.push('/fetiches')}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        className={`${styles.arrow} ${styles.arrowLeft}`}
        type="button"
        aria-label="Anterior"
        onClick={() => go(-1)}
      >
        <ion-icon name="chevron-back-outline" suppressHydrationWarning></ion-icon>
      </button>
      <button
        className={`${styles.arrow} ${styles.arrowRight}`}
        type="button"
        aria-label="Siguiente"
        onClick={() => go(1)}
      >
        <ion-icon name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
      </button>

      <div className={styles.dots}>
        {slides.map((s, i) => (
          <button
            key={s.id}
            className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
            type="button"
            aria-label={`Ir al aviso ${i + 1}`}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </section>
  );
}
