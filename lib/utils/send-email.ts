import nodemailer from 'nodemailer';

export type EmailOptions = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
};

// Create reusable transporter object
let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    const emailHost = process.env.EMAIL_SERVER_HOST;
    const emailPort = parseInt(process.env.EMAIL_SERVER_PORT || '587');
    const emailUser = process.env.EMAIL_SERVER_USER;
    const emailPass = process.env.EMAIL_SERVER_PASSWORD;

    if (!emailHost || !emailUser || !emailPass) {
      console.warn('Gmail SMTP configuration missing, using mock email service');
      return null;
    }

    transporter = nodemailer.createTransport({
      host: emailHost,
      port: emailPort,
      secure: emailPort === 465, // true for 465, false for other ports like 587
      auth: {
        user: emailUser,
        pass: emailPass,
      },
      // Gmail specific settings
      ...(emailHost === 'smtp.gmail.com' && {
        service: 'gmail',
        tls: {
          rejectUnauthorized: false
        }
      }),
    });
  }
  return transporter;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    // Validate email recipient
    if (!options.to || options.to.trim() === '') {
      console.error('Email sending failed: No recipient email provided');
      return false;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(options.to)) {
      console.error('Email sending failed: Invalid recipient email format:', options.to);
      return false;
    }

    const emailTransporter = getTransporter();

    if (!emailTransporter) {
      // Fallback to mock service for development
      console.log('====== EMAIL WOULD BE SENT (MOCK) ======');
      console.log(`To: ${options.to}`);
      console.log(`Subject: ${options.subject}`);
      console.log(`Content: ${options.text || options.html}`);
      console.log('=================================');
      return true;
    }

    const mailOptions = {
      from: options.from || process.env.EMAIL_FROM || 'Pactify <noreply@pactify.com>',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    const info = await emailTransporter.sendMail(mailOptions);
    console.log('Email sent successfully via Gmail SMTP:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email via Gmail SMTP:', error);
    return false;
  }
}

export function getContractInvitationEmail(
  contractId: string,
  contractTitle: string,
  senderName: string,
  recipientEmail: string
): EmailOptions {
  const subject = `${senderName} has sent you a contract to review`;

  // Use environment variable for base URL or default for development
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const contractUrl = `${baseUrl}/dashboard/contracts/${contractId}`;

  const text = `
    Hello,

    ${senderName} has sent you a contract titled "${contractTitle}" for your review.

    To review and sign this contract, please click the following link:
    ${contractUrl}

    If you have any questions, please reply to this email or contact the sender directly.

    Thank you,
    The Pactify Team
  `;

  const html = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #3A86FF 0%, #2563EB 100%); padding: 32px 24px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">Pactify</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px; font-weight: 500;">Secure Contract Management Platform</p>
      </div>

      <!-- Content -->
      <div style="padding: 48px 32px; line-height: 1.7; color: #374151; background-color: #ffffff;">
        <h2 style="color: #1f2937; margin: 0 0 24px 0; font-size: 24px; font-weight: 600;">Contract Invitation</h2>
        <p style="margin-bottom: 16px;">Hello,</p>
        <p style="margin-bottom: 24px;"><strong>${senderName}</strong> has sent you a contract titled <strong>"${contractTitle}"</strong> for your review and signature.</p>

        <!-- CTA Button -->
        <div style="text-align: center; margin: 32px 0;">
          <a href="${contractUrl}"
             style="background-color: #3A86FF; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px; box-shadow: 0 4px 12px rgba(58, 134, 255, 0.25); transition: all 0.2s ease; letter-spacing: 0.025em;">
            Review & Sign Contract
          </a>
        </div>

        <p style="font-size: 14px; color: #64748b; margin-top: 24px;">
          If you have any questions about this contract, please contact ${senderName} directly.
        </p>
      </div>

      <!-- Footer -->
      <div style="background-color: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
        <p style="margin: 0 0 12px 0; font-size: 13px; color: #64748b; font-weight: 500;">
          Need help? Contact us at
          <a href="mailto:support@pactify.com" style="color: #3A86FF; text-decoration: none; font-weight: 600;">support@pactify.com</a>
        </p>
        <p style="margin: 0; font-size: 12px; color: #94a3b8;">
          © ${new Date().getFullYear()} Pactify Inc. All rights reserved.
        </p>
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0; font-size: 11px; color: #94a3b8;">
            You're receiving this email because you have an active contract or account with Pactify.
          </p>
        </div>
      </div>
    </div>
  `;

  return {
    to: recipientEmail,
    subject,
    text,
    html
  };
}