import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { verifyPaymentMethod } from '@/lib/services/payment-verification';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: methodId } = await params;
    if (!methodId) {
      return NextResponse.json({ error: 'Method ID is required' }, { status: 400 });
    }

    // Verify the payment method belongs to the user
    const { data: method, error: fetchError } = await supabase
      .from('withdrawal_methods')
      .select('*')
      .eq('id', methodId)
      .eq('profile_id', user.id)
      .single();

    if (fetchError || !method) {
      return NextResponse.json({ 
        error: 'Payment method not found or access denied' 
      }, { status: 404 });
    }

    if (method.is_verified) {
      return NextResponse.json({
        success: true,
        verified: true,
        message: 'Payment method is already verified'
      });
    }

    // Perform verification
    const result = await verifyPaymentMethod(methodId);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        verified: false,
        error: result.error
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      verified: result.verified,
      message: result.verified 
        ? 'Payment method verified successfully!' 
        : 'Verification initiated - please check back later',
      details: result.details
    });

  } catch (error) {
    console.error('Payment method verification error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}