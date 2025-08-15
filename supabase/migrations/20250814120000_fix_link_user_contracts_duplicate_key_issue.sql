-- Fix the link_user_contracts function to prevent duplicate key constraint violations
-- The original function was not properly checking for existing contract_parties records

CREATE OR REPLACE FUNCTION "public"."link_user_contracts"(
  "p_user_id" uuid, 
  "p_user_email" text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Link contracts where user email matches client_email
  UPDATE public.contracts 
  SET client_id = p_user_id
  WHERE client_email = p_user_email 
    AND client_id IS NULL;

  -- Link contracts where user email matches freelancer_email  
  UPDATE public.contracts 
  SET freelancer_id = p_user_id
  WHERE freelancer_email = p_user_email 
    AND freelancer_id IS NULL;

  -- Create contract_parties records for newly linked contracts
  -- For client contracts - Fixed the logic to properly check for existing records
  INSERT INTO public.contract_parties (contract_id, user_id, role, status)
  SELECT c.id, p_user_id, 'client', 'pending'
  FROM public.contracts c
  WHERE c.client_id = p_user_id 
    AND c.client_email = p_user_email
    AND NOT EXISTS (
      SELECT 1 
      FROM public.contract_parties cp
      WHERE cp.contract_id = c.id 
        AND cp.user_id = p_user_id 
        AND cp.role = 'client'
    );

  -- For freelancer contracts - Fixed the logic to properly check for existing records
  INSERT INTO public.contract_parties (contract_id, user_id, role, status)
  SELECT c.id, p_user_id, 'freelancer', 'pending'
  FROM public.contracts c
  WHERE c.freelancer_id = p_user_id 
    AND c.freelancer_email = p_user_email
    AND NOT EXISTS (
      SELECT 1 
      FROM public.contract_parties cp
      WHERE cp.contract_id = c.id 
        AND cp.user_id = p_user_id 
        AND cp.role = 'freelancer'
    );
END;
$$;

-- Grant necessary permissions
GRANT ALL ON FUNCTION "public"."link_user_contracts"("p_user_id" uuid, "p_user_email" text) TO "anon";
GRANT ALL ON FUNCTION "public"."link_user_contracts"("p_user_id" uuid, "p_user_email" text) TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_user_contracts"("p_user_id" uuid, "p_user_email" text) TO "service_role";