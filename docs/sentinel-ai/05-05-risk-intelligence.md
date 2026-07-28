# Sentinel AI Design Specification

# PART 5 — Intelligence Framework

# Module 05 — Risk Intelligence

> **Normative (Module 05).** Risk Intelligence Engine — fifth chapter of the Sentinel Intelligence Framework. Spec only; no runtime implementation required by this document alone.

> **Framework intro:** [`05-00-intelligence-framework.md`](./05-00-intelligence-framework.md) — 12 modules, unified Module Template (Goal / Questions / Metrics / Patterns / Insights / Evidence / Confidence / Output), **Reactive + Proactive** modes → `wallet_insights`. Living Spec — [`SPEC.md`](./SPEC.md). Prior modules: [`05-01-performance-intelligence.md`](./05-01-performance-intelligence.md) · [`05-02-flow-intelligence.md`](./05-02-flow-intelligence.md) · [`05-03-portfolio-intelligence.md`](./05-03-portfolio-intelligence.md) · [`05-04-asset-intelligence.md`](./05-04-asset-intelligence.md).

> **Cross-links:** Part 2 Portfolio Intelligence Engine ([`02-ai-architecture.md`](./02-ai-architecture.md) §2.18). Part 3 Cache / Backend Intelligence Engine ([`03-data-layer-tool-calling.md`](./03-data-layer-tool-calling.md) §3.11–§3.12). Part 4 Analysis Modes / Confidence / Evidence / No-Recommendation rules ([`04-core-system-prompt.md`](./04-core-system-prompt.md) §4.20). Module 01 → Drawdown & Volatility. Modules 03–04 → Concentration & Asset classification. Module 02 → Activity change.

> **Next:** Module 06 — Trading Intelligence.

---

# 5.65 Purpose

## الاسم

```text
Risk Intelligence Engine
```

---

## الهدف

فهم المخاطر الحقيقية في المحفظة:

```
Structural Risk

Behavioral Risk

Operational Risk
```

وتحويلها من إحساس عام:

> "المحفظة خطرة."

إلى وصف دقيق مبني على أدلة:

```
Where is the risk?

What type of risk?

Is it increasing?

What does it depend on?
```

---

## ما ليس هذا المحرك

هذا المحرك **ليس نظام تخويف**.

ولا **نظام تنبؤ بالمخاطر**.

Sentinel لا يقول:

> "السوق سينهار."

ولا:

> "هذه المحفظة ستخسر."

بل:

```
Risk = Structure + Behavior + Data Quality
```

أي وصف لما هو موجود، لا توقّع لما سيحدث.

---

# 5.66 Core Philosophy

معظم المنتجات تتعامل مع المخاطر بشكل سطحي:

```
ETH = 80%

↓

"ETH is risky"
```

وهذا خاطئ.

الصحيح:

```
ETH = 80%

↓

Portfolio depends heavily on a single asset
```

الفرق:

الأول حكم على الأصل.

الثاني وصف لبنية المحفظة.

---

## Dependency ≠ Bad Asset

التركّز العالي في ETH لا يعني "ETH سيئ".

يعني أن أداء المحفظة **مرتبط** بأداء أصل واحد.

```
Concentration = Dependency

Dependency ≠ Judgment
```

---

## مثال مهم

محفظة تحتوي على:

```
30 Tokens
```

تبدو موزعة.

لكن:

```
95% of value in one ecosystem
```

هذه ليست محفظة موزعة.

هذه محفظة مركّزة بشكل مخفي.

---

## القاعدة

```
Number of assets ≠ Risk diversification
```

عدد الأصول لا يقيس المخاطر.

توزيع القيمة والاعتماد هو ما يقيسها.

---

# 5.67 Risk Layers

المخاطر ليست طبقة واحدة.

المحرك يحلل **ست طبقات**.

---

# Layer 1

# Concentration Risk

## السؤال

> هل المحفظة معتمدة على أصل واحد أو مجموعة صغيرة؟

## يشمل

```
Asset Concentration

Network Concentration

Sector / Ecosystem Concentration
```

