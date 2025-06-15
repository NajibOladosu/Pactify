-- Enhanced Contract Workflow Schema
-- This migration adds the necessary tables and enums for the complete contract workflow

-- Create enhanced enum types
DO $$ BEGIN
    -- Enhanced contract status enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_status_enhanced') THEN
        CREATE TYPE contract_status_enhanced AS ENUM (
            'draft',              -- Being created/negotiated
            'pending_signatures', -- Waiting for both parties to sign
            'pending_funding',    -- Signed, waiting for client to fund escrow
            'active',             -- Funded and work in progress
            'pending_delivery',   -- Freelancer submitted deliverables
            'in_review',          -- Client reviewing deliverables
            'revision_requested', -- Client requested changes
            'pending_completion', -- Deliverables approved, final review
            'completed',          -- Successfully completed
            'cancelled',          -- Cancelled before completion
            'disputed'            -- In dispute resolution
        );
    END IF;

    -- Enhanced milestone status enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'milestone_status_enhanced') THEN
        CREATE TYPE milestone_status_enhanced AS ENUM (
            'pending',            -- Not yet started
            'in_progress',        -- Being worked on
            'submitted',          -- Deliverables submitted
            'approved',           -- Client approved
            'revision_requested', -- Client requested changes
            'completed'           -- Milestone completed and paid
        );
    END IF;

    -- Enhanced payment status enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_enhanced') THEN
        CREATE TYPE payment_status_enhanced AS ENUM (
            'pending',   -- Payment intent created
            'funded',    -- Client funded escrow
            'held',      -- Funds held in escrow
            'released',  -- Released to freelancer
            'refunded',  -- Refunded to client
            'disputed'   -- In dispute
        );
    END IF;

    -- KYC status enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_status_enhanced') THEN
        CREATE TYPE kyc_status_enhanced AS ENUM (
            'not_started',
            'in_progress',
            'pending_review',
            'approved',
            'rejected',
            'requires_action'
        );
    END IF;
END $$;

-- Add new columns to existing contracts table
ALTER TABLE public.contracts 
ADD COLUMN IF NOT EXISTS client_signed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS freelancer_signed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;

-- Create contract_milestones table
CREATE TABLE IF NOT EXISTS public.contract_milestones (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    amount DECIMAL(12,2) NOT NULL,
    due_date DATE,
    status milestone_status_enhanced DEFAULT 'pending',
    order_index INTEGER NOT NULL,
    deliverables TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT contract_milestones_amount_positive CHECK (amount > 0),
    CONSTRAINT contract_milestones_order_positive CHECK (order_index > 0)
);

-- Create escrow_payments table
CREATE TABLE IF NOT EXISTS public.escrow_payments (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    milestone_id UUID REFERENCES public.contract_milestones(id) ON DELETE SET NULL,
    amount DECIMAL(12,2) NOT NULL,
    platform_fee DECIMAL(12,2) NOT NULL,
    stripe_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_charged DECIMAL(12,2) NOT NULL,
    stripe_payment_intent_id VARCHAR(255),
    stripe_transfer_id VARCHAR(255),
    status payment_status_enhanced DEFAULT 'pending',
    funded_at TIMESTAMP WITH TIME ZONE,
    released_at TIMESTAMP WITH TIME ZONE,
    refunded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT escrow_payments_amount_positive CHECK (amount > 0),
    CONSTRAINT escrow_payments_platform_fee_non_negative CHECK (platform_fee >= 0),
    CONSTRAINT escrow_payments_stripe_fee_non_negative CHECK (stripe_fee >= 0),
    CONSTRAINT escrow_payments_total_charged_positive CHECK (total_charged > 0)
);

-- Create enhanced KYC verification table
CREATE TABLE IF NOT EXISTS public.kyc_verifications (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status kyc_status_enhanced DEFAULT 'not_started',
    verification_level VARCHAR(20) DEFAULT 'basic',
    stripe_account_id VARCHAR(255),
    submitted_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    required_documents TEXT[],
    submitted_documents JSONB DEFAULT '{}',
    verification_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT kyc_verifications_verification_level_valid 
        CHECK (verification_level IN ('basic', 'enhanced', 'business')),
    CONSTRAINT kyc_verifications_unique_profile UNIQUE (profile_id)
);

