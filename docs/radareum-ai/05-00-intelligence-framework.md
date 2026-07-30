# Radareum AI Design Specification

# PART 5 — Intelligence Framework (Foundation)

> **Normative (foundation).** This part defines the architecture of Radareum’s Analysis / Intelligence Framework. It is the product differentiator: the LLM **explains** analysis; it does **not** perform the analysis. **Modules 01–08 recorded** — [`05-01-performance-intelligence.md`](./05-01-performance-intelligence.md) · [`05-02-flow-intelligence.md`](./05-02-flow-intelligence.md) · [`05-03-portfolio-intelligence.md`](./05-03-portfolio-intelligence.md) · [`05-04-asset-intelligence.md`](./05-04-asset-intelligence.md) · [`05-05-risk-intelligence.md`](./05-05-risk-intelligence.md) · [`05-06-trading-intelligence.md`](./05-06-trading-intelligence.md) · [`05-07-network-intelligence.md`](./05-07-network-intelligence.md) · [`05-08-counterparty-intelligence.md`](./05-08-counterparty-intelligence.md); بعدها **Module 09 — Alert Intelligence Engine** ([`05-09-alert-intelligence.md`](./05-09-alert-intelligence.md)) والوحدات المعمارية 10–12 (انظر §5.0.9).

> **Related:** Living Spec — [`SPEC.md`](./SPEC.md). Part 2 — Portfolio Intelligence Engine ([`02-ai-architecture.md`](./02-ai-architecture.md) §2.18). Part 3 — Business Tools, Cache, Backend Intelligence Engine → `wallet_insights` ([`03-data-layer-tool-calling.md`](./03-data-layer-tool-calling.md) §3.11–§3.12). Part 4 — Core System Prompt / Analysis Mode ([`04-core-system-prompt.md`](./04-core-system-prompt.md)).

> **Editorial plan:** Part 5 = **12 chapters**. **Modules 01–08 recorded** — [`05-01-performance-intelligence.md`](./05-01-performance-intelligence.md) · [`05-02-flow-intelligence.md`](./05-02-flow-intelligence.md) · [`05-03-portfolio-intelligence.md`](./05-03-portfolio-intelligence.md) · [`05-04-asset-intelligence.md`](./05-04-asset-intelligence.md) · [`05-05-risk-intelligence.md`](./05-05-risk-intelligence.md) · [`05-06-trading-intelligence.md`](./05-06-trading-intelligence.md) · [`05-07-network-intelligence.md`](./05-07-network-intelligence.md) · [`05-08-counterparty-intelligence.md`](./05-08-counterparty-intelligence.md). التالي بعد Module 08: **Module 09 — Alert Intelligence Engine** ([`05-09-alert-intelligence.md`](./05-09-alert-intelligence.md)).

---

# 5.0 Why This Part Matters

System Prompt ليس ما يجعل Radareum ذكياً.

ولا الـ Function Calling.

ولا حتى الـ LLM.

الذي سيجعل Radareum مختلفاً عن أي منتج آخر هو **Analysis Framework**.

وهذا بالضبط ما تفتقده معظم منتجات Crypto الموجودة اليوم.

الجزء الخامس سيكون أكبر جزء في الوثيقة عند اكتماله (تقديرياً 80–120 صفحة عبر الفصول الاثني عشر).

---

# 5.0.1 Contrast — Dashboard vs Financial Intelligence

اليوم أغلب المنتجات تعمل هكذا:

```text
Wallet
  ↓
Data
  ↓
Dashboard
  ↓
Charts
```

أو

```text
Wallet
  ↓
LLM
  ↓
Summary
```

لكن Radareum يجب أن يعمل بطريقة مختلفة تمامًا:

```text
Wallet
  ↓
Financial Intelligence Engine
  ↓
Behavior Analysis
  ↓
Pattern Detection
  ↓
Context Understanding
  ↓
LLM Explanation
```

لاحظ الفرق.

الـ LLM **ليس الذي يحلل**.

هو فقط **يشرح التحليل**.

---

# 5.0.2 Architectural Decision — Intelligence Axes, Not Pages

## القرار

**لا** نبني التحليل على الصفحات (page-based analysis).

مثلاً الأسلوب التقليدي المرفوض:

```text
Dashboard Analysis
Assets Analysis
Transactions Analysis
```

