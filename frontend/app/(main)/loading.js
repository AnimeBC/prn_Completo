import styles from './loading.module.css';

/** Esqueleto al navegar dentro de (main): Next 16 lo muestra mientras
 *  resuelve el segmento (staleTimes / fetch del backend). */
export default function Loading() {
  return (
    <div className={styles.wrap} aria-busy="true">
      <div className={styles.head} />
      <div className={styles.grid}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={styles.card}>
            <div className={styles.thumb} />
            <div className={styles.line} />
            <div className={styles.lineShort} />
          </div>
        ))}
      </div>
    </div>
  );
}
