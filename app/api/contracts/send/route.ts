import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { sendEmail, getContractInvitationEmail } from '@/lib/utils/send-email';
import { 
  withSecurity,
  validateAndSanitize,
  auditLogger,
  ErrorHandler
} from '@/utils/security';
import { z } from 'zod';

// Schema for contract sending
const ContractSendSchema = z.object({
  contractId: z.string().uuid(),
  recipientEmail: z.string().email().toLowerCase().optional()
});

const secureHandler = withSecurity.withSecurity(
  async (request: NextRequest) => {
    try {
      const supabase = await createClient();
      
      // Get authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json(
          { error: "Unauthorized", message: "Authentication required" },
          { status: 401 }
        );
      }

      const body = await request.json();
      const validatedData = validateAndSanitize(ContractSendSchema, body);

      // Get contract details and verify ownership/permissions
      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .select(`
          id, title, status, creator_id, client_id, freelancer_id, client_email,
          profiles!contracts_creator_id_fkey(display_name, email)
        `)
        .eq('id', validatedData.contractId)
        .single();

      if (contractError || !contract) {
        await auditLogger.logSecurityEvent({
          userId: user.id,
          action: 'contract_send_failed',
          resource: 'contract',
          details: { contractId: validatedData.contractId, reason: 'contract_not_found' },
          success: false,
          severity: 'medium'
        });
        
        return NextResponse.json(
          { error: "CONTRACT_NOT_FOUND", message: "Contract not found" },
          { status: 404 }
        );
      }

      // Verify user can send this contract (creator or client)
      if (contract.creator_id !== user.id && contract.client_id !== user.id) {
        await auditLogger.logSecurityEvent({
          userId: user.id,
          action: 'unauthorized_contract_send',
          resource: 'contract',
          details: { contractId: validatedData.contractId },
          success: false,
          severity: 'high'
        });
        
        return NextResponse.json(
          { error: "UNAUTHORIZED", message: "You don't have permission to send this contract" },
          { status: 403 }
        );
      }

      // Check if contract is in a sendable state
      if (!['draft', 'pending_signatures'].includes(contract.status)) {
        return NextResponse.json(
          { error: "INVALID_STATUS", message: "Contract cannot be sent in its current status" },
          { status: 400 }
        );
      }

      // Determine recipient email - use provided email or contract's client email
      const recipientEmail = validatedData.recipientEmail || contract.client_email;
      
      if (!recipientEmail) {
        return NextResponse.json(
          { error: "NO_RECIPIENT", message: "No recipient email found. Please specify client email in contract or provide recipient email." },
          { status: 400 }
        );
      }

      // Get sender information
      const profiles = Array.isArray(contract.profiles) ? contract.profiles[0] : contract.profiles;
      const senderName = profiles?.display_name || user.email?.split('@')[0] || 'Someone';
      
      // Generate the email options
      const emailOptions = getContractInvitationEmail(
        contract.id,
        contract.title,
        senderName,
        recipientEmail
      );
      
      // Send the email
      const emailSent = await sendEmail(emailOptions);
      
      if (emailSent) {
        // Update contract status if it was draft
        if (contract.status === 'draft') {
          await supabase
            .from('contracts')
            .update({ 
              status: 'pending_signatures',
              client_email: recipientEmail 
            })
            .eq('id', contract.id);
        }

        // Log contract activity
        await supabase.from('contract_activities').insert({
          contract_id: contract.id,
          user_id: user.id,
          activity_type: 'contract_sent',
          description: `Contract sent to ${validatedData.recipientEmail}`,
          metadata: {
            recipient_email: validatedData.recipientEmail,
            sent_at: new Date().toISOString()
          }
        });

        // Log audit event
        await auditLogger.logContractEvent(
          'sent',
          contract.id,
          user.id,
          {
            recipient_email: validatedData.recipientEmail,
            contract_status: contract.status
          }
        );

        return NextResponse.json({ 
          success: true,
          message: "Contract sent successfully",
          contractId: contract.id
        });
      } else {
        await auditLogger.logSecurityEvent({
          userId: user.id,
          action: 'contract_send_failed',
          resource: 'contract',
          details: { 
            contractId: validatedData.contractId, 
            recipientEmail: validatedData.recipientEmail,
            reason: 'email_send_failed' 
          },
          success: false,
          severity: 'medium'
        });
        
        return NextResponse.json(
          { error: "EMAIL_SEND_FAILED", message: "Failed to send contract email" },
          { status: 500 }
        );
      }
    } catch (error) {
      return ErrorHandler.handleApiError(error, request);
    }
  },
  {
    rateLimit: { requests: 10, windowMs: 60 * 60 * 1000 }, // 10 emails per hour
    validateInput: true,
    requireAuth: true,
    allowedMethods: ['POST']
  }
);

export async function POST(request: NextRequest) {
  return secureHandler(request);
}
