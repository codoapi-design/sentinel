# Sentinel AI Design Specification

# PART 5 — Intelligence Framework

# Module 04 — Asset Intelligence

> **Normative (Module 04).** Asset Intelligence Engine — fourth chapter of the Sentinel Intelligence Framework. Spec only; no runtime implementation required by this document alone.

> **Framework intro:** [`05-00-intelligence-framework.md`](./05-00-intelligence-framework.md) — 12 modules, unified Module Template (Goal / Questions / Metrics / Patterns / Insights / Evidence / Confidence / Output), **Reactive + Proactive** modes → `wallet_insights`. Living Spec — [`SPEC.md`](./SPEC.md). Prior modules: [`05-01-performance-intelligence.md`](./05-01-performance-intelligence.md) · [`05-02-flow-intelligence.md`](./05-02-flow-intelligence.md) · [`05-03-portfolio-intelligence.md`](./05-03-portfolio-intelligence.md).

> **Cross-links:** Part 2 Portfolio Intelligence Engine ([`02-ai-architecture.md`](./02-ai-architecture.md) §2.18). Part 3 Business Tools / Cache / Backend Intelligence Engine ([`03-data-layer-tool-calling.md`](./03-data-layer-tool-calling.md) §3.11–§3.12). Part 4 Analysis Mode / Confidence / Evidence ([`04-core-system-prompt.md`](./04-core-system-prompt.md) §4.20).

> **Next:** Module 05 — Risk Intelligence.

---

# 5.49 Purpose

## الاسم

```text
Asset Intelligence Engine
```

---

## الهدف

تحويل الأصول من مجرد قائمة أرصدة:

```
Asset
Balance
Value
```

إلى تحليل مالي حقيقي:

```
ما أهمية هذا الأصل داخل المحفظة؟

هل يساهم في الأداء أم يضره؟

هل هو مستقر أم متقلب؟

هل تم إهماله؟

هل يشكل خطراً؟

كيف تغير دوره عبر الزمن؟
```

---

Module 01 يجيب: كيف أدت المحفظة.

Module 03 يجيب: كيف تتوزع المحفظة.

Module 04 يجيب: **ماذا يفعل كل أصل داخل المحفظة**.

---

# 5.50 Core Philosophy

الأصل ليس رقماً واحداً.

المعادلة:

```
Asset
=
Allocation
+
Performance Contribution
+
Behavior
+
Risk
+
Historical Context
```

---

## مثال

البيانات الخام تقول:

```
SOL
Balance: 120
Value: $18,000
```

هذه ليست معلومة مالية.

المعلومة المالية هي:

```
SOL

12% من المحفظة

ساهم بـ -$4,200 خلال 30 يوماً

أعلى تقلب بين الأصول

آخر حركة قبل 74 يوماً
```

---

الفرق:

```
Raw Data = What you own

Intelligence = What it does
```

---

# 5.51 Intelligence Questions

عند تحليل أي أصل، يجب أن يجيب المحرك عن خمس مجموعات من الأسئلة.

---

## السؤال الأول

# Asset Importance

ما وزن الأصل داخل المحفظة؟

```
Allocation %

Rank

Value
```

هل هو:

```
Core Holding

Secondary Holding

Marginal Holding
```

---

## السؤال الثاني

# Performance Contribution

كم ساهم الأصل في نتيجة المحفظة؟

مثال:

```
Portfolio Change:
+$10,000

↓

ETH:      +$14,000
BTC:      +$1,200
SOL:      -$4,200
Others:   -$1,000
```

التفسير:

النمو لم يكن موزعاً.

بل جاء من أصل واحد، بينما قام أصل آخر بتقليصه.

هذا هو الفرق بين:

> ارتفعت المحفظة

وبين:

> ارتفعت المحفظة بسبب ETH رغم تراجع SOL

---

## السؤال الثالث

# Asset Risk

ما مستوى المخاطر المرتبطة بالأصل داخل المحفظة؟

```
Volatility

Concentration Weight

Liquidity Signals

Data Quality
```

ملاحظة:

هذه مخاطر **داخل المحفظة**، وليست تقييماً للمشروع نفسه.

---

## السؤال الرابع

# Asset Behavior

كيف يتصرف الأصل؟

```
Accumulated

Reduced

Held

Rotated

Untouched
```

المصدر: Transactions (Module 02 Flow Intelligence).

---

## السؤال الخامس

