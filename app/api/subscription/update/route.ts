import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.plan || !['free', 'professional', 'business'].includes(body.plan)) {
      return NextResponse.json(
        { error: "Invalid plan type" },
        { status: 400 }
      );
    }
    
    // In a real app, this would update the subscription in a database
    // For now, we'll return a success response that the client can use to update localStorage
    
    return NextResponse.json({ 
      success: true,
      message: "Subscription updated successfully",
      subscription: {
        id: `sub_${Date.now()}`,
        plan: body.plan,
        status: 'active',
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 }
    );
  }
}
