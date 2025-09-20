-- Fix KYC verification status and withdrawal methods issues
-- This migration adds missing tables and columns for the KYC and withdrawal systems

-- 1. Add KYC-related columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'not_started';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_level TEXT DEFAULT 'none';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS enhanced_kyc_status TEXT DEFAULT 'not_started';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;

-- Add constraints for new columns
ALTER TABLE profiles ADD CONSTRAINT profiles_kyc_status_check 
CHECK (kyc_status IN ('not_started', 'in_progress', 'pending_review', 'approved', 'rejected', 'requires_action'));

ALTER TABLE profiles ADD CONSTRAINT profiles_verification_level_check 
CHECK (verification_level IN ('none', 'basic', 'enhanced', 'business'));

ALTER TABLE profiles ADD CONSTRAINT profiles_enhanced_kyc_status_check 
CHECK (enhanced_kyc_status IN ('not_started', 'pending', 'approved', 'denied', 'requires_action', 'verified'));

-- 2. Create KYC verifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS kyc_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  verification_type TEXT NOT NULL DEFAULT 'basic',
  status TEXT NOT NULL DEFAULT 'not_started',
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  verification_data JSONB DEFAULT '{}',
  required_documents TEXT[] DEFAULT ARRAY[]::TEXT[],
  submitted_documents TEXT[] DEFAULT ARRAY[]::TEXT[],
  reviewer_notes TEXT,
  external_verification_id TEXT, -- For Stripe Identity, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT kyc_verifications_verification_type_check 
    CHECK (verification_type IN ('basic', 'enhanced', 'business')),
  
  CONSTRAINT kyc_verifications_status_check 
    CHECK (status IN ('not_started', 'in_progress', 'pending_review', 'approved', 'rejected', 'requires_action'))
);

-- Create indexes for KYC verifications
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_profile_id ON kyc_verifications(profile_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_status ON kyc_verifications(status);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_type_status ON kyc_verifications(verification_type, status);

-- 3. Ensure withdrawal_methods table exists with all required columns
CREATE TABLE IF NOT EXISTS withdrawal_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  rail TEXT NOT NULL,
  label TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  country TEXT NOT NULL DEFAULT 'US',
  account_name TEXT,
  provider_name TEXT,
  icon TEXT,
  last_four TEXT,
  
  -- Rail-specific identifiers
  stripe_external_account_id TEXT,
  wise_recipient_id TEXT,
  payoneer_payee_id TEXT,
  paypal_receiver TEXT,
  local_provider TEXT,
  local_account_ref TEXT,
  
  -- Method properties
  supports_instant BOOLEAN DEFAULT false,
  processing_time TEXT DEFAULT '2-7 business days',
  fee_structure JSONB DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Additional details stored as JSON
  details JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT withdrawal_methods_rail_check 
    CHECK (rail IN ('stripe', 'wise', 'payoneer', 'paypal', 'local')),
  
  CONSTRAINT withdrawal_methods_currency_check 
    CHECK (currency IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY')),
    
  -- Ensure only one default per user per currency
  UNIQUE(user_id, currency, is_default) DEFERRABLE INITIALLY DEFERRED
);

-- Create indexes for withdrawal methods
CREATE INDEX IF NOT EXISTS idx_withdrawal_methods_user_id ON withdrawal_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_methods_rail ON withdrawal_methods(rail);
CREATE INDEX IF NOT EXISTS idx_withdrawal_methods_user_currency ON withdrawal_methods(user_id, currency);
CREATE INDEX IF NOT EXISTS idx_withdrawal_methods_user_active ON withdrawal_methods(user_id, is_active);

-- 4. Ensure payout_fees table exists (referenced by withdrawal methods)
CREATE TABLE IF NOT EXISTS payout_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rail TEXT NOT NULL,
  currency TEXT NOT NULL,
  country TEXT, -- NULL means applies to all countries
  
  -- Fee structure
  fixed_fee INTEGER DEFAULT 0, -- in minor currency units (cents)
  percent_fee NUMERIC(5,4) DEFAULT 0, -- as decimal (0.0250 = 2.5%)
  fx_margin NUMERIC(5,4) DEFAULT 0, -- for currency conversion
  
  -- Processing times in minutes
  processing_time_min INTEGER DEFAULT 1440, -- 1 day
  processing_time_max INTEGER DEFAULT 10080, -- 7 days
  supports_instant BOOLEAN DEFAULT false,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT payout_fees_rail_check 
    CHECK (rail IN ('stripe', 'wise', 'payoneer', 'paypal', 'local')),
  
  -- Unique constraint for rail + currency + country combination
  UNIQUE(rail, currency, country)
);

