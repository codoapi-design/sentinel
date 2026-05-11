/**
 * أنواع نظام الدعم الفني — CryptoBooks Enterprise
 *
 * يحدد جميع الأنواع المستخدمة في نظام تذاكر الدعم
 * والمحاسبين المخصصين لمستخدمي المؤسسات.
 */

// ============================================================
// أنواع التصنيفات والحالات
// ============================================================

/** أولوية التذكرة */
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

/** حالة التذكرة */
export type TicketStatus = 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed';

/** فئة التذكرة */
export type TicketCategory = 'technical' | 'billing' | 'accounting' | 'feature_request' | 'bug';

// ============================================================
// واجهات الدعم
// ============================================================

/**
 * رسالة داخل التذكرة
 */
export interface TicketMessage {
  /** معرّف فريد يبدأ بـ msg- */
  id: string;
  /** مرسل الرسالة */
  sender: 'user' | 'support' | 'accountant';
  /** اسم المرسل */
  senderName: string;
  /** محتوى الرسالة */
  content: string;
  /** المرفقات (روابط) */
  attachments: string[];
  /** تاريخ الإنشاء */
  createdAt: string;
}

/**
 * تذكرة دعم فني
 */
export interface SupportTicket {
  /** معرّف فريد يبدأ بـ tk- */
  id: string;
  /** عنوان التذكرة */
  subject: string;
  /** وصف المشكلة */
  description: string;
  /** فئة التذكرة */
  category: TicketCategory;
  /** أولوية التذكرة */
  priority: TicketPriority;
  /** حالة التذكرة */
  status: TicketStatus;
  /** المحاسب المخصص (للمؤسسات) */
  assignedTo: string | null;
  /** سجل الرسائل */
  messages: TicketMessage[];
  /** تاريخ الإنشاء */
  createdAt: string;
  /** تاريخ آخر تحديث */
  updatedAt: string;
  /** تاريخ الحل */
  resolvedAt: string | null;
  /** تقييم الرضا (1-5) */
  satisfactionRating: number | null;
}

/**
 * محاسب مخصص لمستخدمي المؤسسات
 */
export interface DedicatedAccountant {
  /** معرّف فريد */
  id: string;
  /** الاسم بالإنجليزية */
  name: string;
  /** الاسم بالعربية */
  nameAr: string;
  /** المسمى الوظيفي بالإنجليزية */
  title: string;
  /** المسمى الوظيفي بالعربية */
  titleAr: string;
  /** رابط الصورة الشخصية */
  avatar: string;
  /** البريد الإلكتروني */
  email: string;
  /** رقم الهاتف */
  phone: string;
  /** هل المحاسب متاح */
  available: boolean;
  /** مجالات التخصص */
  specializations: string[];
}
