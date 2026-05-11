/**
 * Supabase Database Types for CryptoBooks
 * Auto-generated type definitions for the database schema
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
          label: string;
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
          block_number: number;
          timestamp: number;
          date: string;
          from_addr: string;
          to_addr: string;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
