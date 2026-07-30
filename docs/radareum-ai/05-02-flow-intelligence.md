# Radareum AI Design Specification

# PART 5 — Intelligence Framework

# Module 02 — Flow Intelligence

> **Normative (Module 02).** Flow Intelligence Engine — second chapter of the Radareum Intelligence Framework. Spec only; no runtime implementation required by this document alone.

> **Framework intro:** [`05-00-intelligence-framework.md`](./05-00-intelligence-framework.md) — 12 modules, unified Module Template (Goal / Questions / Metrics / Patterns / Insights / Evidence / Confidence / Output), **Reactive + Proactive** modes → `wallet_insights`. Living Spec — [`SPEC.md`](./SPEC.md). Prior module: [`05-01-performance-intelligence.md`](./05-01-performance-intelligence.md).

> **Cross-links:** Part 2 Portfolio Intelligence Engine ([`02-ai-architecture.md`](./02-ai-architecture.md) §2.18). Part 3 Cache / Backend Intelligence Engine ([`03-data-layer-tool-calling.md`](./03-data-layer-tool-calling.md) §3.11–§3.12). Part 4 Analysis Mode ([`04-core-system-prompt.md`](./04-core-system-prompt.md) §4.20).

> **Next:** Module 04 — Asset Intelligence (Module 03 Portfolio Intelligence recorded — [`05-03-portfolio-intelligence.md`](./05-03-portfolio-intelligence.md)).

---

# 5.15 Purpose

## الاسم

```text
Flow Intelligence Engine
```

---

## الهدف

فهم حركة رأس المال داخل وخارج المحفظة وتحويلها من مجرد أرقام:

```
Inflow
Outflow
Net Flow
```

إلى فهم مالي:

```
Where is capital coming from?

Where is capital going?

Why is capital moving?

Is behavior changing?

What does this mean?
```

---

# 5.16 Core Philosophy

التدفقات هي أحد أهم المؤشرات لفهم سلوك صاحب المحفظة.

لكن الخطأ الشائع هو تفسيرها بشكل مباشر.

مثلاً:

```
Outflow = $50,000
```

لا يعني بالضرورة:

"المستخدم يبيع."

قد يعني:

* نقل إلى محفظة باردة.
* إعادة توزيع.
* نقل إلى منصة تداول.
* دفع رسوم.
* تحويل داخلي.

لذلك:

```
Transaction Movement ≠ Financial Intent
```

Radareum لا يقرأ النوايا.

بل يحلل الأنماط.

---

# 5.17 Intelligence Questions

عند تحليل التدفقات، يجب أن يجيب المحرك عن:

---

## السؤال الأول

# Capital Direction

ما اتجاه رأس المال؟

هل المحفظة:

```
Accumulating

Distributing

Balanced

Inactive
```

---

## السؤال الثاني

# Capital Source

من أين يأتي رأس المال؟

مثلاً:

* محافظ خارجية.
* منصات تداول.
* عقود ذكية.
* Transfers داخلية.

---

## السؤال الثالث

# Capital Destination

إلى أين يذهب؟

مثلاً:

* Exchange.
* Wallet أخرى.
* Contract.
* Bridge.
* Unknown Address.

---

## السؤال الرابع

# Flow Impact

هل التدفقات تؤثر على الأداء؟

مثلاً:

ارتفاع قيمة المحفظة:

هل سببه:

```
+$20,000 Deposit

or

+$20,000 Asset Appreciation
```

الفرق جوهري.

---

## السؤال الخامس

# Behavioral Change

هل تغير سلوك رأس المال؟

مثلاً:

قبل شهر:

```
Mostly Holding
```

الآن:

```
Frequent Outflows
```

---

# 5.18 Required Data Sources

Flow Intelligence يعتمد على:

---

## Transactions

المصدر الأساسي:

```
transactions
```

يستخدم:

* Direction
* Amount
* Asset
* USD Value
* Timestamp
* Counterparty
* Network
* Type

---

## Counterparties

لفهم الوجهة.

مثلاً:

```
Unknown Address

↓

Known Exchange
```

---

## Asset Data

لتحويل التدفقات إلى قيمة مالية.

---

## Portfolio Snapshots

لربط التدفقات بتغير القيمة.

---

# 5.19 Core Metrics

