# Sentinel AI Design Specification

# PART 5 — Intelligence Framework

# Module 01 — Performance Intelligence

> **Normative (Module 01).** Performance Intelligence Engine — first chapter of the Sentinel Intelligence Framework. Spec only; no runtime implementation required by this document alone.

> **Framework intro:** [`05-00-intelligence-framework.md`](./05-00-intelligence-framework.md) — 12 modules, unified Module Template (Goal / Questions / Metrics / Patterns / Insights / Evidence / Confidence / Output), **Reactive + Proactive** modes → `wallet_insights`. Living Spec — [`SPEC.md`](./SPEC.md).

> **Cross-links:** Part 2 Portfolio Intelligence Engine ([`02-ai-architecture.md`](./02-ai-architecture.md) §2.18). Part 3 Cache / Backend Intelligence Engine ([`03-data-layer-tool-calling.md`](./03-data-layer-tool-calling.md) §3.11–§3.12). Part 4 Analysis Mode ([`04-core-system-prompt.md`](./04-core-system-prompt.md) §4.20).

> **Next:** Module 04 — Asset Intelligence (Module 02 Flow Intelligence + Module 03 Portfolio Intelligence recorded — [`05-02-flow-intelligence.md`](./05-02-flow-intelligence.md) · [`05-03-portfolio-intelligence.md`](./05-03-portfolio-intelligence.md)).

---

# 5.1 Purpose

## الاسم

```text
Performance Intelligence Engine
```

---

## الهدف

تحويل بيانات الأداء الخام للمحفظة إلى فهم مالي واضح.

المحرك لا يكتفي بالإجابة:

> كم أصبحت قيمة المحفظة؟

بل يجيب:

* كيف تغيرت؟
* متى تغيرت؟
* لماذا تغيرت؟
* ما الأصول التي سببت التغير؟
* هل التغير مستمر أم مؤقت؟
* هل الأداء صحي أم يحمل مخاطر؟

---

# 5.2 Core Philosophy

الأداء ليس رقماً واحداً.

القيمة الحالية وحدها لا تكفي.

مثلاً:

محفظتان:

### Wallet A

```text
Current Value:
$100,000

ROI:
+20%
```

### Wallet B

```text
Current Value:
$100,000

ROI:
+20%
```

قد تبدوان متشابهتين.

لكن:

Wallet A:

* نمو تدريجي.
* تنويع جيد.
* تقلب منخفض.

Wallet B:

* ارتفاع بسبب أصل واحد.
* تركّز عالي.
* تراجع حاد سابق.

إذن:

```text
Performance ≠ Value

Performance = Value + Trend + Drivers + Context
```

---

# 5.3 Intelligence Questions

عند تحليل الأداء، يجب أن يبحث المحرك عن إجابات لهذه الأسئلة:

---

## السؤال الأول

### Current State

ما حالة المحفظة الآن؟

Metrics:

```text
Current Portfolio Value

Total ROI

Unrealized PnL

Realized PnL

Daily Change

Weekly Change

Monthly Change
```

---

## السؤال الثاني

### Direction

إلى أين يتجه الأداء؟

هل:

```text
Improving

Declining

Stable

Volatile

Recovering

Unknown
```

---

## السؤال الثالث

### Performance Drivers

ما الذي سبب التغير؟

مثلاً:

هل بسبب:

* ارتفاع أصل معين؟
* تدفقات جديدة؟
* تداول ناجح؟
* انخفاض أصل؟
* خروج رأس مال؟

---

## السؤال الرابع

### Sustainability

هل الأداء مستدام؟

مثلاً:

ارتفاع المحفظة بسبب:

```text
ETH +15%

```

مختلف عن:

```text
Deposit $20,000
```

---

## السؤال الخامس

### Historical Context

كيف يقارن الأداء بالماضي؟

مثلاً:

* أفضل شهر.
* أسوأ شهر.
* أعلى قيمة تاريخية.
* أطول فترة نمو.
* أطول فترة انخفاض.

