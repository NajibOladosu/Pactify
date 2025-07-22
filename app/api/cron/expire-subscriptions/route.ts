import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// This endpoint can be called by external cron services like Vercel Cron, GitHub Actions, etc.
export async function POST(request: NextRequest) {
  try {
    // Verify the request is authorized (optional security measure)
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET_TOKEN;
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create service client for administrative operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );

    console.log('Starting scheduled subscription expiration check...');

    // Run the expiration function
    const { error: expirationError } = await supabase.rpc('handle_subscription_expiration');
    
    if (expirationError) {
      console.error('Expiration check failed:', expirationError);
      return NextResponse.json({ 
        error: 'Expiration check failed', 
        details: expirationError.message 
      }, { status: 500 });
    }

    // Get summary of current subscription status
    const { data: subscriptionSummary } = await supabase
      .from('user_subscriptions')
      .select('status')
      .then(result => ({
        data: result.data?.reduce((acc, sub) => {
          acc[sub.status] = (acc[sub.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      }));

    const { data: expiredProfilesCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_tier', 'free');

    console.log('Expiration check completed successfully');

    return NextResponse.json({
      success: true,
      message: 'Subscription expiration check completed',
      timestamp: new Date().toISOString(),
      summary: {
        subscriptionStatuses: subscriptionSummary || {},
        freeProfiles: expiredProfilesCount || 0
      }
    });

  } catch (error) {
    console.error('Unexpected error during expiration check:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      timestamp: new Date().toISOString() 
    }, { status: 500 });
  }
}

// GET endpoint for manual checks/monitoring
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );

    // Check for subscriptions that need expiration
    const { data: expiringSoon } = await supabase
      .from('user_subscriptions')
      .select('user_id, plan_id, current_period_end, status')
      .eq('status', 'active')
      .lte('current_period_end', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()); // Next 24 hours

    const { data: alreadyExpired } = await supabase
      .from('user_subscriptions')
      .select('user_id, plan_id, current_period_end, status')
      .eq('status', 'active')
      .lt('current_period_end', new Date().toISOString()); // Already past end date

    return NextResponse.json({
      expiringSoon: expiringSoon?.length || 0,
      alreadyExpired: alreadyExpired?.length || 0,
      recommendations: alreadyExpired?.length > 0 
        ? 'Run expiration cleanup immediately' 
        : 'All subscriptions are current',
      details: {
        expiringSoon: expiringSoon || [],
        alreadyExpired: alreadyExpired || []
      }
    });

  } catch (error) {
    console.error('Error checking subscription status:', error);
    return NextResponse.json({ error: 'Failed to check subscriptions' }, { status: 500 });
  }
}