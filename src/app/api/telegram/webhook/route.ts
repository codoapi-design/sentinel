/**
 * POST /api/telegram/webhook
 *
 * Telegram Bot webhook handler (B3OS-style).
 * Receives messages from Telegram and routes them to the AI agent.
 * Handles /start command for user linking with connect codes from web app.
 * Supports report file generation based on plan tier.
 */

import { NextRequest, NextResponse } from 'next/server';
import { telegramChat, type AgentContext } from '@/lib/ai/agent';

// In-memory store for telegram-to-user mapping (should be DB in production)
const telegramUserMap = new Map<string, { userId: string; plan: string; walletAddress?: string; connectedAt: number }>();

// Bot token
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

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
      first_name?: string;
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
        // Handle inline button actions
        if (data === 'connect_account') {
          await sendTelegramMessage(
            chatId,
            '🔗 لربط حسابك في CryptoBooks:\n\n1. اذهب إلى إعدادات التنبيهات في الموقع\n2. اضغط على "ربط تليجرام"\n3. اضغط على الرابط الذي يظهر وسيفتح البوت تلقائياً\n\n✅ بعد الضغط على Start هنا، سيتم ربط حسابك تلقائياً!'
          );
        } else if (data === 'quick_summary') {
          const userMapping = telegramUserMap.get(chatId);
          if (userMapping) {
            const context: AgentContext = {
              userId: userMapping.userId,
              plan: userMapping.plan,
              page: 'dashboard',
            };
            const result = await telegramChat(chatId, 'أعطني ملخصاً مختصراً لمحفظتي', context);
            await sendTelegramMessage(chatId, result.message);
          }
        }
        // Answer callback query to remove loading state
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
      const connectCode = parts[1]; // Connect code from web app deep link

      if (connectCode) {
        // Verify the connect code with the connect API
        try {
          const verifyResponse = await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/telegram/connect?code=${connectCode}`
          );

          if (verifyResponse.ok) {
            const verifyResult = await verifyResponse.json();

            if (verifyResult.success && verifyResult.data) {
              // Link the Telegram user to their CryptoBooks account
              telegramUserMap.set(chatId, {
                userId: verifyResult.data.userId,
                plan: verifyResult.data.plan,
                connectedAt: Date.now(),
              });

              // Welcome message with quick actions
              await sendTelegramMessage(
                chatId,
                `✅ *مرحباً ${fromName}! تم ربط حسابك بنجاح*\n\n` +
                `أنا محاسبك الذكي من CryptoBooks. يمكنني:\n\n` +
                `📊 تحليل معاملاتك ومحفظتك\n` +
                `💰 حساب ضرائبك والأرباح الرأسمالية\n` +
                `🔔 إرسال تنبيهات فورية\n` +
                `📄 إنشاء تقارير مفصلة\n\n` +
                `اكتب /help لمعرفة الأوامر المتاحة`,
                { parse_mode: 'Markdown' }
              );

              // Send quick action buttons
              await sendTelegramMessage(
                chatId,
                '🚀 *ابدأ الآن:*',
                {
                  parse_mode: 'Markdown',
                  reply_markup: JSON.stringify({
                    inline_keyboard: [
                      [{ text: '📊 ملخص المحفظة', callback_data: 'quick_summary' }],
                    ],
                  }),
                }
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
          // If connect API is not available, link directly with the code as userId
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
        // New user without connect code — explain how to connect
        await sendTelegramMessage(
          chatId,
          `👋 *مرحباً ${fromName}!*\n\n` +
          `أنا المحاسب الذكي من CryptoBooks — منصة المحاسبة الرقمية.\n\n` +
          `🔗 *لربط حسابك:*\n` +
          `1. سجل في cryptobooks.app\n` +
          `2. اذهب إلى الإعدادات > تنبيهات تليجرام\n` +
          `3. اضغط "ربط تليجرام"\n` +
          `4. اضغط Start هنا تلقائياً\n\n` +
          `بعد الربط، سأتمكن من تحليل بياناتك وإرسال تنبيهاتك.`,
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
        `/summary` + ` — ملخص المحفظة الحالية\n` +
        `/tax` + ` — نظرة عامة على الضرائب\n` +
        `/report monthly` + ` — تقرير شهري\n` +
        `/report weekly` + ` — تقرير أسبوعي\n` +
        `/gas` + ` — أسعار الغاز الحالية\n` +
        `/alerts` + ` — إعدادات التنبيهات\n` +
        `/help` + ` — عرض هذه الرسالة\n\n` +
        `💡 أو اسألني أي سؤال عن محفظتك ومعاملاتك!`,
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
    // /summary command
    // ============================
    if (text === '/summary') {
      const context: AgentContext = {
        userId: userMapping.userId,
        plan: userMapping.plan,
        page: 'dashboard',
      };

      const result = await telegramChat(chatId, 'أعطني ملخصاً مختصراً لمحفظتي الحالية', context);
      await sendTelegramMessage(chatId, result.message);
      return NextResponse.json({ ok: true });
    }

    // ============================
    // /tax command
    // ============================
    if (text === '/tax') {
      const context: AgentContext = {
        userId: userMapping.userId,
        plan: userMapping.plan,
        page: 'tax',
      };

      const result = await telegramChat(chatId, 'أعطني نظرة عامة على وضعي الضريبي الحالي', context);
      await sendTelegramMessage(chatId, result.message);
      return NextResponse.json({ ok: true });
    }

    // ============================
    // /gas command
    // ============================
    if (text === '/gas') {
      const context: AgentContext = {
        userId: userMapping.userId,
        plan: userMapping.plan,
        page: 'dashboard',
      };

      const result = await telegramChat(
        chatId,
        'ما هي أسعار الغاز الحالية على الشبكات المدعومة (Ethereum, Base, Arbitrum, Optimism, Polygon)؟ أعطني تقديراً سريعاً.',
        context
      );
      await sendTelegramMessage(chatId, result.message);
      return NextResponse.json({ ok: true });
    }

    // ============================
    // /report command — with plan-aware file generation
    // ============================
    if (text.startsWith('/report')) {
      const period = text.replace('/report', '').trim() || 'monthly';
      const context: AgentContext = {
        userId: userMapping.userId,
        plan: userMapping.plan,
        page: 'reports',
      };

      // Acknowledge the request
      await sendTelegramMessage(chatId, '📊 جاري إعداد التقرير...');

      const result = await telegramChat(
        chatId,
        `أنشئ تقريراً ${period === 'weekly' ? 'أسبوعياً' : period === 'daily' ? 'يومياً' : 'شهرياً'} مفصلاً عن معاملاتي مع تحليل مالي`,
        context
      );

      // Send the text analysis
      await sendTelegramMessage(chatId, result.message);

      // Send report file based on plan tier
      const planTier = userMapping.plan || 'starter';
      const reportContent = generateReportFile(result.message, period, planTier);

      // Starter: text summary (already sent above)
      // Pro & Enterprise: also send as a formatted document
      if (planTier === 'pro' || planTier === 'enterprise') {
        try {
          await sendTelegramDocument(
            chatId,
            reportContent,
            `cryptobooks-report-${period}-${new Date().toISOString().split('T')[0]}.txt`,
            `📊 تقرير CryptoBooks ${period === 'weekly' ? 'الأسبوعي' : 'الشهري'}`
          );
        } catch (docError) {
          console.error('Failed to send document:', docError);
        }
      }

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

    // ============================
    // Regular chat message — send to AI agent
    // ============================
    const context: AgentContext = {
      userId: userMapping.userId,
      plan: userMapping.plan,
      page: 'chat',
      walletAddress: userMapping.walletAddress,
    };

    const result = await telegramChat(chatId, text, context);
    await sendTelegramMessage(chatId, result.message);

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
    console.log('[Telegram] Would send to', chatId, ':', text.substring(0, 80) + '...');
    return;
  }

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode || 'Markdown',
        disable_web_page_preview: options.disable_web_page_preview ?? true,
        ...(options.reply_markup ? { reply_markup: options.reply_markup } : {}),
      }),
    });
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
  }
}

// ============================================================
// Helper: Send Telegram document (for report files)
// ============================================================

async function sendTelegramDocument(
  chatId: string,
  content: string,
  filename: string,
  caption: string
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[Telegram] Would send document to', chatId, ':', filename);
    return;
  }

  try {
    const formData = new FormData();
    const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
    formData.append('document', blob, filename);
    formData.append('chat_id', chatId);
    formData.append('caption', caption);
    formData.append('parse_mode', 'Markdown');

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    console.error('Failed to send Telegram document:', error);
  }
}

// ============================================================
// Helper: Answer callback query
// ============================================================

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
// Helper: Generate report file content
// ============================================================

function generateReportFile(
  aiAnalysis: string,
  period: string,
  plan: string
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const periodLabel = period === 'weekly' ? 'أسبوعي' : period === 'daily' ? 'يومي' : 'شهري';

  return `═══════════════════════════════════════
  تقرير CryptoBooks ${periodLabel}
═══════════════════════════════════════

التاريخ: ${dateStr}
الباقة: ${plan === 'enterprise' ? 'المؤسسات' : plan === 'pro' ? 'الاحترافية' : 'المبتدئة'}

───────────────────────────────────────

${aiAnalysis}

───────────────────────────────────────

⚠️ هذا التقرير للمعلومات فقط ولا يعتبر نصيحة مالية ملزمة.
يُنصح باستشارة محاسب معتمد للقرارات المالية المهمة.

═══════════════════════════════════════
  تم إنشاؤه بواسطة CryptoBooks AI
  ${now.toISOString()}
═══════════════════════════════════════`;
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
