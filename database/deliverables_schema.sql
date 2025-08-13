-- Contract Deliverables Table
CREATE TABLE IF NOT EXISTS contract_deliverables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    deliverable_type VARCHAR(20) NOT NULL CHECK (deliverable_type IN ('file', 'link', 'text')),
    
    -- File-related fields
    file_url TEXT,
    file_name VARCHAR(255),
    file_size BIGINT,
    
    -- Link-related fields
    link_url TEXT,
    
    -- Text-related fields
    text_content TEXT,
    
    -- Metadata
    submitted_by UUID NOT NULL REFERENCES profiles(id),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revision_requested')),
    
    -- Client feedback
    client_feedback TEXT,
    feedback_at TIMESTAMP WITH TIME ZONE,
    
    -- Version tracking
    is_latest_version BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Deliverable Comments Table
CREATE TABLE IF NOT EXISTS deliverable_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deliverable_id UUID NOT NULL REFERENCES contract_deliverables(id) ON DELETE CASCADE,
    commenter_id UUID NOT NULL REFERENCES profiles(id),
    comment TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contract_deliverables_contract_id ON contract_deliverables(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_deliverables_title_version ON contract_deliverables(contract_id, title, version);
CREATE INDEX IF NOT EXISTS idx_contract_deliverables_status ON contract_deliverables(status);
CREATE INDEX IF NOT EXISTS idx_contract_deliverables_latest_version ON contract_deliverables(is_latest_version) WHERE is_latest_version = TRUE;
CREATE INDEX IF NOT EXISTS idx_deliverable_comments_deliverable_id ON deliverable_comments(deliverable_id);

-- Enable Row Level Security
ALTER TABLE contract_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverable_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contract_deliverables
CREATE POLICY "Users can view deliverables for their contracts" ON contract_deliverables
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM contracts 
            WHERE contracts.id = contract_deliverables.contract_id 
            AND (contracts.client_id = auth.uid() OR contracts.freelancer_id = auth.uid())
        )
    );

CREATE POLICY "Freelancers can insert deliverables for their contracts" ON contract_deliverables
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM contracts 
            WHERE contracts.id = contract_deliverables.contract_id 
            AND contracts.freelancer_id = auth.uid()
        )
        AND submitted_by = auth.uid()
    );

CREATE POLICY "Clients can update deliverable status and feedback" ON contract_deliverables
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM contracts 
            WHERE contracts.id = contract_deliverables.contract_id 
            AND contracts.client_id = auth.uid()
        )
    );

-- RLS Policies for deliverable_comments  
CREATE POLICY "Users can view comments for deliverables on their contracts" ON deliverable_comments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM contract_deliverables 
            JOIN contracts ON contracts.id = contract_deliverables.contract_id
            WHERE contract_deliverables.id = deliverable_comments.deliverable_id 
            AND (contracts.client_id = auth.uid() OR contracts.freelancer_id = auth.uid())
        )
    );

CREATE POLICY "Contract parties can insert comments on deliverables" ON deliverable_comments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM contract_deliverables 
            JOIN contracts ON contracts.id = contract_deliverables.contract_id
            WHERE contract_deliverables.id = deliverable_comments.deliverable_id 
            AND (contracts.client_id = auth.uid() OR contracts.freelancer_id = auth.uid())
        )
        AND commenter_id = auth.uid()
    );

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_contract_deliverables_updated_at 
    BEFORE UPDATE ON contract_deliverables 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deliverable_comments_updated_at 
    BEFORE UPDATE ON deliverable_comments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to ensure only one latest version per deliverable title
CREATE OR REPLACE FUNCTION ensure_single_latest_version()
RETURNS TRIGGER AS $$
BEGIN
    -- If this is being set as the latest version, unset others with the same title
    IF NEW.is_latest_version = TRUE THEN
        UPDATE contract_deliverables 
        SET is_latest_version = FALSE 
        WHERE contract_id = NEW.contract_id 
        AND title = NEW.title 
        AND id != NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_single_latest_version_trigger
    BEFORE INSERT OR UPDATE ON contract_deliverables
    FOR EACH ROW 
    EXECUTE FUNCTION ensure_single_latest_version();