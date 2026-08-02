/**
 * In-memory Telegram ↔ user mapping helpers (moved out of the webhook route
 * so Next.js route typechecking does not reject non-handler exports).
 */

const telegramUserMap = new Map<
  string,
  { userId: string; plan: string; walletAddress?: string; connectedAt: number }
>();

export async function sendTelegramAlert(
  chatId: string,
  alertType: string,
  message: string,
  sendMessage: (chatId: string, text: string) => Promise<void>,
): Promise<void> {
  const formattedMessage = `🔔 ${alertType}\n━━━━━━━━━━━━━━━\n${message}\n\n📅 ${new Date().toLocaleString('ar-SA')}`;
  await sendMessage(chatId, formattedMessage);
}

export function linkTelegramUser(chatId: string, userId: string, plan: string): void {
  telegramUserMap.set(chatId, { userId, plan, connectedAt: Date.now() });
}

export function getTelegramUser(chatId: string) {
  return telegramUserMap.get(chatId);
}

export function isTelegramConnected(chatId: string): boolean {
  return telegramUserMap.has(chatId);
}

export function setTelegramUserMapEntry(
  chatId: string,
  value: { userId: string; plan: string; walletAddress?: string; connectedAt: number },
): void {
  telegramUserMap.set(chatId, value);
}

export { telegramUserMap };
