import nodemailer from 'nodemailer'

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true', // true para 465, false para 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  })
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER
  const transporter = createTransport()
  await transporter.sendMail({
    from: `Takeasygo <${from}>`,
    to,
    subject,
    html,
  })
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER

  const transporter = createTransport()

  await transporter.sendMail({
    from: `Takeasygo <${from}>`,
    to,
    subject: 'Recuperar contraseña — Takeasygo',
    text: `Solicitaste restablecer tu contraseña.\n\nHacé clic en este enlace (válido por 15 minutos):\n${resetUrl}\n\nSi no solicitaste este cambio, ignorá este email.`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 32px; background: #ffffff; border-radius: 16px; border: 1px solid #ede9e5;">
        <div style="margin-bottom: 32px;">
          <div style="display:inline-flex; align-items:center; gap:10px;">
            <div style="width:32px;height:32px;background:#0d0b0a;border-radius:8px;display:flex;align-items:center;justify-content:center;">
              <span style="color:#fff;font-size:18px;font-style:italic;">T</span>
            </div>
            <span style="font-size:16px;font-weight:600;color:#0d0b0a;">Takeasygo</span>
          </div>
        </div>

        <h1 style="font-size:24px;font-weight:400;color:#0d0b0a;margin:0 0 8px;">Recuperar contraseña</h1>
        <p style="font-size:14px;color:#6b6460;line-height:1.6;margin:0 0 28px;">
          Recibimos una solicitud para restablecer la contraseña de tu cuenta.<br>
          Este enlace es válido por <strong>15 minutos</strong>.
        </p>

        <a href="${resetUrl}"
           style="display:inline-block;background:#0d0b0a;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 28px;border-radius:100px;">
          Restablecer contraseña
        </a>

        <p style="font-size:12px;color:#b0aaa6;margin:28px 0 0;line-height:1.6;">
          Si no solicitaste este cambio, ignorá este email.<br>
          Tu contraseña no cambiará hasta que hagas clic en el enlace de arriba.
        </p>
      </div>
    `,
  })
}

export async function sendOnboardingVerifyEmail(to: string, verifyUrl: string) {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER

  const transporter = createTransport()

  await transporter.sendMail({
    from: `Takeasygo <${from}>`,
    to,
    subject: 'Verificá tu email para comenzar — Takeasygo',
    text: `Bienvenido a Takeasygo.\n\nHacé clic en este enlace (válido por 15 minutos):\n${verifyUrl}\n\nSi no iniciaste este proceso, ignorá este email.`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 32px; background: #ffffff; border-radius: 16px; border: 1px solid #ede9e5;">
        <div style="margin-bottom: 32px;">
          <div style="display:inline-flex; align-items:center; gap:10px;">
            <div style="width:32px;height:32px;background:#0d0b0a;border-radius:8px;display:flex;align-items:center;justify-content:center;">
              <span style="color:#fff;font-size:18px;font-style:italic;">T</span>
            </div>
            <span style="font-size:16px;font-weight:600;color:#0d0b0a;">Takeasygo</span>
          </div>
        </div>

        <h1 style="font-size:24px;font-weight:400;color:#0d0b0a;margin:0 0 8px;">Verificá tu email</h1>
        <p style="font-size:14px;color:#6b6460;line-height:1.6;margin:0 0 28px;">
          Para empezar a crear tu menú, necesitamos que verifiques tu dirección de email.<br>
          Este enlace es válido por <strong>15 minutos</strong>.
        </p>

        <a href="${verifyUrl}"
           style="display:inline-block;background:#0d0b0a;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 28px;border-radius:100px;">
          Verificar mi email
        </a>

        <p style="font-size:12px;color:#b0aaa6;margin:28px 0 0;line-height:1.6;">
          Si no iniciaste este proceso, podés ignorar este email.
        </p>
      </div>
    `,
  })
}

export async function sendOnboardingApprovedEmail(to: string, adminUrl: string) {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER

  const transporter = createTransport()

  await transporter.sendMail({
    from: `Takeasygo <${from}>`,
    to,
    subject: '¡Tu menú está listo! — Takeasygo',
    text: `¡Buenas noticias! Revisamos tu solicitud y tu menú ya está aprobado.\n\nEntrá a tu panel para terminar de configurar tu local:\n${adminUrl}\n\nSi tenés dudas, respondenos este email.`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 32px; background: #ffffff; border-radius: 16px; border: 1px solid #ede9e5;">
        <div style="margin-bottom: 32px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:32px;height:32px;background:#0d0b0a;border-radius:8px;display:flex;align-items:center;justify-content:center;">
              <span style="color:#fff;font-size:18px;font-style:italic;">T</span>
            </div>
            <span style="font-size:16px;font-weight:600;color:#0d0b0a;">Takeasygo</span>
          </div>
        </div>

        <h1 style="font-size:24px;font-weight:400;color:#0d0b0a;margin:0 0 8px;">¡Tu menú está listo!</h1>
        <p style="font-size:14px;color:#6b6460;line-height:1.6;margin:0 0 28px;">
          Revisamos tu solicitud y todo quedó aprobado.<br>
          Ya podés entrar a tu panel y terminar de configurar tu local.
        </p>

        <a href="${adminUrl}"
           style="display:inline-block;background:#0d0b0a;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 28px;border-radius:100px;">
          Ir a mi panel
        </a>

        <p style="font-size:12px;color:#b0aaa6;margin:28px 0 0;line-height:1.6;">
          Si tenés dudas, simplemente respondé este email.
        </p>
      </div>
    `,
  })
}

export async function sendOnboardingRejectedEmail(to: string, reason: string, estadoUrl: string) {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER

  const transporter = createTransport()

  await transporter.sendMail({
    from: `Takeasygo <${from}>`,
    to,
    subject: 'Necesitamos algunos cambios — Takeasygo',
    text: `Revisamos tu solicitud y necesitamos que ajustes algunos detalles antes de aprobarla.\n\nMotivo: ${reason}\n\nEntrá a tu perfil para corregirlo y volver a enviarlo a revisión:\n${estadoUrl}`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 32px; background: #ffffff; border-radius: 16px; border: 1px solid #ede9e5;">
        <div style="margin-bottom: 32px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:32px;height:32px;background:#0d0b0a;border-radius:8px;display:flex;align-items:center;justify-content:center;">
              <span style="color:#fff;font-size:18px;font-style:italic;">T</span>
            </div>
            <span style="font-size:16px;font-weight:600;color:#0d0b0a;">Takeasygo</span>
          </div>
        </div>

        <h1 style="font-size:24px;font-weight:400;color:#0d0b0a;margin:0 0 8px;">Necesitamos algunos cambios</h1>
        <p style="font-size:14px;color:#6b6460;line-height:1.6;margin:0 0 20px;">
          Revisamos tu solicitud y falta ajustar unos detalles antes de poder aprobarla.
        </p>

        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 18px;margin:0 0 28px;">
          <p style="font-size:12px;color:#991b1b;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin:0 0 6px;">Motivo</p>
          <p style="font-size:14px;color:#7f1d1d;line-height:1.6;margin:0;">${reason}</p>
        </div>

        <a href="${estadoUrl}"
           style="display:inline-block;background:#0d0b0a;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 28px;border-radius:100px;">
          Revisar mi perfil
        </a>

        <p style="font-size:12px;color:#b0aaa6;margin:28px 0 0;line-height:1.6;">
          Cuando lo corrijas, vas a poder volver a enviarlo a revisión desde tu panel.
        </p>
      </div>
    `,
  })
}
