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
      brands: {
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
      clients: {
        Row: {
          created_at: string
          email: string | null
          id: string
          mobile: string | null
          name: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          mobile?: string | null
          name: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          mobile?: string | null
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      item_categories: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
        }
        Relationships: []
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
        ]
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
          created_at: string
          id: string
          name: string
          project_id: string
          status: string
        }
        Insert: {
          area?: number | null
          created_at?: string
          id?: string
          name: string
          project_id: string
          status?: string
        }
        Update: {
          area?: number | null
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "plots_project_id_fkey"
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
          role: string
          team: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role?: string
          team?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
          team?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          id: string
          location: string | null
          name: string
          project_type: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          name: string
          project_type: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          project_type?: string
          status?: string
        }
        Relationships: []
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
      stores: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          name: string
          project_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          project_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          name: string
          plot_id: string | null
          project_id: string
          status: string
          unit_type: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          name: string
          plot_id?: string | null
          project_id: string
          status?: string
          unit_type: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          name?: string
          plot_id?: string | null
          project_id?: string
          status?: string
          unit_type?: string
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
            foreignKeyName: "units_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_apps: {
        Row: {
          app: string
          granted_at: string
          user_id: string
        }
        Insert: {
          app: string
          granted_at?: string
          user_id: string
        }
        Update: {
          app?: string
          granted_at?: string
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
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_users: {
        Args: never
        Returns: {
          email: string
          full_name: string
          id: string
          role: string
          team: string
        }[]
      }
      create_next_revision: {
        Args: { p_from_selection_id: string }
        Returns: string
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
