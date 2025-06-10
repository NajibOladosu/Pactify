

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."check_all_milestones_completed"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- If a milestone is marked as completed
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        -- Check if all milestones for this contract are now completed
        IF NOT EXISTS (
            SELECT 1 FROM public.milestones
            WHERE contract_id = NEW.contract_id
            AND status != 'completed'
        ) THEN
            -- Update the contract status to completed
            UPDATE public.contracts
            SET status = 'completed', updated_at = NOW()
            WHERE id = NEW.contract_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_all_milestones_completed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_user_exists"("email" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  user_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM auth.users WHERE auth.users.email = check_user_exists.email
  ) INTO user_exists;
  
  RETURN user_exists;
END;
$$;


ALTER FUNCTION "public"."check_user_exists"("email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exec_sql"("query" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  EXECUTE query;
END;
$$;


ALTER FUNCTION "public"."exec_sql"("query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_contract_count"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT COUNT(*)::integer
  FROM public.contracts
  WHERE creator_id = p_user_id
  AND status IN ('draft', 'pending', 'signed');
$$;


ALTER FUNCTION "public"."get_active_contract_count"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_contract_related_users"() RETURNS TABLE("id" "uuid", "email" "text", "display_name" "text", "avatar_url" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id,
    au.email,
    p.display_name,
    p.avatar_url
  FROM 
    auth.users au
  JOIN 
    public.profiles p ON au.id = p.id
  WHERE
    -- Current user
    au.id = auth.uid()
    
    OR
    
    -- Users with contract relationships
    au.id IN (
      -- Creator can see parties
      SELECT cp.user_id 
      FROM public.contract_parties cp
      JOIN public.contracts c ON cp.contract_id = c.id
      WHERE c.creator_id = auth.uid()
      
      UNION
      
      -- Party can see creator
      SELECT c.creator_id
      FROM public.contracts c
      JOIN public.contract_parties cp ON c.id = cp.contract_id
      WHERE cp.user_id = auth.uid()
      
      UNION
      
      -- Party can see other parties of same contract
      SELECT cp2.user_id
      FROM public.contract_parties cp1
      JOIN public.contract_parties cp2 ON cp1.contract_id = cp2.contract_id
      WHERE cp1.user_id = auth.uid()
    );
END;
$$;


ALTER FUNCTION "public"."get_contract_related_users"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_contract_related_users"() IS 'Secure function that returns user data only for the current user and users with contract relationships.';



CREATE OR REPLACE FUNCTION "public"."get_user_profile_data"("user_id" "uuid") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  user_data json;
BEGIN
  SELECT json_build_object(
    'id', u.id,
    'email', u.email,
    'display_name', p.display_name,
    'user_type', p.user_type,
    'avatar_url', p.avatar_url,
    'created_at', u.created_at
  ) INTO user_data
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  WHERE u.id = user_id;
  
  RETURN user_data;
END;
$$;


ALTER FUNCTION "public"."get_user_profile_data"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, user_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'both')
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.profiles
  SET updated_at = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_user_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_email_contracts_to_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- When a new user is created, check if their email was used in any contract_parties records
  -- If so, update the user_id in those records to link to the new user account
  
  -- Associate the email with user_id in contract_parties table
  UPDATE public.contract_parties
  SET 
    user_id = NEW.id,
    updated_at = NOW()
  WHERE user_id IS NULL 
  AND email = NEW.email;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."link_email_contracts_to_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_contract_to_email"("p_contract_id" "uuid", "p_email" "text", "p_role" "text" DEFAULT 'client'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Check if a profile with this email already exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;
  
  -- Insert a contract party record, either with the user_id if found or just with email
  INSERT INTO public.contract_parties (
    contract_id,
    user_id,
    email,
    role,
    status
  ) VALUES (
    p_contract_id,
    v_user_id,  -- Will be NULL if user doesn't exist yet
    p_email,    -- Store email for future reference
    p_role,
    'pending'
  )
  ON CONFLICT (contract_id, user_id) 
  DO NOTHING;  -- Don't update if this combination already exists

END;
$$;


ALTER FUNCTION "public"."send_contract_to_email"("p_contract_id" "uuid", "p_email" "text", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_contract_to_freelancer"("contract_id" "uuid", "freelancer_email" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Update contract status
    UPDATE public.contracts
    SET status = 'awaiting_freelancer_review', updated_at = NOW()
    WHERE id = contract_id;
    
    -- Insert freelancer into contract_parties if not exists
    IF NOT EXISTS (
        SELECT 1 FROM public.contract_parties
        WHERE contract_parties.contract_id = contract_id
        AND contract_parties.role = 'freelancer'
    ) THEN
        INSERT INTO public.contract_parties (
            contract_id,
            user_id,
            role,
            email,
            status,
            created_at,
            updated_at
        ) VALUES (
            contract_id,
            NULL,
            'freelancer',
            freelancer_email,
            'pending',
            NOW(),
            NOW()
        );
    END IF;
END;
$$;


ALTER FUNCTION "public"."send_contract_to_freelancer"("contract_id" "uuid", "freelancer_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_contract_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."set_contract_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_available_contracts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."update_available_contracts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_contract_funded_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE contracts
  SET is_funded = TRUE, 
      payment_status = 'funded',
      updated_at = NOW()
  WHERE id = NEW.contract_id;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_contract_funded_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_contract_status_on_signature"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    creator_signed BOOLEAN;
    client_signed BOOLEAN;
    contract_record RECORD;
BEGIN
    -- Get contract record
    SELECT * INTO contract_record FROM public.contracts WHERE id = NEW.contract_id;
    
    -- Check if both parties have signed
    SELECT EXISTS (
        SELECT 1 FROM public.contract_signatures 
        WHERE contract_id = NEW.contract_id 
        AND user_id = contract_record.creator_id
    ) INTO creator_signed;
    
    SELECT EXISTS (
        SELECT 1 FROM public.contract_signatures 
        WHERE contract_id = NEW.contract_id 
        AND user_id IN (
            SELECT user_id FROM public.contract_parties 
            WHERE contract_id = NEW.contract_id AND role = 'client'
        )
    ) INTO client_signed;
    
    -- If both have signed, update contract status to 'signed'
    IF creator_signed AND client_signed AND contract_record.status = 'pending' THEN
        UPDATE public.contracts 
        SET status = 'signed',
            updated_at = NOW()
        WHERE id = NEW.contract_id;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_contract_status_on_signature"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_contract_suggestions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_contract_suggestions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_milestones_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_milestones_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_subscription_on_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF NEW.status = 'paid' THEN
        UPDATE user_subscriptions
        SET 
            last_payment_date = NEW.payment_date,
            next_payment_date = NEW.period_end,
            updated_at = NOW()
        WHERE id = NEW.subscription_id;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_subscription_on_payment"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "relationship" "text",
    "status" "text" DEFAULT 'active'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "contacts_relationship_check" CHECK (("relationship" = ANY (ARRAY['client'::"text", 'freelancer'::"text", 'both'::"text"]))),
    CONSTRAINT "contacts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_comments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "comment" "text" NOT NULL,
    "type" "text" DEFAULT 'general'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "contract_comments_type_check" CHECK (("type" = ANY (ARRAY['general'::"text", 'suggestion'::"text", 'revision'::"text"])))
);


ALTER TABLE "public"."contract_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_escrows" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "funded_amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text",
    "funded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "funded_by" "uuid" NOT NULL,
    "payment_id" "uuid",
    "status" "text" DEFAULT 'active'::"text",
    "released_at" timestamp with time zone,
    "released_to" "uuid",
    "metadata" "jsonb",
    CONSTRAINT "contract_escrows_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'released'::"text", 'refunded'::"text", 'disputed'::"text"])))
);


ALTER TABLE "public"."contract_escrows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_parties" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "signature_date" timestamp with time zone,
    "signature_data" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "email" "text",
    CONSTRAINT "contract_parties_role_check" CHECK (("role" = ANY (ARRAY['creator'::"text", 'freelancer'::"text", 'client'::"text"]))),
    CONSTRAINT "contract_parties_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'signed'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."contract_parties" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text",
    "payment_type" "text" DEFAULT 'escrow'::"text",
    "payment_method" "text",
    "stripe_payment_id" "text",
    "stripe_customer_id" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "metadata" "jsonb",
    CONSTRAINT "contract_payments_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['escrow'::"text", 'release'::"text", 'refund'::"text"]))),
    CONSTRAINT "contract_payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."contract_payments" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."contract_related_users" AS
 SELECT "get_contract_related_users"."id",
    "get_contract_related_users"."email",
    "get_contract_related_users"."display_name",
    "get_contract_related_users"."avatar_url"
   FROM "public"."get_contract_related_users"() "get_contract_related_users"("id", "email", "display_name", "avatar_url");


ALTER TABLE "public"."contract_related_users" OWNER TO "postgres";


COMMENT ON VIEW "public"."contract_related_users" IS 'Safe view for accessing user data in contract relations. Use this instead of auth.users directly.';



CREATE TABLE IF NOT EXISTS "public"."contract_signatures" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "signed_at" timestamp with time zone DEFAULT "now"(),
    "signature_data" "text"
);


ALTER TABLE "public"."contract_signatures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_suggestions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "suggestion" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contract_suggestions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."contract_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "content" "jsonb" NOT NULL,
    "category" "text",
    "is_premium" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contract_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contracts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "creator_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "content" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text",
    "total_amount" numeric(12,2),
    "currency" "text" DEFAULT 'USD'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "contract_number" "text",
    "locked" boolean DEFAULT false,
    "client_id" "uuid",
    "freelancer_id" "uuid",
    "deliverables" "jsonb",
    "timeline" "jsonb",
    "payment_type" "text" DEFAULT 'fixed'::"text",
    "escrow_status" "text",
    "signed_by_client" timestamp with time zone,
    "signed_by_freelancer" timestamp with time zone,
    "is_funded" boolean DEFAULT false,
    "payment_status" "text" DEFAULT 'unpaid'::"text",
    "ai_enhanced" boolean DEFAULT false,
    "original_description" "text",
    "client_email" "text",
    CONSTRAINT "contracts_escrow_status_check" CHECK (("escrow_status" = ANY (ARRAY[NULL::"text", 'pending'::"text", 'funded'::"text", 'released'::"text", 'refunded'::"text"]))),
    CONSTRAINT "contracts_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'funded'::"text", 'released'::"text", 'refunded'::"text", 'disputed'::"text"]))),
    CONSTRAINT "contracts_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['fixed'::"text", 'milestone'::"text", 'hourly'::"text"]))),
    CONSTRAINT "contracts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'awaiting_freelancer_review'::"text", 'freelancer_accepted'::"text", 'pending'::"text", 'signed'::"text", 'funded'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text", 'disputed'::"text"])))
);


