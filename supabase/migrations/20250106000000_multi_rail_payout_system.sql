-- Multi-Rail Payout System Migration
-- Implements Deel-style withdrawal system with multiple payout rails
-- Supports Stripe, Wise, Payoneer, PayPal, Circle (USDC), and local providers

-- Drop existing withdrawals table and recreate with enhanced schema
DROP TABLE IF EXISTS withdrawals CASCADE;

-- Withdrawal methods - user's linked payout accounts across different rails
CREATE TABLE withdrawal_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  rail TEXT NOT NULL CHECK (rail IN ('stripe', 'wise', 'payoneer', 'paypal', 'local')),
  label TEXT NOT NULL, -- "My USD Bank", "PayPal Account", "Circle Wallet", etc.
  
  -- Rail-specific identifiers (store only opaque IDs/tokens, never raw secrets)
  stripe_external_account_id TEXT,
  wise_recipient_id TEXT,
  payoneer_payee_id TEXT,
  paypal_receiver TEXT, -- email or PayerID
  local_provider TEXT, -- 'paystack', 'flutterwave', 'mfs', etc.
  local_account_ref JSONB, -- tokenized account details
  
  -- Account details
  currency TEXT NOT NULL DEFAULT 'USD',
  country TEXT NOT NULL DEFAULT 'US',
  account_name TEXT, -- display name like "Chase ****1234"
  last_four TEXT, -- last 4 digits for display
  provider_name TEXT, -- "Chase Bank", "Wise", "PayPal", etc.
  icon TEXT, -- emoji or icon identifier
  
  -- Processing info
  supports_instant BOOLEAN DEFAULT FALSE,
  processing_time TEXT DEFAULT '2-7 business days',
  fee_structure JSONB, -- { "fixed": 0, "percent": 2.5, "fx_margin": 1.0 }
  
  -- Status
  is_default BOOLEAN DEFAULT FALSE,
  is_verified BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT withdrawal_methods_user_default_unique UNIQUE (user_id, currency, is_default) DEFERRABLE INITIALLY DEFERRED
);

-- User wallet balances - tracks available funds per currency
CREATE TABLE wallet_balances (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'USD',
  available BIGINT NOT NULL DEFAULT 0, -- minor units (cents)
  pending BIGINT NOT NULL DEFAULT 0, -- funds being processed
  total_earned BIGINT NOT NULL DEFAULT 0, -- lifetime earnings
  total_withdrawn BIGINT NOT NULL DEFAULT 0, -- lifetime withdrawals
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (user_id, currency)
);

-- Payouts - main ledger for all withdrawal requests
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  method_id UUID REFERENCES withdrawal_methods(id) NOT NULL,
  rail TEXT NOT NULL CHECK (rail IN ('stripe', 'wise', 'payoneer', 'paypal', 'local')),
  
  -- Amount details
  amount BIGINT NOT NULL CHECK (amount > 0), -- requested amount in minor units
  currency TEXT NOT NULL DEFAULT 'USD',
  fx_rate NUMERIC(15,8), -- if currency conversion needed
  platform_fee BIGINT DEFAULT 0, -- our fee
  provider_fee BIGINT DEFAULT 0, -- rail provider fee
  net_amount BIGINT NOT NULL, -- amount user receives after fees
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'requested' CHECK (
    status IN ('requested', 'queued', 'processing', 'paid', 'failed', 'returned', 'cancelled')
  ),
  failure_reason TEXT,
  
  -- Provider tracking
  provider_reference TEXT, -- stripe_payout_id, wise_transfer_id, etc.
  trace_id TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::TEXT, -- idempotency key
  
  -- Timing
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expected_arrival_date TIMESTAMPTZ,
  
  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reconciliation ledger - audit trail for all payout operations
CREATE TABLE reconciliation_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID REFERENCES payouts(id) ON DELETE CASCADE,
  rail TEXT NOT NULL,
  event_time TIMESTAMPTZ DEFAULT NOW(),
  action TEXT NOT NULL, -- 'debit_balance', 'create_transfer', 'provider_call', 'webhook_update', 'refund'
  
  -- Financial details
  amount BIGINT,
  currency TEXT,
  balance_before BIGINT,
  balance_after BIGINT,
  
  -- Provider details
  provider_reference TEXT,
  provider_status TEXT,
  
  -- Raw data for debugging
  request_payload JSONB,
  response_payload JSONB,
  
  -- Metadata
  notes TEXT,
  created_by TEXT DEFAULT 'system',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payout fees configuration - dynamic fee structure per rail
