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
  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #5E17EB 0%, #7C3AED 100%); padding: 30px 20px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">Pactify</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Secure Contract Management</p>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 30px; line-height: 1.6; color: #374151;">
      ${content}
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0 0 10px 0; font-size: 12px; color: #6b7280;">
        Need help? Contact us at 
        <a href="mailto:support@pactify.com" style="color: #5E17EB; text-decoration: none;">support@pactify.com</a>
      </p>
      <p style="margin: 0; font-size: 12px; color: #9ca3af;">
        © ${new Date().getFullYear()} Pactify. All rights reserved.
      </p>
    </div>
  </div>
`;

// Common button style
const getButton = (url: string, text: string, variant: 'primary' | 'secondary' = 'primary') => {
  const bgColor = variant === 'primary' ? '#5E17EB' : '#6b7280';
  return `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${url}" 
         style="background-color: ${bgColor}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
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
${ctx.senderName === ctx.clientName ? '- Please fund the escrow to activate the contract' : '- Waiting for the client to fund the escrow'}

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
              '• Please fund the escrow to activate the contract' : 
              '• Waiting for the client to fund the escrow'
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