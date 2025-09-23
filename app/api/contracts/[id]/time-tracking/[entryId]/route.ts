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

const TimeEntryUpdateSchema = z.object({
  task_description: z.string().min(1).max(500).optional(),
  end_time: z.string().datetime().optional(),
  freelancer_notes: z.string().max(1000).optional(),
  screenshots: z.array(z.string()).optional()
});

const TimeApprovalSchema = z.object({
  status: z.enum(['approved', 'rejected', 'needs_revision']),
  feedback: z.string().max(1000).optional(),
  approved_hours: z.number().positive().optional(),
  approved_amount: z.number().positive().optional()
});

// GET - Get specific time entry
const handleGetTimeEntry = async (request: NextRequest, user: any) => {
  try {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const contractId = pathSegments[pathSegments.indexOf('contracts') + 1];
    const entryId = pathSegments[pathSegments.indexOf('time-tracking') + 1];

    const supabase = await createClient();

    // Get time entry with contract info
    const { data: timeEntry, error: entryError } = await supabase
      .from('time_entries')
      .select(`
        *,
        time_approvals!left(*),
        contracts!inner(
          id,
          title,
          freelancer_id,
          client_id,
          status
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

    // Check access - freelancer or client
    const contract = timeEntry.contracts;
    if (contract.freelancer_id !== user.id && contract.client_id !== user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      time_entry: timeEntry
    });

  } catch (error) {
    return ErrorHandler.handleApiError(error, request);
  }
};

// PUT - Update time entry (freelancer only)
const handleUpdateTimeEntry = async (request: NextRequest, user: any) => {
  try {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const contractId = pathSegments[pathSegments.indexOf('contracts') + 1];
    const entryId = pathSegments[pathSegments.indexOf('time-tracking') + 1];

    const supabase = await createClient();
    const body = await request.json();
    
    // Validate input
    const validatedData = validateAndSanitize(TimeEntryUpdateSchema, body);

    // Get existing time entry
    const { data: existingEntry, error: fetchError } = await supabase
      .from('time_entries')
      .select('*, contracts!inner(freelancer_id)')
      .eq('id', entryId)
      .eq('contract_id', contractId)
      .eq('freelancer_id', user.id)
      .single();

    if (fetchError || !existingEntry) {
      return NextResponse.json(
        { error: 'Time entry not found or access denied' },
        { status: 404 }
      );
    }

    // Check if entry can be edited
    if (!['draft', 'rejected'].includes(existingEntry.status)) {
      return NextResponse.json(
        { error: 'Cannot edit submitted or approved time entries' },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    
    if (validatedData.task_description) {
      updateData.task_description = validatedData.task_description;
    }
    
    if (validatedData.end_time) {
      updateData.end_time = validatedData.end_time;
      // Auto-submit when end time is set
      if (!existingEntry.end_time) {
        updateData.status = 'submitted';
        updateData.submitted_at = new Date().toISOString();
      }
    }
    
    if (validatedData.freelancer_notes !== undefined) {
      updateData.freelancer_notes = validatedData.freelancer_notes;
    }
    
    if (validatedData.screenshots) {
      updateData.screenshots = validatedData.screenshots;
    }

    // Update time entry
    const { data: updatedEntry, error: updateError } = await supabase
      .from('time_entries')
      .update(updateData)
      .eq('id', entryId)
      .select()
      .single();

    if (updateError) {
      console.error('Time entry update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update time entry' },
        { status: 500 }
      );
    }

    // Log activity
    await auditLogger.logContractEvent(
      'time_entry_updated',
      contractId,
      user.id,
      {
        time_entry_id: entryId,
        changes: Object.keys(updateData),
        status: updatedEntry.status
      }
    );

    return NextResponse.json({
      success: true,
      time_entry: updatedEntry,
      message: 'Time entry updated successfully'
    });

  } catch (error) {
    return ErrorHandler.handleApiError(error, request);
  }
};

// DELETE - Delete time entry (freelancer only, draft entries only)
const handleDeleteTimeEntry = async (request: NextRequest, user: any) => {
  try {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const contractId = pathSegments[pathSegments.indexOf('contracts') + 1];
    const entryId = pathSegments[pathSegments.indexOf('time-tracking') + 1];

    const supabase = await createClient();

    // Get existing time entry
    const { data: existingEntry, error: fetchError } = await supabase
      .from('time_entries')
      .select('*')
      .eq('id', entryId)
      .eq('contract_id', contractId)
      .eq('freelancer_id', user.id)
      .single();

    if (fetchError || !existingEntry) {
      return NextResponse.json(
        { error: 'Time entry not found or access denied' },
        { status: 404 }
      );
    }

    // Only allow deletion of draft entries
    if (existingEntry.status !== 'draft') {
      return NextResponse.json(
        { error: 'Can only delete draft time entries' },
        { status: 400 }
      );
    }

    // Delete time entry
    const { error: deleteError } = await supabase
      .from('time_entries')
      .delete()
      .eq('id', entryId);

    if (deleteError) {
      console.error('Time entry deletion error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete time entry' },
        { status: 500 }
      );
    }

    // Log activity
    await auditLogger.logContractEvent(
      'time_entry_deleted',
      contractId,
      user.id,
      {
        time_entry_id: entryId,
        task_description: existingEntry.task_description
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Time entry deleted successfully'
    });

  } catch (error) {
    return ErrorHandler.handleApiError(error, request);
  }
};

export const GET = withAuth(handleGetTimeEntry);
export const PUT = withAuth(handleUpdateTimeEntry);
export const DELETE = withAuth(handleDeleteTimeEntry);