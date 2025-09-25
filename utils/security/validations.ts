import { createClient } from "@/utils/supabase/server";
import { Database } from "@/types/supabase";

type Contract = Database["public"]["Tables"]["contracts"]["Row"];
type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type KycVerification = Database["public"]["Tables"]["kyc_verifications"]["Row"];
type Payment = Database["public"]["Tables"]["payments"]["Row"];

export class SecurityValidationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 403
  ) {
    super(message);
    this.name = "SecurityValidationError";
  }
}

export class SecurityValidator {
  private supabase: any;
  private userId: string;

  constructor(supabase: any, userId: string) {
    this.supabase = supabase;
    this.userId = userId;
  }

  /**
   * Validate that user has access to a contract
   */
  async validateContractAccess(contractId: string, requiredRole?: "creator" | "client" | "freelancer"): Promise<Contract> {
    const { data: contract, error } = await this.supabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (error || !contract) {
      throw new SecurityValidationError("Contract not found", "CONTRACT_NOT_FOUND", 404);
    }

    const hasAccess = 
      contract.creator_id === this.userId ||
      contract.client_id === this.userId ||
      contract.freelancer_id === this.userId;

    if (!hasAccess) {
      throw new SecurityValidationError("Access denied to contract", "CONTRACT_ACCESS_DENIED");
    }

    // Check specific role if required
    if (requiredRole) {
      let hasRole = false;
      switch (requiredRole) {
        case "creator":
          hasRole = contract.creator_id === this.userId;
          break;
        case "client":
          hasRole = contract.client_id === this.userId;
          break;
        case "freelancer":
          hasRole = contract.freelancer_id === this.userId;
          break;
      }

      if (!hasRole) {
        throw new SecurityValidationError(
          `User must be the contract ${requiredRole}`,
          `INVALID_ROLE_${requiredRole.toUpperCase()}`
        );
      }
    }

    return contract;
  }

  /**
   * Validate contract status transitions
   */
  validateContractStatusTransition(currentStatus: string, newStatus: string): void {
    const validTransitions: Record<string, string[]> = {
      "draft": ["pending_signatures", "cancelled"],
      "pending_signatures": ["pending_funding", "draft", "cancelled"],
      "pending_funding": ["active", "cancelled"],
      "active": ["pending_delivery", "cancelled", "disputed"],
      "pending_delivery": ["in_review", "active", "disputed"],
      "in_review": ["revision_requested", "pending_completion", "disputed"],
      "revision_requested": ["active", "disputed"],
      "pending_completion": ["completed", "disputed"],
      "completed": [], // Final state
      "cancelled": [], // Final state
      "disputed": ["active", "cancelled"] // Can be resolved
    };

    const allowedTransitions = validTransitions[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new SecurityValidationError(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
        "INVALID_STATUS_TRANSITION",
        400
      );
    }
  }

  /**
   * Validate milestone access and permissions
   */
  async validateMilestoneAccess(milestoneId: string, contractId: string): Promise<Milestone> {
    const { data: milestone, error } = await this.supabase
      .from("milestones")
      .select("*")
      .eq("id", milestoneId)
      .eq("contract_id", contractId)
      .single();

    if (error || !milestone) {
      throw new SecurityValidationError("Milestone not found", "MILESTONE_NOT_FOUND", 404);
    }

    // Validate contract access
    await this.validateContractAccess(contractId);

    return milestone;
  }

  /**
   * Validate milestone status transitions
   */
  validateMilestoneStatusTransition(currentStatus: string, newStatus: string): void {
    const validTransitions: Record<string, string[]> = {
      "pending": ["in_progress"],
      "in_progress": ["submitted"],
      "submitted": ["approved", "revision_requested"],
      "revision_requested": ["in_progress"],
      "approved": ["completed"],
      "completed": [] // Final state
    };

    const allowedTransitions = validTransitions[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new SecurityValidationError(
        `Invalid milestone status transition from ${currentStatus} to ${newStatus}`,
        "INVALID_MILESTONE_TRANSITION",
        400
      );
    }
  }

