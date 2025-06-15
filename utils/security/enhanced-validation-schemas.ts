import { z } from "zod";
import { SECURITY_CONFIG } from "./config";

// Custom validators
const sanitizedString = (maxLength: number = SECURITY_CONFIG.INPUT_LIMITS.shortText) =>
  z.string()
    .trim()
    .max(maxLength)
    .regex(/^[^<>]*$/, "Invalid characters detected")
    .transform(str => str.replace(/[<>]/g, "")); // Remove any remaining angle brackets

const sanitizedStringWithMin = (maxLength: number = SECURITY_CONFIG.INPUT_LIMITS.shortText, minLength: number = 0) =>
  z.string()
    .trim()
    .min(minLength)
    .max(maxLength)
    .regex(/^[^<>]*$/, "Invalid characters detected")
    .transform(str => str.replace(/[<>]/g, "")); // Remove any remaining angle brackets

const positiveNumber = (min: number = SECURITY_CONFIG.INPUT_LIMITS.minAmount, max: number = SECURITY_CONFIG.INPUT_LIMITS.maxAmount) =>
  z.number()
    .positive()
    .min(min)
    .max(max)
    .finite();

const uuid = () => 
  z.string().uuid("Invalid UUID format");

const email = () =>
  z.string()
    .email()
    .toLowerCase()
    .max(254); // RFC 5321 limit

const url = () =>
  z.string()
    .url()
    .refine(url => {
      try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    }, "Only HTTP/HTTPS URLs are allowed");

