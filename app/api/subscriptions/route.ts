import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    if (!body.plan || !['professional', 'business'].includes(body.plan)) {
      return NextResponse.json(
        { error: "Invalid plan type" },
        { status: 400 }
      );
    }
    
    if (!body.billingCycle || !['monthly', 'yearly'].includes(body.billingCycle)) {
      return NextResponse.json(
        { error: "Invalid billing cycle" },
        { status: 400 }
      );
    }
    
    // In a real app, this would create a subscription in Stripe or another payment processor
    // and store the subscription in the database
    const subscription = {
      id: `sub_${Date.now()}`,
      plan: body.plan,
      billingCycle: body.billingCycle,
      status: 'active',
      createdAt: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + (body.billingCycle === 'monthly' ? 30 : 365) * 24 * 60 * 60 * 1000).toISOString()
    };
    
    return NextResponse.json({ 
      message: "Subscription created",
      subscription
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create subscription" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // In a real application, this would fetch from a database
    // Here we return a mock subscription
    const subscription = {
      id: "sub_current",
      plan: "free",
      status: "active",
      createdAt: new Date().toISOString(),
      currentPeriodEnd: null
    };
    
    return NextResponse.json({ 
      message: "Subscription fetched",
      subscription
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch subscription" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    
    if (!body.plan || !['free', 'professional', 'business'].includes(body.plan)) {
      return NextResponse.json(
        { error: "Invalid plan type" },
        { status: 400 }
      );
    }
    
    // In a real application, this would update the subscription in Stripe and the database
    const updatedSubscription = {
      id: "sub_current",
      plan: body.plan,
      billingCycle: body.billingCycle || 'monthly',
      status: "active",
      updatedAt: new Date().toISOString()
    };
    
    return NextResponse.json({ 
      message: "Subscription updated",
      subscription: updatedSubscription
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    // In a real application, this would cancel the subscription in Stripe and update the database
    return NextResponse.json({ 
      message: "Subscription cancelled",
      subscription: {
        id: "sub_current",
        status: "cancelled",
        cancelledAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}
