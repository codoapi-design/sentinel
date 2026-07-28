/**
 * POST /api/telegram/webhook
 *
 * Telegram Bot webhook handler.
 * Receives messages from Telegram for account linking and alerts.
 * AI assistant replies are stubbed until the new Sentinel AI layer ships.
 */

import { NextRequest, NextResponse } from 'next/server';

// In-memory store for telegram-to-user mapping (should be DB in production)
const telegramUserMap = new Map<string, { userId: string; plan: string; walletAddress?: string; connectedAt: number }>();

// Bot token
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

const AI_COMING_SOON =
  '🤖 AI assistant is being rebuilt and is temporarily unavailable.\n\nAlerts and account linking still work. Check back soon.';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      first_name: string;
      username?: string;
      language_code?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      username?: string;
      first_name: string;
    };
    data?: string;
    message?: {
      chat: {
        id: number;
      };
    };
  };
}

export async function POST(request: NextRequest) {
  try {
    const update: TelegramUpdate = await request.json();

    // Handle callback queries (inline button clicks)
    if (update.callback_query) {
      const chatId = update.callback_query.message?.chat?.id?.toString();
      const data = update.callback_query.data;

      if (chatId && data) {
        if (data === 'connect_account') {
          await sendTelegramMessage(
            chatId,
            '🔗 لربط حسابك في CryptoBooks:\n\n1. اذهب إلى إعدادات التنبيهات في الموقع\n2. اضغط على "ربط تليجرام"\n3. اضغط على الرابط الذي يظهر وسيفتح البوت تلقائياً\n\n✅ بعد الضغط على Start هنا، سيتم ربط حسابك تلقائياً!'
          );
        } else if (data === 'quick_summary') {
          await sendTelegramMessage(chatId, AI_COMING_SOON);
        }
        await answerCallbackQuery(update.callback_query.id);
      }

      return NextResponse.json({ ok: true });
    }

    // Handle regular messages
    if (!update.message?.text || !update.message.from) {
      return NextResponse.json({ ok: true });
    }

    const chatId = update.message.chat.id.toString();
    const text = update.message.text;
    const fromName = update.message.from.first_name;

    // ============================
    // /start command — B3OS-style linking
    // ============================
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const connectCode = parts[1];

      if (connectCode) {
        try {
          const verifyResponse = await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/telegram/connect?code=${connectCode}`
          );

          if (verifyResponse.ok) {
            const verifyResult = await verifyResponse.json();

            if (verifyResult.success && verifyResult.data) {
              telegramUserMap.set(chatId, {
                userId: verifyResult.data.userId,
                plan: verifyResult.data.plan,
                connectedAt: Date.now(),
              });

              await sendTelegramMessage(
                chatId,
                `✅ *مرحباً ${fromName}! تم ربط حسابك بنجاح*\n\n` +
                `التنبيهات والتقارير ستصلك هنا.\n` +
                `المساعد الذكي قيد إعادة البناء مؤقتاً.\n\n` +
                `اكتب /help لمعرفة الأوامر المتاحة`,
                { parse_mode: 'Markdown' }
              );
            } else {
              await sendTelegramMessage(
                chatId,
                '⚠️ رابط الربط منتهي الصلاحية. يرجى إنشاء رابط جديد من الموقع.'
              );
            }
          } else {
            await sendTelegramMessage(
              chatId,
              '⚠️ رابط الربط غير صالح. يرجى إنشاء رابط جديد من الموقع.'
            );
          }
        } catch {
          telegramUserMap.set(chatId, {
            userId: connectCode,
            plan: 'starter',
            connectedAt: Date.now(),
          });

          await sendTelegramMessage(
            chatId,
            `✅ مرحباً ${fromName}! تم ربط حسابك!\n\nاكتب /help لمعرفة الأوامر المتاحة.`
          );
        }
      } else {
        await sendTelegramMessage(
          chatId,
          `👋 *مرحباً ${fromName}!*\n\n` +
          `أنا بوت CryptoBooks — منصة المحاسبة الرقمية.\n\n` +
          `🔗 *لربط حسابك:*\n` +
          `1. سجل في cryptobooks.app\n` +
          `2. اذهب إلى الإعدادات > تنبيهات تليجرام\n` +
          `3. اضغط "ربط تليجرام"\n` +
          `4. اضغط Start هنا تلقائياً\n\n` +
          `بعد الربط، ستصلك التنبيهات هنا.`,
          { parse_mode: 'Markdown' }
        );
      }

      return NextResponse.json({ ok: true });
    }

    // ============================
    // /help command
    // ============================
    if (text === '/help') {
      await sendTelegramMessage(
        chatId,
        `📖 *الأوامر المتاحة:*\n\n` +
        `/alerts` + ` — إعدادات التنبيهات\n` +
        `/help` + ` — عرض هذه الرسالة\n\n` +
        `🤖 أوامر التحليل الذكي قيد إعادة البناء.`,
        { parse_mode: 'Markdown' }
      );
      return NextResponse.json({ ok: true });
    }

    // ============================
    // Check if user is connected
    // ============================
    const userMapping = telegramUserMap.get(chatId);
    if (!userMapping) {
      await sendTelegramMessage(
        chatId,
        '⚠️ حسابك غير مربوط بعد.\n\nاذهب إلى cryptobooks.app → الإعدادات → تنبيهات تليجرام → اضغط "ربط تليجرام"'
      );
      return NextResponse.json({ ok: true });
    }

    // ============================
    // /alerts command
    // ============================
    if (text === '/alerts') {
      await sendTelegramMessage(
        chatId,
        '🔔 *إعدادات التنبيهات*\n\n' +
        'تُدار إعدادات التنبيهات من خلال الموقع:\n\n' +
        '📱 اذهب إلى: الإعدادات → تنبيهات تليجرام\n\n' +
        'يمكنك تفعيل:\n' +
        '• تنبيهات التحويلات الكبيرة\n' +
        '• تنبيهات تغيرات المحفظة\n' +
        '• ملخص يومي وأسبوعي\n' +
        '• تنبيهات رسوم الغاز',
        { parse_mode: 'Markdown' }
      );
      return NextResponse.json({ ok: true });
    }

    // AI-dependent commands and free-form chat are stubbed
    await sendTelegramMessage(chatId, AI_COMING_SOON);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

// ============================================================
// Helper: Send Telegram message
// ============================================================

interface TelegramMessageOptions {
  parse_mode?: string;
  reply_markup?: string;
  disable_web_page_preview?: boolean;
}

async function sendTelegramMessage(
  chatId: string,
  text: string,
  options: TelegramMessageOptions = {}
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('TELEGRAM_BOT_TOKEN not set — skipping message');
    return;
  }

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...options,
      }),
    });
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
  }
}

async function answerCallbackQuery(callbackQueryId: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
      }),
    });
  } catch (error) {
    console.error('Failed to answer callback query:', error);
  }
}

// ============================================================
// Helper: Send Telegram alert (used by other services)
// ============================================================

export async function sendTelegramAlert(
  chatId: string,
  alertType: string,
  message: string
): Promise<void> {
  const formattedMessage = `🔔 ${alertType}\n━━━━━━━━━━━━━━━\n${message}\n\n📅 ${new Date().toLocaleString('ar-SA')}`;
  await sendTelegramMessage(chatId, formattedMessage);
}

// ============================================================
// Helper: Link user (called from connect API)
// ============================================================

export function linkTelegramUser(
  chatId: string,
  userId: string,
  plan: string
): void {
  telegramUserMap.set(chatId, { userId, plan, connectedAt: Date.now() });
}

export function getTelegramUser(chatId: string) {
  return telegramUserMap.get(chatId);
}

export function isTelegramConnected(chatId: string): boolean {
  return telegramUserMap.has(chatId);
}
