"use server";

"use server";

import { encodedRedirect } from "@/utils/utils";
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache"; // Import revalidatePath

export const signUpAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const userType = "both"; // Default all users to 'both' since they can be either freelancer or client
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  if (!email || !password) {
    return encodedRedirect(
      "error",
      "/sign-up",
      "Email and password are required",
    );
  }

  // Get user's display name from email (before the @ sign)
  const displayName = email.split('@')[0];

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: {
        user_type: userType,
        full_name: displayName,
      },
    },
  });

  if (error) {
    console.error(error.code + " " + error.message);
    return encodedRedirect("error", "/sign-up", error.message);
  } else {
    return encodedRedirect(
      "success",
      "/sign-up",
      "Thanks for signing up! Please check your email for a verification link.",
    );
  }
};

export const signInAction = async (formData: FormData) => {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return encodedRedirect("error", "/sign-in", error.message);
  }

  return redirect("/dashboard");
};

export const forgotPasswordAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const callbackUrl = formData.get("callbackUrl")?.toString();

  if (!email) {
    return encodedRedirect("error", "/forgot-password", "Email is required");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?redirect_to=/protected/reset-password`,
  });

  if (error) {
    console.error(error.message);
    return encodedRedirect(
      "error",
      "/forgot-password",
      "Could not reset password",
    );
  }

  if (callbackUrl) {
    return redirect(callbackUrl);
  }

  return encodedRedirect(
    "success",
    "/forgot-password",
    "Check your email for a link to reset your password.",
  );
};

export const resetPasswordAction = async (formData: FormData) => {
  const supabase = await createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    return encodedRedirect(
      "error",
      "/protected/reset-password",
      "Password and confirm password are required",
    );
  }

  if (password !== confirmPassword) {
    return encodedRedirect(
      "error",
      "/protected/reset-password",
      "Passwords do not match",
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    return encodedRedirect(
      "error",
      "/protected/reset-password",
      "Password update failed",
    );
  }

  return encodedRedirect("success", "/protected/reset-password", "Password updated");
};

export const signOutAction = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect("/sign-in");
};

// Action to update user profile information
export const updateUserProfile = async (formData: FormData) => {
  const supabase = await createClient();

  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user) {
    console.error("Error getting user:", getUserError);
    // Handle error appropriately, maybe redirect to sign-in
    // For now, just log the error and return
    return; 
  }

  const profileData = {
    display_name: formData.get("display_name")?.toString(),
    company_name: formData.get("company_name")?.toString(),
    website: formData.get("website")?.toString(),
    bio: formData.get("bio")?.toString(),
    // Add other fields from your profiles table if needed
  };

  // Filter out undefined values if necessary, or handle them in Supabase policies/defaults
  const updateData = Object.fromEntries(
    Object.entries(profileData).filter(([_, v]) => v !== undefined)
  );

  if (Object.keys(updateData).length === 0) {
    // No actual data to update
    return; 
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", user.id);

  if (updateError) {
    console.error("Error updating profile:", updateError);
    // Log the error and return
    return; 
  }

  // Revalidate the path to show updated data
  revalidatePath("/dashboard/settings");

  // Server actions used directly in `action` should typically return void or Promise<void>.
  // Feedback (like toasts) would require using `useFormState` on the client.
};


export const signInWithGoogleAction = async () => {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    return encodedRedirect("error", "/sign-in", error.message);
  }

  return redirect(data.url);
};

export const signUpWithGoogleAction = async () => {
  // For Google OAuth, the sign-in and sign-up processes are the same
  return signInWithGoogleAction();
};

// Action to create a new contract
export const createContractAction = async (formData: {
  title: string;
  description: string;
  clientEmail: string; // Assuming clientEmail is used to identify/invite the other party later
  price: string;
  currency: string;
  paymentType: string;
  template: string | null; // ID of the template used, or 'custom'
}) => {
  const supabase = await createClient();

  // 1. Get current user
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user) {
    console.error("Create Contract Error: User not found.", getUserError);
    return { error: "You must be logged in to create a contract." };
  }
  const userId = user.id;

  // 2. Get user's active subscription plan
  let planId = 'free'; // Default to free
  let maxContracts: number | null = 3; // Default limit for free

  const { data: subscription, error: getSubscriptionError } = await supabase
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle(); // Use maybeSingle as user might not have a subscription record

  if (getSubscriptionError) {
    console.error("Create Contract Error: Failed to fetch subscription.", getSubscriptionError);
    // Proceed assuming free plan, but log the error
  }

  if (subscription?.plan_id) {
    planId = subscription.plan_id;
    // 3. Get plan details (max_contracts)
    const { data: planDetails, error: getPlanError } = await supabase
      .from('subscription_plans')
      .select('max_contracts')
      .eq('id', planId)
      .single();

    if (getPlanError) {
      console.error("Create Contract Error: Failed to fetch plan details.", getPlanError);
      // If plan details fail, cautiously default to free limit
      planId = 'free';
      maxContracts = 3;
    } else {
      maxContracts = planDetails.max_contracts; // Can be null for paid plans
    }
  } else {
      // If no active subscription found, explicitly check the free plan details
      const { data: freePlanDetails, error: getFreePlanError } = await supabase
        .from('subscription_plans')
        .select('max_contracts')
        .eq('id', 'free')
        .single();
      if (!getFreePlanError && freePlanDetails) {
          maxContracts = freePlanDetails.max_contracts;
      } else {
          console.error("Create Contract Error: Failed to fetch free plan details.", getFreePlanError);
          // Fallback if even free plan details fail
          maxContracts = 3;
      }
  }


  // 4. Check contract limit if applicable (maxContracts is not null)
  if (maxContracts !== null) {
    // Use RPC call to the secure function
    const { data: count, error: rpcError } = await supabase.rpc(
      'get_active_contract_count',
      { p_user_id: userId }
    );

    if (rpcError) {
      console.error("Create Contract Error: Failed to count active contracts via RPC.", rpcError);
      return { error: "Could not verify your current contract count. Please try again." };
    }

    // RPC returns the count directly
    if (count !== null && count >= maxContracts) {
      return { error: `You have reached the maximum number of active contracts (${maxContracts}) for the ${planId} plan. Please upgrade to create more.` };
    }
  }

  // 5. Fetch Template ID if a template name was provided
  let templateUuid: string | null = null;
  if (formData.template && formData.template !== 'custom') {
    const { data: templateData, error: templateError } = await supabase
      .from('contract_templates')
      .select('id')
      .eq('name', formData.template)
      .maybeSingle(); // Use maybeSingle as template might not exist (though unlikely)

    if (templateError) {
      console.error(`Create Contract Error: Failed to fetch template ID for name "${formData.template}".`, templateError);
      // Decide how to handle: error out or proceed without template? Let's error out for safety.
      return { error: `Could not find the specified template "${formData.template}".` };
    }
    if (!templateData) {
        // Proceed without template ID if not found, or return error? Let's proceed without.
        templateUuid = null;
    } else {
        templateUuid = templateData.id;
    }
  }


  // 6. Prepare contract data for insertion
  const contractData = {
    creator_id: userId,
    title: formData.title || "Untitled Contract",
    description: formData.description,
    // Placeholder for content - needs refinement based on template logic
    content: {
      title: formData.title,
      description: formData.description,
      clientEmail: formData.clientEmail,
      price: formData.price,
      currency: formData.currency,
      paymentType: formData.paymentType,
      template: formData.template,
    },
    status: 'draft', // Initial status
    total_amount: parseFloat(formData.price) || 0, // Ensure it's a number
    currency: formData.currency || 'USD',
    template_id: templateUuid, // Use the fetched UUID or null
    client_email: formData.clientEmail, // Store client email in the proper column
  };

  // 7. Insert the contract
  const { data: newContract, error: insertError } = await supabase
    .from('contracts')
    .insert(contractData)
    .select('id') // Select the ID of the newly created contract
    .single();

  if (insertError) {
    console.error("Create Contract Error: Failed to insert contract.", insertError);
    return { error: "Failed to create the contract in the database. Please try again." };
  }

  if (!newContract) {
      console.error("Create Contract Error: Insert operation did not return the new contract.");
      return { error: "Failed to get confirmation of contract creation." };
  }

  // 7.5 Insert creator into contract_parties
  const { error: partyInsertError } = await supabase
    .from('contract_parties')
    .insert({
      contract_id: newContract.id,
      user_id: userId,
      role: 'creator',
      status: 'signed', // Creator is implicitly signed upon creation
      signature_date: new Date().toISOString(), // Record signing time
    });

  if (partyInsertError) {
      // Log the error, but don't fail the whole operation.
      // The contract exists, but the party link failed. Consider cleanup or notification.
      console.error(`Create Contract Warning: Failed to insert creator party record for contract ${newContract.id}.`, partyInsertError);
      // Optionally return a specific error or warning to the user
      // return { error: "Contract created, but failed to link creator party. Please contact support." };
  }

  // 8. Revalidate paths
  revalidatePath('/dashboard/contracts');
  revalidatePath(`/dashboard/contracts/${newContract.id}`); // Revalidate detail page too
  revalidatePath('/dashboard'); // Revalidate dashboard for stats update

  // 9. Return success
  return { success: true, contractId: newContract.id };
};

// Action to update contract content
export const updateContractContentAction = async (formData: {
  contractId: string;
  newContent: any; // Tiptap JSON content
}) => {
  const supabase = await createClient();

  // 1. Get current user
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user) {
    console.error("Update Contract Error: User not found.", getUserError);
    return { error: "Authentication required." };
  }
  const userId = user.id;

  // 2. Validate input
  if (!formData.contractId || !formData.newContent) {
    return { error: "Contract ID and content are required." };
  }

  // 3. Fetch the contract to verify ownership and status
  const { data: contract, error: fetchError } = await supabase
    .from('contracts')
    .select('creator_id, status')
    .eq('id', formData.contractId)
    .single(); // Expecting exactly one contract

  if (fetchError || !contract) {
    console.error(`Update Contract Error: Failed to fetch contract ${formData.contractId}.`, fetchError);
    return { error: "Contract not found or access denied." };
  }

  // 4. Check ownership
  if (contract.creator_id !== userId) {
    console.error(`Update Contract Error: User ${userId} does not own contract ${formData.contractId}.`);
    return { error: "You do not have permission to edit this contract." };
  }

  // 5. Check status (only allow editing drafts)
  if (contract.status !== 'draft') {
    console.warn(`Update Contract Error: Contract ${formData.contractId} is not in draft status (${contract.status}).`);
    return { error: `Cannot edit contract because its status is "${contract.status}".` };
  }

  // 6. Update the contract content
  const { error: updateError } = await supabase
    .from('contracts')
    .update({
      content: formData.newContent,
      updated_at: new Date().toISOString(), // Update timestamp
    })
    .eq('id', formData.contractId);

  if (updateError) {
    console.error(`Update Contract Error: Failed to update content for contract ${formData.contractId}.`, updateError);
    return { error: "Failed to save changes to the database." };
  }

  // 7. Revalidate relevant paths
  revalidatePath(`/dashboard/contracts/${formData.contractId}`);
  revalidatePath(`/dashboard/contracts/${formData.contractId}/edit`); // Revalidate edit page too

  // 8. Return success
  return { success: true };
};

// Action to send a contract
export const sendContractAction = async (formData: { contractId: string; recipientEmail?: string }) => {
  
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user) {
    console.error("Send Contract Error: User not found.", getUserError);
    return { error: "Authentication required" };
  }


  try {
    // Get contract details and verify ownership/permissions
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id, title, status, creator_id, client_id, freelancer_id, client_email')
      .eq('id', formData.contractId)
      .single();

    
    if (contractError || !contract) {
      console.error("Contract lookup failed:", contractError);
      return { error: "Contract not found" };
    }


    // Verify user can send this contract (creator or client)
    if (contract.creator_id !== user.id && contract.client_id !== user.id) {
      return { error: "You don't have permission to send this contract" };
    }

    // Check if contract is in a sendable state
    if (!['draft', 'pending_signatures'].includes(contract.status)) {
      return { error: "Contract cannot be sent in its current status" };
    }

    // Determine recipient email - use provided email or contract's client email
    const recipientEmail = formData.recipientEmail || contract.client_email;
    
    if (!recipientEmail) {
      return { error: "No recipient email found. Please specify client email in contract." };
    }

    // Get sender information from the creator's profile
    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', contract.creator_id)
      .single();

    const senderName = creatorProfile?.display_name || user.email?.split('@')[0] || 'Someone';
    
    // Import email functions
    const { sendEmail, getContractInvitationEmail } = await import('@/lib/utils/send-email');
    
    // Generate the email options
    const emailOptions = getContractInvitationEmail(
      contract.id,
      contract.title,
      senderName,
      recipientEmail
    );
    
    // Send the email
    const emailSent = await sendEmail(emailOptions);
    
    if (emailSent) {
      // Update contract status if it was draft
      if (contract.status === 'draft') {
        
        // Try multiple approaches to update the status
        let updateError = null;
        
        // Approach 1: Try direct update
        try {
          const { error } = await supabase
            .from('contracts')
            .update({ 
              status: 'pending_signatures',
              client_email: recipientEmail,
              updated_at: new Date().toISOString()
            })
            .eq('id', contract.id);
          updateError = error;
        } catch (err) {
          updateError = err;
        }
        
        // Approach 2: If that fails, try RPC function
        if (updateError) {
          try {
            const { data, error } = await supabase
              .rpc('update_contract_status_simple', {
                p_contract_id: contract.id,
                p_new_status: 'pending_signatures'
              });
            
            if (error) {
              updateError = error;
            } else if (data && !data.success) {
              updateError = new Error(data.error);
            } else {
              updateError = null; // Success!
            }
          } catch (err) {
            updateError = err;
          }
        }
          
        if (updateError) {
          console.error('Failed to update contract status:', updateError);
        }
      }

      // Log contract activity
      await supabase.from("contract_activities").insert({
        contract_id: contract.id,
        user_id: user.id,
        activity_type: "contract_sent",
        description: `Contract sent to ${recipientEmail}`,
        metadata: { recipient_email: recipientEmail }
      });

      revalidatePath('/dashboard/contracts');
      revalidatePath(`/dashboard/contracts/${contract.id}`);
      return { success: true, message: "Contract sent successfully!" };
    } else {
      return { error: "Failed to send email. Please try again." };
    }
  } catch (error) {
    console.error('Error sending contract:', error);
    return { error: 'An unexpected error occurred while sending the contract' };
  }
};

export const deleteContractAction = async (formData: { contractId: string }) => {
  const supabase = await createClient();

  // 1. Get current user
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user) {
    console.error("Delete Contract Error: User not found.", getUserError);
    return { error: "Authentication required." };
  }
  const userId = user.id;

  // 2. Validate input
  if (!formData.contractId) {
    return { error: "Contract ID is required." };
  }

  // 3. Fetch the contract to verify ownership
  // We only need creator_id for the check
  const { data: contract, error: fetchError } = await supabase
    .from('contracts')
    .select('creator_id')
    .eq('id', formData.contractId)
    .single();

  if (fetchError || !contract) {
    console.error(`Delete Contract Error: Failed to fetch contract ${formData.contractId}.`, fetchError);
    // Don't reveal if contract exists but user doesn't own it
    return { error: "Contract not found or you do not have permission to delete it." };
  }

  // 4. Check ownership
  if (contract.creator_id !== userId) {
    console.error(`Delete Contract Error: User ${userId} attempted to delete contract ${formData.contractId} owned by ${contract.creator_id}.`);
    return { error: "You do not have permission to delete this contract." };
  }

  // 5. Delete associated contract_parties first (important for foreign key constraints)
  const { error: deletePartiesError } = await supabase
    .from('contract_parties')
    .delete()
    .eq('contract_id', formData.contractId);

  if (deletePartiesError) {
      console.error(`Delete Contract Error: Failed to delete parties for contract ${formData.contractId}.`, deletePartiesError);
      // Decide if we should proceed or stop. Let's stop to be safe.
      return { error: "Failed to delete associated contract parties. Contract not deleted." };
  }

  // 6. Delete the contract itself
  const { error: deleteContractError } = await supabase
    .from('contracts')
    .delete()
    .eq('id', formData.contractId);

  if (deleteContractError) {
      console.error(`Delete Contract Error: Failed to delete contract ${formData.contractId}.`, deleteContractError);
      return { error: "Failed to delete the contract from the database." };
  }

  // 7. Revalidate relevant paths
  revalidatePath('/dashboard/contracts');
  revalidatePath('/dashboard'); // For stats potentially

  // 8. Return success
  return { success: true };
};
