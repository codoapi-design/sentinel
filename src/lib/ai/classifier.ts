/**
 * خدمة التصنيف بالذكاء الاصطناعي — CryptoBooks Enterprise
 *
 * تستخدم نماذج اللغة الكبيرة (LLM) عبر z-ai-web-dev-sdk لتصنيف
 * المعاملات غير المصنفة بدقة عالية. تشمل تصنيفات متقدمة مثل:
 * NFT mint/sale, Bridge, Airdrop, Governance, Liquidation,
 * Flash Loan, Rebase, Multi-sig, وغيرها.
 * تتضمن نظام احتياطي (fallback) للتصنيف القائم على القواعد.
 */

import ZAI from 'z-ai-web-dev-sdk';

// ============================================================
// أنواع البيانات
// ============================================================

/**
 * معاملة غير مصنفة — بيانات خام من البلوكتشين
 */
export interface UnclassifiedTransaction {
  /** تجزئة المعاملة */
  txHash: string;
  /** عنوان المرسل */
  from: string;
  /** عنوان المستقبل */
  to: string;
  /** القيمة (بالـ wei أو الوحدة الأصلية) */
  value: string;
  /** بيانات المعاملة (calldata) */
  data: string;
  /** الشبكة */
  network: string;
  /** سجلات الأحداث (logs) */
  logs?: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
}

/**
 * نتيجة التصنيف بالذكاء الاصطناعي
 */
export interface AIClassificationResult {
  /** نوع المعاملة بالإنجليزية */
  type: string;
  /** نوع المعاملة بالعربية */
  typeAr: string;
  /** النوع الفرعي بالإنجليزية */
  subType: string | null;
  /** النوع الفرعي بالعربية */
  subTypeAr: string | null;
  /** البروتوكول بالإنجليزية */
  protocol: string | null;
  /** البروتوكول بالعربية */
  protocolAr: string | null;
  /** درجة الثقة (0-1) */
  confidence: number;
  /** التفسير بالإنجليزية */
  explanation: string;
  /** التفسير بالعربية */
  explanationAr: string;
}

// ============================================================
// ثوابت — أنواع التصنيف المدعومة
// ============================================================

/** أنواع التصنيف القياسية */
const STANDARD_TYPES: Record<string, { en: string; ar: string }> = {
  income: { en: 'income', ar: 'إيراد' },
  expense: { en: 'expense', ar: 'مصروف' },
  trade: { en: 'trade', ar: 'تداول' },
  defi: { en: 'defi', ar: 'DeFi' },
  staking: { en: 'staking', ar: 'Staking Reward' },
  gas: { en: 'gas', ar: 'رسوم غاز' },
};

/** أنواع التصنيف المتقدمة (Enterprise) */
const ADVANCED_TYPES: Record<string, { en: string; ar: string }> = {
  nft_mint: { en: 'nft_mint', ar: 'سك NFT' },
  nft_sale: { en: 'nft_sale', ar: 'بيع NFT' },
  bridge: { en: 'bridge', ar: 'جسر' },
  airdrop: { en: 'airdrop', ar: 'إيردروب' },
  governance: { en: 'governance', ar: 'حوكمة' },
  liquidation: { en: 'liquidation', ar: 'تصفية' },
  flash_loan: { en: 'flash_loan', ar: 'قرض فلاش' },
  rebase: { en: 'rebase', ar: 'ريبيس' },
  multi_sig: { en: 'multi_sig', ar: 'توقيع متعدد' },
  contract_interaction: { en: 'contract_interaction', ar: 'تفاعل مع عقد' },
};

/** دمج جميع الأنواع */
const ALL_TYPES = { ...STANDARD_TYPES, ...ADVANCED_TYPES };

// ============================================================
// دالة التحقق من توفر الذكاء الاصطناعي
// ============================================================

/**
 * التحقق من أن خدمة تصنيف الذكاء الاصطناعي متاحة
 * @returns true إذا كان مفتاح API متاحاً
 */
export function isAIClassificationAvailable(): boolean {
  // في بيئة الخادم، يمكننا دائماً إنشاء مثيل z-ai-web-dev-sdk
  // لأنه لا يتطلب مفتاح API صريح
  return true;
}

// ============================================================
// التصنيف بالذكاء الاصطناعي
// ============================================================

/**
 * تصنيف معاملة واحدة باستخدام الذكاء الاصطناعي
 * @param transaction المعاملة غير المصنفة
 * @returns نتيجة التصنيف
 */
