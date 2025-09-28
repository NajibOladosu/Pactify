import { sendEmail, EmailOptions } from './send-email';

export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

export interface NotificationContext {
  contractId: string;
  contractTitle: string;
  contractNumber?: string;
  clientName?: string;
  freelancerName?: string;
  amount?: number;
  currency?: string;
  milestoneTitle?: string;
  dueDate?: string;
  recipientName?: string;
  recipientEmail?: string;
  senderName?: string;
  additionalInfo?: Record<string, any>;
}

// Base URL configuration
const getBaseUrl = () => {
  return process.env.NEXT_PUBLIC_APP_URL || 
         (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
};

// Common email styling
const getEmailWrapper = (content: string) => `
  <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #3A86FF 0%, #2563EB 100%); padding: 32px 24px; text-align: center; border-radius: 8px 8px 0 0;">
      <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">Pactify</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px; font-weight: 500;">Secure Contract Management Platform</p>
    </div>
    
    <!-- Content -->
    <div style="padding: 48px 32px; line-height: 1.7; color: #374151; background-color: #ffffff;">
      ${content}
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

// Common button style
const getButton = (url: string, text: string, variant: 'primary' | 'secondary' = 'primary') => {
  const bgColor = variant === 'primary' ? '#3A86FF' : '#64748b';
  const hoverColor = variant === 'primary' ? '#2563EB' : '#475569';
  return `
    <div style="text-align: center; margin: 32px 0;">
      <a href="${url}"
         style="background-color: ${bgColor}; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px; box-shadow: 0 4px 12px rgba(58, 134, 255, 0.25); transition: all 0.2s ease; letter-spacing: 0.025em;"
         onmouseover="this.style.backgroundColor='${hoverColor}'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 8px 20px rgba(58, 134, 255, 0.35)';"
         onmouseout="this.style.backgroundColor='${bgColor}'; this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(58, 134, 255, 0.25)';">
        ${text}
      </a>
    </div>
  `;
};

// Email templates
export const EmailTemplates = {
  // Contract invitation to client
  contractInvitation: (ctx: NotificationContext): EmailTemplate => {
    const contractUrl = `${getBaseUrl()}/dashboard/contracts/${ctx.contractId}`;
    
    return {
      subject: `${ctx.senderName} sent you a contract to review: ${ctx.contractTitle}`,
      text: `
Hello ${ctx.recipientName || ''},

${ctx.senderName} has sent you a contract titled "${ctx.contractTitle}" for your review and signature.

Contract Details:
- Title: ${ctx.contractTitle}
- Contract ID: ${ctx.contractNumber || ctx.contractId}
${ctx.amount ? `- Amount: ${ctx.currency || 'USD'} ${ctx.amount}` : ''}

To review and sign this contract, please visit:
${contractUrl}

If you have any questions about this contract, please contact ${ctx.senderName} directly.

Best regards,
The Pactify Team
      `,
      html: getEmailWrapper(`
        <h2 style="color: #1f2937; margin: 0 0 20px 0;">New Contract Invitation</h2>
        <p>Hello ${ctx.recipientName || ''},</p>
        <p><strong>${ctx.senderName}</strong> has sent you a contract for your review and signature.</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; color: #374151;">Contract Details</h3>
          <p style="margin: 0; color: #6b7280;"><strong>Title:</strong> ${ctx.contractTitle}</p>
          <p style="margin: 5px 0; color: #6b7280;"><strong>Contract ID:</strong> ${ctx.contractNumber || ctx.contractId}</p>
          ${ctx.amount ? `<p style="margin: 5px 0 0 0; color: #6b7280;"><strong>Amount:</strong> ${ctx.currency || 'USD'} ${ctx.amount}</p>` : ''}
        </div>
        
        ${getButton(contractUrl, 'Review & Sign Contract')}
        
        <p style="font-size: 14px; color: #6b7280;">
          If you have any questions about this contract, please contact ${ctx.senderName} directly.
        </p>
      `)
    };
  },

  // Contract signed notification
  contractSigned: (ctx: NotificationContext): EmailTemplate => {
    const contractUrl = `${getBaseUrl()}/dashboard/contracts/${ctx.contractId}`;
    
    return {
      subject: `Contract signed: ${ctx.contractTitle}`,
      text: `
Hello ${ctx.recipientName || ''},

Great news! The contract "${ctx.contractTitle}" has been signed by all parties.

Next Steps:
${ctx.senderName === ctx.clientName ? '- Please fund the project to activate the contract' : '- Waiting for the client to fund the project'}

You can view the contract details at:
${contractUrl}

Best regards,
The Pactify Team
      `,
      html: getEmailWrapper(`
        <h2 style="color: #059669; margin: 0 0 20px 0;">✅ Contract Signed Successfully</h2>
        <p>Hello ${ctx.recipientName || ''},</p>
        <p>Great news! The contract <strong>"${ctx.contractTitle}"</strong> has been signed by all parties.</p>
        
        <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; color: #065f46;">Next Steps</h3>
          <p style="margin: 0; color: #064e3b;">
            ${ctx.senderName === ctx.clientName ? 
              '• Please fund the project to activate the contract' : 
              '• Waiting for the client to fund the project'
            }
          </p>
        </div>
        
        ${getButton(contractUrl, 'View Contract')}
      `)
    };
  },

  // Payment funded notification
  paymentFunded: (ctx: NotificationContext): EmailTemplate => {
    const contractUrl = `${getBaseUrl()}/dashboard/contracts/${ctx.contractId}`;
    
    return {
      subject: `Payment funded for: ${ctx.contractTitle}`,
      text: `
Hello ${ctx.recipientName || ''},

The escrow payment for "${ctx.contractTitle}" has been successfully funded.

Amount: ${ctx.currency || 'USD'} ${ctx.amount}

${ctx.senderName === ctx.freelancerName ? 
  'You can now begin work on this contract. Payment will be released upon completion.' :
  'The freelancer can now begin work. Payment will be held securely in escrow until completion.'
}

View contract: ${contractUrl}

Best regards,
The Pactify Team
      `,
      html: getEmailWrapper(`
        <h2 style="color: #1d4ed8; margin: 0 0 20px 0;">💰 Payment Funded</h2>
        <p>Hello ${ctx.recipientName || ''},</p>
        <p>The escrow payment for <strong>"${ctx.contractTitle}"</strong> has been successfully funded.</p>
        
        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 20px; margin: 20px 0; text-align: center;">
          <h3 style="margin: 0 0 5px 0; color: #1e40af; font-size: 24px;">${ctx.currency || 'USD'} ${ctx.amount}</h3>
          <p style="margin: 0; color: #1e3a8a; font-size: 14px;">Secured in Escrow</p>
        </div>
        
        <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #0c4a6e;">
            ${ctx.senderName === ctx.freelancerName ? 
              '🚀 You can now begin work on this contract. Payment will be released upon completion and approval.' :
              '🔒 The freelancer can now begin work. Payment will be held securely in escrow until completion.'
            }
          </p>
        </div>
        
        ${getButton(contractUrl, 'View Contract')}
      `)
    };
  },

  // Milestone submitted notification
  milestoneSubmitted: (ctx: NotificationContext): EmailTemplate => {
    const contractUrl = `${getBaseUrl()}/dashboard/contracts/${ctx.contractId}`;
    
    return {
      subject: `Milestone submitted: ${ctx.milestoneTitle} - ${ctx.contractTitle}`,
      text: `
Hello ${ctx.recipientName || ''},

${ctx.freelancerName} has submitted milestone "${ctx.milestoneTitle}" for review.

Contract: ${ctx.contractTitle}
Milestone: ${ctx.milestoneTitle}
${ctx.amount ? `Amount: ${ctx.currency || 'USD'} ${ctx.amount}` : ''}

Please review the submitted work and provide feedback or approval.

Review milestone: ${contractUrl}

Best regards,
The Pactify Team
      `,
      html: getEmailWrapper(`
        <h2 style="color: #7c3aed; margin: 0 0 20px 0;">📋 Milestone Submitted for Review</h2>
        <p>Hello ${ctx.recipientName || ''},</p>
        <p><strong>${ctx.freelancerName}</strong> has submitted a milestone for your review.</p>
        
        <div style="background-color: #faf5ff; border-left: 4px solid #8b5cf6; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; color: #5b21b6;">Milestone Details</h3>
          <p style="margin: 0; color: #6b21a8;"><strong>Contract:</strong> ${ctx.contractTitle}</p>
          <p style="margin: 5px 0; color: #6b21a8;"><strong>Milestone:</strong> ${ctx.milestoneTitle}</p>
          ${ctx.amount ? `<p style="margin: 5px 0 0 0; color: #6b21a8;"><strong>Amount:</strong> ${ctx.currency || 'USD'} ${ctx.amount}</p>` : ''}
        </div>
        
        <p>Please review the submitted work and provide feedback or approval.</p>
        
        ${getButton(contractUrl, 'Review Milestone')}
      `)
    };
  },

  // Payment released notification
  paymentReleased: (ctx: NotificationContext): EmailTemplate => {
    const contractUrl = `${getBaseUrl()}/dashboard/contracts/${ctx.contractId}`;
    
    return {
      subject: `Payment released: ${ctx.contractTitle}`,
      text: `
Hello ${ctx.recipientName || ''},

Great news! Payment has been released for "${ctx.contractTitle}".

Amount: ${ctx.currency || 'USD'} ${ctx.amount}
${ctx.milestoneTitle ? `Milestone: ${ctx.milestoneTitle}` : ''}

The payment has been transferred to your connected account and should be available according to your payment provider's schedule.

View details: ${contractUrl}

Best regards,
The Pactify Team
      `,
      html: getEmailWrapper(`
        <h2 style="color: #059669; margin: 0 0 20px 0;">🎉 Payment Released!</h2>
        <p>Hello ${ctx.recipientName || ''},</p>
        <p>Great news! Payment has been released for <strong>"${ctx.contractTitle}"</strong>.</p>
        
        <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; text-align: center;">
          <h3 style="margin: 0 0 5px 0; color: #065f46; font-size: 24px;">${ctx.currency || 'USD'} ${ctx.amount}</h3>
          <p style="margin: 0; color: #047857; font-size: 14px;">
            ${ctx.milestoneTitle ? `For: ${ctx.milestoneTitle}` : 'Contract Payment'}
          </p>
        </div>
        
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #166534;">
            💳 The payment has been transferred to your connected account and should be available according to your payment provider's schedule.
          </p>
        </div>
        
        ${getButton(contractUrl, 'View Details')}
      `)
    };
  },

  // Contract completed notification
  contractCompleted: (ctx: NotificationContext): EmailTemplate => {
    const contractUrl = `${getBaseUrl()}/dashboard/contracts/${ctx.contractId}`;
    
    return {
      subject: `Contract completed: ${ctx.contractTitle}`,
      text: `
Hello ${ctx.recipientName || ''},

The contract "${ctx.contractTitle}" has been completed successfully!

${ctx.amount ? `Total Amount: ${ctx.currency || 'USD'} ${ctx.amount}` : ''}

All milestones have been delivered and payments have been released. We hope you had a great experience working together.

View contract: ${contractUrl}

Thank you for using Pactify!

Best regards,
The Pactify Team
      `,
      html: getEmailWrapper(`
        <h2 style="color: #059669; margin: 0 0 20px 0;">🎊 Contract Completed!</h2>
        <p>Hello ${ctx.recipientName || ''},</p>
        <p>The contract <strong>"${ctx.contractTitle}"</strong> has been completed successfully!</p>
        
        <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; color: #065f46; font-size: 18px;">✅ All work delivered and payments released</p>
          ${ctx.amount ? `<p style="margin: 10px 0 0 0; color: #047857; font-size: 16px;">Total: ${ctx.currency || 'USD'} ${ctx.amount}</p>` : ''}
        </div>
        
        <p>We hope you had a great experience working together. Thank you for using Pactify!</p>
        
        ${getButton(contractUrl, 'View Contract')}
        
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; color: #374151; font-size: 14px;">
            💭 <strong>We'd love your feedback!</strong> Help us improve by sharing your experience.
          </p>
        </div>
      `)
    };
  },

  // Deadline reminder notification
  deadlineReminder: (ctx: NotificationContext): EmailTemplate => {
    const contractUrl = `${getBaseUrl()}/dashboard/contracts/${ctx.contractId}`;
    
    return {
      subject: `Reminder: ${ctx.milestoneTitle || 'Contract'} due ${ctx.dueDate}`,
      text: `
Hello ${ctx.recipientName || ''},

This is a friendly reminder about an upcoming deadline:

Contract: ${ctx.contractTitle}
${ctx.milestoneTitle ? `Milestone: ${ctx.milestoneTitle}` : ''}
Due Date: ${ctx.dueDate}

Please ensure you complete the work on time to avoid any delays.

View contract: ${contractUrl}

Best regards,
The Pactify Team
      `,
      html: getEmailWrapper(`
        <h2 style="color: #d97706; margin: 0 0 20px 0;">⏰ Deadline Reminder</h2>
        <p>Hello ${ctx.recipientName || ''},</p>
        <p>This is a friendly reminder about an upcoming deadline.</p>
        
        <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; color: #92400e;">Deadline Details</h3>
          <p style="margin: 0; color: #a16207;"><strong>Contract:</strong> ${ctx.contractTitle}</p>
          ${ctx.milestoneTitle ? `<p style="margin: 5px 0; color: #a16207;"><strong>Milestone:</strong> ${ctx.milestoneTitle}</p>` : ''}
          <p style="margin: 5px 0 0 0; color: #a16207;"><strong>Due Date:</strong> ${ctx.dueDate}</p>
        </div>
        
        <p>Please ensure you complete the work on time to avoid any delays.</p>
        
        ${getButton(contractUrl, 'View Contract')}
      `)
    };
  },

  // Dispute opened notification
  disputeOpened: (ctx: NotificationContext): EmailTemplate => {
    const contractUrl = `${getBaseUrl()}/dashboard/contracts/${ctx.contractId}`;

    return {
      subject: `Dispute opened: ${ctx.contractTitle}`,
      text: `
Hello ${ctx.recipientName || ''},

A dispute has been opened for the contract "${ctx.contractTitle}".

Contract: ${ctx.contractTitle}
Opened by: ${ctx.senderName}

Our support team will review the dispute and contact both parties to help resolve the issue.

View dispute: ${contractUrl}

Best regards,
The Pactify Team
      `,
      html: getEmailWrapper(`
        <h2 style="color: #dc2626; margin: 0 0 20px 0;">⚠️ Dispute Opened</h2>
        <p>Hello ${ctx.recipientName || ''},</p>
        <p>A dispute has been opened for the contract <strong>"${ctx.contractTitle}"</strong>.</p>

        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; color: #991b1b;">Dispute Information</h3>
          <p style="margin: 0; color: #b91c1c;"><strong>Contract:</strong> ${ctx.contractTitle}</p>
          <p style="margin: 5px 0 0 0; color: #b91c1c;"><strong>Opened by:</strong> ${ctx.senderName}</p>
        </div>

        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #374151;">
            📞 Our support team will review the dispute and contact both parties to help resolve the issue fairly and promptly.
          </p>
        </div>

        ${getButton(contractUrl, 'View Dispute')}
      `)
    };
  },

  // Welcome email for new users
  welcomeUser: (ctx: NotificationContext): EmailTemplate => {
    const dashboardUrl = `${getBaseUrl()}/dashboard`;

    return {
      subject: `Welcome to Pactify! Let's get started`,
      text: `
Hello ${ctx.recipientName || ''},

Welcome to Pactify! We're excited to help you create secure contracts and manage freelance projects with confidence.

Here's what you can do with Pactify:
• Create professional contracts with built-in templates
• Secure escrow payments for project milestones
• Track project progress and deadlines
• Communicate with clients and freelancers

Ready to get started? Create your first contract:
${dashboardUrl}

If you need help, our support team is here for you at support@pactify.com

Welcome aboard!
The Pactify Team
      `,
      html: getEmailWrapper(`
        <h2 style="color: #059669; margin: 0 0 20px 0;">🎉 Welcome to Pactify!</h2>
        <p>Hello ${ctx.recipientName || ''},</p>
        <p>Welcome to Pactify! We're excited to help you create secure contracts and manage freelance projects with confidence.</p>

        <div style="background-color: #f0f9ff; border-left: 4px solid #3A86FF; padding: 24px; margin: 24px 0; border-radius: 6px;">
          <h3 style="margin: 0 0 16px 0; color: #1e40af;">What you can do with Pactify:</h3>
          <ul style="margin: 0; color: #1e3a8a; line-height: 1.8;">
            <li>✨ Create professional contracts with built-in templates</li>
            <li>🔒 Secure escrow payments for project milestones</li>
            <li>📊 Track project progress and deadlines</li>
            <li>💬 Communicate with clients and freelancers</li>
          </ul>
        </div>

        ${getButton(dashboardUrl, 'Create Your First Contract')}

        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; text-align: center;">
          <p style="margin: 0; color: #64748b; font-size: 14px;">
            💡 <strong>Need help getting started?</strong><br>
            Check out our <a href="${getBaseUrl()}/help" style="color: #3A86FF; text-decoration: none;">getting started guide</a> or contact our support team.
          </p>
        </div>
      `)
    };
  },

  // Account verification email
  verifyEmail: (ctx: NotificationContext): EmailTemplate => {
    const verificationUrl = ctx.additionalInfo?.verificationUrl || `${getBaseUrl()}/verify-email`;

    return {
      subject: `Verify your Pactify account`,
      text: `
Hello ${ctx.recipientName || ''},

Please verify your email address to complete your Pactify account setup.

Click the link below to verify your account:
${verificationUrl}

This link will expire in 24 hours. If you didn't create a Pactify account, you can safely ignore this email.

Best regards,
The Pactify Team
      `,
      html: getEmailWrapper(`
        <h2 style="color: #1f2937; margin: 0 0 20px 0;">📧 Verify Your Email Address</h2>
        <p>Hello ${ctx.recipientName || ''},</p>
        <p>Please verify your email address to complete your Pactify account setup.</p>

        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 6px;">
          <p style="margin: 0; color: #92400e;">
            <strong>⏰ Important:</strong> This verification link will expire in 24 hours.
          </p>
        </div>

        ${getButton(verificationUrl, 'Verify Email Address')}

        <p style="font-size: 14px; color: #64748b; margin-top: 24px;">
          If you didn't create a Pactify account, you can safely ignore this email.
        </p>
      `)
    };
  },

  // Password reset email
  resetPassword: (ctx: NotificationContext): EmailTemplate => {
    const resetUrl = ctx.additionalInfo?.resetUrl || `${getBaseUrl()}/reset-password`;

    return {
      subject: `Reset your Pactify password`,
      text: `
Hello ${ctx.recipientName || ''},

We received a request to reset your Pactify password.

Click the link below to create a new password:
${resetUrl}

This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.

Best regards,
The Pactify Team
      `,
      html: getEmailWrapper(`
        <h2 style="color: #1f2937; margin: 0 0 20px 0;">🔐 Reset Your Password</h2>
        <p>Hello ${ctx.recipientName || ''},</p>
        <p>We received a request to reset your Pactify password.</p>

        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0; border-radius: 6px;">
          <p style="margin: 0; color: #991b1b;">
            <strong>⏰ Security Notice:</strong> This password reset link will expire in 1 hour for your security.
          </p>
        </div>

        ${getButton(resetUrl, 'Reset Password')}

        <p style="font-size: 14px; color: #64748b; margin-top: 24px;">
          If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
        </p>
      `)
    };
  }
};