ALTER TABLE "public"."contracts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."contracts"."client_email" IS 'The email address of the client who receives the contract';



CREATE TABLE IF NOT EXISTS "public"."feedback" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rating" integer,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "feedback_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."milestones" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "amount" numeric(12,2) NOT NULL,
    "due_date" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    CONSTRAINT "milestones_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'disputed'::"text"])))
);


ALTER TABLE "public"."milestones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "related_entity_type" "text",
    "related_entity_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "milestone_id" "uuid",
    "payer_id" "uuid" NOT NULL,
    "payee_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "fee" numeric(12,2) NOT NULL,
    "net_amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "stripe_payment_intent_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_escrow'::"text", 'released'::"text", 'refunded'::"text", 'disputed'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "user_type" "text" DEFAULT 'both'::"text",
    "company_name" "text",
    "website" "text",
    "bio" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "available_contracts" integer DEFAULT 3,
    "subscription_tier" "text" DEFAULT 'free'::"text",
    "subscription_start_date" timestamp with time zone,
    "subscription_end_date" timestamp with time zone,
    "stripe_customer_id" "text",
    CONSTRAINT "profiles_subscription_tier_check" CHECK (("subscription_tier" = ANY (ARRAY['free'::"text", 'professional'::"text", 'business'::"text"]))),
    CONSTRAINT "profiles_user_type_check" CHECK (("user_type" = ANY (ARRAY['freelancer'::"text", 'client'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."submissions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "submission_url" "text",
    "notes" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "approved_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "rejection_reason" "text"
);


ALTER TABLE "public"."submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "subscription_id" "uuid",
    "data" "jsonb" NOT NULL,
    "processed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscription_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "invoice_id" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "status" "text" NOT NULL,
    "payment_date" timestamp with time zone NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "receipt_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "subscription_payments_status_check" CHECK (("status" = ANY (ARRAY['paid'::"text", 'pending'::"text", 'failed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."subscription_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_plans" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price_monthly" numeric(10,2) NOT NULL,
    "price_yearly" numeric(10,2) NOT NULL,
    "escrow_fee_percentage" numeric(5,2) NOT NULL,
    "max_contracts" integer,
    "features" "jsonb",
    "stripe_price_id_monthly" "text",
    "stripe_price_id_yearly" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscription_plans" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_public_info" AS
 SELECT "users"."id",
    "users"."email",
    "users"."created_at",
    "users"."updated_at"
   FROM "auth"."users";


ALTER TABLE "public"."user_public_info" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_subscriptions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "stripe_subscription_id" "text",
    "current_period_start" timestamp with time zone NOT NULL,
    "current_period_end" timestamp with time zone NOT NULL,
    "cancel_at_period_end" boolean DEFAULT false,
    "stripe_price_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_payment_date" timestamp with time zone,
    "next_payment_date" timestamp with time zone,
    "cancel_at" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    "days_until_due" integer DEFAULT 0,
    "collection_method" "text",
    "latest_invoice_id" "text",
    CONSTRAINT "user_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'cancelled'::"text", 'past_due'::"text", 'trialing'::"text"])))
);


ALTER TABLE "public"."user_subscriptions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_user_id_contact_id_key" UNIQUE ("user_id", "contact_id");



ALTER TABLE ONLY "public"."contract_comments"
    ADD CONSTRAINT "contract_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_escrows"
    ADD CONSTRAINT "contract_escrows_contract_id_key" UNIQUE ("contract_id");



ALTER TABLE ONLY "public"."contract_escrows"
    ADD CONSTRAINT "contract_escrows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_parties"
    ADD CONSTRAINT "contract_parties_contract_id_user_id_key" UNIQUE ("contract_id", "user_id");



ALTER TABLE ONLY "public"."contract_parties"
    ADD CONSTRAINT "contract_parties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_payments"
    ADD CONSTRAINT "contract_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_signatures"
    ADD CONSTRAINT "contract_signatures_contract_id_user_id_key" UNIQUE ("contract_id", "user_id");



ALTER TABLE ONLY "public"."contract_signatures"
    ADD CONSTRAINT "contract_signatures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_suggestions"
    ADD CONSTRAINT "contract_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_templates"
    ADD CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_contract_number_key" UNIQUE ("contract_number");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_contract_id_user_id_key" UNIQUE ("contract_id", "user_id");



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."milestones"
    ADD CONSTRAINT "milestones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_events"
    ADD CONSTRAINT "subscription_events_event_id_key" UNIQUE ("event_id");



ALTER TABLE ONLY "public"."subscription_events"
    ADD CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_payments"
    ADD CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_user_id_key" UNIQUE ("user_id");



CREATE INDEX "idx_subscription_events_event_type" ON "public"."subscription_events" USING "btree" ("event_type");



CREATE INDEX "idx_subscription_events_subscription_id" ON "public"."subscription_events" USING "btree" ("subscription_id");



CREATE INDEX "idx_subscription_payments_invoice_id" ON "public"."subscription_payments" USING "btree" ("invoice_id");



CREATE INDEX "idx_subscription_payments_subscription_id" ON "public"."subscription_payments" USING "btree" ("subscription_id");



CREATE INDEX "milestones_contract_id_idx" ON "public"."milestones" USING "btree" ("contract_id");



CREATE OR REPLACE TRIGGER "check_milestones_completion_trigger" AFTER UPDATE ON "public"."milestones" FOR EACH ROW EXECUTE FUNCTION "public"."check_all_milestones_completed"();



CREATE OR REPLACE TRIGGER "contract_escrow_funded" AFTER INSERT ON "public"."contract_escrows" FOR EACH ROW EXECUTE FUNCTION "public"."update_contract_funded_status"();



CREATE OR REPLACE TRIGGER "set_contract_number_trigger" BEFORE INSERT ON "public"."contracts" FOR EACH ROW WHEN (("new"."contract_number" IS NULL)) EXECUTE FUNCTION "public"."set_contract_number"();



CREATE OR REPLACE TRIGGER "update_available_contracts_trigger" AFTER INSERT ON "public"."contracts" FOR EACH ROW EXECUTE FUNCTION "public"."update_available_contracts"();



CREATE OR REPLACE TRIGGER "update_contract_status_trigger" AFTER INSERT ON "public"."contract_signatures" FOR EACH ROW EXECUTE FUNCTION "public"."update_contract_status_on_signature"();



CREATE OR REPLACE TRIGGER "update_contract_suggestions_updated_at" BEFORE UPDATE ON "public"."contract_suggestions" FOR EACH ROW EXECUTE FUNCTION "public"."update_contract_suggestions_updated_at"();



CREATE OR REPLACE TRIGGER "update_milestones_updated_at" BEFORE UPDATE ON "public"."milestones" FOR EACH ROW EXECUTE FUNCTION "public"."update_milestones_updated_at"();



CREATE OR REPLACE TRIGGER "update_subscription_on_payment_trigger" AFTER INSERT OR UPDATE ON "public"."subscription_payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_subscription_on_payment"();



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contract_comments"
    ADD CONSTRAINT "contract_comments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_comments"
    ADD CONSTRAINT "contract_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contract_escrows"
    ADD CONSTRAINT "contract_escrows_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_escrows"
    ADD CONSTRAINT "contract_escrows_funded_by_fkey" FOREIGN KEY ("funded_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_escrows"
    ADD CONSTRAINT "contract_escrows_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."contract_payments"("id");



ALTER TABLE ONLY "public"."contract_escrows"
    ADD CONSTRAINT "contract_escrows_released_to_fkey" FOREIGN KEY ("released_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."contract_parties"
    ADD CONSTRAINT "contract_parties_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id");



ALTER TABLE ONLY "public"."contract_parties"
    ADD CONSTRAINT "contract_parties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contract_payments"
    ADD CONSTRAINT "contract_payments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_payments"
    ADD CONSTRAINT "contract_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_signatures"
    ADD CONSTRAINT "contract_signatures_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_signatures"
    ADD CONSTRAINT "contract_signatures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contract_suggestions"
    ADD CONSTRAINT "contract_suggestions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_suggestions"
    ADD CONSTRAINT "contract_suggestions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_freelancer_id_fkey" FOREIGN KEY ("freelancer_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."contract_templates"("id");



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."milestones"
    ADD CONSTRAINT "milestones_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."subscription_events"
    ADD CONSTRAINT "subscription_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."user_subscriptions"("id");



ALTER TABLE ONLY "public"."subscription_payments"
    ADD CONSTRAINT "subscription_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."user_subscriptions"("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



CREATE POLICY "Anyone can view contract templates" ON "public"."contract_templates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone can view subscription plans" ON "public"."subscription_plans" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Contract creator can add milestones" ON "public"."milestones" FOR INSERT TO "authenticated" WITH CHECK (("contract_id" IN ( SELECT "contracts"."id"
   FROM "public"."contracts"
  WHERE ("contracts"."creator_id" = "auth"."uid"()))));



CREATE POLICY "Contract creator can update contract" ON "public"."contracts" FOR UPDATE TO "authenticated" USING ((("creator_id" = "auth"."uid"()) AND (NOT "locked")));



CREATE POLICY "Contract creator can update milestone status" ON "public"."milestones" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."contracts"
  WHERE (("contracts"."id" = "milestones"."contract_id") AND ("contracts"."creator_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."contracts"
  WHERE (("contracts"."id" = "milestones"."contract_id") AND ("contracts"."creator_id" = "auth"."uid"())))));