المصدر: Module 03 (Portfolio) + Module 04 (Asset).

---

# Layer 2

# Volatility Risk

## السؤال

> كم تتحرك قيمة المحفظة؟

## يشمل

```
Drawdown

Value Swings

Historical Stability
```

المصدر: Module 01 (Performance).

---

# Layer 3

# Liquidity Risk

## السؤال

> هل يمكن الخروج من الأصول بسهولة؟

## يشمل

```
Asset Liquidity

Market Depth

Token Type (Small Caps / Long Tail)
```

مثال:

أصل بقيمة كبيرة لكن سيولته ضعيفة لا يعادل أصلاً بنفس القيمة وسيولة عميقة.

---

# Layer 4

# Behavioral Risk

## السؤال

> هل سلوك المستخدم نفسه يرفع مستوى المخاطر؟

## يشمل

```
Sudden Activity Spikes

Unusually Large Transfers

Pattern Change
```

المصدر: Module 02 (Flow).

---

# Layer 5

# Operational Risk

## السؤال

> هل هناك مخاطر تشغيلية في طريقة استخدام المحفظة؟

## يشمل

```
Unknown Contract Interactions

Unclassified Addresses

Non-major Networks
```

هذا وصف تشغيلي، وليس اتهاماً بالاحتيال.

---

# Layer 6

# Data Risk

هذه الطبقة **مميزة لـ Sentinel**.

## السؤال

> ما مدى اكتمال البيانات التي بُني عليها التحليل؟

## يشمل

```
Missing Data

Unknown Assets

Unavailable Prices
```

## القاعدة

```
No strong analysis on incomplete data
```

إذا كانت البيانات ناقصة:

المحرك **يخفض الثقة** ويصرّح بذلك.

ولا يقدم تحليلاً قاطعاً.

---

# 5.68 Intelligence Questions

عند تحليل المخاطر، يجب أن يجيب المحرك عن:

---

## السؤال الأول

# Structural Risk

ما مصدر الخطر الأساسي في بنية المحفظة؟

```
Concentration?

Volatility?

Liquidity?
```

---

## السؤال الثاني

# Risk Direction

هل مستوى التعرّض للمخاطر:

```
Increasing

Decreasing

Stable
```

---

## السؤال الثالث

# Risk Concentration

أين تتركز المخاطر؟

```
Asset

Network

Time Period

Counterparty
```

---

## السؤال الرابع

# Behavior Impact

هل سلوك المستخدم يزيد التعرّض؟

مثلاً:

```
Activity ×5

+

Larger Transfers
```

---

## السؤال الخامس

# Data Reliability

ما مدى موثوقية هذا التحليل؟

```
High

Medium

Low
```

هذا السؤال إلزامي في كل تحليل مخاطر.

---

# 5.69 Required Data Sources

Risk Intelligence لا يملك بيانات خاصة به.

هو **محرك تركيبي** يعتمد على باقي الوحدات.

---

## Asset Intelligence

```
Asset Classification

Liquidity Tier

Unknown Assets
```

---

## Portfolio Intelligence

```
Allocation

Concentration

Diversification
```

---

## Performance Intelligence

```
Drawdown

Volatility

Historical Stability
```

---

## Flow Intelligence

```
Activity Changes

Large Movements

Counterparties
```

---

## Transactions

```
Frequency

Size

Contract Interactions

Networks
```

---

# 5.70 Risk Metrics

---

# Concentration Index

يقيس اعتماد المحفظة على أقل عدد من الأصول.

```
Top 1 Asset %

Top 3 Assets %
```

مثال:

```
Top 1: 68%

Top 3: 91%
```

---

# Network Exposure

نسبة القيمة على كل شبكة.

```
Ethereum: 82%

Solana: 12%

Others: 6%
```

---

# Drawdown

أكبر انخفاض من القمة.

المصدر: Module 01.

```
Max Drawdown: -34%
```

---

# Volatility Score

مدى تذبذب قيمة المحفظة عبر الفترة.

```
0 - 100
```

---

# Activity Spike Score

يقيس مدى اختلاف النشاط الحالي عن المعتاد.

