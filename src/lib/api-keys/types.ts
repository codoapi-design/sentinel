/**
 * أنواع نظام مفاتيح API — CryptoBooks Enterprise
 *
 * يحدد جميع الأنواع المستخدمة في إدارة مفاتيح API.
 * يشمل: المفاتيح، الصلاحيات، إحصائيات الاستخدام.
 */

// ============================================================
// أنواع الصلاحيات
// ============================================================

/** صلاحيات مفتاح API — كل صلاحية تمنح وصولاً لنطاق محدد */
export type ApiKeyPermission =
  | 'transactions:read'  // قراءة المعاملات
  | 'wallets:read'       // قراءة المحافظ
  | 'portfolio:read'     // قراءة المحفظة الاستثمارية
  | 'reports:read'       // قراءة التقارير
  | 'webhooks:manage';   // إدارة الويب هوك

// ============================================================
// واجهات مفاتيح API
// ============================================================

/**
 * مفتاح API
 * يمثل مفتاح وصول برمجي لمنصة CryptoBooks
 */
export interface ApiKey {
  /** معرّف فريد */
  id: string;
  /** المفتاح الفعلي (يبدأ بـ ck_live_) */
  key: string;
  /** اسم وصفي للمفتاح */
  name: string;
  /** قائمة الصلاحيات الممنوحة */
  permissions: ApiKeyPermission[];
  /** تاريخ آخر استخدام */
  lastUsedAt: string | null;
  /** عدد الطلبات الإجمالي */
  requestCount: number;
  /** حد الطلبات في الدقيقة */
  rateLimit: number;
  /** هل المفتاح نشط */
  isActive: boolean;
  /** تاريخ الإنشاء */
  createdAt: string;
  /** تاريخ انتهاء الصلاحية (اختياري) */
  expiresAt: string | null;
}

/**
 * إحصائيات استخدام مفتاح API لفترة محددة
 */
export interface ApiKeyUsage {
  /** معرّف مفتاح API */
  apiKeyId: string;
  /** الفترة الزمنية (مثال: 2024-01) */
  period: string;
  /** عدد الطلبات */
  requestCount: number;
  /** متوسط زمن الاستجابة بالميلي ثانية */
  averageLatency: number;
  /** عدد الأخطاء */
  errorCount: number;
}

/**
 * إحصائيات استخدام API للوحة المعلومات
 */
export interface ApiUsageStats {
  /** إجمالي الطلبات */
  totalRequests: number;
  /** متوسط زمن الاستجابة */
  averageLatency: number;
  /** معدل الأخطاء (0-1) */
  errorRate: number;
  /** أكثر المسارات استخداماً */
  topEndpoints: { path: string; count: number }[];
  /** الاستخدام اليومي */
  dailyUsage: { date: string; requests: number }[];
}
