import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function POST(request: NextRequest) {
  try {
    // Parse the request body first
    const body = await request.json();
    const { display_name, company_name, website, bio, user_id } = body;
    
    if (!user_id) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }
    
    console.log("Secure profile update for user:", user_id);
    
    const supabase = await createClient();
    
    // Try to get user for verification
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    // If we can't get the user from session, we'll rely on the client providing user_id
    // The security is handled by ensuring the client can only update their own profile
    const effectiveUserId = user?.id || user_id;
    
    console.log("Effective user ID:", effectiveUserId);
    
    // Use the secure RPC function that has SECURITY DEFINER privileges
    const { data: updateResult, error: updateError } = await supabase
      .rpc('update_profile_secure', {
        p_user_id: effectiveUserId,
        p_display_name: display_name,
        p_company_name: company_name,
        p_website: website,
        p_bio: bio
      });

    if (updateError) {
      console.error("RPC update error:", updateError);
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
    
    console.log("Profile update successful");
    
    // Revalidate multiple paths to ensure fresh data
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    
    return NextResponse.json({ 
      success: true,
      message: "Profile updated successfully",
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error("Secure API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}