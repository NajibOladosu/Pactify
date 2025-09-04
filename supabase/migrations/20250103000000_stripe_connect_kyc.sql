-- Stripe Connect KYC System Migration
-- This implements the full Stripe Connect integration for KYC-gated payouts

-- Connected accounts table (1-to-1 with payee users)
CREATE TABLE connected_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  stripe_account_id TEXT UNIQUE NOT NULL,
  
  -- KYC Status Fields
  cap_transfers TEXT CHECK (cap_transfers IN ('inactive', 'pending', 'active')) DEFAULT 'inactive',
  cap_card_payments TEXT CHECK (cap_card_payments IN ('inactive', 'pending', 'active')) DEFAULT 'inactive',
  payouts_enabled BOOLEAN DEFAULT FALSE,
  charges_enabled BOOLEAN DEFAULT FALSE,
  
  -- Requirements tracking
  requirements_currently_due JSONB DEFAULT '[]'::jsonb,
  requirements_past_due JSONB DEFAULT '[]'::jsonb,
  requirements_eventually_due JSONB DEFAULT '[]'::jsonb,
  requirements_disabled_reason TEXT,
  
  -- Onboarding status
  onboarding_completed_at TIMESTAMPTZ,
  details_submitted BOOLEAN DEFAULT FALSE,
  tos_acceptance JSONB,
  
  -- Account info
  country TEXT DEFAULT 'US',
  business_type TEXT CHECK (business_type IN ('individual', 'company')) DEFAULT 'individual',
  account_type TEXT CHECK (account_type IN ('express', 'custom')) DEFAULT 'express',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Escrow ledger for tracking buyer payments and releases
CREATE TABLE escrow_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Payment tracking
  payment_intent_id TEXT UNIQUE NOT NULL,
  buyer_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  payee_account_id UUID REFERENCES connected_accounts(id) ON DELETE CASCADE NOT NULL,
  
  -- Amount details
  amount INTEGER NOT NULL, -- in smallest currency unit
  currency TEXT DEFAULT 'USD' NOT NULL,
  platform_fee INTEGER DEFAULT 0, -- platform fee amount
  
  -- Status tracking
  status TEXT CHECK (status IN ('held', 'released', 'refunded', 'failed')) DEFAULT 'held',
  
  -- Transfer details (populated when released)
  transfer_id TEXT UNIQUE,
  released_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  
  -- Metadata
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  milestone_id UUID,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payout events for analytics and monitoring
CREATE TABLE payout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Stripe references
  account_id UUID REFERENCES connected_accounts(id) ON DELETE CASCADE NOT NULL,
  stripe_payout_id TEXT NOT NULL,
  
  -- Payout details
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD' NOT NULL,
  status TEXT NOT NULL, -- paid, pending, in_transit, canceled, failed
  arrival_date DATE,
  
  -- Failure tracking
  failure_code TEXT,
  failure_message TEXT,
  failure_balance_transaction TEXT,
  
  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Onboarding sessions tracking
CREATE TABLE onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  connected_account_id UUID REFERENCES connected_accounts(id) ON DELETE CASCADE NOT NULL,
  
  -- Session details
  stripe_account_link_id TEXT,
  session_url TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Flow tracking
  flow_type TEXT CHECK (flow_type IN ('onboarding', 'account_update')) DEFAULT 'onboarding',
  return_url TEXT NOT NULL,
  refresh_url TEXT NOT NULL,
  
  -- Status
  status TEXT CHECK (status IN ('active', 'expired', 'completed')) DEFAULT 'active',
  completed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_connected_accounts_user_id ON connected_accounts(user_id);
CREATE INDEX idx_connected_accounts_stripe_id ON connected_accounts(stripe_account_id);
CREATE INDEX idx_escrow_ledger_buyer ON escrow_ledger(buyer_user_id);
CREATE INDEX idx_escrow_ledger_payee ON escrow_ledger(payee_account_id);
CREATE INDEX idx_escrow_ledger_status ON escrow_ledger(status);
CREATE INDEX idx_escrow_ledger_contract ON escrow_ledger(contract_id);
CREATE INDEX idx_payout_events_account ON payout_events(account_id);
CREATE INDEX idx_payout_events_status ON payout_events(status);
CREATE INDEX idx_onboarding_sessions_user ON onboarding_sessions(user_id);

-- RLS Policies
ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;

-- Connected accounts policies
CREATE POLICY "Users can view their own connected accounts" ON connected_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own connected accounts" ON connected_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connected accounts" ON connected_accounts
  FOR UPDATE USING (auth.uid() = user_id);

-- Escrow ledger policies (buyers and payees can view)
CREATE POLICY "Buyers can view their payments" ON escrow_ledger
  FOR SELECT USING (auth.uid() = buyer_user_id);

CREATE POLICY "Payees can view their earnings" ON escrow_ledger
  FOR SELECT USING (
    auth.uid() IN (
      SELECT ca.user_id FROM connected_accounts ca 
      WHERE ca.id = escrow_ledger.payee_account_id
    )
  );

-- Payout events policies
CREATE POLICY "Account owners can view their payout events" ON payout_events
  FOR SELECT USING (
    auth.uid() IN (
      SELECT ca.user_id FROM connected_accounts ca 
      WHERE ca.id = payout_events.account_id
    )
  );

-- Onboarding sessions policies
CREATE POLICY "Users can manage their onboarding sessions" ON onboarding_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Update timestamps trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_connected_accounts_updated_at BEFORE UPDATE ON connected_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_escrow_ledger_updated_at BEFORE UPDATE ON escrow_ledger
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payout_events_updated_at BEFORE UPDATE ON payout_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_onboarding_sessions_updated_at BEFORE UPDATE ON onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to check if account is verified for payouts
CREATE OR REPLACE FUNCTION is_account_verified_for_payouts(account_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM connected_accounts 
    WHERE id = account_id 
    AND cap_transfers = 'active' 
    AND payouts_enabled = TRUE
    AND array_length(
      COALESCE((requirements_currently_due)::text[]::text[], '{}'), 1
    ) IS NULL -- no currently due requirements
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get verification status summary
CREATE OR REPLACE FUNCTION get_verification_status(account_id UUID)
RETURNS TABLE (
  is_verified BOOLEAN,
  can_receive_payouts BOOLEAN,
  missing_requirements TEXT[],
  disabled_reason TEXT,
  onboarding_completed BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (ca.cap_transfers = 'active' AND ca.payouts_enabled = TRUE) as is_verified,
    (ca.cap_transfers = 'active' AND ca.payouts_enabled = TRUE AND 
     COALESCE(array_length((ca.requirements_currently_due)::text[], 1), 0) = 0) as can_receive_payouts,
    COALESCE((ca.requirements_currently_due)::text[], '{}') as missing_requirements,
    ca.requirements_disabled_reason as disabled_reason,
    (ca.onboarding_completed_at IS NOT NULL) as onboarding_completed
  FROM connected_accounts ca
  WHERE ca.id = account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment explaining the schema
COMMENT ON TABLE connected_accounts IS 'Stripe Connect accounts for KYC-verified payouts';
COMMENT ON TABLE escrow_ledger IS 'Escrow system tracking payments held until KYC verification';
COMMENT ON TABLE payout_events IS 'Analytics and monitoring for Stripe payouts';
COMMENT ON TABLE onboarding_sessions IS 'Tracking Stripe Connect onboarding sessions';