-- Enhanced KYC with Stripe Identity Verification
-- This migration adds support for document verification for amounts >$100

-- Extend connected_accounts table with enhanced KYC fields
ALTER TABLE connected_accounts 
ADD COLUMN enhanced_kyc_status TEXT DEFAULT 'not_started' CHECK (
  enhanced_kyc_status IN (
    'not_started',
    'verification_session_created', 
    'documents_submitted',
    'under_review',
    'verified',
    'failed'
  )
),
ADD COLUMN identity_verification_session_id TEXT,
ADD COLUMN enhanced_kyc_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN documents_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN verification_report JSONB,
ADD COLUMN last_verification_attempt TIMESTAMP WITH TIME ZONE;

-- Create identity verification sessions tracking table
CREATE TABLE identity_verification_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  connected_account_id UUID NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  stripe_session_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'requires_input' CHECK (
    status IN (
      'requires_input',
      'processing', 
      'verified',
      'canceled',
      'expired'
    )
  ),
  verification_report JSONB,
  failure_reason TEXT,
  redirect_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Add indexes for performance
CREATE INDEX idx_identity_sessions_user_id ON identity_verification_sessions(user_id);
CREATE INDEX idx_identity_sessions_stripe_id ON identity_verification_sessions(stripe_session_id);
CREATE INDEX idx_identity_sessions_status ON identity_verification_sessions(status);
CREATE INDEX idx_connected_accounts_enhanced_status ON connected_accounts(enhanced_kyc_status);

-- Create updated_at trigger for identity_verification_sessions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_identity_sessions_updated_at 
  BEFORE UPDATE ON identity_verification_sessions 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies for identity_verification_sessions
ALTER TABLE identity_verification_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own identity verification sessions
CREATE POLICY "Users can view own identity sessions" ON identity_verification_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own identity verification sessions  
CREATE POLICY "Users can create own identity sessions" ON identity_verification_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own identity verification sessions
CREATE POLICY "Users can update own identity sessions" ON identity_verification_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Add function to check if enhanced KYC is required for an amount
CREATE OR REPLACE FUNCTION requires_enhanced_kyc(amount DECIMAL)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN amount > 100;
END;
$$ LANGUAGE plpgsql;

-- Add function to get enhanced KYC status for a user
CREATE OR REPLACE FUNCTION get_enhanced_kyc_status(user_uuid UUID)
RETURNS TABLE (
  has_enhanced_kyc BOOLEAN,
  status TEXT,
  documents_verified BOOLEAN,
  last_attempt TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ca.enhanced_kyc_status = 'verified' as has_enhanced_kyc,
    ca.enhanced_kyc_status as status,
    ca.documents_verified,
    ca.last_verification_attempt as last_attempt
  FROM connected_accounts ca
  WHERE ca.user_id = user_uuid
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON COLUMN connected_accounts.enhanced_kyc_status IS 'Status of enhanced KYC verification for high-value transactions (>$100)';
COMMENT ON COLUMN connected_accounts.identity_verification_session_id IS 'Current or most recent Stripe Identity verification session ID';
COMMENT ON COLUMN connected_accounts.enhanced_kyc_completed_at IS 'Timestamp when enhanced KYC verification was completed';
COMMENT ON COLUMN connected_accounts.documents_verified IS 'Whether identity documents have been successfully verified';
COMMENT ON COLUMN connected_accounts.verification_report IS 'Full Stripe Identity verification report data';
COMMENT ON TABLE identity_verification_sessions IS 'Tracks Stripe Identity verification sessions for enhanced KYC';