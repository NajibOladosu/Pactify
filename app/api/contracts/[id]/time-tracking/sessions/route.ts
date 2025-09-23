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

const StartSessionSchema = z.object({
  task_description: z.string().min(1).max(500),
  hourly_rate: z.number().positive().optional()
});

const UpdateSessionSchema = z.object({
  last_activity: z.string().datetime().optional(),
  activity_level: z.number().min(0).max(100).optional(),
  screenshots: z.array(z.string()).optional(),
  total_breaks_minutes: z.number().min(0).optional()
});

// POST - Start new tracking session
const handleStartSession = async (request: NextRequest, user: any) => {
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
    const validatedData = validateAndSanitize(StartSessionSchema, body);

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

    // Check for existing active session for this contract
    const { data: existingSession, error: sessionError } = await supabase
      .from('time_tracking_sessions')
      .select('*')
      .eq('contract_id', contractId)
      .eq('freelancer_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (sessionError) {
      console.error('Session check error:', sessionError);
    }

    if (existingSession) {
      return NextResponse.json(
        { 
          error: 'Active session already exists for this contract',
          existing_session: existingSession
        },
        { status: 400 }
      );
    }

    // Create new tracking session
    const { data: session, error: createError } = await supabase
      .from('time_tracking_sessions')
      .insert({
        contract_id: contractId,
        freelancer_id: user.id,
        task_description: validatedData.task_description,
        start_time: new Date().toISOString(),
        last_activity: new Date().toISOString(),
        is_active: true,
        activity_data: {
          hourly_rate: validatedData.hourly_rate || contract.hourly_rate || 0
        }
      })
      .select()
      .single();

    if (createError) {
      console.error('Session creation error:', createError);
      return NextResponse.json(
        { error: 'Failed to start tracking session' },
        { status: 500 }
      );
    }

    // Log activity
    await auditLogger.logContractEvent(
      'time_tracking_started',
      contractId,
      user.id,
      {
        session_id: session.id,
        task_description: validatedData.task_description
      }
    );

    return NextResponse.json({
      success: true,
      session,
      message: 'Time tracking session started successfully'
    });

  } catch (error) {
    return ErrorHandler.handleApiError(error, request);
  }
};

// GET - Get active sessions
const handleGetSessions = async (request: NextRequest, user: any) => {
  try {
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contract_id');
    const isActive = searchParams.get('active') === 'true';
    
    const supabase = await createClient();

    // Build query
    let query = supabase
      .from('time_tracking_sessions')
      .select(`
        *,
        contracts!inner(
          id,
          title,
          freelancer_id,
          client_id
        )
      `)
      .eq('freelancer_id', user.id)
      .order('start_time', { ascending: false });

    if (contractId) {
      query = query.eq('contract_id', contractId);
    }

    if (isActive) {
      query = query.eq('is_active', true);
    }

    const { data: sessions, error: sessionsError } = await query;

    if (sessionsError) {
      console.error('Sessions fetch error:', sessionsError);
      return NextResponse.json(
        { error: 'Failed to fetch tracking sessions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sessions: sessions || []
    });

  } catch (error) {
    return ErrorHandler.handleApiError(error, request);
  }
};

export const POST = withAuth(handleStartSession);
export const GET = withAuth(handleGetSessions);