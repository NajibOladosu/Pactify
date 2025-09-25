import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get the current user with more detailed error logging
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    console.log("Auth check - User:", user?.id, "Error:", authError);
    console.log("Request headers:", Object.fromEntries(request.headers.entries()));
    
    if (authError || !user) {
      console.error("Auth error in profile update:", authError);
      console.error("Full auth response:", { user, authError });
      return NextResponse.json(
        { error: "Authentication required - session may have expired" },
        { status: 401 }
      );
    }
    
    console.log("Authenticated user in API route:", user.id);
    
    // Parse the request body
    const body = await request.json();
    const { display_name, company_name, website, bio } = body;
    
    // Prepare update data
    const updateData: Record<string, string | null> = {};
    if (display_name !== undefined) updateData.display_name = display_name;
    if (company_name !== undefined) updateData.company_name = company_name;
    if (website !== undefined) updateData.website = website;
    if (bio !== undefined) updateData.bio = bio;
    
    // Add timestamp
    updateData.updated_at = new Date().toISOString();
    
    console.log("Updating profile for user:", user.id, "with data:", updateData);
    
    // First check current profile data
    const { data: beforeUpdate } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    
    console.log("Profile BEFORE update:", beforeUpdate);
    
    if (!beforeUpdate) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }
    
    // Use a secure RPC function to bypass RLS issues while maintaining security
    const { data: updateResult, error: updateError } = await supabase
      .rpc('update_profile_secure', {
        p_user_id: user.id,
        p_display_name: display_name,
        p_company_name: company_name,
        p_website: website,
        p_bio: bio
      });
    
    if (updateError) {
      console.error("Database update error:", updateError);
      return NextResponse.json(
        { error: `Failed to update profile: ${updateError.message}` },
        { status: 500 }
      );
    }
    
    if (!updateResult?.success) {
      console.error("Profile update failed:", updateResult);
      return NextResponse.json(
        { error: updateResult?.error || "Failed to update profile" },
        { status: 400 }
      );
    }
    
    // Verify the update actually happened
    const { data: afterUpdate } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    
    console.log("Profile AFTER update:", afterUpdate);
    
    // Revalidate multiple paths to ensure fresh data
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    revalidatePath("/", "layout"); // Revalidate root layout
    
    return NextResponse.json({ 
      success: true,
      message: "Profile updated successfully",
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}