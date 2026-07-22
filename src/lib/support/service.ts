/**
 * خدمة إدارة تذاكر الدعم — CryptoBooks Enterprise
 *
 * تدير إنشاء وتحديث وإغلاق تذاكر الدعم الفني.
 * تتضمن تعيين محاسبين مخصصين لمستخدمي المؤسسات
 * ونظام تقييم الرضا.
 */

import type {
  SupportTicket,
  TicketMessage,
  TicketPriority,
  TicketStatus,
  TicketCategory,
  DedicatedAccountant,
} from './types';

// ============================================================
// التخزين المؤقت
// ============================================================

/** تخزين التذاكر في الذاكرة */
const ticketStore = new Map<string, SupportTicket>();

/** المحاسب المخصص (بيانات تجريبية) */
let dedicatedAccountant: DedicatedAccountant | null = null;

// ============================================================
// بيانات تجريبية — المحاسب المخصص
// ============================================================

/** المحاسب المخصص الافتراضي */
const DEFAULT_ACCOUNTANT: DedicatedAccountant = {
  id: 'acc-001',
  name: 'Sarah Al-Rashid',
  nameAr: 'Sarah Al-Rashid',
  title: 'Senior Crypto Tax Accountant',
  titleAr: 'محاسبة ضرائب كريبتو أولى',
  avatar: '/avatars/sarah.png',
  email: 'sarah@cryptobooks.io',
  phone: '+966 55 123 4567',
  available: true,
  specializations: [
    'تقارير الضرائب الكريبتو',
    'DeFi & Staking',
    'NFT المحاسبة',
    'الامتثال التنظيمي',
  ],
};

/** قائمة المحاسبين المتاحين */
const AVAILABLE_ACCOUNTANTS: DedicatedAccountant[] = [
  DEFAULT_ACCOUNTANT,
  {
    id: 'acc-002',
    name: 'Ahmed Bin Khalid',
    nameAr: 'Ahmed Bin Khalid',
    title: 'DeFi Tax Specialist',
    titleAr: 'أخصائي ضرائب DeFi',
    avatar: '/avatars/ahmed.png',
    email: 'ahmed@cryptobooks.io',
    phone: '+966 50 987 6543',
    available: true,
    specializations: [
      'DeFi & Yield Farming',
      'التصفيات والقروض',
      'تحليل المحافظ',
    ],
  },
  {
    id: 'acc-003',
    name: 'Fatima Hassan',
    nameAr: 'Fatima Hassan',
    title: 'Enterprise Accounting Lead',
    titleAr: 'رئيسة المحاسبة المؤسسية',
    avatar: '/avatars/fatima.png',
    email: 'fatima@cryptobooks.io',
    phone: '+966 54 456 7890',
    available: true,
    specializations: [
      'حسابات المؤسسات',
      'التدقيق المالي',
      'NFT المحاسبة',
      'التقارير المخصصة',
    ],
  },
];

// ============================================================
// دوال مساعدة
// ============================================================

/**
 * توليد معرّف فريد ببادئة محددة
 * @param prefix البادئة
 */
function generateId(prefix: string): string {
  const random = Math.random().toString(36).substring(2, 10);
  const timestamp = Date.now().toString(36);
  return `${prefix}${timestamp}${random}`;
}

/**
 * الحصول على التسمية العربية للأولوية
 */
function priorityLabelAr(priority: TicketPriority): string {
  const labels: Record<TicketPriority, string> = {
    low: 'منخفضة',
    medium: 'متوسطة',
    high: 'عالية',
    urgent: 'عاجلة',
  };
  return labels[priority];
}

/**
 * الحصول على التسمية العربية للحالة
 */
function statusLabelAr(status: TicketStatus): string {
  const labels: Record<TicketStatus, string> = {
    open: 'مفتوحة',
    in_progress: 'قيد المعالجة',
    waiting_user: 'بانتظار المستخدم',
    resolved: 'تم الحل',
    closed: 'مغلقة',
  };
  return labels[status];
}

/**
 * الحصول على التسمية العربية للفئة
 */
