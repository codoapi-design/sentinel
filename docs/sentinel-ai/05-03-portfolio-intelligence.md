# Sentinel AI Design Specification

# PART 5 — Intelligence Framework

# Module 03 — Portfolio Intelligence

> **Normative (Module 03).** Portfolio Intelligence Engine — third chapter of the Sentinel Intelligence Framework. Spec only; no runtime implementation required by this document alone.

> **Framework intro:** [`05-00-intelligence-framework.md`](./05-00-intelligence-framework.md) — 12 modules, unified Module Template (Goal / Questions / Metrics / Patterns / Insights / Evidence / Confidence / Output), **Reactive + Proactive** modes → `wallet_insights`. Living Spec — [`SPEC.md`](./SPEC.md). Prior modules: [`05-01-performance-intelligence.md`](./05-01-performance-intelligence.md) · [`05-02-flow-intelligence.md`](./05-02-flow-intelligence.md).

> **Cross-links:** Part 2 Portfolio Intelligence Engine ([`02-ai-architecture.md`](./02-ai-architecture.md) §2.18). Part 3 Business Tools / Tool Catalog / Cache / Backend Intelligence Engine ([`03-data-layer-tool-calling.md`](./03-data-layer-tool-calling.md) §3.11–§3.12). Part 4 Analysis Modes + Interpretation & Confidence ([`04-core-system-prompt.md`](./04-core-system-prompt.md) §4.20).

> **Next:** Module 04 — Asset Intelligence.

---

# 5.31 Purpose

## الاسم

```text
Portfolio Intelligence Engine
```

---

## الهدف

التعامل مع المحفظة على أنها **كيان مالي**، وليست قائمة أصول.

الفرق جوهري:

```
Asset List

vs

Financial Entity
```

قائمة الأصول تعرض ما تملك.

الكيان المالي يشرح **كيف تملك**.

---

## الأسئلة التي يطرحها المحرك

```
What is this portfolio made of?

How is capital distributed?

Is it concentrated?

Is it diversified?

Is it structurally healthy?

What kind of investor does this behavior resemble?

How has it evolved over time?
```

هذه الوحدة هي "العقل المالي" للمحفظة، وهي الوحدة الأكثر استخداماً عند الضغط على:

> Analyze My Wallet

أو عند فتح الصفحة الرئيسية.

---

# 5.32 Core Philosophy

## من Allocation إلى Portfolio Understanding

معظم المنتجات تتوقف عند:

```
Allocation
```

أي عرض النِسَب.

Sentinel يجب أن ينتقل إلى:

```
Portfolio Understanding
```

---

## مثال — ETH 75%

الوصف (Description):

> ETH يمثل 75% من المحفظة.

هذه ليست تحليلاً. هذه قراءة رقم.

---

التحليل (Analysis):

> المحفظة تعتمد بشكل أساسي على أصل واحد. هذا يعني أن أداء المحفظة الكلي مرتبط إلى حد كبير بحركة ETH، وأن أي تغير في سعره ينعكس مباشرة على القيمة الإجمالية.

---

القاعدة:

```
Description = What you own

Analysis = What it means
```

---

# 5.33 Intelligence Questions

---

## السؤال الأول

# Composition

مما تتكون المحفظة؟

```
Assets

Networks

Categories

Stablecoin share
```

---

## السؤال الثاني

# Concentration

ما مدى تركّز رأس المال؟

```
Top asset share

Top-3 share

Network share
```

---

## السؤال الثالث

# Diversification

هل المحفظة متنوعة فعلاً؟

هنا القاعدة الأهم:

```
Asset Count ≠ Diversity
```

مثال:

```
20 Tokens

BUT

95% Ethereum Ecosystem
```

هذه محفظة تبدو متنوعة في العدد، لكنها في الواقع مرتبطة بمصدر مخاطرة واحد.

---

## السؤال الرابع

# Portfolio Health

هل البنية سليمة هيكلياً؟

ليس: هل هي استثمار جيد؟

بل: هل التوزيع، النشاط، الاستقرار، واكتمال البيانات في وضع سليم؟

---

## السؤال الخامس

# Investor Profile

ما نوع السلوك الذي تعكسه المحفظة؟

```
Long-Term Holder

Active Trader

Multi-chain Explorer

Passive Investor
```

---

## السؤال السادس

# Evolution

