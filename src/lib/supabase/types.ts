/**
 * Supabase Database Types for Sentinel
 * Comprehensive type definitions for all database tables
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      // ─── Core User Tables ───
      user_profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          plan: string;
          status: string;
          two_factor_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          plan?: string;
          status?: string;
          two_factor_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          plan?: string;
          status?: string;
          two_factor_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };

      // ─── Admin Tables ───
      admin_users: {
        Row: {
          id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: string;
          created_at?: string;
        };
      };

      audit_log: {
        Row: {
          id: string;
          admin_id: string;
          action: string;
          target_type: string | null;
          target_id: string | null;
          details: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          action: string;
          target_type?: string | null;
          target_id?: string | null;
          details?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          action?: string;
          target_type?: string | null;
          target_id?: string | null;
          details?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
      };

      // ─── Wallet & Transaction Tables ───
      wallets: {
        Row: {
          id: string;
          user_id: string;
          address: string;
          label: string;
          last_synced_block: number | null;
          last_synced_at: string | null;
          is_syncing: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          address: string;
          label?: string;
          last_synced_block?: number | null;
          last_synced_at?: string | null;
          is_syncing?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          address?: string;
          label?: string;
          last_synced_block?: number | null;
          last_synced_at?: string | null;
          is_syncing?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };

      transactions: {
        Row: {
          id: string;
          wallet_id: string;
          tx_hash: string;
          block_number: number;
          timestamp: number;
          date: string;
          from_addr: string;
          to_addr: string;
          value_wei: string;
          value_eth: number;
          gas_used: number;
          gas_price_wei: string;
          gas_fee_eth: number;
          status: boolean;
          type: string;
          type_ar: string;
          direction: string;
          method_id: string | null;
          method_name: string | null;
          protocol: string | null;
          protocol_ar: string | null;
          network: string;
          network_ar: string;
          token_symbol: string | null;
          token_name: string | null;
          token_address: string | null;
          token_value: number;
          token_decimals: number;
          counterparty: string | null;
          counterparty_label: string | null;
          raw_data: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          tx_hash: string;
          block_number?: number;
          timestamp?: number;
          date?: string;
          from_addr?: string;
          to_addr?: string;
          value_wei?: string;
          value_eth?: number;
          gas_used?: number;
          gas_price_wei?: string;
          gas_fee_eth?: number;
          status?: boolean;
          type?: string;
          type_ar?: string;
          direction?: string;
          method_id?: string | null;
          method_name?: string | null;
          protocol?: string | null;
          protocol_ar?: string | null;
          network?: string;
          network_ar?: string;
          token_symbol?: string | null;
          token_name?: string | null;
          token_address?: string | null;
          token_value?: number;
          token_decimals?: number;
          counterparty?: string | null;
          counterparty_label?: string | null;
          raw_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_id?: string;
          tx_hash?: string;
          block_number?: number;
          timestamp?: number;
          date?: string;
          from_addr?: string;
          to_addr?: string;
          value_wei?: string;
          value_eth?: number;
          gas_used?: number;
          gas_price_wei?: string;
          gas_fee_eth?: number;
          status?: boolean;
          type?: string;
          type_ar?: string;
          direction?: string;
          method_id?: string | null;
          method_name?: string | null;
          protocol?: string | null;
          protocol_ar?: string | null;
          network?: string;
          network_ar?: string;
          token_symbol?: string | null;
          token_name?: string | null;
          token_address?: string | null;
          token_value?: number;
          token_decimals?: number;
          counterparty?: string | null;
          counterparty_label?: string | null;
          raw_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      // ─── Client Management ───
      clients: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          address: string;
          notes: string;
          color: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          address: string;
          notes?: string;
          color?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          address?: string;
          notes?: string;
          color?: string;
          created_at?: string;
          updated_at?: string;
        };
      };

      // ─── Email Settings ───
      email_settings: {
        Row: {
          id: string;
          user_id: string;
          email: string;
          verified: boolean;
          enabled: boolean;
          inbound_above: Json;
          outbound_above: Json;
          portfolio_reaches: Json;
          asset_rises: Json;
          asset_drops: Json;
          daily_summary: Json;
          weekly_report: Json;
          gas_exceeds: Json;
          monthly_report: Json;
          large_transaction: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email: string;
          verified?: boolean;
          enabled?: boolean;
          inbound_above?: Json;
          outbound_above?: Json;
          portfolio_reaches?: Json;
          asset_rises?: Json;
          asset_drops?: Json;
          daily_summary?: Json;
          weekly_report?: Json;
          gas_exceeds?: Json;
          monthly_report?: Json;
          large_transaction?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email?: string;
          verified?: boolean;
          enabled?: boolean;
          inbound_above?: Json;
          outbound_above?: Json;
          portfolio_reaches?: Json;
          asset_rises?: Json;
          asset_drops?: Json;
          daily_summary?: Json;
          weekly_report?: Json;
          gas_exceeds?: Json;
          monthly_report?: Json;
          large_transaction?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };

      // ─── Email Verification ───
      email_verification_codes: {
        Row: { id: string; email: string; code: string; expires_at: string; used: boolean; created_at: string; };
        Insert: { id?: string; email: string; code: string; expires_at: string; used?: boolean; created_at?: string; };
        Update: { id?: string; email?: string; code?: string; expires_at?: string; used?: boolean; created_at?: string; };
      };

      // ─── Email Log ───
      email_log: {
        Row: { id: string; user_id: string; to_email: string; subject: string; template: string | null; status: string; error: string | null; created_at: string; };
        Insert: { id?: string; user_id: string; to_email: string; subject: string; template?: string | null; status?: string; error?: string | null; created_at?: string; };
        Update: { id?: string; user_id?: string; to_email?: string; subject?: string; template?: string | null; status?: string; error?: string | null; created_at?: string; };
      };

      // ─── System Settings ───
      system_settings: {
        Row: { key: string; value: string; created_at: string; updated_at: string; };
        Insert: { key: string; value: string; created_at?: string; updated_at?: string; };
        Update: { key?: string; value?: string; created_at?: string; updated_at?: string; };
      };

      // ─── System Alerts ───
      system_alerts: {
        Row: {
          id: string;
          severity: string;
          title: string;
          message: string | null;
          status: string;
          source: string | null;
          acknowledged_by: string | null;
          acknowledged_at: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          severity: string;
          title: string;
          message?: string | null;
          status?: string;
          source?: string | null;
          acknowledged_by?: string | null;
          acknowledged_at?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          severity?: string;
          title?: string;
          message?: string | null;
          status?: string;
          source?: string | null;
          acknowledged_by?: string | null;
          acknowledged_at?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      // ─── Content Pages ───
      content_pages: {
        Row: { id: string; slug: string; title: string; content: string; status: string; author: string | null; published_at: string | null; created_at: string; updated_at: string; };
        Insert: { id?: string; slug: string; title: string; content: string; status?: string; author?: string | null; published_at?: string | null; created_at?: string; updated_at?: string; };
        Update: { id?: string; slug?: string; title?: string; content?: string; status?: string; author?: string | null; published_at?: string | null; created_at?: string; updated_at?: string; };
      };

      // ─── Notification Templates ───
      notification_templates: {
        Row: { id: string; key: string; name: string; channel: string; subject: string | null; body: string; enabled: boolean; created_at: string; updated_at: string; };
        Insert: { id?: string; key: string; name: string; channel: string; subject?: string | null; body: string; enabled?: boolean; created_at?: string; updated_at?: string; };
        Update: { id?: string; key?: string; name?: string; channel?: string; subject?: string | null; body?: string; enabled?: boolean; created_at?: string; updated_at?: string; };
      };

      // ─── AI Usage ───
      ai_usage: {
        Row: {
          id: string;
          user_id: string;
          chat_count: number;
          analysis_count: number;
          total_input_tokens: number;
          total_output_tokens: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          chat_count?: number;
          analysis_count?: number;
          total_input_tokens?: number;
          total_output_tokens?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          chat_count?: number;
          analysis_count?: number;
          total_input_tokens?: number;
          total_output_tokens?: number;
          created_at?: string;
          updated_at?: string;
        };
      };

      // ─── API Keys ───
      api_keys: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          key_prefix: string;
          key_hash: string;
          is_active: boolean;
          expires_at: string | null;
          last_used_at: string | null;
          request_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          key_prefix: string;
          key_hash: string;
          is_active?: boolean;
          expires_at?: string | null;
          last_used_at?: string | null;
          request_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          key_prefix?: string;
          key_hash?: string;
          is_active?: boolean;
          expires_at?: string | null;
          last_used_at?: string | null;
          request_count?: number;
          created_at?: string;
        };
      };

      // ─── API Key Usage ───
      api_key_usage: {
        Row: {
          id: string;
          api_key_id: string;
          endpoint: string;
          method: string;
          status_code: number;
          response_time_ms: number | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          api_key_id: string;
          endpoint: string;
          method?: string;
          status_code?: number;
          response_time_ms?: number | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          api_key_id?: string;
          endpoint?: string;
          method?: string;
          status_code?: number;
          response_time_ms?: number | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };

      // ─── Blockchain Cache ───
      blockchain_cache: {
        Row: {
          id: string;
          wallet_address: string;
          data_type: string;
          provider: string;
          payload: Json;
          fetched_at: number;
          expires_at: number;
          hit_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          data_type: string;
          provider: string;
          payload?: Json;
          fetched_at?: number;
          expires_at: number;
          hit_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          data_type?: string;
          provider?: string;
          payload?: Json;
          fetched_at?: number;
          expires_at?: number;
          hit_count?: number;
          created_at?: string;
          updated_at?: string;
        };
      };

      // ─── Sync Status ───
      sync_status: {
        Row: {
          id: string;
          wallet_id: string;
          provider: string;
          data_type: string;
          last_synced_at: string;
          status: string;
          records_synced: number;
          error_message: string | null;
          duration_ms: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          provider: string;
          data_type: string;
          last_synced_at?: string;
          status?: string;
          records_synced?: number;
          error_message?: string | null;
          duration_ms?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_id?: string;
          provider?: string;
          data_type?: string;
          last_synced_at?: string;
          status?: string;
          records_synced?: number;
          error_message?: string | null;
          duration_ms?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      // ─── Provider Health ───
      provider_health: {
        Row: {
          id: string;
          provider: string;
          is_available: boolean;
          last_checked_at: string | null;
          latency_ms: number | null;
          error_count: number;
          rate_limit_remaining: number | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          is_available?: boolean;
          last_checked_at?: string | null;
          latency_ms?: number | null;
          error_count?: number;
          rate_limit_remaining?: number | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          provider?: string;
          is_available?: boolean;
          last_checked_at?: string | null;
          latency_ms?: number | null;
          error_count?: number;
          rate_limit_remaining?: number | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      // ─── Provider Costs ───
      provider_costs: {
        Row: {
          id: string;
          provider: string;
          endpoint: string;
          cost_usd: number;
          records_fetched: number;
          user_id: string | null;
          wallet_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          endpoint: string;
          cost_usd?: number;
          records_fetched?: number;
          user_id?: string | null;
          wallet_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          provider?: string;
          endpoint?: string;
          cost_usd?: number;
          records_fetched?: number;
          user_id?: string | null;
          wallet_address?: string | null;
          created_at?: string;
        };
      };

      // ─── Asset Positions ───
      asset_positions: {
        Row: {
          id: string;
          wallet_id: string;
          chain: string;
          token_address: string | null;
          token_symbol: string;
          token_name: string;
          balance: string;
          value_usd: number;
          price_usd: number;
          change_24h: number | null;
          is_spam: boolean;
          logo_url: string | null;
          provider: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          chain: string;
          token_address?: string | null;
          token_symbol: string;
          token_name?: string;
          balance?: string;
          value_usd?: number;
          price_usd?: number;
          change_24h?: number | null;
          is_spam?: boolean;
          logo_url?: string | null;
          provider?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_id?: string;
          chain?: string;
          token_address?: string | null;
          token_symbol?: string;
          token_name?: string;
          balance?: string;
          value_usd?: number;
          price_usd?: number;
          change_24h?: number | null;
          is_spam?: boolean;
          logo_url?: string | null;
          provider?: string;
          created_at?: string;
          updated_at?: string;
        };
      };

      // ─── DeFi Positions ───
      defi_positions: {
        Row: {
          id: string;
          wallet_id: string;
          protocol_id: string;
          protocol_name: string;
          chain: string;
          type: string;
          supplied_value_usd: number;
          borrowed_value_usd: number;
          net_value_usd: number;
          health_factor: number | null;
          apy: number | null;
          logo_url: string | null;
          provider: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          protocol_id?: string;
          protocol_name?: string;
          chain?: string;
          type?: string;
          supplied_value_usd?: number;
          borrowed_value_usd?: number;
          net_value_usd?: number;
          health_factor?: number | null;
          apy?: number | null;
          logo_url?: string | null;
          provider?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_id?: string;
          protocol_id?: string;
          protocol_name?: string;
          chain?: string;
          type?: string;
          supplied_value_usd?: number;
          borrowed_value_usd?: number;
          net_value_usd?: number;
          health_factor?: number | null;
          apy?: number | null;
          logo_url?: string | null;
          provider?: string;
          created_at?: string;
          updated_at?: string;
        };
      };

      // ─── Subscriptions ───
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan: string;
          status: string;
          current_period_start: string;
          current_period_end: string;
          cancel_at_period_end: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan: string;
          status?: string;
          current_period_start?: string;
          current_period_end?: string;
          cancel_at_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          plan?: string;
          status?: string;
          current_period_start?: string;
          current_period_end?: string;
          cancel_at_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };

      // ─── Support Tickets ───
      support_tickets: {
        Row: {
          id: string;
          user_id: string;
          subject: string;
          message: string;
          status: string;
          priority: string;
          assigned_to: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          subject: string;
          message: string;
          status?: string;
          priority?: string;
          assigned_to?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          subject?: string;
          message?: string;
          status?: string;
          priority?: string;
          assigned_to?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      // ─── Webhooks ───
      webhooks: {
        Row: {
          id: string;
          user_id: string;
          url: string;
          events: string[];
          secret: string;
          is_active: boolean;
          last_delivery_at: string | null;
          last_delivery_status: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          url: string;
          events?: string[];
          secret?: string;
          is_active?: boolean;
          last_delivery_at?: string | null;
          last_delivery_status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          url?: string;
          events?: string[];
          secret?: string;
          is_active?: boolean;
          last_delivery_at?: string | null;
          last_delivery_status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      // ─── Webhook Deliveries ───
      webhook_deliveries: {
        Row: {
          id: string;
          webhook_id: string;
          event: string;
          payload: Json;
          status_code: number | null;
          response: string | null;
          duration_ms: number | null;
          success: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          webhook_id: string;
          event: string;
          payload?: Json;
          status_code?: number | null;
          response?: string | null;
          duration_ms?: number | null;
          success?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          webhook_id?: string;
          event?: string;
          payload?: Json;
          status_code?: number | null;
          response?: string | null;
          duration_ms?: number | null;
          success?: boolean;
          created_at?: string;
        };
      };

    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