CREATE TABLE payout_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rail TEXT NOT NULL,
  currency TEXT NOT NULL,
  country TEXT, -- NULL for global
  
  -- Fee structure
  fixed_fee BIGINT DEFAULT 0, -- fixed fee in minor units
  percent_fee NUMERIC(5,4) DEFAULT 0, -- percentage fee (e.g., 0.0250 = 2.5%)
  fx_margin NUMERIC(5,4) DEFAULT 0, -- FX margin for currency conversion
  min_fee BIGINT DEFAULT 0,
  max_fee BIGINT, -- NULL for no max
  
  -- Limits
  min_amount BIGINT DEFAULT 100, -- minimum payout amount
  max_amount BIGINT, -- maximum payout amount, NULL for no limit
  
  -- Processing info
  processing_time_min INTEGER DEFAULT 1440, -- minutes (24 hours)
  processing_time_max INTEGER DEFAULT 10080, -- minutes (7 days)
  supports_instant BOOLEAN DEFAULT FALSE,
  instant_fee_markup NUMERIC(5,4) DEFAULT 0, -- additional fee for instant
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  effective_from TIMESTAMPTZ DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE (rail, currency, country, effective_from)
);

-- Country support matrix - which rails support which countries
CREATE TABLE rail_country_support (
  rail TEXT NOT NULL,
  country_code TEXT NOT NULL, -- ISO 3166-1 alpha-2
  currency TEXT NOT NULL,
  is_supported BOOLEAN DEFAULT TRUE,
  requires_enhanced_kyc BOOLEAN DEFAULT FALSE,
  max_daily_limit BIGINT, -- in minor units of currency
  max_monthly_limit BIGINT,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (rail, country_code, currency)
);

-- Indexes for performance
CREATE INDEX idx_withdrawal_methods_user_id ON withdrawal_methods(user_id);
CREATE INDEX idx_withdrawal_methods_rail ON withdrawal_methods(rail);
CREATE INDEX idx_withdrawal_methods_user_currency ON withdrawal_methods(user_id, currency);
CREATE INDEX idx_wallet_balances_user_id ON wallet_balances(user_id);
CREATE INDEX idx_payouts_user_id ON payouts(user_id);
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_payouts_trace_id ON payouts(trace_id);
CREATE INDEX idx_payouts_provider_ref ON payouts(provider_reference);
CREATE INDEX idx_payouts_created_at ON payouts(created_at DESC);
CREATE INDEX idx_reconciliation_payout_id ON reconciliation_ledger(payout_id);
CREATE INDEX idx_reconciliation_action ON reconciliation_ledger(action);
CREATE INDEX idx_reconciliation_event_time ON reconciliation_ledger(event_time DESC);
CREATE INDEX idx_payout_fees_rail_currency ON payout_fees(rail, currency);
CREATE INDEX idx_rail_country_support_country ON rail_country_support(country_code);

-- Enable RLS on all tables
ALTER TABLE withdrawal_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE rail_country_support ENABLE ROW LEVEL SECURITY;

-- RLS Policies for withdrawal_methods
CREATE POLICY "Users can manage own withdrawal methods" ON withdrawal_methods
  FOR ALL USING (user_id = auth.uid());

-- RLS Policies for wallet_balances  
CREATE POLICY "Users can view own wallet balances" ON wallet_balances
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can manage wallet balances" ON wallet_balances
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for payouts
CREATE POLICY "Users can view own payouts" ON payouts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own payouts" ON payouts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "System can manage payouts" ON payouts
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for reconciliation_ledger
CREATE POLICY "Users can view own reconciliation records" ON reconciliation_ledger
  FOR SELECT USING (
    payout_id IN (SELECT id FROM payouts WHERE user_id = auth.uid())
  );

CREATE POLICY "System can manage reconciliation" ON reconciliation_ledger
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for configuration tables (read-only for authenticated users)
CREATE POLICY "Authenticated users can read payout fees" ON payout_fees
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Authenticated users can read country support" ON rail_country_support
  FOR SELECT TO authenticated USING (TRUE);

