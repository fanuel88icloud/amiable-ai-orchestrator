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
      agent_test_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          role: string
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          role: string
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_test_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_test_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_test_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_test_runs: {
        Row: {
          agent_id: string
          agent_version_id: string | null
          created_at: string
          currency: string | null
          duration_ms: number | null
          error_message: string | null
          estimated_cost: number | null
          id: string
          input_tokens: number | null
          model_name: string
          organization_id: string
          output_tokens: number | null
          provider: string
          session_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          agent_id: string
          agent_version_id?: string | null
          created_at?: string
          currency?: string | null
          duration_ms?: number | null
          error_message?: string | null
          estimated_cost?: number | null
          id?: string
          input_tokens?: number | null
          model_name: string
          organization_id: string
          output_tokens?: number | null
          provider: string
          session_id?: string | null
          status: string
          user_id?: string | null
        }
        Update: {
          agent_id?: string
          agent_version_id?: string | null
          created_at?: string
          currency?: string | null
          duration_ms?: number | null
          error_message?: string | null
          estimated_cost?: number | null
          id?: string
          input_tokens?: number | null
          model_name?: string
          organization_id?: string
          output_tokens?: number | null
          provider?: string
          session_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_test_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_test_runs_agent_version_id_fkey"
            columns: ["agent_version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_test_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_test_runs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_test_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_test_sessions: {
        Row: {
          agent_id: string
          agent_version_id: string | null
          created_at: string
          created_by: string | null
          ended_at: string | null
          id: string
          organization_id: string
          status: string
        }
        Insert: {
          agent_id: string
          agent_version_id?: string | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          organization_id: string
          status?: string
        }
        Update: {
          agent_id?: string
          agent_version_id?: string | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_test_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_test_sessions_agent_version_id_fkey"
            columns: ["agent_version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_test_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tools: {
        Row: {
          agent_id: string
          configuration: Json
          created_at: string
          id: string
          is_enabled: boolean
          organization_id: string
          tool_id: string
        }
        Insert: {
          agent_id: string
          configuration?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          organization_id: string
          tool_id: string
        }
        Update: {
          agent_id?: string
          configuration?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          organization_id?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tools_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tools_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_versions: {
        Row: {
          agent_id: string
          configuration: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          model_name: string
          model_provider: string
          name: string
          organization_id: string
          system_instructions: string | null
          version_number: number
        }
        Insert: {
          agent_id: string
          configuration?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          model_name: string
          model_provider: string
          name: string
          organization_id: string
          system_instructions?: string | null
          version_number: number
        }
        Update: {
          agent_id?: string
          configuration?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          model_name?: string
          model_provider?: string
          name?: string
          organization_id?: string
          system_instructions?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_versions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          agent_type: string
          created_at: string
          created_by: string | null
          description: string | null
          fallback_message: string | null
          handoff_enabled: boolean
          id: string
          instruction_sections: Json
          language: string
          last_tested_at: string | null
          model_name: string | null
          model_provider: string | null
          name: string
          organization_id: string
          published_at: string | null
          status: Database["public"]["Enums"]["entity_status"]
          system_instructions: string | null
          temperature: number | null
          updated_at: string
          version: number
          voice_name: string | null
        }
        Insert: {
          agent_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          fallback_message?: string | null
          handoff_enabled?: boolean
          id?: string
          instruction_sections?: Json
          language?: string
          last_tested_at?: string | null
          model_name?: string | null
          model_provider?: string | null
          name: string
          organization_id: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          system_instructions?: string | null
          temperature?: number | null
          updated_at?: string
          version?: number
          voice_name?: string | null
        }
        Update: {
          agent_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          fallback_message?: string | null
          handoff_enabled?: boolean
          id?: string
          instruction_sections?: Json
          language?: string
          last_tested_at?: string | null
          model_name?: string | null
          model_provider?: string | null
          name?: string
          organization_id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          system_instructions?: string | null
          temperature?: number | null
          updated_at?: string
          version?: number
          voice_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_models: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          id: string
          input_cost_per_million: number | null
          is_active: boolean
          label: string
          model_name: string
          output_cost_per_million: number | null
          provider: string
          sort_order: number
          supports_temperature: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          input_cost_per_million?: number | null
          is_active?: boolean
          label: string
          model_name: string
          output_cost_per_million?: number | null
          provider: string
          sort_order?: number
          supports_temperature?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          input_cost_per_million?: number | null
          is_active?: boolean
          label?: string
          model_name?: string
          output_cost_per_million?: number | null
          provider?: string
          sort_order?: number
          supports_temperature?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          resource_id: string | null
          resource_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_conversations: {
        Row: {
          assigned_to: string | null
          channel_id: string
          contact_address: string | null
          contact_name: string | null
          created_at: string
          external_session_id: string
          handoff_reason: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          metadata: Json
          organization_id: string
          status: string
          subject: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          channel_id: string
          contact_address?: string | null
          contact_name?: string | null
          created_at?: string
          external_session_id: string
          handoff_reason?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          metadata?: Json
          organization_id: string
          status?: string
          subject?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          channel_id?: string
          contact_address?: string | null
          contact_name?: string | null
          created_at?: string
          external_session_id?: string
          handoff_reason?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          metadata?: Json
          organization_id?: string
          status?: string
          subject?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_messages: {
        Row: {
          channel_id: string
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          role: string
          sender_user_id: string | null
        }
        Insert: {
          channel_id: string
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          role: string
          sender_user_id?: string | null
        }
        Update: {
          channel_id?: string
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          role?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "channel_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_runs: {
        Row: {
          channel_id: string
          conversation_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          input_tokens: number | null
          organization_id: string
          output_tokens: number | null
          requester_hash: string | null
          status: string
        }
        Insert: {
          channel_id: string
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          organization_id: string
          output_tokens?: number | null
          requester_hash?: string | null
          status: string
        }
        Update: {
          channel_id?: string
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          organization_id?: string
          output_tokens?: number | null
          requester_hash?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_runs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "channel_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          agent_id: string | null
          api_key_hash: string | null
          api_key_rotated_at: string | null
          channel_type: Database["public"]["Enums"]["channel_type"]
          configuration: Json
          created_at: string
          created_by: string | null
          credentials_ref: string | null
          id: string
          name: string
          organization_id: string
          provider: string | null
          public_id: string
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          api_key_hash?: string | null
          api_key_rotated_at?: string | null
          channel_type: Database["public"]["Enums"]["channel_type"]
          configuration?: Json
          created_at?: string
          created_by?: string | null
          credentials_ref?: string | null
          id?: string
          name: string
          organization_id: string
          provider?: string | null
          public_id?: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          api_key_hash?: string | null
          api_key_rotated_at?: string | null
          channel_type?: Database["public"]["Enums"]["channel_type"]
          configuration?: Json
          created_at?: string
          created_by?: string | null
          credentials_ref?: string | null
          id?: string
          name?: string
          organization_id?: string
          provider?: string | null
          public_id?: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_limits: {
        Row: {
          created_at: string
          max_characters_per_message: number
          max_messages_per_session: number
          max_tests_per_minute: number
          organization_id: string
          request_timeout_ms: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          max_characters_per_message?: number
          max_messages_per_session?: number
          max_tests_per_minute?: number
          organization_id: string
          request_timeout_ms?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          max_characters_per_message?: number
          max_messages_per_session?: number
          max_tests_per_minute?: number
          organization_id?: string
          request_timeout_ms?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_limits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          locale: string
          logo_url: string | null
          name: string
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          locale?: string
          logo_url?: string | null
          name: string
          slug: string
          status?: Database["public"]["Enums"]["org_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          locale?: string
          logo_url?: string | null
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["org_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_organization_id: string | null
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          active_organization_id?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          active_organization_id?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_organization_id_fkey"
            columns: ["active_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          configuration: Json
          created_at: string
          created_by: string | null
          credentials_ref: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          status: Database["public"]["Enums"]["entity_status"]
          tool_type: Database["public"]["Enums"]["tool_type"]
          updated_at: string
        }
        Insert: {
          configuration?: Json
          created_at?: string
          created_by?: string | null
          credentials_ref?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          status?: Database["public"]["Enums"]["entity_status"]
          tool_type?: Database["public"]["Enums"]["tool_type"]
          updated_at?: string
        }
        Update: {
          configuration?: Json
          created_at?: string
          created_by?: string | null
          credentials_ref?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["entity_status"]
          tool_type?: Database["public"]["Enums"]["tool_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workflows: {
        Row: {
          created_at: string
          created_by: string | null
          definition: Json
          description: string | null
          id: string
          name: string
          organization_id: string
          status: Database["public"]["Enums"]["entity_status"]
          trigger_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          definition?: Json
          description?: string | null
          id?: string
          name: string
          organization_id: string
          status?: Database["public"]["Enums"]["entity_status"]
          trigger_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          definition?: Json
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["entity_status"]
          trigger_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_org: { Args: { _org: string }; Returns: boolean }
      can_write_org: { Args: { _org: string }; Returns: boolean }
      has_org_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["org_role"][]
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string }; Returns: boolean }
      publish_agent: {
        Args: { _agent_id: string }
        Returns: {
          agent_id: string
          configuration: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          model_name: string
          model_provider: string
          name: string
          organization_id: string
          system_instructions: string | null
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "agent_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rotate_channel_api_key: { Args: { _channel_id: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "manager" | "user"
      channel_type: "voice" | "whatsapp" | "email" | "webchat" | "api"
      entity_status: "draft" | "active" | "paused" | "archived"
      member_status: "invited" | "active" | "suspended"
      org_role: "owner" | "admin" | "manager" | "operator" | "viewer"
      org_status: "active" | "suspended" | "trial"
      tool_type: "api" | "function" | "database" | "webhook" | "internal"
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
      app_role: ["admin", "manager", "user"],
      channel_type: ["voice", "whatsapp", "email", "webchat", "api"],
      entity_status: ["draft", "active", "paused", "archived"],
      member_status: ["invited", "active", "suspended"],
      org_role: ["owner", "admin", "manager", "operator", "viewer"],
      org_status: ["active", "suspended", "trial"],
      tool_type: ["api", "function", "database", "webhook", "internal"],
    },
  },
} as const
