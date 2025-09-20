-- Balance sync integration with contract payments
-- This migration ensures the wallet balance system integrates properly with existing contract payments

-- Create or replace the credit_balance function to ensure it exists
CREATE OR REPLACE FUNCTION credit_balance(_user_id UUID, _amount BIGINT, _currency TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Insert or update the wallet balance
  INSERT INTO wallet_balances (user_id, currency, available, pending)
  VALUES (_user_id, _currency, _amount, 0)
  ON CONFLICT (user_id, currency)
  DO UPDATE SET 
    available = wallet_balances.available + _amount,
    updated_at = NOW()
  WHERE wallet_balances.user_id = _user_id 
    AND wallet_balances.currency = _currency;

  -- Always return true for successful credit
  RETURN TRUE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION credit_balance(UUID, BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION credit_balance(UUID, BIGINT, TEXT) TO service_role;

-- Add a helper function to sync historical contract payments
CREATE OR REPLACE FUNCTION sync_historical_payments()
RETURNS TABLE (
  contract_id UUID,
  freelancer_id UUID,
  amount NUMERIC,
  currency TEXT,
  synced_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH payment_releases AS (
    SELECT DISTINCT
      cp.contract_id,
      c.freelancer_id,
      cp.amount,
      COALESCE(cp.currency, c.currency, 'USD') as currency,
      cp.id as payment_id,
      NOW() as synced_at
    FROM contract_payments cp
    JOIN contracts c ON c.id = cp.contract_id
    WHERE cp.payment_type = 'release' 
      AND cp.status = 'released'
      AND NOT EXISTS (
        -- Don't sync if already synced
        SELECT 1 FROM reconciliation_ledger rl 
        WHERE rl.action = 'balance_credited' 
          AND rl.provider_reference = cp.id
      )
  )
  SELECT 
    pr.contract_id,
    pr.freelancer_id,
    pr.amount,
    pr.currency,
    pr.synced_at
  FROM payment_releases pr;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION sync_historical_payments() TO service_role;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contract_payments_release_status 
ON contract_payments(payment_type, status) 
WHERE payment_type = 'release' AND status = 'released';

CREATE INDEX IF NOT EXISTS idx_reconciliation_ledger_balance_credited
ON reconciliation_ledger(action, provider_reference)
WHERE action = 'balance_credited';

-- Create a view for freelancer earnings summary
CREATE OR REPLACE VIEW freelancer_earnings_summary AS
SELECT 
  c.freelancer_id,
  COALESCE(cp.currency, c.currency, 'USD') as currency,
  COUNT(cp.id) as payment_count,
  SUM(cp.amount) as total_earned,
  MIN(cp.completed_at) as first_earning_date,
  MAX(cp.completed_at) as latest_earning_date
FROM contract_payments cp
JOIN contracts c ON c.id = cp.contract_id
WHERE cp.payment_type = 'release' 
  AND cp.status = 'released'
  AND cp.completed_at IS NOT NULL
GROUP BY c.freelancer_id, COALESCE(cp.currency, c.currency, 'USD');

-- Create RLS policy for the earnings summary view
ALTER VIEW freelancer_earnings_summary OWNER TO postgres;
CREATE POLICY "Users can view their own earnings summary" ON freelancer_earnings_summary
  FOR SELECT USING (auth.uid() = freelancer_id);

-- Create a helper function to get wallet balance with earnings
CREATE OR REPLACE FUNCTION get_wallet_balance_with_earnings(_user_id UUID)
RETURNS TABLE (
  currency TEXT,
  available_balance BIGINT,
  pending_balance BIGINT,
  total_balance BIGINT,
  total_earned NUMERIC,
  total_withdrawn NUMERIC,
  payment_count INTEGER
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(wb.currency, 'USD') as currency,
    COALESCE(wb.available, 0) as available_balance,
    COALESCE(wb.pending, 0) as pending_balance,
    COALESCE(wb.available, 0) + COALESCE(wb.pending, 0) as total_balance,
    COALESCE(fes.total_earned, 0) as total_earned,
    COALESCE(
      (SELECT SUM(net_amount) FROM payouts 
       WHERE user_id = _user_id AND status IN ('paid', 'processing')
       AND currency = COALESCE(wb.currency, 'USD')), 
      0
    ) as total_withdrawn,
    COALESCE(fes.payment_count, 0) as payment_count
  FROM wallet_balances wb
  FULL OUTER JOIN freelancer_earnings_summary fes 
    ON fes.freelancer_id = wb.user_id 
    AND fes.currency = wb.currency
  WHERE COALESCE(wb.user_id, fes.freelancer_id) = _user_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_wallet_balance_with_earnings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_wallet_balance_with_earnings(UUID) TO service_role;

-- Add a trigger to automatically credit balance when contract payment is released
-- This provides a backup mechanism in case the application-level sync fails
CREATE OR REPLACE FUNCTION trigger_credit_freelancer_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  contract_data RECORD;
  amount_in_minor_units BIGINT;
BEGIN
  -- Only process release payments that are being marked as released
  IF NEW.payment_type = 'release' AND NEW.status = 'released' AND 
     (OLD IS NULL OR OLD.status != 'released') THEN
    
    -- Get contract information
    SELECT freelancer_id, currency INTO contract_data
    FROM contracts 
    WHERE id = NEW.contract_id;
    
    IF FOUND THEN
      -- Convert amount to minor units (cents)
      amount_in_minor_units := ROUND(NEW.amount * 100);
      
      -- Credit the freelancer's balance
      PERFORM credit_balance(
        contract_data.freelancer_id,
        amount_in_minor_units,
        COALESCE(NEW.currency, contract_data.currency, 'USD')
      );
      
      -- Log the balance credit
      INSERT INTO reconciliation_ledger (
        payout_id, 
        rail, 
        action, 
        provider_reference,
        notes,
        created_by,
        request_payload
      ) VALUES (
        '',
        'stripe',
        'balance_credited',
        NEW.id,
        'Balance credited from contract payment release (trigger)',
        'db_trigger',
        jsonb_build_object(
          'contract_id', NEW.contract_id,
          'freelancer_id', contract_data.freelancer_id,
          'amount', amount_in_minor_units,
          'currency', COALESCE(NEW.currency, contract_data.currency, 'USD'),
          'payment_id', NEW.id,
          'trigger_source', 'contract_payment_release'
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_contract_payment_balance_credit ON contract_payments;
CREATE TRIGGER trigger_contract_payment_balance_credit
  AFTER INSERT OR UPDATE ON contract_payments
  FOR EACH ROW
  EXECUTE FUNCTION trigger_credit_freelancer_balance();

-- Update the get_user_payout_stats function to use the new balance sync system
CREATE OR REPLACE FUNCTION get_user_payout_stats(_user_id UUID, _currency TEXT)
RETURNS TABLE (
  available_balance BIGINT,
  pending_balance BIGINT,
  total_earned NUMERIC,
  total_withdrawn NUMERIC,
  pending_payouts INTEGER,
  successful_payouts INTEGER,
  failed_payouts INTEGER
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH balance_data AS (
    SELECT * FROM get_wallet_balance_with_earnings(_user_id)
    WHERE currency = _currency
    LIMIT 1
  ),
  payout_stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE status IN ('queued', 'processing'))::INTEGER as pending_count,
      COUNT(*) FILTER (WHERE status = 'paid')::INTEGER as success_count,
      COUNT(*) FILTER (WHERE status IN ('failed', 'cancelled'))::INTEGER as failed_count,
      COALESCE(SUM(net_amount) FILTER (WHERE status = 'paid'), 0) as total_withdrawn_amount
    FROM payouts
    WHERE user_id = _user_id AND currency = _currency
  )
  SELECT 
    COALESCE(bd.available_balance, 0) as available_balance,
    COALESCE(bd.pending_balance, 0) as pending_balance,
    COALESCE(bd.total_earned, 0) as total_earned,
    COALESCE(ps.total_withdrawn_amount, 0) as total_withdrawn,
    COALESCE(ps.pending_count, 0) as pending_payouts,
    COALESCE(ps.success_count, 0) as successful_payouts,
    COALESCE(ps.failed_count, 0) as failed_payouts
  FROM balance_data bd
  CROSS JOIN payout_stats ps;
END;
$$;

-- Grant execute permission to the updated function
GRANT EXECUTE ON FUNCTION get_user_payout_stats(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_payout_stats(UUID, TEXT) TO service_role;

-- Add comment for documentation
COMMENT ON FUNCTION trigger_credit_freelancer_balance() IS 'Automatically credits freelancer wallet balance when contract payment is released. Provides backup mechanism for application-level balance sync.';
COMMENT ON TRIGGER trigger_contract_payment_balance_credit ON contract_payments IS 'Ensures freelancer balances are always credited when payments are released, even if application-level sync fails.';
COMMENT ON FUNCTION get_user_payout_stats(UUID, TEXT) IS 'Gets comprehensive user payout statistics including balance and earnings from the balance sync system.';