```
Current Activity vs Historical Baseline
```

---

# Unknown Exposure

نسبة القيمة في أصول غير مصنفة أو غير معروفة.

```
Unknown Assets % of Portfolio
```

---

# Data Confidence Score

يقيس اكتمال البيانات المستخدمة في التحليل.

```
Coverage of Prices

Coverage of Assets

Coverage of Transactions
```

هذا المقياس يتحكم في مستوى الثقة المعلن للمستخدم.

---

# 5.71 Portfolio Risk Score

---

## المدى

```
0 - 100
```

---

## المعنى

```
Higher = Higher Risk Exposure
```

---

## تحذير تفسيري مهم

هذا **ليس** مقياس جودة.

```
100 ≠ Bad Portfolio

0 ≠ Good Portfolio
```

المقياس يصف **حجم التعرّض**، لا صحة القرار.

محفظة عالية التعرّض قد تكون مقصودة تماماً من صاحبها.

---

## الأوزان

| Component | Weight |
|-----------|--------|
| Concentration | 30 |
| Volatility | 25 |
| Liquidity | 15 |
| Behavioral | 15 |
| Operational | 10 |
| Data | 5 |

المجموع:

```
100
```

---

## مثال

```json
{
"risk_score": 72,

"level": "high_exposure",

"components": {
"concentration": 28,
"volatility": 18,
"liquidity": 9,
"behavioral": 10,
"operational": 5,
"data": 2
},

"confidence": "medium"
}
```

---

## التفسير

```
The portfolio shows a high dependency on a small number of assets, combined with elevated historical volatility.
```

لا حكم.

وصف فقط.

---

# 5.72 Pattern Detection

---

# Pattern 1

# High Asset Dependency

## الشروط

```
Top 1 Asset > 60%
```

Insight:

```
Portfolio performance is highly dependent on a single asset.
```

---

التفسير:

```
Most of the portfolio value moves with one asset. Gains and declines will largely follow that asset.
```

---

# Pattern 2

# Increasing Risk Exposure

## الشروط

```
Risk Score (current) > Risk Score (previous)

+

Sustained over multiple snapshots
```

Insight:

```
Risk exposure increased compared with the previous period.
```

---

التفسير:

```
The structure of the portfolio shifted toward higher exposure. This describes change, not outcome.
```

---

# Pattern 3

# Volatility Expansion

## الشروط

```
Recent Volatility > Historical Volatility × Threshold
```

Insight:

```
Portfolio value fluctuations widened during this period.
```

---

# Pattern 4

# Dormant Risk

هذا نمط دقيق.

## الشروط

```
Low Activity

+

High Concentration
```

Insight:

```
The portfolio is inactive but structurally concentrated.
```

---

التفسير:

```
Low activity does not reduce structural exposure. The dependency remains unchanged.
```

---

# Pattern 5

# Sudden Behavior Change

## الشروط

```
Activity Spike

+

Larger than usual transfers
```

Insight:

```
Wallet behavior changed significantly compared with its historical baseline.
```

---

مهم:

لا نفترض السبب.

لا نقول "المستخدم يخرج من السوق".

---

# Pattern 6

# Unknown Asset Exposure

## الشروط

```
Unknown Exposure > Threshold
```

Insight:

```
A portion of the portfolio value is held in assets that could not be classified.
```

---

التفسير:

```
This reduces analysis confidence and is reported as a data limitation, not as an asset judgment.
```

---

# 5.73 Severity Model

كل Insight له درجة.

---

## Low

تعرّض ضمن نطاق طبيعي.

مثال:

```
Top 1 Asset: 35%
```

---

## Medium

تعرّض ملحوظ يستحق المتابعة.

مثال:

```
Top 1 Asset: 55%

or

Drawdown: -22%
```

---

## High

تعرّض مرتفع وواضح في البنية.

مثال:

```
Top 1 Asset: 78%

or

Unknown Exposure: 30%
```

---

## القاعدة الحاكمة

```
Severity ≠ Recommendation
```

الدرجة تصف **حجم الملاحظة**.

لا تعني "افعل شيئاً".