-- Create indexes for payout fees
CREATE INDEX IF NOT EXISTS idx_payout_fees_rail_currency ON payout_fees(rail, currency);
CREATE INDEX IF NOT EXISTS idx_payout_fees_active ON payout_fees(is_active);

-- 5. Insert default payout fee structures
INSERT INTO payout_fees (rail, currency, country, fixed_fee, percent_fee, processing_time_min, processing_time_max, supports_instant) VALUES
-- Stripe fees
('stripe', 'USD', 'US', 0, 0.0000, 10, 1440, false), -- Free for Stripe Connect, 10min-1day
('stripe', 'EUR', 'FR', 0, 0.0000, 10, 1440, false),
('stripe', 'GBP', 'GB', 0, 0.0000, 10, 1440, false),

-- Wise fees (approximate)
('wise', 'USD', NULL, 500, 0.0065, 60, 2880, false), -- $5 + 0.65%, 1hr-2days
('wise', 'EUR', NULL, 400, 0.0065, 60, 2880, false), -- €4 + 0.65%
('wise', 'GBP', NULL, 300, 0.0065, 60, 2880, false), -- £3 + 0.65%

-- PayPal fees (approximate)
('paypal', 'USD', NULL, 0, 0.0250, 30, 1440, false), -- 2.5%, 30min-1day
('paypal', 'EUR', NULL, 0, 0.0250, 30, 1440, false),
('paypal', 'GBP', NULL, 0, 0.0250, 30, 1440, false),

-- Payoneer fees (approximate)
('payoneer', 'USD', NULL, 300, 0.0150, 120, 2880, false), -- $3 + 1.5%, 2hr-2days
('payoneer', 'EUR', NULL, 300, 0.0150, 120, 2880, false),
('payoneer', 'GBP', NULL, 300, 0.0150, 120, 2880, false),

-- Local bank transfer fees
('local', 'USD', 'US', 100, 0.0010, 1440, 4320, false), -- $1 + 0.1%, 1-3 days (ACH)
('local', 'EUR', 'FR', 0, 0.0020, 60, 1440, false), -- €0 + 0.2%, 1hr-1day (SEPA)
('local', 'GBP', 'GB', 0, 0.0000, 120, 1440, false) -- Free, 2hr-1day (Faster Payments)

ON CONFLICT (rail, currency, country) DO UPDATE SET
  fixed_fee = EXCLUDED.fixed_fee,
  percent_fee = EXCLUDED.percent_fee,
  processing_time_min = EXCLUDED.processing_time_min,
  processing_time_max = EXCLUDED.processing_time_max,
  supports_instant = EXCLUDED.supports_instant,
  updated_at = NOW();

-- 6. Enable RLS on new tables
ALTER TABLE kyc_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_fees ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies
-- KYC verifications - users can only see their own
CREATE POLICY "Users can view own KYC verifications" ON kyc_verifications
  FOR SELECT USING (
    profile_id = auth.uid()
  );

CREATE POLICY "Users can insert own KYC verifications" ON kyc_verifications
  FOR INSERT WITH CHECK (
    profile_id = auth.uid()
  );

CREATE POLICY "Users can update own KYC verifications" ON kyc_verifications
  FOR UPDATE USING (
    profile_id = auth.uid()
  );

-- Withdrawal methods - users can only see their own
CREATE POLICY "Users can view own withdrawal methods" ON withdrawal_methods
  FOR SELECT USING (
    user_id = auth.uid()
  );

CREATE POLICY "Users can insert own withdrawal methods" ON withdrawal_methods
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "Users can update own withdrawal methods" ON withdrawal_methods
  FOR UPDATE USING (
    user_id = auth.uid()
  );

