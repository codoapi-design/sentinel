/**
 * Notification Stack for Sentinel
 * Manages alerts via Telegram, email, and webhook channels
 */

import { createServerClient } from '@/lib/supabase/server';
import type { Database, Json } from '@/lib/supabase/types';

type AlertEventInsert = Database['public']['Tables']['alert_events']['Insert'];
type TelegramSettingsRow = Database['public']['Tables']['telegram_settings']['Row'];

export interface NotificationPayload {
  userId: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export class NotificationStack {
  async send(payload: NotificationPayload): Promise<{ delivered: string[]; failed: string[] }> {
    const delivered: string[] = [];
    const failed: string[] = [];

    try {
      const supabase = createServerClient();

      // Store alert event
      const { error: alertError } = await supabase
        .from('alert_events')
        .insert({
          user_id: payload.userId,
          alert_type: payload.type,
          severity: payload.severity,
          title: payload.title,
          message: payload.message,
          data: (payload.data || null) as Json | null,
        } satisfies AlertEventInsert);

      if (alertError) {
        failed.push('database');
      }

      // Try Telegram notification
      try {
        const { data: telegramConnData } = await supabase
          .from('telegram_settings')
          .select('*')
          .eq('user_id', payload.userId)
          .eq('enabled', true)
          .single();

        const telegramConn = telegramConnData as TelegramSettingsRow | null;

        if (telegramConn?.telegram_chat_id) {
          const botToken = process.env.TELEGRAM_BOT_TOKEN;
          if (botToken) {
            const emoji = payload.severity === 'critical' ? '🔴' : payload.severity === 'warning' ? '🟡' : '🟢';
            const text = `${emoji} *${payload.title}*\n\n${payload.message}`;
            
            const response = await fetch(
              `https://api.telegram.org/bot${botToken}/sendMessage`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: telegramConn.telegram_chat_id,
                  text,
                  parse_mode: 'Markdown',
                }),
              }
            );

            if (response.ok) {
              delivered.push('telegram');
            } else {
              failed.push('telegram');
            }
          }
        }
      } catch (e) {
        failed.push('telegram');
      }

    } catch (error) {
      console.error('[NotificationStack] send error:', error);
      failed.push('system');
    }

    return { delivered, failed };
  }
}
