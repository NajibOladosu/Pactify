import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  const supabase = await createClient();

  try {
    // Fetch all subscription plans from the database
    const { data: plans, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('price_monthly', { ascending: true });

    if (error) {
      console.error('Error fetching subscription plans:', error);
      return NextResponse.json(
        { error: 'Failed to fetch subscription plans' },
        { status: 500 }
      );
    }

    // Transform the data to match the frontend interface
    const transformedPlans = plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: {
        monthly: parseFloat(plan.price_monthly),
        yearly: parseFloat(plan.price_yearly)
      },
      features: plan.features?.features || [],
      escrowFeePercentage: parseFloat(plan.escrow_fee_percentage),
      maxContracts: plan.max_contracts,
      stripePriceIdMonthly: plan.stripe_price_id_monthly,
      stripePriceIdYearly: plan.stripe_price_id_yearly,
      // Set mostPopular flag - you can modify this logic as needed
      mostPopular: plan.id === 'professional',
      // For now, we'll leave limitations empty since they're not in the database
      // You could add a limitations field to the database if needed
      limitations: plan.id === 'free' 
        ? ["No custom branding", "Limited templates", "No team features"]
        : plan.id === 'professional'
        ? ["No team features", "Basic reporting only"]
        : []
    }));

    return NextResponse.json({
      message: "Subscription plans fetched successfully",
      plans: transformedPlans
    });

  } catch (error) {
    console.error('Unexpected error fetching subscription plans:', error);
    return NextResponse.json(
      { error: "Failed to fetch subscription plans" },
      { status: 500 }
    );
  }
}