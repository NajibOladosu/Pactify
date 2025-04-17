import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import Stripe from 'stripe';

// Initialize Stripe client
// Ensure STRIPE_SECRET_KEY is set in your environment variables
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil', // Updated API version based on TS error
  typescript: true,
});

export async function GET() {
  const supabase = await createClient();

  try {
    // 1. Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Error fetching user:', userError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get user's Stripe Customer ID from profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || !profile.stripe_customer_id) {
      console.error('Error fetching profile or Stripe customer ID:', profileError);
      // If no customer ID, they likely haven't subscribed to a paid plan yet
      return NextResponse.json({ invoices: [] }); // Return empty array, not an error
    }

    const stripeCustomerId = profile.stripe_customer_id;

    // 3. Fetch invoices from Stripe
    const invoices = await stripe.invoices.list({
      customer: stripeCustomerId,
      limit: 20, // Fetch up to 20 recent invoices
    });

    // 4. Format the invoice data for the frontend
    const formattedInvoices = invoices.data.map(invoice => ({
      id: invoice.id,
      date: invoice.created, // Unix timestamp
      amount: invoice.amount_paid / 100, // Amount in dollars/euros etc.
      currency: invoice.currency.toUpperCase(),
      status: invoice.status,
      pdfUrl: invoice.invoice_pdf,
    }));

    return NextResponse.json({ invoices: formattedInvoices });

  } catch (error) {
    console.error('Error fetching Stripe invoices:', error);
    // Check if it's a Stripe error
    if (error instanceof Stripe.errors.StripeError) {
        return NextResponse.json({ error: `Stripe error: ${error.message}` }, { status: 500 });
    }
    // Generic error
    return NextResponse.json({ error: 'Failed to fetch billing history' }, { status: 500 });
  }
}
