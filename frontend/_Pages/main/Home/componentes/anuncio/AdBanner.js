'use client';

import styles from './anuncio.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

export default function AdBanner({ adKey, width = 300, height = 250, src, marco = false }) {
  const { t } = useLanguage();
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}</style></head><body><script>atOptions={'key':'${adKey}','format':'iframe','height':${height},'width':${width},'params':{}};<\/script><script src="${src}"><\/script></body></html>`;

  const frame = (
    <iframe
      title={`ad-${adKey}`}
      srcDoc={doc}
      width={width}
      height={height}
      scrolling="no"
      frameBorder="0"
      sandbox="allow-scripts allow-same-origin allow-popups"
      className={styles.bannerFrame}
    />
  );

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>{t('anuncio.label')}</span>
      {marco ? <div className={styles.marcoBanner}>{frame}</div> : frame}
    </div>
  );
}
