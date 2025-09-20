// Optimized profile helpers with caching and reduced database calls

import { createClient } from "@/utils/supabase/server";
import { unstable_cache } from 'next/cache';

export interface OptimizedUserProfile {
  id: string;
  display_name: string;
  user_type: string;
  subscription_tier: string;
  stripe_connect_account_id: string | null;
  available_contracts: number;
  has_enhanced_kyc: boolean;
  contract_count: number;
  available_balance_usd: number;
  last_login: string;
}

// Cached profile lookup - cached for 5 minutes per user
const getCachedUserProfile = unstable_cache(
  async (userId: string): Promise<OptimizedUserProfile | null> => {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .rpc('get_user_profile_fast', { _user_id: userId })
      .single();

    if (error || !data) {
      return null;
    }

    return data as OptimizedUserProfile;
  },
  ['user-profile'],
  {
    revalidate: 300, // 5 minutes
    tags: ['user-profile']
  }
);

// Main optimized function that replaces the multiple database calls
export async function getOptimizedUserProfile(userId: string): Promise<OptimizedUserProfile> {
  // Try to get from cache first
  let profile = await getCachedUserProfile(userId);
  
  if (!profile) {
    // Create profile if it doesn't exist
    profile = await createUserProfileOptimized(userId);
  }
  
  return profile;
}

// Optimized profile creation - only called when profile doesn't exist
async function createUserProfileOptimized(userId: string): Promise<OptimizedUserProfile> {
  const supabase = await createClient();
  
  // Get user data for profile creation
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    throw new Error("User not authenticated");
  }

  // Create profile with default values
  const { data: newProfile, error: createError } = await supabase
    .from("profiles")
    .insert({
      id: userId,
      display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || "User",
      user_type: user.user_metadata?.user_type || "both",
      subscription_tier: "free",
      available_contracts: 3
    })
    .select()
    .single();

  if (createError) {
    throw new Error(`Failed to create profile: ${createError.message}`);
  }

  // Link contracts asynchronously (don't block the response)
  if (user.email) {
    linkUserContractsAsync(userId, user.email);
  }

  // Return optimized profile structure
  return {
    id: newProfile.id,
    display_name: newProfile.display_name,
    user_type: newProfile.user_type,
    subscription_tier: newProfile.subscription_tier,
    stripe_connect_account_id: newProfile.stripe_connect_account_id,
    available_contracts: newProfile.available_contracts,
    has_enhanced_kyc: false, // New profile, so no enhanced KYC
    contract_count: 0, // New profile, so no contracts
    available_balance_usd: 0, // New profile, so no balance
    last_login: new Date().toISOString()
  };
}

// Async contract linking - doesn't block the response
async function linkUserContractsAsync(userId: string, userEmail: string): Promise<void> {
  try {
    const supabase = await createClient();
    
    // Call the database function to link contracts
    await supabase.rpc('link_user_contracts', {
      p_user_id: userId,
      p_user_email: userEmail
    });
  } catch (error) {
    // Log error but don't throw - this is background operation
    console.error('Background contract linking failed:', error);
  }
}

// Cache invalidation when profile is updated
export async function invalidateUserProfileCache(userId: string): Promise<void> {
  const { revalidateTag } = await import('next/cache');
  revalidateTag('user-profile');
}

// Batch profile loading for admin operations
export async function getMultipleUserProfiles(userIds: string[]): Promise<OptimizedUserProfile[]> {
  if (userIds.length === 0) return [];
  
  const supabase = await createClient();
  
  // Use SQL query to get all profiles in one call
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      display_name,
      user_type,
      subscription_tier,
      stripe_connect_account_id,
      available_contracts,
      enhanced_kyc_status
    `)
    .in('id', userIds);

  if (error || !data) {
    throw new Error(`Failed to fetch profiles: ${error?.message}`);
  }

  return data.map(profile => ({
    ...profile,
    has_enhanced_kyc: profile.enhanced_kyc_status === 'verified',
    contract_count: 0, // Would need additional query, skip for batch operation
    available_balance_usd: 0, // Would need additional query, skip for batch operation
    last_login: new Date().toISOString()
  }));
}

// Prefetch dashboard data for faster loading
export const getDashboardData = unstable_cache(
  async (userId: string) => {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .rpc('get_user_dashboard_data', { _user_id: userId })
      .single();

    if (error) {
      throw new Error(`Failed to fetch dashboard data: ${error.message}`);
    }

    return data;
  },
  ['dashboard-data'],
  {
    revalidate: 60, // 1 minute cache
    tags: ['dashboard-data']
  }
);

// Utility to warm up caches
export async function warmupUserCaches(userId: string): Promise<void> {
  try {
    // Prefetch both profile and dashboard data
    await Promise.all([
      getCachedUserProfile(userId),
      getDashboardData(userId)
    ]);
  } catch (error) {
    console.error('Cache warmup failed:', error);
  }
}