-- Update timestamps triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_withdrawal_methods_updated_at BEFORE UPDATE ON withdrawal_methods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallet_balances_updated_at BEFORE UPDATE ON wallet_balances  
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payouts_updated_at BEFORE UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payout_fees_updated_at BEFORE UPDATE ON payout_fees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rail_country_support_updated_at BEFORE UPDATE ON rail_country_support
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Functions for balance management
CREATE OR REPLACE FUNCTION debit_balance(_user_id UUID, _amount BIGINT, _currency TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE wallet_balances
    SET available = available - _amount, 
        pending = pending + _amount,
        updated_at = NOW()
  WHERE user_id = _user_id 
    AND currency = _currency 
    AND available >= _amount;
    
  IF NOT FOUND THEN 
    RETURN FALSE; 
  END IF;
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION credit_balance(_user_id UUID, _amount BIGINT, _currency TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO wallet_balances (user_id, currency, available, total_earned)
  VALUES (_user_id, _currency, _amount, _amount)
  ON CONFLICT (user_id, currency) 
  DO UPDATE SET
    available = wallet_balances.available + _amount,
    total_earned = wallet_balances.total_earned + _amount,
    updated_at = NOW();
    
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION complete_payout(_payout_id UUID, _success BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _payout payouts%ROWTYPE;
BEGIN
  SELECT * INTO _payout FROM payouts WHERE id = _payout_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  IF _success THEN
    -- Move from pending to withdrawn
    UPDATE wallet_balances
      SET pending = pending - _payout.amount,
          total_withdrawn = total_withdrawn + _payout.amount,
          updated_at = NOW()
    WHERE user_id = _payout.user_id AND currency = _payout.currency;
    
    UPDATE payouts 
      SET status = 'paid', 
          completed_at = NOW(),
          updated_at = NOW()
    WHERE id = _payout_id;
  ELSE
    -- Return funds to available balance
    UPDATE wallet_balances
      SET available = available + _payout.amount,
          pending = pending - _payout.amount,
          updated_at = NOW()
    WHERE user_id = _payout.user_id AND currency = _payout.currency;
    
    UPDATE payouts 
      SET status = 'failed',
          completed_at = NOW(),
          updated_at = NOW()
    WHERE id = _payout_id;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Function to get user payout stats
CREATE OR REPLACE FUNCTION get_user_payout_stats(_user_id UUID, _currency TEXT DEFAULT 'USD')
RETURNS TABLE(
  available_balance BIGINT,
  pending_balance BIGINT,
  total_earned BIGINT,
  total_withdrawn BIGINT,
  pending_payouts INTEGER,
  successful_payouts INTEGER,
  failed_payouts INTEGER
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(wb.available, 0) as available_balance,
    COALESCE(wb.pending, 0) as pending_balance,
    COALESCE(wb.total_earned, 0) as total_earned,
    COALESCE(wb.total_withdrawn, 0) as total_withdrawn,
    COUNT(CASE WHEN p.status IN ('requested', 'queued', 'processing') THEN 1 END)::INTEGER as pending_payouts,
    COUNT(CASE WHEN p.status = 'paid' THEN 1 END)::INTEGER as successful_payouts,
    COUNT(CASE WHEN p.status IN ('failed', 'returned', 'cancelled') THEN 1 END)::INTEGER as failed_payouts
  FROM wallet_balances wb
  LEFT JOIN payouts p ON p.user_id = wb.user_id AND p.currency = wb.currency
  WHERE wb.user_id = _user_id AND wb.currency = _currency
  GROUP BY wb.available, wb.pending, wb.total_earned, wb.total_withdrawn;
END;
$$;

-- Insert default fee configurations for supported rails
INSERT INTO payout_fees (rail, currency, fixed_fee, percent_fee, min_amount, processing_time_min, processing_time_max, supports_instant) VALUES
-- Stripe fees (varies by country, these are US examples)
('stripe', 'USD', 25, 0.0000, 100, 1440, 10080, FALSE), -- $0.25 fixed, 1-7 days
('stripe', 'EUR', 25, 0.0000, 100, 1440, 10080, FALSE), -- €0.25 fixed, 1-7 days
('stripe', 'GBP', 20, 0.0000, 100, 1440, 10080, FALSE), -- £0.20 fixed, 1-7 days

-- Wise fees (example rates)
('wise', 'USD', 100, 0.0041, 100, 60, 2880, TRUE), -- $1.00 + 0.41%, up to 2 days, instant available
('wise', 'EUR', 70, 0.0035, 100, 60, 2880, TRUE), -- €0.70 + 0.35%, up to 2 days
('wise', 'GBP', 60, 0.0035, 100, 60, 2880, TRUE), -- £0.60 + 0.35%, up to 2 days

-- PayPal fees
('paypal', 'USD', 0, 0.0200, 100, 30, 1440, TRUE), -- 2% fee, instant to 24hrs
('paypal', 'EUR', 0, 0.0200, 100, 30, 1440, TRUE), -- 2% fee, instant to 24hrs
('paypal', 'GBP', 0, 0.0200, 100, 30, 1440, TRUE), -- 2% fee, instant to 24hrs

-- Payoneer fees (example)
('payoneer', 'USD', 200, 0.0100, 2000, 1440, 4320, FALSE), -- $2.00 + 1%, 1-3 days
('payoneer', 'EUR', 200, 0.0100, 2000, 1440, 4320, FALSE), -- €2.00 + 1%, 1-3 days


-- Insert country support matrix (major countries first)
INSERT INTO rail_country_support (rail, country_code, currency, requires_enhanced_kyc, max_daily_limit, max_monthly_limit) VALUES
-- Stripe support (major countries)
('stripe', 'US', 'USD', FALSE, 10000000, 100000000), -- $100k daily, $1M monthly
('stripe', 'GB', 'GBP', FALSE, 8000000, 80000000), -- £80k daily, £800k monthly  
('stripe', 'DE', 'EUR', FALSE, 10000000, 100000000), -- €100k daily, €1M monthly
('stripe', 'CA', 'CAD', FALSE, 13000000, 130000000), -- CAD equivalents
('stripe', 'AU', 'AUD', FALSE, 15000000, 150000000), -- AUD equivalents
('stripe', 'JP', 'JPY', FALSE, 1100000000, 11000000000), -- JPY equivalents

-- Wise support (global)
('wise', 'US', 'USD', FALSE, 5000000, 50000000), -- Lower limits
('wise', 'GB', 'GBP', FALSE, 4000000, 40000000),
('wise', 'DE', 'EUR', FALSE, 5000000, 50000000),
('wise', 'NG', 'NGN', TRUE, 500000000, 5000000000), -- Nigeria requires enhanced KYC
('wise', 'IN', 'INR', TRUE, 350000000, 3500000000), -- India requires enhanced KYC
('wise', 'PH', 'PHP', FALSE, 25000000, 250000000), -- Philippines

-- PayPal support
('paypal', 'US', 'USD', FALSE, 1000000, 10000000), -- $10k daily, $100k monthly
('paypal', 'GB', 'GBP', FALSE, 800000, 8000000),
('paypal', 'DE', 'EUR', FALSE, 1000000, 10000000),
('paypal', 'CA', 'CAD', FALSE, 1300000, 13000000),

-- Payoneer support 
('payoneer', 'US', 'USD', FALSE, 2000000, 50000000), -- Higher minimums, higher limits
('payoneer', 'GB', 'GBP', FALSE, 1600000, 40000000),
('payoneer', 'DE', 'EUR', FALSE, 2000000, 50000000),
('payoneer', 'IN', 'USD', TRUE, 1000000, 20000000); -- Global USD payouts

-- Payout jobs table for background processing
CREATE TABLE IF NOT EXISTS payout_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID REFERENCES payouts(id) ON DELETE CASCADE NOT NULL,
  rail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'completed', 'failed', 'retrying')
  ),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for job processing
CREATE INDEX IF NOT EXISTS idx_payout_jobs_status ON payout_jobs(status);
CREATE INDEX IF NOT EXISTS idx_payout_jobs_next_retry ON payout_jobs(next_retry_at) WHERE next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payout_jobs_created_at ON payout_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_payout_jobs_payout_id ON payout_jobs(payout_id);

-- RLS policy for payout jobs
ALTER TABLE payout_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can manage payout jobs" ON payout_jobs FOR ALL USING (auth.role() = 'service_role');

-- Grant permissions
GRANT ALL ON withdrawal_methods TO authenticated, service_role;
GRANT ALL ON payout_jobs TO service_role;
GRANT ALL ON wallet_balances TO authenticated, service_role;
GRANT ALL ON payouts TO authenticated, service_role;
GRANT ALL ON reconciliation_ledger TO authenticated, service_role;
GRANT SELECT ON payout_fees TO authenticated, service_role;
GRANT SELECT ON rail_country_support TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION debit_balance(UUID, BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION credit_balance(UUID, BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION complete_payout(UUID, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION get_user_payout_stats(UUID, TEXT) TO authenticated, service_role;

-- Comments for documentation
COMMENT ON TABLE withdrawal_methods IS 'User-linked payout accounts across different rails (Stripe, Wise, PayPal, etc.)';
COMMENT ON TABLE wallet_balances IS 'User wallet balances per currency with available, pending, and lifetime totals';
COMMENT ON TABLE payouts IS 'Main ledger for all withdrawal requests with full audit trail';
COMMENT ON TABLE reconciliation_ledger IS 'Complete audit trail for all payout operations across all rails';
COMMENT ON TABLE payout_fees IS 'Dynamic fee structure configuration per rail, currency, and country';
COMMENT ON TABLE rail_country_support IS 'Matrix of which rails support which countries and currencies';

COMMENT ON FUNCTION debit_balance(UUID, BIGINT, TEXT) IS 'Atomically debit user balance and move to pending';
COMMENT ON FUNCTION credit_balance(UUID, BIGINT, TEXT) IS 'Credit user balance (typically from completed contracts)';
COMMENT ON FUNCTION complete_payout(UUID, BOOLEAN) IS 'Complete a payout (success moves pending to withdrawn, failure returns to available)';
COMMENT ON FUNCTION get_user_payout_stats(UUID, TEXT) IS 'Get comprehensive payout statistics for a user in a specific currency';