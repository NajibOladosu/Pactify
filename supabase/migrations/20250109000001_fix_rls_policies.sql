-- Fix RLS policies for withdrawal_methods table
-- The issue is that the policy might not be properly configured for authenticated users

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can manage their own withdrawal methods" ON withdrawal_methods;
DROP POLICY IF EXISTS "withdrawal_methods_user_policy" ON withdrawal_methods;

-- Create comprehensive RLS policies for withdrawal_methods
CREATE POLICY "withdrawal_methods_select_policy" ON withdrawal_methods
    FOR SELECT 
    USING (profile_id = auth.uid());

CREATE POLICY "withdrawal_methods_insert_policy" ON withdrawal_methods
    FOR INSERT 
    WITH CHECK (profile_id = auth.uid());

CREATE POLICY "withdrawal_methods_update_policy" ON withdrawal_methods
    FOR UPDATE 
    USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());

CREATE POLICY "withdrawal_methods_delete_policy" ON withdrawal_methods
    FOR DELETE 
    USING (profile_id = auth.uid());

-- Also fix policies for other related tables
-- KYC verifications table
DROP POLICY IF EXISTS "Users can manage their own kyc verifications" ON kyc_verifications;

CREATE POLICY "kyc_verifications_select_policy" ON kyc_verifications
    FOR SELECT 
    USING (profile_id = auth.uid());

CREATE POLICY "kyc_verifications_insert_policy" ON kyc_verifications
    FOR INSERT 
    WITH CHECK (profile_id = auth.uid());

CREATE POLICY "kyc_verifications_update_policy" ON kyc_verifications
    FOR UPDATE 
    USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());

-- Payout fees table - should be readable by all authenticated users
DROP POLICY IF EXISTS "Payout fees are viewable by all users" ON payout_fees;

CREATE POLICY "payout_fees_select_policy" ON payout_fees
    FOR SELECT 
    USING (auth.role() = 'authenticated');

-- Ensure RLS is enabled on all tables
ALTER TABLE withdrawal_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_fees ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON withdrawal_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE ON kyc_verifications TO authenticated;
GRANT SELECT ON payout_fees TO authenticated;