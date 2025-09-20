-- Core Missing Tables Migration
-- Creates essential tables for contract versioning, notifications, audit logs, and RBAC

-- 1. Contract Versions Table
CREATE TABLE IF NOT EXISTS contract_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  description TEXT,
  terms TEXT,
  total_amount DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  payment_type TEXT CHECK (payment_type IN ('fixed', 'hourly', 'milestone')),
  timeline_days INTEGER,
  deliverables JSONB,
  proposed_by UUID REFERENCES profiles(id) NOT NULL,
  changes_summary TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'proposed', 'accepted', 'rejected', 'superseded')),
  accepted_by UUID REFERENCES profiles(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT contract_versions_version_unique UNIQUE (contract_id, version_number)
);

-- 2. System Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Notification System
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('email', 'in_app', 'sms', 'push')),
  subject TEXT,
  template TEXT NOT NULL,
  variables JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('email', 'in_app', 'sms', 'push')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivery_status TEXT DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  error_message TEXT,
  template_id UUID REFERENCES notification_templates(id),
  related_resource_type TEXT,
  related_resource_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_settings (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,
  notification_types JSONB DEFAULT '{"contract_updates": true, "payment_updates": true, "dispute_updates": true, "system_updates": true}',
  frequency TEXT DEFAULT 'immediate' CHECK (frequency IN ('immediate', 'daily', 'weekly', 'never')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Role-Based Access Control (RBAC)
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  permissions JSONB,
  is_system_role BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES profiles(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  
  CONSTRAINT user_roles_unique UNIQUE (user_id, role_id)
);

-- 5. File Management
CREATE TABLE IF NOT EXISTS file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT UNIQUE NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  checksum TEXT,
  related_resource_type TEXT,
  related_resource_id TEXT,
  is_public BOOLEAN DEFAULT false,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT file_uploads_size_positive CHECK (file_size > 0)
);

-- 6. Contract Signatures
CREATE TABLE IF NOT EXISTS contract_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  signature_data TEXT NOT NULL, -- Base64 encoded signature image
  signature_type TEXT DEFAULT 'electronic' CHECK (signature_type IN ('electronic', 'digital')),
  ip_address INET,
  user_agent TEXT,
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT contract_signatures_unique UNIQUE (contract_id, user_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS contract_versions_contract_id_idx ON contract_versions(contract_id);
CREATE INDEX IF NOT EXISTS contract_versions_status_idx ON contract_versions(status);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_read_at_idx ON notifications(read_at);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS file_uploads_user_id_idx ON file_uploads(user_id);
CREATE INDEX IF NOT EXISTS file_uploads_resource_idx ON file_uploads(related_resource_type, related_resource_id);
CREATE INDEX IF NOT EXISTS contract_signatures_contract_id_idx ON contract_signatures(contract_id);

-- Enable RLS on all tables
ALTER TABLE contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_signatures ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contract_versions
CREATE POLICY "Users can view versions of their contracts" ON contract_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contracts c 
      WHERE c.id = contract_versions.contract_id 
      AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
  );

CREATE POLICY "Users can create versions for their contracts" ON contract_versions
  FOR INSERT WITH CHECK (
    proposed_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM contracts c 
      WHERE c.id = contract_versions.contract_id 
      AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
  );

CREATE POLICY "Users can update versions they proposed" ON contract_versions
  FOR UPDATE USING (proposed_by = auth.uid());

-- RLS Policies for notifications
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- RLS Policies for notification_settings
CREATE POLICY "Users can manage own notification settings" ON notification_settings
  FOR ALL USING (user_id = auth.uid());

-- RLS Policies for file_uploads
CREATE POLICY "Users can view own files" ON file_uploads
  FOR SELECT USING (user_id = auth.uid() OR is_public = true);

CREATE POLICY "Users can upload files" ON file_uploads
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own files" ON file_uploads
  FOR UPDATE USING (user_id = auth.uid());

-- RLS Policies for contract_signatures
CREATE POLICY "Users can view signatures on their contracts" ON contract_signatures
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contracts c 
      WHERE c.id = contract_signatures.contract_id 
      AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
  );

