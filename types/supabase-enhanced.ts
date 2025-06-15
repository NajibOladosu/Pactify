export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      contacts: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          notes: string | null
          relationship: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          relationship?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          relationship?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_activities: {
        Row: {
          activity_type: string
          contract_id: string
          created_at: string | null
          description: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          activity_type: string
          contract_id: string
          created_at?: string | null
          description: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          activity_type?: string
          contract_id?: string
          created_at?: string | null
          description?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_activities_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_deliverables: {
        Row: {
          contract_id: string
          created_at: string | null
          description: string | null
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          is_final: boolean | null
          milestone_id: string | null
          uploaded_by: string
          version: number | null
        }
        Insert: {
          contract_id: string
          created_at?: string | null
          description?: string | null
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id?: string
          is_final?: boolean | null
          milestone_id?: string | null
          uploaded_by: string
          version?: number | null
        }
        Update: {
          contract_id?: string
          created_at?: string | null
          description?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          is_final?: boolean | null
          milestone_id?: string | null
          uploaded_by?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_deliverables_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_deliverables_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "contract_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_deliverables_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_disputes: {
        Row: {
          contract_id: string
          created_at: string | null
          description: string
          dispute_type: string
          id: string
          initiated_by: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string | null
          description: string
          dispute_type: string
          id?: string
          initiated_by: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string | null
          description?: string
          dispute_type?: string
          id?: string
          initiated_by?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_disputes_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_disputes_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_milestones: {
        Row: {
          amount: number
          completed_at: string | null
          contract_id: string
          created_at: string | null
          deliverables: string[] | null
          description: string | null
          due_date: string | null
          id: string
          order_index: number
          status: Database["public"]["Enums"]["milestone_status_enhanced"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          completed_at?: string | null
          contract_id: string
          created_at?: string | null
          deliverables?: string[] | null
          description?: string | null
          due_date?: string | null
          id?: string
          order_index: number
          status?: Database["public"]["Enums"]["milestone_status_enhanced"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          completed_at?: string | null
          contract_id?: string
          created_at?: string | null
          deliverables?: string[] | null
          description?: string | null
          due_date?: string | null
          id?: string
          order_index?: number
          status?: Database["public"]["Enums"]["milestone_status_enhanced"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_milestones_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_notifications: {
        Row: {
          action_url: string | null
          contract_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          notification_type: string
          title: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          contract_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          notification_type: string
          title: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          contract_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          notification_type?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_notifications_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_reviews: {
        Row: {
          contract_id: string
          created_at: string | null
          feedback: string | null
          id: string
          milestone_id: string | null
          rating: number | null
          review_type: string
          reviewer_id: string
          revision_notes: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string | null
          feedback?: string | null
          id?: string
          milestone_id?: string | null
          rating?: number | null
          review_type: string
          reviewer_id: string
          revision_notes?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string | null
          feedback?: string | null
          id?: string
          milestone_id?: string | null
          rating?: number | null
          review_type?: string
          reviewer_id?: string
          revision_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_reviews_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_reviews_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "contract_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          ai_enhanced: boolean | null
          client_email: string | null
          client_id: string | null
          client_signed_at: string | null
          completed_at: string | null
          content: Json
          contract_number: string | null
          created_at: string | null
          creator_id: string
          currency: string | null
          deliverables: Json | null
          description: string | null
          end_date: string | null
          escrow_status: string | null
          freelancer_id: string | null
          freelancer_signed_at: string | null
          id: string
          is_funded: boolean | null
          locked: boolean | null
          original_description: string | null
          payment_status: string | null
          payment_type: string | null
          signed_by_client: string | null
          signed_by_freelancer: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["contract_status"] | null
          template_id: string | null
          terms_and_conditions: string | null
          timeline: Json | null
          title: string
          total_amount: number | null
          type: Database["public"]["Enums"]["contract_type"] | null
          updated_at: string | null
        }
        Insert: {
          ai_enhanced?: boolean | null
          client_email?: string | null
          client_id?: string | null
          client_signed_at?: string | null
          completed_at?: string | null
          content: Json
          contract_number?: string | null
          created_at?: string | null
          creator_id: string
          currency?: string | null
          deliverables?: Json | null
          description?: string | null
          end_date?: string | null
          escrow_status?: string | null
          freelancer_id?: string | null
          freelancer_signed_at?: string | null
          id?: string
          is_funded?: boolean | null
          locked?: boolean | null
          original_description?: string | null
          payment_status?: string | null
          payment_type?: string | null
          signed_by_client?: string | null
          signed_by_freelancer?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"] | null
          template_id?: string | null
          terms_and_conditions?: string | null
          timeline?: Json | null
          title: string
          total_amount?: number | null
          type?: Database["public"]["Enums"]["contract_type"] | null
          updated_at?: string | null
        }
        Update: {
          ai_enhanced?: boolean | null
          client_email?: string | null
          client_id?: string | null
          client_signed_at?: string | null
          completed_at?: string | null
          content?: Json
          contract_number?: string | null
          created_at?: string | null
          creator_id?: string
          currency?: string | null
          deliverables?: Json | null
          description?: string | null
          end_date?: string | null
          escrow_status?: string | null
          freelancer_id?: string | null
          freelancer_signed_at?: string | null
          id?: string
          is_funded?: boolean | null
          locked?: boolean | null
          original_description?: string | null
          payment_status?: string | null
          payment_type?: string | null
          signed_by_client?: string | null
          signed_by_freelancer?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"] | null
          template_id?: string | null
          terms_and_conditions?: string | null
          timeline?: Json | null
          title?: string
          total_amount?: number | null
          type?: Database["public"]["Enums"]["contract_type"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "user_public_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "user_public_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow_payments: {
        Row: {
          amount: number
          contract_id: string
          created_at: string | null
          funded_at: string | null
          id: string
          milestone_id: string | null
          platform_fee: number
          refunded_at: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["payment_status_enhanced"] | null
          stripe_fee: number | null
          stripe_payment_intent_id: string | null
          stripe_transfer_id: string | null
          total_charged: number
          updated_at: string | null
        }
        Insert: {
          amount: number
          contract_id: string
          created_at?: string | null
          funded_at?: string | null
          id?: string
          milestone_id?: string | null
          platform_fee: number
          refunded_at?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["payment_status_enhanced"] | null
          stripe_fee?: number | null
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          total_charged: number
          updated_at?: string | null
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string | null
          funded_at?: string | null
          id?: string
          milestone_id?: string | null
          platform_fee?: number
          refunded_at?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["payment_status_enhanced"] | null
          stripe_fee?: number | null
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          total_charged?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escrow_payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_payments_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "contract_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_verifications: {
        Row: {
          approved_at: string | null
          created_at: string | null
          id: string
          profile_id: string
          rejected_at: string | null
          rejection_reason: string | null
          required_documents: string[] | null
          status: Database["public"]["Enums"]["kyc_status_enhanced"] | null
          stripe_account_id: string | null
          submitted_at: string | null
          submitted_documents: Json | null
          updated_at: string | null
          verification_data: Json | null
          verification_level: string | null
        }
        Insert: {
          approved_at?: string | null
          created_at?: string | null
          id?: string
          profile_id: string
          rejected_at?: string | null
          rejection_reason?: string | null
          required_documents?: string[] | null
          status?: Database["public"]["Enums"]["kyc_status_enhanced"] | null
          stripe_account_id?: string | null
          submitted_at?: string | null
          submitted_documents?: Json | null
          updated_at?: string | null
          verification_data?: Json | null
          verification_level?: string | null
        }
        Update: {
          approved_at?: string | null
          created_at?: string | null
          id?: string
          profile_id?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          required_documents?: string[] | null
          status?: Database["public"]["Enums"]["kyc_status_enhanced"] | null
          stripe_account_id?: string | null
          submitted_at?: string | null
          submitted_documents?: Json | null
          updated_at?: string | null
          verification_data?: Json | null
          verification_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_verifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          available_contracts: number | null
          avatar_url: string | null
          bio: string | null
          company_name: string | null
          created_at: string | null
          display_name: string | null
          id: string
          kyc_status: Database["public"]["Enums"]["kyc_status"] | null
          stripe_connect_account_id: string | null
          stripe_customer_id: string | null
          subscription_end_date: string | null
          subscription_start_date: string | null
          subscription_tier: string | null
          updated_at: string | null
          user_type: string | null
          verification_level: string | null
          website: string | null
        }
        Insert: {
          available_contracts?: number | null
          avatar_url?: string | null
          bio?: string | null
          company_name?: string | null
          created_at?: string | null
          display_name?: string | null
          id: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"] | null
          stripe_connect_account_id?: string | null
          stripe_customer_id?: string | null
          subscription_end_date?: string | null
          subscription_start_date?: string | null
          subscription_tier?: string | null
          updated_at?: string | null
          user_type?: string | null
          verification_level?: string | null
          website?: string | null
        }
        Update: {
          available_contracts?: number | null
          avatar_url?: string | null
          bio?: string | null
          company_name?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"] | null
          stripe_connect_account_id?: string | null
          stripe_customer_id?: string | null
          subscription_end_date?: string | null
          subscription_start_date?: string | null
          subscription_tier?: string | null
          updated_at?: string | null
          user_type?: string | null
          verification_level?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "user_public_info"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      contract_related_users: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          email: string | null
          id: string | null
        }
        Relationships: []
      }
      user_public_info: {
        Row: {
          created_at: string | null
          email: string | null
          id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_platform_fee: {
        Args: {
          user_id: string
          amount: number
        }
        Returns: number
      }
      check_kyc_requirements: {
        Args: {
          p_user_id: string
          p_amount: number
        }
        Returns: {
          is_compliant: boolean
          required_level: string
          current_level: string
          verification_url: string
        }[]
      }
      create_escrow_payment: {
        Args: {
          p_contract_id: string
          p_milestone_id?: string
          p_amount: number
          p_stripe_payment_intent_id?: string
        }
        Returns: string
      }
      get_user_contracts: {
        Args: {
          p_user_id: string
        }
        Returns: {
          contract_id: string
          title: string
          description: string
          total_amount: number
          currency: string
          status: string
          type: string
          client_id: string
          freelancer_id: string
          creator_id: string
          created_at: string
          updated_at: string
          milestones_count: number
          completed_milestones: number
          pending_amount: number
          next_due_date: string
        }[]
      }
    }
    Enums: {
      contract_status:
        | "draft"
        | "pending_signatures"
        | "pending_funding"
        | "active"
        | "pending_delivery"
        | "in_review"
        | "revision_requested"
        | "pending_completion"
        | "completed"
        | "cancelled"
        | "disputed"
      contract_type: "fixed" | "milestone" | "hourly"
      kyc_status:
        | "not_started"
        | "in_progress"
        | "pending_review"
        | "approved"
        | "rejected"
        | "requires_action"
      kyc_status_enhanced:
        | "not_started"
        | "in_progress"
        | "pending_review"
        | "approved"
        | "rejected"
        | "requires_action"
      milestone_status:
        | "pending"
        | "in_progress"
        | "submitted"
        | "approved"
        | "revision_requested"
        | "completed"
      milestone_status_enhanced:
        | "pending"
        | "in_progress"
        | "submitted"
        | "approved"
        | "revision_requested"
        | "completed"
      payment_status:
        | "pending"
        | "funded"
        | "held"
        | "released"
        | "refunded"
        | "disputed"
      payment_status_enhanced:
        | "pending"
        | "funded"
        | "held"
        | "released"
        | "refunded"
        | "disputed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      contract_status: [
        "draft",
        "pending_signatures",
        "pending_funding",
        "active",
        "pending_delivery",
        "in_review",
        "revision_requested",
        "pending_completion",
        "completed",
        "cancelled",
        "disputed",
      ],
      contract_type: ["fixed", "milestone", "hourly"],
      kyc_status: [
        "not_started",
        "in_progress",
        "pending_review",
        "approved",
        "rejected",
        "requires_action",
      ],
      kyc_status_enhanced: [
        "not_started",
        "in_progress",
        "pending_review",
        "approved",
        "rejected",
        "requires_action",
      ],
      milestone_status: [
        "pending",
        "in_progress",
        "submitted",
        "approved",
        "revision_requested",
        "completed",
      ],
      milestone_status_enhanced: [
        "pending",
        "in_progress",
        "submitted",
        "approved",
        "revision_requested",
        "completed",
      ],
      payment_status: [
        "pending",
        "funded",
        "held",
        "released",
        "refunded",
        "disputed",
      ],
      payment_status_enhanced: [
        "pending",
        "funded",
        "held",
        "released",
        "refunded",
        "disputed",
      ],
    },
  },
} as const