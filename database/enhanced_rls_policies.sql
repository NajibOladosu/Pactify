-- Row Level Security Policies for Enhanced Contract Workflow
-- This file contains RLS policies for all new tables created in the enhanced schema

-- Enable RLS on all new tables
ALTER TABLE public.contract_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_notifications ENABLE ROW LEVEL SECURITY;

-- Contract Milestones Policies
-- Users can view milestones for contracts they're involved in
CREATE POLICY "Users can view contract milestones for their contracts" ON public.contract_milestones
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL AND (
            EXISTS (
                SELECT 1 FROM public.contracts c
                WHERE c.id = contract_milestones.contract_id
                AND (c.creator_id = auth.uid() OR c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
            )
        )
    );

-- Contract creators can create milestones
CREATE POLICY "Contract creators can create milestones" ON public.contract_milestones
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.contracts c
            WHERE c.id = contract_milestones.contract_id
            AND c.creator_id = auth.uid()
            AND c.status IN ('draft', 'pending_signatures')
        )
    );

-- Contract creators and freelancers can update milestones under certain conditions
CREATE POLICY "Authorized users can update milestones" ON public.contract_milestones
    FOR UPDATE
    USING (
        auth.uid() IS NOT NULL AND (
            -- Contract creator can update during draft/pending phases
            EXISTS (
                SELECT 1 FROM public.contracts c
                WHERE c.id = contract_milestones.contract_id
                AND c.creator_id = auth.uid()
                AND c.status IN ('draft', 'pending_signatures', 'active')
            )
            -- Freelancer can update status during active phase
            OR EXISTS (
                SELECT 1 FROM public.contracts c
                WHERE c.id = contract_milestones.contract_id
                AND c.freelancer_id = auth.uid()
                AND c.status = 'active'
            )
        )
    );

-- Escrow Payments Policies
-- Users can view escrow payments for their contracts
CREATE POLICY "Users can view escrow payments for their contracts" ON public.escrow_payments
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL AND (
            EXISTS (
                SELECT 1 FROM public.contracts c
                WHERE c.id = escrow_payments.contract_id
                AND (c.creator_id = auth.uid() OR c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
            )
        )
    );

-- Only authenticated users can create escrow payments (via function)
CREATE POLICY "Authenticated users can create escrow payments" ON public.escrow_payments
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.contracts c
            WHERE c.id = escrow_payments.contract_id
            AND (c.client_id = auth.uid() OR c.creator_id = auth.uid())
        )
    );

-- System can update escrow payment status (via functions)
CREATE POLICY "System can update escrow payments" ON public.escrow_payments
    FOR UPDATE
    USING (
        -- Allow updates through database functions only
        current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
        OR (
            auth.uid() IS NOT NULL AND
            EXISTS (
                SELECT 1 FROM public.contracts c
                WHERE c.id = escrow_payments.contract_id
                AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
            )
        )
    );

-- KYC Verifications Policies
-- Users can only view their own KYC verification
CREATE POLICY "Users can view their own KYC verification" ON public.kyc_verifications
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL AND profile_id = auth.uid()
    );

-- Users can only insert their own KYC verification
CREATE POLICY "Users can create their own KYC verification" ON public.kyc_verifications
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL AND profile_id = auth.uid()
    );

-- Users can update their own KYC verification (before approval)
CREATE POLICY "Users can update their own KYC verification" ON public.kyc_verifications
    FOR UPDATE
    USING (
        auth.uid() IS NOT NULL AND 
        profile_id = auth.uid() AND
        status IN ('not_started', 'in_progress', 'requires_action')
    );

-- Contract Deliverables Policies
-- Users can view deliverables for contracts they're involved in
CREATE POLICY "Users can view deliverables for their contracts" ON public.contract_deliverables
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL AND (
            EXISTS (
                SELECT 1 FROM public.contracts c
                WHERE c.id = contract_deliverables.contract_id
                AND (c.creator_id = auth.uid() OR c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
            )
        )
    );

-- Freelancers can upload deliverables to their contracts
CREATE POLICY "Freelancers can upload deliverables" ON public.contract_deliverables
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL AND
        uploaded_by = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.contracts c
            WHERE c.id = contract_deliverables.contract_id
            AND c.freelancer_id = auth.uid()
            AND c.status IN ('active', 'pending_delivery')
        )
    );

-- Uploaders can update their own deliverables
CREATE POLICY "Users can update their own deliverables" ON public.contract_deliverables
    FOR UPDATE
    USING (
        auth.uid() IS NOT NULL AND uploaded_by = auth.uid()
    );

-- Contract Reviews Policies
-- Users can view reviews for contracts they're involved in
CREATE POLICY "Users can view reviews for their contracts" ON public.contract_reviews
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL AND (
            EXISTS (
                SELECT 1 FROM public.contracts c
                WHERE c.id = contract_reviews.contract_id
                AND (c.creator_id = auth.uid() OR c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
            )
        )
    );

