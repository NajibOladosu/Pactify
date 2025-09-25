import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Cron job to sync all subscription data
export async function GET(request: NextRequest) {
  try {
    console.log('=== CRON: Syncing all subscription data ===');
    
    const supabase = await createClient();
    
    // Run the sync function for all users
    const { data: syncResult, error } = await supabase
      .rpc('sync_user_subscription_to_profile');
      
    if (error) {
      console.error('Subscription sync cron error:', error);
      return NextResponse.json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }
    
    console.log('Subscription sync cron completed:', syncResult);
    
    return NextResponse.json({
      success: true,
      message: 'All subscription data synced successfully',
      result: syncResult,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Subscription sync cron error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}