---

# Total Inflow

إجمالي ما دخل.

```
SUM(incoming USD value)
```

---

# Total Outflow

إجمالي ما خرج.

```
SUM(outgoing USD value)
```

---

# Net Flow

المعادلة:

```
Net Flow = Inflow - Outflow
```

مثال:

```
Inflow:
$50,000

Outflow:
$30,000

Net Flow:
+$20,000
```

التفسير:

رأس المال الداخل أكبر من الخارج خلال الفترة.

---

# Flow Velocity

سرعة حركة رأس المال.

مثلاً:

محفظة لديها:

```
$100,000 Balance

$500,000 Volume
```

لديها نشاط مختلف عن:

```
$100,000 Balance

$5,000 Volume
```

---

# Flow Frequency

عدد مرات الحركة.

مثلاً:

```
3 transfers/month

vs

150 transfers/month
```

---

# Average Flow Size

متوسط حجم التحويل.

---

# Largest Flow Event

أكبر حركة مالية خلال الفترة.

---

# 5.20 Flow Classification Engine

كل حركة يجب تصنيفها.

---

## Inflow Types

### External Deposit

رأس مال جديد.

---

### Internal Transfer

تحويل من محفظة مرتبطة.

---

### Trading Return

نتيجة نشاط تداول.

---

### Protocol Reward

مثل:

* Staking.
* Farming.

---

## Outflow Types

### Exchange Transfer

إرسال لمنصة.

---

### External Wallet

تحويل لمحفظة أخرى.

---

### Contract Interaction

تفاعل مع عقد.

---

### Internal Movement

إعادة ترتيب.

---

# 5.21 Pattern Detection

هنا يبدأ الذكاء.

---

# Pattern 1

# Capital Accumulation

## الشروط

```
Positive Net Flow

+

Repeated Incoming Transfers

+

No equivalent Outflows
```

Insight:

```
Capital has been consistently entering the wallet during this period.
```

---

التفسير:

```
The increase in wallet value is partly supported by additional capital inflows.
```

---

# Pattern 2

# Distribution Pattern

## الشروط

```
Negative Net Flow

+

Repeated Outgoing Transfers
```

Insight:

```
Capital leaving the wallet increased during this period.
```

---

مهم:

لا نقول:

"User is selling"

لأننا لا نعرف.

---

# Pattern 3

# Growth Without Inflows

هذا مهم جداً.

الشروط:

```
Portfolio Value ↑

AND

Net Flow ≈ 0
```

Insight:

```
Portfolio growth appears primarily driven by asset appreciation rather than new capital.
```

---

# Pattern 4

# Large Capital Event

الشروط:

```
Single transfer > Historical Average × Threshold
```

Insight:

```
An unusually large capital movement was detected.
```

---

# Pattern 5

# Flow Behavior Change

الشروط:

مقارنة:

```
Previous Period

vs

Current Period
```

مثلاً:

قبل:

```
$2k average transfers
```

الآن:

```
$20k average transfers
```

Insight:

```
Capital movement behavior changed significantly.
```

---

# Pattern 6

# Dormant Wallet Activation

الشروط:

```
Long inactivity

↓

Sudden large activity
```

Insight:

```
Previously inactive wallet activity increased sharply.
```

---

# 5.22 Flow Intelligence Scores

أقترح إضافة Scores.

---

# Capital Activity Score

من:

0 - 100

يقيس:

```
Frequency

Volume

Recency
```

---

# Flow Stability Score

يقيس:

هل الحركة:

```
Stable

or

Erratic
```

---

# External Dependency Score

يقيس:

كم تعتمد المحفظة على الأموال الجديدة.

مثلاً:

إذا كان معظم النمو بسبب Deposits.

---

# 5.23 Flow Insight Object

يتم تخزينه:

```json
{
"type":
"capital_behavior_change",

"title":
"Outflow activity increased",

"description":
"Outgoing transfers increased compared with the previous period.",

"severity":
"medium",

"confidence":
"high",

"evidence":
{
"previous_outflow":"$12,000",
"current_outflow":"$48,000",
"change":"+300%"
},

"related_entities":
[
"Ethereum",
"Exchange"
],

"created_at":
"timestamp"
}
```

---

# 5.24 Interpretation Rules

هذه نقطة حساسة جداً.

