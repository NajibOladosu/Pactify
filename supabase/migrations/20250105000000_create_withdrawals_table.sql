-- Create withdrawals table to track payout history
CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  connected_account_id UUID REFERENCES connected_accounts(id) ON DELETE CASCADE NOT NULL,
  stripe_payout_id TEXT NOT NULL UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'processing',
  failure_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expected_arrival_date TIMESTAMP WITH TIME ZONE,
  arrived_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT withdrawals_amount_positive CHECK (amount > 0),
  CONSTRAINT withdrawals_status_valid CHECK (status IN ('processing', 'paid', 'failed', 'canceled'))
);

-- Add total_withdrawn and last_withdrawal_at to connected_accounts if not exists
ALTER TABLE connected_accounts 
ADD COLUMN IF NOT EXISTS total_withdrawn DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_withdrawal_at TIMESTAMP WITH TIME ZONE;

-- Create indexes
CREATE INDEX IF NOT EXISTS withdrawals_user_id_idx ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS withdrawals_connected_account_id_idx ON withdrawals(connected_account_id);
CREATE INDEX IF NOT EXISTS withdrawals_status_idx ON withdrawals(status);
CREATE INDEX IF NOT EXISTS withdrawals_created_at_idx ON withdrawals(created_at DESC);

-- Enable RLS
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

-- RLS policies for withdrawals
CREATE POLICY "Users can view own withdrawals" ON withdrawals
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own withdrawals" ON withdrawals
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own withdrawals" ON withdrawals
  FOR UPDATE USING (user_id = auth.uid());

-- Grant permissions
GRANT ALL ON withdrawals TO authenticated;
GRANT ALL ON withdrawals TO service_role;

-- Create function to update withdrawal status
CREATE OR REPLACE FUNCTION update_withdrawal_status()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  
  -- If status changed to paid, set arrived_at timestamp
  IF OLD.status != 'paid' AND NEW.status = 'paid' THEN
    NEW.arrived_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for withdrawal updates
DROP TRIGGER IF EXISTS update_withdrawal_status_trigger ON withdrawals;
CREATE TRIGGER update_withdrawal_status_trigger
  BEFORE UPDATE ON withdrawals
  FOR EACH ROW EXECUTE FUNCTION update_withdrawal_status();

-- Create function to get user withdrawal stats
CREATE OR REPLACE FUNCTION get_user_withdrawal_stats(user_uuid UUID)
RETURNS TABLE(
  total_withdrawn DECIMAL,
  pending_withdrawals DECIMAL,
  successful_withdrawals INTEGER,
  failed_withdrawals INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE WHEN w.status = 'paid' THEN w.amount ELSE 0 END), 0) as total_withdrawn,
    COALESCE(SUM(CASE WHEN w.status = 'processing' THEN w.amount ELSE 0 END), 0) as pending_withdrawals,
    COUNT(CASE WHEN w.status = 'paid' THEN 1 END)::INTEGER as successful_withdrawals,
    COUNT(CASE WHEN w.status = 'failed' THEN 1 END)::INTEGER as failed_withdrawals
  FROM withdrawals w
  WHERE w.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on the function
GRANT EXECUTE ON FUNCTION get_user_withdrawal_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_withdrawal_stats(UUID) TO service_role;