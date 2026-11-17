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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      bank_accounts: {
        Row: {
          created_at: string
          id: string
          bank_name: string
          account_name: string
          iban: string | null
          account_no: string | null
          type: string
          balance: number
          currency: string
          color: string | null
          credit_limit: number | null
          interest_rate: number | null
          archived: boolean
          owner_id: string
          team_id: string
          connection_id: string | null
          account_kind: string
          provider_account_id: string | null
          last_balance_synced_at: string | null
        }
        Insert: {
          bank_name?: string
          account_name?: string
          iban?: string | null
          account_no?: string | null
          type?: string
          balance?: number
          currency?: string
          color?: string | null
          credit_limit?: number | null
          interest_rate?: number | null
          archived?: boolean
          created_at?: string
          id?: string
          owner_id?: string
          team_id?: string
          connection_id?: string | null
          account_kind?: string
          provider_account_id?: string | null
          last_balance_synced_at?: string | null
        }
        Update: {
          bank_name?: string
          account_name?: string
          iban?: string | null
          account_no?: string | null
          type?: string
          balance?: number
          currency?: string
          color?: string | null
          credit_limit?: number | null
          interest_rate?: number | null
          archived?: boolean
          created_at?: string
          id?: string
          owner_id?: string
          team_id?: string
          connection_id?: string | null
          account_kind?: string
          provider_account_id?: string | null
          last_balance_synced_at?: string | null
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          account_id: string
          amount: number
          archived: boolean
          balance_after: number
          counterparty: string
          created_at: string
          date: string
          description: string
          direction: string
          id: string
          owner_id: string
          reference: string
          source: string | null
          source_ref: string | null
          status: string
          team_id: string
          type: string
          provider_transaction_id: string | null
          provider_updated_at: string | null
          receipt_status: string
        }
        Insert: {
          account_id: string
          amount: number
          archived?: boolean
          balance_after?: number
          counterparty?: string
          created_at?: string
          date?: string
          description: string
          direction?: string
          id?: string
          owner_id?: string
          reference?: string
          source?: string | null
          source_ref?: string | null
          status?: string
          team_id?: string
          type?: string
          provider_transaction_id?: string | null
          provider_updated_at?: string | null
          receipt_status?: string
        }
        Update: {
          account_id?: string
          amount?: number
          archived?: boolean
          balance_after?: number
          counterparty?: string
          created_at?: string
          date?: string
          description?: string
          direction?: string
          id?: string
          owner_id?: string
          reference?: string
          source?: string | null
          source_ref?: string | null
          status?: string
          team_id?: string
          type?: string
          provider_transaction_id?: string | null
          provider_updated_at?: string | null
          receipt_status?: string
        }
        Relationships: []
      }
      bank_connections: {
        Row: {
          id: string
          team_id: string
          owner_id: string
          provider: string
          provider_connection_id: string | null
          status: string
          consent_expires_at: string | null
          last_sync_at: string | null
          last_sync_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          team_id?: string
          owner_id?: string
          provider: string
          provider_connection_id?: string | null
          status?: string
          consent_expires_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          team_id?: string
          owner_id?: string
          provider?: string
          provider_connection_id?: string | null
          status?: string
          consent_expires_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      bank_documents: {
        Row: {
          id: string
          team_id: string
          owner_id: string
          account_id: string
          transaction_id: string | null
          kind: string
          period_month: string | null
          object_path: string
          original_filename: string
          official: boolean
          created_at: string
        }
        Insert: {
          id?: string
          team_id?: string
          owner_id?: string
          account_id: string
          transaction_id?: string | null
          kind: string
          period_month?: string | null
          object_path: string
          original_filename: string
          official?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          team_id?: string
          owner_id?: string
          account_id?: string
          transaction_id?: string | null
          kind?: string
          period_month?: string | null
          object_path?: string
          original_filename?: string
          official?: boolean
          created_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          id: string
          credit_limit: number
          payment_due_days: number
          is_blocked: boolean
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          phone: string | null
          rating: number | null
          team_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          credit_limit?: number
          payment_due_days?: number
          is_blocked?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          team_id?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          credit_limit?: number
          payment_due_days?: number
          is_blocked?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          team_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          id: string
          occurred_on: string
          receipt_photo_url: string | null
          job_record_id: string | null
          team_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description?: string | null
          id?: string
          occurred_on?: string
          receipt_photo_url?: string | null
          job_record_id?: string | null
          team_id?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          occurred_on?: string
          receipt_photo_url?: string | null
          job_record_id?: string | null
          team_id?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          team_id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          team_id?: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          team_id?: string
          title?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          team_id: string
          username: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          team_id: string
          username: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          team_id?: string
          username?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          description: string | null
          id: string
          job_record_id: string | null
          kind: string
          material_cost: number
          method: string | null
          occurred_on: string
          team_id: string
          vat_rate: number
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          description?: string | null
          id?: string
          job_record_id?: string | null
          kind: string
          material_cost?: number
          method?: string | null
          occurred_on?: string
          team_id?: string
          vat_rate?: number
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          job_record_id?: string | null
          kind?: string
          material_cost?: number
          method?: string | null
          occurred_on?: string
          team_id?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_job_record_id_fkey"
            columns: ["job_record_id"]
            isOneToOne: false
            referencedRelation: "work_records"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_records: {
        Row: {
          created_at: string
          id: string
          kind: string
          owner_id: string
          payload: Json
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          owner_id?: string
          payload?: Json
          team_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          owner_id?: string
          payload?: Json
          team_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bill_job: { Args: { _job_id: string }; Returns: string }
      complete_appointment: { Args: { _appointment_id: string }; Returns: string }
      customer_credit_status: { Args: { _customer_id: string }; Returns: Json }
      service_equipment: { Args: { _equipment_id: string; _note?: string; _cost?: number }; Returns: number }
      current_team: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team_usta: { Args: never; Returns: boolean }
      record_stock_movement: { Args: { _item_id: string; _operation: string; _quantity: number; _notes?: string; _job_id?: string | null }; Returns: Json }
      toggle_attendance: { Args: { _lat?: number | null; _lng?: number | null }; Returns: Json }
    }
    Enums: {
      app_role: "usta" | "cirak"
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
    Enums: {
      app_role: ["usta", "cirak"],
    },
  },
} as const