# Asset Lifecycle

في أي مرحلة يقف الأصل؟

```
Growing

Stable

Declining

Dormant

Abandoned
```

هذا يمنح Sentinel قدرة على الحديث عن الأصل عبر الزمن، وليس في لحظة واحدة فقط.

---

# 5.52 Required Data Sources

Asset Intelligence يعتمد على أربعة مصادر.

---

## assets

المصدر الأساسي للأرصدة:

```
symbol

balance

value_usd

network

price

last_updated
```

---

## transactions

لفهم السلوك:

```
direction

amount

asset

usd_value

timestamp
```

---

## portfolio_snapshots

لربط الأصل بتغير قيمة المحفظة عبر الزمن.

---

## asset_prices

لحساب:

```
Price Change

Volatility

Contribution
```

---

# 5.53 Metrics Layer

---

# Current Value

```
balance × price
```

---

# Allocation %

```
Allocation = Asset Value / Portfolio Value × 100
```

يُقرأ مع Concentration في Module 03.

---

# Performance Contribution

المعادلة:

```
Contribution = Asset Value Change (USD)

Contribution % = Asset Value Change / Portfolio Value Change × 100
```

مثال:

```
Portfolio Change:
+$10,000

ETH Change:
+$14,000

ETH Contribution:
140%
```

التفسير:

> ETH وحده فسّر النمو بالكامل، بينما قللت أصول أخرى من صافي النتيجة.

هذه هي **Performance Attribution**، وهي الجسر بين Module 01 و Module 04.

---

# Holding Duration

منذ متى يوجد الأصل في المحفظة.

```
First Seen → Now
```

---

# Transaction Activity

```
Transaction Count

Last Activity Date

Days Since Last Activity
```

---

# Turnover Rate

```
Turnover = Asset Volume / Average Asset Value
```

يميز بين:

```
Long-term Holding

vs

Active Trading
```

---

# Unrealized / Realized Performance

```
Unrealized = Current Value - Cost Basis (إن توفر)

Realized = Proceeds - Cost of sold units
```

إذا لم يتوفر Cost Basis:

يُخفض الـ Confidence ويُذكر ذلك صراحة (Part 4 — Evidence & Confidence).

---

# 5.54 Asset Classification

كل أصل يُصنَّف تلقائياً.

---

## Core Asset

```
Allocation ≥ 20%

+

Long Holding Duration
```

الأصل الذي تعتمد عليه المحفظة.

---

## Trading Asset

```
High Transaction Count

+

High Turnover
```

---

## Growth Asset

```
Positive Contribution

+

Rising Allocation
```

---

## Declining Asset

```
Negative Contribution

+

Falling Value
```

---

## Dormant Asset

```
No activity for a long period

+

Small or unchanged allocation
```

---

## Suspicious Asset

```
Unknown token

+

No reliable price

+

Unusual entry pattern
```

مهم:

التصنيف وصف لحالة الأصل **داخل المحفظة**، وليس حكماً على المشروع.

---

# 5.55 Pattern Detection

هنا يبدأ الذكاء الحقيقي في هذه الوحدة.

---

# Pattern 1

# Dominant Asset

## الشروط

```
Allocation ≥ 50%
```

Insight:

```
A single asset represents the majority of portfolio value.
```

---

التفسير:

```
Portfolio performance is largely determined by the behavior of this asset.
```

يُقرأ مع Concentration Risk في Module 03.

---

# Pattern 2

# Performance Leader

## الشروط

```
Highest Positive Contribution

+

Contribution ≥ 40% of total gain
```

Insight:

```
Most of the portfolio gain during this period came from one asset.
```

---

التفسير:

```
Portfolio results are currently dependent on a single performance driver.
```

---

# Pattern 3

# Hidden Underperformer

## الشروط

```
Portfolio Value ↑

AND

Asset Contribution < 0
```

Insight:

```
One asset declined while overall portfolio value increased.
```

---

التفسير:

```
The overall result hides a negative contribution from this asset.
```

هذا النمط من أكثر الأنماط قيمة، لأنه يكشف ما تخفيه الأرقام الإجمالية.

---

# Pattern 4

# Allocation Drift

## الشروط

مقارنة فترتين:

```
Previous Allocation

vs

Current Allocation
```

مثال:

```
ETH: 34% → 61%
```

Insight:

```
The weight of this asset within the portfolio changed significantly.
```

---

التفسير:

```
The change may result from price movement, additional inflows, or reduction in other assets.
```

لا نفترض السبب قبل مراجعة Flow Intelligence.

---

# Pattern 5

# Forgotten Asset

## الشروط

```
No transactions for an extended period

+

Value still material
```

Insight:

```
This asset has remained without activity for an extended period.
```

---

التفسير:

```
The holding continues to affect portfolio exposure despite no recent activity.
```

---

# Pattern 6

# Asset Rotation

## الشروط

```
Asset A decreasing

+

Asset B increasing

+

Similar timing
```

Insight:

```
Exposure appears to have shifted between assets during this period.
```

---

مهم:

لا نقول:

> قمت ببيع A وشراء B.

بل نصف الحركة كما ظهرت في البيانات.

---

# 5.56 Asset Health Score

Score من:

```
0 - 100
```

---

## تحذير مهم

هذا **ليس** تقييماً استثمارياً للأصل.

هذا تقييم لوضع الأصل **داخل هذه المحفظة**:

```
In-Portfolio Evaluation

NOT

Investment Rating
```

---

## المكونات

### Contribution

هل يضيف أم يسحب من الأداء.

---

### Stability

مستوى التقلب مقارنة ببقية الأصول.

---

### Allocation

هل الوزن متوازن أم مفرط.

---

### Activity

هل الأصل مُدار أم مهمل.

---

### Data Quality

جودة السعر والبيانات المتاحة.

---

## مثال

```json
{
"asset":
"SOL",

"health_score":
54,

"components":
{
"contribution": 30,
"stability": 45,
"allocation": 70,
"activity": 40,
"data_quality": 95
},

"classification":
"declining",

"confidence":
"medium"
}
```

---

# 5.57 Asset Insight Object

يتم تخزينه:

```json
{
"type":
"hidden_underperformer",

"asset":
"SOL",

"title":
"SOL reduced overall portfolio gain",

"description":
"Portfolio value increased during the period while this asset declined.",

"severity":
"medium",

"confidence":
"high",

"evidence":
{
"portfolio_change":"+$10,000",
"asset_change":"-$4,200",
"allocation":"12%",
"period":"30d"
},

"related_entities":
[
"Solana",
"Performance Intelligence"
],

"created_at":
"timestamp"
}
```

الشكل مطابق لـ Flow Insight Object (§5.23) مع إضافة حقل `asset`.

---

# 5.58 Interpretation Rules

هذه أخطر نقطة في الوحدة.

---

## القاعدة الأولى

لا نعطي توصيات.

الرد الخاطئ:

> يجب أن تشتري SOL.

> يجب أن تبيع SOL.

---

## القاعدة الثانية

لا نحكم على الأصل نفسه.

الرد الخاطئ:

> هذا أصل سيء.

---

## البدائل المعتمدة

بدلاً من:

> هذا أصل سيء.

نقول:

> ساهم هذا الأصل بشكل سلبي في أداء المحفظة خلال هذه الفترة.

---

بدلاً من:

> يجب تقليل SOL.

نقول:

> يمثل هذا الأصل 12% من المحفظة، وقد سجل أعلى تقلب بين الأصول خلال الفترة.

---

بدلاً من:

> الأصل ميت.

نقول:

> لم تُسجَّل أي حركة على هذا الأصل منذ 74 يوماً.

---

القاعدة العامة:

```
Describe behavior

Not

Prescribe action
```

---

# 5.59 Analysis Modes

---

# Mode 1

## Asset Overview

السؤال:

> ما هي أصولي؟

يعرض:

```
Assets

Allocation

Value

Classification
```

---

# Mode 2

## Performance Attribution

السؤال:

> ما الأصل الذي أثر على النتيجة؟

يحلل:

```
Contribution per Asset

Top Contributors

Top Detractors
```

---

# Mode 3

## Risk Analysis

السؤال:

> هل هناك أصل يمثل خطراً؟

يحلل:

```
Dominance

Volatility

Data Quality

Suspicious Assets
```

يُمرَّر إلى Module 05 — Risk Intelligence.

---

# Mode 4

## Asset Evolution

السؤال:

> كيف تغيرت أصولي؟

يحلل:

```
Allocation Drift

Rotation

Lifecycle Stage
```

---

# 5.60 Response Template

أي تحليل أصول:

---

## Summary

مثال:

> تتكون المحفظة من 8 أصول، ويمثل ETH النسبة الأكبر بـ 61%. خلال آخر 30 يوماً جاء معظم النمو من ETH، بينما ساهم SOL بشكل سلبي بقيمة -$4,200.

---

## Asset Distribution

```
ETH    61%    $91,500
BTC    18%    $27,000
SOL    12%    $18,000
USDC    6%     $9,000
Others  3%     $4,500
```

---

## Contribution Breakdown

```
Top Contributors

Top Detractors
```

---

## Notable Assets

```
Dominant

Dormant

Suspicious
```

---

## Interpretation

شرح معنى التوزيع والمساهمة.

---

## Things To Watch

نقاط المتابعة، بدون توصيات.

---

# 5.61 Backend Intelligence Jobs

بعد كل Sync:

تشغيل:

```
calculate_asset_intelligence()
```

يقوم بـ:

1. تحميل الأصول والأسعار.
2. حساب Allocation و Value.
3. حساب Contribution لكل أصل.
4. تصنيف الأصول.
5. اكتشاف Patterns.
6. إنشاء Insights وتخزينها.

النتيجة تُكتب إلى الجداول أدناه و`wallet_insights` (Part 3 §3.12).

---

# 5.62 Database Design

---

## asset_metrics

```sql
id

wallet_id

asset_symbol

period

value_usd

allocation_pct

contribution_usd

contribution_pct

volatility

turnover_rate

last_activity_at

health_score

classification

updated_at
```

---

## asset_insights

```sql
id

wallet_id

asset_symbol

type

severity

confidence

title

description

evidence_json

created_at
```

---

## asset_history

```sql
id

wallet_id

asset_symbol

snapshot_date

balance

price

value_usd

allocation_pct
```

---

# 5.63 Tool Interface

الـ LLM لا يستدعي الحسابات.

يستدعي (Business Tool — Part 3 §3.x conventions):

```
get_asset_intelligence
```

Response:

```json
{
summary,

assets,

allocation,

contributions,

classifications,

patterns,

insights,

health_scores,

confidence
}
```

---

# 5.64 مثال كامل

المستخدم:

> لماذا انخفضت محفظتي؟

الوكيل داخلياً:

```
Intent:
Performance Diagnosis

↓

Get Performance Analysis

↓

Get Asset Intelligence

↓

Rank Contributions

↓

Identify Detractors

↓

Generate Explanation
```

النتيجة:

> انخفضت قيمة المحفظة بنسبة 6.4% خلال آخر 30 يوماً. تشير البيانات إلى أن الانخفاض لم يكن عاماً: فقد سجل ETH أداءً موجباً بقيمة +$3,100، بينما جاء أكبر أثر سلبي من SOL بقيمة -$4,200 ومن أصول أصغر بقيمة -$1,900 مجتمعة. يمثل SOL حالياً 12% من المحفظة، وهو الأعلى تقلباً بين الأصول خلال هذه الفترة. لم تُسجَّل تحويلات خارجية كبيرة، لذلك يظهر أن التغير مرتبط بحركة الأسعار وليس بخروج رأس مال.

لاحظ:

```
Performance Intelligence
+
Asset Intelligence
+
Flow Intelligence (للنفي)
```

ثلاث وحدات تعمل معاً في إجابة واحدة، بدون أي توصية.

---

# انتهت الوحدة الرابعة — Asset Intelligence

أصبح لدينا الآن:

✅ تحليل كل أصل داخل المحفظة
✅ Performance Attribution لكل أصل
✅ تصنيف الأصول (Core / Trading / Growth / Declining / Dormant / Suspicious)
✅ ستة أنماط بما فيها Hidden Underperformer
✅ Asset Health Score داخل المحفظة (وليس تقييماً استثمارياً)
✅ قواعد تفسير بلا توصيات
✅ أربعة Analysis Modes
✅ قاعدة بيانات مقترحة
✅ Tool Interface

---

## الجزء القادم

سننتقل إلى:

# Module 05 — Risk Intelligence

وهذه الوحدة تنتقل من وصف ما حدث إلى كشف **نقاط الضعف الهيكلية** في المحفظة.

سنصمم فيها:

* Concentration Risk
* Single-Network Dependency
* Untrusted / Unverified Assets
* Volatility Exposure
* Liquidity & Data-Quality Risk
* Risk Level Over Time

وستكون الأساس الذي تُبنى عليه:

```
Portfolio Risk

Wallet Health

Alerts
```
