import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import type { User } from "@supabase/supabase-js";

// Type for authenticated handler function
type AuthenticatedHandler<T extends any[] = []> = (
  request: NextRequest,
  user: User,
  ...args: T
) => Promise<NextResponse>;

/**
 * Higher-order function that wraps API route handlers with authentication
 * Eliminates duplicate auth code across all API routes
 */
export function withAuth<T extends any[]>(
  handler: AuthenticatedHandler<T>
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    try {
      const supabase = await createClient();
      
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json(
          { 
            success: false,
            error: "Unauthorized", 
            message: "Authentication required"
          }, 
          { status: 401 }
        );
      }

      // Call the original handler with the authenticated user
      return await handler(request, user, ...args);
    } catch (error) {
      console.error("Authentication middleware error:", error);
      return NextResponse.json(
        { 
          success: false,
          error: "Internal server error", 
          message: "Authentication failed"
        }, 
        { status: 500 }
      );
    }
  };
}

/**
 * Extended auth wrapper that also fetches user profile
 * For routes that need user profile information
 */
export function withAuthAndProfile<T extends any[]>(
  handler: (
    request: NextRequest,
    user: User,
    profile: any,
    ...args: T
  ) => Promise<NextResponse>
) {
  return withAuth(async (request: NextRequest, user: User, ...args: T) => {
    const supabase = await createClient();
    
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return NextResponse.json(
        { 
          success: false,
          error: "Profile not found", 
          message: "User profile could not be retrieved"
        }, 
        { status: 404 }
      );
    }

    return await handler(request, user, profile, ...args);
  });
}

/**
 * Auth wrapper with role-based access control
 * For routes that require specific user roles
 */
export function withAuthAndRole<T extends any[]>(
  allowedRoles: string[],
  handler: AuthenticatedHandler<T>
) {
  return withAuthAndProfile(async (request: NextRequest, user: User, profile: any, ...args: T) => {
    if (!allowedRoles.includes(profile.user_type)) {
      return NextResponse.json(
        { 
          success: false,
          error: "Forbidden", 
          message: "Insufficient permissions"
        }, 
        { status: 403 }
      );
    }

    return await handler(request, user, ...args);
  });
}

/**
 * Utility function to check if user owns a resource
 * Common pattern across many API routes
 */
export async function checkResourceOwnership(
  supabase: any,
  tableName: string,
  resourceId: string,
  userId: string,
  ownershipField: string = "creator_id"
): Promise<boolean> {
  const { data } = await supabase
    .from(tableName)
    .select(ownershipField)
    .eq("id", resourceId)
    .single();

  return data?.[ownershipField] === userId;
}

/**
 * Auth wrapper that checks resource ownership
 * For routes that modify user-owned resources
 */
export function withAuthAndOwnership<T extends any[]>(
  tableName: string,
  resourceIdParam: string = "id",
  ownershipField: string = "creator_id",
  handler: AuthenticatedHandler<T>
) {
  return withAuth(async (request: NextRequest, user: User, ...args: T) => {
    const url = new URL(request.url);
    const resourceId = url.pathname.split('/')[url.pathname.split('/').indexOf(resourceIdParam.replace('[', '').replace(']', '')) + 1];
    
    if (!resourceId) {
      return NextResponse.json(
        { 
          success: false,
          error: "Bad Request", 
          message: "Resource ID is required"
        }, 
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const hasAccess = await checkResourceOwnership(
      supabase, 
      tableName, 
      resourceId, 
      user.id, 
      ownershipField
    );

    if (!hasAccess) {
      return NextResponse.json(
        { 
          success: false,
          error: "Forbidden", 
          message: "You don't have permission to access this resource"
        }, 
        { status: 403 }
      );
    }

    return await handler(request, user, ...args);
  });
}