const filename = () =>
  z.string()
    .max(255)
    .regex(/^[^<>:"/\\|?*]+$/, "Invalid filename characters");

const mimeType = () =>
  z.string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*$/, "Invalid MIME type");

// Enhanced Contract Schemas
export const MilestoneCreateSchema = z.object({
  title: sanitizedStringWithMin(255, 1),
  description: sanitizedString(2000).optional(),
  amount: positiveNumber(),
  due_date: z.string().datetime().optional(),
  order_index: z.number().int().positive(),
  deliverables: z.array(z.string().max(500)).optional(),
});

export const MilestoneUpdateSchema = z.object({
  title: sanitizedStringWithMin(255, 1).optional(),
  description: sanitizedString(2000).optional(),
  amount: positiveNumber().optional(),
  due_date: z.string().datetime().optional(),
  status: z.enum(['pending', 'in_progress', 'submitted', 'approved', 'revision_requested', 'completed']).optional(),
  deliverables: z.array(z.string().max(500)).optional(),
});

export const EnhancedContractCreateSchema = z.object({
  title: sanitizedStringWithMin(255, 1),
  description: sanitizedString(5000),
  client_id: uuid().optional(),
  freelancer_id: uuid().optional(),
  client_email: email().optional(),
  total_amount: positiveNumber(),
  currency: z.string().length(3).default('USD'),
  type: z.enum(['fixed', 'milestone', 'hourly']).default('fixed'),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  terms_and_conditions: sanitizedString(10000).optional(),
  template_id: uuid().optional(),
  content: z.any().optional(),
  milestones: z.array(MilestoneCreateSchema).optional(),
}).refine(data => {
  // If type is milestone, milestones must be provided
  if (data.type === 'milestone') {
    return data.milestones && data.milestones.length > 0;
  }
  return true;
}, {
  message: "Milestones are required for milestone-based contracts",
  path: ["milestones"]
}).refine(data => {
  // Either client_id or client_email must be provided
  return data.client_id || data.client_email;
}, {
  message: "Either client_id or client_email must be provided",
  path: ["client_id"]
});

export const EnhancedContractUpdateSchema = z.object({
  title: sanitizedStringWithMin(255, 1).optional(),
  description: sanitizedString(5000).optional(),
  client_id: uuid().optional(),
  freelancer_id: uuid().optional(),
  client_email: email().optional(),
  total_amount: positiveNumber().optional(),
  currency: z.string().length(3).optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  terms_and_conditions: sanitizedString(10000).optional(),
  status: z.enum([
    'draft', 'pending_signatures', 'pending_funding', 'active',
    'pending_delivery', 'in_review', 'revision_requested', 
    'pending_completion', 'completed', 'cancelled', 'disputed'
  ]).optional(),
  content: z.any().optional(),
});

// Contract Signature Schema
export const ContractSignatureSchema = z.object({
  contract_id: uuid(),
  signature_data: z.string().max(10000).optional(),
  user_role: z.enum(['client', 'freelancer', 'creator']),
});

// Escrow Payment Schemas
export const EscrowFundingSchema = z.object({
  contract_id: uuid(),
  milestone_id: uuid().optional(),
  amount: positiveNumber(),
  payment_method_id: z.string().max(255).optional(),
});

export const EscrowReleaseSchema = z.object({
  escrow_payment_id: uuid(),
  release_amount: positiveNumber().optional(), // For partial releases
  reason: sanitizedString(1000).optional(),
});

// KYC Verification Schemas
export const KycVerificationSchema = z.object({
  verification_level: z.enum(['basic', 'enhanced', 'business']),
  documents: z.array(z.object({
    document_type: z.enum(['passport', 'drivers_license', 'national_id', 'utility_bill', 'bank_statement', 'business_registration']),
    file_url: url(),
    file_name: filename(),
    file_size: z.number().positive().max(10 * 1024 * 1024), // 10MB max
  })).optional(),
  personal_info: z.object({
    first_name: sanitizedStringWithMin(100, 1).optional(),
    last_name: sanitizedStringWithMin(100, 1).optional(),
    date_of_birth: z.string().date().optional(),
    address: z.object({
      street: sanitizedStringWithMin(255, 1).optional(),
      city: sanitizedStringWithMin(100, 1).optional(),
      state: sanitizedStringWithMin(100, 1).optional(),
      postal_code: sanitizedStringWithMin(20, 1).optional(),
      country: z.string().length(2).optional(), // ISO country code
    }).optional(),
  }).optional(),
  business_info: z.object({
    business_name: sanitizedStringWithMin(255, 1).optional(),
    business_type: z.enum(['sole_proprietorship', 'partnership', 'corporation', 'llc']).optional(),
    tax_id: sanitizedStringWithMin(50, 1).optional(),
    registration_number: sanitizedStringWithMin(100, 1).optional(),
  }).optional(),
});

// File Upload Schema
export const FileUploadSchema = z.object({
  contract_id: uuid(),
  milestone_id: uuid().optional(),
  file_name: filename(),
  file_size: z.number().positive().max(100 * 1024 * 1024), // 100MB max
  file_type: mimeType(),
  file_url: url(),
  description: sanitizedString(1000).optional(),
  is_final: z.boolean().default(false),
});

// Contract Review Schema
export const ContractReviewSchema = z.object({
  contract_id: uuid(),
  milestone_id: uuid().optional(),
  review_type: z.enum(['approval', 'revision', 'rejection']),
  rating: z.number().int().min(1).max(5).optional(),
  feedback: sanitizedString(2000).optional(),
  revision_notes: sanitizedString(2000).optional(),
});

// Dispute Schema
export const ContractDisputeSchema = z.object({
  contract_id: uuid(),
  dispute_type: z.enum(['payment', 'quality', 'timeline', 'scope', 'communication', 'other']),
  description: sanitizedStringWithMin(5000, 10),
  evidence_urls: z.array(url()).max(10).optional(),
});

// Notification Schema
export const NotificationCreateSchema = z.object({
  contract_id: uuid(),
  user_id: uuid(),
  notification_type: z.enum([
    'contract_created', 'contract_signed', 'payment_funded', 'milestone_submitted',
    'review_requested', 'payment_released', 'dispute_opened', 'deadline_reminder'
  ]),
  title: sanitizedStringWithMin(255, 1),
  message: sanitizedString(1000),
  action_url: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
});

// Validation function with enhanced error handling
export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: boolean;
  data?: T;
  errors?: z.ZodError['errors'];
} {
  try {
    const result = schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      return { success: false, errors: result.error.errors };
    }
  } catch (error) {
    return { 
      success: false, 
      errors: [{ 
        code: 'custom', 
        message: 'Validation error', 
        path: [] 
      }] 
    };
  }
}

// Enhanced validation with sanitization
export function validateAndSanitize<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.parse(data);
  return result;
}

// Stripe Onboarding Schema
export const StripeOnboardingSchema = z.object({
  country: z.string().length(2).toUpperCase().default("US"),
  business_type: z.enum(["individual", "company"]).default("individual")
});

// Type exports
export type MilestoneCreate = z.infer<typeof MilestoneCreateSchema>;
export type MilestoneUpdate = z.infer<typeof MilestoneUpdateSchema>;
export type EnhancedContractCreate = z.infer<typeof EnhancedContractCreateSchema>;
export type EnhancedContractUpdate = z.infer<typeof EnhancedContractUpdateSchema>;
export type ContractSignature = z.infer<typeof ContractSignatureSchema>;
export type EscrowFunding = z.infer<typeof EscrowFundingSchema>;
export type EscrowRelease = z.infer<typeof EscrowReleaseSchema>;
export type KycVerification = z.infer<typeof KycVerificationSchema>;
export type FileUpload = z.infer<typeof FileUploadSchema>;
export type ContractReview = z.infer<typeof ContractReviewSchema>;
export type ContractDispute = z.infer<typeof ContractDisputeSchema>;
export type NotificationCreate = z.infer<typeof NotificationCreateSchema>;
export type StripeOnboarding = z.infer<typeof StripeOnboardingSchema>;