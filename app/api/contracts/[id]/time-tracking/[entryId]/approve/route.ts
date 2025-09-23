import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { withAuth } from '@/utils/api/with-auth';
import {
  withSecurity,
  validateAndSanitize,
  auditLogger,
  ErrorHandler
} from '@/utils/security';
import { z } from 'zod';

const TimeApprovalSchema = z.object({
  status: z.enum(['approved', 'rejected', 'needs_revision']),
  feedback: z.string().max(1000).optional(),
  approved_hours: z.number().positive().optional(),
  approved_amount: z.number().positive().optional()
});

// POST - Approve/reject time entry (client only)
const handleTimeApproval = async (request: NextRequest, user: any) => {
  try {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const contractId = pathSegments[pathSegments.indexOf('contracts') + 1];
    const entryId = pathSegments[pathSegments.indexOf('time-tracking') + 1];

    const supabase = await createClient();
    const body = await request.json();
    
    // Validate input
    const validatedData = validateAndSanitize(TimeApprovalSchema, body);

    // Get time entry with contract info
    const { data: timeEntry, error: entryError } = await supabase
      .from('time_entries')
      .select(`
        *,
        contracts!inner(
          id,
          title,
          client_id,
          freelancer_id,
          hourly_rate
        )
      `)
      .eq('id', entryId)
      .eq('contract_id', contractId)
      .single();

    if (entryError || !timeEntry) {
      return NextResponse.json(
        { error: 'Time entry not found' },
        { status: 404 }
      );
    }

    // Check if user is the client
    const contract = timeEntry.contracts;
    if (contract.client_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the client can approve time entries' },
        { status: 403 }
      );
    }

    // Check if entry is in submitted status
    if (timeEntry.status !== 'submitted') {
      return NextResponse.json(
        { error: 'Can only approve submitted time entries' },
        { status: 400 }
      );
    }

    // Calculate approved hours and amount
    const originalHours = (timeEntry.duration_minutes || 0) / 60;
    const approvedHours = validatedData.approved_hours || originalHours;
    const hourlyRate = timeEntry.hourly_rate || contract.hourly_rate || 0;
    const approvedAmount = validatedData.approved_amount || (approvedHours * hourlyRate);

    // Start transaction
    const { data: approval, error: approvalError } = await supabase
      .from('time_approvals')
      .insert({
        time_entry_id: entryId,
        client_id: user.id,
        status: validatedData.status,
        feedback: validatedData.feedback || null,
        approved_hours: approvedHours,
        approved_amount: approvedAmount
      })
      .select()
      .single();

    if (approvalError) {
      console.error('Time approval creation error:', approvalError);
      return NextResponse.json(
        { error: 'Failed to create approval record' },
        { status: 500 }
      );
    }

    // Update time entry status
    const newStatus = validatedData.status;
    const updateData: any = {
      status: newStatus,
      client_notes: validatedData.feedback || null
    };

    if (newStatus === 'approved') {
      updateData.approved_at = new Date().toISOString();
      updateData.approved_by = user.id;
    }

    const { error: updateError } = await supabase
      .from('time_entries')
      .update(updateData)
      .eq('id', entryId);

    if (updateError) {
      console.error('Time entry status update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update time entry status' },
        { status: 500 }
      );
    }

    // Log activity
    await auditLogger.logContractEvent(
      'time_entry_reviewed',
      contractId,
      user.id,
      {
        time_entry_id: entryId,
        approval_status: validatedData.status,
        approved_hours: approvedHours,
        approved_amount: approvedAmount,
        freelancer_id: contract.freelancer_id
      }
    );

    // Log activity in contract activities
    const activityDescription = {
      'approved': `Time entry approved: ${approvedHours.toFixed(2)} hours`,
      'rejected': `Time entry rejected${validatedData.feedback ? ': ' + validatedData.feedback : ''}`,
      'needs_revision': `Time entry requires revision${validatedData.feedback ? ': ' + validatedData.feedback : ''}`
    };

    await supabase.from('contract_activities').insert({
      contract_id: contractId,
      user_id: user.id,
      activity_type: 'time_entry_reviewed',
      description: activityDescription[validatedData.status],
      metadata: {
        time_entry_id: entryId,
        approval_status: validatedData.status,
        approved_hours: approvedHours,
        approved_amount: approvedAmount,
        original_hours: originalHours
      }
    });

    // If approved, check if this affects contract completion
    if (validatedData.status === 'approved') {
      // Get total approved hours for this contract
      const { data: allEntries } = await supabase
        .from('time_entries')
        .select('duration_minutes')
        .eq('contract_id', contractId)
        .eq('status', 'approved');

      const totalApprovedHours = (allEntries || []).reduce((sum, entry) => 
        sum + (entry.duration_minutes || 0) / 60, 0);

      // Update contract with latest time tracking info
      await supabase
        .from('contracts')
        .update({
          metadata: {
            ...timeEntry.contracts.metadata,
            total_approved_hours: totalApprovedHours,
            last_time_approval: new Date().toISOString()
          }
        })
        .eq('id', contractId);
    }

    return NextResponse.json({
      success: true,
      approval,
      time_entry_status: newStatus,
      approved_hours: approvedHours,
      approved_amount: approvedAmount,
      message: `Time entry ${validatedData.status} successfully`
    });

  } catch (error) {
    return ErrorHandler.handleApiError(error, request);
  }
};

// GET - Get approval history for time entry
const handleGetApprovalHistory = async (request: NextRequest, user: any) => {
  try {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const contractId = pathSegments[pathSegments.indexOf('contracts') + 1];
    const entryId = pathSegments[pathSegments.indexOf('time-tracking') + 1];

    const supabase = await createClient();

    // Verify user has access to this contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('freelancer_id, client_id')
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    if (contract.freelancer_id !== user.id && contract.client_id !== user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Get approval history
    const { data: approvals, error: approvalsError } = await supabase
      .from('time_approvals')
      .select(`
        *,
        profiles:client_id(display_name)
      `)
      .eq('time_entry_id', entryId)
      .order('created_at', { ascending: false });

    if (approvalsError) {
      console.error('Approvals fetch error:', approvalsError);
      return NextResponse.json(
        { error: 'Failed to fetch approval history' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      approvals: approvals || []
    });

  } catch (error) {
    return ErrorHandler.handleApiError(error, request);
  }
};

export const POST = withAuth(handleTimeApproval);
export const GET = withAuth(handleGetApprovalHistory);