function categoryLabelAr(category: TicketCategory): string {
  const labels: Record<TicketCategory, string> = {
    technical: 'فني',
    billing: 'فواتير',
    accounting: 'محاسبة',
    feature_request: 'طلب ميزة',
    bug: 'خطأ برمجي',
  };
  return labels[category];
}

// ============================================================
// عمليات التذاكر (CRUD)
// ============================================================

/**
 * إنشاء تذكرة دعم جديدة
 * @param subject عنوان التذكرة
 * @param description وصف المشكلة
 * @param category فئة التذكرة
 * @param priority أولوية التذكرة
 * @returns التذكرة المُنشأة
 */
export function createTicket(
  subject: string,
  description: string,
  category: TicketCategory,
  priority: TicketPriority,
): SupportTicket {
  // التحقق من المدخلات
  if (!subject || subject.trim().length === 0) {
    throw new Error('عنوان التذكرة مطلوب');
  }

  if (!description || description.trim().length === 0) {
    throw new Error('وصف المشكلة مطلوب');
  }

  const now = new Date().toISOString();

  // إنشاء رسالة تلقائية بالوصف
  const initialMessage: TicketMessage = {
    id: generateId('msg-'),
    sender: 'user',
    senderName: 'المستخدم',
    content: description,
    attachments: [],
    createdAt: now,
  };

  const ticket: SupportTicket = {
    id: generateId('tk-'),
    subject: subject.trim(),
    description: description.trim(),
    category,
    priority,
    status: 'open',
    assignedTo: null,
    messages: [initialMessage],
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    satisfactionRating: null,
  };

  ticketStore.set(ticket.id, ticket);

  return ticket;
}

/**
 * تحديث تذكرة موجودة
 * @param id معرّف التذكرة
 * @param updates الحقول المراد تحديثها
 * @returns التذكرة المُحدّثة أو null
 */