CREATE POLICY "Contract creator can update suggestion status" ON "public"."contract_suggestions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."contracts"
  WHERE (("contracts"."id" = "contract_suggestions"."contract_id") AND ("contracts"."creator_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."contracts"
  WHERE (("contracts"."id" = "contract_suggestions"."contract_id") AND ("contracts"."creator_id" = "auth"."uid"())))));



CREATE POLICY "Contract parties can read milestones" ON "public"."milestones" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."contract_parties"
  WHERE (("contract_parties"."contract_id" = "contract_parties"."contract_id") AND ("contract_parties"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."contracts"
  WHERE (("contracts"."id" = "milestones"."contract_id") AND ("contracts"."creator_id" = "auth"."uid"()))))));



CREATE POLICY "Contract parties can read suggestions" ON "public"."contract_suggestions" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."contract_parties"
  WHERE (("contract_parties"."contract_id" = "contract_parties"."contract_id") AND ("contract_parties"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."contracts"
  WHERE (("contracts"."id" = "contract_suggestions"."contract_id") AND ("contracts"."creator_id" = "auth"."uid"()))))));



CREATE POLICY "Contract parties can view escrow details" ON "public"."contract_escrows" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."contracts" "c"
  WHERE (("c"."id" = "contract_escrows"."contract_id") AND (("c"."creator_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."contract_parties" "cp"
          WHERE (("cp"."contract_id" = "cp"."contract_id") AND ("cp"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Freelancers can create milestones" ON "public"."milestones" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."contract_parties"
  WHERE (("contract_parties"."contract_id" = "contract_parties"."contract_id") AND ("contract_parties"."user_id" = "auth"."uid"()) AND ("contract_parties"."role" = 'freelancer'::"text")))));



CREATE POLICY "Freelancers can create suggestions" ON "public"."contract_suggestions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."contract_parties"
  WHERE (("contract_parties"."contract_id" = "contract_parties"."contract_id") AND ("contract_parties"."user_id" = "auth"."uid"()) AND ("contract_parties"."role" = 'freelancer'::"text")))));



