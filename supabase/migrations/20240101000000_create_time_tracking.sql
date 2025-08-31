-- Create time_entries table for tracking work sessions
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  freelancer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_description TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  hourly_rate DECIMAL(10,2),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  client_notes TEXT,
  freelancer_notes TEXT,
  screenshots JSONB DEFAULT '[]'::jsonb,
  activity_level INTEGER CHECK (activity_level >= 0 AND activity_level <= 100),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id)
);

-- Create time_tracking_sessions table for active tracking
CREATE TABLE time_tracking_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  freelancer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_description TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  total_breaks_minutes INTEGER DEFAULT 0,
  screenshots JSONB DEFAULT '[]'::jsonb,
  activity_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create time_approvals table for client approvals
CREATE TABLE time_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'needs_revision')),
  feedback TEXT,
  approved_hours DECIMAL(5,2),
  approved_amount DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_time_entries_contract_id ON time_entries(contract_id);
CREATE INDEX idx_time_entries_freelancer_id ON time_entries(freelancer_id);
CREATE INDEX idx_time_entries_status ON time_entries(status);
CREATE INDEX idx_time_entries_created_at ON time_entries(created_at DESC);

CREATE INDEX idx_time_tracking_sessions_contract_id ON time_tracking_sessions(contract_id);
CREATE INDEX idx_time_tracking_sessions_freelancer_id ON time_tracking_sessions(freelancer_id);
CREATE INDEX idx_time_tracking_sessions_is_active ON time_tracking_sessions(is_active);

CREATE INDEX idx_time_approvals_time_entry_id ON time_approvals(time_entry_id);
CREATE INDEX idx_time_approvals_client_id ON time_approvals(client_id);
CREATE INDEX idx_time_approvals_status ON time_approvals(status);

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_time_entries_updated_at 
  BEFORE UPDATE ON time_entries 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_time_tracking_sessions_updated_at 
  BEFORE UPDATE ON time_tracking_sessions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_time_approvals_updated_at 
  BEFORE UPDATE ON time_approvals 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_tracking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_approvals ENABLE ROW LEVEL SECURITY;

-- Time entries policies
CREATE POLICY "Freelancers can manage their own time entries" ON time_entries
  FOR ALL USING (freelancer_id = auth.uid());

CREATE POLICY "Clients can view time entries for their contracts" ON time_entries
  FOR SELECT USING (
    contract_id IN (
      SELECT c.id FROM contracts c 
      WHERE c.client_id = auth.uid() OR c.creator_id = auth.uid()
    )
  );

CREATE POLICY "Clients can update time entry approvals" ON time_entries
  FOR UPDATE USING (
    contract_id IN (
      SELECT c.id FROM contracts c 
      WHERE c.client_id = auth.uid()
    )
  );

-- Time tracking sessions policies
CREATE POLICY "Freelancers can manage their own tracking sessions" ON time_tracking_sessions
  FOR ALL USING (freelancer_id = auth.uid());

CREATE POLICY "Clients can view tracking sessions for their contracts" ON time_tracking_sessions
  FOR SELECT USING (
    contract_id IN (
      SELECT c.id FROM contracts c 
      WHERE c.client_id = auth.uid()
    )
  );

-- Time approvals policies
CREATE POLICY "Clients can manage time approvals for their contracts" ON time_approvals
  FOR ALL USING (client_id = auth.uid());

CREATE POLICY "Freelancers can view their time approvals" ON time_approvals
  FOR SELECT USING (
    time_entry_id IN (
      SELECT te.id FROM time_entries te 
      WHERE te.freelancer_id = auth.uid()
    )
  );

-- Create function to calculate time entry duration
CREATE OR REPLACE FUNCTION calculate_time_entry_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
    NEW.duration_minutes = EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER calculate_duration_on_time_entries 
  BEFORE INSERT OR UPDATE ON time_entries 
  FOR EACH ROW EXECUTE FUNCTION calculate_time_entry_duration();

-- Create function to auto-submit time entries when ended
CREATE OR REPLACE FUNCTION auto_submit_time_entry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.end_time IS NOT NULL AND OLD.end_time IS NULL AND NEW.status = 'draft' THEN
    NEW.status = 'submitted';
    NEW.submitted_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER auto_submit_on_time_entry_end 
  BEFORE UPDATE ON time_entries 
  FOR EACH ROW EXECUTE FUNCTION auto_submit_time_entry();