التحليل الحقيقي يُبنى على **محاور Intelligence** (modules) وليس على صفحات الـ UI.

---

## لماذا؟

لأن المستخدم قد يسأل:

> لماذا انخفضت محفظتي؟

هذا السؤال يحتاج:

* Assets
* ROI
* Flows
* Transactions
* Networks

أي خمس صفحات معًا.

إذن لو جعلنا التحليل مرتبطًا بالصفحات فسوف نكرر المنطق كثيرًا.

---

## البديل المعتمد

بدلاً من تحليل مرتبط بالصفحات، نبني أولاً **مكتبة Intelligence عالمية**.

ثم تستخدمها جميع الصفحات والأسئلة والقنوات.

---

# 5.0.3 The Twelve Intelligence Modules

```text
Radareum Intelligence Framework

1.  Performance Intelligence
2.  Flow Intelligence
3.  Behavior Intelligence
4.  Portfolio Intelligence
5.  Risk Intelligence
6.  Trading Intelligence
7.  Asset Intelligence
8.  Network Intelligence
9.  Counterparty Intelligence
10. Time Intelligence
11. Opportunity Intelligence
12. Anomaly Intelligence
```

هذه ليست صفحات.

هذه **طرق تفكير**.

---

# 5.0.4 Composition — Pages & Questions Reuse Modules

الصفحات والأسئلة **تركّب** الوحدات؛ لا تملك Prompts تحليلية خاصة بها.

### مثال — Dashboard

```text
Performance Intelligence
  + Portfolio Intelligence
  + Risk Intelligence
  + Flow Intelligence
```

### مثال — Assets

```text
Asset Intelligence
  + Risk Intelligence
  + Performance Intelligence
```

### مثال — سؤال «لماذا انخفض ROI؟»

```text
Performance Intelligence
  + Flow Intelligence
  + Trading Intelligence
```

لاحظ أننا أعدنا استخدام نفس المحركات.

---

# 5.0.5 Extensibility

بعد سنة عندما تضيف NFT لن تحتاج إلى إعادة كتابة التحليل.

بل ستضيف فقط:

```text
NFT Intelligence
```

ولو أضفت Tax:

```text
Tax Intelligence
```

ولو أضفت DeFi:

```text
DeFi Intelligence
```

أي أن النظام قابل للتوسع بلا إعادة تصميم.

---

# 5.0.6 Unified Module Template

كل Intelligence Module يتكون من نفس البنية.

بدلاً من كتابة قواعد مختلفة لكل جزء، كل Module له **Template موحد**:

```text
Goal
Questions
Metrics
Patterns
Insights
Evidence
Confidence
Output
```

بعد بناء أول Module يمكن بناء أي Module جديد بسهولة.

---

# 5.0.6.1 Unified Engine Output Contract

> **Normative — v1.1 amendment.** هذا القسم جزء ملزم من الـ **Unified Module Template** (§5.0.6). يُطبَّق على **كل** محرك ذكاء بلا استثناء.

## القاعدة

كل Intelligence Engine — سواء كان Performance أو Flow أو Portfolio أو Asset أو Risk أو Trading أو Network أو Counterparty أو Alert — يعيد **نفس الظرف (envelope)**.

لا يوجد محرك له شكل مخرجات خاص به.

```ts
interface EngineOutput {
  engine: string;                    // e.g. "risk"
  status: 'completed' | 'partial' | 'insufficient_data';
  summary: string;
  metrics: Record<string, unknown>;
  patterns: Pattern[];
  findings: Insight[];
  evidence: Record<string, string | number>;
  confidence: 'high' | 'medium' | 'low';
  dataQuality: {
    transactionCount: number;
    pricedCount: number;
    unpricedCount: number;
    completeness: number;            // 0–1
  };
  recommendedFollowup: string[];     // suggested next analyses, NOT investment advice
}
```

---

## معنى الحقول

