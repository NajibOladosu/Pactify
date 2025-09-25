import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { withAuth } from '@/utils/api/with-auth';
import { auditLogger } from '@/utils/security/audit-logger';
import { z } from 'zod';
import type { User } from '@supabase/supabase-js';

const onboardingSchema = z.object({
  display_name: z.string().min(1, 'Display name is required').max(100),
  user_type: z.enum(['freelancer', 'client', 'both']),
  business_name: z.string().max(100).optional(),
  skills: z.array(z.string()).max(20).optional(),
  bio: z.string().max(1000).optional(),
  website: z.union([z.string().url(), z.literal(''), z.undefined()]).optional(),
  phone: z.string().max(20).optional(),
  onboarding_completed: z.boolean(),
  onboarding_completed_at: z.string()
});

async function handleOnboardingComplete(request: NextRequest, user: User) {
  try {
    console.log('Onboarding handler - user authenticated:', { userId: user.id, email: user.email });
    
    const supabase = await createClient();
    const body = await request.json();
    
    console.log('Onboarding completion request body:', body);
    
    // Validate request data
    const validatedData = onboardingSchema.parse(body);
    console.log('Validated onboarding data:', validatedData);

    // Use the database function directly as primary method since it's more reliable
    // This avoids all RLS issues and works consistently for all users
    console.log('Using database function for onboarding completion...');

    const { data: updatedProfile, error } = await supabase
      .rpc('complete_user_onboarding', {
        user_id_param: user.id,
        display_name_param: validatedData.display_name,
        user_type_param: validatedData.user_type,
        bio_param: validatedData.bio || null,
        website_param: validatedData.website || null,
        phone_param: validatedData.phone || null,
        skills_param: validatedData.skills || null,
        company_name_param: validatedData.business_name || null
      });

    if (error) {
      console.error('Database function error:', error);
      return NextResponse.json(
        { 
          error: 'Failed to complete onboarding',
          details: error.message,
          code: error.code 
        },
        { status: 500 }
      );
    }

    console.log('Profile update successful:', { 
      updatedProfile: updatedProfile,
      onboardingCompleted: updatedProfile?.onboarding_completed 
    });

    // Verify the update by reading the profile again
    const { data: verifyProfile, error: verifyError } = await supabase
      .from('profiles')
      .select('id, onboarding_completed, onboarding_completed_at, updated_at')
      .eq('id', user.id)
      .single();
      
    console.log('Profile verification after update:', {
      verifyProfile,
      verifyError: verifyError?.message
    });

    // Log successful onboarding completion
    await auditLogger.logSecurityEvent({
      userId: user.id,
      action: 'onboarding_completed',
      resource: 'profile',
      details: {
        user_type: validatedData.user_type,
        has_business_name: !!validatedData.business_name,
        skills_count: validatedData.skills?.length || 0,
        has_bio: !!validatedData.bio,
        has_website: !!validatedData.website,
        has_phone: !!validatedData.phone
      },
      success: true,
      severity: 'low'
    });

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
      message: 'Onboarding completed successfully'
    });

  } catch (error: any) {
    console.error('Onboarding completion error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid data provided',
          details: error.errors 
        },
        { status: 400 }
      );
    }

    await auditLogger.logSecurityEvent({
      userId: user.id,
      action: 'onboarding_error',
      resource: 'profile',
      details: {
        error: error.message
      },
      success: false,
      severity: 'medium'
    });

    return NextResponse.json(
      { error: 'Failed to complete onboarding' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handleOnboardingComplete);