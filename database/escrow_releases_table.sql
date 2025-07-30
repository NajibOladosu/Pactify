-- Create escrow_releases table for tracking payment releases
CREATE TABLE IF NOT EXISTS public.escrow_releases (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  escrow_payment_id uuid NOT NULL REFERENCES public.escrow_payments(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  release_method text NOT NULL DEFAULT 'pending_payout',
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  requested_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  completed_at timestamptz,
  payout_method jsonb, -- Store payout details (bank account, etc.)
  payout_reference text, -- External reference ID for payout
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_escrow_releases_contract_id ON public.escrow_releases(contract_id);
CREATE INDEX IF NOT EXISTS idx_escrow_releases_freelancer_id ON public.escrow_releases(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_escrow_releases_escrow_payment_id ON public.escrow_releases(escrow_payment_id);
CREATE INDEX IF NOT EXISTS idx_escrow_releases_status ON public.escrow_releases(status);

-- Enable RLS
ALTER TABLE public.escrow_releases ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their escrow releases" ON public.escrow_releases
  FOR SELECT TO authenticated
  USING (
    auth.uid() = freelancer_id OR 
    auth.uid() = client_id OR
    auth.uid() IN (
      SELECT creator_id FROM public.contracts WHERE id = contract_id
    )
  );

CREATE POLICY "Clients can create escrow releases" ON public.escrow_releases
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Users can update their escrow releases" ON public.escrow_releases
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = freelancer_id OR 
    auth.uid() = client_id OR
    auth.uid() IN (
      SELECT creator_id FROM public.contracts WHERE id = contract_id
    )
  );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_escrow_releases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER escrow_releases_updated_at
  BEFORE UPDATE ON public.escrow_releases
  FOR EACH ROW
  EXECUTE FUNCTION update_escrow_releases_updated_at();