| Field | المعنى |
|-------|--------|
| `engine` | معرّف المحرك (`performance` · `flow` · `portfolio` · `asset` · `risk` · `trading` · `network` · `counterparty` · `alert`). |
| `status` | `completed` = تحليل كامل · `partial` = نتائج جزئية لنقص جزء من البيانات · `insufficient_data` = لا يكفي لإصدار حكم. |
| `summary` | جملة أو جملتان — الخلاصة التنفيذية التي تغذّي طبقة الشرح. |
| `metrics` | المقاييس الرقمية الخاصة بالمحرك (هنا تعيش اختلافات Modules 01–09). |
| `patterns` | الأنماط المكتشفة حسب تعريف كل Module (Acceleration · Decline · Concentration …). |
| `findings` | الـ Insights المستخلصة — كل Insight مرتبط بدليل. |
| `evidence` | الأرقام/الحقائق التي تُشتق منها الـ findings. **لا finding بلا evidence.** |
| `confidence` | ثقة المحرك في استنتاجه (مرتبطة بجودة البيانات، لا بنبرة اللغة). |
| `dataQuality` | شفافية البيانات — عدد المعاملات، المسعّرة، غير المسعّرة، ونسبة الاكتمال. |
| `recommendedFollowup` | اقتراحات **تحليل إضافي** فقط. |

---

## ثلاث ملاحظات ملزمة

### 1. `recommendedFollowup` ليست نصيحة مالية

هي اقتراحات **تحليلية** فقط.

```text
✅  "review network distribution"
✅  "compare this period with the previous 30 days"
✅  "inspect the unknown counterparty at 0x…"

❌  "consider reducing ETH exposure"
❌  "this is a good entry point"
```

هذا متسق مع **Part 4** (Guardrails / Negative Prompt) و **Part 7 §7.7**.

---

### 2. هذا الظرف هو ما يدمجه الـ Orchestrator

```text
Engines (N)
  ↓  EngineOutput[]
Orchestrator (Part 2)  →  merge
  ↓
Explanation / Response Layer (Part 4 + Part 7)
  ↓
User
```

طبقة الشرح **لا تقرأ** بنية داخلية خاصة بأي محرك — تقرأ الظرف فقط.

---

### 3. يعلو على أي اختلاف في شكل المخرجات داخل Modules 01–09

أي شكل مخرجات وصفته وحدة من Modules 01–09 بشكل مختلف يبقى صحيحاً **كمحتوى**، لكنه يُغلَّف داخل هذا الظرف: المقاييس الخاصة بكل وحدة تعيش داخل `metrics`، وأنماطها داخل `patterns`، ورؤاها داخل `findings`.

عند أي تعارض في **الشكل** — هذا القسم يحكم.

---

# 5.0.7 Example — Performance Intelligence (filled template)

> **Note:** هذا مثال هيكلي للتوضيح. الفصل الكامل **§5.1 / Module 01 Performance Intelligence** مسجّل — [`05-01-performance-intelligence.md`](./05-01-performance-intelligence.md).

### Goal

```text
Understand how the portfolio performs.
```

### Questions

```text
Is performance improving?
Is performance declining?
What's driving the change?
Which assets contribute?
When did the trend begin?
Is it temporary?
Is it accelerating?
```

### Metrics

```text
ROI
PnL
Growth
Snapshots
Allocation
Returns
Drawdown
```

### Patterns

```text
Acceleration
Recovery
Decline
Plateau
Volatility
Breakout
Drawdown
```

### Insights

```text
Portfolio reached ATH.
Portfolio recovered.
ROI deteriorated.
ETH drives growth.
SOL lost momentum.
```

### Evidence

```text
ROI
Snapshots
Asset Returns
```

### Confidence

```text
High
Medium
Low
```

### Output

```text
Executive Summary
Supporting Evidence
Trend
Explanation
Watch List
```

---

# 5.0.8 Dual Modes — Reactive + Proactive

لكل Intelligence Module وضعان:

### 1. Reactive Mode

يعمل عندما يسأل المستخدم سؤالًا، فيحلل البيانات المطلوبة ويجيب.

### 2. Proactive Mode

يعمل بعد كل مزامنة للمحفظة، ويولد Insights جديدة تلقائيًا (مثل: «ارتفعت نسبة تركّز ETH إلى 68%» أو «انخفضت رسوم الغاز بشكل ملحوظ هذا الأسبوع») ويخزنها في قاعدة البيانات (`wallet_insights` — انظر Part 3 §3.12 / Portfolio Intelligence Engine Part 2 §2.18).

بهذا يصبح الوكيل قادرًا على الإجابة بسرعة لأنه يملك مكتبة من الـ Insights الجاهزة، كما يمكن استخدامها في:

