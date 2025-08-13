-- Fix dashboard RPC functions for new contract workflow

-- Drop existing function and recreate with correct status values
DROP FUNCTION IF EXISTS public.get_active_contract_count(uuid);

-- Function to count active contracts for a user
CREATE OR REPLACE FUNCTION public.get_active_contract_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::integer
  FROM public.contracts
  WHERE (creator_id = p_user_id OR client_id = p_user_id OR freelancer_id = p_user_id)
  AND status IN ('draft', 'pending_signatures', 'pending_funding', 'active', 'pending_delivery', 'in_review', 'revision_requested', 'pending_completion', 'disputed');
$$;

-- Function to count pending signatures for a user
CREATE OR REPLACE FUNCTION public.get_pending_signatures_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::integer
  FROM public.contracts
  WHERE (creator_id = p_user_id OR client_id = p_user_id OR freelancer_id = p_user_id)
  AND status = 'pending_signatures';
$$;

-- Function to get total pending payment amount for a user
CREATE OR REPLACE FUNCTION public.get_pending_payments_amount(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(total_amount), 0)
  FROM public.contracts
  WHERE (creator_id = p_user_id OR client_id = p_user_id OR freelancer_id = p_user_id)
  AND status IN ('pending_funding', 'active', 'pending_delivery', 'in_review', 'revision_requested', 'pending_completion', 'disputed');
$$;

-- Function to count unique clients/freelancers for a user
CREATE OR REPLACE FUNCTION public.get_contacts_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(DISTINCT 
    CASE 
      WHEN creator_id = p_user_id THEN COALESCE(client_id, freelancer_id)
      WHEN client_id = p_user_id THEN COALESCE(creator_id, freelancer_id)
      WHEN freelancer_id = p_user_id THEN COALESCE(creator_id, client_id)
    END
  )::integer
  FROM public.contracts
  WHERE (creator_id = p_user_id OR client_id = p_user_id OR freelancer_id = p_user_id);
$$;

-- Function to get comprehensive dashboard stats
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_user_id uuid)
RETURNS TABLE(
  active_contracts integer,
  pending_signatures integer,
  pending_payments numeric,
  contacts_count integer
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    public.get_active_contract_count(p_user_id) as active_contracts,
    public.get_pending_signatures_count(p_user_id) as pending_signatures,
    public.get_pending_payments_amount(p_user_id) as pending_payments,
    public.get_contacts_count(p_user_id) as contacts_count;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_active_contract_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_signatures_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_payments_amount(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contacts_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) TO authenticated;