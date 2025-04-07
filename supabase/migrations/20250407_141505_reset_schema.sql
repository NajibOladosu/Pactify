
-- Drop existing tables (if needed)
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS contacts;
DROP TABLE IF EXISTS user_subscriptions;
DROP TABLE IF EXISTS subscription_plans;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS milestones;
DROP TABLE IF EXISTS contract_parties;
DROP TABLE IF EXISTS contracts;
DROP TABLE IF EXISTS contract_templates;
DROP TABLE IF EXISTS profiles;

-- Drop existing triggers (if needed)
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_available_contracts_trigger ON contracts;
DROP TRIGGER IF EXISTS set_contract_number_trigger ON contracts;

-- Drop existing functions (if needed)
DROP FUNCTION IF EXISTS handle_user_update();
DROP FUNCTION IF EXISTS handle_new_user();
DROP FUNCTION IF EXISTS update_available_contracts();
DROP FUNCTION IF EXISTS set_contract_number();


-- Pactify Database Schema

-- Enable UUIDs extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table to extend auth.users
CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    display_name TEXT,
    user_type TEXT DEFAULT 'both' CHECK (user_type IN ('freelancer', 'client', 'both')),
    company_name TEXT,
    website TEXT,
    bio TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    available_contracts INTEGER DEFAULT 3,
    subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'professional', 'business')),
    subscription_start_date TIMESTAMP WITH TIME ZONE,
    subscription_end_date TIMESTAMP WITH TIME ZONE,
    stripe_customer_id TEXT
);

-- Create contract templates table
CREATE TABLE contract_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    content JSONB NOT NULL, -- Stores the contract template structure
    category TEXT,
    is_premium BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create contracts table
CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    creator_id UUID REFERENCES profiles(id) NOT NULL,
    template_id UUID REFERENCES contract_templates(id),
    content JSONB NOT NULL, -- Stores the contract content
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'signed', 'completed', 'cancelled', 'disputed')),
    total_amount DECIMAL(12, 2),
    currency TEXT DEFAULT 'USD',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    contract_number TEXT UNIQUE, -- Friendly identifier (e.g., PACT-20230504-001)
    locked BOOLEAN DEFAULT FALSE -- When true, contract content cannot be edited
);

-- Create contract parties (participants) table
CREATE TABLE contract_parties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID REFERENCES contracts(id) NOT NULL,
    user_id UUID REFERENCES profiles(id) NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('creator', 'freelancer', 'client')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'rejected')),
    signature_date TIMESTAMP WITH TIME ZONE,
    signature_data TEXT, -- Can store signature image or data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (contract_id, user_id) -- Each user can only be added once to a contract
);

-- Create contract milestones table
CREATE TABLE milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID REFERENCES contracts(id) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    amount DECIMAL(12, 2) NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'disputed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create payments/escrow table
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID REFERENCES contracts(id) NOT NULL,
    milestone_id UUID REFERENCES milestones(id),
    payer_id UUID REFERENCES profiles(id) NOT NULL,
    payee_id UUID REFERENCES profiles(id) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    fee DECIMAL(12, 2) NOT NULL,
    net_amount DECIMAL(12, 2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_escrow', 'released', 'refunded', 'disputed')),
    stripe_payment_intent_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create subscription plans table
CREATE TABLE subscription_plans (
    id TEXT PRIMARY KEY, -- 'free', 'professional', 'business'
    name TEXT NOT NULL,
    description TEXT,
    price_monthly DECIMAL(10, 2) NOT NULL,
    price_yearly DECIMAL(10, 2) NOT NULL,
    escrow_fee_percentage DECIMAL(5, 2) NOT NULL,
    max_contracts INTEGER,
    features JSONB,
    stripe_price_id_monthly TEXT,
    stripe_price_id_yearly TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user subscriptions table
CREATE TABLE user_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) NOT NULL,
    plan_id TEXT REFERENCES subscription_plans(id) NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
    stripe_subscription_id TEXT,
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id) -- Each user can only have one active subscription
);

