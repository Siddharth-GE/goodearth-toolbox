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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      advance_recoveries: {
        Row: {
          advance_id: string
          amount: number
          bill_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          recovered_on: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          advance_id: string
          amount: number
          bill_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          recovered_on?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          advance_id?: string
          amount?: number
          bill_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          recovered_on?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "advance_recoveries_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "contractor_advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_recoveries_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_recoveries_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_money_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_recoveries_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_recoveries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_recoveries_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      bill_lines: {
        Row: {
          bill_id: string
          created_at: string
          created_by: string | null
          description: string
          discount_amount: number | null
          gst_pct: number
          id: string
          item_id: string | null
          labour_contract_line_id: string | null
          labour_log_id: string | null
          line_kind: string
          note: string | null
          other_charges: number | null
          po_line_id: string | null
          quantity: number | null
          rate: number
          sort_order: number
          uom: string | null
          updated_at: string
          updated_by: string | null
          work_item_id: string | null
        }
        Insert: {
          bill_id: string
          created_at?: string
          created_by?: string | null
          description: string
          discount_amount?: number | null
          gst_pct?: number
          id?: string
          item_id?: string | null
          labour_contract_line_id?: string | null
          labour_log_id?: string | null
          line_kind: string
          note?: string | null
          other_charges?: number | null
          po_line_id?: string | null
          quantity?: number | null
          rate: number
          sort_order?: number
          uom?: string | null
          updated_at?: string
          updated_by?: string | null
          work_item_id?: string | null
        }
        Update: {
          bill_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          discount_amount?: number | null
          gst_pct?: number
          id?: string
          item_id?: string | null
          labour_contract_line_id?: string | null
          labour_log_id?: string | null
          line_kind?: string
          note?: string | null
          other_charges?: number | null
          po_line_id?: string | null
          quantity?: number | null
          rate?: number
          sort_order?: number
          uom?: string | null
          updated_at?: string
          updated_by?: string | null
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_lines_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_money_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_labour_contract_line_id_fkey"
            columns: ["labour_contract_line_id"]
            isOneToOne: false
            referencedRelation: "labour_contract_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_labour_contract_line_id_fkey"
            columns: ["labour_contract_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_line_billing_facts"
            referencedColumns: ["labour_contract_line_id"]
          },
          {
            foreignKeyName: "bill_lines_labour_log_id_fkey"
            columns: ["labour_log_id"]
            isOneToOne: false
            referencedRelation: "labour_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "po_line_billing_facts"
            referencedColumns: ["po_line_id"]
          },
          {
            foreignKeyName: "bill_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "po_line_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "bill_lines_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_payments: {
        Row: {
          amount: number
          bill_id: string
          cash_request_item_id: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          paid_on: string
          payment_ref: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          bill_id: string
          cash_request_item_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          paid_on?: string
          payment_ref: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          bill_id?: string
          cash_request_item_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          paid_on?: string
          payment_ref?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_money_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_payments_cash_request_item_id_fkey"
            columns: ["cash_request_item_id"]
            isOneToOne: false
            referencedRelation: "cash_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_payments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bill_no: number
          charges_amount: number | null
          charges_gst_pct: number | null
          charges_note: string | null
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
          total_override_note: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bill_no: number
          charges_amount?: number | null
          charges_gst_pct?: number | null
          charges_note?: string | null
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
          total_override_note?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bill_no?: number
          charges_amount?: number | null
          charges_gst_pct?: number | null
          charges_note?: string | null
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
          total_override_note?: string | null
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
            foreignKeyName: "bills_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
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
      birdwing_attendance: {
        Row: {
          break_minutes: number
          created_at: string
          created_by: string | null
          id: string
          in_at: string | null
          note: string | null
          on_date: string
          out_at: string | null
          source_key: string | null
          staff_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          break_minutes?: number
          created_at?: string
          created_by?: string | null
          id?: string
          in_at?: string | null
          note?: string | null
          on_date: string
          out_at?: string | null
          source_key?: string | null
          staff_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          break_minutes?: number
          created_at?: string
          created_by?: string | null
          id?: string
          in_at?: string | null
          note?: string | null
          on_date?: string
          out_at?: string | null
          source_key?: string | null
          staff_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_attendance_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "birdwing_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_attendance_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_cost_centres: {
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
            foreignKeyName: "birdwing_cost_centres_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_cost_centres_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_counters: {
        Row: {
          last_no: number
          scope: string
        }
        Insert: {
          last_no?: number
          scope: string
        }
        Update: {
          last_no?: number
          scope?: string
        }
        Relationships: []
      }
      birdwing_cross_charges: {
        Row: {
          amount: number
          charged_month: string
          cost_centre_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          note: string | null
          source_key: string | null
          stay_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          charged_month: string
          cost_centre_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          source_key?: string | null
          stay_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          charged_month?: string
          cost_centre_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          source_key?: string | null
          stay_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_cross_charges_cost_centre_id_fkey"
            columns: ["cost_centre_id"]
            isOneToOne: false
            referencedRelation: "birdwing_cost_centres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_cross_charges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_cross_charges_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "birdwing_stay_facts"
            referencedColumns: ["stay_id"]
          },
          {
            foreignKeyName: "birdwing_cross_charges_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "birdwing_stays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_cross_charges_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_expense_files: {
        Row: {
          content_type: string
          created_at: string
          created_by: string | null
          expense_id: string
          file_name: string
          id: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          content_type: string
          created_at?: string
          created_by?: string | null
          expense_id: string
          file_name: string
          id?: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          content_type?: string
          created_at?: string
          created_by?: string | null
          expense_id?: string
          file_name?: string
          id?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_expense_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_expense_files_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "birdwing_expense_facts"
            referencedColumns: ["expense_id"]
          },
          {
            foreignKeyName: "birdwing_expense_files_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "birdwing_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_expense_heads: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_salary: boolean
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
          is_salary?: boolean
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
          is_salary?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_expense_heads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_expense_heads_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_expenses: {
        Row: {
          accounting_month: string
          amount: number
          bill_ref: string | null
          created_at: string
          created_by: string | null
          description: string
          head_id: string
          id: string
          payee: string | null
          payment_details: string | null
          review_note: string | null
          salary_run_id: string | null
          source_key: string | null
          spent_on: string | null
          status: string
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
        }
        Insert: {
          accounting_month: string
          amount: number
          bill_ref?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          head_id: string
          id?: string
          payee?: string | null
          payment_details?: string | null
          review_note?: string | null
          salary_run_id?: string | null
          source_key?: string | null
          spent_on?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          accounting_month?: string
          amount?: number
          bill_ref?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          head_id?: string
          id?: string
          payee?: string | null
          payment_details?: string | null
          review_note?: string | null
          salary_run_id?: string | null
          source_key?: string | null
          spent_on?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_expenses_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "birdwing_expense_heads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_expenses_salary_run_id_fkey"
            columns: ["salary_run_id"]
            isOneToOne: true
            referencedRelation: "birdwing_salary_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_expenses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_guests: {
        Row: {
          city: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          id_last4: string | null
          id_type: string | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          id_last4?: string | null
          id_type?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          id_last4?: string | null
          id_type?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_guests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_guests_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_invoices: {
        Row: {
          bill_to_address: string | null
          bill_to_gstin: string | null
          bill_to_name: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cgst: number
          created_at: string
          created_by: string | null
          discount: number
          historic: boolean
          id: string
          issued_by: string | null
          issued_on: string
          number: string
          payable: number
          sgst: number
          snapshot: Json
          source_key: string | null
          status: string
          stay_id: string
          taxable: number
          total: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bill_to_address?: string | null
          bill_to_gstin?: string | null
          bill_to_name: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cgst: number
          created_at?: string
          created_by?: string | null
          discount?: number
          historic?: boolean
          id?: string
          issued_by?: string | null
          issued_on?: string
          number: string
          payable: number
          sgst: number
          snapshot: Json
          source_key?: string | null
          status?: string
          stay_id: string
          taxable: number
          total: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bill_to_address?: string | null
          bill_to_gstin?: string | null
          bill_to_name?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cgst?: number
          created_at?: string
          created_by?: string | null
          discount?: number
          historic?: boolean
          id?: string
          issued_by?: string | null
          issued_on?: string
          number?: string
          payable?: number
          sgst?: number
          snapshot?: Json
          source_key?: string | null
          status?: string
          stay_id?: string
          taxable?: number
          total?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_invoices_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_invoices_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_invoices_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "birdwing_stay_facts"
            referencedColumns: ["stay_id"]
          },
          {
            foreignKeyName: "birdwing_invoices_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "birdwing_stays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_invoices_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_pay_rules: {
        Row: {
          base_salary: number
          created_at: string
          created_by: string | null
          effective_from: string
          guest_day_rate: number
          id: string
          notes: string | null
          ot_rate_per_hr: number
          room_day_rate: number
          shift_end: string | null
          shift_start: string | null
          staff_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          base_salary: number
          created_at?: string
          created_by?: string | null
          effective_from: string
          guest_day_rate?: number
          id?: string
          notes?: string | null
          ot_rate_per_hr?: number
          room_day_rate?: number
          shift_end?: string | null
          shift_start?: string | null
          staff_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          base_salary?: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          guest_day_rate?: number
          id?: string
          notes?: string | null
          ot_rate_per_hr?: number
          room_day_rate?: number
          shift_end?: string | null
          shift_start?: string | null
          staff_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_pay_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_pay_rules_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "birdwing_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_pay_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_rate_card: {
        Row: {
          created_at: string
          created_by: string | null
          default_rate: number
          gst_pct: number
          head: string
          id: string
          is_active: boolean
          kind: string
          sac: string | null
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_rate?: number
          gst_pct?: number
          head: string
          id?: string
          is_active?: boolean
          kind: string
          sac?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_rate?: number
          gst_pct?: number
          head?: string
          id?: string
          is_active?: boolean
          kind?: string
          sac?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_rate_card_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_rate_card_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_receipts: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string | null
          mode: string
          note: string | null
          received_on: string
          reference: string | null
          source_key: string | null
          stay_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          mode?: string
          note?: string | null
          received_on?: string
          reference?: string | null
          source_key?: string | null
          stay_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          mode?: string
          note?: string | null
          received_on?: string
          reference?: string | null
          source_key?: string | null
          stay_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_receipts_invoice_id_stay_id_fkey"
            columns: ["invoice_id", "stay_id"]
            isOneToOne: false
            referencedRelation: "birdwing_invoices"
            referencedColumns: ["id", "stay_id"]
          },
          {
            foreignKeyName: "birdwing_receipts_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "birdwing_stay_facts"
            referencedColumns: ["stay_id"]
          },
          {
            foreignKeyName: "birdwing_receipts_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "birdwing_stays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_receipts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_rooms: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          max_guests: number | null
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          max_guests?: number | null
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          max_guests?: number | null
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_rooms_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_salary_runs: {
        Row: {
          base: number
          confirmed_at: string
          confirmed_by: string | null
          created_at: string
          deductions: number
          guest_amount: number
          guest_days: number
          id: string
          incentives: number
          month: string
          note: string | null
          ot_amount: number
          ot_hours: number
          room_amount: number
          room_days: number
          staff_id: string
          total: number
        }
        Insert: {
          base: number
          confirmed_at?: string
          confirmed_by?: string | null
          created_at?: string
          deductions?: number
          guest_amount?: number
          guest_days?: number
          id?: string
          incentives?: number
          month: string
          note?: string | null
          ot_amount?: number
          ot_hours?: number
          room_amount?: number
          room_days?: number
          staff_id: string
          total: number
        }
        Update: {
          base?: number
          confirmed_at?: string
          confirmed_by?: string | null
          created_at?: string
          deductions?: number
          guest_amount?: number
          guest_days?: number
          id?: string
          incentives?: number
          month?: string
          note?: string | null
          ot_amount?: number
          ot_hours?: number
          room_amount?: number
          room_days?: number
          staff_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_salary_runs_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_salary_runs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "birdwing_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_settings: {
        Row: {
          bank_details: string | null
          checkin_time: string | null
          checkout_time: string | null
          company_id: string | null
          id: boolean
          invoice_terms: string | null
          place_of_supply: string | null
          updated_at: string
          updated_by: string | null
          upi_id: string | null
        }
        Insert: {
          bank_details?: string | null
          checkin_time?: string | null
          checkout_time?: string | null
          company_id?: string | null
          id?: boolean
          invoice_terms?: string | null
          place_of_supply?: string | null
          updated_at?: string
          updated_by?: string | null
          upi_id?: string | null
        }
        Update: {
          bank_details?: string | null
          checkin_time?: string | null
          checkout_time?: string | null
          company_id?: string | null
          id?: boolean
          invoice_terms?: string | null
          place_of_supply?: string | null
          updated_at?: string
          updated_by?: string | null
          upi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_staff: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          joined_on: string | null
          name: string
          profile_id: string | null
          role: string | null
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          joined_on?: string | null
          name: string
          profile_id?: string | null
          role?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          joined_on?: string | null
          name?: string
          profile_id?: string | null
          role?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_staff_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_staff_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_stay_charges: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string | null
          description: string | null
          gst_pct: number
          head: string
          id: string
          is_block: boolean
          kind: string
          qty: number
          rate: number
          rate_card_id: string | null
          rate_includes_gst: boolean
          sac: string | null
          sort_order: number
          stay_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          gst_pct?: number
          head: string
          id?: string
          is_block?: boolean
          kind?: string
          qty: number
          rate: number
          rate_card_id?: string | null
          rate_includes_gst?: boolean
          sac?: string | null
          sort_order?: number
          stay_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          gst_pct?: number
          head?: string
          id?: string
          is_block?: boolean
          kind?: string
          qty?: number
          rate?: number
          rate_card_id?: string | null
          rate_includes_gst?: boolean
          sac?: string | null
          sort_order?: number
          stay_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_stay_charges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_stay_charges_rate_card_id_fkey"
            columns: ["rate_card_id"]
            isOneToOne: false
            referencedRelation: "birdwing_rate_card"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_stay_charges_stay_id_is_block_fkey"
            columns: ["stay_id", "is_block"]
            isOneToOne: false
            referencedRelation: "birdwing_stays"
            referencedColumns: ["id", "is_block"]
          },
          {
            foreignKeyName: "birdwing_stay_charges_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_stay_files: {
        Row: {
          content_type: string
          created_at: string
          created_by: string | null
          file_name: string
          id: string
          kind: string
          size_bytes: number
          stay_id: string
          storage_path: string
        }
        Insert: {
          content_type: string
          created_at?: string
          created_by?: string | null
          file_name: string
          id?: string
          kind?: string
          size_bytes: number
          stay_id: string
          storage_path: string
        }
        Update: {
          content_type?: string
          created_at?: string
          created_by?: string | null
          file_name?: string
          id?: string
          kind?: string
          size_bytes?: number
          stay_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_stay_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_stay_files_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "birdwing_stay_facts"
            referencedColumns: ["stay_id"]
          },
          {
            foreignKeyName: "birdwing_stay_files_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "birdwing_stays"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_stay_rooms: {
        Row: {
          created_at: string
          created_by: string | null
          extra_beds: number
          from_date: string
          id: string
          released_at: string | null
          room_id: string
          stay_id: string
          to_date: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          extra_beds?: number
          from_date: string
          id?: string
          released_at?: string | null
          room_id: string
          stay_id: string
          to_date: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          extra_beds?: number
          from_date?: string
          id?: string
          released_at?: string | null
          room_id?: string
          stay_id?: string
          to_date?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_stay_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_stay_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "birdwing_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_stay_rooms_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "birdwing_stay_facts"
            referencedColumns: ["stay_id"]
          },
          {
            foreignKeyName: "birdwing_stay_rooms_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "birdwing_stays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_stay_rooms_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      birdwing_stays: {
        Row: {
          accounting_month: string
          adults: number
          allergies: string | null
          arrival: string
          cancel_reason: string | null
          cancelled_at: string | null
          channel: string
          checkin_at: string | null
          checkout_at: string | null
          children: number
          cost_centre_id: string | null
          created_at: string
          created_by: string | null
          departure: string
          discount: number
          food_preferences: string | null
          guest_id: string | null
          guest_names: string | null
          id: string
          id_verified: boolean
          is_block: boolean
          legacy_room_count: number | null
          notes: string | null
          ota_commission: number
          pets: number
          ref: string
          referred_by: string | null
          requirements: string | null
          review_flags: string[]
          reviewed_at: string | null
          reviewed_by: string | null
          source_key: string | null
          status: string
          updated_at: string
          updated_by: string | null
          use: string | null
        }
        Insert: {
          accounting_month: string
          adults?: number
          allergies?: string | null
          arrival: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          channel?: string
          checkin_at?: string | null
          checkout_at?: string | null
          children?: number
          cost_centre_id?: string | null
          created_at?: string
          created_by?: string | null
          departure: string
          discount?: number
          food_preferences?: string | null
          guest_id?: string | null
          guest_names?: string | null
          id?: string
          id_verified?: boolean
          is_block?: boolean
          legacy_room_count?: number | null
          notes?: string | null
          ota_commission?: number
          pets?: number
          ref: string
          referred_by?: string | null
          requirements?: string | null
          review_flags?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_key?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          use?: string | null
        }
        Update: {
          accounting_month?: string
          adults?: number
          allergies?: string | null
          arrival?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          channel?: string
          checkin_at?: string | null
          checkout_at?: string | null
          children?: number
          cost_centre_id?: string | null
          created_at?: string
          created_by?: string | null
          departure?: string
          discount?: number
          food_preferences?: string | null
          guest_id?: string | null
          guest_names?: string | null
          id?: string
          id_verified?: boolean
          is_block?: boolean
          legacy_room_count?: number | null
          notes?: string | null
          ota_commission?: number
          pets?: number
          ref?: string
          referred_by?: string | null
          requirements?: string | null
          review_flags?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_key?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          use?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birdwing_stays_cost_centre_id_fkey"
            columns: ["cost_centre_id"]
            isOneToOne: false
            referencedRelation: "birdwing_cost_centres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_stays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_stays_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "birdwing_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_stays_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birdwing_stays_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          {
            foreignKeyName: "budgets_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
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
      cash_request_items: {
        Row: {
          bill_id: string | null
          cash_request_id: string
          created_at: string
          created_by: string | null
          id: string
          item_kind: string
          labour_contract_id: string | null
          note: string | null
          project_id: string | null
          released_amount: number | null
          requested_amount: number
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
        }
        Insert: {
          bill_id?: string | null
          cash_request_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_kind: string
          labour_contract_id?: string | null
          note?: string | null
          project_id?: string | null
          released_amount?: number | null
          requested_amount: number
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          bill_id?: string | null
          cash_request_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_kind?: string
          labour_contract_id?: string | null
          note?: string | null
          project_id?: string | null
          released_amount?: number | null
          requested_amount?: number
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_request_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_request_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_money_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_request_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_request_items_cash_request_id_fkey"
            columns: ["cash_request_id"]
            isOneToOne: false
            referencedRelation: "cash_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_request_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_request_items_labour_contract_id_fkey"
            columns: ["labour_contract_id"]
            isOneToOne: false
            referencedRelation: "labour_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_request_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_request_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_request_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_requests: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          released_at: string | null
          released_by: string | null
          sent_back_note: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          updated_by: string | null
          week_of: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          released_at?: string | null
          released_by?: string | null
          sent_back_note?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          updated_by?: string | null
          week_of: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          released_at?: string | null
          released_by?: string | null
          sent_back_note?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          updated_by?: string | null
          week_of?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_requests_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_requests_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_groups: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          template_id: string
          work_group_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          template_id: string
          work_group_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          template_id?: string
          work_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_groups_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_groups_work_group_id_fkey"
            columns: ["work_group_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_items: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          origin: string
          review_note: string | null
          sort_order: number
          template_id: string
          text: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          origin?: string
          review_note?: string | null
          sort_order?: number
          template_id: string
          text: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          origin?: string
          review_note?: string | null
          sort_order?: number
          template_id?: string
          text?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          note: string | null
          sort_order: number
          updated_at: string
          updated_by: string | null
          work_refs: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          work_refs?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          work_refs?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_actions: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          done_on: string | null
          due_assumed: boolean
          due_on: string | null
          engagement_id: string | null
          id: string
          notes: string | null
          owner_id: string
          status: string
          track: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          done_on?: string | null
          due_assumed?: boolean
          due_on?: string | null
          engagement_id?: string | null
          id?: string
          notes?: string | null
          owner_id: string
          status?: string
          track?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          done_on?: string | null
          due_assumed?: boolean
          due_on?: string | null
          engagement_id?: string | null
          id?: string
          notes?: string | null
          owner_id?: string
          status?: string
          track?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_actions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_actions_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "client_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_actions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_actions_updated_by_fkey"
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
          design_confirmed_on: string | null
          design_support: string | null
          details: string | null
          id: string
          kaadal_note: string | null
          kaadal_owner_id: string | null
          kaadal_stage: string | null
          permit_on: string | null
          plot_value: number | null
          progress_stage_id: string | null
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
          working_drawing_on: string | null
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
          design_confirmed_on?: string | null
          design_support?: string | null
          details?: string | null
          id?: string
          kaadal_note?: string | null
          kaadal_owner_id?: string | null
          kaadal_stage?: string | null
          permit_on?: string | null
          plot_value?: number | null
          progress_stage_id?: string | null
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
          working_drawing_on?: string | null
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
          design_confirmed_on?: string | null
          design_support?: string | null
          details?: string | null
          id?: string
          kaadal_note?: string | null
          kaadal_owner_id?: string | null
          kaadal_stage?: string | null
          permit_on?: string | null
          plot_value?: number | null
          progress_stage_id?: string | null
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
          working_drawing_on?: string | null
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
            foreignKeyName: "client_engagements_kaadal_owner_id_fkey"
            columns: ["kaadal_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_engagements_progress_stage_id_fkey"
            columns: ["progress_stage_id"]
            isOneToOne: false
            referencedRelation: "progress_stages"
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
            foreignKeyName: "client_engagements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
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
      companies: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          email: string | null
          gstin: string | null
          id: string
          is_active: boolean
          legal_name: string | null
          name: string
          phone: string | null
          state: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name: string
          phone?: string | null
          state?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name?: string
          phone?: string | null
          state?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      contractor_advances: {
        Row: {
          amount: number
          cash_request_item_id: string | null
          created_at: string
          created_by: string | null
          id: string
          labour_contract_id: string | null
          note: string | null
          paid_on: string
          payment_ref: string
          project_id: string
          updated_at: string
          updated_by: string | null
          vendor_id: string
        }
        Insert: {
          amount: number
          cash_request_item_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          labour_contract_id?: string | null
          note?: string | null
          paid_on?: string
          payment_ref: string
          project_id: string
          updated_at?: string
          updated_by?: string | null
          vendor_id: string
        }
        Update: {
          amount?: number
          cash_request_item_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          labour_contract_id?: string | null
          note?: string | null
          paid_on?: string
          payment_ref?: string
          project_id?: string
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_advances_cash_request_item_id_fkey"
            columns: ["cash_request_item_id"]
            isOneToOne: false
            referencedRelation: "cash_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_advances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_advances_labour_contract_id_fkey"
            columns: ["labour_contract_id"]
            isOneToOne: false
            referencedRelation: "labour_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_advances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_advances_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_advances_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      design_actions: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          design_stage_id: string | null
          done_on: string | null
          due_on: string | null
          id: string
          notes: string | null
          owner_id: string
          status: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          design_stage_id?: string | null
          done_on?: string | null
          due_on?: string | null
          id?: string
          notes?: string | null
          owner_id: string
          status?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          design_stage_id?: string | null
          done_on?: string | null
          due_on?: string | null
          id?: string
          notes?: string | null
          owner_id?: string
          status?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_actions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_actions_design_stage_id_fkey"
            columns: ["design_stage_id"]
            isOneToOne: false
            referencedRelation: "design_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_actions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_actions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_actions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
          },
          {
            foreignKeyName: "design_actions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      design_stages: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          on_board: boolean
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          on_board?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          on_board?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_stages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_stages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      design_step_events: {
        Row: {
          actor_id: string | null
          at: string
          design_stage_id: string
          from_status: string | null
          id: string
          kind: string
          person_id: string | null
          reason: string | null
          seq: number
          step_id: string
          to_status: string | null
          unit_id: string
        }
        Insert: {
          actor_id?: string | null
          at?: string
          design_stage_id: string
          from_status?: string | null
          id?: string
          kind: string
          person_id?: string | null
          reason?: string | null
          seq?: never
          step_id: string
          to_status?: string | null
          unit_id: string
        }
        Update: {
          actor_id?: string | null
          at?: string
          design_stage_id?: string
          from_status?: string | null
          id?: string
          kind?: string
          person_id?: string | null
          reason?: string | null
          seq?: never
          step_id?: string
          to_status?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_step_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_step_events_design_stage_id_fkey"
            columns: ["design_stage_id"]
            isOneToOne: false
            referencedRelation: "design_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_step_events_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_step_events_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "design_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_step_events_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_step_events_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      design_step_people: {
        Row: {
          added_at: string
          added_by: string | null
          id: string
          profile_id: string
          step_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          id?: string
          profile_id: string
          step_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          id?: string
          profile_id?: string
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_step_people_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_step_people_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_step_people_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "design_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      design_steps: {
        Row: {
          created_at: string
          created_by: string | null
          design_stage_id: string
          done_on: string | null
          id: string
          note: string | null
          reason: string | null
          started_on: string | null
          status: string
          unit_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          design_stage_id: string
          done_on?: string | null
          id?: string
          note?: string | null
          reason?: string | null
          started_on?: string | null
          status?: string
          unit_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          design_stage_id?: string
          done_on?: string | null
          id?: string
          note?: string | null
          reason?: string | null
          started_on?: string | null
          status?: string
          unit_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_steps_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_steps_design_stage_id_fkey"
            columns: ["design_stage_id"]
            isOneToOne: false
            referencedRelation: "design_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_steps_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_steps_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
          },
          {
            foreignKeyName: "design_steps_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dexter_answers: {
        Row: {
          created_at: string
          deck_id: string
          fields: Json
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deck_id: string
          fields?: Json
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deck_id?: string
          fields?: Json
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dexter_answers_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: true
            referencedRelation: "dexter_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      dexter_decks: {
        Row: {
          created_at: string
          created_by: string | null
          entry_path: string
          file_count: number
          id: string
          project_id: string
          share_enabled: boolean
          share_token: string
          title: string
          total_bytes: number
          updated_at: string
          updated_by: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_path: string
          file_count: number
          id?: string
          project_id: string
          share_enabled?: boolean
          share_token: string
          title: string
          total_bytes: number
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_path?: string
          file_count?: number
          id?: string
          project_id?: string
          share_enabled?: boolean
          share_token?: string
          title?: string
          total_bytes?: number
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dexter_decks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dexter_decks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "dexter_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dexter_decks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dexter_decks_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dexter_projects: {
        Row: {
          client_name: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dexter_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dexter_projects_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_terms: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_default: boolean
          kind: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          kind: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          kind?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_terms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_terms_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_revision_files: {
        Row: {
          content_type: string
          created_at: string
          drawing_revision_id: string
          file_name: string
          id: string
          sheet_code: string | null
          sort_order: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          content_type: string
          created_at?: string
          drawing_revision_id: string
          file_name: string
          id?: string
          sheet_code?: string | null
          sort_order?: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string
          created_at?: string
          drawing_revision_id?: string
          file_name?: string
          id?: string
          sheet_code?: string | null
          sort_order?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_revision_files_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revision_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_revision_folder_sheets: {
        Row: {
          created_at: string
          created_by: string | null
          drawing_revision_id: string
          id: string
          modified_at: string | null
          name: string
          size_bytes: number | null
          sort_order: number
          workdrive_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          drawing_revision_id: string
          id?: string
          modified_at?: string | null
          name: string
          size_bytes?: number | null
          sort_order?: number
          workdrive_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          drawing_revision_id?: string
          id?: string
          modified_at?: string | null
          name?: string
          size_bytes?: number | null
          sort_order?: number
          workdrive_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_revision_folder_sheets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revision_folder_sheets_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_revision_works: {
        Row: {
          created_at: string
          created_by: string | null
          drawing_revision_id: string
          id: string
          work_item_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          drawing_revision_id: string
          id?: string
          work_item_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          drawing_revision_id?: string
          id?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_revision_works_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revision_works_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revision_works_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          drawing_set_id: string
          drawings_url: string | null
          id: string
          note: string | null
          released_at: string | null
          released_by: string | null
          revision_no: number
          status: string
          superseded_by: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          drawing_set_id: string
          drawings_url?: string | null
          id?: string
          note?: string | null
          released_at?: string | null
          released_by?: string | null
          revision_no: number
          status?: string
          superseded_by?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          drawing_set_id?: string
          drawings_url?: string | null
          id?: string
          note?: string | null
          released_at?: string | null
          released_by?: string | null
          revision_no?: number
          status?: string
          superseded_by?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revisions_drawing_set_id_fkey"
            columns: ["drawing_set_id"]
            isOneToOne: false
            referencedRelation: "drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revisions_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revisions_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revisions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revisions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      drawing_set_works: {
        Row: {
          created_at: string
          created_by: string | null
          drawing_set_id: string
          id: string
          work_item_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          drawing_set_id: string
          id?: string
          work_item_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          drawing_set_id?: string
          id?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_set_works_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_set_works_drawing_set_id_fkey"
            columns: ["drawing_set_id"]
            isOneToOne: false
            referencedRelation: "drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_set_works_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_sets: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          design_stage_id: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          design_stage_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          design_stage_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_sets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_sets_design_stage_id_fkey"
            columns: ["design_stage_id"]
            isOneToOne: false
            referencedRelation: "design_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_sets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      est_counters: {
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
            foreignKeyName: "est_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      estimator_estimate_item_rates: {
        Row: {
          created_at: string
          created_by: string | null
          estimate_id: string
          id: string
          item_id: string | null
          material_id: string | null
          note: string | null
          rate: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estimate_id: string
          id?: string
          item_id?: string | null
          material_id?: string | null
          note?: string | null
          rate: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estimate_id?: string
          id?: string
          item_id?: string | null
          material_id?: string | null
          note?: string | null
          rate?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimator_estimate_item_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_item_rates_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_takeoff_facts"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "estimator_estimate_item_rates_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_work_facts"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "estimator_estimate_item_rates_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimator_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_item_rates_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_item_rates_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "estimator_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_item_rates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      estimator_estimate_line_components: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string | null
          line_id: string
          material_id: string | null
          mix_id: string | null
          qty_per_unit: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string | null
          line_id: string
          material_id?: string | null
          mix_id?: string | null
          qty_per_unit: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string | null
          line_id?: string
          material_id?: string | null
          mix_id?: string | null
          qty_per_unit?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimator_estimate_line_components_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_line_components_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_line_components_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "estimator_estimate_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_line_components_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "estimator_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_line_components_mix_id_fkey"
            columns: ["mix_id"]
            isOneToOne: false
            referencedRelation: "estimator_mixes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_line_components_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      estimator_estimate_line_costs: {
        Row: {
          created_at: string
          created_by: string | null
          estimate_id: string
          id: string
          labour_cost: number | null
          labour_rate: number | null
          line_id: string
          material_cost: number | null
          qty: number
          total_cost: number | null
          uom: string | null
          updated_at: string
          updated_by: string | null
          work_item_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estimate_id: string
          id?: string
          labour_cost?: number | null
          labour_rate?: number | null
          line_id: string
          material_cost?: number | null
          qty: number
          total_cost?: number | null
          uom?: string | null
          updated_at?: string
          updated_by?: string | null
          work_item_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estimate_id?: string
          id?: string
          labour_cost?: number | null
          labour_rate?: number | null
          line_id?: string
          material_cost?: number | null
          qty?: number
          total_cost?: number | null
          uom?: string | null
          updated_at?: string
          updated_by?: string | null
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimator_estimate_line_costs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_line_costs_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_takeoff_facts"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "estimator_estimate_line_costs_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_work_facts"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "estimator_estimate_line_costs_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimator_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_line_costs_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: true
            referencedRelation: "estimator_estimate_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_line_costs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_line_costs_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      estimator_estimate_line_measurements: {
        Row: {
          breadth: number | null
          created_at: string
          created_by: string | null
          depth: number | null
          description: string | null
          from_model: boolean
          id: string
          is_deduction: boolean
          length: number | null
          line_id: string
          model_refs: string[] | null
          nos: number | null
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          breadth?: number | null
          created_at?: string
          created_by?: string | null
          depth?: number | null
          description?: string | null
          from_model?: boolean
          id?: string
          is_deduction?: boolean
          length?: number | null
          line_id: string
          model_refs?: string[] | null
          nos?: number | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          breadth?: number | null
          created_at?: string
          created_by?: string | null
          depth?: number | null
          description?: string | null
          from_model?: boolean
          id?: string
          is_deduction?: boolean
          length?: number | null
          line_id?: string
          model_refs?: string[] | null
          nos?: number | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimator_estimate_line_measurements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_line_measurements_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "estimator_estimate_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_line_measurements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      estimator_estimate_lines: {
        Row: {
          created_at: string
          created_by: string | null
          estimate_id: string
          id: string
          labour_rate: number | null
          note: string | null
          qty: number | null
          updated_at: string
          updated_by: string | null
          work_item_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estimate_id: string
          id?: string
          labour_rate?: number | null
          note?: string | null
          qty?: number | null
          updated_at?: string
          updated_by?: string | null
          work_item_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estimate_id?: string
          id?: string
          labour_rate?: number | null
          note?: string | null
          qty?: number | null
          updated_at?: string
          updated_by?: string | null
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimator_estimate_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_lines_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_takeoff_facts"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "estimator_estimate_lines_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_work_facts"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "estimator_estimate_lines_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimator_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_lines_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_lines_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      estimator_estimate_takeoff: {
        Row: {
          created_at: string
          created_by: string | null
          estimate_id: string
          id: string
          item_id: string | null
          material_id: string | null
          material_name: string
          quantity: number
          rate: number | null
          uom: string
          updated_at: string
          updated_by: string | null
          work_item_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estimate_id: string
          id?: string
          item_id?: string | null
          material_id?: string | null
          material_name: string
          quantity: number
          rate?: number | null
          uom: string
          updated_at?: string
          updated_by?: string | null
          work_item_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estimate_id?: string
          id?: string
          item_id?: string | null
          material_id?: string | null
          material_name?: string
          quantity?: number
          rate?: number | null
          uom?: string
          updated_at?: string
          updated_by?: string | null
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimator_estimate_takeoff_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_takeoff_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_takeoff_facts"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "estimator_estimate_takeoff_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_work_facts"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "estimator_estimate_takeoff_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimator_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_takeoff_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_takeoff_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "estimator_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_takeoff_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_takeoff_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      estimator_estimates: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          est_no: number | null
          id: string
          is_template: boolean
          is_working: boolean
          model_file: string | null
          model_guid: string | null
          model_imported_at: string | null
          model_imported_by: string | null
          name: string
          note: string | null
          project_id: string
          reference: string | null
          source_estimate_id: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          superseded_at: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          est_no?: number | null
          id?: string
          is_template?: boolean
          is_working?: boolean
          model_file?: string | null
          model_guid?: string | null
          model_imported_at?: string | null
          model_imported_by?: string | null
          name: string
          note?: string | null
          project_id: string
          reference?: string | null
          source_estimate_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          superseded_at?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          est_no?: number | null
          id?: string
          is_template?: boolean
          is_working?: boolean
          model_file?: string | null
          model_guid?: string | null
          model_imported_at?: string | null
          model_imported_by?: string | null
          name?: string
          note?: string | null
          project_id?: string
          reference?: string | null
          source_estimate_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          superseded_at?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimator_estimates_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimates_model_imported_by_fkey"
            columns: ["model_imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimates_source_estimate_id_fkey"
            columns: ["source_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_takeoff_facts"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "estimator_estimates_source_estimate_id_fkey"
            columns: ["source_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_work_facts"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "estimator_estimates_source_estimate_id_fkey"
            columns: ["source_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimator_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimates_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimates_unit_fkey"
            columns: ["project_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "estimator_estimates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      estimator_materials: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          item_id: string | null
          item_uom_factor: number | null
          name: string
          rate: number | null
          uom: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          item_id?: string | null
          item_uom_factor?: number | null
          name: string
          rate?: number | null
          uom: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          item_id?: string | null
          item_uom_factor?: number | null
          name?: string
          rate?: number | null
          uom?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimator_materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_materials_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_materials_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "estimator_materials_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      estimator_mix_components: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string | null
          material_id: string | null
          mix_id: string
          qty_per_unit: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string | null
          material_id?: string | null
          mix_id: string
          qty_per_unit: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string | null
          material_id?: string | null
          mix_id?: string
          qty_per_unit?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimator_mix_components_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_mix_components_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_mix_components_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "estimator_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_mix_components_mix_id_fkey"
            columns: ["mix_id"]
            isOneToOne: false
            referencedRelation: "estimator_mixes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_mix_components_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      estimator_mixes: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          uom: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          uom: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          uom?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimator_mixes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_mixes_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "estimator_mixes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      estimator_reconciliation_approvals: {
        Row: {
          created_at: string
          created_by: string | null
          estimate_id: string
          id: string
          item_id: string
          note: string | null
          updated_at: string
          updated_by: string | null
          work_item_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estimate_id: string
          id?: string
          item_id: string
          note?: string | null
          updated_at?: string
          updated_by?: string | null
          work_item_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estimate_id?: string
          id?: string
          item_id?: string
          note?: string | null
          updated_at?: string
          updated_by?: string | null
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimator_reconciliation_approvals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_reconciliation_approvals_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_takeoff_facts"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "estimator_reconciliation_approvals_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_work_facts"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "estimator_reconciliation_approvals_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimator_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_reconciliation_approvals_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_reconciliation_approvals_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_reconciliation_approvals_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      estimator_uoms: {
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
            foreignKeyName: "estimator_uoms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_uoms_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      estimator_work_components: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string | null
          material_id: string | null
          mix_id: string | null
          qty_per_unit: number
          updated_at: string
          updated_by: string | null
          work_item_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string | null
          material_id?: string | null
          mix_id?: string | null
          qty_per_unit: number
          updated_at?: string
          updated_by?: string | null
          work_item_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string | null
          material_id?: string | null
          mix_id?: string | null
          qty_per_unit?: number
          updated_at?: string
          updated_by?: string | null
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimator_work_components_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_work_components_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_work_components_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "estimator_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_work_components_mix_id_fkey"
            columns: ["mix_id"]
            isOneToOne: false
            referencedRelation: "estimator_mixes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_work_components_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_work_components_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      estimator_work_info: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          labour_rate: number | null
          model_measure: string | null
          uom: string
          updated_at: string
          updated_by: string | null
          work_item_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          labour_rate?: number | null
          model_measure?: string | null
          uom: string
          updated_at?: string
          updated_by?: string | null
          work_item_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          labour_rate?: number | null
          model_measure?: string | null
          uom?: string
          updated_at?: string
          updated_by?: string | null
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimator_work_info_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_work_info_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "estimator_work_info_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_work_info_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: true
            referencedRelation: "work_items"
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
      goods_receipt_line_rates: {
        Row: {
          created_at: string
          gst_pct: number | null
          id: string
          note: string | null
          po_gst_pct: number | null
          po_rate: number | null
          rate: number | null
          receipt_line_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          gst_pct?: number | null
          id?: string
          note?: string | null
          po_gst_pct?: number | null
          po_rate?: number | null
          rate?: number | null
          receipt_line_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          gst_pct?: number | null
          id?: string
          note?: string | null
          po_gst_pct?: number | null
          po_rate?: number | null
          rate?: number | null
          receipt_line_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_line_rates_receipt_line_id_fkey"
            columns: ["receipt_line_id"]
            isOneToOne: true
            referencedRelation: "goods_receipt_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_line_rates_updated_by_fkey"
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
            referencedRelation: "po_line_billing_facts"
            referencedColumns: ["po_line_id"]
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
            foreignKeyName: "goods_receipt_lines_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
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
          invoice_date: string | null
          invoice_no: string | null
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
          work_item_id: string | null
        }
        Insert: {
          challan_no?: string | null
          created_at?: string
          created_by?: string | null
          grn_no: number
          id?: string
          invoice_date?: string | null
          invoice_no?: string | null
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
          work_item_id?: string | null
        }
        Update: {
          challan_no?: string | null
          created_at?: string
          created_by?: string | null
          grn_no?: number
          id?: string
          invoice_date?: string | null
          invoice_no?: string | null
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
          work_item_id?: string | null
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
            foreignKeyName: "goods_receipts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
          },
          {
            foreignKeyName: "goods_receipts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      google_chat_spaces: {
        Row: {
          created_at: string
          linked_at: string
          linked_by: string | null
          project_id: string
          space_id: string
          space_name: string | null
          unit_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          linked_at?: string
          linked_by?: string | null
          project_id: string
          space_id: string
          space_name?: string | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          linked_at?: string
          linked_by?: string | null
          project_id?: string
          space_id?: string
          space_name?: string | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_chat_spaces_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_chat_spaces_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_chat_spaces_project_id_unit_id_fkey"
            columns: ["project_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "google_chat_spaces_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_chat_spaces_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
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
          estimate_id: string | null
          estimator_decided_at: string | null
          estimator_decided_by: string | null
          estimator_decision: string | null
          estimator_note: string | null
          id: string
          indent_id: string
          item_id: string
          line_key: string | null
          note: string | null
          off_estimate_reason: string | null
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
          estimate_id?: string | null
          estimator_decided_at?: string | null
          estimator_decided_by?: string | null
          estimator_decision?: string | null
          estimator_note?: string | null
          id?: string
          indent_id: string
          item_id: string
          line_key?: string | null
          note?: string | null
          off_estimate_reason?: string | null
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
          estimate_id?: string | null
          estimator_decided_at?: string | null
          estimator_decided_by?: string | null
          estimator_decision?: string | null
          estimator_note?: string | null
          id?: string
          indent_id?: string
          item_id?: string
          line_key?: string | null
          note?: string | null
          off_estimate_reason?: string | null
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
            foreignKeyName: "indent_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indent_lines_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_takeoff_facts"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "indent_lines_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_work_facts"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "indent_lines_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimator_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indent_lines_estimator_decided_by_fkey"
            columns: ["estimator_decided_by"]
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
            foreignKeyName: "indent_lines_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
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
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          id: string
          indent_no: number
          is_urgent: boolean
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
          work_item_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          indent_no: number
          is_urgent?: boolean
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
          work_item_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          indent_no?: number
          is_urgent?: boolean
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
          work_item_id?: string | null
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
            foreignKeyName: "indents_cancelled_by_fkey"
            columns: ["cancelled_by"]
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
            foreignKeyName: "indents_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
          },
          {
            foreignKeyName: "indents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
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
      issue_requests: {
        Row: {
          created_at: string
          created_by: string | null
          declined_reason: string | null
          fulfilled_issue_id: string | null
          id: string
          item_id: string
          note: string | null
          off_estimate_reason: string | null
          plot_id: string
          quantity: number
          status: string
          updated_at: string
          updated_by: string | null
          work_class: string
          work_item_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          declined_reason?: string | null
          fulfilled_issue_id?: string | null
          id?: string
          item_id: string
          note?: string | null
          off_estimate_reason?: string | null
          plot_id: string
          quantity: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          work_class?: string
          work_item_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          declined_reason?: string | null
          fulfilled_issue_id?: string | null
          id?: string
          item_id?: string
          note?: string | null
          off_estimate_reason?: string | null
          plot_id?: string
          quantity?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          work_class?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_requests_fulfilled_issue_id_fkey"
            columns: ["fulfilled_issue_id"]
            isOneToOne: false
            referencedRelation: "stock_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_requests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_requests_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_requests_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_requests_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
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
      item_price_changes: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          item_id: string
          new_price: number
          old_price: number | null
          po_id: string
          po_line_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          item_id: string
          new_price: number
          old_price?: number | null
          po_id: string
          po_line_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          item_id?: string
          new_price?: number
          old_price?: number | null
          po_id?: string
          po_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_price_changes_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_price_changes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_price_changes_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_billing_totals"
            referencedColumns: ["po_id"]
          },
          {
            foreignKeyName: "item_price_changes_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_price_changes_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_price_changes_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "po_line_billing_facts"
            referencedColumns: ["po_line_id"]
          },
          {
            foreignKeyName: "item_price_changes_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "po_line_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_price_changes_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
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
          gst_pct: number | null
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
          gst_pct?: number | null
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
          gst_pct?: number | null
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
            foreignKeyName: "items_default_uom_fkey"
            columns: ["default_uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
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
      labour_contract_lines: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_lump_sum: boolean
          quantity: number | null
          rate: number
          sort_order: number
          uom: string | null
          updated_at: string
          updated_by: string | null
          work_item_id: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          is_lump_sum?: boolean
          quantity?: number | null
          rate: number
          sort_order?: number
          uom?: string | null
          updated_at?: string
          updated_by?: string | null
          work_item_id?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_lump_sum?: boolean
          quantity?: number | null
          rate?: number
          sort_order?: number
          uom?: string | null
          updated_at?: string
          updated_by?: string | null
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "labour_contract_lines_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "labour_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_contract_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_contract_lines_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "labour_contract_lines_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_contract_lines_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      labour_contracts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          contract_value: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_active: boolean
          plot_id: string | null
          project_id: string
          reference: string | null
          status: string
          terms: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string
          wo_no: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          contract_value: number
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          is_active?: boolean
          plot_id?: string | null
          project_id: string
          reference?: string | null
          status?: string
          terms?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id: string
          wo_no?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          contract_value?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_active?: boolean
          plot_id?: string | null
          project_id?: string
          reference?: string | null
          status?: string
          terms?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string
          wo_no?: number | null
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
            foreignKeyName: "labour_contracts_cancelled_by_fkey"
            columns: ["cancelled_by"]
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
            foreignKeyName: "labour_contracts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
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
      labour_logs: {
        Row: {
          bill_id: string | null
          contractor_id: string
          created_at: string
          created_by: string | null
          description: string | null
          helpers: number
          id: string
          kind: string
          log_date: string
          masons: number
          note: string | null
          others: number
          plot_id: string
          quantity: number | null
          uom: string | null
          updated_at: string
          updated_by: string | null
          work_class: string
          work_item_id: string
        }
        Insert: {
          bill_id?: string | null
          contractor_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          helpers?: number
          id?: string
          kind?: string
          log_date?: string
          masons?: number
          note?: string | null
          others?: number
          plot_id: string
          quantity?: number | null
          uom?: string | null
          updated_at?: string
          updated_by?: string | null
          work_class?: string
          work_item_id: string
        }
        Update: {
          bill_id?: string | null
          contractor_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          helpers?: number
          id?: string
          kind?: string
          log_date?: string
          masons?: number
          note?: string | null
          others?: number
          plot_id?: string
          quantity?: number | null
          uom?: string | null
          updated_at?: string
          updated_by?: string | null
          work_class?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labour_logs_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_logs_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_money_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_logs_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_logs_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_logs_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_logs_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "labour_logs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_logs_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
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
      progress_stages: {
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
            foreignKeyName: "progress_stages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_stages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          company_id: string | null
          created_at: string
          id: string
          is_test: boolean
          location: string | null
          name: string
          project_type: string
          status: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          code?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_test?: boolean
          location?: string | null
          name: string
          project_type: string
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          code?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_test?: boolean
          location?: string | null
          name?: string
          project_type?: string
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          discount_amount: number | null
          discount_pct: number | null
          gst_pct: number | null
          id: string
          indent_line_id: string | null
          item_id: string
          note: string | null
          other_charges: number | null
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
          discount_amount?: number | null
          discount_pct?: number | null
          gst_pct?: number | null
          id?: string
          indent_line_id?: string | null
          item_id: string
          note?: string | null
          other_charges?: number | null
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
          discount_amount?: number | null
          discount_pct?: number | null
          gst_pct?: number | null
          id?: string
          indent_line_id?: string | null
          item_id?: string
          note?: string | null
          other_charges?: number | null
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
            foreignKeyName: "purchase_order_lines_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
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
          charges_amount: number | null
          charges_gst_pct: number | null
          charges_note: string | null
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
          charges_amount?: number | null
          charges_gst_pct?: number | null
          charges_note?: string | null
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
          charges_amount?: number | null
          charges_gst_pct?: number | null
          charges_note?: string | null
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
            foreignKeyName: "purchase_orders_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
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
      push_devices: {
        Row: {
          created_at: string
          platform: string
          profile_id: string
          seen_at: string
          token: string
        }
        Insert: {
          created_at?: string
          platform: string
          profile_id: string
          seen_at?: string
          token: string
        }
        Update: {
          created_at?: string
          platform?: string
          profile_id?: string
          seen_at?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_devices_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "pusher_chains_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
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
          {
            foreignKeyName: "selection_lines_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
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
          {
            foreignKeyName: "selections_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      site_checklist_items: {
        Row: {
          checklist_id: string
          created_at: string
          created_by: string | null
          id: string
          photo_path: string | null
          remarks: string | null
          status: string
          template_item_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          checklist_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          photo_path?: string | null
          remarks?: string | null
          status?: string
          template_item_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          checklist_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          photo_path?: string | null
          remarks?: string | null
          status?: string
          template_item_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "site_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_checklist_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_checklist_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_checklist_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_checklists: {
        Row: {
          attachment_path: string | null
          created_at: string
          created_by: string | null
          drawing_revision: string | null
          finished_on: string | null
          id: string
          inspected_on: string | null
          location: string | null
          note: string | null
          plot_id: string
          signed_off_at: string | null
          signed_off_by: string | null
          started_on: string
          status: string
          template_id: string
          updated_at: string
          updated_by: string | null
          work_group_id: string | null
        }
        Insert: {
          attachment_path?: string | null
          created_at?: string
          created_by?: string | null
          drawing_revision?: string | null
          finished_on?: string | null
          id?: string
          inspected_on?: string | null
          location?: string | null
          note?: string | null
          plot_id: string
          signed_off_at?: string | null
          signed_off_by?: string | null
          started_on?: string
          status?: string
          template_id: string
          updated_at?: string
          updated_by?: string | null
          work_group_id?: string | null
        }
        Update: {
          attachment_path?: string | null
          created_at?: string
          created_by?: string | null
          drawing_revision?: string | null
          finished_on?: string | null
          id?: string
          inspected_on?: string | null
          location?: string | null
          note?: string | null
          plot_id?: string
          signed_off_at?: string | null
          signed_off_by?: string | null
          started_on?: string
          status?: string
          template_id?: string
          updated_at?: string
          updated_by?: string | null
          work_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_checklists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_checklists_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_checklists_signed_off_by_fkey"
            columns: ["signed_off_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_checklists_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_checklists_work_group_id_fkey"
            columns: ["work_group_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      site_receipt_confirmation_lines: {
        Row: {
          confirmation_id: string
          id: string
          issue_line_id: string | null
          receipt_line_id: string | null
          received_quantity: number
        }
        Insert: {
          confirmation_id: string
          id?: string
          issue_line_id?: string | null
          receipt_line_id?: string | null
          received_quantity: number
        }
        Update: {
          confirmation_id?: string
          id?: string
          issue_line_id?: string | null
          receipt_line_id?: string | null
          received_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_receipt_confirmation_lines_confirmation_id_fkey"
            columns: ["confirmation_id"]
            isOneToOne: false
            referencedRelation: "site_receipt_confirmations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_receipt_confirmation_lines_issue_line_id_fkey"
            columns: ["issue_line_id"]
            isOneToOne: true
            referencedRelation: "stock_issue_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_receipt_confirmation_lines_receipt_line_id_fkey"
            columns: ["receipt_line_id"]
            isOneToOne: true
            referencedRelation: "goods_receipt_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      site_receipt_confirmations: {
        Row: {
          confirmed_at: string
          confirmed_by: string
          id: string
          issue_id: string | null
          note: string | null
          receipt_id: string | null
        }
        Insert: {
          confirmed_at?: string
          confirmed_by: string
          id?: string
          issue_id?: string | null
          note?: string | null
          receipt_id?: string | null
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string
          id?: string
          issue_id?: string | null
          note?: string | null
          receipt_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_receipt_confirmations_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_receipt_confirmations_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: true
            referencedRelation: "stock_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_receipt_confirmations_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: true
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      site_schedule_settings: {
        Row: {
          created_at: string
          id: string
          singleton: boolean
          typical_sqft: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          singleton?: boolean
          typical_sqft?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          singleton?: boolean
          typical_sqft?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_schedule_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_sequence: {
        Row: {
          created_at: string
          created_by: string | null
          days_to_confirm: boolean
          follows_group_id: string | null
          id: string
          link: string
          position: number
          typical_days: number | null
          updated_at: string
          updated_by: string | null
          wait_days: number
          work_group_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          days_to_confirm?: boolean
          follows_group_id?: string | null
          id?: string
          link?: string
          position: number
          typical_days?: number | null
          updated_at?: string
          updated_by?: string | null
          wait_days?: number
          work_group_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          days_to_confirm?: boolean
          follows_group_id?: string | null
          id?: string
          link?: string
          position?: number
          typical_days?: number | null
          updated_at?: string
          updated_by?: string | null
          wait_days?: number
          work_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_sequence_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_sequence_follows_group_id_fkey"
            columns: ["follows_group_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_sequence_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_sequence_work_group_id_fkey"
            columns: ["work_group_id"]
            isOneToOne: true
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      site_stage_events: {
        Row: {
          actor_id: string | null
          at: string
          from_status: string | null
          id: string
          kind: string
          note: string | null
          plot_id: string
          seq: number
          to_status: string | null
          waiting_on: string | null
          work_group_id: string | null
        }
        Insert: {
          actor_id?: string | null
          at?: string
          from_status?: string | null
          id?: string
          kind: string
          note?: string | null
          plot_id: string
          seq?: never
          to_status?: string | null
          waiting_on?: string | null
          work_group_id?: string | null
        }
        Update: {
          actor_id?: string | null
          at?: string
          from_status?: string | null
          id?: string
          kind?: string
          note?: string | null
          plot_id?: string
          seq?: never
          to_status?: string | null
          waiting_on?: string | null
          work_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_stage_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_stage_events_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_stage_events_work_group_id_fkey"
            columns: ["work_group_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      site_stages: {
        Row: {
          baseline_finish: string | null
          baseline_start: string | null
          contractor_id: string | null
          created_at: string
          created_by: string | null
          days: number | null
          finished_on: string | null
          follows_group_id: string | null
          id: string
          link: string | null
          not_needed: boolean
          pinned_start: string | null
          plot_id: string
          started_on: string | null
          status: string
          status_changed_at: string
          updated_at: string
          updated_by: string | null
          waiting_note: string | null
          waiting_on: string | null
          work_group_id: string
        }
        Insert: {
          baseline_finish?: string | null
          baseline_start?: string | null
          contractor_id?: string | null
          created_at?: string
          created_by?: string | null
          days?: number | null
          finished_on?: string | null
          follows_group_id?: string | null
          id?: string
          link?: string | null
          not_needed?: boolean
          pinned_start?: string | null
          plot_id: string
          started_on?: string | null
          status?: string
          status_changed_at?: string
          updated_at?: string
          updated_by?: string | null
          waiting_note?: string | null
          waiting_on?: string | null
          work_group_id: string
        }
        Update: {
          baseline_finish?: string | null
          baseline_start?: string | null
          contractor_id?: string | null
          created_at?: string
          created_by?: string | null
          days?: number | null
          finished_on?: string | null
          follows_group_id?: string | null
          id?: string
          link?: string | null
          not_needed?: boolean
          pinned_start?: string | null
          plot_id?: string
          started_on?: string | null
          status?: string
          status_changed_at?: string
          updated_at?: string
          updated_by?: string | null
          waiting_note?: string | null
          waiting_on?: string | null
          work_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_stages_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_stages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_stages_follows_group_id_fkey"
            columns: ["follows_group_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_stages_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_stages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_stages_work_group_id_fkey"
            columns: ["work_group_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      site_villas: {
        Row: {
          baseline_note: string | null
          baselined_at: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          plot_id: string
          start_on: string | null
          supervisor_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          baseline_note?: string | null
          baselined_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          plot_id: string
          start_on?: string | null
          supervisor_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          baseline_note?: string | null
          baselined_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          plot_id?: string
          start_on?: string | null
          supervisor_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_villas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_villas_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: true
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_villas_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_villas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          {
            foreignKeyName: "spaces_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
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
            foreignKeyName: "stock_adjustments_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
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
      stock_batch_movements: {
        Row: {
          adjustment_id: string | null
          created_at: string
          created_by: string | null
          id: string
          issue_line_id: string | null
          quantity: number
          receipt_line_id: string
          store_id: string
        }
        Insert: {
          adjustment_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          issue_line_id?: string | null
          quantity: number
          receipt_line_id: string
          store_id: string
        }
        Update: {
          adjustment_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          issue_line_id?: string | null
          quantity?: number
          receipt_line_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_batch_movements_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "stock_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batch_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batch_movements_issue_line_id_fkey"
            columns: ["issue_line_id"]
            isOneToOne: false
            referencedRelation: "stock_issue_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batch_movements_receipt_line_id_fkey"
            columns: ["receipt_line_id"]
            isOneToOne: false
            referencedRelation: "goods_receipt_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batch_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_deletions: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          id: string
          kind: string
          reason: string
          reference: string
          snapshot: Json
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          kind: string
          reason: string
          reference: string
          snapshot: Json
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          kind?: string
          reason?: string
          reference?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "stock_deletions_deleted_by_fkey"
            columns: ["deleted_by"]
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
          preferred_receipt_line_id: string | null
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
          preferred_receipt_line_id?: string | null
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
          preferred_receipt_line_id?: string | null
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
            foreignKeyName: "stock_issue_lines_preferred_receipt_line_id_fkey"
            columns: ["preferred_receipt_line_id"]
            isOneToOne: false
            referencedRelation: "goods_receipt_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issue_lines_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
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
          work_class: string
          work_item_id: string | null
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
          work_class?: string
          work_item_id?: string | null
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
          work_class?: string
          work_item_id?: string | null
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
          {
            foreignKeyName: "stock_issues_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
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
      tool_leads: {
        Row: {
          app: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          app: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          app?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_leads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_team_apps: {
        Row: {
          app: string
          id: string
          team_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          app: string
          id?: string
          team_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          app?: string
          id?: string
          team_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_team_apps_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tool_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_team_apps_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_teams: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_teams_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transmittal_counters: {
        Row: {
          last_no: number
          scope: string
        }
        Insert: {
          last_no?: number
          scope: string
        }
        Update: {
          last_no?: number
          scope?: string
        }
        Relationships: []
      }
      transmittal_lines: {
        Row: {
          created_at: string
          created_by: string | null
          drawing_revision_id: string
          id: string
          sort_order: number
          transmittal_id: string
          unit_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          drawing_revision_id: string
          id?: string
          sort_order?: number
          transmittal_id: string
          unit_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          drawing_revision_id?: string
          id?: string
          sort_order?: number
          transmittal_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transmittal_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transmittal_lines_drawing_revision_id_unit_id_fkey"
            columns: ["drawing_revision_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["id", "unit_id"]
          },
          {
            foreignKeyName: "transmittal_lines_transmittal_id_unit_id_fkey"
            columns: ["transmittal_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "transmittals"
            referencedColumns: ["id", "unit_id"]
          },
        ]
      }
      transmittals: {
        Row: {
          created_at: string
          created_by: string | null
          design_stage_id: string
          id: string
          issued_at: string | null
          issued_by: string | null
          note: string | null
          number: string | null
          status: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          design_stage_id: string
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          note?: string | null
          number?: string | null
          status?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          design_stage_id?: string
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          note?: string | null
          number?: string | null
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transmittals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transmittals_design_stage_id_fkey"
            columns: ["design_stage_id"]
            isOneToOne: false
            referencedRelation: "design_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transmittals_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transmittals_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transmittals_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
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
      uoms: {
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
            foreignKeyName: "uoms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uoms_updated_by_fkey"
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
      vendor_payment_details: {
        Row: {
          account_holder_name: string | null
          account_number: string | null
          bank_name: string | null
          created_at: string
          id: string
          ifsc: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string
        }
        Insert: {
          account_holder_name?: string | null
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          ifsc?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id: string
        }
        Update: {
          account_holder_name?: string | null
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          ifsc?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payment_details_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payment_details_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          contact_designation: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          gst_no: string | null
          gst_state: string | null
          id: string
          is_active: boolean
          is_contractor: boolean
          mobile: string | null
          name: string
          payment_term_days: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          contact_designation?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          gst_no?: string | null
          gst_state?: string | null
          id?: string
          is_active?: boolean
          is_contractor?: boolean
          mobile?: string | null
          name: string
          payment_term_days?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          contact_designation?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          gst_no?: string | null
          gst_state?: string | null
          id?: string
          is_active?: boolean
          is_contractor?: boolean
          mobile?: string | null
          name?: string
          payment_term_days?: number | null
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
      wo_counters: {
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
            foreignKeyName: "wo_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      work_categories: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          family: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          family?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          family?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_groups: {
        Row: {
          category_id: string
          code: string
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
          category_id: string
          code: string
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
          category_id?: string
          code?: string
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
            foreignKeyName: "work_groups_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "work_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_groups_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_items: {
        Row: {
          category_id: string
          code: string
          created_at: string
          created_by: string | null
          group_id: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category_id: string
          code: string
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "work_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_group_in_category_fkey"
            columns: ["category_id", "group_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["category_id", "id"]
          },
          {
            foreignKeyName: "work_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_template_lines: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_lump_sum: boolean
          sort_order: number
          template_id: string
          uom: string | null
          updated_at: string
          updated_by: string | null
          work_item_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          is_lump_sum?: boolean
          sort_order?: number
          template_id: string
          uom?: string | null
          updated_at?: string
          updated_by?: string | null
          work_item_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_lump_sum?: boolean
          sort_order?: number
          template_id?: string
          uom?: string | null
          updated_at?: string
          updated_by?: string | null
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_order_template_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_template_lines_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "work_order_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_template_lines_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "work_order_template_lines_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_template_lines_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          terms: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          terms?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          terms?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_order_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_templates_updated_by_fkey"
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
          {
            foreignKeyName: "budgets_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      batch_on_hand: {
        Row: {
          item_id: string | null
          quantity: number | null
          receipt_line_id: string | null
          received_at: string | null
          store_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
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
            foreignKeyName: "bills_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
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
            foreignKeyName: "bills_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
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
      birdwing_expense_facts: {
        Row: {
          amount: number | null
          description: string | null
          expense_id: string | null
          has_bill: boolean | null
          head: string | null
          is_salary: boolean | null
          month: string | null
          paid_to: string | null
          spent_on: string | null
          status: string | null
        }
        Relationships: []
      }
      birdwing_month_facts: {
        Row: {
          billed: number | null
          billed_guest: number | null
          billed_internal: number | null
          charged: number | null
          collected: number | null
          cross_charged: number | null
          days_in_month: number | null
          discount: number | null
          expenses: number | null
          guest_nights: number | null
          guest_stays: number | null
          internal_stays: number | null
          month: string | null
          ota_commission: number | null
          pending: number | null
          pending_guest: number | null
          pending_internal: number | null
          room_nights: number | null
          room_nights_estimated: boolean | null
          room_revenue: number | null
          rooms: number | null
          salary_expenses: number | null
          stays: number | null
          written_off: number | null
        }
        Relationships: []
      }
      birdwing_occupancy_facts: {
        Row: {
          guests_in_house: number | null
          on_date: string | null
          rooms_occupied: number | null
        }
        Relationships: []
      }
      birdwing_stay_facts: {
        Row: {
          arrival: string | null
          billed: number | null
          channel: string | null
          charged: number | null
          collected: number | null
          cost_centre: string | null
          cross_charged: number | null
          departure: string | null
          discount: number | null
          guest_name: string | null
          guests: number | null
          imported: boolean | null
          invoice_number: string | null
          month: string | null
          nights: number | null
          ota_commission: number | null
          pending: number | null
          ref: string | null
          room_nights: number | null
          room_nights_estimated: boolean | null
          room_revenue: number | null
          segment: string | null
          status: string | null
          stay_id: string | null
          use: string | null
          written_off: number | null
        }
        Relationships: []
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
            foreignKeyName: "budgets_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
          },
          {
            foreignKeyName: "selection_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_lines_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
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
            foreignKeyName: "client_engagements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
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
            foreignKeyName: "client_engagements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
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
      estimate_takeoff_facts: {
        Row: {
          estimate_id: string | null
          item_id: string | null
          item_uom_factor: number | null
          material_id: string | null
          material_name: string | null
          project_id: string | null
          quantity: number | null
          reference: string | null
          submitted_at: string | null
          unit_id: string | null
          uom: string | null
          work_item_id: string | null
          working_updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimator_estimate_takeoff_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "estimator_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimate_takeoff_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_estimates_unit_fkey"
            columns: ["project_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["project_id", "id"]
          },
        ]
      }
      estimate_work_facts: {
        Row: {
          estimate_id: string | null
          quantity: number | null
          unit_id: string | null
          uom: string | null
          work_item_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimator_estimate_lines_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_work_info_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
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
            foreignKeyName: "purchase_orders_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
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
      po_line_billing_facts: {
        Row: {
          billed_quantity: number | null
          discount_amount: number | null
          discount_pct: number | null
          gst_pct: number | null
          item_id: string | null
          ordered_quantity: number | null
          other_charges: number | null
          po_id: string | null
          po_line_id: string | null
          rate: number | null
          received_quantity: number | null
          uom: string | null
        }
        Relationships: [
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
            foreignKeyName: "purchase_order_lines_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
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
          {
            foreignKeyName: "purchase_order_lines_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
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
          {
            foreignKeyName: "pusher_chains_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "villa_cost_facts"
            referencedColumns: ["unit_id"]
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
      villa_cost_facts: {
        Row: {
          amount: number | null
          kind: string | null
          plot_id: string | null
          unit_id: string | null
          unpriced: boolean | null
          work_item_id: string | null
        }
        Relationships: []
      }
      work_labour_rate_facts: {
        Row: {
          labour_rate: number | null
          uom: string | null
          work_item_id: string | null
        }
        Insert: {
          labour_rate?: number | null
          uom?: string | null
          work_item_id?: string | null
        }
        Update: {
          labour_rate?: number | null
          uom?: string | null
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimator_work_info_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "estimator_work_info_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: true
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_line_billing_facts: {
        Row: {
          billed_value: number | null
          contract_id: string | null
          labour_contract_line_id: string | null
          line_value: number | null
          work_item_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "labour_contract_lines_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "labour_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_contract_lines_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_unit_facts: {
        Row: {
          uom: string | null
          work_item_id: string | null
        }
        Insert: {
          uom?: string | null
          work_item_id?: string | null
        }
        Update: {
          uom?: string | null
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimator_work_info_uom_fkey"
            columns: ["uom"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "estimator_work_info_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: true
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
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
      allocate_batches: {
        Args: {
          p_adjustment_id: string
          p_issue_line_id: string
          p_item_id: string
          p_preferred: string
          p_qty: number
          p_store_id: string
          p_to_store_id: string
        }
        Returns: undefined
      }
      bill_approval_cap: { Args: { uid: string }; Returns: number }
      birdwing_confirm_salary: {
        Args: {
          p_base: number
          p_deductions: number
          p_guest_amount: number
          p_guest_days: number
          p_incentives: number
          p_month: string
          p_note?: string
          p_ot_amount: number
          p_ot_hours: number
          p_room_amount: number
          p_room_days: number
          p_staff_id: string
        }
        Returns: string
      }
      birdwing_issue_invoice: {
        Args: {
          p_bill_to_address?: string
          p_bill_to_gstin?: string
          p_bill_to_name: string
          p_stay_id: string
        }
        Returns: string
      }
      birdwing_mint: { Args: { p_scope: string }; Returns: number }
      can_approve_bills: { Args: { uid: string }; Returns: boolean }
      can_approve_indents: { Args: { uid: string }; Returns: boolean }
      claim_push_device: {
        Args: { p_platform: string; p_token: string }
        Returns: undefined
      }
      client_relations_team: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
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
      create_goods_receipt:
        | {
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
        | {
            Args: {
              p_challan_no: string
              p_note: string
              p_po_id: string
              p_received_at: string
              p_store_id: string
              p_to_site: boolean
              p_work_item_id: string
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
      create_stock_issue:
        | {
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
        | {
            Args: {
              p_issued_at: string
              p_note: string
              p_plot_id: string
              p_project_id: string
              p_store_id: string
              p_to_store_id: string
              p_work_item_id: string
            }
            Returns: string
          }
      crm_assign_unit: {
        Args: { p_client_id: string; p_status: string; p_unit_id: string }
        Returns: undefined
      }
      crm_may_place_action: {
        Args: { p_action_id: string; p_engagement_id: string }
        Returns: boolean
      }
      crm_owns_plot: { Args: { p_engagement_id: string }; Returns: boolean }
      crm_release_unit: { Args: { p_unit_id: string }; Returns: undefined }
      crm_sees_action: { Args: { p_action_id: string }; Returns: boolean }
      crm_sees_plot: { Args: { p_engagement_id: string }; Returns: boolean }
      decide_indent_line: {
        Args: { p_decision: string; p_line_id: string; p_note: string }
        Returns: undefined
      }
      delete_draft_cash_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      delete_draft_estimate: {
        Args: { p_estimate: string }
        Returns: undefined
      }
      delete_draft_indent: { Args: { p_indent_id: string }; Returns: undefined }
      delete_draft_purchase_order: {
        Args: { p_po_id: string }
        Returns: undefined
      }
      delete_draft_revision: {
        Args: { p_revision_id: string }
        Returns: undefined
      }
      delete_draft_selection: {
        Args: { p_selection_id: string }
        Returns: undefined
      }
      delete_draft_transmittal: {
        Args: { p_transmittal_id: string }
        Returns: undefined
      }
      delete_goods_receipt: {
        Args: { p_reason: string; p_receipt_id: string }
        Returns: undefined
      }
      delete_pending_work_order: {
        Args: { p_contract_id: string }
        Returns: undefined
      }
      delete_pricing_budget: {
        Args: { p_budget_id: string }
        Returns: undefined
      }
      delete_recorded_bill: { Args: { p_bill_id: string }; Returns: undefined }
      delete_stock_issue: {
        Args: { p_issue_id: string; p_reason: string }
        Returns: undefined
      }
      delete_test_project: { Args: { p_project: string }; Returns: Json }
      design_pass_step: {
        Args: {
          p_from: string
          p_note: string
          p_people: string[]
          p_to: string
          p_unit: string
        }
        Returns: undefined
      }
      design_set_where: {
        Args: { p_people: string[]; p_stage: string; p_unit: string }
        Returns: undefined
      }
      design_team: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
      directory_emails: {
        Args: never
        Returns: {
          email: string
          id: string
        }[]
      }
      discard_chain: { Args: { p_chain_id: string }; Returns: undefined }
      estimator_copy_estimate_contents: {
        Args: { p_everything: boolean; p_from: string; p_to: string }
        Returns: undefined
      }
      hand_baton: {
        Args: { p_chain_id: string; p_note: string; p_to_user: string }
        Returns: undefined
      }
      has_app: { Args: { slug: string }; Returns: boolean }
      import_model_rows: {
        Args: { p_estimate: string; p_lines: Json; p_model: Json }
        Returns: string[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_bill_approver: { Args: never; Returns: boolean }
      is_lead: { Args: { slug: string }; Returns: boolean }
      issue_selection: { Args: { p_selection_id: string }; Returns: undefined }
      issue_transmittal: { Args: { p_transmittal_id: string }; Returns: string }
      make_estimate_official: {
        Args: { p_costs: Json; p_takeoff: Json; p_working: string }
        Returns: string
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
      replay_pre_batch_history: { Args: never; Returns: number }
      seed_default_project_stages: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      send_labour_logs_to_bill: {
        Args: {
          p_bill_date: string
          p_bill_reference: string
          p_labour_contract_id: string
          p_log_ids: string[]
          p_note: string
          p_override_note: string
          p_rates: Json
          p_total_override: number
        }
        Returns: string
      }
      session_is_verified: { Args: never; Returns: boolean }
      set_chain_departments: {
        Args: { p_chain_id: string; p_department_ids: string[] }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_chain: { Args: { p_chain_id: string }; Returns: undefined }
      start_villa_estimate: {
        Args: {
          p_everything: boolean
          p_name: string
          p_source: string
          p_unit: string
        }
        Returns: string
      }
      stock_qty_on_hand: {
        Args: { p_item_id: string; p_store_id: string }
        Returns: number
      }
      submit_estimate: { Args: { p_estimate_id: string }; Returns: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