* الصفحة الرئيسية
* لوحة التنبيهات
* البريد الإلكتروني الدوري
* إشعارات تيليجرام
* التقارير

هذا ما يجعل Radareum أقرب إلى منصة ذكاء مالي حقيقية (Bloomberg-like) وليس مجرد Chat فوق بيانات المحفظة.

---

# 5.0.9 Editorial Plan

| Chapter | Module | Status |
|---------|--------|--------|
| **5.0** | Intelligence Framework (this document) | Normative foundation |
| **5.1** | Performance Intelligence | **Recorded** — [`05-01-performance-intelligence.md`](./05-01-performance-intelligence.md) |
| **5.2** | Flow Intelligence | **Recorded** — [`05-02-flow-intelligence.md`](./05-02-flow-intelligence.md) |
| **5.3** | Behavior Intelligence | Forthcoming |
| **5.4** | Portfolio Intelligence | **Recorded** (Module 03) — [`05-03-portfolio-intelligence.md`](./05-03-portfolio-intelligence.md) |
| **5.5** | Risk Intelligence | **Recorded** (Module 05) — [`05-05-risk-intelligence.md`](./05-05-risk-intelligence.md) |
| **5.6** | Trading Intelligence | **Recorded** (Module 06) — [`05-06-trading-intelligence.md`](./05-06-trading-intelligence.md) |
| **5.7** | Asset Intelligence | **Recorded** (Module 04) — [`05-04-asset-intelligence.md`](./05-04-asset-intelligence.md) |
| **5.8** | Network Intelligence | **Recorded** (Module 07) — [`05-07-network-intelligence.md`](./05-07-network-intelligence.md) |
| **5.9** | Counterparty Intelligence | **Recorded** (Module 08) — [`05-08-counterparty-intelligence.md`](./05-08-counterparty-intelligence.md) |
| **5.10** | Time Intelligence | Forthcoming |
| **5.11** | Opportunity Intelligence | Forthcoming |
| **5.12** | Anomaly Intelligence | Forthcoming |

---

## Architectural Modules (خارج محاور الـ 12)

بالإضافة إلى محاور الـ Intelligence، تتضمن سلسلة الوحدات فصولاً **معمارية** لا تُنتج تحليلاً بنفسها، بل تجمع المحاور وتجعلها قابلة للتنفيذ:

| Module | العنوان | Status |
|--------|---------|--------|
| **Module 09** | Alert Intelligence Engine | **Recorded** — [`05-09-alert-intelligence.md`](./05-09-alert-intelligence.md) · also in [`SPEC.md`](./SPEC.md) |
| **Module 10** | AI Agent Architecture & System Prompt | **Recorded** — [`05-10-agent-architecture.md`](./05-10-agent-architecture.md) · also in [`SPEC.md`](./SPEC.md) |
| **Module 11** | Supabase Database Architecture & AI Function Calling Layer (**Part 6**) | **Recorded** — [`06-01-database-function-architecture.md`](./06-01-database-function-architecture.md) · also in [`SPEC.md`](./SPEC.md) |
| **Module 12** | Full Radareum AI Prompt Package | Forthcoming — **next** |

> **Module 09 note:** يحوّل أحداث المحفظة الخام إلى تنبيهات مفسَّرة عبر خمس طبقات و Pipeline إثراء و **Alert Importance Score** (Financial 40 / Behavioral 25 / Risk 20 / Relevance 15) وسبع فئات وقواعد `ShouldNotify()`، ثم Daily Brief / Weekly Report. يستهلك مخرجات Modules 01–08 ولا يملك تحليلاً خاصاً به. **§5.141.1** يربط فئاته بمفاتيح **Telegram / Email Alerts** الموجودة فعلاً في الإعدادات (تبقى معطّلة حتى ربط القناة).

> **Module 11 note (Part 6):** يقع خارج Part 5 — يُسجَّل كـ **PART 6 — Data & Function Architecture**. يعرّف مخطط Supabase النهائي (ستة نطاقات)، وثماني دوال RPC بمخرجات JSON، ومخطط Function Calling، ونموذج الأمان (RLS + فحص الملكية + عزل المستخدم)، وثلاث Edge Functions. **Part 6 هو المرجع الرسمي للمخطط** عند أي اختلاف في تسمية الجداول مع وحدات Part 5 (انظر §6.16 Reconciliation).

