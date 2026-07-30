/**
 * Supabase Database Types for Radareum
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
          user_id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          plan: string;
          status: string;
          two_factor_enabled: boolean;
          telegram_chat_id: string | null;
          referred_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          plan?: string;
          status?: string;
          two_factor_enabled?: boolean;
          telegram_chat_id?: string | null;
          referred_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          plan?: string;
          status?: string;
          two_factor_enabled?: boolean;
          telegram_chat_id?: string | null;
          referred_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ─── Admin Tables ───
      admin_users: {
        Row: {
          id: string;
          user_id: string;
          role: string;
          two_factor_enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role?: string;
          two_factor_enabled?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: string;
          two_factor_enabled?: boolean;
          created_at?: string;
        };
        Relationships: [];
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
        Relationships: [];
      };

      // ─── Wallet & Transaction Tables ───
      wallets: {
        Row: {
          id: string;
          user_id: string;
          address: string | null;
          solana_address: string | null;
          tron_address: string | null;
          bitcoin_address: string | null;
          label: string;
          last_synced_block: number | null;
          last_synced_at: string | null;
          is_syncing: boolean;
          investment_baseline_at: string | null;
          investment_baseline_value_usd: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          address?: string | null;
          solana_address?: string | null;
          tron_address?: string | null;
          bitcoin_address?: string | null;
          label?: string;
          last_synced_block?: number | null;
          last_synced_at?: string | null;
          is_syncing?: boolean;
          investment_baseline_at?: string | null;
          investment_baseline_value_usd?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          address?: string | null;
          solana_address?: string | null;
          tron_address?: string | null;
          bitcoin_address?: string | null;
          label?: string;
          last_synced_block?: number | null;
          last_synced_at?: string | null;
          is_syncing?: boolean;
          investment_baseline_at?: string | null;
          investment_baseline_value_usd?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
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
          value_usd: number | null;
          price_usd: number | null;
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
          value_usd?: number | null;
          price_usd?: number | null;
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
          value_usd?: number | null;
          price_usd?: number | null;
          counterparty?: string | null;
          counterparty_label?: string | null;
          raw_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };

      // ─── Email Verification ───
      email_verification_codes: {
        Row: { id: string; email: string; code: string; expires_at: string; used: boolean; created_at: string; };
        Insert: { id?: string; email: string; code: string; expires_at: string; used?: boolean; created_at?: string; };
        Update: { id?: string; email?: string; code?: string; expires_at?: string; used?: boolean; created_at?: string; };
        Relationships: [];
      };

      // ─── Email Log ───
      email_log: {
        Row: { id: string; user_id: string; to_email: string; subject: string; template: string | null; status: string; error: string | null; created_at: string; };
        Insert: { id?: string; user_id: string; to_email: string; subject: string; template?: string | null; status?: string; error?: string | null; created_at?: string; };
        Update: { id?: string; user_id?: string; to_email?: string; subject?: string; template?: string | null; status?: string; error?: string | null; created_at?: string; };
        Relationships: [];
      };

      // ─── System Settings ───
      system_settings: {
        Row: { key: string; value: string; created_at: string; updated_at: string; };
        Insert: { key: string; value: string; created_at?: string; updated_at?: string; };
        Update: { key?: string; value?: string; created_at?: string; updated_at?: string; };
        Relationships: [];
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
        Relationships: [];
      };

      // ─── Content Pages ───
      content_pages: {
        Row: { id: string; slug: string; title: string; content: string; status: string; author: string | null; published_at: string | null; created_at: string; updated_at: string; };
        Insert: { id?: string; slug: string; title: string; content: string; status?: string; author?: string | null; published_at?: string | null; created_at?: string; updated_at?: string; };
        Update: { id?: string; slug?: string; title?: string; content?: string; status?: string; author?: string | null; published_at?: string | null; created_at?: string; updated_at?: string; };
        Relationships: [];
      };

      // ─── Notification Templates ───
      notification_templates: {
        Row: { id: string; key: string; name: string; channel: string; subject: string | null; body: string; enabled: boolean; created_at: string; updated_at: string; };
        Insert: { id?: string; key: string; name: string; channel: string; subject?: string | null; body: string; enabled?: boolean; created_at?: string; updated_at?: string; };
        Update: { id?: string; key?: string; name?: string; channel?: string; subject?: string | null; body?: string; enabled?: boolean; created_at?: string; updated_at?: string; };
        Relationships: [];
      };

      // ─── AI Usage ───
      ai_usage: {
        Row: {
          id: string;
          user_id: string;
          chat_count: number;
          analysis_count: number;
          last_reset_date: string;
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
          last_reset_date?: string;
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
          last_reset_date?: string;
          total_input_tokens?: number;
          total_output_tokens?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };

      // ─── Asset Positions ───
      asset_positions: {
        Row: {
          id: string;
          wallet_id: string;
          user_id: string;
          chain: string;
          token_address: string | null;
          token_symbol: string;
          token_name: string;
          token_decimals: number;
          balance: string;
          balance_raw: string;
          value_usd: number;
          price_usd: number;
          change_24h: number | null;
          network: string;
          chain_id: number;
          is_spam: boolean;
          is_verified: boolean;
          source: string;
          unrealized_pnl_usd: number | null;
          unrealized_pnl_pct: number | null;
          cost_basis_usd: number | null;
          logo_url: string | null;
          provider: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          user_id: string;
          chain?: string;
          token_address?: string | null;
          token_symbol: string;
          token_name?: string;
          token_decimals?: number;
          balance?: string;
          balance_raw?: string;
          value_usd?: number;
          price_usd?: number;
          change_24h?: number | null;
          network?: string;
          chain_id?: number;
          is_spam?: boolean;
          is_verified?: boolean;
          source?: string;
          unrealized_pnl_usd?: number | null;
          unrealized_pnl_pct?: number | null;
          cost_basis_usd?: number | null;
          logo_url?: string | null;
          provider?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_id?: string;
          user_id?: string;
          chain?: string;
          token_address?: string | null;
          token_symbol?: string;
          token_name?: string;
          token_decimals?: number;
          balance?: string;
          balance_raw?: string;
          value_usd?: number;
          price_usd?: number;
          change_24h?: number | null;
          network?: string;
          chain_id?: number;
          is_spam?: boolean;
          is_verified?: boolean;
          source?: string;
          unrealized_pnl_usd?: number | null;
          unrealized_pnl_pct?: number | null;
          cost_basis_usd?: number | null;
          logo_url?: string | null;
          provider?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ─── Portfolio Snapshots (daily value for performance chart) ───
      portfolio_snapshots: {
        Row: {
          id: string;
          wallet_id: string;
          user_id: string;
          snapshot_date: string;
          total_value_usd: number;
          token_value_usd: number;
          defi_value_usd: number;
          source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          user_id: string;
          snapshot_date: string;
          total_value_usd?: number;
          token_value_usd?: number;
          defi_value_usd?: number;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_id?: string;
          user_id?: string;
          snapshot_date?: string;
          total_value_usd?: number;
          token_value_usd?: number;
          defi_value_usd?: number;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ─── Investment Lots (return since connected) ───
      investment_lots: {
        Row: {
          id: string;
          user_id: string;
          wallet_id: string;
          token_symbol: string;
          token_address: string | null;
          network: string;
          chain_id: number;
          quantity_open: number;
          cost_per_unit_usd: number;
          cost_basis_usd: number;
          closed_cost_basis_usd: number;
          opened_at: string;
          source: string;
          closed_at: string | null;
          realized_pnl_usd: number;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          wallet_id: string;
          token_symbol: string;
          token_address?: string | null;
          network?: string;
          chain_id?: number;
          quantity_open?: number;
          cost_per_unit_usd?: number;
          cost_basis_usd?: number;
          closed_cost_basis_usd?: number;
          opened_at?: string;
          source?: string;
          closed_at?: string | null;
          realized_pnl_usd?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          wallet_id?: string;
          token_symbol?: string;
          token_address?: string | null;
          network?: string;
          chain_id?: number;
          quantity_open?: number;
          cost_per_unit_usd?: number;
          cost_basis_usd?: number;
          closed_cost_basis_usd?: number;
          opened_at?: string;
          source?: string;
          closed_at?: string | null;
          realized_pnl_usd?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ─── Investment Return Daily (PnL chart since connected) ───
      investment_return_daily: {
        Row: {
          id: string;
          wallet_id: string;
          user_id: string;
          snapshot_date: string;
          total_pnl_usd: number;
          unrealized_pnl_usd: number;
          realized_pnl_usd: number;
          source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          user_id: string;
          snapshot_date: string;
          total_pnl_usd?: number;
          unrealized_pnl_usd?: number;
          realized_pnl_usd?: number;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_id?: string;
          user_id?: string;
          snapshot_date?: string;
          total_pnl_usd?: number;
          unrealized_pnl_usd?: number;
          realized_pnl_usd?: number;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ─── DeFi Positions ───
      defi_positions: {
        Row: {
          id: string;
          wallet_id: string;
          user_id: string;
          protocol_id: string;
          protocol_name: string;
          protocol_chain: string;
          chain: string;
          chain_id: number;
          type: string;
          position_type: string;
          supplied_value_usd: number;
          borrowed_value_usd: number;
          net_value_usd: number;
          supplied_tokens: Json | null;
          borrowed_tokens: Json | null;
          reward_tokens: Json | null;
          asset_value_usd: number | null;
          debt_value_usd: number | null;
          health_factor: number | null;
          apy: number | null;
          logo_url: string | null;
          protocol_logo: string | null;
          provider: string;
          source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          user_id: string;
          protocol_id?: string;
          protocol_name?: string;
          protocol_chain?: string;
          chain?: string;
          chain_id?: number;
          type?: string;
          position_type?: string;
          supplied_value_usd?: number;
          borrowed_value_usd?: number;
          net_value_usd?: number;
          supplied_tokens?: Json | null;
          borrowed_tokens?: Json | null;
          reward_tokens?: Json | null;
          asset_value_usd?: number | null;
          debt_value_usd?: number | null;
          health_factor?: number | null;
          apy?: number | null;
          logo_url?: string | null;
          protocol_logo?: string | null;
          provider?: string;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_id?: string;
          user_id?: string;
          protocol_id?: string;
          protocol_name?: string;
          protocol_chain?: string;
          chain?: string;
          chain_id?: number;
          type?: string;
          position_type?: string;
          supplied_value_usd?: number;
          borrowed_value_usd?: number;
          net_value_usd?: number;
          supplied_tokens?: Json | null;
          borrowed_tokens?: Json | null;
          reward_tokens?: Json | null;
          asset_value_usd?: number | null;
          debt_value_usd?: number | null;
          health_factor?: number | null;
          apy?: number | null;
          logo_url?: string | null;
          protocol_logo?: string | null;
          provider?: string;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
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
          cancel_at_period_end?: boolean;
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
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ─── Referral Program ───
      referral_profiles: {
        Row: {
          user_id: string;
          referral_code: string;
          payout_wallet: string;
          total_referrals: number;
          paid_conversions: number;
          total_commission_usd: number;
          activation_rewards_granted: number;
          reward_plan_id: string | null;
          reward_plan_active_until: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          referral_code: string;
          payout_wallet: string;
          total_referrals?: number;
          paid_conversions?: number;
          total_commission_usd?: number;
          activation_rewards_granted?: number;
          reward_plan_id?: string | null;
          reward_plan_active_until?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          referral_code?: string;
          payout_wallet?: string;
          total_referrals?: number;
          paid_conversions?: number;
          total_commission_usd?: number;
          activation_rewards_granted?: number;
          reward_plan_id?: string | null;
          reward_plan_active_until?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      referral_attributions: {
        Row: {
          id: string;
          referrer_user_id: string;
          referred_user_id: string | null;
          referral_code: string;
          status: string;
          signed_up_at: string | null;
          commission_period_end: string | null;
          first_paid_at: string | null;
          total_commission_usd: number;
          activation_reward_granted: boolean;
          ip_hash: string | null;
          fingerprint_hash: string | null;
          reject_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          referrer_user_id: string;
          referred_user_id?: string | null;
          referral_code: string;
          status?: string;
          signed_up_at?: string | null;
          commission_period_end?: string | null;
          first_paid_at?: string | null;
          total_commission_usd?: number;
          activation_reward_granted?: boolean;
          ip_hash?: string | null;
          fingerprint_hash?: string | null;
          reject_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          referrer_user_id?: string;
          referred_user_id?: string | null;
          referral_code?: string;
          status?: string;
          signed_up_at?: string | null;
          commission_period_end?: string | null;
          first_paid_at?: string | null;
          total_commission_usd?: number;
          activation_reward_granted?: boolean;
          ip_hash?: string | null;
          fingerprint_hash?: string | null;
          reject_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      referral_events: {
        Row: {
          id: string;
          referrer_user_id: string;
          referred_user_id: string | null;
          attribution_id: string | null;
          event_type: string;
          plan_id: string | null;
          amount_usd: number;
          commission_pct: number | null;
          note: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          referrer_user_id: string;
          referred_user_id?: string | null;
          attribution_id?: string | null;
          event_type: string;
          plan_id?: string | null;
          amount_usd?: number;
          commission_pct?: number | null;
          note?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          referrer_user_id?: string;
          referred_user_id?: string | null;
          attribution_id?: string | null;
          event_type?: string;
          plan_id?: string | null;
          amount_usd?: number;
          commission_pct?: number | null;
          note?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };

      // ─── Airdrops ───
      airdrops: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          protocol: string;
          network: string;
          estimated_value_usd: number | null;
          status: string;
          deadline: string | null;
          claim_url: string | null;
          eligibility_criteria: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          protocol: string;
          network: string;
          estimated_value_usd?: number | null;
          status?: string;
          deadline?: string | null;
          claim_url?: string | null;
          eligibility_criteria?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          protocol?: string;
          network?: string;
          estimated_value_usd?: number | null;
          status?: string;
          deadline?: string | null;
          claim_url?: string | null;
          eligibility_criteria?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ─── Sync Logs ───
      sync_logs: {
        Row: {
          id: string;
          wallet_id: string;
          success: boolean;
          records: number;
          provider: string | null;
          data_type: string | null;
          error_message: string | null;
          duration_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          success?: boolean;
          records?: number;
          provider?: string | null;
          data_type?: string | null;
          error_message?: string | null;
          duration_ms?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          wallet_id?: string;
          success?: boolean;
          records?: number;
          provider?: string | null;
          data_type?: string | null;
          error_message?: string | null;
          duration_ms?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };

      // ─── Telegram Settings ───
      telegram_settings: {
        Row: {
          id: string;
          user_id: string;
          telegram_chat_id: string | null;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          telegram_chat_id?: string | null;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          telegram_chat_id?: string | null;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ─── Alert Events ───
      alert_events: {
        Row: {
          id: string;
          user_id: string;
          alert_type: string;
          severity: string;
          title: string;
          message: string;
          data: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          alert_type: string;
          severity: string;
          title: string;
          message: string;
          data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          alert_type?: string;
          severity?: string;
          title?: string;
          message?: string;
          data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ─── Token Approvals ───
      token_approvals: {
        Row: {
          id: string;
          wallet_id: string;
          token_symbol: string | null;
          token_address: string | null;
          spender_address: string;
          spender_name: string | null;
          is_unlimited: boolean;
          risk_level: string;
          is_revoked: boolean;
          amount_approved: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          token_symbol?: string | null;
          token_address?: string | null;
          spender_address: string;
          spender_name?: string | null;
          is_unlimited?: boolean;
          risk_level?: string;
          is_revoked?: boolean;
          amount_approved?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_id?: string;
          token_symbol?: string | null;
          token_address?: string | null;
          spender_address?: string;
          spender_name?: string | null;
          is_unlimited?: boolean;
          risk_level?: string;
          is_revoked?: boolean;
          amount_approved?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ─── Cost Basis Entries ───
      cost_basis_entries: {
        Row: {
          id: string;
          wallet_id: string;
          token_symbol: string;
          token_name: string | null;
          network: string;
          total_cost_usd: number;
          remaining_quantity: number;
          is_disposed: boolean;
          realized_pnl_usd: number;
          disposed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          token_symbol: string;
          token_name?: string | null;
          network: string;
          total_cost_usd?: number;
          remaining_quantity?: number;
          is_disposed?: boolean;
          realized_pnl_usd?: number;
          disposed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_id?: string;
          token_symbol?: string;
          token_name?: string | null;
          network?: string;
          total_cost_usd?: number;
          remaining_quantity?: number;
          is_disposed?: boolean;
          realized_pnl_usd?: number;
          disposed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