كيف تطورت المحفظة عبر الزمن؟

مثال — تحوّل التوزيع خلال 6 أشهر:

```
6 months ago:

ETH   40%
USDC  35%
Other 25%

Now:

ETH   72%
USDC  10%
Other 18%
```

التفسير:

> تغيّر هيكل المحفظة بشكل ملحوظ خلال الأشهر الستة الماضية، مع ارتفاع نسبة أصل واحد وانخفاض نسبة الأصول المستقرة.

---

# 5.34 Required Data Sources

Portfolio Intelligence يعتمد على:

---

## Assets

```
symbol

balance

usd_value

price

category
```

---

## Networks

توزيع القيمة عبر الشبكات.

---

## Performance

من Module 01 — لربط البنية بالأداء.

---

## Flows

من Module 02 — لفهم هل تغير التوزيع بسبب حركة رأس مال أم بسبب تغير الأسعار.

---

## Transactions

لقياس النشاط والسلوك.

---

# 5.35 Metrics Layer

---

# Total Portfolio Value

إجمالي القيمة.

---

# Asset Count

عدد الأصول.

مهم جداً:

```
Asset Count is NEVER judged alone.
```

عدد الأصول وحده لا يعني تنوعاً ولا يعني جودة.

---

# Allocation %

نسبة كل أصل من الإجمالي.

---

# Top Asset Dominance

نسبة أكبر أصل.

```
Top Asset Value / Total Value
```

---

# Top-3 Concentration

مجموع نسب أكبر ثلاثة أصول.

---

# Network Concentration

نسبة القيمة في أكبر شبكة.

---

# Stablecoin Exposure

نسبة الأصول المستقرة من الإجمالي.

---

# Liquid vs Illiquid

تقسيم القيمة حسب قابلية التسييل.

---

# 5.36 Portfolio Health Score

نطاق:

```
0 - 100
```

---

## تعريف حاسم

```
Structural Score

NOT

Investment Rating
```

هذا المقياس يصف **بنية** المحفظة.

لا يقول إن المحفظة استثمار جيد أو سيئ.

ولا يعطي نصيحة مالية.

---

## الأوزان

```
Diversification      30%

Concentration        25%

Activity             20%

Stability            15%

Data Completeness    10%
```

---

## مثال

```json
{
"health_score": 62,

"breakdown": {
  "diversification": 18,
  "concentration": 12,
  "activity": 16,
  "stability": 10,
  "data_completeness": 6
},

"interpretation":
"The portfolio structure is moderately balanced, with concentration being the main structural factor."
}
```

---

# 5.37 Concentration Intelligence

---

# Pattern 1

# Single Asset Dependency

## الشروط

```
Top Asset Share > 50%
```

Insight:

```
More than half of the portfolio value is held in a single asset.
```

التفسير:

```
Portfolio performance is largely tied to the movement of one asset.
```

---

# Pattern 2

# Extreme Concentration

## الشروط

```
Top Asset Share > 75%
```

Insight:

```
The portfolio is heavily concentrated in one asset.
```

---

# Pattern 3

# Concentration Increase Over Time

## الشروط

```
Current Top Asset Share

>

Previous Period Top Asset Share

+ Threshold
```

Insight:

```
Concentration in the leading asset increased compared with the previous period.
```

---

# 5.38 Diversification Intelligence

التنوع أربعة مستويات، وليست مستوى واحداً.

---

## Asset Diversity

عدد الأصول وتوزيع القيمة بينها.

---

## Network Diversity

توزيع القيمة عبر الشبكات.

---

## Category Diversity

التصنيفات:

```
L1

Stablecoins

DeFi

Gaming

Other
```

---

## Exposure Diversity

هل مصادر المخاطرة مختلفة فعلاً؟

---

## مثال سيّئ

```
20 Tokens

95% Ethereum Ecosystem
```

عدد كبير، لكن مصدر المخاطرة واحد.

---

## مثال جيّد

```
6 Assets

3 Networks

3 Categories

Balanced Allocation
```

عدد أقل، لكن مصادر المخاطرة موزّعة.

---

القاعدة:

```
Diversification = Distribution of exposure

NOT

Number of tokens
```

---

# 5.39 Investor Behavior Classification

---

## قاعدة حاسمة

```
We classify the behavior of the WALLET.

NOT the person.
```

Sentinel لا يصف المستخدم.