`high` لا تعني "بِع".

`low` لا تعني "اشترِ المزيد".

---

# 5.74 Risk Insight Object

يتم تخزينه:

```json
{
"type":
"concentration_risk",

"title":
"High dependency on a single asset",

"description":
"A large share of the portfolio value is concentrated in one asset.",

"severity":
"high",

"confidence":
"high",

"impact":
"Portfolio value closely follows the performance of this asset.",

"evidence":
{
"top_1_asset":"ETH",
"top_1_share":"68%",
"top_3_share":"91%",
"network":"Ethereum"
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

حقل `impact` إلزامي في هذه الوحدة.

لأن المخاطر بدون شرح الأثر تصبح تخويفاً.

---

# 5.75 Interpretation Rules

هذه أهم نقطة في الوحدة.

---

## حالة: تركّز مرتفع

❌ الخطأ:

> محفظتك خطرة.

✅ الصحيح:

> 68% من قيمة المحفظة موجودة في أصل واحد، مما يعني أن أداء المحفظة مرتبط بشكل مباشر بحركة هذا الأصل.

---

## حالة: أصل مهيمن

❌ الخطأ:

> يجب أن تقلل ETH.

✅ الصحيح:

> يمثل ETH الحصة الأكبر من المحفظة، وبالتالي فإن تغيرات قيمته تنعكس على القيمة الإجمالية بدرجة أعلى من باقي الأصول.

---

## حالة: أصل غير مصنّف

❌ الخطأ:

> هذا التوكن سيئ.

✅ الصحيح:

> لم يتم تصنيف هذا الأصل ضمن البيانات المتاحة، لذلك تم استبعاده من التحليل التفصيلي وتم خفض مستوى الثقة.

---

## حالة: ارتفاع التذبذب

❌ الخطأ:

> السوق سينخفض.

✅ الصحيح:

> اتسع نطاق تذبذب قيمة المحفظة خلال الفترة الأخيرة مقارنة بالمعدل التاريخي.

---

## القاعدة النهائية

```
Describe exposure.

Never prescribe action.
```

انظر Part 4 (§4.20) — Analysis Modes / Evidence / No-Recommendation.

---

# 5.76 Analysis Modes

---

# Mode 1

## Risk Overview

السؤال:

> ما مستوى المخاطر في محفظتي؟

يعرض:

```
Risk Score

Main Risk Factors

Confidence
```

---

# Mode 2

## Concentration Analysis

السؤال:

> هل محفظتي مركّزة؟

يعرض:

```
Top 1 / Top 3

Network Exposure

Ecosystem Exposure
```

---

# Mode 3

## Activity Risk

السؤال:

> هل هناك سلوك غير معتاد؟

يعرض:

```
Activity Spike Score

Large Movements

Behavior Change
```

---

# Mode 4

## Executive Risk Report

السؤال:

> أعطني تقريراً عن المخاطر.

يعرض:

```
Summary

Risk Factors

Evidence

Monitoring Points

Confidence
```

---

# 5.77 Response Template

أي تحليل مخاطر يتبع هذا الشكل.

---

## Summary

مثال:

> تشير البيانات إلى أن المحفظة تعتمد بشكل كبير على أصل واحد، مع مستوى تذبذب أعلى من المتوسط خلال آخر 90 يوماً. مستوى الثقة في التحليل متوسط بسبب وجود أصول غير مصنّفة.

---

## Risk Factor 1

```
Concentration
```

الدليل:

```
Top 1 Asset: 68%

Top 3 Assets: 91%
```

الأثر:

```
Portfolio value follows one asset closely.
```

---

## Risk Factor 2

```
Volatility
```

الدليل:

```
Max Drawdown: -34%

Volatility Score: 71
```

الأثر:

```
Value swings were wider than the historical baseline.
```

---

## Risk Factor 3

```
Data Quality
```

الدليل:

```
Unknown Exposure: 9%

Data Confidence Score: 74
```

الأثر:

```
Part of the portfolio could not be analyzed in detail.
```

---

## Monitoring Points

نقاط المتابعة — وليست توصيات:

```
Top 1 Asset share

