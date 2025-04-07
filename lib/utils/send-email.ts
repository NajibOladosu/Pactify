// This is a mock email service for demonstration purposes
// In a real application, you would integrate with a service like SendGrid, Mailgun, etc.

export type EmailOptions = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    console.log('====== EMAIL WOULD BE SENT ======');
    console.log(`To: ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Content: ${options.text || options.html}`);
    console.log('=================================');
    
    // Simulate API call to email service
    return new Promise((resolve) => {
      setTimeout(() => {
        // Simulate successful email sending
        resolve(true);
      }, 500);
    });
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
  
  const contractUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/contracts/review/${contractId}`
    : `/contracts/review/${contractId}`;
  
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