CREATE POLICY "Users can delete own withdrawal methods" ON withdrawal_methods
  FOR DELETE USING (
    user_id = auth.uid()
  );

-- Payout fees - read-only for authenticated users
CREATE POLICY "Authenticated users can view payout fees" ON payout_fees
  FOR SELECT USING (auth.role() = 'authenticated');

-- Service role can manage everything
CREATE POLICY "Service role can manage kyc_verifications" ON kyc_verifications FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can manage withdrawal_methods" ON withdrawal_methods FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can manage payout_fees" ON payout_fees FOR ALL USING (auth.role() = 'service_role');

-- 8. Create helper functions
-- Function to automatically create basic KYC verification
CREATE OR REPLACE FUNCTION create_basic_kyc_verification(_profile_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  verification_id UUID;
BEGIN
  INSERT INTO kyc_verifications (
    profile_id,
    verification_type,
    status,
    required_documents
  ) VALUES (
    _profile_id,
    'basic',
    'not_started',
    ARRAY['email_verification', 'phone_verification']
  )
  RETURNING id INTO verification_id;
  
  RETURN verification_id;
END;
$$;

-- Function to approve basic KYC (for email/phone verification)
CREATE OR REPLACE FUNCTION approve_basic_kyc(_profile_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Update profile
  UPDATE profiles SET 
    kyc_status = 'approved',
    verification_level = 'basic',
    kyc_verified_at = NOW(),
    updated_at = NOW()
  WHERE id = _profile_id;
  
  -- Update or create KYC verification
  INSERT INTO kyc_verifications (
    profile_id,
    verification_type,
    status,
    approved_at,
    submitted_documents
  ) VALUES (
    _profile_id,
    'basic',
    'approved',
    NOW(),
    ARRAY['email_verification', 'phone_verification']
  )
  ON CONFLICT (profile_id, verification_type) 
  DO UPDATE SET 
    status = 'approved',
    approved_at = NOW(),
    submitted_documents = ARRAY['email_verification', 'phone_verification'],
    updated_at = NOW();
  
  RETURN true;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_basic_kyc_verification(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_basic_kyc(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_basic_kyc_verification(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION approve_basic_kyc(UUID) TO service_role;

-- 9. Auto-approve basic KYC for existing users with verified emails
-- This gives existing users immediate access to basic features
UPDATE profiles SET 
  kyc_status = 'approved',
  verification_level = 'basic',
  kyc_verified_at = NOW(),
  updated_at = NOW()
WHERE kyc_status = 'not_started'
  AND id IN (
    SELECT id FROM auth.users WHERE email_confirmed_at IS NOT NULL
  );

-- Create basic KYC verification records for newly approved users
INSERT INTO kyc_verifications (profile_id, verification_type, status, approved_at, submitted_documents)
SELECT 
  id,
  'basic',
  'approved',
  NOW(),
  ARRAY['email_verification']
FROM profiles 
WHERE kyc_status = 'approved' 
  AND verification_level = 'basic'
  AND NOT EXISTS (
    SELECT 1 FROM kyc_verifications 
    WHERE profile_id = profiles.id 
      AND verification_type = 'basic'
  );

-- 10. Create trigger to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Add update triggers
DROP TRIGGER IF EXISTS update_kyc_verifications_updated_at ON kyc_verifications;
CREATE TRIGGER update_kyc_verifications_updated_at
  BEFORE UPDATE ON kyc_verifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_withdrawal_methods_updated_at ON withdrawal_methods;
CREATE TRIGGER update_withdrawal_methods_updated_at
  BEFORE UPDATE ON withdrawal_methods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 11. Add comments for documentation
COMMENT ON TABLE kyc_verifications IS 'Stores KYC verification records for users at different verification levels';
COMMENT ON TABLE withdrawal_methods IS 'Stores user withdrawal/payout methods for different rails (Stripe, Wise, etc.)';
COMMENT ON TABLE payout_fees IS 'Configuration table for payout fees and processing times by rail and geography';
COMMENT ON FUNCTION approve_basic_kyc(UUID) IS 'Auto-approves basic KYC for users with verified email addresses';
COMMENT ON FUNCTION create_basic_kyc_verification(UUID) IS 'Creates a new basic KYC verification record for a user';