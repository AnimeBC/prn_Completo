'use client';

import styles from './legal.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

const EMAIL = 'pikantepe.com@gmail.com';
const DOMAIN = 'pikantepe.com';

const CONTENT = {
  es: {
    title: 'Aviso legal',
    subtitle: `Última actualización: septiembre de 2026 · ${DOMAIN}`,
    intro: 'pikantepe.com es una plataforma de contenido para adultos (mayores de 18 años). Al usar el sitio aceptas estos términos. Lee la sección que te interese.',
    nav: [
      { id: 'aviso', label: 'Contenido +18 · No CP' },
      { id: 'terminos', label: 'Términos de uso' },
      { id: 'privacidad', label: 'Privacidad' },
      { id: 'cookies', label: 'Cookies' },
      { id: 'dmca', label: 'DMCA / Copyright' },
      { id: 'contacto', label: 'Contacto' },
    ],
    sections: [
      {
        id: 'aviso',
        icon: 'shield-checkmark-outline',
        title: 'Contenido para adultos (+18) y tolerancia cero a menores',
        paragraphs: [
          'pikantepe.com es exclusivo para personas mayores de 18 años. Al ingresar declaras que eres mayor de edad según la ley de tu país y que aceptas ver contenido para adultos.',
          'TOLERANCIA CERO con la pornografía infantil y cualquier contenido con menores de edad (CSAM/CP). Está terminantemente prohibido subir, alojar, enlazar, difundir o solicitar dicho material. Ante cualquier indicio, eliminamos el contenido de inmediato y lo reportamos a las autoridades competentes.',
          'No producimos contenido: el material es aportado por terceros (archivos o enlaces externos). Actuamos como intermediario y retiramos cualquier material ante un reclamo válido (ver DMCA).',
        ],
        list: [
          'Prohibido: contenido con menores de edad (CSAM/CP).',
          'Prohibido: violencia real no consentida, trata de personas o explotación.',
          'Prohibido: contenido íntimo no consentido (NCII / "revenge porn").',
          'Prohibido: zoofilia o cualquier contenido ilegal.',
        ],
        note: `Si ves contenido con menores, repórtalo de inmediato a ${EMAIL}. Lo priorizamos y eliminamos en horas.`,
      },
      {
        id: 'terminos',
        icon: 'document-text-outline',
        title: 'Términos y condiciones de uso',
        paragraphs: [
          'El uso de pikantepe.com es personal y no comercial. Debes tener 18 años o más.',
          'Al crear una cuenta eres responsable de tu actividad y de mantener el acceso seguro. No está permitido compartir cuentas, automatizar el uso del sitio (scraping, bots) ni intentar vulnerar su seguridad o límites de descarga.',
        ],
        list: [
          'No subir ni difundir contenido ilegal, con menores, malware o que infrinja derechos de terceros.',
          'Respeta la propiedad intelectual: la marca y el dominio pikantepe.com son de sus titulares; las obras pertenecen a sus autores.',
          'El contenido es de terceros y se ofrece "tal cual", sin garantías. Lo usas bajo tu propio riesgo.',
          'Podemos suspender cuentas o retirar contenido por incumplimiento.',
          'Podemos actualizar estos términos; la versión vigente es la publicada aquí.',
        ],
        note: 'Ley aplicable: República del Perú. Sitio en operación desde 2026.',
      },
      {
        id: 'privacidad',
        icon: 'lock-closed-outline',
        title: 'Política de privacidad',
        paragraphs: [
          'Tratamos tus datos conforme a la Ley N.° 29733 (Protección de Datos Personales, Perú) y su reglamento, con tu consentimiento.',
          'Datos que recopilamos: un identificador de dispositivo guardado en tu navegador (localStorage), correo, nombre y foto si creas cuenta, tu actividad (me gusta, guardados, descargas, historial, suscripciones) y datos técnicos como IP y navegador.',
          'Finalidad: operar la plataforma, recordar tus preferencias, mejorar el servicio, brindar seguridad y medir estadísticas. No vendemos tus datos.',
        ],
        list: [
          'Compartimos datos con proveedores necesarios (hosting, CDN, inicio de sesión con Google y redes de anuncios) solo para operar el servicio.',
          'Conservamos tus datos mientras uses la cuenta y por el tiempo exigido por ley.',
          `Derechos: acceso, rectificación, supresión y oposición. Escríbenos a ${EMAIL}.`,
          'No recopilamos datos de menores. Si detectamos una cuenta de menor, la eliminamos.',
        ],
      },
      {
        id: 'cookies',
        icon: 'grid-outline',
        title: 'Política de cookies y tecnologías similares',
        paragraphs: [
          'Usamos cookies y almacenamiento local para que el sitio funcione y para recordar tus preferencias (idioma, tema oscuro/claro, sesión).',
        ],
        list: [
          'Esenciales: necesarias para iniciar sesión, conservar tu actividad y la seguridad.',
          'Preferencias: recuerdan tu idioma y el modo oscuro o claro.',
          'Terceros: Google (inicio de sesión) y redes de anuncios que pueden usar cookies para mostrar publicidad.',
        ],
        note: 'Puedes borrar o bloquear cookies desde la configuración de tu navegador; algunas funciones podrían dejar de funcionar.',
      },
      {
        id: 'dmca',
        icon: 'flag-outline',
        title: 'DMCA y derechos de autor',
        paragraphs: [
          `Respetamos los derechos de autor. ${DOMAIN} no necesariamente aloja todo el material: parte es aportado o enlazado por terceros. Si eres titular de derechos y crees que tu obra está aquí sin autorización, envíanos un aviso a ${EMAIL}.`,
        ],
        list: [
          'Identificación de la obra y tu condición de titular.',
          'La URL exacta del contenido en pikantepe.com.',
          'Tus datos de contacto (nombre y correo).',
          'Declaración de buena fe de que la información es exacta.',
          'Firma (electrónica) del titular o su representante.',
        ],
        note: 'Retiramos el contenido reclamado en un plazo de 48 a 72 horas hábiles. Los reincidentes son suspendidos. El contenido con menores NO se procesa por DMCA: se elimina de inmediato y se reporta a las autoridades.',
      },
      {
        id: 'contacto',
        icon: 'mail-outline',
        title: 'Contacto',
        paragraphs: [
          'Para consultas legales, privacidad, DMCA o reportes de contenido ilegal, escríbenos. Los reportes sobre menores se atienden con prioridad absoluta.',
        ],
        list: [
          `Correo: ${EMAIL}`,
          `Dominio: ${DOMAIN}`,
        ],
      },
    ],
  },
  en: {
    title: 'Legal notice',
    subtitle: `Last updated: September 2026 · ${DOMAIN}`,
    intro: 'pikantepe.com is an adult platform (18+). By using the site you accept these terms. Read the section you care about.',
    nav: [
      { id: 'aviso', label: 'Adult +18 · No CSAM' },
      { id: 'terminos', label: 'Terms of use' },
      { id: 'privacidad', label: 'Privacy' },
      { id: 'cookies', label: 'Cookies' },
      { id: 'dmca', label: 'DMCA / Copyright' },
      { id: 'contacto', label: 'Contact' },
    ],
    sections: [
      {
        id: 'aviso',
        icon: 'shield-checkmark-outline',
        title: 'Adult content (18+) and zero tolerance for minors',
        paragraphs: [
          'pikantepe.com is for people 18 years or older. By entering you confirm you are of legal age in your country and agree to view adult content.',
          'ZERO TOLERANCE for child sexual abuse material (CSAM/CP) or any content involving minors. Uploading, hosting, linking, sharing or requesting such material is strictly forbidden. On any indication we remove it immediately and report it to the competent authorities.',
          'We do not produce content: material is provided by third parties (files or external links). We act as an intermediary and remove material upon a valid claim (see DMCA).',
        ],
        list: [
          'Forbidden: any content involving minors (CSAM/CP).',
          'Forbidden: real non-consensual violence, human trafficking or exploitation.',
          'Forbidden: non-consensual intimate content (NCII / "revenge porn").',
          'Forbidden: bestiality or any illegal content.',
        ],
        note: `If you see content involving minors, report it immediately to ${EMAIL}. It is prioritized and removed within hours.`,
      },
      {
        id: 'terminos',
        icon: 'document-text-outline',
        title: 'Terms and conditions of use',
        paragraphs: [
          'Use of pikantepe.com is personal and non-commercial. You must be 18+.',
          'If you create an account you are responsible for your activity and for keeping access secure. Sharing accounts, automating the site (scraping, bots) or trying to bypass security or download limits is not allowed.',
        ],
        list: [
          'Do not upload or share illegal content, content with minors, malware or content infringing third-party rights.',
          'Respect intellectual property: the brand and pikantepe.com domain belong to their owners; works belong to their authors.',
          'Content is from third parties and provided "as is", without warranties. Use it at your own risk.',
          'We may suspend accounts or remove content for violations.',
          'We may update these terms; the current version is the one published here.',
        ],
        note: 'Governing law: Republic of Peru. Site operating since 2026.',
      },
      {
        id: 'privacidad',
        icon: 'lock-closed-outline',
        title: 'Privacy policy',
        paragraphs: [
          'We process your data under Peruvian Personal Data Protection Law No. 29733 and its regulations, with your consent.',
          'Data we collect: a device identifier stored in your browser (localStorage), email, name and photo if you create an account, your activity (likes, saves, downloads, history, subscriptions) and technical data such as IP and browser.',
          'Purpose: operate the platform, remember your preferences, improve the service, provide security and measure statistics. We do not sell your data.',
        ],
        list: [
          'We share data with necessary providers (hosting, CDN, Google sign-in and ad networks) only to operate the service.',
          'We keep your data while you use the account and as required by law.',
          `Rights: access, rectification, deletion and objection. Contact ${EMAIL}.`,
          'We do not collect data from minors. If we detect a minor account, we delete it.',
        ],
      },
      {
        id: 'cookies',
        icon: 'grid-outline',
        title: 'Cookie policy and similar technologies',
        paragraphs: [
          'We use cookies and local storage so the site works and to remember your preferences (language, dark/light theme, session).',
        ],
        list: [
          'Essential: required to sign in, keep your activity and security.',
          'Preferences: remember your language and dark/light mode.',
          'Third parties: Google (sign-in) and ad networks that may use cookies to show advertising.',
        ],
        note: 'You can clear or block cookies in your browser settings; some features may stop working.',
      },
      {
        id: 'dmca',
        icon: 'flag-outline',
        title: 'DMCA and copyright',
        paragraphs: [
          `We respect copyright. ${DOMAIN} does not necessarily host all material: part is provided or linked by third parties. If you own rights and believe your work is here without authorization, send a notice to ${EMAIL}.`,
        ],
        list: [
          'Identification of the work and proof you are the owner.',
          'The exact URL of the content on pikantepe.com.',
          'Your contact details (name and email).',
          'A good-faith statement that the information is accurate.',
          'Signature (electronic) of the owner or representative.',
        ],
        note: 'We remove the claimed content within 48 to 72 business hours. Repeat infringers are suspended. Content involving minors is NOT handled via DMCA: it is removed immediately and reported to authorities.',
      },
      {
        id: 'contacto',
        icon: 'mail-outline',
        title: 'Contact',
        paragraphs: [
          'For legal, privacy, DMCA or illegal-content reports, write to us. Reports involving minors are handled as top priority.',
        ],
        list: [
          `Email: ${EMAIL}`,
          `Domain: ${DOMAIN}`,
        ],
      },
    ],
  },
};