Volatility trend

Unknown exposure share
```

---

# 5.78 Backend Intelligence Jobs

بعد كل Sync:

تشغيل:

```
calculate_risk_intelligence()
```

يقوم بـ:

1. جمع مخرجات Modules 01–04.
2. حساب Risk Metrics.
3. حساب Portfolio Risk Score.
4. اكتشاف Patterns.
5. إنشاء Risk Insights وتخزينها.

---

النتائج تُكتب أيضاً إلى `wallet_insights` (Proactive Mode — Part 3 §3.12).

---

# 5.79 Database Design

---

## portfolio_risk_scores

```sql
id

wallet_id

risk_score

concentration_score

volatility_score

liquidity_score

behavioral_score

operational_score

data_score

confidence

calculated_at
```

---

## risk_insights

```sql
id

wallet_id

type

severity

confidence

title

description

impact

evidence_json

created_at
```

---

## risk_history

```sql
id

wallet_id

date

risk_score

main_factor
```

`risk_history` هو ما يسمح باكتشاف **Increasing Risk Exposure** (Pattern 2).

---

# 5.80 Tool Interface

الـ LLM لا يحسب المخاطر.

يستدعي:

```
get_risk_intelligence
```

Response:

```json
{
risk_score,

level,

components,

risk_factors,

patterns,

insights,

evidence,

monitoring_points,

confidence
}
```

---

# 5.81 مثال كامل

المستخدم:

> هل محفظتي آمنة؟

---

## القاعدة أولاً

هذا السؤال **لا يُجاب بنعم أو لا**.

```
Safe / Not Safe = Judgment

Sentinel = Description
```

---

الوكيل داخلياً:

```
Intent:
Risk Assessment

↓

Get Risk Intelligence

↓

Read Concentration + Volatility + Data Quality

↓

Rank Risk Factors

↓

Generate Explanation (no verdict)
```

---

النتيجة:

> لا يمكن وصف المحفظة بأنها "آمنة" أو "غير آمنة"، لأن ذلك حكم يعتمد على أهدافك. لكن يمكن وصف مستوى التعرّض بدقة: 68% من قيمة المحفظة موجودة في أصل واحد (ETH)، و91% في أعلى ثلاثة أصول، مما يعني أن أداء المحفظة مرتبط بحركة عدد محدود من الأصول. كما بلغ أكبر انخفاض من القمة -34% خلال آخر 90 يوماً، وهو أعلى من المتوسط التاريخي للمحفظة. أخيراً، 9% من القيمة موجودة في أصول لم يتم تصنيفها، لذلك فإن مستوى الثقة في هذا التحليل متوسط وليس مرتفعاً.

---

لاحظ:

* لا حكم.
* لا توصية.
* أدلة رقمية.
* إفصاح عن حدود البيانات.

---

# انتهت الوحدة الخامسة — Risk Intelligence

أصبح لدينا الآن:

✅ ست طبقات للمخاطر بما فيها Data Risk
✅ فصل التعرّض عن الحكم (Dependency ≠ Bad Asset)
✅ Risk Metrics قابلة للحساب
✅ Portfolio Risk Score بأوزان واضحة
✅ ستة Patterns مع تفسيراتها
✅ نموذج Severity مع قاعدة Severity ≠ Recommendation
✅ Risk Insight Object يتضمن `impact`
✅ قواعد تفسير صارمة (❌ / ✅)
✅ أربعة Analysis Modes
✅ قاعدة بيانات مقترحة + Tool Interface

---

## الجزء القادم

سننتقل إلى:

# Module 06 — Trading Intelligence

وهي الوحدة التي تحلل سلوك التداول نفسه.

سنصمم فيها:

* Trading Volume Analysis
* Win / Loss Behavior (بدون محرك ضرائب)
* Swap Patterns
* Trading Frequency
* Trading Style Detection
* Exchange Interaction
* Execution Behavior
* Trader Profile

ملاحظة مهمة:

هذه الوحدة **ليست Tax Engine**.

هي تحليل سلوك تداول، لا حساب التزامات ضريبية.