---

# 5.4 Required Data Sources

Performance Intelligence يحتاج إلى:

---

## Portfolio Snapshot Data

من:

```text
portfolio_snapshots
```

يستخدم:

* القيمة التاريخية.
* النمو.
* التغيرات.

---

## ROI Data

من:

```text
portfolio_roi
```

يستخدم:

* Cost Basis.
* Return.
* Realized/Unrealized.

---

## Asset Performance

من:

```text
asset_metrics
```

يستخدم:

* مساهمة كل أصل.

---

## Flow Data

من:

```text
capital_flows
```

يستخدم:

تمييز:

```text
Market Growth

vs

New Capital Added
```

---

# 5.5 Metrics Layer

المحرك لا يتعامل مباشرة مع البيانات الخام.

بل مع Metrics.

---

## Portfolio Growth

```text
Growth %

=
(Current Value - Previous Value)
/
Previous Value
```

---

## Performance Contribution

مثلاً:

ETH:

```text
+ $8,000
```

BTC:

```text
+ $2,000
```

SOL:

```text
- $500
```

النتيجة:

```text
ETH contributed 84% of total growth
```

---

## Volatility

قياس:

هل التغيرات:

```text
Smooth

or

Sharp
```

---

## Drawdown

قياس:

أكبر انخفاض من أعلى قيمة.

مثال:

```text
ATH:
$120,000

Current:
$90,000

Drawdown:
-25%
```

---

## Recovery

هل المحفظة تعافت؟

مثلاً:

```text
Previous ATH:
$100,000

Current:
$105,000
```

---

# 5.6 Pattern Detection

هنا يبدأ الذكاء الحقيقي.

---

## Pattern 1

# Continuous Growth

الشروط:

```text
Value increased for multiple periods

AND

No major deposits
```

Insight:

```text
Portfolio growth appears primarily driven by asset appreciation.
```

---

## Pattern 2

# Deposit Driven Growth

الشروط:

```text
Portfolio increased

AND

Large incoming transfers detected
```

Insight:

```text
Recent growth was significantly influenced by additional capital entering the wallet.
```

---

## Pattern 3

# Concentrated Growth

الشروط:

```text
One asset contributes >50% of growth
```

Insight:

```text
Portfolio performance is highly dependent on one asset.
```

---

## Pattern 4

# Performance Reversal

الشروط:

```text
Previous positive trend

↓

Current negative trend
```

Insight:

```text
Portfolio performance direction changed recently.
```

---

## Pattern 5

# Recovery Phase

الشروط:

```text
After drawdown

Value increases consistently
```

Insight:

```text
Portfolio is recovering from a previous decline.
```

---

# 5.7 Insight Object Format

كل Insight يتم تخزينه بهذا الشكل:

```json
{
"type":
"performance_change",

"title":
"Portfolio growth slowed",

"description":
"Portfolio growth decreased compared with the previous period.",

"severity":
"medium",

"confidence":
"high",

"evidence":{

"previous_growth":"12%",

"current_growth":"3%",

"period":"30 days"

},

"created_at":"timestamp"
}
```

---

# 5.8 Interpretation Rules

هذه أهم نقطة.

الـ Insight ليس كافياً.

يجب تفسيره.

---

مثلاً:

Data:

```text
ROI decreased
```

لا نقول:

> ROI انخفض.

هذا وصف.

بل:

```
Observation:
ROI decreased by 8%.

Interpretation:
The portfolio generated lower returns compared with the previous period.

Possible Drivers:
ETH and SOL contributed most to the decline.

Importance:
Future performance is currently more dependent on recovery of these assets.
```

---

# 5.9 Performance Analysis Modes

المحرك يدعم عدة أوضاع.

---

# Mode 1

## Snapshot

سؤال:

> How is my portfolio doing?

يعرض:

```text
Current Value

ROI

Recent Change

Main Driver

Main Risk
```