-- Create contacts (network) table
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) NOT NULL,
    contact_id UUID REFERENCES profiles(id) NOT NULL,
    relationship TEXT CHECK (relationship IN ('client', 'freelancer', 'both')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, contact_id) -- Prevent duplicate contacts
);

-- Create notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    related_entity_type TEXT, -- 'contract', 'payment', etc.
    related_entity_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default subscription plans
INSERT INTO subscription_plans (id, name, description, price_monthly, price_yearly, escrow_fee_percentage, max_contracts, features) VALUES
('free', 'Free', 'Basic features for individuals just getting started', 0, 0, 10.00, 3, '{"features": ["Up to 3 contracts", "Basic contract templates", "10% escrow fee"]}'),
('professional', 'Professional', 'For growing freelance businesses', 19.99, 199.99, 7.50, NULL, '{"features": ["Unlimited contracts", "All professional templates", "7.5% escrow fee", "Basic custom branding"]}'),
('business', 'Business', 'For established freelance businesses', 49.99, 499.99, 5.00, NULL, '{"features": ["Unlimited contracts", "All professional templates", "5% escrow fee", "Team collaboration (up to 5)", "Full white-labeling"]}');

-- Insert some basic contract templates
INSERT INTO contract_templates (name, description, content, category, is_premium) VALUES
('Basic Freelance Agreement', 'A simple agreement for freelance work', '{"sections": [{"title": "Parties", "content": "This Agreement is made between {{client_name}} (\"Client\") and {{freelancer_name}} (\"Freelancer\")."}, {"title": "Services", "content": "Freelancer agrees to provide the following services: {{services}}"}, {"title": "Payment", "content": "Client agrees to pay Freelancer the sum of {{amount}} {{currency}} for the services."}, {"title": "Timeline", "content": "The services will be delivered by {{delivery_date}}."}, {"title": "Intellectual Property", "content": "Upon receipt of full payment, Freelancer assigns all rights to the deliverables to Client."}]}', 'General', false),
('Web Development Contract', 'Agreement for website development services', '{"sections": [{"title": "Parties", "content": "This Agreement is made between {{client_name}} (\"Client\") and {{freelancer_name}} (\"Developer\")."}, {"title": "Project Scope", "content": "Developer agrees to design and develop a website as described here: {{project_description}}"}, {"title": "Payment Terms", "content": "Total project fee is {{amount}} {{currency}}, payable in the following milestones: {{milestones}}"}, {"title": "Timeline", "content": "The project will be completed by {{completion_date}}."}, {"title": "Hosting and Maintenance", "content": "{{hosting_terms}}"}, {"title": "Intellectual Property", "content": "Upon receipt of full payment, Developer assigns all rights to the website to Client, except for third-party components and Developer tools."}]}', 'Web Development', false),
('Graphic Design Contract', 'Agreement for design services', '{"sections": [{"title": "Parties", "content": "This Agreement is made between {{client_name}} (\"Client\") and {{freelancer_name}} (\"Designer\")."}, {"title": "Design Services", "content": "Designer agrees to create the following: {{design_deliverables}}"}, {"title": "Compensation", "content": "Client agrees to pay Designer {{amount}} {{currency}} for the design services."}, {"title": "Revisions", "content": "This agreement includes {{revision_count}} rounds of revisions."}, {"title": "Timeline", "content": "Designer will deliver initial concepts by {{concept_date}} and final designs by {{final_date}}."}, {"title": "Usage Rights", "content": "Upon receipt of full payment, Client receives the following rights: {{usage_rights}}"}]}', 'Design', false);

-- Create RLS (Row Level Security) policies

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
ON profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

-- Contract templates policies
CREATE POLICY "Anyone can view contract templates"
ON contract_templates FOR SELECT
TO authenticated USING (true);

-- Contracts policies
CREATE POLICY "Users can view contracts they're part of"
ON contracts FOR SELECT
TO authenticated
USING (
    id IN (
        SELECT contract_id FROM contract_parties
        WHERE user_id = auth.uid()
    )
    OR creator_id = auth.uid()
);

