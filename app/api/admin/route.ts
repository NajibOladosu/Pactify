import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { withAuth } from "@/utils/api/with-auth";
import type { User } from "@supabase/supabase-js";

async function handleAdminRequest(request: NextRequest, user: User) {
  try {
    const supabase = await createClient();

    // Check if user has admin role
    const { data: userRoles, error: roleError } = await supabase
      .from('user_roles')
      .select(`
        roles!inner(name)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true);

    const isAdmin = userRoles?.some(ur => (ur.roles as any).name === 'admin') || 
                   user.email?.endsWith('@pactify.com');

    if (!isAdmin) {
      return NextResponse.json({ 
        error: "Admin access required" 
      }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'dashboard';

    switch (action) {
      case 'dashboard':
        return await getAdminDashboard(supabase);
      case 'users':
        return await getUsers(supabase, searchParams);
      case 'contracts':
        return await getContracts(supabase, searchParams);
      case 'payments':
        return await getPayments(supabase, searchParams);
      default:
        return NextResponse.json({ 
          error: "Invalid action" 
        }, { status: 400 });
    }

  } catch (error) {
    console.error("Admin API error:", error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}

async function getAdminDashboard(supabase: any) {
  // Get platform statistics
  const [
    { count: totalUsers },
    { count: totalContracts },
    { count: activeContracts },
    { count: totalPayments }
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('contracts').select('*', { count: 'exact', head: true }),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['signed', 'in_progress']),
    supabase.from('contract_escrows').select('*', { count: 'exact', head: true })
  ]);

  // Get recent activity
  const { data: recentActivity } = await supabase
    .from('audit_logs')
    .select(`
      *,
      profiles(display_name)
    `)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({
    success: true,
    dashboard: {
      stats: {
        total_users: totalUsers || 0,
        total_contracts: totalContracts || 0,
        active_contracts: activeContracts || 0,
        total_payments: totalPayments || 0
      },
      recent_activity: recentActivity || []
    }
  });
}

async function getUsers(supabase: any, searchParams: URLSearchParams) {
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');
  const search = searchParams.get('search');

  let query = supabase
    .from('profiles')
    .select(`
      *,
      user_roles(
        roles(name)
      )
    `)
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false });

  if (search) {
    query = query.or(`display_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data: users, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    users: users || [],
    pagination: { limit, offset }
  });
}

async function getContracts(supabase: any, searchParams: URLSearchParams) {
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');
  const status = searchParams.get('status');

  let query = supabase
    .from('contracts')
    .select(`
      *,
      client:profiles!client_id(display_name),
      freelancer:profiles!freelancer_id(display_name)
    `)
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data: contracts, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    contracts: contracts || [],
    pagination: { limit, offset }
  });
}

async function getPayments(supabase: any, searchParams: URLSearchParams) {
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  const { data: payments, error } = await supabase
    .from('contract_escrows')
    .select(`
      *,
      contracts(
        title,
        client:profiles!client_id(display_name),
        freelancer:profiles!freelancer_id(display_name)
      )
    `)
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    payments: payments || [],
    pagination: { limit, offset }
  });
}

export const GET = withAuth(handleAdminRequest);