/**
 * أنواع نظام الويب هوك — CryptoBooks Enterprise
 *
 * يحدد جميع الأنواع المستخدمة في نظام إرسال وتتبع الويب هوك.
 * يشمل: نقاط النهاية، سجلات التسليم، والحمولات.
 */

// ============================================================
// أنواع أحداث الويب هوك
// ============================================================

/** أنواع الأحداث المدعومة في نظام الويب هوك */
export type WebhookEvent =
  | 'transaction.incoming'     // معاملة واردة
  | 'transaction.outgoing'     // معاملة صادرة
  | 'transaction.large'        // معاملة كبيرة
  | 'wallet.threshold_reached' // وصول المحفظة للحد
  | 'asset.price_rise'         // ارتفاع سعر الأصل
  | 'asset.price_drop'         // انخفاض سعر الأصل
  | 'gas.fee_exceeded'         // تجاوز رسوم الغاز
  | 'report.weekly'            // تقرير أسبوعي
  | 'report.monthly';          // تقرير شهري

// ============================================================
// واجهات الويب هوك
// ============================================================

/**
 * نقطة نهاية الويب هوك
 * تمثل عنوان URL مسجّل لاستلام إشعارات الأحداث
 */
export interface WebhookEndpoint {
  /** معرّف فريد يبدأ بـ wh- */
  id: string;
  /** عنوان URL المستقبل للإشعارات */
  url: string;
  /** تسمية توضيحية لنقطة النهاية */
  label: string;
  /** مفتاح سري لتوقيع الحمولات بـ HMAC-SHA256 */
  secret: string;
  /** قائمة الأحداث المشترك فيها */
  events: WebhookEvent[];
  /** هل نقطة النهاية نشطة */
  isActive: boolean;
  /** تاريخ الإنشاء */
  createdAt: string;
  /** تاريخ آخر تسليم ناجح */
  lastDeliveryAt: string | null;
  /** حالة آخر تسليم */
  lastDeliveryStatus: 'success' | 'failed' | null;
  /** عدد التسليمات الناجحة */
  successCount: number;
  /** عدد التسليمات الفاشلة */
  failureCount: number;
}

/**
 * سجل تسليم ويب هوك
 * يوثق كل محاولة إرسال حمولة ل نقطة نهاية
 */
export interface WebhookDelivery {
  /** معرّف فريد يبدأ بـ del- */
  id: string;
  /** معرّف نقطة النهاية */
  webhookId: string;
  /** نوع الحدث */
  event: WebhookEvent;
  /** بيانات الحمولة المُرسلة */
  payload: Record<string, unknown>;
  /** رمز حالة HTTP للاستجابة */
  statusCode: number | null;
  /** محتوى الاستجابة */
  response: string | null;
  /** مدة التسليم بالميلي ثانية */
  duration: number;
  /** حالة التسليم */
  status: 'success' | 'failed' | 'pending';
  /** عدد محاولات التسليم */
  attempts: number;
  /** تاريخ الإنشاء */
  createdAt: string;
}

/**
 * حمولة الويب هوك
 * البيانات المُوقّعة والمُرسلة لنقطة النهاية
 */
export interface WebhookPayload {
  /** نوع الحدث */
  event: WebhookEvent;
  /** طابع زمني ISO */
  timestamp: string;
  /** بيانات الحدث */
  data: Record<string, unknown>;
}