CREATE POLICY "Users can insert their own contracts"
ON contracts FOR INSERT
TO authenticated
WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Contract creator can update contract"
ON contracts FOR UPDATE
TO authenticated
USING (creator_id = auth.uid() AND NOT locked);

-- Contract parties policies
CREATE POLICY "Users can view contract parties for their contracts"
ON contract_parties FOR SELECT
TO authenticated
USING (
    contract_id IN (
        SELECT id FROM contracts
        WHERE id IN (
            SELECT contract_id FROM contract_parties
            WHERE user_id = auth.uid()
        )
        OR creator_id = auth.uid()
    )
);

CREATE POLICY "Users can add parties to their contracts"
ON contract_parties FOR INSERT
TO authenticated
WITH CHECK (
    contract_id IN (
        SELECT id FROM contracts
        WHERE creator_id = auth.uid()
    )
);

-- Milestones policies
CREATE POLICY "Users can view milestones for their contracts"
ON milestones FOR SELECT
TO authenticated
USING (
    contract_id IN (
        SELECT id FROM contracts
        WHERE id IN (
            SELECT contract_id FROM contract_parties
            WHERE user_id = auth.uid()
        )
        OR creator_id = auth.uid()
    )
);

CREATE POLICY "Contract creator can add milestones"
ON milestones FOR INSERT
TO authenticated
WITH CHECK (
    contract_id IN (
        SELECT id FROM contracts
        WHERE creator_id = auth.uid()
    )
);

-- Payments policies
CREATE POLICY "Users can view payments they're involved in"
ON payments FOR SELECT
TO authenticated
USING (
    payer_id = auth.uid() OR payee_id = auth.uid()
);

-- Subscription plans policies
CREATE POLICY "Anyone can view subscription plans"
ON subscription_plans FOR SELECT
TO authenticated USING (true);

-- User subscriptions policies
CREATE POLICY "Users can view their own subscriptions"
ON user_subscriptions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Contacts policies
CREATE POLICY "Users can view their own contacts"
ON contacts FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can add contacts"
ON contacts FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Notifications policies
CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
ON notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- Trigger for setting contract number
CREATE OR REPLACE FUNCTION set_contract_number()
RETURNS TRIGGER AS $$
DECLARE
    date_part TEXT;
    sequence_number INT;
    year_part TEXT;
    month_part TEXT;
    day_part TEXT;
BEGIN
    -- Get the current date parts
    year_part := to_char(NOW(), 'YYYY');
    month_part := to_char(NOW(), 'MM');
    day_part := to_char(NOW(), 'DD');
    
    -- Combine into date string
    date_part := year_part || month_part || day_part;
    
    -- Get the current sequence number for today
    SELECT COUNT(*) + 1 INTO sequence_number
    FROM contracts
    WHERE contract_number LIKE 'PACT-' || date_part || '-%';
    
    -- Set the contract number
    NEW.contract_number := 'PACT-' || date_part || '-' || LPAD(sequence_number::TEXT, 3, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_contract_number_trigger
BEFORE INSERT ON contracts
FOR EACH ROW
WHEN (NEW.contract_number IS NULL)
EXECUTE FUNCTION set_contract_number();

-- Trigger for updating user available contracts
CREATE OR REPLACE FUNCTION update_available_contracts()
RETURNS TRIGGER AS $$
BEGIN
    -- Only decrement if the user is on the free plan and this is a new contract
    IF EXISTS (
        SELECT 1 FROM profiles
        WHERE id = NEW.creator_id
        AND subscription_tier = 'free'
        AND available_contracts > 0
    ) THEN
        UPDATE profiles
        SET available_contracts = available_contracts - 1
        WHERE id = NEW.creator_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_available_contracts_trigger
AFTER INSERT ON contracts
FOR EACH ROW
EXECUTE FUNCTION update_available_contracts();

-- Create function for auth user creation hook
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, user_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'both')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function for updating profiles table when user is updated
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET updated_at = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for user update
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_update();