// Main notification service
export class EmailNotificationService {
  static async sendContractInvitation(ctx: NotificationContext): Promise<boolean> {
    const template = EmailTemplates.contractInvitation(ctx);
    return await sendEmail({
      to: ctx.recipientEmail || '',
      ...template
    });
  }

  static async sendContractSigned(ctx: NotificationContext): Promise<boolean> {
    const template = EmailTemplates.contractSigned(ctx);
    return await sendEmail({
      to: ctx.recipientEmail || '',
      ...template
    });
  }

  static async sendPaymentFunded(ctx: NotificationContext): Promise<boolean> {
    const template = EmailTemplates.paymentFunded(ctx);
    return await sendEmail({
      to: ctx.recipientEmail || '',
      ...template
    });
  }

  static async sendMilestoneSubmitted(ctx: NotificationContext): Promise<boolean> {
    const template = EmailTemplates.milestoneSubmitted(ctx);
    return await sendEmail({
      to: ctx.recipientEmail || '',
      ...template
    });
  }

  static async sendPaymentReleased(ctx: NotificationContext): Promise<boolean> {
    const template = EmailTemplates.paymentReleased(ctx);
    return await sendEmail({
      to: ctx.recipientEmail || '',
      ...template
    });
  }

  static async sendContractCompleted(ctx: NotificationContext): Promise<boolean> {
    const template = EmailTemplates.contractCompleted(ctx);
    return await sendEmail({
      to: ctx.recipientEmail || '',
      ...template
    });
  }

