import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { Database } from "@/types/supabase";
import { 
  SecurityMiddleware,
  ContractCreateSchema,
  ContractQuerySchema,
  validateAndSanitize,
  auditLogger,
  ErrorHandler
} from '@/utils/security';
import type { ContractCreate } from '@/utils/security';

type ContractInsert = Database["public"]["Tables"]["contracts"]["Insert"];

// Apply security middleware and validation
const secureHandler = SecurityMiddleware.withSecurity(
  async (request: NextRequest) => {
    try {
      const supabase = await createClient();
      
      // Get authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json(
          { error: "Unauthorized", message: "Authentication required" },
          { status: 401 }
        );
      }

      const body = await request.json();
      
      // Validate and sanitize input using schema
      const validatedData: ContractCreate = validateAndSanitize(ContractCreateSchema, body);

      // Check user's contract limits based on subscription
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_tier, available_contracts")
        .eq("id", user.id)
        .single();

      if (profile?.subscription_tier === "free" && profile?.available_contracts <= 0) {
        await auditLogger.logSecurityEvent({
          userId: user.id,
          action: 'contract_creation_blocked',
          resource: 'contract',
          details: { reason: 'subscription_limit_reached' },
          success: false,
          severity: 'medium'
        });
        
        return NextResponse.json(
          { error: "SUBSCRIPTION_LIMIT", message: "Contract limit reached for free plan" },
          { status: 403 }
        );
      }

      // Create contract data using validated input
      const contractData: ContractInsert = {
        title: validatedData.title,
        description: validatedData.description,
        creator_id: user.id,
        client_id: validatedData.client_id,
        freelancer_id: validatedData.freelancer_id,
        template_id: validatedData.template_id,
        content: validatedData.content,
        type: validatedData.type,
        total_amount: validatedData.total_amount,
        currency: validatedData.currency,
        start_date: validatedData.start_date,
        end_date: validatedData.end_date,
        terms_and_conditions: validatedData.terms_and_conditions,
        status: "draft",
        client_email: validatedData.client_email
      };

      // Insert contract
      const { data: contract, error: contractError } = await supabase
        .from("contracts")
        .insert(contractData)
        .select()
        .single();

      if (contractError) {
        await auditLogger.logSecurityEvent({
          userId: user.id,
          action: 'contract_creation_failed',
          resource: 'contract',
          details: { error: contractError.message },
          success: false,
          severity: 'medium'
        });
        
        console.error("Contract creation error:", contractError);
        return NextResponse.json(
          { error: "DATABASE_ERROR", message: "Failed to create contract" },
          { status: 500 }
        );
      }

      // Create milestones if this is a milestone contract
      if (validatedData.type === "milestone" && validatedData.milestones.length > 0) {
        const milestonesData = validatedData.milestones.map((milestone, index) => ({
          contract_id: contract.id,
          title: milestone.title,
          description: milestone.description,
          amount: milestone.amount,
          due_date: milestone.due_date,
          order_index: index + 1,
          deliverables: milestone.deliverables,
          status: "pending" as const
        }));

        const { error: milestonesError } = await supabase
          .from("milestones")
          .insert(milestonesData);

        if (milestonesError) {
          console.error("Milestones creation error:", milestonesError);
          // Rollback contract creation
          await supabase.from("contracts").delete().eq("id", contract.id);
          
          await auditLogger.logSecurityEvent({
            userId: user.id,
            action: 'milestones_creation_failed',
            resource: 'milestone',
            details: { contractId: contract.id, error: milestonesError.message },
            success: false,
            severity: 'medium'
          });
          
          return NextResponse.json(
            { error: "DATABASE_ERROR", message: "Failed to create milestones" },
            { status: 500 }
          );
        }
      }

      // Log contract creation activity
      await auditLogger.logContractEvent(
        'created',
        contract.id,
        user.id,
        {
          contract_type: validatedData.type,
          total_amount: validatedData.total_amount,
          currency: validatedData.currency,
          milestones_count: validatedData.milestones.length
        }
      );

      // Log in contract_activities table
      await supabase.from("contract_activities").insert({
        contract_id: contract.id,
        user_id: user.id,
        activity_type: "contract_created",
        description: `Contract "${validatedData.title}" created`,
        metadata: {
          contract_type: validatedData.type,
          total_amount: validatedData.total_amount,
          currency: validatedData.currency
        }
      });

      return NextResponse.json({
        success: true,
        contract,
        message: "Contract created successfully"
      });

    } catch (error) {
      return ErrorHandler.handleApiError(error, request);
    }
  },
  {
    rateLimit: { requests: 20, windowMs: 60 * 60 * 1000 }, // 20 contracts per hour
    validateInput: true,
    requireAuth: true,
    maxBodySize: 5 * 1024 * 1024, // 5MB for contract content
    allowedMethods: ['POST']
  }
);

export async function POST(request: NextRequest) {
  return secureHandler(request);
}

// Secure GET handler
const secureGetHandler = SecurityMiddleware.withSecurity(
  async (request: NextRequest) => {
    try {
      const supabase = await createClient();
      
      // Get authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json(
          { error: "Unauthorized", message: "Authentication required" },
          { status: 401 }
        );
      }

      const { searchParams } = new URL(request.url);
      
      // Validate query parameters
      const rawQueryData = {
        status: searchParams.get("status"),
        type: searchParams.get("type"),
        limit: searchParams.get("limit") || "10",
        offset: searchParams.get("offset") || "0"
      };
      const queryData = validateAndSanitize(ContractQuerySchema, rawQueryData) as {
        status?: string;
        type?: string;
        limit: number;
        offset: number;
      };

      let query = supabase
        .from("contracts")
        .select(`
          *,
          contract_templates(name, description),
          milestones(id, title, amount, status, due_date, order_index),
          contract_activities(
            id, activity_type, description, created_at,
            profiles(display_name)
          )
        `)
        .or(`creator_id.eq.${user.id},client_id.eq.${user.id},freelancer_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .range(queryData.offset, queryData.offset + queryData.limit - 1);

      if (queryData.status) {
        query = query.eq("status", queryData.status);
      }

      if (queryData.type) {
        query = query.eq("type", queryData.type);
      }

      const { data: contracts, error } = await query;

      if (error) {
        console.error("Contracts fetch error:", error);
        return NextResponse.json(
          { error: "DATABASE_ERROR", message: "Failed to fetch contracts" },
          { status: 500 }
        );
      }

      // Log data access
      await auditLogger.logSecurityEvent({
        userId: user.id,
        action: 'contracts_accessed',
        resource: 'contract',
        details: {
          filters: { status: queryData.status, type: queryData.type },
          count: contracts?.length || 0
        },
        success: true,
        severity: 'low'
      });

      return NextResponse.json({
        success: true,
        contracts: contracts || [],
        meta: {
          limit: queryData.limit,
          offset: queryData.offset,
          total: contracts?.length || 0
        }
      });

    } catch (error) {
      return ErrorHandler.handleApiError(error, request);
    }
  },
  {
    rateLimit: { requests: 100, windowMs: 15 * 60 * 1000 }, // 100 requests per 15 minutes
    validateInput: false, // Only query params, no body
    requireAuth: true,
    allowedMethods: ['GET']
  }
);

export async function GET(request: NextRequest) {
  return secureGetHandler(request);
}