export async function classifyWithAI(
  transaction: UnclassifiedTransaction,
): Promise<AIClassificationResult> {
  try {
    const zai = await ZAI.create();

    // بناء الرسالة النظامية
    const systemPrompt = `You are a blockchain transaction classifier for a crypto accounting platform. 
Classify the given transaction into one of these categories:
- income: Incoming transfer (native or ERC-20)
- expense: Outgoing transfer (native or ERC-20)
- trade: Token swap on DEX
- defi: DeFi interaction (lending, borrowing, liquidity)
- staking: Staking reward
- gas: Gas fee only
- nft_mint: NFT minting
- nft_sale: NFT sale/purchase
- bridge: Cross-chain bridge transaction
- airdrop: Token airdrop claim
- governance: DAO governance vote
- liquidation: DeFi liquidation event
- flash_loan: Flash loan transaction
- rebase: Rebase/elastic supply adjustment
- multi_sig: Multi-signature wallet operation
- contract_interaction: General smart contract interaction

Also identify the protocol if possible (e.g., Uniswap, Aave, Compound, OpenSea, etc.).

Respond in JSON format only:
{
  "type": "category",
  "subType": "specific subtype or null",
  "protocol": "protocol name or null",
  "confidence": 0.0-1.0,
  "explanation": "brief explanation in English"
}`;

    // بناء رسالة المستخدم مع بيانات المعاملة
    const userPrompt = `Classify this blockchain transaction:

Transaction Hash: ${transaction.txHash}
From: ${transaction.from}
To: ${transaction.to}
Value: ${transaction.value}
Network: ${transaction.network}
Data (first 200 chars): ${transaction.data?.substring(0, 200) || '0x'}
${transaction.logs && transaction.logs.length > 0
      ? `Event Logs (${transaction.logs.length} events):
${transaction.logs.slice(0, 5).map((log, i) =>
  `  Log ${i + 1}: Address=${log.address}, Topics=${JSON.stringify(log.topics?.slice(0, 3))}`
).join('\n')}`
      : 'No event logs available'
    }`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    // تحليل الاستجابة
    const content = completion.choices?.[0]?.message?.content || '';

    // محاولة استخراج JSON من الاستجابة
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return fallbackClassification(transaction, 'فشل تحليل استجابة الذكاء الاصطناعي');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // الحصول على التسمية العربية
    const typeInfo = ALL_TYPES[parsed.type] || ALL_TYPES.contract_interaction;

    return {
      type: typeInfo.en,
      typeAr: typeInfo.ar,
      subType: parsed.subType || null,
      subTypeAr: parsed.subType ? translateSubType(parsed.subType) : null,
      protocol: parsed.protocol || null,
      protocolAr: parsed.protocol ? translateProtocol(parsed.protocol) : null,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      explanation: parsed.explanation || 'No explanation provided',
      explanationAr: translateExplanation(parsed.explanation || ''),
    };
  } catch (error) {
    console.error('خطأ في تصنيف الذكاء الاصطناعي:', error);
    return fallbackClassification(
      transaction,
      error instanceof Error ? error.message : 'خطأ غير معروف',
    );
  }
}

/**
 * تصنيف مجموعة معاملات دفعة واحدة باستخدام الذكاء الاصطناعي
 * @param transactions قائمة المعاملات غير المصنفة
 * @returns قائمة نتائج التصنيف
 */
export async function batchClassifyWithAI(
  transactions: UnclassifiedTransaction[],
): Promise<AIClassificationResult[]> {
  const results: AIClassificationResult[] = [];

  // معالجة كل معاملة على حدة (يمكن تحسينها بالمعالجة المتوازية لاحقاً)
  for (const tx of transactions) {
    const result = await classifyWithAI(tx);
    results.push(result);
  }

  return results;
}

// ============================================================
// التصنيف الاحتياطي (Rule-based Fallback)
// ============================================================

/**
 * تصنيف احتياطي قائم على القواعد عند فشل الذكاء الاصطناعي
 * @param transaction المعاملة غير المصنفة
 * @param errorReason سبب فشل التصنيف بالذكاء الاصطناعي
 * @returns نتيجة التصنيف الاحتياطية
 */
