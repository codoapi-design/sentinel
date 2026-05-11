/**
 * محرك تسليم الويب هوك — CryptoBooks Enterprise
 *
 * يدير إنشاء وتحديث وحذف نقاط نهاية الويب هوك،
 * بالإضافة إلى تسليم الحمولات المُوقّعة وتتبع حالات التسليم.
 * يدعم إعادة المحاولة مع تراجع أُسيّ حتى 3 مرات.
 */

import { createHmac, randomBytes } from 'crypto';
import type {
  WebhookEndpoint,
  WebhookDelivery,
  WebhookPayload,
  WebhookEvent,
} from './types';

// ============================================================
// التخزين المؤقت (سيتم الترحيل إلى Supabase لاحقاً)
// ============================================================

/** تخزين نقاط نهاية الويب هوك في الذاكرة */
const webhookStore = new Map<string, WebhookEndpoint>();

/** تخزين سجلات التسليم لكل ويب هوك */
const deliveryStore = new Map<string, WebhookDelivery[]>();

// ============================================================
// ثوابت
// ============================================================

/** الحد الأقصى لمحاولات إعادة التسليم */
const MAX_RETRY_ATTEMPTS = 3;

/** التراجع الأساسي بالميلي ثانية (1 ثانية) */
const BASE_BACKOFF_MS = 1000;

/** مهلة طلب HTTP بالميلي ثانية */
const DELIVERY_TIMEOUT_MS = 10_000;

// ============================================================
// دوال مساعدة
// ============================================================

/**
 * توليد معرّف فريد ببادئة محددة
 * @param prefix البادئة (مثال: 'wh-' أو 'del-')
 */
function generateId(prefix: string): string {
  const random = randomBytes(12).toString('hex');
  const timestamp = Date.now().toString(36);
  return `${prefix}${timestamp}${random}`;
}

/**
 * توقيع حمولة الويب هوك باستخدام HMAC-SHA256
 * @param payload الحمولة المراد توقيعها
 * @param secret المفتاح السري
 * @returns التوقيع بصيغة hex
 */
