import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/utils/api/with-auth';
import { createClient } from '@/utils/supabase/server';
import type { User } from '@supabase/supabase-js';

async function syncUserSubscription(request: NextRequest, user: User) {
  try {
    console.log('Syncing subscription data for user:', user.id);
    
    const supabase = await createClient();
    
    // Sync this specific user's subscription
    const { data: syncResult, error } = await supabase
      .rpc('sync_user_subscription_to_profile', {
        user_id_param: user.id
      });
      
    if (error) {
      console.error('Subscription sync error:', error);
      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 500 });
    }
    
    console.log('Subscription sync result:', syncResult);
    
    // Get the updated profile to return current subscription info
    const { data: updatedProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, subscription_tier, available_contracts, subscription_start_date, subscription_end_date')
      .eq('id', user.id)
      .single();
      
    if (profileError) {
      console.error('Error fetching updated profile:', profileError);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Subscription data synced successfully',
      syncResult,
      updatedProfile,
      instructions: 'Please refresh your browser to see the updated subscription status'
    });
    
  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

// Support both GET and POST methods
export const GET = withAuth(syncUserSubscription);
export const POST = withAuth(syncUserSubscription);