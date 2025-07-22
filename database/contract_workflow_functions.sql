-- Contract Workflow Functions and Triggers
-- This file contains all the database functions and triggers for the enhanced contract workflow

-- Function to validate contract status transitions
CREATE OR REPLACE FUNCTION public.validate_contract_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    valid_transitions TEXT[];
BEGIN
    -- Define valid status transitions
    CASE OLD.status
        WHEN 'draft' THEN
            valid_transitions := ARRAY['pending_signatures', 'cancelled'];
        WHEN 'pending_signatures' THEN
            valid_transitions := ARRAY['pending_funding', 'draft', 'cancelled'];
        WHEN 'pending_funding' THEN
            valid_transitions := ARRAY['active', 'cancelled'];
        WHEN 'active' THEN
            valid_transitions := ARRAY['pending_delivery', 'cancelled', 'disputed'];
        WHEN 'pending_delivery' THEN
            valid_transitions := ARRAY['in_review', 'active', 'disputed'];
        WHEN 'in_review' THEN
            valid_transitions := ARRAY['revision_requested', 'pending_completion', 'disputed'];
        WHEN 'revision_requested' THEN
            valid_transitions := ARRAY['active', 'disputed'];
        WHEN 'pending_completion' THEN
            valid_transitions := ARRAY['completed', 'disputed'];
        WHEN 'completed' THEN
            valid_transitions := ARRAY[]::TEXT[]; -- Final state
        WHEN 'cancelled' THEN
            valid_transitions := ARRAY[]::TEXT[]; -- Final state
        WHEN 'disputed' THEN
            valid_transitions := ARRAY['active', 'cancelled']; -- Can be resolved
    END CASE;

    -- Check if the new status is valid
    IF NOT (NEW.status = ANY(valid_transitions)) THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-progress contract status when both parties sign
CREATE OR REPLACE FUNCTION public.check_contract_signatures()
RETURNS TRIGGER AS $$
DECLARE
    contract_record RECORD;
