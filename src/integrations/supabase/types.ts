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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          business_id: string
          created_at: string
          id: string
          new_values: Json | null
          old_values: Json | null
          reason: string | null
          record_id: string | null
          search_text: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          business_id: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
          record_id?: string | null
          search_text?: never
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          business_id?: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
          record_id?: string | null
          search_text?: never
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          account_status: string
          address: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          name: string
          phone: string | null
          timezone: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          account_status?: string
          address?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: string
          address?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      credit_payments: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          credit_id: string
          id: string
          paid_at: string
          payment_method: string
          recorded_by: string | null
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          credit_id: string
          id?: string
          paid_at?: string
          payment_method?: string
          recorded_by?: string | null
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          credit_id?: string
          id?: string
          paid_at?: string
          payment_method?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_payments_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "credits"
            referencedColumns: ["id"]
          },
        ]
      }
      credits: {
        Row: {
          amount_owed: number
          amount_paid: number
          business_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string
          due_date: string
          id: string
          sale_id: string
          status: Database["public"]["Enums"]["credit_status"]
          updated_at: string
        }
        Insert: {
          amount_owed: number
          amount_paid?: number
          business_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name: string
          due_date: string
          id?: string
          sale_id: string
          status?: Database["public"]["Enums"]["credit_status"]
          updated_at?: string
        }
        Update: {
          amount_owed?: number
          amount_paid?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string
          due_date?: string
          id?: string
          sale_id?: string
          status?: Database["public"]["Enums"]["credit_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          archived_at: string | null
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          business_id: string
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          id: string
          payment_method: string
          updated_at: string
        }
        Insert: {
          amount: number
          business_id?: string
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date: string
          id?: string
          payment_method?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          payment_method?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          business_id: string
          created_at: string
          email: string
          expires_at: string
          first_name: string | null
          id: string
          invited_by: string | null
          last_name: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          business_id: string
          created_at?: string
          email: string
          expires_at?: string
          first_name?: string | null
          id?: string
          invited_by?: string | null
          last_name?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          business_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          first_name?: string | null
          id?: string
          invited_by?: string | null
          last_name?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_updates: {
        Row: {
          admin_note: string | null
          archived_at: string | null
          business_id: string
          id: string
          new_values: Json
          old_values: Json
          reason: string
          record_id: string
          requested_at: string
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["change_status"]
          table_name: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          archived_at?: string | null
          business_id: string
          id?: string
          new_values: Json
          old_values: Json
          reason: string
          record_id: string
          requested_at?: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["change_status"]
          table_name: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          archived_at?: string | null
          business_id?: string
          id?: string
          new_values?: Json
          old_values?: Json
          reason?: string
          record_id?: string
          requested_at?: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["change_status"]
          table_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_updates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          archived_at: string | null
          business_id: string
          buying_price: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          size: string | null
          stock_quantity: number
          total_buying_price: number | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          business_id?: string
          buying_price?: number
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          name: string
          size?: string | null
          stock_quantity?: number
          total_buying_price?: number | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          business_id?: string
          buying_price?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          size?: string | null
          stock_quantity?: number
          total_buying_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          business_id: string
          created_at: string
          deactivated_at: string | null
          email: string
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          deactivated_at?: string | null
          email: string
          first_name: string
          id?: string
          is_active?: boolean
          last_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          deactivated_at?: string | null
          email?: string
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          id: string
          payment_method: string
          product_id: string
          quantity: number
          sale_date: string
          selling_price: number
          total_price: number | null
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          payment_method?: string
          product_id: string
          quantity: number
          sale_date?: string
          selling_price: number
          total_price?: never
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          payment_method?: string
          product_id?: string
          quantity?: number
          sale_date?: string
          selling_price?: number
          total_price?: never
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          business_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_profile_fkey"
            columns: ["user_id", "business_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id", "business_id"]
          },
        ]
      }
    }
    Views: {
      customers_secure: {
        Row: {
          archived_at: string | null
          business_id: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          name: string | null
          notes: string | null
          phone: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_stock: {
        Args: { _product_id: string; _quantity: number }
        Returns: Database["public"]["Tables"]["products"]["Row"]
      }
      archive_change: {
        Args: { _id: string; _archived?: boolean }
        Returns: Database["public"]["Tables"]["pending_updates"]["Row"]
      }
      business_is_active: {
        Args: { _business: string }
        Returns: boolean
      }
      complete_invitation: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      create_customer: {
        Args: { _name: string; _phone?: string; _notes?: string; _force?: boolean }
        Returns: Json
      }
      get_current_user_business_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_member_business: {
        Args: { _user_id: string }
        Returns: string
      }
      get_user_business: {
        Args: { _user_id: string }
        Returns: string
      }
      has_role: {
        Args: { _user_id: string; _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_business_name_available: {
        Args: { _name: string }
        Returns: boolean
      }
      mask_phone: {
        Args: { _phone: string }
        Returns: string
      }
      normalize_phone: {
        Args: { _raw: string; _default_country?: string }
        Returns: string
      }
      record_credit_payment: {
        Args: { _credit_id: string; _amount: number; _payment_method?: string }
        Returns: Database["public"]["Tables"]["credits"]["Row"]
      }
      record_sale: {
        Args: { _product_id: string; _quantity: number; _selling_price: number; _payment_type?: string; _payment_method?: string; _deposit?: number; _due_date?: string; _customer_id?: string; _sale_day?: string; _description?: string }
        Returns: Database["public"]["Tables"]["sales"]["Row"]
      }
      resubmit_change: {
        Args: { _id: string; _new_values: Json; _reason: string }
        Returns: Database["public"]["Tables"]["pending_updates"]["Row"]
      }
      review_change: {
        Args: { _id: string; _decision: string; _note?: string }
        Returns: Database["public"]["Tables"]["pending_updates"]["Row"]
      }
      sale_timestamp: {
        Args: { _day: string; _tz: string }
        Returns: string
      }
      sales_month_summary: {
        Args: Record<PropertyKey, never>
        Returns: { month: string; sales_count: number; billed: number; collected: number; outstanding: number; cost: number }[]
      }
      search_customers: {
        Args: { _query?: string; _limit?: number }
        Returns: Database["public"]["Views"]["customers_secure"]["Row"][]
      }
      submit_change: {
        Args: { _table: string; _record_id: string; _new_values: Json; _reason: string }
        Returns: Database["public"]["Tables"]["pending_updates"]["Row"]
      }
      update_business_details: {
        Args: { _name: string; _phone?: string; _email?: string; _address?: string; _currency?: string; _timezone?: string }
        Returns: Database["public"]["Tables"]["businesses"]["Row"]
      }
      update_product: {
        Args: { _product_id: string; _changes: Json }
        Returns: undefined
      }
      update_sale: {
        Args: { _sale_id: string; _changes: Json; _reason?: string }
        Returns: Database["public"]["Tables"]["sales"]["Row"]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      change_status: "pending" | "approved" | "sent_back_for_review" | "rejected"
      credit_status: "unpaid" | "partially_paid" | "paid"
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
    Enums: {
      app_role: ["admin", "user"],
      change_status: ["pending", "approved", "sent_back_for_review", "rejected"],
      credit_status: ["unpaid", "partially_paid", "paid"],
    },
  },
} as const
