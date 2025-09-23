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

const UpdateSessionSchema = z.object({
  last_activity: z.string().datetime().optional(),
  activity_level: z.number().min(0).max(100).optional(),
  screenshots: z.array(z.string()).optional(),
  total_breaks_minutes: z.number().min(0).optional()
});

const StopSessionSchema = z.object({
  end_time: z.string().datetime().optional(),
  final_notes: z.string().max(1000).optional(),
  create_time_entry: z.boolean().default(true)
});

// GET - Get specific session
const handleGetSession = async (request: NextRequest, user: any) => {
  try {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const contractId = pathSegments[pathSegments.indexOf('contracts') + 1];
    const sessionId = pathSegments[pathSegments.indexOf('sessions') + 1];

    const supabase = await createClient();

    // Get session with contract info
    const { data: session, error: sessionError } = await supabase
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
      .eq('id', sessionId)
      .eq('contract_id', contractId)
      .eq('freelancer_id', user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      session
    });

  } catch (error) {
    return ErrorHandler.handleApiError(error, request);
  }
};

// PUT - Update session activity
const handleUpdateSession = async (request: NextRequest, user: any) => {
  try {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const contractId = pathSegments[pathSegments.indexOf('contracts') + 1];
    const sessionId = pathSegments[pathSegments.indexOf('sessions') + 1];

    const supabase = await createClient();
    const body = await request.json();
    
    // Validate input
    const validatedData = validateAndSanitize(UpdateSessionSchema, body);

    // Get existing session
    const { data: existingSession, error: fetchError } = await supabase
      .from('time_tracking_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('contract_id', contractId)
      .eq('freelancer_id', user.id)
      .eq('is_active', true)
      .single();

    if (fetchError || !existingSession) {
      return NextResponse.json(
        { error: 'Active session not found or access denied' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {
      last_activity: validatedData.last_activity || new Date().toISOString()
    };

    if (validatedData.activity_level !== undefined) {
      updateData.activity_level = validatedData.activity_level;
    }

    if (validatedData.screenshots) {
      // Merge new screenshots with existing ones
      const existingScreenshots = existingSession.screenshots || [];
      updateData.screenshots = [...existingScreenshots, ...validatedData.screenshots];
    }

    if (validatedData.total_breaks_minutes !== undefined) {
      updateData.total_breaks_minutes = validatedData.total_breaks_minutes;
    }

    // Update session
    const { data: updatedSession, error: updateError } = await supabase
      .from('time_tracking_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError) {
      console.error('Session update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      session: updatedSession,
      message: 'Session updated successfully'
    });

  } catch (error) {
    return ErrorHandler.handleApiError(error, request);
  }
};

// DELETE - Stop tracking session
const handleStopSession = async (request: NextRequest, user: any) => {
  try {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const contractId = pathSegments[pathSegments.indexOf('contracts') + 1];
    const sessionId = pathSegments[pathSegments.indexOf('sessions') + 1];

    const supabase = await createClient();
    const body = await request.json();
    
    // Validate input
    const validatedData = validateAndSanitize(StopSessionSchema, body);

    // Get existing session with contract info
    const { data: session, error: fetchError } = await supabase
      .from('time_tracking_sessions')
      .select(`
        *,
        contracts!inner(
          id,
          title,
          hourly_rate,
          freelancer_id,
          client_id
        )
      `)
      .eq('id', sessionId)
      .eq('contract_id', contractId)
      .eq('freelancer_id', user.id)
      .eq('is_active', true)
      .single();

    if (fetchError || !session) {
      return NextResponse.json(
        { error: 'Active session not found or access denied' },
        { status: 404 }
      );
    }

    const endTime = validatedData.end_time || new Date().toISOString();

    // Calculate session duration
    const startTime = new Date(session.start_time);
    const stopTime = new Date(endTime);
    const totalMinutes = Math.max(0, (stopTime.getTime() - startTime.getTime()) / (1000 * 60));
    const workMinutes = Math.max(0, totalMinutes - (session.total_breaks_minutes || 0));

    let timeEntry = null;

    // Create time entry if requested
    if (validatedData.create_time_entry && workMinutes > 0) {
      const contract = session.contracts;
      const hourlyRate = session.activity_data?.hourly_rate || contract.hourly_rate || 0;

      const { data: entry, error: entryError } = await supabase
        .from('time_entries')
        .insert({
          contract_id: contractId,
          freelancer_id: user.id,
          task_description: session.task_description,
          start_time: session.start_time,
          end_time: endTime,
          duration_minutes: workMinutes,
          hourly_rate: hourlyRate,
          freelancer_notes: validatedData.final_notes || null,
          screenshots: session.screenshots || [],
          activity_level: session.activity_level || null,
          status: 'submitted',
          submitted_at: endTime,
          metadata: {
            session_id: sessionId,
            total_breaks_minutes: session.total_breaks_minutes || 0,
            activity_tracking: true
          }
        })
        .select()
        .single();

      if (entryError) {
        console.error('Time entry creation error:', entryError);
        return NextResponse.json(
          { error: 'Failed to create time entry from session' },
          { status: 500 }
        );
      }

      timeEntry = entry;
    }

    // Mark session as inactive
    const { error: updateError } = await supabase
      .from('time_tracking_sessions')
      .update({
        is_active: false,
        last_activity: endTime
      })
      .eq('id', sessionId);

    if (updateError) {
      console.error('Session stop error:', updateError);
      return NextResponse.json(
        { error: 'Failed to stop session' },
        { status: 500 }
      );
    }

    // Log activity
    await auditLogger.logContractEvent(
      'time_tracking_stopped',
      contractId,
      user.id,
      {
        session_id: sessionId,
        duration_minutes: workMinutes,
        time_entry_created: !!timeEntry,
        time_entry_id: timeEntry?.id || null
      }
    );

    return NextResponse.json({
      success: true,
      session_id: sessionId,
      duration_minutes: workMinutes,
      time_entry: timeEntry,
      message: 'Time tracking session stopped successfully'
    });

  } catch (error) {
    return ErrorHandler.handleApiError(error, request);
  }
};

export const GET = withAuth(handleGetSession);
export const PUT = withAuth(handleUpdateSession);
export const DELETE = withAuth(handleStopSession);