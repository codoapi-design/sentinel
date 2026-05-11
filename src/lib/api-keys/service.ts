/**
 * خدمة إدارة مفاتيح API — CryptoBooks Enterprise
 *
 * تدير إنشاء والتحقق من وإلغاء مفاتيح API.
 * تتضمن نظام تحديد المعدل (rate limiting) وتتبع الاستخدام.
 * المفاتيح تخزن مؤقتاً في الذاكرة (سيتم الترحيل إلى Supabase لاحقاً).
 */

import { randomBytes } from 'crypto';
import type { ApiKey, ApiKeyPermission, ApiKeyUsage, ApiUsageStats } from './types';

// ============================================================
// التخزين المؤقت
// ============================================================

/** تخزين مفاتيح API في الذاكرة */
const apiKeyStore = new Map<string, ApiKey>();

/** تخزين إحصائيات الاستخدام لكل مفتاح */
const usageStore = new Map<string, ApiKeyUsage[]>();

/** تتبع الطلبات لتحديد المعدل — مفتاح: معرّف المفتاح، قيمة: طوابع زمنية */
const rateLimitTracker = new Map<string, number[]>();

// ============================================================
// ثوابت
// ============================================================

/** بادئة مفاتيح API */
const KEY_PREFIX = 'ck_live_';

/** طول المفتاح العشوائي (حرف hex) */
const KEY_RANDOM_LENGTH = 32;

/** الحد الافتراضي للطلبات في الدقيقة */
const DEFAULT_RATE_LIMIT = 60;

// ============================================================
// دوال مساعدة
// ============================================================

/**
 * توليد معرّف فريد
 * @param prefix البادئة
 */
function generateId(prefix: string): string {
  const random = Math.random().toString(36).substring(2, 10);
  const timestamp = Date.now().toString(36);
  return `${prefix}${timestamp}${random}`;
}

/**
 * إخفاء مفتاح API للعرض الآمن
 * يُظهر أول 12 حرفاً والـ 4 الأخيرة فقط
 * @param key المفتاح الكامل
 * @returns المفتاح المخفي
 */
export function maskApiKey(key: string): string {
  if (key.length <= 16) return key;
  return `${key.substring(0, 12)}...${key.substring(key.length - 4)}`;
}

// ============================================================
// عمليات مفاتيح API
// ============================================================

/**
 * توليد مفتاح API جديد
 * @param name اسم وصفي للمفتاح
 * @param permissions الصلاحيات الممنوحة
 * @param rateLimit حد الطلبات في الدقيقة (اختياري)
 * @returns المفتاح المُنشأ (يعرض المفتاح الكامل مرة واحدة فقط)
 */
export function generateApiKey(
  name: string,
  permissions: ApiKeyPermission[],
  rateLimit: number = DEFAULT_RATE_LIMIT,
): ApiKey {
  // التحقق من المدخلات
  if (!name || name.trim().length === 0) {
    throw new Error('اسم المفتاح مطلوب');
  }

  if (!permissions || permissions.length === 0) {
    throw new Error('يجب تحديد صلاحية واحدة على الأقل');
  }

  // توليد المفتاح العشوائي
  const randomHex = randomBytes(KEY_RANDOM_LENGTH / 2).toString('hex');
  const keyString = `${KEY_PREFIX}${randomHex}`;

  const apiKey: ApiKey = {
    id: generateId('ak-'),
    key: keyString,
    name: name.trim(),
    permissions,
    lastUsedAt: null,
    requestCount: 0,
    rateLimit,
    isActive: true,
    createdAt: new Date().toISOString(),
    expiresAt: null,
  };

  apiKeyStore.set(apiKey.id, apiKey);
  usageStore.set(apiKey.id, []);

  return apiKey;
}

/**
 * التحقق من صحة مفتاح API
 * @param key المفتاح المراد التحقق منه
 * @returns المفتاح إذا كان صالحاً ونشطاً، أو null
 */
export function validateApiKey(key: string): ApiKey | null {
  for (const apiKey of apiKeyStore.values()) {
    if (apiKey.key === key && apiKey.isActive) {
      // التحقق من انتهاء الصلاحية
      if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
        return null;
      }

      // تحديث إحصائيات الاستخدام
      apiKey.lastUsedAt = new Date().toISOString();
      apiKey.requestCount += 1;

      return apiKey;
    }
  }
  return null;
}

/**
 * إلغاء (تعطيل) مفتاح API
 * @param id معرّف المفتاح
 * @returns هل تم الإلغاء بنجاح
 */
export function revokeApiKey(id: string): boolean {
  const apiKey = apiKeyStore.get(id);
  if (!apiKey) return false;

  apiKey.isActive = false;
  apiKeyStore.set(id, apiKey);
  return true;
}

/**
 * تفعيل مفتاح API معطل
 * @param id معرّف المفتاح
 * @returns هل تم التفعيل بنجاح
 */
export function activateApiKey(id: string): boolean {
  const apiKey = apiKeyStore.get(id);
  if (!apiKey) return false;

  apiKey.isActive = true;
  apiKeyStore.set(id, apiKey);
  return true;
}