بل يصف ما تُظهره بيانات المحفظة.

---

# Long-Term Holder

## المؤشرات

```
Low transaction frequency

Stable allocation over time

Long holding periods
```

## الصياغة

> يُظهر نشاط المحفظة نمطاً قريباً من الاحتفاظ طويل المدى.

---

# Active Trader

## المؤشرات

```
High transaction frequency

Frequent allocation changes

High volume relative to balance
```

## الصياغة

> تُظهر بيانات المحفظة نشاط تداول مرتفعاً نسبياً.

---

# Multi-chain Explorer

## المؤشرات

```
Value spread across multiple networks

Cross-network activity

Bridge interactions
```

## الصياغة

> يمتد نشاط المحفظة عبر عدة شبكات.

---

# Passive Investor

## المؤشرات

```
Very low activity

Few assets

Long inactivity periods
```

## الصياغة

> يُظهر نشاط المحفظة نمطاً منخفض الحركة.

---

## ممنوع

لا نقول:

> أنت متداول نشط.

بل:

> تُظهر بيانات المحفظة نمطاً يشبه التداول النشط.

---

# 5.40 Portfolio Evolution Intelligence

---

# Allocation Shift

تغير التوزيع بين فترتين.

Insight:

```
The portfolio allocation changed materially compared with the previous period.
```

---

# Risk Increase

ارتفاع التركّز أو انخفاض نسبة الأصول المستقرة.

Insight:

```
Structural concentration increased compared with the previous period.
```

---

# Strategy Change

تغير في نمط النشاط نفسه.

مثال:

```
Previously: Stable allocation, low activity

Now: Frequent reallocation
```

Insight:

```
The pattern of portfolio activity changed compared with the previous period.
```

---

# 5.41 Insight Object

يتم تخزينه:

```json
{
"type":
"portfolio_concentration",

"category":
"risk",

"title":
"High concentration in a single asset",

"description":
"ETH represents 72% of total portfolio value.",

"severity":
"medium",

"confidence":
"high",

"evidence":
{
"top_asset":"ETH",
"top_asset_share":"72%",
"top3_share":"88%",
"previous_share":"54%"
},

"related_entities":
[
"ETH",
"Ethereum"
],

"created_at":
"timestamp"
}
```

---

# 5.42 Interpretation Rules

هذه أخطر نقطة في الوحدة.

---

## ممنوع تماماً

```
"Your portfolio is bad"

"You are not diversified"
```

هذه أحكام، وليست تحليلاً.

---

## الصياغات المعتمدة

بدلاً من "محفظتك غير متنوعة":

> تتركز قيمة المحفظة في عدد محدود من الأصول.

---

بدلاً من "محفظتك سيئة":

> تُظهر البنية الحالية اعتماداً مرتفعاً على أصل واحد.

---

بدلاً من "يجب أن تنوّع":

> أي تغير في سعر هذا الأصل ينعكس بشكل مباشر على القيمة الإجمالية للمحفظة.

---

القاعدة:

```
Describe structure.

Explain consequence.

Never judge. Never advise.
```

---

# 5.43 Analysis Modes

---

# Mode 1

## Portfolio Snapshot

السؤال:

> What do I hold?

يعرض:

```
Total Value

Asset Count

Allocation

Networks
```

---

# Mode 2

## Portfolio Diagnosis

السؤال:

> Analyze my wallet.

يحلل:

```
Health Score

Concentration

Diversification

Profile
```

---

# Mode 3

## Risk Review

السؤال:

> Is my portfolio risky?

يحلل:

```
Top Asset Dominance

Category Exposure

Stablecoin Share
```

---

# Mode 4

## Evolution

السؤال:

> How did my portfolio change?

يحلل:

```
Allocation History

Concentration Trend

Strategy Change
```

---

# 5.44 Response Template

أي تحليل محفظة:

---

## Summary

مثال:

> تبلغ قيمة المحفظة $142,300 موزعة على 9 أصول عبر 3 شبكات. يمثل ETH نحو 68% من القيمة الإجمالية، ما يجعل أداء المحفظة مرتبطاً بشكل أساسي بحركة هذا الأصل. نسبة الأصول المستقرة تبلغ 12%.

---

## Composition

```
Total Value

Asset Count

Top Assets

Networks
```

---

## Structure

```
Health Score

Concentration

Diversification
```