-- Create contract_deliverables table for file management
CREATE TABLE IF NOT EXISTS public.contract_deliverables (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    milestone_id UUID REFERENCES public.contract_milestones(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_url TEXT NOT NULL,
    description TEXT,
    version INTEGER DEFAULT 1,
    is_final BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT contract_deliverables_file_size_positive CHECK (file_size > 0),
    CONSTRAINT contract_deliverables_version_positive CHECK (version > 0)
);

-- Create contract_reviews table for approval workflow
CREATE TABLE IF NOT EXISTS public.contract_reviews (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    milestone_id UUID REFERENCES public.contract_milestones(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id),
    review_type VARCHAR(20) NOT NULL CHECK (review_type IN ('approval', 'revision', 'rejection')),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    feedback TEXT,
    revision_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create contract_disputes table
CREATE TABLE IF NOT EXISTS public.contract_disputes (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    initiated_by UUID NOT NULL REFERENCES public.profiles(id),
    dispute_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'open',
    resolution TEXT,
    resolved_by UUID REFERENCES public.profiles(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT contract_disputes_status_valid 
        CHECK (status IN ('open', 'in_progress', 'resolved', 'escalated'))
);

-- Create contract_notifications table
CREATE TABLE IF NOT EXISTS public.contract_notifications (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    action_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contract_milestones_contract_id ON public.contract_milestones(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_status ON public.contract_milestones(status);
CREATE INDEX IF NOT EXISTS idx_escrow_payments_contract_id ON public.escrow_payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_escrow_payments_status ON public.escrow_payments(status);
CREATE INDEX IF NOT EXISTS idx_escrow_payments_stripe_payment_intent ON public.escrow_payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_profile_id ON public.kyc_verifications(profile_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_status ON public.kyc_verifications(status);
CREATE INDEX IF NOT EXISTS idx_contract_deliverables_contract_id ON public.contract_deliverables(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_deliverables_milestone_id ON public.contract_deliverables(milestone_id);
CREATE INDEX IF NOT EXISTS idx_contract_reviews_contract_id ON public.contract_reviews(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_disputes_contract_id ON public.contract_disputes(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_notifications_user_id ON public.contract_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_contract_notifications_contract_id ON public.contract_notifications(contract_id);

-- Create updated_at triggers for new tables
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables that have updated_at columns
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_contract_milestones_updated_at') THEN
        CREATE TRIGGER update_contract_milestones_updated_at
            BEFORE UPDATE ON public.contract_milestones
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_escrow_payments_updated_at') THEN
        CREATE TRIGGER update_escrow_payments_updated_at
            BEFORE UPDATE ON public.escrow_payments
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_kyc_verifications_updated_at') THEN
        CREATE TRIGGER update_kyc_verifications_updated_at
            BEFORE UPDATE ON public.kyc_verifications
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON TABLE public.contract_milestones IS 'Milestones for milestone-based contracts';
COMMENT ON TABLE public.escrow_payments IS 'Escrow payment records with Stripe integration';
COMMENT ON TABLE public.kyc_verifications IS 'KYC verification records for enhanced compliance';
COMMENT ON TABLE public.contract_deliverables IS 'File deliverables associated with contracts and milestones';
COMMENT ON TABLE public.contract_reviews IS 'Review and approval records for contract work';
COMMENT ON TABLE public.contract_disputes IS 'Dispute records for contract resolution';
COMMENT ON TABLE public.contract_notifications IS 'Contract-specific notifications for users';

-- Grant permissions
GRANT ALL ON public.contract_milestones TO authenticated;
GRANT ALL ON public.escrow_payments TO authenticated;
GRANT ALL ON public.kyc_verifications TO authenticated;
GRANT ALL ON public.contract_deliverables TO authenticated;
GRANT ALL ON public.contract_reviews TO authenticated;
GRANT ALL ON public.contract_disputes TO authenticated;
GRANT ALL ON public.contract_notifications TO authenticated;

GRANT ALL ON public.contract_milestones TO service_role;
GRANT ALL ON public.escrow_payments TO service_role;
GRANT ALL ON public.kyc_verifications TO service_role;
GRANT ALL ON public.contract_deliverables TO service_role;
GRANT ALL ON public.contract_reviews TO service_role;
GRANT ALL ON public.contract_disputes TO service_role;
GRANT ALL ON public.contract_notifications TO service_role;