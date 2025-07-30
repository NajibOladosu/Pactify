-- Stripe Connect Escrow Schema Enhancement
-- This adds the necessary columns for Stripe Connect integration

-- Add Stripe Connect fields to escrow_payments table
ALTER TABLE public.escrow_payments 
ADD COLUMN IF NOT EXISTS freelancer_stripe_account VARCHAR(255),
ADD COLUMN IF NOT EXISTS payment_flow VARCHAR(50) DEFAULT 'separate_charges_transfers';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_escrow_payments_freelancer_stripe_account 
ON public.escrow_payments(freelancer_stripe_account);

CREATE INDEX IF NOT EXISTS idx_escrow_payments_payment_flow 
ON public.escrow_payments(payment_flow);

-- Add constraint to ensure valid payment flows
ALTER TABLE public.escrow_payments 
ADD CONSTRAINT IF NOT EXISTS escrow_payments_payment_flow_valid 
CHECK (payment_flow IN ('separate_charges_transfers', 'destination_charges', 'legacy'));

-- Add Stripe Connect account status fields to profiles table if they don't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS stripe_connect_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS stripe_connect_onboarded BOOLEAN DEFAULT FALSE;

-- Create function to check if freelancer is ready for escrow
CREATE OR REPLACE FUNCTION is_freelancer_escrow_ready(freelancer_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    profile_record RECORD;
BEGIN
    SELECT 
        stripe_connect_account_id,
        stripe_connect_enabled,
        stripe_connect_charges_enabled,
        stripe_connect_payouts_enabled
    INTO profile_record
    FROM profiles 
    WHERE id = freelancer_id;
    
    -- Check if freelancer has all requirements for escrow
    RETURN (
        profile_record.stripe_connect_account_id IS NOT NULL AND
        profile_record.stripe_connect_enabled = TRUE AND
        profile_record.stripe_connect_charges_enabled = TRUE AND
        profile_record.stripe_connect_payouts_enabled = TRUE
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to get escrow summary for a contract
CREATE OR REPLACE FUNCTION get_contract_escrow_summary(contract_id_param UUID)
RETURNS TABLE(
    total_escrowed DECIMAL(12,2),
    total_released DECIMAL(12,2),
    total_refunded DECIMAL(12,2),
    remaining_balance DECIMAL(12,2),
    payment_count INTEGER,
    last_activity TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(CASE WHEN ep.status IN ('funded', 'held') THEN ep.amount ELSE 0 END), 0) as total_escrowed,
        COALESCE(SUM(CASE WHEN ep.status = 'released' THEN ep.amount ELSE 0 END), 0) as total_released,
        COALESCE(SUM(CASE WHEN ep.status = 'refunded' THEN ep.amount ELSE 0 END), 0) as total_refunded,
        COALESCE(SUM(CASE WHEN ep.status IN ('funded', 'held') THEN ep.amount ELSE 0 END), 0) as remaining_balance,
        COUNT(*)::INTEGER as payment_count,
        MAX(ep.updated_at) as last_activity
    FROM escrow_payments ep
    WHERE ep.contract_id = contract_id_param;
END;
$$ LANGUAGE plpgsql;

-- Create RLS policies for escrow_payments table
ALTER TABLE escrow_payments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see escrow payments for contracts they're part of
CREATE POLICY "Users can view escrow payments for their contracts" ON escrow_payments
    FOR SELECT USING (
        contract_id IN (
            SELECT c.id FROM contracts c
            JOIN contract_parties cp ON c.id = cp.contract_id
            WHERE cp.user_id = auth.uid()
        )
    );

-- Policy: Only clients can create escrow payments (fund contracts)
CREATE POLICY "Clients can create escrow payments" ON escrow_payments
    FOR INSERT WITH CHECK (
        contract_id IN (
            SELECT c.id FROM contracts c
            JOIN contract_parties cp ON c.id = cp.contract_id
            WHERE cp.user_id = auth.uid() AND cp.role = 'client'
        )
    );

-- Policy: System can update escrow payments (webhooks)
CREATE POLICY "System can update escrow payments" ON escrow_payments
    FOR UPDATE USING (true); -- This will be restricted by service role usage

-- Create notification trigger for escrow events
CREATE OR REPLACE FUNCTION notify_escrow_event()
RETURNS TRIGGER AS $$
DECLARE
    contract_record RECORD;
    client_id UUID;
    freelancer_id UUID;
BEGIN
    -- Get contract and party information
    SELECT c.*, 
           cp_client.user_id as client_user_id,
           cp_freelancer.user_id as freelancer_user_id
    INTO contract_record, client_id, freelancer_id
    FROM contracts c
    LEFT JOIN contract_parties cp_client ON c.id = cp_client.contract_id AND cp_client.role = 'client'
    LEFT JOIN contract_parties cp_freelancer ON c.id = cp_freelancer.contract_id AND cp_freelancer.role = 'freelancer'
    WHERE c.id = NEW.contract_id;

    -- Create notifications based on the status change
    IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
        CASE NEW.status
            WHEN 'funded' THEN
                -- Notify freelancer that contract is funded
                INSERT INTO contract_notifications (
                    contract_id, user_id, notification_type, title, message, metadata
                ) VALUES (
                    NEW.contract_id,
                    freelancer_id,
                    'escrow_funded',
                    'Contract Funded',
                    'Your contract has been funded and you can begin work.',
                    jsonb_build_object(
                        'escrow_payment_id', NEW.id,
                        'amount', NEW.amount,
                        'payment_flow', NEW.payment_flow
                    )
                );
                
            WHEN 'released' THEN
                -- Notify freelancer that payment was released
                INSERT INTO contract_notifications (
                    contract_id, user_id, notification_type, title, message, metadata
                ) VALUES (
                    NEW.contract_id,
                    freelancer_id,
                    'payment_released',
                    'Payment Released',
                    format('Payment of $%.2f has been released to your account.', NEW.amount),
                    jsonb_build_object(
                        'escrow_payment_id', NEW.id,
                        'amount', NEW.amount,
                        'transfer_id', NEW.stripe_transfer_id
                    )
                );
                
            WHEN 'refunded' THEN
                -- Notify client that refund was processed
                INSERT INTO contract_notifications (
                    contract_id, user_id, notification_type, title, message, metadata
                ) VALUES (
                    NEW.contract_id,
                    client_id,
                    'payment_refunded',
                    'Payment Refunded',
                    format('Refund of $%.2f has been processed.', NEW.amount),
                    jsonb_build_object(
                        'escrow_payment_id', NEW.id,
                        'amount', NEW.amount
                    )
                );
        END CASE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for escrow payment status changes
DROP TRIGGER IF EXISTS escrow_payment_status_change ON escrow_payments;
CREATE TRIGGER escrow_payment_status_change
    AFTER UPDATE ON escrow_payments
    FOR EACH ROW
    EXECUTE FUNCTION notify_escrow_event();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_escrow_payments_contract_status 
ON escrow_payments(contract_id, status);

CREATE INDEX IF NOT EXISTS idx_escrow_payments_stripe_payment_intent 
ON escrow_payments(stripe_payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_escrow_payments_stripe_transfer 
ON escrow_payments(stripe_transfer_id);

-- Comment on the table to document the Stripe Connect integration
COMMENT ON TABLE escrow_payments IS 'Escrow payments using Stripe Connect separate charges and transfers model. Funds are collected on platform account then transferred to freelancer Connect accounts when released.';

COMMENT ON COLUMN escrow_payments.freelancer_stripe_account IS 'Stripe Connect account ID of the freelancer who will receive the payment';
COMMENT ON COLUMN escrow_payments.payment_flow IS 'The Stripe Connect payment flow used: separate_charges_transfers, destination_charges, or legacy';
COMMENT ON COLUMN escrow_payments.stripe_transfer_id IS 'Stripe Transfer ID when payment is released to freelancer';