---

## Profile

نمط السلوك الذي تعكسه البيانات.

---

## Evolution

كيف تغيرت البنية.

---

## Things To Watch

نقاط المتابعة.

---

# 5.45 Backend Intelligence Jobs

بعد كل Sync:

تشغيل:

```
calculate_portfolio_intelligence()
```

يقوم بـ:

1. حساب القيمة الإجمالية والتوزيع.
2. حساب مؤشرات التركّز.
3. حساب مستويات التنوع الأربعة.
4. حساب Portfolio Health Score.
5. تصنيف سلوك المحفظة (Profile).
6. مقارنة التوزيع مع الفترة السابقة وإنشاء Insights.

---

# 5.46 Database Design

---

## portfolio_health

```sql
id

wallet_id

health_score

diversification_score

concentration_score

activity_score

stability_score

data_completeness_score

calculated_at
```

---

## portfolio_profiles

```sql
id

wallet_id

profile_type

confidence

indicators_json

updated_at
```

---

## allocation_history

```sql
id

wallet_id

snapshot_date

asset_symbol

allocation_percent

usd_value
```

---

# 5.47 Tool Interface

الـ LLM لا يحسب.

يستدعي:

```
get_portfolio_intelligence
```

Response:

```json
{
summary,

composition,

metrics,

health_score,

concentration,

diversification,

profile,

evolution,

insights,

confidence
}
```

---

# 5.48 مثال كامل

المستخدم:

> Analyze my wallet

---

الوكيل داخلياً:

```
Intent:
Portfolio Diagnosis

↓

Get Portfolio Intelligence

↓

Get Performance Analysis

↓

Get Flow Analysis

↓

Combine Structure + Performance + Flow + Risk

↓

Generate Explanation
```

---

النتيجة:

> تبلغ قيمة المحفظة حالياً $142,300 موزعة على 9 أصول عبر 3 شبكات. يمثل ETH نحو 68% من القيمة الإجمالية، وهو ما يجعل أداء المحفظة مرتبطاً بدرجة كبيرة بحركة هذا الأصل.
>
> على مستوى الأداء، ارتفعت قيمة المحفظة بنسبة 11% خلال آخر 30 يوماً. تشير بيانات التدفقات إلى أن جزءاً من هذا الارتفاع جاء من تحويلات واردة بقيمة $6,200، بينما جاء الباقي من ارتفاع قيمة الأصول.
>
> من الناحية الهيكلية، ارتفعت نسبة الأصل الأكبر من 54% إلى 68% مقارنة بالفترة السابقة، وانخفضت نسبة الأصول المستقرة إلى 12%. هذا يعني أن حساسية المحفظة لحركة أصل واحد أصبحت أعلى مما كانت عليه.
>
> تُظهر بيانات النشاط نمطاً أقرب إلى الاحتفاظ طويل المدى، مع عدد محدود من العمليات خلال الفترة.

---

# انتهت الوحدة الثالثة — Portfolio Intelligence

أصبح لدينا الآن:

✅ التعامل مع المحفظة ككيان مالي لا كقائمة أصول
✅ Metrics Layer كامل للتوزيع والتركّز
✅ Portfolio Health Score هيكلي (0–100) بأوزان محددة
✅ Concentration Intelligence بأنماط وشروط واضحة
✅ Diversification على أربعة مستويات (Asset / Network / Category / Exposure)
✅ Investor Behavior Classification لسلوك المحفظة لا للشخص
✅ Portfolio Evolution Intelligence عبر الزمن
✅ قواعد تفسير تمنع الأحكام والنصائح
✅ Analysis Modes + Response Template
✅ Backend Job + قاعدة بيانات مقترحة + Tool Interface

---

## الجزء القادم

سننتقل إلى:

# Module 04 — Asset Intelligence

وستجيب عن:

* ما الأصول التي تقود الأداء؟
* ما الأصول الخاملة (Dormant)؟
* ما الأصول ذات المخاطرة المرتفعة؟
* ما مساهمة كل أصل في النتيجة (Contribution)؟
* ما الأصول المنسية (Forgotten)؟
* ما الأصول المزيفة أو عديمة القيمة (Spam / Zero-value)؟
* كيف يتغير سلوك كل أصل عبر الزمن؟

وستكون هذه الوحدة الأساس لتحليل صفحة **Assets** في Sentinel.