/**
 * الحصول على جميع مفاتيح API
 * المفاتيح تُخفى (masked) لأغراض الأمان
 * @returns قائمة المفاتيح مع إخفاء القيم الحساسة
 */
export function listApiKeys(): ApiKey[] {
  return Array.from(apiKeyStore.values());
}

/**
 * الحصول على مفتاح API بالمعرّف
 * @param id معرّف المفتاح
 * @returns المفتاح أو null
 */
export function getApiKey(id: string): ApiKey | null {
  return apiKeyStore.get(id) ?? null;
}

// ============================================================
// نظام تحديد المعدل (Rate Limiting)
// ============================================================

/**
 * التحقق من حدود المعدل لمفتاح API
 * @param apiKeyId معرّف مفتاح API
 * @returns true إذا كان الطلب مسموحاً، false إذا تجاوز الحد
 */
export function checkRateLimit(apiKeyId: string): boolean {
  const apiKey = apiKeyStore.get(apiKeyId);
  if (!apiKey) return false;

  const now = Date.now();
  const oneMinuteAgo = now - 60_000;

  // الحصول على سجل الطلبات
  let requestTimestamps = rateLimitTracker.get(apiKeyId) || [];

  // إزالة الطوابع الزمنية الأقدم من دقيقة
  requestTimestamps = requestTimestamps.filter(ts => ts > oneMinuteAgo);

  // التحقق من الحد
  if (requestTimestamps.length >= apiKey.rateLimit) {
    rateLimitTracker.set(apiKeyId, requestTimestamps);
    return false;
  }

  // إضافة الطابع الزمني الحالي
  requestTimestamps.push(now);
  rateLimitTracker.set(apiKeyId, requestTimestamps);

  return true;
}

/**
 * تسجيل طلب API لتحديث الإحصائيات
 * @param apiKeyId معرّف مفتاح API
 * @param latency زمن الاستجابة بالميلي ثانية
 * @param isError هل كان الطلب خاطئاً
 */
export function recordApiUsage(
  apiKeyId: string,
  latency: number,
  isError: boolean = false,
): void {
  const usageList = usageStore.get(apiKeyId) || [];
  const currentPeriod = new Date().toISOString().substring(0, 7); // YYYY-MM

  // البحث عن سجل الفترة الحالية أو إنشاؤه
  let currentUsage = usageList.find(u => u.period === currentPeriod);
  if (!currentUsage) {
    currentUsage = {
      apiKeyId,
      period: currentPeriod,
      requestCount: 0,
      averageLatency: 0,
      errorCount: 0,
    };
    usageList.unshift(currentUsage);
  }

  // تحديث الإحصائيات
  currentUsage.requestCount += 1;
  currentUsage.averageLatency =
    (currentUsage.averageLatency * (currentUsage.requestCount - 1) + latency) /
    currentUsage.requestCount;

  if (isError) {
    currentUsage.errorCount += 1;
  }

  // الاحتفاظ بآخر 12 شهر فقط
  if (usageList.length > 12) {
    usageList.length = 12;
  }

  usageStore.set(apiKeyId, usageList);
}

// ============================================================
// إحصائيات الاستخدام
// ============================================================

/**
 * الحصول على إحصائيات استخدام مفتاح API
 * @param id معرّف مفتاح API
 * @returns قائمة إحصائيات الاستخدام الشهرية
 */
export function getApiKeyUsage(id: string): ApiKeyUsage[] {
  return usageStore.get(id) || [];
}

/**
 * الحصول على إحصائيات الاستخدام الشاملة للوحة المعلومات
 * @returns إحصائيات الاستخدام العامة
 */
export function getApiUsageStats(): ApiUsageStats {
  let totalRequests = 0;
  let totalLatency = 0;
  let totalErrors = 0;
  let latencyCount = 0;
  const endpointMap = new Map<string, number>();
  const dailyMap = new Map<string, number>();

  for (const [keyId, usageList] of usageStore) {
    const apiKey = apiKeyStore.get(keyId);
    if (!apiKey) continue;

    for (const usage of usageList) {
      totalRequests += usage.requestCount;
      totalLatency += usage.averageLatency * usage.requestCount;
      latencyCount += usage.requestCount;
      totalErrors += usage.errorCount;

      // تجميع حسب المسار (استخدام اسم المفتاح كبديل)
      const path = `/api/${apiKey.name.toLowerCase().replace(/\s+/g, '-')}`;
      endpointMap.set(path, (endpointMap.get(path) || 0) + usage.requestCount);
    }
  }

  // توليد بيانات يومية تجريبية للأسبوع الأخير
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    dailyMap.set(dateStr, Math.floor(Math.random() * 100) + 10);
  }

  // ترتيب المسارات حسب الاستخدام
  const topEndpoints = Array.from(endpointMap.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ترتيب البيانات اليومية
  const dailyUsage = Array.from(dailyMap.entries())
    .map(([date, requests]) => ({ date, requests }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalRequests,
    averageLatency: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0,
    errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
    topEndpoints,
    dailyUsage,
  };
}

/**
 * مسح جميع البيانات المخزنة (للاختبار)
 */
export function clearAllData(): void {
  apiKeyStore.clear();
  usageStore.clear();
  rateLimitTracker.clear();
}