export function signPayload(payload: WebhookPayload, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

/**
 * تأخير زمني
 * @param ms المدة بالميلي ثانية
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// عمليات نقاط النهاية (CRUD)
// ============================================================

/**
 * إنشاء نقطة نهاية ويب هوك جديدة
 * @param url عنوان URL المستقبل
 * @param label تسمية توضيحية
 * @param events قائمة الأحداث المشترك فيها
 * @returns نقطة النهاية المُنشأة
 */
export function createWebhook(
  url: string,
  label: string,
  events: WebhookEvent[],
): WebhookEndpoint {
  // التحقق من صحة URL
  try {
    new URL(url);
  } catch {
    throw new Error(`عنوان URL غير صالح: ${url}`);
  }

  // التحقق من وجود أحداث
  if (!events || events.length === 0) {
    throw new Error('يجب اختيار حدث واحد على الأقل');
  }

  const webhook: WebhookEndpoint = {
    id: generateId('wh-'),
    url,
    label,
    secret: randomBytes(24).toString('hex'),
    events,
    isActive: true,
    createdAt: new Date().toISOString(),
    lastDeliveryAt: null,
    lastDeliveryStatus: null,
    successCount: 0,
    failureCount: 0,
  };

  webhookStore.set(webhook.id, webhook);
  deliveryStore.set(webhook.id, []);

  return webhook;
}

/**
 * تحديث نقطة نهاية ويب هوك موجودة
 * @param id معرّف نقطة النهاية
 * @param updates الحقول المراد تحديثها
 * @returns نقطة النهاية المُحدّثة أو null
 */
export function updateWebhook(
  id: string,
  updates: Partial<Pick<WebhookEndpoint, 'url' | 'label' | 'events' | 'isActive'>>,
): WebhookEndpoint | null {
  const webhook = webhookStore.get(id);
  if (!webhook) return null;

  // التحقق من صحة URL إذا تم تحديثه
  if (updates.url) {
    try {
      new URL(updates.url);
    } catch {
      throw new Error(`عنوان URL غير صالح: ${updates.url}`);
    }
  }

  const updated: WebhookEndpoint = {
    ...webhook,
    ...updates,
  };

  webhookStore.set(id, updated);
  return updated;
}

/**
 * حذف نقطة نهاية ويب هوك
 * @param id معرّف نقطة النهاية
 * @returns هل تم الحذف بنجاح
 */
export function deleteWebhook(id: string): boolean {
  const deleted = webhookStore.delete(id);
  deliveryStore.delete(id);
  return deleted;
}

/**
 * الحصول على جميع نقاط نهاية الويب هوك
 * @returns قائمة بنقاط النهاية
 */
export function listWebhooks(): WebhookEndpoint[] {
  return Array.from(webhookStore.values());
}

/**
 * الحصول على نقطة نهاية ويب هوك بالمعرّف
 * @param id معرّف نقطة النهاية
 * @returns نقطة النهاية أو null
 */
export function getWebhook(id: string): WebhookEndpoint | null {
  return webhookStore.get(id) ?? null;
}

// ============================================================
// عمليات التسليم
// ============================================================

/**
 * تسليم حمولة ويب هوك لنقطة نهاية
 * يتضمن التوقيع بـ HMAC-SHA256 وإعادة المحاولة مع تراجع أُسيّ
 * @param webhook نقطة النهاية المستهدفة
 * @param payload الحمولة المراد إرسالها
 * @returns سجل التسليم
 */
export async function deliverWebhook(
  webhook: WebhookEndpoint,
  payload: WebhookPayload,
): Promise<WebhookDelivery> {
  // إنشاء سجل تسليم
  const delivery: WebhookDelivery = {
    id: generateId('del-'),
    webhookId: webhook.id,
    event: payload.event,
    payload: payload.data,
    statusCode: null,
    response: null,
    duration: 0,
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  // التوقيع
  const signature = signPayload(payload, webhook.secret);

  // محاولة التسليم مع إعادة المحاولة
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    delivery.attempts = attempt;

    try {
      const startTime = Date.now();

      // إرسال طلب HTTP POST مع التوقيع في الرأس
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': payload.event,
          'X-Webhook-ID': delivery.id,
          'X-Webhook-Timestamp': payload.timestamp,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;
      const responseBody = await response.text().catch(() => '');

      delivery.statusCode = response.status;
      delivery.response = responseBody.slice(0, 1000); // حد أقصى 1000 حرف
      delivery.duration = duration;

      // اعتبار التسليم ناجحاً إذا كانت الحالة 2xx
      if (response.status >= 200 && response.status < 300) {
        delivery.status = 'success';
        break;
      } else {
        delivery.status = 'failed';
      }
    } catch (error) {
      delivery.duration = Date.now() - (delivery.duration || Date.now());
      delivery.status = 'failed';

      if (error instanceof Error && error.name === 'AbortError') {
        delivery.response = 'طلب منتهي المهلة';
      } else {
        delivery.response = error instanceof Error ? error.message : 'خطأ غير معروف';
      }
    }

    // إذا فشل ولدينا محاولات متبقية، انتظر قبل إعادة المحاولة
    if (delivery.status === 'failed' && attempt < MAX_RETRY_ATTEMPTS) {
      const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
      await sleep(backoffMs);
    }
  }

  // تحديث إحصائيات نقطة النهاية
  const storedWebhook = webhookStore.get(webhook.id);
  if (storedWebhook) {
    const updatedWebhook: WebhookEndpoint = {
      ...storedWebhook,
      lastDeliveryAt: new Date().toISOString(),
      lastDeliveryStatus: delivery.status === 'success' ? 'success' : 'failed',
      successCount: storedWebhook.successCount + (delivery.status === 'success' ? 1 : 0),
      failureCount: storedWebhook.failureCount + (delivery.status === 'failed' ? 1 : 0),
    };
    webhookStore.set(webhook.id, updatedWebhook);
  }

  // حفظ سجل التسليم
  const deliveries = deliveryStore.get(webhook.id) || [];
  deliveries.unshift(delivery); // الأحدث أولاً
  // الاحتفاظ بآخر 100 سجل فقط
  if (deliveries.length > 100) {
    deliveries.length = 100;
  }
  deliveryStore.set(webhook.id, deliveries);

  return delivery;
}

/**
 * الحصول على سجلات تسليم ويب هوك
 * @param webhookId معرّف نقطة النهاية
 * @returns قائمة سجلات التسليم
 */
export function getDeliveries(webhookId: string): WebhookDelivery[] {
  return deliveryStore.get(webhookId) || [];
}

/**
 * اختبار نقطة نهاية ويب هوك بإرسال حمولة تجريبية
 * @param webhookId معرّف نقطة النهاية
 * @returns سجل التسليم التجريبي
 */
export async function testWebhook(webhookId: string): Promise<WebhookDelivery | null> {
  const webhook = webhookStore.get(webhookId);
  if (!webhook) return null;

  const testPayload: WebhookPayload = {
    event: webhook.events[0] || 'transaction.incoming',
    timestamp: new Date().toISOString(),
    data: {
      test: true,
      message: 'اختبار ويب هوك من CryptoBooks',
      webhookLabel: webhook.label,
    },
  };

  return deliverWebhook(webhook, testPayload);
}

/**
 * إرسال إشعار حدث لجميع نقاط النهاية المشتركة في هذا الحدث
 * @param event نوع الحدث
 * @param data بيانات الحدث
 * @returns قائمة سجلات التسليم
 */
export async function notifyEvent(
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<WebhookDelivery[]> {
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const deliveries: WebhookDelivery[] = [];

  for (const webhook of webhookStore.values()) {
    // إرسال فقط لنقاط النهاية النشطة المشتركة في هذا الحدث
    if (webhook.isActive && webhook.events.includes(event)) {
      const delivery = await deliverWebhook(webhook, payload);
      deliveries.push(delivery);
    }
  }

  return deliveries;
}

/**
 * مسح جميع البيانات المخزنة (للاختبار)
 */
export function clearAllData(): void {
  webhookStore.clear();
  deliveryStore.clear();
}
