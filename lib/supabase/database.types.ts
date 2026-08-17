export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      app_errors: {
        Row: {
          actor: string | null
          at: string
          digest: string | null
          id: number
          message: string | null
          path: string | null
        }
        Insert: {
          actor?: string | null
          at?: string
          digest?: string | null
          id?: never
          message?: string | null
          path?: string | null
        }
        Update: {
          actor?: string | null
          at?: string
          digest?: string | null
          id?: never
          message?: string | null
          path?: string | null
        }
        Relationships: []
      }
      applied_migrations: {
        Row: {
          applied_at: string
          checksum: string
          filename: string
        }
        Insert: {
          applied_at?: string
          checksum: string
          filename: string
        }
        Update: {
          applied_at?: string
          checksum?: string
          filename?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          row_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          row_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          row_id?: string
          table_name?: string
        }
        Relationships: []
      }
      auth_verified_sessions: {
        Row: {
          created_at: string
          method: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          method: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          method?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      bill_approvers: {
        Row: {
          approval_limit: number | null
          granted_at: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          approval_limit?: number | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          approval_limit?: number | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_approvers_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_approvers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_counters: {
        Row: {
          last_no: number
          project_id: string
          scope: string
        }
        Insert: {
          last_no?: number
          project_id: string
          scope: string
        }
        Update: {
          last_no?: number
          project_id?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bill_no: number
          created_at: string
          created_by: string | null
          gst_amount: number
          id: string
          invoice_date: string
          invoice_no: string
          kind: string
          labour_contract_id: string | null
          note: string | null
          paid_at: string | null
          paid_by: string | null
          payment_ref: string | null
          plot_id: string | null
          po_id: string | null
          project_id: string
          reference: string
          rejection_note: string | null
          scope_code: string
          status: string
          taxable_amount: number
          total_amount: number
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bill_no: number
          created_at?: string
          created_by?: string | null
          gst_amount: number
          id?: string
          invoice_date: string
          invoice_no: string
          kind: string
          labour_contract_id?: string | null
          note?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_ref?: string | null
          plot_id?: string | null
          po_id?: string | null
          project_id: string
          reference: string
          rejection_note?: string | null
          scope_code: string
          status?: string
          taxable_amount: number
          total_amount: number
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bill_no?: number
          created_at?: string
          created_by?: string | null
          gst_amount?: number
          id?: string
          invoice_date?: string
          invoice_no?: string
          kind?: string
          labour_contract_id?: string | null
          note?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_ref?: string | null
          plot_id?: string | null
          po_id?: string | null
          project_id?: string
          reference?: string
          rejection_note?: string | null
          scope_code?: string
          status?: string
          taxable_amount?: number
          total_amount?: number
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_labour_contract_id_fkey"
            columns: ["labour_contract_id"]
            isOneToOne: false
            referencedRelation: "labour_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_billing_totals"
            referencedColumns: ["po_id"]
          },
          {
            foreignKeyName: "bills_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brands_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_lines: {
        Row: {
          budget_id: string
          budget_status: string | null
          client_rate: number | null
          created_at: string
          expected_vendor_id: string | null
          id: string
          line_key: string
          margin_pct: number | null
          needs_review: boolean
          notes: string | null
          priced_at: string | null
          priced_by: string | null
          quantity: number
          selection_id: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          budget_id: string
          budget_status?: string | null
          client_rate?: number | null
          created_at?: string
          expected_vendor_id?: string | null
          id?: string
          line_key: string
          margin_pct?: number | null
          needs_review?: boolean
          notes?: string | null
          priced_at?: string | null
          priced_by?: string | null
          quantity: number
          selection_id: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          budget_id?: string
          budget_status?: string | null
          client_rate?: number | null
          created_at?: string
          expected_vendor_id?: string | null
          id?: string
          line_key?: string
          margin_pct?: number | null
          needs_review?: boolean
          notes?: string | null
          priced_at?: string | null
          priced_by?: string | null
          quantity?: number
          selection_id?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_budget_id_selection_id_fkey"
            columns: ["budget_id", "selection_id"]
            isOneToOne: false
            referencedRelation: "approved_budgets"
            referencedColumns: ["id", "selection_id"]
          },
          {
            foreignKeyName: "budget_lines_budget_id_selection_id_fkey"
            columns: ["budget_id", "selection_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id", "selection_id"]
          },
          {
            foreignKeyName: "budget_lines_expected_vendor_id_fkey"
            columns: ["expected_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_priced_by_fkey"
            columns: ["priced_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_selection_id_line_key_fkey"
            columns: ["selection_id", "line_key"]
            isOneToOne: false
            referencedRelation: "selection_lines"
            referencedColumns: ["selection_id", "line_key"]
          },
        ]
      }
      budgets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          selection_id: string
          status: string
          unit_id: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          selection_id: string
          status?: string
          unit_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          selection_id?: string
          status?: string
          unit_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: true
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      business_plan_targets: {
        Row: {
          created_at: string
          id: string
          margin_pct: number | null
          pbt: number
          peak_funding: number
          plan_id: string
          plan_name: string
          project_id: string
          revenue: number
          scenario_name: string
          total_cost: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          margin_pct?: number | null
          pbt: number
          peak_funding: number
          plan_id: string
          plan_name: string
          project_id: string
          revenue: number
          scenario_name: string
          total_cost: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          margin_pct?: number | null
          pbt?: number
          peak_funding?: number
          plan_id?: string
          plan_name?: string
          project_id?: string
          revenue?: number
          scenario_name?: string
          total_cost?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_plan_targets_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "business_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_plan_targets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_plan_targets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_plans: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          inputs: Json
          location: string | null
          name: string
          project_id: string | null
          schema_version: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          inputs?: Json
          location?: string | null
          name: string
          project_id?: string | null
          schema_version?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          inputs?: Json
          location?: string | null
          name?: string
          project_id?: string | null
          schema_version?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_plans_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_engagements: {
        Row: {
          bottlenecks: string[]
          ca_ack: string | null
          ca_original_with: string | null
          ca_signed_on: string | null
          ca_status: string
          check_in_on: string | null
          construction_value: number | null
          created_at: string
          created_by: string | null
          crm_owner_id: string | null
          design_support: string | null
          details: string | null
          id: string
          plot_value: number | null
          project_id: string
          registration_note: string | null
          registration_on: string | null
          registration_stage: string
          sale_deed_ack: string | null
          sale_deed_original_with: string | null
          sale_deed_signed_on: string | null
          sale_deed_status: string
          unit_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bottlenecks?: string[]
          ca_ack?: string | null
          ca_original_with?: string | null
          ca_signed_on?: string | null
          ca_status?: string
          check_in_on?: string | null
          construction_value?: number | null
          created_at?: string
          created_by?: string | null
          crm_owner_id?: string | null
          design_support?: string | null
          details?: string | null
          id?: string
          plot_value?: number | null
          project_id: string
          registration_note?: string | null
          registration_on?: string | null
          registration_stage?: string
          sale_deed_ack?: string | null
          sale_deed_original_with?: string | null
          sale_deed_signed_on?: string | null
          sale_deed_status?: string
          unit_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bottlenecks?: string[]
          ca_ack?: string | null
          ca_original_with?: string | null
          ca_signed_on?: string | null
          ca_status?: string
          check_in_on?: string | null
          construction_value?: number | null
          created_at?: string
          created_by?: string | null
          crm_owner_id?: string | null
          design_support?: string | null
          details?: string | null
          id?: string
          plot_value?: number | null
          project_id?: string
          registration_note?: string | null
          registration_on?: string | null
          registration_stage?: string
          sale_deed_ack?: string | null
          sale_deed_original_with?: string | null
          sale_deed_signed_on?: string | null
          sale_deed_status?: string
          unit_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_engagements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_engagements_crm_owner_id_fkey"
            columns: ["crm_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_engagements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_engagements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_engagements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_payment_milestones: {
        Row: {
          created_at: string
          created_by: string | null
          due_amount: number | null
          due_on: string | null
          engagement_id: string
          id: string
          invoice_no: string | null
          invoiced_on: string | null
          note: string | null
          sort_order: number
          stage: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due_amount?: number | null
          due_on?: string | null
          engagement_id: string
          id?: string
          invoice_no?: string | null
          invoiced_on?: string | null
          note?: string | null
          sort_order?: number
          stage: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due_amount?: number | null
          due_on?: string | null
          engagement_id?: string
          id?: string
          invoice_no?: string | null
          invoiced_on?: string | null
          note?: string | null
          sort_order?: number
          stage?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_payment_milestones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_payment_milestones_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "client_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_payment_milestones_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_receipts: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          engagement_id: string
          id: string
          milestone_id: string | null
          mode: string
          note: string | null
          received_on: string
          reference: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          engagement_id: string
          id?: string
          milestone_id?: string | null
          mode?: string
          note?: string | null
          received_on?: string
          reference?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          engagement_id?: string
          id?: string
          milestone_id?: string | null
          mode?: string
          note?: string | null
          received_on?: string
          reference?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_receipts_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "client_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_receipts_milestone_fkey"
            columns: ["milestone_id", "engagement_id"]
            isOneToOne: false
            referencedRelation: "client_payment_milestones"
            referencedColumns: ["id", "engagement_id"]
          },
          {
            foreignKeyName: "client_receipts_milestone_fkey"
            columns: ["milestone_id", "engagement_id"]
            isOneToOne: false
            referencedRelation: "crm_milestone_facts"
            referencedColumns: ["id", "engagement_id"]
          },
          {
            foreignKeyName: "client_receipts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          converted_on: string | null
          created_at: string
          crm_owner_id: string | null
          email: string | null
          first_contact_on: string | null
          id: string
          is_active: boolean
          lost_reason: string | null
          mobile: string | null
          name: string
          notes: string | null
          source: string | null
          stage: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          converted_on?: string | null
          created_at?: string
          crm_owner_id?: string | null
          email?: string | null
          first_contact_on?: string | null
          id?: string
          is_active?: boolean
          lost_reason?: string | null
          mobile?: string | null
          name: string
          notes?: string | null
          source?: string | null
          stage?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          converted_on?: string | null
          created_at?: string
          crm_owner_id?: string | null
          email?: string | null
          first_contact_on?: string | null
          id?: string
          is_active?: boolean
          lost_reason?: string | null
          mobile?: string | null
          name?: string
          notes?: string | null
          source?: string | null
          stage?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_crm_owner_id_fkey"
            columns: ["crm_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_budget_lines: {
        Row: {
          budget_id: string
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          note: string | null
          quantity: number
          sort_order: number
          stage: string
          uom: string
          updated_at: string
        }
        Insert: {
          budget_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          note?: string | null
          quantity: number
          sort_order?: number
          stage: string
          uom: string
          updated_at?: string
        }
        Update: {
          budget_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          note?: string | null
          quantity?: number
          sort_order?: number
          stage?: string
          uom?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_budget_lines_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "construction_budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_budget_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_budget_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_budget_lines_stage_fkey"
            columns: ["stage"]
            isOneToOne: false
            referencedRelation: "construction_stages"
            referencedColumns: ["name"]
          },
        ]
      }
      construction_budgets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          project_id: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          project_id: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          project_id?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_budgets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_budgets_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_stages: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "construction_stages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_stages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_facilities: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          interest_rate_pct: number | null
          is_active: boolean
          kind: string
          party: string
          sanctioned_amount: number | null
          start_date: string | null
          terms: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          interest_rate_pct?: number | null
          is_active?: boolean
          kind: string
          party: string
          sanctioned_amount?: number | null
          start_date?: string | null
          terms?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          interest_rate_pct?: number | null
          is_active?: boolean
          kind?: string
          party?: string
          sanctioned_amount?: number | null
          start_date?: string | null
          terms?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funding_facilities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_facilities_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          facility_id: string
          happened_on: string
          id: string
          kind: string
          note: string | null
          reference: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          facility_id: string
          happened_on: string
          id?: string
          kind: string
          note?: string | null
          reference?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          facility_id?: string
          happened_on?: string
          id?: string
          kind?: string
          note?: string | null
          reference?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funding_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_movements_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "funding_facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_movements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipt_lines: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          note: string | null
          po_line_id: string
          quantity: number
          receipt_id: string
          uom: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          note?: string | null
          po_line_id: string
          quantity: number
          receipt_id: string
          uom: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          note?: string | null
          po_line_id?: string
          quantity?: number
          receipt_id?: string
          uom?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "po_line_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_lines_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          challan_no: string | null
          created_at: string
          created_by: string | null
          grn_no: number
          id: string
          note: string | null
          plot_id: string | null
          po_id: string
          project_id: string
          received_at: string
          reference: string
          store_id: string | null
          to_site: boolean
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          challan_no?: string | null
          created_at?: string
          created_by?: string | null
          grn_no: number
          id?: string
          note?: string | null
          plot_id?: string | null
          po_id: string
          project_id: string
          received_at?: string
          reference: string
          store_id?: string | null
          to_site?: boolean
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          challan_no?: string | null
          created_at?: string
          created_by?: string | null
          grn_no?: number
          id?: string
          note?: string | null
          plot_id?: string | null
          po_id?: string
          project_id?: string
          received_at?: string
          reference?: string
          store_id?: string | null
          to_site?: boolean
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_billing_totals"
            referencedColumns: ["po_id"]
          },
          {
            foreignKeyName: "goods_receipts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_counters: {
        Row: {
          last_no: number
          project_id: string
        }
        Insert: {
          last_no?: number
          project_id: string
        }
        Update: {
          last_no?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grn_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_rates: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          rate: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          rate: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          rate?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gst_rates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      indent_approvers: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "indent_approvers_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indent_approvers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      indent_counters: {
        Row: {
          last_no: number
          project_id: string
        }
        Insert: {
          last_no?: number
          project_id: string
        }
        Update: {
          last_no?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "indent_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      indent_lines: {
        Row: {
          budget_id: string | null
          construction_line_id: string | null
          created_at: string
          created_by: string | null
          id: string
          indent_id: string
          item_id: string
          line_key: string | null
          note: string | null
          quantity: number
          uom: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          budget_id?: string | null
          construction_line_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          indent_id: string
          item_id: string
          line_key?: string | null
          note?: string | null
          quantity: number
          uom: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          budget_id?: string | null
          construction_line_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          indent_id?: string
          item_id?: string
          line_key?: string | null
          note?: string | null
          quantity?: number
          uom?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "indent_lines_budget_id_line_key_fkey"
            columns: ["budget_id", "line_key"]
            isOneToOne: false
            referencedRelation: "approved_budget_lines"
            referencedColumns: ["budget_id", "line_key"]
          },
          {
            foreignKeyName: "indent_lines_budget_id_line_key_fkey"
            columns: ["budget_id", "line_key"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["budget_id", "line_key"]
          },
          {
            foreignKeyName: "indent_lines_budget_id_line_key_fkey"
            columns: ["budget_id", "line_key"]
            isOneToOne: false
            referencedRelation: "budget_report_lines"
            referencedColumns: ["budget_id", "line_key"]
          },
          {
            foreignKeyName: "indent_lines_construction_line_id_fkey"
            columns: ["construction_line_id"]
            isOneToOne: false
            referencedRelation: "construction_budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indent_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indent_lines_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indent_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indent_lines_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      indents: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          indent_no: number
          note: string | null
          plot_id: string | null
          project_id: string
          reference: string
          rejection_note: string | null
          required_by: string | null
          stage: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          indent_no: number
          note?: string | null
          plot_id?: string | null
          project_id: string
          reference: string
          rejection_note?: string | null
          required_by?: string | null
          stage?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          indent_no?: number
          note?: string | null
          plot_id?: string | null
          project_id?: string
          reference?: string
          rejection_note?: string | null
          required_by?: string | null
          stage?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "indents_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_stage_fkey"
            columns: ["stage"]
            isOneToOne: false
            referencedRelation: "construction_stages"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "indents_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      iss_counters: {
        Row: {
          last_no: number
          project_id: string
        }
        Insert: {
          last_no?: number
          project_id: string
        }
        Update: {
          last_no?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iss_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      item_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          kind: string
          name: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind: string
          name: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      item_margins: {
        Row: {
          id: string
          item_id: string
          margin_pct: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          item_id: string
          margin_pct: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          item_id?: string
          margin_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_margins_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_margins_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      item_requests: {
        Row: {
          brand_id: string | null
          category_id: string | null
          created_at: string
          id: string
          merged_into_item_id: string | null
          provisional_item_id: string
          requested_by: string | null
          requested_name: string
          resolved_at: string | null
          resolved_by: string | null
          spec_note: string | null
          status: string
        }
        Insert: {
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          merged_into_item_id?: string | null
          provisional_item_id: string
          requested_by?: string | null
          requested_name: string
          resolved_at?: string | null
          resolved_by?: string | null
          spec_note?: string | null
          status?: string
        }
        Update: {
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          merged_into_item_id?: string | null
          provisional_item_id?: string
          requested_by?: string | null
          requested_name?: string
          resolved_at?: string | null
          resolved_by?: string | null
          spec_note?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_requests_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_requests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "item_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_requests_merged_into_item_id_fkey"
            columns: ["merged_into_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_requests_provisional_item_id_fkey"
            columns: ["provisional_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          brand_id: string | null
          category_id: string
          code: string | null
          created_at: string
          default_uom: string
          description: string | null
          id: string
          image_url: string | null
          indicative_price: number | null
          is_active: boolean
          is_provisional: boolean
          kind: string
          merged_into_item_id: string | null
          name: string
          placement: string | null
          source_url: string | null
          thumb_url: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          brand_id?: string | null
          category_id: string
          code?: string | null
          created_at?: string
          default_uom: string
          description?: string | null
          id?: string
          image_url?: string | null
          indicative_price?: number | null
          is_active?: boolean
          is_provisional?: boolean
          kind: string
          merged_into_item_id?: string | null
          name: string
          placement?: string | null
          source_url?: string | null
          thumb_url?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          brand_id?: string | null
          category_id?: string
          code?: string | null
          created_at?: string
          default_uom?: string
          description?: string | null
          id?: string
          image_url?: string | null
          indicative_price?: number | null
          is_active?: boolean
          is_provisional?: boolean
          kind?: string
          merged_into_item_id?: string | null
          name?: string
          placement?: string | null
          source_url?: string | null
          thumb_url?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "item_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_merged_into_item_id_fkey"
            columns: ["merged_into_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      labour_contracts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          contract_value: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_active: boolean
          plot_id: string | null
          project_id: string
          status: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          contract_value: number
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          is_active?: boolean
          plot_id?: string | null
          project_id: string
          status?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          contract_value?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_active?: boolean
          plot_id?: string | null
          project_id?: string
          status?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labour_contracts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_contracts_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_contracts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_contracts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_contracts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          failed_count: number
          kind: string
          locked_until: string | null
          target: string
          window_started_at: string
        }
        Insert: {
          failed_count?: number
          kind: string
          locked_until?: string | null
          target: string
          window_started_at?: string
        }
        Update: {
          failed_count?: number
          kind?: string
          locked_until?: string | null
          target?: string
          window_started_at?: string
        }
        Relationships: []
      }
      marathon_agents: {
        Row: {
          created_at: string
          id: string
          name: string
          pin_hash: string
          pin_salt: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          pin_hash: string
          pin_salt: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          pin_hash?: string
          pin_salt?: string
        }
        Relationships: []
      }
      marathon_categories: {
        Row: {
          bib_prefix: string
          color: string
          gender: string | null
          id: string
          max_age: number | null
          min_age: number | null
          name: string
          next_sequence: number
          run_id: string
        }
        Insert: {
          bib_prefix: string
          color: string
          gender?: string | null
          id?: string
          max_age?: number | null
          min_age?: number | null
          name: string
          next_sequence?: number
          run_id: string
        }
        Update: {
          bib_prefix?: string
          color?: string
          gender?: string | null
          id?: string
          max_age?: number | null
          min_age?: number | null
          name?: string
          next_sequence?: number
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marathon_categories_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "marathon_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      marathon_config: {
        Row: {
          admin_pin_hash: string
          admin_pin_salt: string
          event_name: string
          id: boolean
          updated_at: string
        }
        Insert: {
          admin_pin_hash: string
          admin_pin_salt: string
          event_name?: string
          id?: boolean
          updated_at?: string
        }
        Update: {
          admin_pin_hash?: string
          admin_pin_salt?: string
          event_name?: string
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      marathon_entries: {
        Row: {
          age: number
          agent_id: string
          bib: string
          category_id: string
          created_at: string
          gender: string
          group_id: string
          id: string
          mobile: string
          name: string
          run_id: string
          tee_size: string
        }
        Insert: {
          age: number
          agent_id: string
          bib: string
          category_id: string
          created_at?: string
          gender: string
          group_id: string
          id?: string
          mobile: string
          name: string
          run_id: string
          tee_size: string
        }
        Update: {
          age?: number
          agent_id?: string
          bib?: string
          category_id?: string
          created_at?: string
          gender?: string
          group_id?: string
          id?: string
          mobile?: string
          name?: string
          run_id?: string
          tee_size?: string
        }
        Relationships: [
          {
            foreignKeyName: "marathon_entries_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "marathon_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marathon_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "marathon_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marathon_entries_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "marathon_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marathon_entries_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "marathon_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      marathon_groups: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      marathon_pin_attempts: {
        Row: {
          failed_count: number
          locked_until: string | null
          target: string
          window_started_at: string
        }
        Insert: {
          failed_count?: number
          locked_until?: string | null
          target: string
          window_started_at?: string
        }
        Update: {
          failed_count?: number
          locked_until?: string | null
          target?: string
          window_started_at?: string
        }
        Relationships: []
      }
      marathon_runs: {
        Row: {
          distance_km: number | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          distance_km?: number | null
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          distance_km?: number | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      plots: {
        Row: {
          area: number | null
          code: string | null
          created_at: string
          id: string
          name: string
          project_id: string
          status: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          area?: number | null
          code?: string | null
          created_at?: string
          id?: string
          name: string
          project_id: string
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          area?: number | null
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plots_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      po_counters: {
        Row: {
          last_no: number
          project_id: string
          scope: string
        }
        Insert: {
          last_no?: number
          project_id: string
          scope: string
        }
        Update: {
          last_no?: number
          project_id?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          role: string
          role_id: string | null
          team: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          role?: string
          role_id?: string | null
          team?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: string
          role_id?: string | null
          team?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_stages: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          project_id: string
          sort_order: number
          updated_at: string
          updated_by: string | null
          weeks: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          project_id: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          weeks: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          project_id?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          weeks?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_stages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_stages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          code: string | null
          created_at: string
          id: string
          location: string | null
          name: string
          project_type: string
          status: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name: string
          project_type: string
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          project_type?: string
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          created_at: string
          created_by: string | null
          gst_pct: number | null
          id: string
          indent_line_id: string
          item_id: string
          note: string | null
          po_id: string
          quantity: number
          rate: number | null
          sort_order: number
          uom: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          gst_pct?: number | null
          id?: string
          indent_line_id: string
          item_id: string
          note?: string | null
          po_id: string
          quantity: number
          rate?: number | null
          sort_order?: number
          uom: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          gst_pct?: number | null
          id?: string
          indent_line_id?: string
          item_id?: string
          note?: string | null
          po_id?: string
          quantity?: number
          rate?: number | null
          sort_order?: number
          uom?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_indent_line_id_fkey"
            columns: ["indent_line_id"]
            isOneToOne: false
            referencedRelation: "indent_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_billing_totals"
            referencedColumns: ["po_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          deletion_note: string | null
          deletion_requested_at: string | null
          deletion_requested_by: string | null
          deliver_note: string | null
          deliver_store_id: string | null
          expected_by: string | null
          id: string
          issued_at: string | null
          issued_by: string | null
          note: string | null
          plot_id: string | null
          po_no: number
          project_id: string
          reference: string
          scope_code: string
          status: string
          terms: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          deletion_note?: string | null
          deletion_requested_at?: string | null
          deletion_requested_by?: string | null
          deliver_note?: string | null
          deliver_store_id?: string | null
          expected_by?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          note?: string | null
          plot_id?: string | null
          po_no: number
          project_id: string
          reference: string
          scope_code: string
          status?: string
          terms?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          deletion_note?: string | null
          deletion_requested_at?: string | null
          deletion_requested_by?: string | null
          deliver_note?: string | null
          deliver_store_id?: string | null
          expected_by?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          note?: string | null
          plot_id?: string | null
          po_no?: number
          project_id?: string
          reference?: string
          scope_code?: string
          status?: string
          terms?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_deletion_requested_by_fkey"
            columns: ["deletion_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_deliver_store_id_fkey"
            columns: ["deliver_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      pusher_activities: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pusher_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_activities_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pusher_chain_departments: {
        Row: {
          chain_id: string
          created_at: string
          created_by: string | null
          department_id: string
          id: string
        }
        Insert: {
          chain_id: string
          created_at?: string
          created_by?: string | null
          department_id: string
          id?: string
        }
        Update: {
          chain_id?: string
          created_at?: string
          created_by?: string | null
          department_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pusher_chain_departments_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "pusher_chain_state"
            referencedColumns: ["chain_id"]
          },
          {
            foreignKeyName: "pusher_chain_departments_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "pusher_chains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chain_departments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chain_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "pusher_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      pusher_chain_events: {
        Row: {
          actor_id: string
          chain_id: string
          from_leg: number | null
          id: string
          kind: string
          note: string | null
          occurred_at: string
          reason: string | null
          seq: number
          to_assignee_id: string | null
          to_expected_days: number | null
          to_leg: number | null
        }
        Insert: {
          actor_id?: string
          chain_id: string
          from_leg?: number | null
          id?: string
          kind: string
          note?: string | null
          occurred_at?: string
          reason?: string | null
          seq?: number
          to_assignee_id?: string | null
          to_expected_days?: number | null
          to_leg?: number | null
        }
        Update: {
          actor_id?: string
          chain_id?: string
          from_leg?: number | null
          id?: string
          kind?: string
          note?: string | null
          occurred_at?: string
          reason?: string | null
          seq?: number
          to_assignee_id?: string | null
          to_expected_days?: number | null
          to_leg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pusher_chain_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chain_events_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "pusher_chain_state"
            referencedColumns: ["chain_id"]
          },
          {
            foreignKeyName: "pusher_chain_events_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "pusher_chains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chain_events_to_assignee_id_fkey"
            columns: ["to_assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pusher_chain_legs: {
        Row: {
          activity_id: string
          assignee_id: string
          chain_id: string
          created_at: string
          created_by: string | null
          expected_days: number
          id: string
          label: string | null
          leg_no: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activity_id: string
          assignee_id: string
          chain_id: string
          created_at?: string
          created_by?: string | null
          expected_days: number
          id?: string
          label?: string | null
          leg_no: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activity_id?: string
          assignee_id?: string
          chain_id?: string
          created_at?: string
          created_by?: string | null
          expected_days?: number
          id?: string
          label?: string | null
          leg_no?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pusher_chain_legs_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "pusher_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chain_legs_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chain_legs_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "pusher_chain_state"
            referencedColumns: ["chain_id"]
          },
          {
            foreignKeyName: "pusher_chain_legs_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "pusher_chains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chain_legs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chain_legs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pusher_chain_links: {
        Row: {
          chain_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string
          target_id: string
          target_kind: string
        }
        Insert: {
          chain_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          target_id: string
          target_kind: string
        }
        Update: {
          chain_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          target_id?: string
          target_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "pusher_chain_links_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "pusher_chain_state"
            referencedColumns: ["chain_id"]
          },
          {
            foreignKeyName: "pusher_chain_links_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "pusher_chains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chain_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pusher_chains: {
        Row: {
          activity_id: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          project_id: string
          project_stage_id: string | null
          title: string | null
          trail_set_id: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activity_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          project_id: string
          project_stage_id?: string | null
          title?: string | null
          trail_set_id?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activity_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          project_id?: string
          project_stage_id?: string | null
          title?: string | null
          trail_set_id?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pusher_chains_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "pusher_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chains_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chains_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chains_project_id_unit_id_fkey"
            columns: ["project_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "pusher_chains_project_stage_fkey"
            columns: ["project_id", "project_stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "pusher_chains_trail_set_id_fkey"
            columns: ["trail_set_id"]
            isOneToOne: false
            referencedRelation: "pusher_trail_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chains_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chains_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pusher_departments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pusher_departments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_departments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pusher_project_plans: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          start_date: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          start_date: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          start_date?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pusher_project_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_project_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_project_plans_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pusher_trail_set_items: {
        Row: {
          activity_id: string
          created_at: string
          created_by: string | null
          expected_days: number
          id: string
          set_id: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activity_id: string
          created_at?: string
          created_by?: string | null
          expected_days?: number
          id?: string
          set_id: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activity_id?: string
          created_at?: string
          created_by?: string | null
          expected_days?: number
          id?: string
          set_id?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pusher_trail_set_items_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "pusher_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_trail_set_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_trail_set_items_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "pusher_trail_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_trail_set_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pusher_trail_sets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pusher_trail_sets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_trail_sets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          created_by: string | null
          dataset: string
          description: string | null
          id: string
          name: string
          schema_version: number
          spec: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dataset: string
          description?: string | null
          id?: string
          name: string
          schema_version?: number
          spec?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dataset?: string
          description?: string | null
          id?: string
          name?: string
          schema_version?: number
          spec?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_apps: {
        Row: {
          app: string
          id: string
          role_id: string
        }
        Insert: {
          app: string
          id?: string
          role_id: string
        }
        Update: {
          app?: string
          id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_apps_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          bill_approval_limit: number | null
          can_approve_bills: boolean
          can_approve_indents: boolean
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          bill_approval_limit?: number | null
          can_approve_bills?: boolean
          can_approve_indents?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          bill_approval_limit?: number | null
          can_approve_bills?: boolean
          can_approve_indents?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      selection_lines: {
        Row: {
          created_at: string
          created_by: string | null
          designer_note: string | null
          id: string
          indicative_rate_snapshot: number | null
          item_id: string
          line_key: string
          quantity: number
          selection_id: string
          sort_order: number
          unit_id: string
          unit_space_id: string
          uom: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          designer_note?: string | null
          id?: string
          indicative_rate_snapshot?: number | null
          item_id: string
          line_key?: string
          quantity: number
          selection_id: string
          sort_order?: number
          unit_id: string
          unit_space_id: string
          uom: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          designer_note?: string | null
          id?: string
          indicative_rate_snapshot?: number | null
          item_id?: string
          line_key?: string
          quantity?: number
          selection_id?: string
          sort_order?: number
          unit_id?: string
          unit_space_id?: string
          uom?: string
        }
        Relationships: [
          {
            foreignKeyName: "selection_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_lines_selection_id_unit_id_fkey"
            columns: ["selection_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "selections"
            referencedColumns: ["id", "unit_id"]
          },
          {
            foreignKeyName: "selection_lines_unit_space_id_unit_id_fkey"
            columns: ["unit_space_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id", "unit_id"]
          },
        ]
      }
      selections: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          issued_at: string | null
          issued_by: string | null
          notes: string | null
          revision_no: number
          status: string
          superseded_by: string | null
          title: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          notes?: string | null
          revision_no: number
          status?: string
          superseded_by?: string | null
          title?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          notes?: string | null
          revision_no?: number
          status?: string
          superseded_by?: string | null
          title?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "selections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selections_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selections_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selections_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      space_types: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          sort_order: number
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          sort_order?: number
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          sort_order?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      space_views: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          sort_order: number
          space_id: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          sort_order?: number
          space_id: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          sort_order?: number
          space_id?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "space_views_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_views_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          created_at: string
          description: string | null
          id: string
          label: string
          sort_order: number
          space_type_id: string
          unit_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          label: string
          sort_order?: number
          space_type_id: string
          unit_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          sort_order?: number
          space_type_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_space_type_id_fkey"
            columns: ["space_type_id"]
            isOneToOne: false
            referencedRelation: "space_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spaces_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_departments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_departments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_departments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_details: {
        Row: {
          blood_group: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          department_id: string | null
          designation: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          id: string
          joined_on: string | null
          phone: string | null
          photo_path: string | null
          reports_to_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          blood_group?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          department_id?: string | null
          designation?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id: string
          joined_on?: string | null
          phone?: string | null
          photo_path?: string | null
          reports_to_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          blood_group?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          department_id?: string | null
          designation?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          joined_on?: string | null
          phone?: string | null
          photo_path?: string | null
          reports_to_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_details_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_details_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "staff_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_details_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_details_reports_to_id_fkey"
            columns: ["reports_to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_details_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjusted_at: string
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          quantity: number
          reason: string
          store_id: string
          uom: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          adjusted_at?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          quantity: number
          reason: string
          store_id: string
          uom: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          adjusted_at?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          quantity?: number
          reason?: string
          store_id?: string
          uom?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_issue_lines: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          issue_id: string
          item_id: string
          note: string | null
          quantity: number
          uom: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          issue_id: string
          item_id: string
          note?: string | null
          quantity: number
          uom: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          issue_id?: string
          item_id?: string
          note?: string | null
          quantity?: number
          uom?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_issue_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issue_lines_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "stock_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issue_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issue_lines_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_issues: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          iss_no: number
          issued_at: string
          note: string | null
          plot_id: string | null
          project_id: string
          reference: string
          store_id: string
          to_store_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          iss_no: number
          issued_at?: string
          note?: string | null
          plot_id?: string | null
          project_id: string
          reference: string
          store_id: string
          to_store_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          iss_no?: number
          issued_at?: string
          note?: string | null
          plot_id?: string | null
          project_id?: string
          reference?: string
          store_id?: string
          to_store_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_issues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issues_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issues_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issues_to_store_id_fkey"
            columns: ["to_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issues_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          name: string
          project_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          project_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          project_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          client_id: string | null
          code: string | null
          created_at: string
          id: string
          name: string
          plot_id: string
          project_id: string
          status: string
          unit_type: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          client_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name: string
          plot_id: string
          project_id: string
          status?: string
          unit_type: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          client_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          plot_id?: string
          project_id?: string
          status?: string
          unit_type?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_plot_same_project"
            columns: ["project_id", "plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "units_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_apps: {
        Row: {
          app: string
          granted_at: string
          id: string
          user_id: string
        }
        Insert: {
          app: string
          granted_at?: string
          id?: string
          user_id: string
        }
        Update: {
          app?: string
          granted_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_apps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string
          gst_no: string | null
          id: string
          is_active: boolean
          mobile: string | null
          name: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          gst_no?: string | null
          id?: string
          is_active?: boolean
          mobile?: string | null
          name: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          gst_no?: string | null
          id?: string
          is_active?: boolean
          mobile?: string | null
          name?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      approved_budget_lines: {
        Row: {
          budget_id: string | null
          budget_status: string | null
          expected_vendor_id: string | null
          line_key: string | null
          quantity: number | null
          selection_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_budget_id_selection_id_fkey"
            columns: ["budget_id", "selection_id"]
            isOneToOne: false
            referencedRelation: "approved_budgets"
            referencedColumns: ["id", "selection_id"]
          },
          {
            foreignKeyName: "budget_lines_budget_id_selection_id_fkey"
            columns: ["budget_id", "selection_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id", "selection_id"]
          },
          {
            foreignKeyName: "budget_lines_expected_vendor_id_fkey"
            columns: ["expected_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_selection_id_line_key_fkey"
            columns: ["selection_id", "line_key"]
            isOneToOne: false
            referencedRelation: "selection_lines"
            referencedColumns: ["selection_id", "line_key"]
          },
        ]
      }
      approved_budgets: {
        Row: {
          approved_at: string | null
          id: string | null
          selection_id: string | null
          unit_id: string | null
          version: number | null
        }
        Insert: {
          approved_at?: string | null
          id?: string | null
          selection_id?: string | null
          unit_id?: string | null
          version?: number | null
        }
        Update: {
          approved_at?: string | null
          id?: string | null
          selection_id?: string | null
          unit_id?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "budgets_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: true
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_facts: {
        Row: {
          approved_at: string | null
          bill_no: number | null
          created_at: string | null
          id: string | null
          invoice_date: string | null
          kind: string | null
          labour_contract_id: string | null
          paid_at: string | null
          plot_id: string | null
          po_id: string | null
          project_id: string | null
          reference: string | null
          scope_code: string | null
          status: string | null
          unit_id: string | null
          vendor_id: string | null
        }
        Insert: {
          approved_at?: string | null
          bill_no?: number | null
          created_at?: string | null
          id?: string | null
          invoice_date?: string | null
          kind?: string | null
          labour_contract_id?: string | null
          paid_at?: string | null
          plot_id?: string | null
          po_id?: string | null
          project_id?: string | null
          reference?: string | null
          scope_code?: string | null
          status?: string | null
          unit_id?: string | null
          vendor_id?: string | null
        }
        Update: {
          approved_at?: string | null
          bill_no?: number | null
          created_at?: string | null
          id?: string | null
          invoice_date?: string | null
          kind?: string | null
          labour_contract_id?: string | null
          paid_at?: string | null
          plot_id?: string | null
          po_id?: string | null
          project_id?: string | null
          reference?: string | null
          scope_code?: string | null
          status?: string | null
          unit_id?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_labour_contract_id_fkey"
            columns: ["labour_contract_id"]
            isOneToOne: false
            referencedRelation: "labour_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_billing_totals"
            referencedColumns: ["po_id"]
          },
          {
            foreignKeyName: "bills_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_money_facts: {
        Row: {
          approved_at: string | null
          created_at: string | null
          gst_amount: number | null
          id: string | null
          invoice_date: string | null
          kind: string | null
          paid_at: string | null
          plot_id: string | null
          project_id: string | null
          project_name: string | null
          scope_code: string | null
          status: string | null
          taxable_amount: number | null
          total_amount: number | null
          unit_id: string | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_report_lines: {
        Row: {
          approved_at: string | null
          budget_id: string | null
          budget_status: string | null
          client_rate: number | null
          created_at: string | null
          expected_vendor_id: string | null
          id: string | null
          item_code: string | null
          item_id: string | null
          item_name: string | null
          line_key: string | null
          line_status: string | null
          margin_pct: number | null
          needs_review: boolean | null
          priced_at: string | null
          project_id: string | null
          project_name: string | null
          quantity: number | null
          selection_id: string | null
          unit_cost: number | null
          unit_id: string | null
          unit_name: string | null
          uom: string | null
          vendor_name: string | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_budget_id_selection_id_fkey"
            columns: ["budget_id", "selection_id"]
            isOneToOne: false
            referencedRelation: "approved_budgets"
            referencedColumns: ["id", "selection_id"]
          },
          {
            foreignKeyName: "budget_lines_budget_id_selection_id_fkey"
            columns: ["budget_id", "selection_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id", "selection_id"]
          },
          {
            foreignKeyName: "budget_lines_expected_vendor_id_fkey"
            columns: ["expected_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_selection_id_line_key_fkey"
            columns: ["selection_id", "line_key"]
            isOneToOne: false
            referencedRelation: "selection_lines"
            referencedColumns: ["selection_id", "line_key"]
          },
          {
            foreignKeyName: "budgets_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      business_plan_target_facts: {
        Row: {
          actual_collections: number | null
          actual_spend: number | null
          id: string | null
          margin_pct: number | null
          pbt: number | null
          peak_funding: number | null
          plan_id: string | null
          plan_name: string | null
          project_id: string | null
          project_name: string | null
          published_at: string | null
          revenue: number | null
          scenario_name: string | null
          total_cost: number | null
        }
        Relationships: [
          {
            foreignKeyName: "business_plan_targets_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "business_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_plan_targets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_milestone_facts: {
        Row: {
          client_id: string | null
          client_name: string | null
          created_at: string | null
          due_amount: number | null
          due_on: string | null
          engagement_id: string | null
          id: string | null
          invoice_no: string | null
          invoiced_on: string | null
          project_id: string | null
          project_name: string | null
          received_amount: number | null
          sort_order: number | null
          stage: string | null
          unit_id: string | null
          unit_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_engagements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_engagements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_payment_milestones_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "client_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_receipt_facts: {
        Row: {
          amount: number | null
          client_id: string | null
          client_name: string | null
          created_at: string | null
          engagement_id: string | null
          id: string | null
          milestone_id: string | null
          milestone_stage: string | null
          mode: string | null
          project_id: string | null
          project_name: string | null
          received_on: string | null
          reference: string | null
          unit_id: string | null
          unit_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_engagements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_engagements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_receipts_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "client_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_receipts_milestone_fkey"
            columns: ["milestone_id", "engagement_id"]
            isOneToOne: false
            referencedRelation: "client_payment_milestones"
            referencedColumns: ["id", "engagement_id"]
          },
          {
            foreignKeyName: "client_receipts_milestone_fkey"
            columns: ["milestone_id", "engagement_id"]
            isOneToOne: false
            referencedRelation: "crm_milestone_facts"
            referencedColumns: ["id", "engagement_id"]
          },
          {
            foreignKeyName: "units_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      po_billing_totals: {
        Row: {
          bill_count: number | null
          billed_total: number | null
          ordered_total: number | null
          po_id: string | null
        }
        Relationships: []
      }
      po_facts: {
        Row: {
          created_at: string | null
          expected_by: string | null
          id: string | null
          issued_at: string | null
          plot_id: string | null
          project_id: string | null
          reference: string | null
          scope_code: string | null
          status: string | null
          unit_id: string | null
          vendor_id: string | null
        }
        Insert: {
          created_at?: string | null
          expected_by?: string | null
          id?: string | null
          issued_at?: string | null
          plot_id?: string | null
          project_id?: string | null
          reference?: string | null
          scope_code?: string | null
          status?: string | null
          unit_id?: string | null
          vendor_id?: string | null
        }
        Update: {
          created_at?: string | null
          expected_by?: string | null
          id?: string | null
          issued_at?: string | null
          plot_id?: string | null
          project_id?: string | null
          reference?: string | null
          scope_code?: string | null
          status?: string | null
          unit_id?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      po_line_facts: {
        Row: {
          id: string | null
          indent_line_id: string | null
          item_id: string | null
          po_id: string | null
          po_reference: string | null
          po_status: string | null
          quantity: number | null
          uom: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_indent_line_id_fkey"
            columns: ["indent_line_id"]
            isOneToOne: false
            referencedRelation: "indent_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_billing_totals"
            referencedColumns: ["po_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pusher_chain_state: {
        Row: {
          activity_id: string | null
          activity_name: string | null
          chain_id: string | null
          created_at: string | null
          current_leg: number | null
          days_in_leg: number | null
          department_ids: string[] | null
          department_names: string[] | null
          entered_at: string | null
          expected_days: number | null
          holder_id: string | null
          is_finished: boolean | null
          is_queued: boolean | null
          is_stuck: boolean | null
          is_with_client: boolean | null
          last_kind: string | null
          last_seq: number | null
          leg_count: number | null
          project_code: string | null
          project_id: string | null
          project_name: string | null
          project_stage_id: string | null
          started_at: string | null
          title: string | null
          trail_set_id: string | null
          trail_set_name: string | null
          unit_id: string | null
          unit_name: string | null
          with_client_days: number | null
          with_client_since: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pusher_chain_events_to_assignee_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chains_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "pusher_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chains_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chains_project_id_unit_id_fkey"
            columns: ["project_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "pusher_chains_project_stage_fkey"
            columns: ["project_id", "project_stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "pusher_chains_trail_set_id_fkey"
            columns: ["trail_set_id"]
            isOneToOne: false
            referencedRelation: "pusher_trail_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pusher_chains_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_by_location: {
        Row: {
          item_id: string | null
          location_id: string | null
          location_kind: string | null
          quantity: number | null
        }
        Relationships: []
      }
      stock_on_hand: {
        Row: {
          item_id: string | null
          quantity: number | null
          store_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_list_users: {
        Args: never
        Returns: {
          email: string
          full_name: string
          id: string
          is_active: boolean
          role: string
          role_id: string
          team: string
        }[]
      }
      bill_approval_cap: { Args: { uid: string }; Returns: number }
      can_approve_bills: { Args: { uid: string }; Returns: boolean }
      can_approve_indents: { Args: { uid: string }; Returns: boolean }
      create_bill: {
        Args: {
          p_gst_amount: number
          p_invoice_date: string
          p_invoice_no: string
          p_labour_contract_id: string
          p_note: string
          p_po_id: string
          p_taxable_amount: number
          p_total_amount: number
        }
        Returns: string
      }
      create_chain: {
        Args: {
          p_activity_id: string
          p_legs: Json
          p_note: string
          p_project_id: string
          p_title: string
          p_unit_id: string
        }
        Returns: string
      }
      create_chains: {
        Args: { p_chains: Json; p_project_id: string; p_unit_id: string }
        Returns: number
      }
      create_client_engagement: {
        Args: { p_owner_id?: string; p_unit_id: string }
        Returns: string
      }
      create_goods_receipt: {
        Args: {
          p_challan_no: string
          p_note: string
          p_po_id: string
          p_received_at: string
          p_store_id: string
          p_to_site: boolean
        }
        Returns: string
      }
      create_indent: {
        Args: {
          p_note: string
          p_plot_id: string
          p_project_id: string
          p_required_by: string
          p_stage: string
          p_unit_id: string
        }
        Returns: string
      }
      create_item_request: {
        Args: {
          p_brand_id: string
          p_category_id: string
          p_name: string
          p_spec_note: string
          p_uom: string
        }
        Returns: string
      }
      create_next_revision: {
        Args: { p_from_selection_id: string }
        Returns: string
      }
      create_nmr_bill: {
        Args: {
          p_gst_amount: number
          p_invoice_date: string
          p_invoice_no: string
          p_note: string
          p_plot_id: string
          p_project_id: string
          p_taxable_amount: number
          p_total_amount: number
          p_unit_id: string
          p_vendor_id: string
        }
        Returns: string
      }
      create_purchase_order: {
        Args: {
          p_deliver_note: string
          p_deliver_store_id: string
          p_expected_by: string
          p_note: string
          p_plot_id: string
          p_project_id: string
          p_terms: string
          p_unit_id: string
          p_vendor_id: string
        }
        Returns: string
      }
      create_stock_issue: {
        Args: {
          p_issued_at: string
          p_note: string
          p_plot_id: string
          p_project_id: string
          p_store_id: string
          p_to_store_id: string
        }
        Returns: string
      }
      crm_assign_unit: {
        Args: { p_client_id: string; p_status: string; p_unit_id: string }
        Returns: undefined
      }
      crm_release_unit: { Args: { p_unit_id: string }; Returns: undefined }
      delete_draft_indent: { Args: { p_indent_id: string }; Returns: undefined }
      delete_draft_purchase_order: {
        Args: { p_po_id: string }
        Returns: undefined
      }
      delete_draft_selection: {
        Args: { p_selection_id: string }
        Returns: undefined
      }
      directory_emails: {
        Args: never
        Returns: {
          email: string
          id: string
        }[]
      }
      discard_chain: { Args: { p_chain_id: string }; Returns: undefined }
      hand_baton: {
        Args: { p_chain_id: string; p_note: string; p_to_user: string }
        Returns: undefined
      }
      has_app: { Args: { slug: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      issue_selection: { Args: { p_selection_id: string }; Returns: undefined }
      marathon_create_entry: {
        Args: {
          p_age: number
          p_agent_id: string
          p_gender: string
          p_group_id: string
          p_mobile: string
          p_name: string
          p_run_id: string
          p_tee_size: string
        }
        Returns: {
          age: number
          agent_id: string
          bib: string
          category_id: string
          created_at: string
          gender: string
          group_id: string
          id: string
          mobile: string
          name: string
          run_id: string
          tee_size: string
        }
        SetofOptions: {
          from: "*"
          to: "marathon_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      marathon_run_counts: {
        Args: never
        Returns: {
          entry_count: number
          run_id: string
          run_name: string
        }[]
      }
      open_chain:
        | {
            Args: {
              p_activity_id: string
              p_legs: Json
              p_note: string
              p_project_id: string
              p_title: string
              p_unit_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_activity_id: string
              p_legs: Json
              p_note: string
              p_project_id: string
              p_start: boolean
              p_title: string
              p_trail_set_id: string
              p_unit_id: string
            }
            Returns: string
          }
      profile_is_active: { Args: { uid: string }; Returns: boolean }
      pusher_current_stage: { Args: { p_project_id: string }; Returns: string }
      reopen_budget: { Args: { p_budget_id: string }; Returns: undefined }
      replace_future_legs: {
        Args: { p_chain_id: string; p_legs: Json }
        Returns: undefined
      }
      seed_default_project_stages: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      session_is_verified: { Args: never; Returns: boolean }
      set_chain_departments: {
        Args: { p_chain_id: string; p_department_ids: string[] }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_chain: { Args: { p_chain_id: string }; Returns: undefined }
      stock_qty_on_hand: {
        Args: { p_item_id: string; p_store_id: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
