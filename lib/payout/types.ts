// Core types for the multi-rail payout system

export type Rail = 'stripe' | 'wise' | 'payoneer' | 'paypal' | 'local' | 'system' | 'contract_system';
export type Currency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY' | 'NGN' | 'INR' | 'PHP' | string;
export type PayoutMethod = 'bank' | 'wallet' | 'paypal' | 'mobile';

export type PayoutStatus = 
  | 'requested' 
  | 'queued' 
  | 'processing' 
  | 'paid' 
  | 'failed' 
  | 'returned' 
  | 'cancelled';

export interface WithdrawalMethod {
  id: string;
  user_id: string;
  rail: Rail;
  label: string;
  
  // Rail-specific identifiers
  stripe_external_account_id?: string;
  wise_recipient_id?: string;
  payoneer_payee_id?: string;
  paypal_receiver?: string;
  local_provider?: string;
  local_account_ref?: Record<string, any>;
  
  // Account details
  currency: Currency;
  country: string;
  account_name?: string;
  last_four?: string;
  provider_name?: string;
  icon?: string;
  
  // Processing info
  supports_instant: boolean;
  processing_time: string;
  fee_structure: {
    fixed?: number;
    percent?: number;
    fx_margin?: number;
  };
  
  // Status
  is_default: boolean;
  is_verified: boolean;
  is_active: boolean;
  
  created_at: string;
  updated_at: string;
}

export interface WalletBalance {
  user_id: string;
  currency: Currency;
  available: number; // in minor units (cents)
  pending: number;
  total_earned: number;
  total_withdrawn: number;
  created_at: string;
  updated_at: string;
}

export interface Payout {
  id: string;
  user_id: string;
  method_id: string;
  rail: Rail;
  
  // Amount details
  amount: number; // requested amount in minor units
  currency: Currency;
  fx_rate?: number;
  platform_fee: number;
  provider_fee: number;
  net_amount: number; // amount user receives after fees
  
  // Status
  status: PayoutStatus;
  failure_reason?: string;
  
  // Provider tracking
  provider_reference?: string;
  trace_id: string;
  
  // Timing
  requested_at: string;
  processing_started_at?: string;
  completed_at?: string;
  expected_arrival_date?: string;
  
  // Metadata
  description?: string;
  metadata: Record<string, any>;
  
  created_at: string;
  updated_at: string;
}

export interface RailSelectionInput {
  user_id: string;
  userKycOk: boolean;
  enhancedKycOk: boolean;
  targetCountry: string;
  currency: Currency;
  method: PayoutMethod;
  amount: number; // in minor units
  railsEnabled: Rail[];
  userPrefs?: Rail[];
  urgency?: 'standard' | 'fast' | 'instant';
}

export interface RailCapability {
  rail: Rail;
  supported: boolean;
  requires_enhanced_kyc: boolean;
  min_amount: number;
  max_amount?: number;
  daily_limit: number;
  monthly_limit: number;
  estimated_fee: number;
  processing_time_min: number; // minutes
  processing_time_max: number; // minutes
  supports_instant: boolean;
}

export interface PayoutQuote {
  rail: Rail;
  method_id: string;
  amount: number;
  currency: Currency;
  platform_fee: number;
  provider_fee: number;
  fx_rate?: number;
  net_amount: number;
  processing_time: string;
  estimated_arrival: string;
  supports_instant: boolean;
  instant_fee?: number;
}

export interface PayoutRequest {
  user_id: string;
  method_id: string;
  amount: number;
  currency: Currency;
  urgency?: 'standard' | 'fast' | 'instant';
  description?: string;
}

export interface RailHandler {
  rail: Rail;
  createPayout(payout: Payout, method: WithdrawalMethod): Promise<PayoutResult>;
  getPayoutStatus(providerReference: string): Promise<PayoutStatus>;
  cancelPayout?(providerReference: string): Promise<boolean>;
  getQuote(amount: number, currency: Currency, method: WithdrawalMethod): Promise<PayoutQuote>;
}

export interface PayoutResult {
  success: boolean;
  provider_reference?: string;
  estimated_arrival?: string;
  error?: string;
  retry_after?: number; // seconds
}

export interface ReconciliationEntry {
  id?: string;
  payout_id: string;
  rail: Rail;
  event_time: string;
  action: string;
  amount?: number;
  currency?: Currency;
  balance_before?: number;
  balance_after?: number;
  provider_reference?: string;
  provider_status?: string;
  request_payload?: Record<string, any>;
  response_payload?: Record<string, any>;
  notes?: string;
  created_by: string;
}

export interface PayoutFeeConfig {
  rail: Rail;
  currency: Currency;
  country?: string;
  fixed_fee: number;
  percent_fee: number;
  fx_margin: number;
  min_fee: number;
  max_fee?: number;
  min_amount: number;
  max_amount?: number;
  processing_time_min: number;
  processing_time_max: number;
  supports_instant: boolean;
  instant_fee_markup: number;
}

export interface RailCountrySupport {
  rail: Rail;
  country_code: string;
  currency: Currency;
  is_supported: boolean;
  requires_enhanced_kyc: boolean;
  max_daily_limit?: number;
  max_monthly_limit?: number;
  notes?: string;
}

// Error types
export class PayoutError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false,
    public retry_after?: number
  ) {
    super(message);
    this.name = 'PayoutError';
  }
}

export class InsufficientBalanceError extends PayoutError {
  constructor(available: number, requested: number) {
    super(
      `Insufficient balance. Available: ${available}, Requested: ${requested}`,
      'INSUFFICIENT_BALANCE',
      false
    );
  }
}

export class KYCRequiredError extends PayoutError {
  constructor(kycType: 'basic' | 'enhanced') {
    super(
      `${kycType === 'enhanced' ? 'Enhanced' : 'Basic'} KYC verification required`,
      `${kycType.toUpperCase()}_KYC_REQUIRED`,
      false
    );
  }
}

export class RailNotSupportedError extends PayoutError {
  constructor(rail: Rail, country: string, currency: Currency) {
    super(
      `Rail ${rail} does not support ${currency} payouts to ${country}`,
      'RAIL_NOT_SUPPORTED',
      false
    );
  }
}

export class AmountLimitError extends PayoutError {
  constructor(amount: number, limit: number, limitType: 'min' | 'max' | 'daily' | 'monthly') {
    super(
      `Amount ${amount} exceeds ${limitType} limit of ${limit}`,
      `AMOUNT_LIMIT_${limitType.toUpperCase()}`,
      false
    );
  }
}