-- Clients can create reviews for their contracts
CREATE POLICY "Clients can create reviews" ON public.contract_reviews
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL AND
        reviewer_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.contracts c
            WHERE c.id = contract_reviews.contract_id
            AND c.client_id = auth.uid()
            AND c.status IN ('in_review', 'pending_delivery')
        )
    );

-- Reviewers can update their own reviews (within time limit)
CREATE POLICY "Reviewers can update their own reviews" ON public.contract_reviews
    FOR UPDATE
    USING (
        auth.uid() IS NOT NULL AND 
        reviewer_id = auth.uid() AND
        created_at > NOW() - INTERVAL '24 hours'
    );

-- Contract Disputes Policies
-- Users can view disputes for contracts they're involved in
CREATE POLICY "Users can view disputes for their contracts" ON public.contract_disputes
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL AND (
            EXISTS (
                SELECT 1 FROM public.contracts c
                WHERE c.id = contract_disputes.contract_id
                AND (c.creator_id = auth.uid() OR c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
            )
        )
    );

-- Contract parties can initiate disputes
CREATE POLICY "Contract parties can initiate disputes" ON public.contract_disputes
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL AND
        initiated_by = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.contracts c
            WHERE c.id = contract_disputes.contract_id
            AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
        )
    );

-- Only system/admin can update disputes (resolution)
CREATE POLICY "System can update disputes" ON public.contract_disputes
    FOR UPDATE
    USING (
        current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    );

-- Contract Notifications Policies
-- Users can only view their own notifications
CREATE POLICY "Users can view their own notifications" ON public.contract_notifications
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL AND user_id = auth.uid()
    );

-- System can create notifications
CREATE POLICY "System can create notifications" ON public.contract_notifications
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.contracts c
            WHERE c.id = contract_notifications.contract_id
            AND (c.creator_id = auth.uid() OR c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
        )
    );

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications" ON public.contract_notifications
    FOR UPDATE
    USING (
        auth.uid() IS NOT NULL AND user_id = auth.uid()
    );

-- Additional security: Prevent unauthorized deletion
-- Only allow deletions through specific conditions

-- Milestones can only be deleted by creators during draft phase
CREATE POLICY "Creators can delete milestones in draft" ON public.contract_milestones
    FOR DELETE
    USING (
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.contracts c
            WHERE c.id = contract_milestones.contract_id
            AND c.creator_id = auth.uid()
            AND c.status = 'draft'
        )
    );

-- Deliverables can be deleted by uploader within 1 hour
CREATE POLICY "Uploaders can delete recent deliverables" ON public.contract_deliverables
    FOR DELETE
    USING (
        auth.uid() IS NOT NULL AND 
        uploaded_by = auth.uid() AND
        created_at > NOW() - INTERVAL '1 hour'
    );

-- Notifications can be deleted by owner
CREATE POLICY "Users can delete their own notifications" ON public.contract_notifications
    FOR DELETE
    USING (
        auth.uid() IS NOT NULL AND user_id = auth.uid()
    );

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.contract_milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.escrow_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.kyc_verifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_deliverables TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.contract_reviews TO authenticated;
GRANT SELECT, INSERT ON public.contract_disputes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_notifications TO authenticated;

-- Grant service role full access for system operations
GRANT ALL ON public.contract_milestones TO service_role;
GRANT ALL ON public.escrow_payments TO service_role;
GRANT ALL ON public.kyc_verifications TO service_role;
GRANT ALL ON public.contract_deliverables TO service_role;
GRANT ALL ON public.contract_reviews TO service_role;
GRANT ALL ON public.contract_disputes TO service_role;
GRANT ALL ON public.contract_notifications TO service_role;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contract_milestones_contract_id ON public.contract_milestones(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_status ON public.contract_milestones(status);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_due_date ON public.contract_milestones(due_date);

CREATE INDEX IF NOT EXISTS idx_escrow_payments_contract_id ON public.escrow_payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_escrow_payments_status ON public.escrow_payments(status);
CREATE INDEX IF NOT EXISTS idx_escrow_payments_milestone_id ON public.escrow_payments(milestone_id);

CREATE INDEX IF NOT EXISTS idx_kyc_verifications_profile_id ON public.kyc_verifications(profile_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_status ON public.kyc_verifications(status);

CREATE INDEX IF NOT EXISTS idx_contract_deliverables_contract_id ON public.contract_deliverables(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_deliverables_milestone_id ON public.contract_deliverables(milestone_id);
CREATE INDEX IF NOT EXISTS idx_contract_deliverables_uploaded_by ON public.contract_deliverables(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_contract_reviews_contract_id ON public.contract_reviews(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_reviews_milestone_id ON public.contract_reviews(milestone_id);
CREATE INDEX IF NOT EXISTS idx_contract_reviews_reviewer_id ON public.contract_reviews(reviewer_id);

CREATE INDEX IF NOT EXISTS idx_contract_disputes_contract_id ON public.contract_disputes(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_disputes_status ON public.contract_disputes(status);

CREATE INDEX IF NOT EXISTS idx_contract_notifications_user_id ON public.contract_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_contract_notifications_contract_id ON public.contract_notifications(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_notifications_is_read ON public.contract_notifications(is_read);