  /**
   * Validate payment access
   */
  async validatePaymentAccess(paymentId: string): Promise<Payment> {
    const { data: payment, error } = await this.supabase
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .single();

    if (error || !payment) {
      throw new SecurityValidationError("Payment not found", "PAYMENT_NOT_FOUND", 404);
    }

    const hasAccess = 
      payment.payer_id === this.userId ||
      payment.payee_id === this.userId;

    if (!hasAccess) {
      // Also check if user has access to the contract
      await this.validateContractAccess(payment.contract_id);
    }

    return payment;
  }

  /**
   * Validate KYC requirements for contract amount
   */
  async validateKycRequirements(contractAmount: number, currency: string = "USD"): Promise<void> {
    const { data: profile } = await this.supabase
      .from("profiles")
      .select("kyc_status, verification_level")
      .eq("id", this.userId)
      .single();

    if (!profile) {
      throw new SecurityValidationError("User profile not found", "PROFILE_NOT_FOUND", 404);
    }

    // Determine required verification level
    const requiredLevel = this.getRequiredVerificationLevel(contractAmount, currency);
    
    if (profile.kyc_status !== "approved") {
      throw new SecurityValidationError(
        "KYC verification required",
        "KYC_NOT_APPROVED",
        403
      );
    }

    const currentLevelNum = this.getVerificationLevelNumber(profile.verification_level);
    const requiredLevelNum = this.getVerificationLevelNumber(requiredLevel);

    if (currentLevelNum < requiredLevelNum) {
      throw new SecurityValidationError(
        `${requiredLevel} verification required for this amount`,
        "INSUFFICIENT_KYC_LEVEL",
        403
      );
    }
  }

  /**
   * Validate rate limiting for sensitive operations
   */
  async validateRateLimit(operation: string, limit: number, windowMinutes: number = 60): Promise<void> {
    const windowStart = new Date();
    windowStart.setMinutes(windowStart.getMinutes() - windowMinutes);

    const { data: recentActivities } = await this.supabase
      .from("contract_activities")
      .select("id")
      .eq("user_id", this.userId)
      .eq("activity_type", operation)
      .gte("created_at", windowStart.toISOString());

    if (recentActivities && recentActivities.length >= limit) {
      throw new SecurityValidationError(
        `Rate limit exceeded for ${operation}`,
        "RATE_LIMIT_EXCEEDED",
        429
      );
    }
  }

  /**
   * Validate monetary amount
   */
  validateAmount(amount: number, minAmount: number = 1, maxAmount: number = 1000000): void {
    if (isNaN(amount) || amount < minAmount) {
      throw new SecurityValidationError(
        `Amount must be at least ${minAmount}`,
        "INVALID_AMOUNT_TOO_LOW",
        400
      );
    }

    if (amount > maxAmount) {
      throw new SecurityValidationError(
        `Amount cannot exceed ${maxAmount}`,
        "INVALID_AMOUNT_TOO_HIGH",
        400
      );
    }
  }

  /**
   * Validate file upload
   */
  validateFileUpload(fileUrl: string, allowedTypes: string[] = [], maxSizeBytes?: number): void {
    if (!fileUrl || !fileUrl.startsWith("https://")) {
      throw new SecurityValidationError(
        "Invalid file URL",
        "INVALID_FILE_URL",
        400
      );
    }

    // Extract file extension
    const extension = fileUrl.split('.').pop()?.toLowerCase();
    if (allowedTypes.length > 0 && extension && !allowedTypes.includes(extension)) {
      throw new SecurityValidationError(
        `File type .${extension} not allowed`,
        "INVALID_FILE_TYPE",
        400
      );
    }
  }