---

## حالة:

```
Large Outflow Detected
```

الرد الخاطئ:

> يبدو أنك بعت.

---

الرد الصحيح:

> تم اكتشاف تحويل خارجي كبير بقيمة $50,000. الوجهة المصنفة هي منصة تداول، لكن البيانات المتاحة لا تحدد ما إذا كان هذا يمثل بيعاً أو مجرد نقل للأموال.

---

## حالة:

```
Large Inflow
```

لا نقول:

> قمت بالشراء.

بل:

> دخلت أصول بقيمة $30,000 إلى المحفظة.

---

# 5.25 Analysis Modes

---

# Mode 1

## Capital Overview

السؤال:

> What are my flows?

يعرض:

```
Inflow

Outflow

Net Flow

Main Sources

Main Destinations
```

---

# Mode 2

## Diagnostic

السؤال:

> Why did my balance increase?

يحلل:

```
Flows

Performance

Assets
```

---

# Mode 3

## Behavioral

السؤال:

> What does my activity show?

يحلل:

```
Frequency

Patterns

Changes
```

---

# Mode 4

## Risk

السؤال:

> Are there unusual movements?

يحلل:

```
Large Events

Unknown Counterparties

Sudden Changes
```

---

# 5.26 Response Template

أي تحليل تدفقات:

---

## Summary

مثال:

> خلال آخر 30 يوماً، كان صافي التدفق موجباً بقيمة $18,400، وكان السبب الرئيسي هو تحويلات واردة من محافظ خارجية.

---

## Flow Overview

```
Total Inflow

Total Outflow

Net Flow
```

---

## Main Movements

```
Largest Incoming

Largest Outgoing

Main Counterparties
```

---

## Interpretation

شرح معنى الحركة.

---

## Things To Watch

نقاط المتابعة.

---

# 5.27 Backend Intelligence Jobs

بعد كل Sync:

تشغيل:

```
calculate_flow_intelligence()
```

يقوم بـ:

1. تجميع التدفقات.
2. تصنيف الأطراف.
3. حساب Metrics.
4. مقارنة الفترات.
5. اكتشاف Patterns.
6. إنشاء Insights.

---

# 5.28 Database Design

---

## flow_metrics

```sql
id

wallet_id

period

total_inflow

total_outflow

net_flow

flow_count

average_flow

largest_flow

updated_at
```

---

## flow_insights

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

## flow_events

```sql
id

wallet_id

transaction_id

classification

amount_usd

counterparty

timestamp
```

---

# 5.29 Tool Interface

الـ LLM لا يستدعي الحسابات.

يستدعي:

```
get_flow_analysis
```

Response:

```json
{
summary,

metrics,

patterns,

insights,

major_events,

counterparties,

confidence
}
```

---

# 5.30 مثال كامل

المستخدم:

> لماذا زادت قيمة محفظتي هذا الشهر؟

الوكيل داخلياً:

```
Intent:
Performance Explanation

↓

Get Performance Analysis

↓

Get Flow Analysis

↓

Compare Growth vs Inflows

↓

Generate Explanation
```

النتيجة:

> ارتفعت قيمة المحفظة بنسبة 14% خلال الشهر. تشير البيانات إلى أن جزءاً من هذا النمو جاء من ارتفاع قيمة الأصول، بينما ساهمت تحويلات واردة بقيمة $8,000 في زيادة الرصيد. لذلك فإن النمو لم يكن ناتجاً بالكامل عن تغير الأسعار.

---

# انتهت الوحدة الثانية — Flow Intelligence

أصبح لدينا الآن:

✅ تحليل Inflow / Outflow
✅ فهم سلوك رأس المال
✅ فصل نمو المحفظة عن الإيداعات
✅ اكتشاف الحركات غير المعتادة
✅ تفسير التدفقات بدون افتراض النية
✅ Scores خاصة بالتدفقات
✅ قاعدة بيانات مقترحة
✅ Tool Interface

---

## Module 03 recorded — التالي Module 04

> **Status:** Module 03 (Portfolio Intelligence) **recorded** — [`05-03-portfolio-intelligence.md`](./05-03-portfolio-intelligence.md) · also in [`SPEC.md`](./SPEC.md).

التالي: **Module 04 — Asset Intelligence**.