CREATE POLICY "Users can create own signatures" ON contract_signatures
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Grant permissions
GRANT ALL ON contract_versions TO authenticated;
GRANT ALL ON audit_logs TO authenticated;
GRANT ALL ON notifications TO authenticated;
GRANT ALL ON notification_settings TO authenticated;
GRANT ALL ON file_uploads TO authenticated;
GRANT ALL ON contract_signatures TO authenticated;
GRANT ALL ON roles TO authenticated;
GRANT ALL ON user_roles TO authenticated;

GRANT ALL ON contract_versions TO service_role;
GRANT ALL ON audit_logs TO service_role;
GRANT ALL ON notifications TO service_role;
GRANT ALL ON notification_settings TO service_role;
GRANT ALL ON file_uploads TO service_role;
GRANT ALL ON contract_signatures TO service_role;
GRANT ALL ON roles TO service_role;
GRANT ALL ON user_roles TO service_role;

-- Insert default roles
INSERT INTO roles (name, description, permissions, is_system_role) VALUES
('admin', 'System Administrator', '{"all": true}', true),
('user', 'Regular User', '{"contracts": {"read": true, "create": true, "update": true}, "payments": {"read": true}}', true),
('freelancer', 'Freelancer', '{"contracts": {"read": true, "create": true, "update": true}, "payments": {"read": true}, "time_tracking": {"read": true, "create": true}}', true),
('client', 'Client', '{"contracts": {"read": true, "create": true, "update": true}, "payments": {"read": true, "create": true}}', true)
ON CONFLICT (name) DO NOTHING;

-- Insert default notification templates
INSERT INTO notification_templates (name, type, subject, template, variables) VALUES
('contract_accepted', 'email', 'Contract Accepted - {{contract_title}}', 
 'Your contract "{{contract_title}}" has been accepted by {{acceptor_name}}. You can view the details at {{contract_url}}.', 
 '["contract_title", "acceptor_name", "contract_url"]'),
('work_submitted', 'email', 'Work Submitted - {{contract_title}}', 
 'New work has been submitted for contract "{{contract_title}}" by {{freelancer_name}}. Please review at {{contract_url}}.', 
 '["contract_title", "freelancer_name", "contract_url"]'),
('payment_released', 'email', 'Payment Released - {{amount}}', 
 'Payment of {{amount}} has been released for contract "{{contract_title}}". {{details}}', 
 '["amount", "contract_title", "details"]'),
('dispute_created', 'email', 'Dispute Created - {{contract_title}}', 
 'A dispute has been created for contract "{{contract_title}}". Please review and respond at {{dispute_url}}.', 
 '["contract_title", "dispute_url"]')
ON CONFLICT (name) DO NOTHING;

-- Functions for automated operations
CREATE OR REPLACE FUNCTION update_contract_version_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_notification_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS update_contract_versions_timestamp ON contract_versions;
CREATE TRIGGER update_contract_versions_timestamp
  BEFORE UPDATE ON contract_versions
  FOR EACH ROW EXECUTE FUNCTION update_contract_version_timestamp();

DROP TRIGGER IF EXISTS update_notification_settings_timestamp ON notification_settings;
CREATE TRIGGER update_notification_settings_timestamp
  BEFORE UPDATE ON notification_settings
  FOR EACH ROW EXECUTE FUNCTION update_notification_settings_timestamp();

-- Function to get contract version history
CREATE OR REPLACE FUNCTION get_contract_versions(contract_uuid UUID)
RETURNS TABLE(
  id UUID,
  version_number INTEGER,
  title TEXT,
  description TEXT,
  total_amount DECIMAL,
  currency TEXT,
  proposed_by UUID,
  proposer_name TEXT,
  status TEXT,
  changes_summary TEXT,
  created_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cv.id,
    cv.version_number,
    cv.title,
    cv.description,
    cv.total_amount,
    cv.currency,
    cv.proposed_by,
    p.display_name as proposer_name,
    cv.status,
    cv.changes_summary,
    cv.created_at,
    cv.accepted_at
  FROM contract_versions cv
  LEFT JOIN profiles p ON cv.proposed_by = p.id
  WHERE cv.contract_id = contract_uuid
  ORDER BY cv.version_number DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_contract_versions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_contract_versions(UUID) TO service_role;