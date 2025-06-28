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
    .regex(/^[^<>:"|?*\\\/]+\.[a-zA-Z0-9]+$/, "Invalid filename format")
    .transform(str => str.replace(/[<>:"|?*\\\/]/g, ""));

const currency = () =>
  z.string()
    .length(3)
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Invalid currency code");

const phoneNumber = () =>
  z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format");

const futureDate = () =>
  z.string()
    .datetime()
    .refine(date => {
      const inputDate = new Date(date);
      const now = new Date();
      const maxFuture = new Date();
      maxFuture.setDate(now.getDate() + SECURITY_CONFIG.INPUT_LIMITS.maxFutureDays);
      return inputDate > now && inputDate <= maxFuture;
    }, "Date must be in the future and within acceptable range");

const pastOrPresentDate = () =>
  z.string()
    .datetime()
    .refine(date => {
      const inputDate = new Date(date);
      const now = new Date();
      const minPast = new Date();
      minPast.setDate(now.getDate() - SECURITY_CONFIG.INPUT_LIMITS.maxPastDays);
      return inputDate >= minPast && inputDate <= now;
    }, "Date must be within acceptable range");

// Contract schemas
export const ContractCreateSchema = z.object({
  title: sanitizedStringWithMin(255, 1),
  description: sanitizedString(SECURITY_CONFIG.INPUT_LIMITS.description).optional(),
  client_id: uuid().optional(),
  freelancer_id: uuid().optional(),
  client_email: email().optional(),
  freelancer_email: email().optional(),
  total_amount: positiveNumber(SECURITY_CONFIG.INPUT_LIMITS.minAmount, SECURITY_CONFIG.INPUT_LIMITS.maxContractAmount).optional(),
  currency: currency().default("USD"),
  type: z.enum(["fixed", "milestone", "hourly"]).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  terms_and_conditions: sanitizedString(SECURITY_CONFIG.INPUT_LIMITS.longText).optional(),
  template_id: uuid().optional(),
  content: z.any().optional(), // JSON content
  milestones: z.array(z.object({
    title: sanitizedStringWithMin(255, 1),
    description: sanitizedString(SECURITY_CONFIG.INPUT_LIMITS.mediumText).optional(),
    amount: positiveNumber(),
    due_date: z.string().optional(),
    deliverables: z.array(sanitizedString(500)).max(20).default([])
  })).max(50).default([])
});

export const ContractUpdateSchema = z.object({
  title: sanitizedString(255).optional(),
  description: sanitizedString(SECURITY_CONFIG.INPUT_LIMITS.description).optional(),
  client_id: uuid().optional(),
  freelancer_id: uuid().optional(),
  client_email: email().optional(),
  freelancer_email: email().optional(),
  total_amount: positiveNumber(SECURITY_CONFIG.INPUT_LIMITS.minAmount, SECURITY_CONFIG.INPUT_LIMITS.maxContractAmount).optional(),
  currency: currency().optional(),
  start_date: futureDate().optional(),
  end_date: futureDate().optional(),
  terms_and_conditions: sanitizedString(SECURITY_CONFIG.INPUT_LIMITS.longText).optional(),
  status: z.enum([
    "draft", "pending_signatures", "pending_funding", "active",
    "pending_delivery", "in_review", "revision_requested", 
    "pending_completion", "completed", "cancelled", "disputed"
  ]).optional()
});

// Milestone schemas
export const MilestoneCreateSchema = z.object({
  title: sanitizedStringWithMin(255, 1),
  description: sanitizedString(SECURITY_CONFIG.INPUT_LIMITS.mediumText).optional(),
  amount: positiveNumber(),
  due_date: futureDate().optional(),
  deliverables: z.array(sanitizedString(500)).max(20).default([])
});

export const MilestoneUpdateSchema = z.object({
  title: sanitizedString(255).optional(),
  description: sanitizedString(SECURITY_CONFIG.INPUT_LIMITS.mediumText).optional(),
  amount: positiveNumber().optional(),
  due_date: futureDate().optional(),
  deliverables: z.array(sanitizedString(500)).max(20).optional(),
  status: z.enum([
    "pending", "in_progress", "submitted", 
    "approved", "revision_requested", "completed"
  ]).optional()
});

// Signature schemas
export const SignatureCreateSchema = z.object({
  signature_data: sanitizedStringWithMin(10000, 1)
});

// Payment schemas
export const PaymentCreateSchema = z.object({
  payment_method_id: sanitizedString(255).optional(),
  return_url: url().optional()
});

export const PaymentConfirmSchema = z.object({
  payment_intent_id: sanitizedStringWithMin(255, 1),
  payment_method_id: sanitizedString(255).optional()
});

export const PaymentReleaseSchema = z.object({
  milestone_id: uuid().optional(),
  release_amount: positiveNumber().optional()
});

// Submission schemas
export const SubmissionCreateSchema = z.object({
  submission_url: url().optional(),
  notes: sanitizedString(SECURITY_CONFIG.INPUT_LIMITS.mediumText).optional(),
  deliverables: z.array(sanitizedString(500)).max(20).default([]),
  milestone_id: uuid().optional()
});

// Review schemas
export const ReviewCreateSchema = z.object({
  action: z.enum(["approve", "request_revision"]),
  submission_id: uuid().optional(),
  feedback: sanitizedString(SECURITY_CONFIG.INPUT_LIMITS.mediumText).optional(),
  milestone_id: uuid().optional(),
  revision_notes: sanitizedString(SECURITY_CONFIG.INPUT_LIMITS.mediumText).optional()
}).refine(data => {
  if (data.action === "request_revision") {
    return !!data.revision_notes && data.revision_notes.length > 0;
  }
  return true;
}, {
  message: "Revision notes are required when requesting revisions"
});

// KYC schemas
export const KycCreateSchema = z.object({
  verification_level: z.enum(["basic", "enhanced", "business"]).default("basic"),
  documents: z.array(z.object({
    type: z.enum([
      "email_verification", "phone_verification", "government_id", 
      "address_proof", "selfie_verification", "business_registration", 
      "tax_id", "business_bank_account", "beneficial_ownership"
    ]),
    filename: filename(),
    file_url: url()
  })).max(10).default([])
});

export const KycDocumentSubmissionSchema = z.object({
  documents: z.array(z.object({
    type: z.enum([
      "email_verification", "phone_verification", "government_id", 
      "address_proof", "selfie_verification", "business_registration", 
      "tax_id", "business_bank_account", "beneficial_ownership"
    ]),
    filename: filename(),
    file_url: url()
  })).min(1).max(10),
  document_type: z.string().optional()
});

export const KycVerificationUpdateSchema = z.object({
  status: z.enum(["approved", "rejected", "requires_action"]),
  rejection_reason: sanitizedString(SECURITY_CONFIG.INPUT_LIMITS.mediumText).optional()
}).refine(data => {
  if (data.status === "rejected") {
    return !!data.rejection_reason && data.rejection_reason.length > 0;
  }
  return true;
}, {
  message: "Rejection reason is required when rejecting KYC"
});

export const KycRequirementsCheckSchema = z.object({
  contract_amount: positiveNumber(SECURITY_CONFIG.INPUT_LIMITS.minAmount, SECURITY_CONFIG.INPUT_LIMITS.maxContractAmount),
  currency: currency().default("USD"),
  contract_id: uuid().optional()
});

// Activity schemas
export const ActivityCreateSchema = z.object({
  activity_type: z.enum([
    "contract_created", "contract_updated", "contract_signed", "funding_initiated", 
    "funding_completed", "milestone_activated", "milestone_submitted", "milestone_approved",
    "delivery_submitted", "review_completed", "revision_requested", "payment_released",
    "contract_completed", "contract_cancelled", "dispute_raised", "comment_added",
    "file_uploaded", "deadline_extended", "status_changed"
  ]),
  description: sanitizedStringWithMin(SECURITY_CONFIG.INPUT_LIMITS.mediumText, 1),
  metadata: z.record(z.any()).optional()
});

// Feedback schemas
export const FeedbackCreateSchema = z.object({
  comment: sanitizedString(SECURITY_CONFIG.INPUT_LIMITS.mediumText).optional(),
  rating: z.number().int().min(1).max(5).optional()
});

// User profile schemas
export const ProfileUpdateSchema = z.object({
  display_name: sanitizedString(100).optional(),
  bio: sanitizedString(SECURITY_CONFIG.INPUT_LIMITS.mediumText).optional(),
  company_name: sanitizedString(255).optional(),
  website: url().optional(),
  user_type: z.enum(["freelancer", "client", "both"]).optional()
});

// Stripe onboarding schema
export const StripeOnboardingSchema = z.object({
  country: z.string().length(2).toUpperCase().default("US"),
  business_type: z.enum(["individual", "company"]).default("individual")
});

// Query parameter schemas
export const PaginationSchema = z.object({
  limit: z.string().default("10").transform(val => parseInt(val, 10)).pipe(z.number().int().min(1).max(100)),
  offset: z.string().default("0").transform(val => parseInt(val, 10)).pipe(z.number().int().min(0))
});

export const ContractQuerySchema = PaginationSchema.extend({
  status: z.enum([
    "draft", "pending_signatures", "pending_funding", "active",
    "pending_delivery", "in_review", "revision_requested", 
    "pending_completion", "completed", "cancelled", "disputed"
  ]).optional(),
  type: z.enum(["fixed", "milestone", "hourly"]).optional()
});

export const ActivityQuerySchema = PaginationSchema.extend({
  type: z.string().optional()
});

// File upload schema
export const FileUploadSchema = z.object({
  filename: filename(),
  file_url: url(),
  file_size: z.number().int().positive().max(SECURITY_CONFIG.INPUT_LIMITS.maxFileSize),
  file_type: z.string().max(50),
  category: z.enum(["documents", "images", "kyc", "submissions"])
}).refine(data => {
  const allowedTypes = SECURITY_CONFIG.ALLOWED_FILE_TYPES[data.category];
  const extension = data.filename.split('.').pop()?.toLowerCase();
  return extension && (allowedTypes as readonly string[]).includes(extension);
}, {
  message: "File type not allowed for this category"
});

// Validation helper functions
export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: string[] } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      return { success: false, errors };
    }
    return { success: false, errors: ["Validation failed"] };
  }
}

export function validateAndSanitize<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = validateSchema(schema, data);
  if (!result.success) {
    throw new Error(`Validation failed: ${result.errors.join(', ')}`);
  }
  return result.data;
}

// Type exports
export type ContractCreate = z.infer<typeof ContractCreateSchema>;
export type ContractUpdate = z.infer<typeof ContractUpdateSchema>;
export type MilestoneCreate = z.infer<typeof MilestoneCreateSchema>;
export type MilestoneUpdate = z.infer<typeof MilestoneUpdateSchema>;
export type SubmissionCreate = z.infer<typeof SubmissionCreateSchema>;
export type ReviewCreate = z.infer<typeof ReviewCreateSchema>;
export type KycCreate = z.infer<typeof KycCreateSchema>;
export type KycDocumentSubmission = z.infer<typeof KycDocumentSubmissionSchema>;
export type ActivityCreate = z.infer<typeof ActivityCreateSchema>;
export type FileUpload = z.infer<typeof FileUploadSchema>;