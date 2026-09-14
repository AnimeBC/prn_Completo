import { env } from '../config/env.js';

/**
 * Envío de correo con Gmail SMTP.
 * `nodemailer` se carga de forma perezosa para que el backend siga funcionando
 * aunque no esté instalado (solo fallará el envío, no el servidor).
 *
 * Variables .env:
 *   GMAIL_USER=tu@gmail.com
 *   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   (contraseña de aplicación de Google)
 *   MAIL_FROM=pikante pe <tu@gmail.com>
 */
let transporter = null;
let loadFailed = false;

async function getTransporter() {
  if (transporter) return transporter;
  if (loadFailed) return null;
  if (!env.mail.user || !env.mail.pass) return null;

  try {
    const mod = await import('nodemailer');
    const nodemailer = mod.default || mod;
    transporter = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.port === 465,
      auth: { user: env.mail.user, pass: env.mail.pass },
    });
    return transporter;
  } catch (err) {
    loadFailed = true;
    console.error('[mail] nodemailer no está instalado. Ejecuta: npm install nodemailer');
    console.error('[mail] detalle:', err.message);
    return null;
  }
}

export function mailConfigured() {
  return Boolean(env.mail.user && env.mail.pass);
}

export async function sendMail({ to, subject, html, text }) {
  const tx = await getTransporter();
  if (!tx) {
    console.warn(`[mail] sin configurar: no se envió "${subject}" a ${to}`);
    return { ok: false, error: 'mail_not_configured' };
  }
  try {
    await tx.sendMail({ from: env.mail.from, to, subject, html, text });
    return { ok: true };
  } catch (err) {
    console.error('[mail] error al enviar:', err.message);
    return { ok: false, error: err.message };
  }
}

export function verificationCodeEmailHtml({ nombre, code }) {
  const hola = nombre ? `Hola ${nombre}` : 'Hola';
  const digits = String(code).split('').join(' ');
  return `
  <div style="background:#050505;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#0D0D0F;border:1px solid #27272A;border-radius:16px;overflow:hidden">
      <div style="padding:24px;border-bottom:1px solid #27272A;text-align:center">
        <span style="color:#F20D16;font-size:24px;font-weight:800;letter-spacing:-0.5px">pikante pe</span>
      </div>
      <div style="padding:28px 24px;color:#FFFFFF">
        <h1 style="margin:0 0 12px;font-size:20px">Tu código de verificación</h1>
        <p style="margin:0 0 20px;color:#A1A1AA;font-size:14px;line-height:1.6">
          ${hola}, usa este código para activar tu cuenta. Caduca en 15 minutos.
        </p>
        <div style="text-align:center;background:#050505;border:1px solid #27272A;border-radius:12px;padding:18px 12px">
          <span style="font-family:Arial,Helvetica,sans-serif;font-size:34px;font-weight:800;letter-spacing:8px;color:#F20D16">${digits}</span>
        </div>
        <p style="margin:22px 0 0;color:#52525B;font-size:12px;line-height:1.6">
          Si no fuiste tú, ignora este mensaje.
        </p>
      </div>
    </div>
  </div>`;
}

export function verificationEmailHtml({ nombre, link }) {
  const hola = nombre ? `Hola ${nombre}` : 'Hola';
  return `
  <div style="background:#050505;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#0D0D0F;border:1px solid #27272A;border-radius:16px;overflow:hidden">
      <div style="padding:24px;border-bottom:1px solid #27272A;text-align:center">
        <span style="color:#F20D16;font-size:24px;font-weight:800;letter-spacing:-0.5px">pikante pe</span>
      </div>
      <div style="padding:28px 24px;color:#FFFFFF">
        <h1 style="margin:0 0 12px;font-size:20px">Confirma tu correo</h1>
        <p style="margin:0 0 20px;color:#A1A1AA;font-size:14px;line-height:1.6">
          ${hola}, gracias por registrarte en pikante pe. Pulsa el botón para verificar tu cuenta.
        </p>
        <a href="${link}" style="display:inline-block;background:#F20D16;color:#FFFFFF;text-decoration:none;
           font-weight:700;font-size:14px;padding:13px 26px;border-radius:8px">Verificar mi correo</a>
        <p style="margin:22px 0 0;color:#52525B;font-size:12px;line-height:1.6">
          El enlace caduca en 24 horas. Si no fuiste tú, ignora este mensaje.
        </p>
      </div>
    </div>
    <p style="max-width:520px;margin:16px auto 0;color:#52525B;font-size:11px;text-align:center">
      Si el botón no funciona, copia y pega este enlace:<br>${link}
    </p>
  </div>`;
}