  static async sendDeadlineReminder(ctx: NotificationContext): Promise<boolean> {
    const template = EmailTemplates.deadlineReminder(ctx);
    return await sendEmail({
      to: ctx.recipientEmail || '',
      ...template
    });
  }

  static async sendDisputeOpened(ctx: NotificationContext): Promise<boolean> {
    const template = EmailTemplates.disputeOpened(ctx);
    return await sendEmail({
      to: ctx.recipientEmail || '',
      ...template
    });
  }

  static async sendWelcomeUser(ctx: NotificationContext): Promise<boolean> {
    const template = EmailTemplates.welcomeUser(ctx);
    return await sendEmail({
      to: ctx.recipientEmail || '',
      ...template
    });
  }

  static async sendVerifyEmail(ctx: NotificationContext): Promise<boolean> {
    const template = EmailTemplates.verifyEmail(ctx);
    return await sendEmail({
      to: ctx.recipientEmail || '',
      ...template
    });
  }

  static async sendResetPassword(ctx: NotificationContext): Promise<boolean> {
    const template = EmailTemplates.resetPassword(ctx);
    return await sendEmail({
      to: ctx.recipientEmail || '',
      ...template
    });
  }

  // Batch send notifications to multiple recipients
  static async sendBatchNotification(
    recipients: string[],
    templateFn: (ctx: NotificationContext) => EmailTemplate,
    context: NotificationContext
  ): Promise<boolean[]> {
    const promises = recipients.map(async (email) => {
      const template = templateFn({ ...context, recipientName: email.split('@')[0] });
      return await sendEmail({
        to: email,
        ...template
      });
    });

    return await Promise.all(promises);
  }
}