export function updateTicket(
  id: string,
  updates: Partial<Pick<SupportTicket, 'subject' | 'category' | 'priority' | 'status'>>,
): SupportTicket | null {
  const ticket = ticketStore.get(id);
  if (!ticket) return null;

  const updated: SupportTicket = {
    ...ticket,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // إذا تم تحديث الحالة إلى "تم الحل"، سجّل تاريخ الحل
  if (updates.status === 'resolved' || updates.status === 'closed') {
    updated.resolvedAt = new Date().toISOString();
  }

  ticketStore.set(id, updated);
  return updated;
}

/**
 * إغلاق تذكرة
 * @param id معرّف التذكرة
 * @returns التذكرة المُغلقة أو null
 */
export function closeTicket(id: string): SupportTicket | null {
  return updateTicket(id, { status: 'closed' });
}

/**
 * إضافة رسالة لتذكرة
 * @param ticketId معرّف التذكرة
 * @param content محتوى الرسالة
 * @param sender مرسل الرسالة
 * @param senderName اسم المرسل (اختياري)
 * @returns الرسالة المُضافة أو null
 */
export function addMessage(
  ticketId: string,
  content: string,
  sender: 'user' | 'support' | 'accountant',
  senderName?: string,
): TicketMessage | null {
  const ticket = ticketStore.get(ticketId);
  if (!ticket) return null;

  // تحديد اسم المرسل
  let name = senderName || '';
  if (!name) {
    switch (sender) {
      case 'user':
        name = 'المستخدم';
        break;
      case 'support':
        name = 'فريق الدعم';
        break;
      case 'accountant':
        name = ticket.assignedTo || 'المحاسب';
        break;
    }
  }

  const message: TicketMessage = {
    id: generateId('msg-'),
    sender,
    senderName: name,
    content,
    attachments: [],
    createdAt: new Date().toISOString(),
  };

  ticket.messages.push(message);
  ticket.updatedAt = new Date().toISOString();

  // تحديث حالة التذكرة بناءً على المرسل
  if (sender === 'user') {
    ticket.status = 'open';
  } else if (sender === 'support' || sender === 'accountant') {
    ticket.status = 'waiting_user';
  }

  ticketStore.set(ticketId, ticket);
  return message;
}

/**
 * الحصول على تذكرة بالمعرّف
 * @param id معرّف التذكرة
 * @returns التذكرة أو null
 */
export function getTicket(id: string): SupportTicket | null {
  return ticketStore.get(id) ?? null;
}

/**
 * الحصول على قائمة التذاكر مع إمكانية التصفية
 * @param filters معايير التصفية (اختياري)
 * @returns قائمة التذاكر
 */
export function listTickets(filters?: {
  status?: TicketStatus;
  category?: TicketCategory;
  priority?: TicketPriority;
}): SupportTicket[] {
  let tickets = Array.from(ticketStore.values());

  // تطبيق التصفية
  if (filters) {
    if (filters.status) {
      tickets = tickets.filter(t => t.status === filters.status);
    }
    if (filters.category) {
      tickets = tickets.filter(t => t.category === filters.category);
    }
    if (filters.priority) {
      tickets = tickets.filter(t => t.priority === filters.priority);
    }
  }

  // ترتيب حسب تاريخ التحديث (الأحدث أولاً)
  return tickets.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

// ============================================================
// عمليات المحاسب المخصص
// ============================================================

/**
 * تعيين محاسب مخصص لتذكرة (لمستخدمي المؤسسات)
 * @param ticketId معرّف التذكرة
 * @returns التذكرة المُحدّثة أو null
 */
export function assignAccountant(ticketId: string): SupportTicket | null {
  const ticket = ticketStore.get(ticketId);
  if (!ticket) return null;

  // البحث عن محاسب متاح
  const availableAccountant = AVAILABLE_ACCOUNTANTS.find(acc => acc.available);
  if (!availableAccountant) return null;

  // تعيين المحاسب
  ticket.assignedTo = availableAccountant.nameAr;
  ticket.updatedAt = new Date().toISOString();
  ticket.status = 'in_progress';

  // إضافة رسالة تلقائية من المحاسب
  const autoMessage: TicketMessage = {
    id: generateId('msg-'),
    sender: 'accountant',
    senderName: availableAccountant.nameAr,
    content: `Hello! أنا ${availableAccountant.nameAr}، ${availableAccountant.titleAr}. سأتابع مشكلتك وأعمل على حلها في أقرب وقت ممكن.`,
    attachments: [],
    createdAt: new Date().toISOString(),
  };

  ticket.messages.push(autoMessage);
  ticketStore.set(ticketId, ticket);

  // حفظ المحاسب المخصص
  dedicatedAccountant = availableAccountant;

  return ticket;
}

/**
 * الحصول على المحاسب المخصص
 * @returns المحاسب المخصص أو null
 */
export function getDedicatedAccountant(): DedicatedAccountant | null {
  // إذا لم يتم تعيين محاسب بعد، أعد الافتراضي
  return dedicatedAccountant || DEFAULT_ACCOUNTANT;
}

// ============================================================
// تقييم الرضا
// ============================================================

/**
 * تقديم تقييم رضا للتذكرة
 * @param ticketId معرّف التذكرة
 * @param rating التقييم (1-5)
 * @returns التذكرة المُحدّثة أو null
 */
export function submitSatisfactionRating(
  ticketId: string,
  rating: number,
): SupportTicket | null {
  const ticket = ticketStore.get(ticketId);
  if (!ticket) return null;

  // التحقق من أن التذكرة تم حلها أو إغلاقها
  if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
    throw new Error('يمكن تقييم التذاكر المحلولة أو المغلقة فقط');
  }

  // التحقق من صحة التقييم
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    throw new Error('التقييم يجب أن يكون رقماً صحيحاً بين 1 و 5');
  }

  ticket.satisfactionRating = rating;
  ticket.updatedAt = new Date().toISOString();
  ticketStore.set(ticketId, ticket);

  return ticket;
}

// ============================================================
// دوال مساعدة مُصدَّرة
// ============================================================

/**
 * مسح جميع البيانات المخزنة (للاختبار)
 */
export function clearAllData(): void {
  ticketStore.clear();
  dedicatedAccountant = null;
}

/** تصدير دوال التسمية العربية */
export { priorityLabelAr, statusLabelAr, categoryLabelAr };
