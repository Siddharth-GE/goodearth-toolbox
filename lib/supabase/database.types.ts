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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