---

# Mode 2

## Trend

سؤال:

> Is my portfolio improving?

يستخدم:

```text
Snapshots

Growth

Momentum

Historical Comparison
```

---

# Mode 3

## Diagnostic

سؤال:

> Why did my portfolio drop?

يستخدم:

```text
Assets

Flows

Transactions

Performance Contribution
```

---

# Mode 4

## Executive

سؤال:

> Analyze my portfolio

يستخدم:

كل شيء.

---

# 5.10 Response Template

أي رد Performance يجب أن يكون:

---

## Summary

مثال:

> ارتفعت قيمة المحفظة بنسبة 12% خلال آخر 30 يوماً، وكان ETH العامل الرئيسي في هذا النمو.

---

## Key Findings

* القيمة الحالية.
* اتجاه الأداء.
* أهم مساهم.
* أكبر عامل سلبي.

---

## Explanation

شرح السبب.

---

## Evidence

الأرقام المستخدمة.

---

## Things To Watch

نقاط المتابعة.

---

# 5.11 Backend Intelligence Jobs

هذه الوحدة يجب أن تعمل أيضاً بشكل استباقي.

بعد كل Sync:

Job:

```text
calculate_performance_intelligence()
```

يقوم بـ:

1. تحديث Metrics.
2. مقارنة الفترات.
3. اكتشاف الأنماط.
4. إنشاء Insights.
5. حفظها.

---

# 5.12 Database Tables المقترحة

---

## portfolio_metrics

```sql
id

wallet_id

current_value

daily_change

weekly_change

monthly_change

roi

drawdown

volatility

updated_at
```

---

## performance_insights

```sql
id

wallet_id

type

severity

confidence

title

description

evidence_json

created_at
```

---

## performance_contributors

```sql
id

wallet_id

asset_id

contribution_value

contribution_percentage

period
```

---

# 5.13 Tool Exposure للـ AI

الـ LLM لا يستدعي الحسابات.

يستدعي فقط:

```text
get_performance_analysis
```

Response:

```json
{
summary,

metrics,

insights,

contributors,

risks,

confidence
}
```

---

# 5.14 مثال حقيقي لسلوك Sentinel

المستخدم:

> لماذا انخفضت محفظتي هذا الأسبوع؟

العملية الداخلية:

```text
Intent:
Performance Diagnostic

↓

Get Performance Analysis

↓

Read Insights

↓

Read Asset Contributors

↓

Read Flows

↓

Generate Explanation
```

الرد:

> انخفضت قيمة المحفظة بنسبة 6% خلال الأسبوع الحالي. السبب الرئيسي كان انخفاض قيمة ETH الذي يمثل 62% من المحفظة. لم يكن الانخفاض ناتجاً عن خروج رأس مال كبير، لذلك يبدو أن التأثير الأساسي مرتبط بتغير قيمة الأصول وليس التدفقات الخارجية.

لاحظ:

لا يوجد توقع.

لا يوجد قرار استثماري.

فقط تفسير.

---

# انتهى Module 01 — Performance Intelligence

أصبح لدينا الآن:

✅ تعريف المحرك
✅ أهدافه
✅ الأسئلة التي يجيب عنها
✅ البيانات المطلوبة
✅ المقاييس
✅ اكتشاف الأنماط
✅ نظام الـ Insights
✅ نظام الثقة
✅ قواعد التفسير
✅ الـ Jobs الخلفية
✅ تصميم قاعدة البيانات
✅ Tool Interface

---

## Modules 02–03 recorded — التالي Module 04

> **Status:** Module 02 (Flow Intelligence) + Module 03 (Portfolio Intelligence) **recorded** — [`05-02-flow-intelligence.md`](./05-02-flow-intelligence.md) · [`05-03-portfolio-intelligence.md`](./05-03-portfolio-intelligence.md) · also in [`SPEC.md`](./SPEC.md).

التالي: **Module 04 — Asset Intelligence**.
