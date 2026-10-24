import nodemailer from 'nodemailer'

let transporter

/** Creates and caches the SMTP transport from server environment settings. */
function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD } = process.env
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
    const error = new Error('Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM in server/.env.')
    error.status = 503
    throw error
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: SMTP_SECURE === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    })
  }
  return transporter
}

/** Sends a workspace message to the requested recipient email addresses. */
export async function sendWorkspaceEmail({ recipients, subject, message }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER
  return getTransporter().sendMail({
    from,
    to: from,
    bcc: recipients.map(({ email }) => email),
    subject,
    text: message,
  })
}

/** Sends a customer invoice with its generated PDF attached. */
export async function sendInvoiceEmail({ recipient, invoiceNumber, pdfBuffer }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER
  return getTransporter().sendMail({
    from,
    to: recipient,
    subject: `Invoice ${invoiceNumber} from ${process.env.ORGANIZATION_NAME || 'Orbit ERP'}`,
    text: `Hello,\n\nPlease find invoice ${invoiceNumber} attached as a PDF.\n\nRegards,\n${process.env.ORGANIZATION_NAME || 'Orbit ERP'}`,
    attachments: [{ filename: `${invoiceNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
  })
}
