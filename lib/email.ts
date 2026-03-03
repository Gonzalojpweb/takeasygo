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