function fallbackClassification(
  transaction: UnclassifiedTransaction,
  errorReason: string,
): AIClassificationResult {
  let type = 'contract_interaction';
  let confidence = 0.3;
  let explanation = `Rule-based classification (AI fallback: ${errorReason})`;

  // قواعد بسيطة للتصنيف
  const dataLower = (transaction.data || '').toLowerCase();

  // التحقق من وجود بيانات معاملة
  if (!transaction.data || transaction.data === '0x' || dataLower === '0x') {
    // تحويل بسيط بدون بيانات → إيراد أو مصروف
    if (transaction.value && transaction.value !== '0' && transaction.value !== '0x0') {
      type = 'expense';
      confidence = 0.5;
      explanation = 'Simple native token transfer without contract data';
    } else {
      type = 'gas';
      confidence = 0.4;
      explanation = 'Transaction with no value and no data';
    }
  } else if (dataLower.startsWith('0x3593564c') || dataLower.startsWith('0x04e45aaf')) {
    // Uniswap V3 / Universal Router
    type = 'trade';
    confidence = 0.7;
    explanation = 'DEX swap detected by method ID';
  } else if (dataLower.startsWith('0x38ed1739') || dataLower.startsWith('0x7ff36ab5')) {
    // Uniswap V2 swaps
    type = 'trade';
    confidence = 0.7;
    explanation = 'DEX swap detected by method ID (V2 router)';
  } else if (dataLower.startsWith('0xe8eda9df') || dataLower.startsWith('0xa0712d68')) {
    // Aave deposit / Compound mint
    type = 'defi';
    confidence = 0.65;
    explanation = 'DeFi lending deposit detected by method ID';
  } else if (dataLower.startsWith('0x6e553f65') || dataLower.startsWith('0xa694fc3a')) {
    // Lido submit / stake
    type = 'staking';
    confidence = 0.65;
    explanation = 'Staking operation detected by method ID';
  } else if (dataLower.startsWith('0x428d7197') || dataLower.startsWith('0x9ca36928')) {
    // Bridge deposit/withdraw
    type = 'bridge';
    confidence = 0.6;
    explanation = 'Bridge operation detected by method ID';
  } else if (dataLower.startsWith('0x60806040') || dataLower.length > 5000) {
    // Contract deployment (long data starting with contract init)
    type = 'contract_interaction';
    confidence = 0.5;
    explanation = 'Possible contract deployment or complex interaction';
  } else {
    // تحقق من السجلات
    if (transaction.logs && transaction.logs.length > 0) {
      const hasTransferLog = transaction.logs.some(
        log => log.topics[0]?.toLowerCase() === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
      );
      const hasSwapLog = transaction.logs.some(
        log => log.topics[0]?.toLowerCase() === '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822'
      );

      if (hasSwapLog) {
        type = 'trade';
        confidence = 0.6;
        explanation = 'DEX swap detected by Swap event log';
      } else if (hasTransferLog) {
        type = 'trade';
        confidence = 0.5;
        explanation = 'Token transfer detected by Transfer event log';
      }
    }

    // إذا لم يتم التعرف، صنف كتفاعل مع عقد
    if (type === 'contract_interaction' && confidence < 0.4) {
      explanation = 'Unclassified contract interaction (fallback classification)';
    }
  }

  const typeInfo = ALL_TYPES[type] || ALL_TYPES.contract_interaction;

  return {
    type: typeInfo.en,
    typeAr: typeInfo.ar,
    subType: null,
    subTypeAr: null,
    protocol: null,
    protocolAr: null,
    confidence,
    explanation,
    explanationAr: translateExplanation(explanation),
  };
}

// ============================================================
// دوال الترجمة
// ============================================================

/** ترجمة الأنواع الفرعية */
function translateSubType(subType: string): string {
  const translations: Record<string, string> = {
    'swap': 'مبادلة',
    'deposit': 'إيداع',
    'withdraw': 'سحب',
    'borrow': 'اقتراض',
    'repay': 'سداد',
    'stake': 'تخزين',
    'unstake': 'إلغاء التخزين',
    'claim': 'استلام',
    'mint': 'سك',
    'burn': 'حرق',
    'approve': 'اعتماد',
    'delegate': 'تفويض',
    'vote': 'تصويت',
    'execute': 'تنفيذ',
    'propose': 'اقتراح',
  };
  return translations[subType.toLowerCase()] || subType;
}

/** ترجمة أسماء البروتوكولات */
function translateProtocol(protocol: string): string {
  const translations: Record<string, string> = {
    'uniswap': 'يونيسواب',
    'uniswap v2': 'يونيسواب V2',
    'uniswap v3': 'يونيسواب V3',
    'sushiswap': 'سوشي سواب',
    '1inch': '1إنش',
    'curve': 'كيرف',
    'aave': 'آيف',
    'compound': 'كومباوند',
    'lido': 'ليدو',
    'makerdao': 'ميكر داو',
    'balancer': 'بالانسر',
    'yearn': 'ييرن',
    'opensea': 'أوبن سي',
    'looksRare': 'لوكس رير',
    'blur': 'بلر',
    'paraswap': 'باراسواب',
    'rocket pool': 'روكيت بول',
    'arbitrum bridge': 'جسر أربيتروم',
    'optimism bridge': 'جسر أوبتيميزم',
  };
  return translations[protocol.toLowerCase()] || protocol;
}

/** ترجمة التفسير من الإنجليزية للعربية (تبسيط) */
function translateExplanation(explanation: string): string {
  if (!explanation) return 'لا يوجد تفسير متاح';

  // ترجمات بسيطة للمصطلحات الشائعة
  const replacements: Array<[string, string]> = [
    ['transaction', 'معاملة'],
    ['swap', 'مبادلة'],
    ['transfer', 'تحويل'],
    ['deposit', 'إيداع'],
    ['withdraw', 'سحب'],
    ['staking', 'تخزين'],
    ['bridge', 'جسر'],
    ['airdrop', 'إيردروب'],
    ['NFT', 'رمز غير قابل للاستبدال'],
    ['detected', 'تم الكشف عن'],
    ['classified as', 'تم تصنيفها كـ'],
    ['No explanation', 'لا يوجد تفسير'],
    ['fallback', 'احتياطي'],
    ['rule-based', 'قائم على القواعد'],
  ];

  let translated = explanation;
  for (const [en, ar] of replacements) {
    translated = translated.replace(new RegExp(en, 'gi'), ar);
  }

  return translated;
}
