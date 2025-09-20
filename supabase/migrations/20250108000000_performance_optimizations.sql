-- Performance optimization migration
-- Adds indexes, optimizes queries, and improves database performance

-- 1. CRITICAL INDEXES FOR FREQUENT QUERIES
-- User profile lookups (dashboard layout)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_id_subscription 
ON profiles(id) INCLUDE (display_name, user_type, subscription_tier, stripe_connect_account_id);

-- Contract queries by user
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contracts_client_status 
ON contracts(client_id, status) INCLUDE (title, created_at, total_amount);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contracts_freelancer_status 
ON contracts(freelancer_id, status) INCLUDE (title, created_at, total_amount);

-- Payment queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contract_payments_contract_status 
ON contract_payments(contract_id, status) INCLUDE (amount, currency, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contract_payments_user_type 
ON contract_payments(user_id, payment_type, status) INCLUDE (amount, currency, created_at);

-- Withdrawal/payout indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payouts_user_status_currency 
ON payouts(user_id, status, currency) INCLUDE (amount, net_amount, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_withdrawal_methods_user_rail 
ON withdrawal_methods(user_id, rail, is_active) INCLUDE (label, provider_name, country);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_balances_user_currency 
ON wallet_balances(user_id, currency) INCLUDE (available, pending, updated_at);

-- Notification queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_read_created 
ON notifications(user_id, is_read, created_at DESC);

-- Activity tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contract_activities_contract_created 
ON contract_activities(contract_id, created_at DESC);

-- Reconciliation ledger for audit trails
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reconciliation_ledger_payout_action 
ON reconciliation_ledger(payout_id, action, created_at DESC);

-- 2. OPTIMIZE FREQUENTLY USED FUNCTIONS
-- Create a fast user profile lookup that includes all needed data
CREATE OR REPLACE FUNCTION get_user_profile_fast(_user_id UUID)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  user_type TEXT,
  subscription_tier TEXT,
  stripe_connect_account_id TEXT,
  available_contracts INTEGER,
  has_enhanced_kyc BOOLEAN,
  contract_count BIGINT,
  available_balance_usd BIGINT,
  last_login TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.display_name,
    p.user_type,
    p.subscription_tier,
    p.stripe_connect_account_id,
    p.available_contracts,
    COALESCE(p.enhanced_kyc_status = 'verified', false) as has_enhanced_kyc,
    (SELECT COUNT(*) FROM contracts WHERE client_id = _user_id OR freelancer_id = _user_id) as contract_count,
    COALESCE(wb.available, 0) as available_balance_usd,
    NOW() as last_login -- Simplified for now
  FROM profiles p
  LEFT JOIN wallet_balances wb ON wb.user_id = p.id AND wb.currency = 'USD'
  WHERE p.id = _user_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_profile_fast(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_profile_fast(UUID) TO service_role;

-- 3. OPTIMIZE CONTRACT DASHBOARD QUERIES
CREATE OR REPLACE FUNCTION get_user_dashboard_data(_user_id UUID)
RETURNS TABLE (
  active_contracts BIGINT,
  pending_payments BIGINT,
  total_earned NUMERIC,
  available_balance BIGINT,
  pending_balance BIGINT,
  recent_contracts jsonb,
  recent_payments jsonb,
  notifications_count BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH contract_stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE status IN ('active', 'in_progress', 'pending_completion')) as active_count,
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'title', title,
          'status', status,
          'total_amount', total_amount,
          'created_at', created_at
        ) ORDER BY created_at DESC
      ) FILTER (WHERE status IN ('active', 'in_progress', 'pending_completion')) as recent_contracts_data
    FROM contracts 
    WHERE client_id = _user_id OR freelancer_id = _user_id
  ),
  payment_stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE cp.status = 'pending') as pending_count,
      COALESCE(SUM(cp.amount) FILTER (WHERE cp.status = 'released' AND c.freelancer_id = _user_id), 0) as total_earnings,
      jsonb_agg(
        jsonb_build_object(
          'id', cp.id,
          'amount', cp.amount,
          'currency', cp.currency,
          'status', cp.status,
          'created_at', cp.created_at,
          'contract_title', c.title
        ) ORDER BY cp.created_at DESC
      ) FILTER (WHERE cp.created_at > NOW() - INTERVAL '30 days') as recent_payments_data
    FROM contract_payments cp
    JOIN contracts c ON c.id = cp.contract_id
    WHERE c.client_id = _user_id OR c.freelancer_id = _user_id
  ),
  balance_stats AS (
    SELECT 
      COALESCE(available, 0) as available_bal,
      COALESCE(pending, 0) as pending_bal
    FROM wallet_balances
    WHERE user_id = _user_id AND currency = 'USD'
  ),
  notification_stats AS (
    SELECT COUNT(*) as unread_count
    FROM notifications
    WHERE user_id = _user_id AND is_read = false
  )
  SELECT 
    COALESCE(cs.active_count, 0) as active_contracts,
    COALESCE(ps.pending_count, 0) as pending_payments,
    COALESCE(ps.total_earnings, 0) as total_earned,
    COALESCE(bs.available_bal, 0) as available_balance,
    COALESCE(bs.pending_bal, 0) as pending_balance,
    COALESCE(cs.recent_contracts_data, '[]'::jsonb) as recent_contracts,
    COALESCE(ps.recent_payments_data, '[]'::jsonb) as recent_payments,
    COALESCE(ns.unread_count, 0) as notifications_count
  FROM contract_stats cs
  CROSS JOIN payment_stats ps
  CROSS JOIN balance_stats bs
  CROSS JOIN notification_stats ns;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_dashboard_data(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_dashboard_data(UUID) TO service_role;

-- 4. OPTIMIZE WITHDRAWAL SYSTEM QUERIES
-- Create a fast method to get user's withdrawal methods with KYC status
CREATE OR REPLACE FUNCTION get_user_withdrawal_methods_fast(_user_id UUID)
RETURNS TABLE (
  id UUID,
  rail TEXT,
  label TEXT,
  currency TEXT,
  provider_name TEXT,
  country TEXT,
  icon TEXT,
  last_four TEXT,
  is_active BOOLEAN,
  kyc_required BOOLEAN,
  user_kyc_ok BOOLEAN,
  enhanced_kyc_ok BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wm.id,
    wm.rail,
    wm.label,
    wm.currency,
    wm.provider_name,
    wm.country,
    wm.icon,
    wm.last_four,
    wm.is_active,
    CASE 
      WHEN wm.rail = 'stripe' AND (wm.details->>'amount_limit')::numeric > 250000 THEN true
      WHEN wm.rail IN ('wise', 'payoneer') THEN true
      ELSE false
    END as kyc_required,
    COALESCE(p.stripe_connect_account_id IS NOT NULL, false) as user_kyc_ok,
    COALESCE(p.enhanced_kyc_status = 'verified', false) as enhanced_kyc_ok
  FROM withdrawal_methods wm
  JOIN profiles p ON p.id = wm.user_id
  WHERE wm.user_id = _user_id AND wm.is_active = true
  ORDER BY wm.created_at DESC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_withdrawal_methods_fast(UUID) TO authenticated;

-- 5. CREATE MATERIALIZED VIEW FOR HEAVY QUERIES
-- User earnings summary (refreshed periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_user_earnings_summary AS
SELECT 
  c.freelancer_id as user_id,
  COALESCE(cp.currency, c.currency, 'USD') as currency,
  COUNT(cp.id) as payment_count,
  SUM(cp.amount) as total_earned,
  AVG(cp.amount) as avg_payment,
  MAX(cp.completed_at) as latest_payment_date,
  MIN(cp.completed_at) as first_payment_date,
  COUNT(DISTINCT c.id) as contract_count
FROM contract_payments cp
JOIN contracts c ON c.id = cp.contract_id
WHERE cp.payment_type = 'release' 
  AND cp.status = 'released'
  AND cp.completed_at IS NOT NULL
GROUP BY c.freelancer_id, COALESCE(cp.currency, c.currency, 'USD');

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS mv_user_earnings_summary_user_currency 
ON mv_user_earnings_summary(user_id, currency);

-- Create function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_user_earnings_summary()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_earnings_summary;
$$;

-- Grant permissions
GRANT SELECT ON mv_user_earnings_summary TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_user_earnings_summary() TO service_role;

-- 6. OPTIMIZE PAYOUT PROCESSING QUERIES
-- Create index for job processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payout_jobs_status_retry_created 
ON payout_jobs(status, next_retry_at, created_at) 
WHERE status IN ('queued', 'retrying');

-- 7. QUERY OPTIMIZATION SETTINGS
-- Increase work_mem for complex queries (requires superuser, document for deployment)
-- ALTER SYSTEM SET work_mem = '256MB';
-- ALTER SYSTEM SET effective_cache_size = '4GB';
-- ALTER SYSTEM SET random_page_cost = 1.1; -- For SSD storage

-- 8. ADD PARTIAL INDEXES FOR COMMON FILTERS
-- Active contracts only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contracts_active 
ON contracts(client_id, freelancer_id, updated_at DESC) 
WHERE status IN ('active', 'in_progress', 'pending_completion');

-- Unread notifications only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_unread 
ON notifications(user_id, created_at DESC) 
WHERE is_read = false;

-- Pending payments only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contract_payments_pending 
ON contract_payments(user_id, contract_id, created_at DESC) 
WHERE status = 'pending';

-- Recent payouts only (last 90 days)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payouts_recent 
ON payouts(user_id, currency, created_at DESC) 
WHERE created_at > NOW() - INTERVAL '90 days';

-- 9. FUNCTION FOR BATCH OPERATIONS
-- Bulk update function for better performance
CREATE OR REPLACE FUNCTION bulk_update_payout_status(
  _payout_ids UUID[],
  _new_status TEXT,
  _updated_by TEXT DEFAULT 'system'
)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  update_count INTEGER;
BEGIN
  UPDATE payouts 
  SET 
    status = _new_status,
    updated_at = NOW()
  WHERE id = ANY(_payout_ids);
  
  GET DIAGNOSTICS update_count = ROW_COUNT;
  
  -- Log bulk operation
  INSERT INTO reconciliation_ledger (
    payout_id, rail, action, notes, created_by, request_payload
  ) VALUES (
    '', 'system', 'bulk_status_update', 
    'Bulk status update for ' || update_count || ' payouts',
    _updated_by,
    jsonb_build_object('payout_ids', _payout_ids, 'new_status', _new_status, 'count', update_count)
  );
  
  RETURN update_count;
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_update_payout_status(UUID[], TEXT, TEXT) TO service_role;

-- 10. PERFORMANCE MONITORING
-- Create a function to analyze query performance
CREATE OR REPLACE FUNCTION get_slow_queries()
RETURNS TABLE (
  query TEXT,
  calls BIGINT,
  total_time DOUBLE PRECISION,
  avg_time DOUBLE PRECISION
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT 
    query,
    calls,
    total_time,
    mean_time as avg_time
  FROM pg_stat_statements 
  WHERE mean_time > 100 -- queries taking more than 100ms on average
  ORDER BY mean_time DESC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION get_slow_queries() TO service_role;

-- Add comments for documentation
COMMENT ON FUNCTION get_user_profile_fast(UUID) IS 'Optimized single-query function to get all user profile data needed for dashboard rendering';
COMMENT ON FUNCTION get_user_dashboard_data(UUID) IS 'Single-query function to get all dashboard data in one call, reducing database round trips';
COMMENT ON FUNCTION get_user_withdrawal_methods_fast(UUID) IS 'Optimized function to get withdrawal methods with KYC status in single query';
COMMENT ON MATERIALIZED VIEW mv_user_earnings_summary IS 'Cached user earnings data to avoid expensive aggregations on each request';
COMMENT ON FUNCTION refresh_user_earnings_summary() IS 'Refresh cached earnings data - should be called via cron job every hour';