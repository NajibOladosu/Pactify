import { createClient } from "@/utils/supabase/server";

export async function ensureUserProfile(userId: string) {
  const supabase = await createClient();
  
  // First, try to get the user data for profile creation
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    throw new Error("User not authenticated");
  }

  // Try to fetch existing profile
  const { data: existingProfile, error: fetchError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (existingProfile && !fetchError) {
    return existingProfile;
  }

  // If profile doesn't exist, create it
  if (fetchError?.code === 'PGRST116') {
    console.log("Creating missing profile for user:", userId);
    
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
      console.error("Error creating profile:", createError);
      throw new Error(`Failed to create profile: ${createError.message}`);
    }

    return newProfile;
  }

  // Other database errors
  throw new Error(`Database error: ${fetchError?.message}`);
}

export async function createMissingProfiles() {
  const supabase = await createClient();

  // Find users without profiles (admin function)
  const { data: usersWithoutProfiles, error } = await supabase
    .from("user_public_info")
    .select(`
      id,
      email,
      created_at,
      profiles!left(id)
    `)
    .is("profiles.id", null);

  if (error) {
    console.error("Error finding users without profiles:", error);
    return;
  }

  if (!usersWithoutProfiles || usersWithoutProfiles.length === 0) {
    console.log("All users have profiles");
    return;
  }

  console.log(`Found ${usersWithoutProfiles.length} users without profiles`);

  for (const user of usersWithoutProfiles) {
    try {
      const { error: createError } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          display_name: user.email?.split('@')[0] || "User",
          user_type: "both",
          subscription_tier: "free",
          available_contracts: 3
        });

      if (createError) {
        console.error(`Failed to create profile for user ${user.id}:`, createError);
      } else {
        console.log(`Created profile for user ${user.id}`);
      }
    } catch (err) {
      console.error(`Error creating profile for user ${user.id}:`, err);
    }
  }
}