CREATE POLICY "Freelancers can mark milestones as in progress" ON "public"."milestones" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."contract_parties"
  WHERE (("contract_parties"."contract_id" = "contract_parties"."contract_id") AND ("contract_parties"."user_id" = "auth"."uid"()) AND ("contract_parties"."role" = 'freelancer'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."contract_parties"
  WHERE (("contract_parties"."contract_id" = "contract_parties"."contract_id") AND ("contract_parties"."user_id" = "auth"."uid"()) AND ("contract_parties"."role" = 'freelancer'::"text")))));



CREATE POLICY "Only authenticated users can create payments" ON "public"."contract_payments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Only system can insert escrow records" ON "public"."contract_escrows" FOR INSERT WITH CHECK (("auth"."uid"() = "funded_by"));



CREATE POLICY "Users can add comments to contracts they're a party to" ON "public"."contract_comments" FOR INSERT TO "authenticated" WITH CHECK (("contract_id" IN ( SELECT "contracts"."id"
   FROM "public"."contracts"
  WHERE ("contracts"."creator_id" = "auth"."uid"())
UNION
 SELECT "contract_parties"."contract_id"
   FROM "public"."contract_parties"
  WHERE ("contract_parties"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can add contacts" ON "public"."contacts" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can add parties to their contracts" ON "public"."contract_parties" FOR INSERT TO "authenticated" WITH CHECK (("contract_id" IN ( SELECT "contracts"."id"
   FROM "public"."contracts"
  WHERE ("contracts"."creator_id" = "auth"."uid"()))));



CREATE POLICY "Users can add submissions to contracts they're a party to" ON "public"."submissions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("contract_id" IN ( SELECT "contracts"."id"
   FROM "public"."contracts"
  WHERE ("contracts"."creator_id" = "auth"."uid"())
UNION
 SELECT "contract_parties"."contract_id"
   FROM "public"."contract_parties"
  WHERE ("contract_parties"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can add their own feedback" ON "public"."feedback" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("contract_id" IN ( SELECT "contracts"."id"
   FROM "public"."contracts"
  WHERE ("contracts"."creator_id" = "auth"."uid"())
UNION
 SELECT "contract_parties"."contract_id"
   FROM "public"."contract_parties"
  WHERE ("contract_parties"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can add their own signatures" ON "public"."contract_signatures" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("contract_id" IN ( SELECT "contracts"."id"
   FROM "public"."contracts"
  WHERE ("contracts"."creator_id" = "auth"."uid"())
UNION
 SELECT "contract_parties"."contract_id"
   FROM "public"."contract_parties"
  WHERE ("contract_parties"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own contracts" ON "public"."contracts" FOR INSERT TO "authenticated" WITH CHECK (("creator_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can view comments on contracts they're a party to" ON "public"."contract_comments" FOR SELECT TO "authenticated" USING (("contract_id" IN ( SELECT "contracts"."id"
   FROM "public"."contracts"
  WHERE ("contracts"."creator_id" = "auth"."uid"())
UNION
 SELECT "contract_parties"."contract_id"
   FROM "public"."contract_parties"
  WHERE ("contract_parties"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view contracts they're part of" ON "public"."contracts" FOR SELECT TO "authenticated" USING ((("creator_id" = "auth"."uid"()) OR ("id" IN ( SELECT "contract_parties"."contract_id"
   FROM "public"."contract_parties"
  WHERE (("contract_parties"."user_id" = "auth"."uid"()) OR ("contract_parties"."email" = (( SELECT "users"."email"
           FROM "auth"."users"
          WHERE ("users"."id" = "auth"."uid"())))::"text"))))));



CREATE POLICY "Users can view feedback on contracts they're a party to" ON "public"."feedback" FOR SELECT TO "authenticated" USING (("contract_id" IN ( SELECT "contracts"."id"
   FROM "public"."contracts"
  WHERE ("contracts"."creator_id" = "auth"."uid"())
UNION
 SELECT "contract_parties"."contract_id"
   FROM "public"."contract_parties"
  WHERE ("contract_parties"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view milestones for their contracts" ON "public"."milestones" FOR SELECT TO "authenticated" USING (("contract_id" IN ( SELECT "contracts"."id"
   FROM "public"."contracts"
  WHERE (("contracts"."id" IN ( SELECT "contract_parties"."contract_id"
           FROM "public"."contract_parties"
          WHERE ("contract_parties"."user_id" = "auth"."uid"()))) OR ("contracts"."creator_id" = "auth"."uid"())))));



CREATE POLICY "Users can view payments they're involved in" ON "public"."payments" FOR SELECT TO "authenticated" USING ((("payer_id" = "auth"."uid"()) OR ("payee_id" = "auth"."uid"())));



CREATE POLICY "Users can view signatures on contracts they're a party to" ON "public"."contract_signatures" FOR SELECT TO "authenticated" USING (("contract_id" IN ( SELECT "contracts"."id"
   FROM "public"."contracts"
  WHERE ("contracts"."creator_id" = "auth"."uid"())
UNION
 SELECT "contract_parties"."contract_id"
   FROM "public"."contract_parties"
  WHERE ("contract_parties"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view submissions on contracts they're a party to" ON "public"."submissions" FOR SELECT TO "authenticated" USING (("contract_id" IN ( SELECT "contracts"."id"
   FROM "public"."contracts"
  WHERE ("contracts"."creator_id" = "auth"."uid"())
UNION
 SELECT "contract_parties"."contract_id"
   FROM "public"."contract_parties"
  WHERE ("contract_parties"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view their own contacts" ON "public"."contacts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own contract payments" ON "public"."contract_payments" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."contracts" "c"
  WHERE (("c"."id" = "contract_payments"."contract_id") AND (("c"."creator_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."contract_parties" "cp"
          WHERE (("cp"."contract_id" = "cp"."contract_id") AND ("cp"."user_id" = "auth"."uid"()))))))))));



CREATE POLICY "Users can view their own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own party entries" ON "public"."contract_parties" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can view their own subscription events" ON "public"."subscription_events" FOR SELECT TO "authenticated" USING (("subscription_id" IN ( SELECT "user_subscriptions"."id"
   FROM "public"."user_subscriptions"
  WHERE ("user_subscriptions"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view their own subscription payments" ON "public"."subscription_payments" FOR SELECT TO "authenticated" USING (("subscription_id" IN ( SELECT "user_subscriptions"."id"
   FROM "public"."user_subscriptions"
  WHERE ("user_subscriptions"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view their own subscriptions" ON "public"."user_subscriptions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_escrows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_parties" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_signatures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contracts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."milestones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_subscriptions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."check_all_milestones_completed"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_all_milestones_completed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_all_milestones_completed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_user_exists"("email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_user_exists"("email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_user_exists"("email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."exec_sql"("query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."exec_sql"("query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."exec_sql"("query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."exec_sql"("query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_contract_count"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_contract_count"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_contract_count"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_contract_related_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_contract_related_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_contract_related_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_profile_data"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_profile_data"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_profile_data"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."link_email_contracts_to_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."link_email_contracts_to_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_email_contracts_to_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."send_contract_to_email"("p_contract_id" "uuid", "p_email" "text", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."send_contract_to_email"("p_contract_id" "uuid", "p_email" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_contract_to_email"("p_contract_id" "uuid", "p_email" "text", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."send_contract_to_freelancer"("contract_id" "uuid", "freelancer_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."send_contract_to_freelancer"("contract_id" "uuid", "freelancer_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_contract_to_freelancer"("contract_id" "uuid", "freelancer_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_contract_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_contract_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_contract_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_available_contracts"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_available_contracts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_available_contracts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_contract_funded_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_contract_funded_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_contract_funded_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_contract_status_on_signature"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_contract_status_on_signature"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_contract_status_on_signature"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_contract_suggestions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_contract_suggestions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_contract_suggestions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_milestones_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_milestones_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_milestones_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_subscription_on_payment"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_subscription_on_payment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_subscription_on_payment"() TO "service_role";


















GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."contract_comments" TO "anon";
GRANT ALL ON TABLE "public"."contract_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_comments" TO "service_role";



GRANT ALL ON TABLE "public"."contract_escrows" TO "anon";
GRANT ALL ON TABLE "public"."contract_escrows" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_escrows" TO "service_role";



GRANT ALL ON TABLE "public"."contract_parties" TO "anon";
GRANT ALL ON TABLE "public"."contract_parties" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_parties" TO "service_role";



GRANT ALL ON TABLE "public"."contract_payments" TO "anon";
GRANT ALL ON TABLE "public"."contract_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_payments" TO "service_role";



GRANT ALL ON TABLE "public"."contract_related_users" TO "anon";
GRANT ALL ON TABLE "public"."contract_related_users" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_related_users" TO "service_role";



GRANT ALL ON TABLE "public"."contract_signatures" TO "anon";
GRANT ALL ON TABLE "public"."contract_signatures" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_signatures" TO "service_role";



GRANT ALL ON TABLE "public"."contract_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."contract_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."contract_templates" TO "anon";
GRANT ALL ON TABLE "public"."contract_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_templates" TO "service_role";



GRANT ALL ON TABLE "public"."contracts" TO "anon";
GRANT ALL ON TABLE "public"."contracts" TO "authenticated";
GRANT ALL ON TABLE "public"."contracts" TO "service_role";



GRANT ALL ON TABLE "public"."feedback" TO "anon";
GRANT ALL ON TABLE "public"."feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback" TO "service_role";



GRANT ALL ON TABLE "public"."milestones" TO "anon";
GRANT ALL ON TABLE "public"."milestones" TO "authenticated";
GRANT ALL ON TABLE "public"."milestones" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."submissions" TO "anon";
GRANT ALL ON TABLE "public"."submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."submissions" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_events" TO "anon";
GRANT ALL ON TABLE "public"."subscription_events" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_events" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_payments" TO "anon";
GRANT ALL ON TABLE "public"."subscription_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_payments" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_plans" TO "anon";
GRANT ALL ON TABLE "public"."subscription_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_plans" TO "service_role";



GRANT ALL ON TABLE "public"."user_public_info" TO "anon";
GRANT ALL ON TABLE "public"."user_public_info" TO "authenticated";
GRANT ALL ON TABLE "public"."user_public_info" TO "service_role";



GRANT ALL ON TABLE "public"."user_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