export default function LegalContent() {
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const c = es ? CONTENT.es : CONTENT.en;

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <span className={styles.badge}>+18</span>
        <h1 className={styles.title}>{c.title}</h1>
        <p className={styles.subtitle}>{c.subtitle}</p>
        <p className={styles.intro}>{c.intro}</p>
      </header>

      <nav className={styles.nav} aria-label={es ? 'Secciones legales' : 'Legal sections'}>
        {c.nav.map((n) => (
          <a key={n.id} className={styles.navLink} href={`#${n.id}`}>{n.label}</a>
        ))}
      </nav>

      <div className={styles.sections}>
        {c.sections.map((s) => (
          <section key={s.id} id={s.id} className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>
                <ion-icon name={s.icon} suppressHydrationWarning></ion-icon>
              </span>
              {s.title}
            </h2>
            {s.paragraphs.map((p, i) => (
              <p key={i} className={styles.p}>{p}</p>
            ))}
            {s.list && (
              <ul className={styles.list}>
                {s.list.map((li, i) => <li key={i}>{li}</li>)}
              </ul>
            )}
            {s.note && (
              <p className={styles.note}>
                <ion-icon name="information-circle-outline" suppressHydrationWarning></ion-icon>
                <span>{s.note}</span>
              </p>
            )}
          </section>
        ))}
      </div>

      <p className={styles.foot}>
        © 2026 {DOMAIN} · {EMAIL}
      </p>
    </main>
  );
}
