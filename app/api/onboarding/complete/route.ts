import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { withFullSecurity } from '@/utils/security/middleware';
import { auditLogger } from '@/utils/security/audit-logger';
import { z } from 'zod';
import type { User } from '@supabase/supabase-js';

const onboardingSchema = z.object({
  display_name: z.string().min(1, 'Display name is required').max(100),
  user_type: z.enum(['freelancer', 'client', 'both']),
  business_name: z.string().max(100).optional(),
  skills: z.array(z.string()).max(20).optional(),
  bio: z.string().max(1000).optional(),
  website: z.string().url().optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  onboarding_completed: z.boolean(),
  onboarding_completed_at: z.string()
});

async function handleOnboardingComplete(request: NextRequest, user?: User) {
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required" },
      { status: 401 }
    );
  }
  try {
    const supabase = await createClient();
    const body = await request.json();
    
    // Validate request data
    const validatedData = onboardingSchema.parse(body);
    
    // Update user profile
    const { data: updatedProfile, error } = await supabase
      .from('profiles')
      .update({
        display_name: validatedData.display_name,
        user_type: validatedData.user_type,
        business_name: validatedData.business_name || null,
        skills: validatedData.skills || null,
        bio: validatedData.bio || null,
        website: validatedData.website || null,
        phone: validatedData.phone || null,
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Profile update error:', error);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

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

export const POST = withFullSecurity(handleOnboardingComplete);