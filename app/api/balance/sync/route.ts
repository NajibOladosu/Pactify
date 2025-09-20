import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { balanceSyncManager } from '@/lib/payout/balance-sync';

// POST /api/balance/sync - Sync historical payments or trigger manual sync
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action = 'sync_user', user_id = user.id } = body;

    // Only allow admin users to sync all payments or other users
    if (action === 'sync_all' || (user_id !== user.id)) {
      // TODO: Add admin role check here
      // For now, only allow service role or specific admin users
      const isAdmin = user.email?.endsWith('@pactify.com') || false;
      if (!isAdmin) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Admin access required' },
          { status: 403 }
        );
      }
    }

    let result;

    switch (action) {
      case 'sync_all':
        // Sync all existing contract payments to wallet balances
        result = await balanceSyncManager.syncAllExistingPayments();
        break;

      case 'sync_user':
        // Reconcile and sync a specific user's balance
        const balanceSummary = await balanceSyncManager.getBalanceSummary(user_id);
        const reconciliation = await balanceSyncManager.reconcileUserBalance(user_id);
        
        result = {
          user_id,
          balance_summary: balanceSummary,
          reconciliation,
          synced: true
        };
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action', message: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      action,
      result
    });

  } catch (error) {
    console.error('Balance sync error:', error);
    return NextResponse.json(
      { 
        error: 'Sync failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

// GET /api/balance/sync - Get balance sync status and summary
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id') || user.id;

    // Only allow viewing own balance or admin access
    if (userId !== user.id) {
      const isAdmin = user.email?.endsWith('@pactify.com') || false;
      if (!isAdmin) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Access denied' },
          { status: 403 }
        );
      }
    }

    // Get balance summary and reconciliation
    const balanceSummary = await balanceSyncManager.getBalanceSummary(userId);
    const reconciliation = await balanceSyncManager.reconcileUserBalance(userId);

    return NextResponse.json({
      success: true,
      user_id: userId,
      balance_summary: balanceSummary,
      reconciliation,
      has_discrepancies: Object.keys(reconciliation.discrepancies).length > 0
    });

  } catch (error) {
    console.error('Balance sync status error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get balance status', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}