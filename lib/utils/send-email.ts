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
      console.warn('Email configuration missing, using mock email service');
      return null;
    }

    transporter = nodemailer.createTransport({
      host: emailHost,
      port: emailPort,
      secure: emailPort === 465, // true for 465, false for other ports
      auth: {
        user: emailUser,
        pass: emailPass,
      },
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
      from: options.from || process.env.EMAIL_FROM || 'noreply@pactify.com',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    const info = await emailTransporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
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
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #5E17EB; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Pactify</h1>
      </div>
      <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
        <p>Hello,</p>
        <p>${senderName} has sent you a contract titled <strong>"${contractTitle}"</strong> for your review.</p>
        <p>To review and sign this contract, please click the button below:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${contractUrl}" style="background-color: #5E17EB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Review Contract</a>
        </p>
        <p>If you have any questions, please reply to this email or contact the sender directly.</p>
        <p>Thank you,<br>The Pactify Team</p>
      </div>
      <div style="background-color: #f7f7f7; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        <p>© ${new Date().getFullYear()} Pactify. All rights reserved.</p>
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