  /**
   * Validate email format
   */
  validateEmail(email: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new SecurityValidationError(
        "Invalid email format",
        "INVALID_EMAIL_FORMAT",
        400
      );
    }
  }

  /**
   * Validate text input for XSS and injection attacks
   */
  validateTextInput(text: string, maxLength: number = 10000): string {
    if (!text || typeof text !== "string") {
      throw new SecurityValidationError(
        "Invalid text input",
        "INVALID_TEXT_INPUT",
        400
      );
    }

    if (text.length > maxLength) {
      throw new SecurityValidationError(
        `Text exceeds maximum length of ${maxLength}`,
        "TEXT_TOO_LONG",
        400
      );
    }

    // Basic XSS prevention - strip HTML tags
    const cleanText = text.replace(/<[^>]*>/g, "");
    
    // Check for potential SQL injection patterns
    const sqlInjectionPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b)/i,
      /(--|\/\*|\*\/)/,
      /(\bOR\b.*=.*\bOR\b)/i,
      /(\bUNION\b.*\bSELECT\b)/i
    ];

    for (const pattern of sqlInjectionPatterns) {
      if (pattern.test(cleanText)) {
        throw new SecurityValidationError(
          "Text contains potentially malicious content",
          "MALICIOUS_CONTENT_DETECTED",
          400
        );
      }
    }

    return cleanText;
  }

  /**
   * Validate subscription limits
   */
  async validateSubscriptionLimits(action: string): Promise<void> {
    const { data: profile } = await this.supabase
      .from("profiles")
      .select("subscription_tier, available_contracts")
      .eq("id", this.userId)
      .single();

    if (!profile) {
      throw new SecurityValidationError("Profile not found", "PROFILE_NOT_FOUND", 404);
    }

    if (action === "create_contract") {
      // Get current active contract count for this user
      const { data: activeCountResult, error: countError } = await this.supabase
        .rpc('get_active_contract_count', { p_user_id: this.userId });
        
      if (countError) {
        throw new SecurityValidationError(
          "Error checking contract limits",
          "LIMIT_CHECK_FAILED",
          500
        );
      }
      
      const activeContractCount = activeCountResult || 0;
      const contractLimit = profile.available_contracts || 3;
      
      // Check if user has reached their contract limit
      if (activeContractCount >= contractLimit) {
        const planName = profile.subscription_tier === 'free' ? 'Free' : 
                        profile.subscription_tier === 'professional' ? 'Professional' : 
                        profile.subscription_tier === 'business' ? 'Business' : 'Unknown';
                        
        throw new SecurityValidationError(
          `Contract limit reached. You have ${activeContractCount}/${contractLimit} active contracts on the ${planName} plan.`,
          "SUBSCRIPTION_LIMIT_REACHED",
          403
        );
      }
    }
  }

  // Private helper methods
  private getRequiredVerificationLevel(amount: number, currency: string): string {
    // Convert to USD for standardized comparison
    const usdAmount = currency === "USD" ? amount : amount; // In real implementation, would convert currencies
    
    if (usdAmount <= 500) return "basic";
    if (usdAmount <= 5000) return "enhanced";
    return "business";
  }

  private getVerificationLevelNumber(level: string | null): number {
    const levels: Record<string, number> = {
      "basic": 1,
      "enhanced": 2,
      "business": 3
    };
    return levels[level || ""] || 0;
  }
}

/**
 * Create a security validator instance for the current user
 */
export async function createSecurityValidator(): Promise<SecurityValidator> {
  const supabase = await createClient();
  
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new SecurityValidationError("Authentication required", "UNAUTHORIZED", 401);
  }

  return new SecurityValidator(supabase, user.id);
}

/**
 * Middleware wrapper to handle security validation errors
 */
export function withSecurityValidation<T extends any[], R>(
  handler: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof SecurityValidationError) {
        // Re-throw with proper HTTP status
        throw error;
      }
      // Log unexpected errors
      console.error("Unexpected security validation error:", error);
      throw new SecurityValidationError(
        "Internal security validation error",
        "INTERNAL_SECURITY_ERROR",
        500
      );
    }
  };
}