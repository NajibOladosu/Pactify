import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  const supabase = await createClient();

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Test auth.uid() function directly
    const { data: authTest, error: authError } = await supabase
      .rpc('debug_auth_context');


    return NextResponse.json({
      userId: user.id,
      userEmail: user.email,
      authUidResult: authTest,
      authError,
      authUidWorking: authTest && authTest[0] && authTest[0].current_uid === user.id
    });

  } catch (error) {
    console.error('🧪 Auth test error:', error);
    return NextResponse.json(
      { error: "Auth test failed" },
      { status: 500 }
    );
  }
}