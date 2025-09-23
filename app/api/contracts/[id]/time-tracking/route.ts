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

const TimeEntryCreateSchema = z.object({
  task_description: z.string().min(1).max(500),
  start_time: z.string().datetime(),
  end_time: z.string().datetime().optional(),
  hourly_rate: z.number().positive().optional(),
  freelancer_notes: z.string().max(1000).optional(),
  screenshots: z.array(z.string()).optional()
});

const TimeEntryUpdateSchema = z.object({
  task_description: z.string().min(1).max(500).optional(),
  end_time: z.string().datetime().optional(),
  freelancer_notes: z.string().max(1000).optional(),
  screenshots: z.array(z.string()).optional()
});

// POST - Create new time entry
const handleCreateTimeEntry = async (request: NextRequest, user: any) => {
  try {
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contract_id');
    
    if (!contractId) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const body = await request.json();
    
    // Validate input
    const validatedData = validateAndSanitize(TimeEntryCreateSchema, body);

    // Verify contract exists and user is the freelancer
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .eq('freelancer_id', user.id)
      .eq('type', 'hourly')
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found or access denied' },
        { status: 404 }
      );
    }

    // Check if contract is active
    if (!['active', 'in_progress'].includes(contract.status)) {
      return NextResponse.json(
        { error: 'Contract must be active to track time' },
        { status: 400 }
      );
    }

    // Get hourly rate from contract if not provided
    const hourlyRate = validatedData.hourly_rate || contract.hourly_rate || 0;

    // Create time entry
    const { data: timeEntry, error: entryError } = await supabase
      .from('time_entries')
      .insert({
        contract_id: contractId,
        freelancer_id: user.id,
        task_description: validatedData.task_description,
        start_time: validatedData.start_time,
        end_time: validatedData.end_time || null,
        hourly_rate: hourlyRate,
        freelancer_notes: validatedData.freelancer_notes || null,
        screenshots: validatedData.screenshots || [],
        status: validatedData.end_time ? 'submitted' : 'draft'
      })
      .select()
      .single();

    if (entryError) {
      console.error('Time entry creation error:', entryError);
      return NextResponse.json(
        { error: 'Failed to create time entry' },
        { status: 500 }
      );
    }

    // Log activity
    await auditLogger.logContractEvent(
      'time_entry_created',
      contractId,
      user.id,
      {
        time_entry_id: timeEntry.id,
        task_description: validatedData.task_description,
        duration_minutes: timeEntry.duration_minutes
      }
    );

    return NextResponse.json({
      success: true,
      time_entry: timeEntry,
      message: 'Time entry created successfully'
    });

  } catch (error) {
    return ErrorHandler.handleApiError(error, request);
  }
};

// GET - Get time entries for contract
const handleGetTimeEntries = async (request: NextRequest, user: any) => {
  try {
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contract_id');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    if (!contractId) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user has access to this contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .or(`freelancer_id.eq.${user.id},client_id.eq.${user.id}`)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found or access denied' },
        { status: 404 }
      );
    }

    // Build query
    let query = supabase
      .from('time_entries')
      .select(`
        *,
        time_approvals!left(*)
      `)
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: timeEntries, error: entriesError } = await query;

    if (entriesError) {
      console.error('Time entries fetch error:', entriesError);
      return NextResponse.json(
        { error: 'Failed to fetch time entries' },
        { status: 500 }
      );
    }

    // Calculate totals
    const totalHours = timeEntries?.reduce((sum, entry) => 
      sum + (entry.duration_minutes || 0) / 60, 0) || 0;
    
    const totalAmount = timeEntries?.reduce((sum, entry) => 
      sum + ((entry.duration_minutes || 0) / 60 * (entry.hourly_rate || 0)), 0) || 0;

    const approvedHours = timeEntries?.filter(e => e.status === 'approved')
      .reduce((sum, entry) => sum + (entry.duration_minutes || 0) / 60, 0) || 0;

    return NextResponse.json({
      success: true,
      time_entries: timeEntries || [],
      summary: {
        total_hours: totalHours,
        total_amount: totalAmount,
        approved_hours: approvedHours,
        pending_approval: timeEntries?.filter(e => e.status === 'submitted').length || 0,
        entries_count: timeEntries?.length || 0
      },
      meta: {
        limit,
        offset,
        has_more: (timeEntries?.length || 0) === limit
      }
    });

  } catch (error) {
    return ErrorHandler.handleApiError(error, request);
  }
};

export const POST = withAuth(handleCreateTimeEntry);
export const GET = withAuth(handleGetTimeEntries);