BEGIN
    -- Get the contract record
    SELECT * INTO contract_record 
    FROM public.contracts 
    WHERE id = NEW.contract_id;

    -- If both parties have signed, update status to pending_funding
    IF contract_record.client_signed_at IS NOT NULL 
       AND contract_record.freelancer_signed_at IS NOT NULL 
       AND contract_record.status = 'pending_signatures' THEN
        
        UPDATE public.contracts 
        SET status = 'pending_funding', updated_at = NOW()
        WHERE id = NEW.contract_id;

        -- Log the activity
        INSERT INTO public.contract_activities (
            contract_id, user_id, activity_type, description, metadata
        ) VALUES (
            NEW.contract_id,
            NEW.user_id,
            'contract_fully_signed',
            'Contract fully signed by both parties',
            json_build_object('timestamp', NOW())
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate platform fees based on subscription tier
CREATE OR REPLACE FUNCTION public.calculate_platform_fee(
    user_id UUID,
    amount DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
    subscription_tier TEXT;
    fee_rate DECIMAL;
BEGIN
    -- Get user's subscription tier
    SELECT p.subscription_tier INTO subscription_tier
    FROM public.profiles p
    WHERE p.id = user_id;

    -- Set fee rate based on subscription tier
    CASE subscription_tier
        WHEN 'free' THEN fee_rate := 0.10; -- 10%
        WHEN 'professional' THEN fee_rate := 0.075; -- 7.5%
        WHEN 'business' THEN fee_rate := 0.05; -- 5%
        ELSE fee_rate := 0.10; -- Default to free tier
    END CASE;

    RETURN amount * fee_rate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create escrow payment record
CREATE OR REPLACE FUNCTION public.create_escrow_payment(
    p_contract_id UUID,
    p_milestone_id UUID DEFAULT NULL,
    p_amount DECIMAL,
    p_stripe_payment_intent_id TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    escrow_id UUID;
    platform_fee DECIMAL;
    stripe_fee DECIMAL;
    total_charged DECIMAL;
    creator_id UUID;
BEGIN
    -- Get contract creator for fee calculation
    SELECT c.creator_id INTO creator_id
    FROM public.contracts c
    WHERE c.id = p_contract_id;

    -- Calculate fees
    platform_fee := public.calculate_platform_fee(creator_id, p_amount);
    stripe_fee := (p_amount * 0.029) + 0.30; -- Stripe's standard fee
    total_charged := p_amount + platform_fee + stripe_fee;

    -- Create escrow record
    INSERT INTO public.escrow_payments (
        contract_id,
        milestone_id,
        amount,
        platform_fee,
        stripe_fee,
        total_charged,
        stripe_payment_intent_id,
        status
    ) VALUES (
        p_contract_id,
        p_milestone_id,
        p_amount,
        platform_fee,
        stripe_fee,
        total_charged,
        p_stripe_payment_intent_id,
        'pending'
    ) RETURNING id INTO escrow_id;

    RETURN escrow_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check KYC requirements
CREATE OR REPLACE FUNCTION public.check_kyc_requirements(
    p_user_id UUID,
    p_amount DECIMAL
) RETURNS TABLE (
    is_compliant BOOLEAN,
    required_level TEXT,
    current_level TEXT,
    verification_url TEXT
) AS $$
DECLARE
    user_kyc RECORD;
    required_verification_level TEXT;
BEGIN
    -- Determine required verification level based on amount
    IF p_amount <= 500 THEN
        required_verification_level := 'basic';
    ELSIF p_amount <= 5000 THEN
        required_verification_level := 'enhanced';
    ELSE
        required_verification_level := 'business';
    END IF;

    -- Get user's current KYC status
    SELECT * INTO user_kyc
    FROM public.kyc_verifications
    WHERE profile_id = p_user_id;

    -- If no KYC record exists, create one
    IF user_kyc IS NULL THEN
        INSERT INTO public.kyc_verifications (profile_id, verification_level)
        VALUES (p_user_id, 'basic')
        RETURNING * INTO user_kyc;
    END IF;

    -- Check compliance
    RETURN QUERY SELECT
        CASE 
            WHEN user_kyc.status = 'approved' AND 
                 (user_kyc.verification_level = required_verification_level OR
                  (user_kyc.verification_level = 'enhanced' AND required_verification_level = 'basic') OR
                  (user_kyc.verification_level = 'business' AND required_verification_level IN ('basic', 'enhanced')))
            THEN TRUE
            ELSE FALSE
        END as is_compliant,
        required_verification_level as required_level,
        COALESCE(user_kyc.verification_level, 'basic') as current_level,
        '/dashboard/kyc/verify' as verification_url;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-complete milestone when all deliverables are approved
CREATE OR REPLACE FUNCTION public.check_milestone_completion()
RETURNS TRIGGER AS $$
DECLARE
    milestone_record RECORD;
    pending_reviews INTEGER;
BEGIN
    -- Only proceed if this is an approval review
    IF NEW.review_type = 'approval' THEN
        -- Get milestone information
        SELECT * INTO milestone_record
        FROM public.contract_milestones
        WHERE id = NEW.milestone_id;

        -- Check if there are any pending reviews for this milestone
        SELECT COUNT(*) INTO pending_reviews
        FROM public.contract_deliverables cd
        LEFT JOIN public.contract_reviews cr ON cd.id = cr.milestone_id AND cr.review_type = 'approval'
        WHERE cd.milestone_id = NEW.milestone_id
        AND cd.is_final = TRUE
        AND cr.id IS NULL;

        -- If no pending reviews and milestone is submitted, mark as approved
        IF pending_reviews = 0 AND milestone_record.status = 'submitted' THEN
            UPDATE public.contract_milestones
            SET status = 'approved', updated_at = NOW()
            WHERE id = NEW.milestone_id;

            -- Log activity
            INSERT INTO public.contract_activities (
                contract_id, user_id, activity_type, description, metadata
            ) VALUES (
                milestone_record.contract_id,
                NEW.reviewer_id,
                'milestone_approved',
                'Milestone "' || milestone_record.title || '" approved',
                json_build_object('milestone_id', NEW.milestone_id)
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to create notifications
CREATE OR REPLACE FUNCTION public.create_contract_notification(
    p_contract_id UUID,
    p_user_id UUID,
    p_notification_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_action_url TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO public.contract_notifications (
        contract_id,
        user_id,
        notification_type,
        title,
        message,
        action_url,
        metadata
    ) VALUES (
        p_contract_id,
        p_user_id,
        p_notification_type,
        p_title,
        p_message,
        p_action_url,
        p_metadata
    ) RETURNING id INTO notification_id;

    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user contracts with enhanced details
CREATE OR REPLACE FUNCTION public.get_user_contracts(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    contract_id UUID,
    title TEXT,
    description TEXT,
    total_amount DECIMAL,
    currency TEXT,
    status TEXT,
    type TEXT,
    client_id UUID,
    freelancer_id UUID,
    creator_id UUID,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    locked BOOLEAN,
    milestones_count INTEGER,
    completed_milestones INTEGER,
    pending_amount DECIMAL,
    next_due_date DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.id as contract_id,
        c.title,
        c.description,
        c.total_amount,
        c.currency,
        c.status::TEXT,
        c.type::TEXT,
        c.client_id,
        c.freelancer_id,
        c.creator_id,
        c.created_at,
        c.updated_at,
        c.locked,
        COALESCE(milestone_stats.total_milestones, 0)::INTEGER as milestones_count,
        COALESCE(milestone_stats.completed_milestones, 0)::INTEGER as completed_milestones,
        COALESCE(escrow_stats.pending_amount, 0) as pending_amount,
        milestone_stats.next_due_date
    FROM public.contracts c
    LEFT JOIN (
        SELECT 
            cm.contract_id,
            COUNT(*) as total_milestones,
            COUNT(CASE WHEN cm.status = 'completed' THEN 1 END) as completed_milestones,
            MIN(CASE WHEN cm.status IN ('pending', 'in_progress') THEN cm.due_date END) as next_due_date
        FROM public.contract_milestones cm
        GROUP BY cm.contract_id
    ) milestone_stats ON c.id = milestone_stats.contract_id
    LEFT JOIN (
        SELECT 
            ep.contract_id,
            SUM(CASE WHEN ep.status = 'held' THEN ep.amount ELSE 0 END) as pending_amount
        FROM public.escrow_payments ep
        GROUP BY ep.contract_id
    ) escrow_stats ON c.id = escrow_stats.contract_id
    WHERE c.creator_id = p_user_id 
       OR c.client_id = p_user_id 
       OR c.freelancer_id = p_user_id
    ORDER BY c.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
DROP TRIGGER IF EXISTS validate_contract_status_transition_trigger ON public.contracts;
CREATE TRIGGER validate_contract_status_transition_trigger
    BEFORE UPDATE OF status ON public.contracts
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.validate_contract_status_transition();

DROP TRIGGER IF EXISTS check_contract_signatures_trigger ON public.contract_signatures;
CREATE TRIGGER check_contract_signatures_trigger
    AFTER INSERT ON public.contract_signatures
    FOR EACH ROW
    EXECUTE FUNCTION public.check_contract_signatures();

DROP TRIGGER IF EXISTS check_milestone_completion_trigger ON public.contract_reviews;
CREATE TRIGGER check_milestone_completion_trigger
    AFTER INSERT ON public.contract_reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.check_milestone_completion();

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION public.calculate_platform_fee(UUID, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_escrow_payment(UUID, UUID, DECIMAL, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_kyc_requirements(UUID, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_contract_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_contracts(UUID) TO authenticated;

-- Grant service role permissions
GRANT EXECUTE ON FUNCTION public.calculate_platform_fee(UUID, DECIMAL) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_escrow_payment(UUID, UUID, DECIMAL, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_kyc_requirements(UUID, DECIMAL) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_contract_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_contracts(UUID) TO service_role;