> **Module 10 note:** يعرّف الوكيل (Radareum Intelligence Agent) بست طبقات، وعشر أدوات، وقواعد منع الهلوسة، وهيكل الاستجابة، والذاكرة، إضافة إلى **§5.165 Final System Prompt** — النسخة **المكثفة القانونية** للتشغيل المشتقة من **Part 4** (الدستور الكامل) + Part 5. عند أي تعارض — **Part 4 يحكم**. كما تبقى **Analysis Modes** في Part 4 §4.20 وأوضاع كل Module سارية معاً.

---

# 5.0.10 Cross-Links to Parts 2–4

| Part | Relevance to Intelligence Framework |
|------|-------------------------------------|
| **Part 2** — AI Architecture | Golden Pipeline; **Portfolio Intelligence Engine** (§2.18) precomputes scores post-sync that modules consume/produce. |
| **Part 3** — Data Layer & Tool Calling | Business Tools / Bundles feed module Metrics; Cache + Backend Intelligence Engine write **`wallet_insights`** for Proactive Mode. |
| **Part 4** — Core System Prompt | Agent OS: Analysis Mode, Confidence, Evidence, Reasoning Framework — how the LLM **explains** module outputs without inventing analysis. |

---

## انتهى أساس الجزء الخامس (Foundation)

بعد هذا الأساس أصبح لدينا:

* لماذا Analysis Framework هو المميّز (LLM يشرح، لا يحلّل).
* قرار معماري: محاور Intelligence وليس تحليلًا مبنيًا على الصفحات.
* قائمة الـ 12 Module.
* نموذج التركيب (صفحات / أسئلة → وحدات).
* Template موحّد + مثال Performance.
* وضعان: Reactive + Proactive → `wallet_insights` → Home / Alerts / Email / Telegram / Reports.
* خطة تحريرية: 12 فصلاً؛ Modules 01–08 مسجّلة؛ بعدها Module 09 — Alert Intelligence Engine.

---

## Modules 01–08 recorded — بعدها Module 09

> **Status:** Module 01 (Performance) + Module 02 (Flow Intelligence) + Module 03 (Portfolio Intelligence) + Module 04 (Asset Intelligence) + Module 05 (Risk Intelligence) + Module 06 (Trading Intelligence) + Module 07 (Network Intelligence) + Module 08 (Counterparty Intelligence) **recorded** — [`05-01-performance-intelligence.md`](./05-01-performance-intelligence.md) · [`05-02-flow-intelligence.md`](./05-02-flow-intelligence.md) · [`05-03-portfolio-intelligence.md`](./05-03-portfolio-intelligence.md) · [`05-04-asset-intelligence.md`](./05-04-asset-intelligence.md) · [`05-05-risk-intelligence.md`](./05-05-risk-intelligence.md) · [`05-06-trading-intelligence.md`](./05-06-trading-intelligence.md) · [`05-07-network-intelligence.md`](./05-07-network-intelligence.md) · [`05-08-counterparty-intelligence.md`](./05-08-counterparty-intelligence.md) · also in [`SPEC.md`](./SPEC.md).

> **Module 08 note:** يحوّل سجل التحويلات إلى شبكة علاقات مالية (Address = Identity + Behavior + Relationship History): ستة أنواع تصنيف (Exchange / DeFi Protocol / Bridge / Personal / Internal / Unknown)، ومقاييس علاقة (Interaction Count / Volume / First–Last Seen / Duration / Average / Dominance)، و**Counterparty Relationship Score** (Frequency 30 / Volume 30 / Recency 20 / Consistency 20)، وستة أنماط، وشبكة علاقات + ترتيب أهمية. يعتمد على Module 02 (مصادر ووجهات) و Module 05 (Unknown Exposure) و Module 07 (أين يحدث التعامل). **قاعدة عرض ملزمة:** الاسم المخصّص للعميل يسبق العنوان الخام (`resolveCounterpartyDisplay` — `src/lib/clients/display.ts`).

التالي بعد Module 08: **Module 09 — Alert Intelligence Engine** — مسجّل بالفعل ([`05-09-alert-intelligence.md`](./05-09-alert-intelligence.md)) ضمن الوحدات المعمارية (§5.0.9).
