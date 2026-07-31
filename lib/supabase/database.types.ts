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
          kind: string
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
          kind: string
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
          kind?: string
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
      space_types: {
        Row: {
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      spaces: {
        Row: {
          id: string
          label: string | null
          sort_order: number
          space_type_id: string
          unit_id: string
        }
        Insert: {
          id?: string
          label?: string | null
          sort_order?: number
          space_type_id: string
          unit_id: string
        }
        Update: {
          id?: string
          label?: string | null
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
      is_admin: { Args: never; Returns: boolean }
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
