import styles from './placeholder.module.css';

export default function Placeholder({ title, description, icon = 'construct-outline' }) {
  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.h2}>{title}</h2>
      </div>
      <div className={styles.panel}>
        <span className={styles.icon}>
          <ion-icon name={icon} suppressHydrationWarning></ion-icon>
        </span>
        <span className={styles.badge}>Próximamente</span>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.desc}>{description}</p>
      </div>
    </section>
  );
}
