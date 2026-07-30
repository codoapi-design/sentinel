# Radareum AI Design Specification

# PART 5 — Intelligence Framework

# Module 09 — Alert Intelligence Engine

> **Normative (Module 09).** Alert Intelligence Engine — ninth chapter of the Radareum Intelligence Framework. Spec only; no runtime implementation required by this document alone.

> **Framework intro:** [`05-00-intelligence-framework.md`](./05-00-intelligence-framework.md) — 12 modules, unified Module Template (Goal / Questions / Metrics / Patterns / Insights / Evidence / Confidence / Output), **Reactive + Proactive** modes → `wallet_insights`. Living Spec — [`SPEC.md`](./SPEC.md). Prior modules: [`05-01-performance-intelligence.md`](./05-01-performance-intelligence.md) · [`05-02-flow-intelligence.md`](./05-02-flow-intelligence.md) · [`05-03-portfolio-intelligence.md`](./05-03-portfolio-intelligence.md) · [`05-04-asset-intelligence.md`](./05-04-asset-intelligence.md) · [`05-05-risk-intelligence.md`](./05-05-risk-intelligence.md) · [`05-06-trading-intelligence.md`](./05-06-trading-intelligence.md) · [`05-07-network-intelligence.md`](./05-07-network-intelligence.md) · [`05-08-counterparty-intelligence.md`](./05-08-counterparty-intelligence.md).

> **Cross-links:** Part 2 Portfolio Intelligence Engine ([`02-ai-architecture.md`](./02-ai-architecture.md) §2.18). Part 3 Cache / Backend Intelligence Engine → `wallet_insights` ([`03-data-layer-tool-calling.md`](./03-data-layer-tool-calling.md) §3.11–§3.12). Part 4 Tone / No-Recommendation / Confidence & Evidence ([`04-core-system-prompt.md`](./04-core-system-prompt.md) §4.20). **Alert sources:** Module 01 (Performance) · Module 02 (Flow) · Module 03 (Portfolio) · Module 04 (Asset) · Module 05 (Risk) · Module 06 (Trading) · Module 07 (Network) · Module 08 (Counterparty).

> **Next:** Module 10 — AI Agent Architecture & System Prompt.

---

# 5.134 Purpose

## الاسم

```text
Alert Intelligence Engine
```

---

## الهدف

تحويل أحداث المحفظة الخام إلى **تنبيهات ذكية**.

```
Raw Wallet Events

↓

Smart Alerts
```

كل تنبيه يجب أن يحمل:

```
Importance

Context

Cause

Interpretation

Priority
```

---

## المشكلة

معظم المنتجات ترسل هذا:

```
+$5,000 ETH
```

هذا ليس تنبيهاً.

هذا **سجل حركة**.

---

## الفرق

❌ الخام:

> +$5,000 ETH

✅ الذكي:

> تم استلام 5,000$ من ETH من محفظة مرتبطة بمنصة تداول. هذا المبلغ يعادل 12% من قيمة محفظتك، وهو أكبر تحويل وارد خلال آخر 90 يوماً.

---

الأول يخبرك **ماذا حدث**.

الثاني يخبرك **لماذا يهم**.

---

## ما ليس هذا المحرك

هذا المحرك **ليس نظام إشعارات**.

ولا **نظام تحذير من السوق**.

ولا يقدم أي تعليمات استثمارية.

```
Alert = Explained Event

Alert ≠ Advice
```

---

# 5.135 Core Philosophy

التنبيه الجيد يجيب عن **خمسة أسئلة**.

---

## السؤال الأول

```
What happened?
```

وصف الحدث بدقة.

---

## السؤال الثاني

```
Why does it matter?
```

الأثر على المحفظة.

---

## السؤال الثالث

```
Is it unusual?
```

مقارنة الحدث بالسلوك التاريخي للمحفظة.

---

## السؤال الرابع

```
What changed?
```

الحالة قبل الحدث مقابل الحالة بعده.

---

## السؤال الخامس

```
What should I monitor?
```

نقاط متابعة — **وليست** توصيات.

---

## القاعدة الحاكمة

```
Five answers.

Zero instructions.
```

التنبيه لا يقول:

> بِع الآن.

ولا:

> هذه فرصة شراء.

انظر Part 4 (§4.20) — Tone / No-Recommendation / Evidence.

---

# 5.136 Alert Architecture

التنبيهات ليست مستوى واحداً.

المحرك يعمل عبر **خمس طبقات**.

---

# Layer 1

# Transaction Alerts

أحداث على مستوى العملية الواحدة.

```
Incoming Transfer

Outgoing Transfer

Swap

Contract Interaction
```

المصدر: Module 02 (Flow) + Module 08 (Counterparty).

---

# Layer 2

# Behavior Alerts

تغيّر في نمط استخدام المحفظة.

```
Activity Spike

Dormancy Break

Pattern Shift
```

المصدر: Module 02 (Flow) + Module 06 (Trading).

---

# Layer 3

# Portfolio Alerts

تغيّر في بنية المحفظة نفسها.

```
Allocation Shift

Concentration Change

Value Milestone
```

المصدر: Module 03 (Portfolio) + Module 01 (Performance).

---

# Layer 4

# Risk Alerts

تغيّر في مستوى التعرّض.

```
Risk Score Increase

Unknown Exposure Increase

Unclassified Counterparty
```

المصدر: Module 05 (Risk) + Module 07 (Network).

---

# Layer 5

# Intelligence Reports

ليست حدثاً، بل **تجميع دوري**.

```
Daily Brief

Weekly Report

Monthly Report
```

المصدر: كل الوحدات مجتمعة.

---

## ملاحظة معمارية

```
Layers 1-4 = Event-driven

Layer 5 = Schedule-driven
```

---

# 5.137 Alert Intelligence Pipeline

```text
Blockchain Event
      ↓
Normalization
      ↓
Context Enrichment
      ↓
Importance Scoring
      ↓
AI Interpretation
      ↓
Delivery
```

---

## المرحلة 1 — Normalization

تحويل الحدث الخام إلى شكل موحّد بغض النظر عن الشبكة.

مثال الحدث الخام:

```json
{
"hash":
"0x8f2a...",

"from":
"0x3d9c...",

"to":
"0x71ab...",

"asset":
"ETH",

"amount":
2.4,

"value_usd":
5000,

"timestamp":
"2026-07-27T10:14:00Z",

"network":
"ethereum"
}
```

هذا كل ما تعرفه السلسلة.

ولا يكفي لبناء تنبيه.

---

## المرحلة 2 — Context Enrichment

هنا تُضاف مخرجات الوحدات 01–08.

مثال الحدث بعد الإثراء:

```json
{
"event_type":
"incoming_transfer",

"asset":
"ETH",

"amount":
2.4,

"value_usd":
5000,

"portfolio_context":
{
"portfolio_value_before": 36400,
"portfolio_value_after": 41400,
"percent_of_portfolio": "12%",
"asset_share_before": "54%",
"asset_share_after": "61%"
},

"historical_context":
{
"avg_incoming_30d": 780,
"largest_incoming_90d": 3200,
"size_vs_average": "6.4x",
"rank_in_90d": 1
},

"counterparty_context":
{
"address": "0x3d9c...",
"type": "exchange",
"label": "known_exchange",
"known_to_wallet": true,
"first_seen": "2025-11-02"
},

"behavior_context":
{
"activity_baseline": "low",
"days_since_last_inbound": 21
},

"risk_context":
{
"risk_score_before": 58,
"risk_score_after": 63,
"unknown_exposure": "0%"
},

"importance_score": 78,

"confidence": "high"
}
```

---

## المرحلة 3 — Importance Scoring

حساب درجة الأهمية (§5.138).

---

## المرحلة 4 — AI Interpretation

الـ LLM **لا يحسب** ولا يقرر الأهمية.

يستقبل الكائن المُثرى ويصيغ نصاً بشرياً (§5.142).

---

## المرحلة 5 — Delivery

تسليم عبر القنوات المفعّلة فقط (§5.141).

---

## القاعدة

```
Enrichment before Scoring.

Scoring before Interpretation.

Interpretation before Delivery.
```

لا يمكن قلب هذا الترتيب.

---

# 5.138 Alert Importance Score

---

## المدى

```
0 - 100
```

---

## الأوزان

| Component | Weight |
|-----------|--------|
| Financial Impact | 40 |
| Behavioral Change | 25 |
| Risk Impact | 20 |
| User Relevance | 15 |

المجموع:

```
100
```

---

## Financial Impact — 40

ليس المبلغ المطلق.

بل **المبلغ نسبةً إلى المحفظة**.

---

### مثال حاسم

نفس المبلغ، أهمية مختلفة تماماً:

```
Portfolio = $500

$100 = 20% of portfolio

→ Important
```

```
Portfolio = $500,000

$100 = 0.02% of portfolio

→ Noise
```

---

القاعدة:

```
Amount alone is meaningless.

Amount ÷ Portfolio = Meaning
```

---

## Behavioral Change — 25

هل يختلف الحدث عن سلوك المحفظة المعتاد؟

```
Event Size vs Historical Average

Activity vs Baseline

Dormancy Break
```

تحويل بحجم 6.4× المتوسط يحصل على درجة أعلى من تحويل معتاد بنفس القيمة.

---

## Risk Impact — 20

هل غيّر الحدث مستوى التعرّض؟

```
Risk Score Delta

Concentration Delta

Unknown Exposure Delta
```

المصدر: Module 05.

---

## User Relevance — 15

هل يطابق الحدث ما طلب المستخدم متابعته؟

```
User Thresholds

Watched Assets

Alert Mode
```

المصدر: `alert_preferences` (§5.141).

---

## مثال محسوب

```json
{
"importance_score": 78,

"components": {
"financial_impact": 34,
"behavioral_change": 22,
"risk_impact": 12,
"user_relevance": 10
},

"confidence": "high"
}
```

---

## تحذير تفسيري

```
High Score ≠ Bad Event
```

الدرجة تصف **مدى استحقاق الحدث للانتباه**.

لا تصف جودة الحدث ولا صحة القرار.

---

# 5.139 Alert Categories

سبع فئات.

كل فئة لها شروط واضحة ونص تفسيري.

---

# Category 1

# Large Movement

## الشروط

```
value_usd > user_threshold

OR

value_usd > 5% of portfolio value

OR

value_usd > 3 × avg_transfer_30d
```

---

## المصدر

Module 02 (Flow) + Module 03 (Portfolio).

---

## مثال الرسالة

> تم استلام 2.4 ETH بقيمة 5,000$ من محفظة مرتبطة بمنصة تداول. يعادل هذا المبلغ 12% من قيمة محفظتك، وهو أكبر تحويل وارد خلال آخر 90 يوماً.

---

# Category 2

# New Counterparty

## الشروط

```
counterparty.first_seen = now

AND

value_usd > minimum_threshold
```

---

## المصدر

Module 08 (Counterparty).

---

## مثال الرسالة

> تم إرسال 1,200$ إلى عنوان لم تتعامل معه محفظتك من قبل. لم يتم تصنيف هذا العنوان ضمن البيانات المتاحة، لذلك تم عرضه كعنوان جديد وليس كعنوان مشبوه.

---

## ملاحظة إلزامية

```
Unknown ≠ Malicious
```

عدم التصنيف ليس اتهاماً.

---

# Category 3

# Portfolio Allocation Change

## الشروط

```
Top 1 Asset share change > 5 points

OR

Stable Assets share change > 10 points

(over the comparison window)
```

---

## المصدر

Module 03 (Portfolio) + Module 04 (Asset).

---

## مثال الرسالة

> ارتفعت حصة ETH في المحفظة من 54% إلى 61% خلال الأسبوع الماضي. هذا يعني أن قيمة المحفظة أصبحت أكثر ارتباطاً بحركة أصل واحد مقارنة بالفترة السابقة.

---

# Category 4

# Risk Increase

## الشروط

```
Risk Score (current) - Risk Score (previous) > 10

AND

Sustained over 2+ snapshots
```

---

## المصدر

Module 05 (Risk).

---

## مثال الرسالة

> ارتفع مستوى تعرّض المحفظة من 58 إلى 72 خلال آخر أسبوعين. العامل الأكبر في هذا التغيّر هو ارتفاع نسبة التركّز في أعلى ثلاثة أصول من 78% إلى 91%.

---

## ملاحظة

المقياس يصف **حجم التعرّض** لا صحة القرار (Module 05 §5.71).

---

# Category 5

# Trading Activity Spike

## الشروط

```
Transaction Count (7d) > Baseline × 3

OR

Swap Volume (7d) > Baseline × 3
```

---

## المصدر

Module 06 (Trading) + Module 02 (Flow).

---

## مثال الرسالة

> بلغ عدد العمليات هذا الأسبوع 34 عملية مقابل متوسط 6 عمليات أسبوعياً خلال آخر 90 يوماً. هذا تغيّر واضح في نمط النشاط مقارنة بالسلوك المعتاد للمحفظة.

---

## ملاحظة

لا نفترض السبب.

لا نقول «المستخدم يخرج من السوق».

---

# Category 6

# Dormant Wallet Activation

## الشروط

```
days_since_last_activity > 60

AND

new transaction detected
```

---

## المصدر

Module 02 (Flow).

---

## مثال الرسالة

> سجّلت محفظتك أول عملية منذ 94 يوماً. تم إرسال 0.8 ETH بقيمة 1,650$ إلى عنوان سبق التعامل معه في مارس.

---

# Category 7

# Gas Cost

## الشروط

```
daily_gas_usd > user_threshold

OR

gas_cost > 3% of transferred value
```

---

## المصدر

Module 07 (Network).

---

## مثال الرسالة

> بلغت رسوم الغاز اليوم 62$ عبر 9 عمليات على شبكة Ethereum، وهو ما يعادل 3.4% من إجمالي القيمة المحوّلة. متوسط الرسوم اليومي خلال الشهر الماضي كان 18$.

---

# 5.140 Smart Filtering Rules

هذه أهم نقطة في الوحدة.

---

## القاعدة الأساسية

```
Not every event is an alert.
```

المحفظة قد تسجّل عشرات الأحداث يومياً.

إرسالها كلها = ضجيج.

والضجيج يقتل قيمة التنبيه.

---

## الدالة

```text
ShouldNotify(event, user) → boolean
```

---

## المنطق

```text
ShouldNotify(event, user):

    if not user.channel_connected:
        return false

    if event.category not in user.enabled_categories:
        return false

    if event.importance_score < user.min_importance:
        return false

    if event.value_usd < user.threshold(event.category):
        return false

    if frequency(event.type, last_24h) > user.max_per_day:
        return "batch"          # تُجمَّع في الملخص الدوري

    if event.asset in user.muted_assets:
        return false

    if in_quiet_hours(user) and event.severity < "high":
        return "defer"

    return true
```

---

## القرار يعتمد على أربعة عوامل

---

### 1. Portfolio Size

```
$100 on a $500 portfolio    → notify

$100 on a $500,000 portfolio → ignore
```

---

### 2. User History

محفظة تستقبل تحويلات بحجم 5,000$ أسبوعياً لا تحتاج تنبيهاً عند كل 5,000$.

```
Routine ≠ Notable
```

---

### 3. Event Frequency

```
1 swap today       → alert

40 swaps today     → one batched summary
```

التكرار يخفض قيمة التنبيه الفردي ويرفع قيمة الملخص.

---

### 4. Asset Type

```
Stablecoin transfer → lower weight

Volatile asset      → higher weight

Unknown asset       → flagged, lower confidence
```

---

## المخرجات الثلاثة

```
true   → إرسال فوري

"batch" → تجميع في Daily Brief

"defer" → تأجيل خارج ساعات الهدوء

false  → تسجيل في السجل بدون إرسال
```

---

## ملاحظة مهمة

الحدث الذي لم يُرسل **لا يُحذف**.

يُخزَّن في `alerts` بحالة غير مُسلَّمة، ويبقى متاحاً عند السؤال المباشر.

---

# 5.141 User Alert Preferences

---

## الكائن

```json
{
"user_id":
"uuid",

"mode":
"investor",

"min_importance":
50,

"channels":
{
"telegram": { "connected": false, "enabled": false },
"email": { "connected": true, "enabled": true },
"in_app": { "enabled": true }
},

"categories":
{
"large_movement": true,
"new_counterparty": true,
"allocation_change": true,
"risk_increase": true,
"activity_spike": false,
"dormant_activation": true,
"gas_cost": false
},

"thresholds":
{
"inbound_usd": 1000,
"outbound_usd": 500,
"portfolio_value_usd": 80000,
"asset_move_percent": 5,
"gas_daily_usd": 50
},

"quiet_hours":
{ "enabled": true, "from": "23:00", "to": "08:00" },

"max_per_day":
10,

"muted_assets":
[],

"updated_at":
"timestamp"
}
```

---

## قاعدة القناة

```
Channel not connected → all category toggles inactive
```

لا يمكن تفعيل أي فئة قبل ربط القناة.

هذه القاعدة **موجودة فعلياً في واجهة الإعدادات المُنفَّذة** (§5.141.1).

---

# الأوضاع الثلاثة

---

## Investor Mode

للمستخدم الذي يحتفظ طويل المدى.

```
min_importance: 65

Focus:
Allocation Change
Risk Increase
Large Movement
Weekly / Monthly Reports

Muted:
Activity Spike
Gas Cost
```

تنبيهات أقل، وأعلى قيمة.

---

## Trader Mode

للمستخدم النشط.

```
min_importance: 35

Focus:
Large Movement
Activity Spike
Gas Cost
Daily Brief

Enabled:
Higher max_per_day
```

تنبيهات أكثر، وأسرع.

---

## Security Mode

للمستخدم الذي يراقب سلامة المحفظة.

```
min_importance: 25

Focus:
New Counterparty
Outgoing Transfers
Dormant Activation
Risk Increase

Priority:
Any unexpected outbound movement
```

---

## ملاحظة حاكمة

```
Security Mode ≠ Fraud Detection
```

الوضع يرفع حساسية الرصد.

ولا يصدر اتهامات.

---

# 5.141.1 Mapping to the Shipped Settings UI

التطبيق يحتوي بالفعل على واجهتي **Telegram Alerts** و **Email Alerts** داخل تبويب Settings.

هذه الوحدة **لا تستبدلها** ولا تناقضها.

بل تصف الطبقة الذكية التي تعمل **خلف** المفاتيح الموجودة.

---

## القاعدة المشتركة

الواجهة المُنفَّذة تُبقي كل مفاتيح التنبيهات **معطّلة حتى تُربط القناة**:

```text
alertsActive = isConnected

disabled = !alertsActive
```

وهذا مطابق تماماً لقاعدة القناة في §5.141.

---

## الخريطة

| Module 09 Category | Telegram toggle | Email toggle |
|--------------------|-----------------|--------------|
| Large Movement (وارد) | `inboundAbove` | `inboundAbove` |
| Large Movement (صادر) | `outboundAbove` | `outboundAbove` |
| Large Movement (فوري، أي اتجاه) | — | `largeTransaction` |
| Portfolio Allocation Change | `portfolioReaches` | `portfolioReaches` |
| Asset Move (ارتفاع) | `assetRises` | `assetRises` |
| Asset Move (انخفاض) | `assetDrops` | `assetDrops` |
| Gas Cost | `gasExceeds` | `gasExceeds` |
| Daily Brief (§5.145) | `dailySummary` | `dailySummary` |
| Weekly Intelligence Report (§5.146) | `weeklyReport` | `weeklyReport` |
| Monthly Report (§5.148) | — | `monthlyReport` |

---

## الفئات بلا مفتاح مباشر اليوم

ثلاث فئات في هذه الوحدة ليس لها مفتاح مستقل في الواجهة الحالية:

```
New Counterparty

Risk Increase

Trading Activity Spike

Dormant Wallet Activation
```

---

## القرار التصميمي

هذه الفئات **لا تتطلب مفاتيح جديدة الآن**.

حتى تُضاف مفاتيح مخصصة، تُسلَّم كجزء من:

```
Daily Brief

Weekly Intelligence Report

In-app Alerts List
```

بهذا يبقى التصميم متوافقاً مع الإعدادات المشحونة، وقابلاً للتوسع لاحقاً بإضافة مفاتيح دون كسر البنية.

---

## ملاحظة تنفيذية

`portfolioReaches` في الواجهة الحالية عتبة **قيمة إجمالية**.

بينما Category 3 في هذه الوحدة تصف **تغيّر التوزيع**.

الاثنان يتشاركان نفس المفتاح مؤقتاً؛ ويُفصلان عند إضافة مفتاح Allocation مستقل.

---

# 5.142 AI Alert Generation

القالب وحده **لا يكفي**.

```
Template → same sentence every time

AI → context-aware sentence
```

---

## دور الـ AI

الـ AI لا يقرر:

```
Importance

Severity

Delivery
```

كلها محسوبة في الـ Backend.

الـ AI يقوم بـ:

```
Turn enriched data into a human sentence.
```

---

## Input

```json
{
"event_type":
"incoming_transfer",

"asset":
"ETH",

"amount":
2.4,

"value_usd":
5000,

"percent_of_portfolio":
"12%",

"counterparty_type":
"exchange",

"counterparty_known":
true,

"size_vs_average":
"6.4x",

"rank_in_90d":
1,

"asset_share_before":
"54%",

"asset_share_after":
"61%",

"importance_score":
78,

"severity":
"medium",

"confidence":
"high"
}
```

---

## Output

```json
{
"title":
"تحويل وارد كبير بقيمة 5,000$",

"message":
"تم استلام 2.4 ETH بقيمة 5,000$ من محفظة مرتبطة بمنصة تداول سبق التعامل معها. يعادل هذا المبلغ 12% من قيمة محفظتك، وهو أكبر تحويل وارد خلال آخر 90 يوماً وبحجم 6.4 أضعاف المتوسط المعتاد. نتيجة لذلك ارتفعت حصة ETH في المحفظة من 54% إلى 61%.",

"monitoring_points":
[
"حصة ETH من إجمالي المحفظة",
"تكرار التحويلات الواردة من نفس المصدر"
],

"severity":
"medium",

"confidence":
"high"
}
```

---

## لاحظ

* وصف دقيق للحدث.
* أرقام كأدلة.
* مقارنة بالسلوك التاريخي.
* أثر على البنية.
* نقاط متابعة بلا توصية.

---

## القاعدة

```
AI writes the explanation.

Backend owns the decision.
```

---

# 5.143 Severity Levels

خمس درجات.

---

## Informational

حدث معتاد يُسجَّل للعلم.

```
Routine transfer within normal range
```

عادةً لا يُرسل فوراً؛ يدخل الملخص الدوري.

---

## Low

حدث ملحوظ بأثر محدود.

```
Small allocation shift
```

---

## Medium

حدث ذو أثر واضح على البنية أو السلوك.

```
Large inbound = 12% of portfolio
```

---

## High

تغيّر كبير في التعرّض أو خروج واضح عن النمط.

```
Risk Score +14

or

Dormancy break with large outbound
```

---

## Critical

يُحجز لحالات نادرة جداً ومحددة مسبقاً.

```
Very large outbound to a first-seen address

+

Value share above the critical threshold
```

---

## قاعدة اللغة — إلزامية

```
Never use "خطر" / "danger" without a stated reason.
```

❌ الخطأ:

> تنبيه خطر على محفظتك.

✅ الصحيح:

> تم إرسال 18,400$ (41% من قيمة المحفظة) إلى عنوان لم يسبق التعامل معه.

---

الفرق:

الأول يخوّف بلا معلومة.

الثاني يذكر السبب والدليل، ويترك التقييم للمستخدم.

---

## القاعدة العامة

```
Severity ≠ Recommendation

Severity = Attention Level
```

`critical` لا تعني «افعل شيئاً الآن».

تعني «هذا الحدث يستحق النظر فوراً».

---

# 5.144 Telegram Agent Behavior

---

## الخطأ الشائع

المستخدم يسأل:

> ماذا حدث في محفظتي؟

والمنتجات العادية ترد بـ:

```
Last 100 transactions
```

---

## القاعدة

```
Never dump the last 100 transactions.
```

قائمة العمليات ليست إجابة.

هي نقل للمشكلة إلى المستخدم.

---

## البديل

```
Daily Intelligence Summary
```

الوكيل يقرأ مخرجات الوحدات، ويجيب بملخص مفسَّر.

---

## المصدر

الوكيل لا يعيد الحساب.

يقرأ:

```
alerts (اليوم)

wallet_insights

Modules 01-08 outputs
```

---

## مثال الرد

المستخدم:

> ماذا حدث في محفظتي اليوم؟

الرد:

> اليوم سجّلت محفظتك 3 عمليات بقيمة إجمالية 6,200$.
>
> الحدث الأبرز كان استلام 2.4 ETH بقيمة 5,000$ من محفظة مرتبطة بمنصة تداول، وهو أكبر تحويل وارد خلال 90 يوماً.
>
> نتيجة لذلك ارتفعت قيمة المحفظة من 36,400$ إلى 41,400$، وارتفعت حصة ETH من 54% إلى 61%.
>
> العمليتان الأخريان كانتا ضمن النطاق المعتاد للمحفظة.
>
> نقاط للمتابعة: حصة ETH من إجمالي المحفظة، ومستوى التركّز في أعلى ثلاثة أصول.

---

## لاحظ

* لا قائمة عمليات.
* رقم إجمالي أولاً.
* الحدث الأهم فقط.
* الأثر على البنية.
* نقاط متابعة بلا نصيحة.

---

## قاعدة الطول

```
Telegram = Short + Structured

In-app = Longer + Detailed
```

انظر Part 4 — قواعد الصياغة حسب القناة.

---

# 5.145 Proactive Telegram Messages

الوكيل لا ينتظر السؤال دائماً.

---

## Radareum Daily Brief

الشكل المعتمد:

```text
🛡 Radareum Daily Brief

Portfolio
$41,400  (+13.7% اليوم)

Activity
3 عمليات · 6,200$

Top Event
تحويل وارد 5,000$ (12% من المحفظة)
أكبر تحويل وارد خلال 90 يوماً

Structure
ETH: 54% → 61%
Top 3: 88% → 91%

Risk
Exposure: 58 → 63

Watch
حصة ETH · مستوى التركّز

Confidence: High
```

---

## القواعد

```
One message per day maximum

Only if there is something to report

Respect quiet_hours

Requires dailySummary toggle enabled
```

---

## في حال عدم وجود نشاط

لا تُرسل رسالة فارغة.

```
No activity → No brief
```

إلا إذا كان هناك تغيّر بنيوي (سعري) يستحق الذكر.

---

# 5.146 Weekly Intelligence Report

تقرير أعمق، خمسة أقسام.

---

## القسم 1 — Portfolio

```
Value (start → end)

Change %

Top Assets

Allocation Shift
```

المصدر: Module 01 + Module 03.

---

## القسم 2 — Activity

```
Transaction Count

vs Baseline

Trading Volume

Most Active Day
```

المصدر: Module 02 + Module 06.

---

## القسم 3 — Flows

```
Total Inbound

Total Outbound

Net Flow

Top Counterparties
```

المصدر: Module 02 + Module 08.

---

## القسم 4 — Risks

```
Risk Score (start → end)

Main Risk Factor

Concentration

Unknown Exposure

Data Confidence
```

المصدر: Module 05.

---

## القسم 5 — Insights

```
3-5 Insights maximum

Each with evidence

Monitoring points

No recommendations
```

المصدر: `wallet_insights`.

---

## قاعدة الحجم

```
Weekly Report ≠ Data Dump
```

التقرير الجيد يحذف أكثر مما يعرض.

---

# 5.147 Database Design

---

## alerts

```sql
id

wallet_id

user_id

category

event_type

severity

importance_score

importance_components_json

title

message

evidence_json

context_json

monitoring_points_json

confidence

status

delivered_channels

created_at

read_at
```

`status`:

```
pending | delivered | batched | deferred | suppressed | read | dismissed
```

---

## alert_preferences

```sql
id

user_id

mode

min_importance

channels_json

categories_json

thresholds_json

quiet_hours_json

max_per_day

muted_assets_json

updated_at
```

---

## alert_history

```sql
id

alert_id

user_id

channel

delivered_at

opened

opened_at

action
```

`alert_history` هو ما يسمح بقياس **جودة التنبيهات** لاحقاً:

```
Delivered vs Opened

Category vs Dismiss Rate
```

وضبط `min_importance` بناءً على سلوك فعلي لا تخمين.

---

# 5.148 Backend Intelligence Jobs

---

## generate_wallet_alerts()

يعمل بعد كل Sync.

خمس خطوات:

```
1. Detect Events
2. Enrich Context
3. Score Importance
4. Apply Filters
5. Generate & Store Alerts
```

---

### 1. Detect Events

استخراج الأحداث الجديدة منذ آخر تشغيل عبر الطبقات 1–4.

---

### 2. Enrich Context

ضم مخرجات Modules 01–08 إلى كل حدث (§5.137).

---

### 3. Score Importance

حساب `importance_score` ومكوناته (§5.138).

---

### 4. Apply Filters

تشغيل `ShouldNotify()` لكل حدث (§5.140).

---

### 5. Generate & Store Alerts

صياغة النص عبر AI Interpretation، ثم الكتابة في `alerts`.

---

النتائج تُكتب أيضاً إلى `wallet_insights` (Proactive Mode — Part 3 §3.12).

---

## Daily Intelligence Job

يعمل بالجدولة لا بالحدث.

---

### Daily

```
Aggregate today's alerts

Build Daily Brief (§5.145)

Deliver to enabled channels
```

---

### Weekly

```
Aggregate 7 days

Build Weekly Intelligence Report (§5.146)

Deliver
```

---

### Monthly

```
Aggregate 30 days

Portfolio evolution + Flows + Risk trend

Deliver (Email only today — monthlyReport)
```

---

## قاعدة التسليم

```
Job builds the report.

Preferences decide the delivery.
```

الوظيفة لا تتجاوز إعدادات المستخدم ولا حالة ربط القناة.

---

# 5.149 Tool Interface

الـ LLM لا يولّد التنبيهات ولا يحسب الأهمية.

يستدعي أداتين.

---

## get_wallet_alerts

للاستعلام عن التنبيهات المخزّنة.

Parameters:

```
wallet_id

period

category (optional)

min_severity (optional)

status (optional)
```

Response:

```json
{
alerts:
[
{
category,
event_type,
severity,
importance_score,
title,
message,
evidence,
monitoring_points,
confidence,
created_at
}
],

summary:
{
total_alerts,
by_severity,
by_category,
top_event
},

period,

confidence
}
```

---

## generate_intelligence_report

لبناء التقارير الدورية.

Parameters:

```
wallet_id

report_type: daily | weekly | monthly
```

Response:

```json
{
report_type,

period,

portfolio:
{
value_start,
value_end,
change_percent,
top_assets,
allocation_shift
},

activity:
{
transaction_count,
vs_baseline,
trading_volume,
most_active_day
},

flows:
{
inbound,
outbound,
net_flow,
top_counterparties
},

risks:
{
risk_score_start,
risk_score_end,
main_factor,
concentration,
unknown_exposure,
data_confidence
},

insights:
[
{ title, description, evidence, severity, confidence }
],

monitoring_points,

confidence
}
```

---

## القاعدة

```
Tools return structured intelligence.

The LLM only explains it.
```

---

# 5.150 مثال كامل

القناة: Telegram.

المستخدم:

> هل حدث شيء مهم اليوم؟

---

## الوكيل داخلياً

```
Intent:
Daily Event Check

↓

get_wallet_alerts(period = today)

↓

Read: top_event + summary

↓

Rank by importance_score

↓

Compose short structured answer

↓

No recommendation
```

---

## البيانات المسترجعة

```json
{
"summary": {
"total_alerts": 2,
"by_severity": { "medium": 1, "informational": 1 },
"top_event": "large_inbound_transfer"
},

"top_alert": {
"category": "large_movement",
"severity": "medium",
"importance_score": 78,
"value_usd": 5000,
"percent_of_portfolio": "12%",
"rank_in_90d": 1,
"asset_share_before": "54%",
"asset_share_after": "61%"
},

"confidence": "high"
}
```

---

## الرد

> نعم، حدث واحد يستحق الانتباه اليوم.
>
> تم استلام 2.4 ETH بقيمة 5,000$ من محفظة مرتبطة بمنصة تداول سبق التعامل معها. يعادل هذا المبلغ 12% من قيمة محفظتك، وهو أكبر تحويل وارد خلال آخر 90 يوماً وبحجم يقارب 6 أضعاف المتوسط المعتاد.
>
> أثر ذلك على البنية: ارتفعت قيمة المحفظة إلى 41,400$، وارتفعت حصة ETH من 54% إلى 61%، أي أن ارتباط المحفظة بحركة أصل واحد أصبح أعلى مما كان.
>
> بقية نشاط اليوم كان ضمن النطاق المعتاد ولا يستدعي الانتباه.
>
> نقاط للمتابعة: حصة ETH من إجمالي المحفظة، ومستوى التركّز في أعلى ثلاثة أصول.
>
> مستوى الثقة في هذه القراءة مرتفع.

---

## لاحظ

* إجابة مباشرة عن السؤال.
* حدث واحد فقط، لا قائمة.
* أدلة رقمية.
* الأثر على البنية.
* نقاط متابعة.
* لا توصية ولا حكم.
* إفصاح عن الثقة.

---

# انتهت الوحدة التاسعة — Alert Intelligence

أصبح لدينا الآن:

✅ تحويل الأحداث الخام إلى تنبيهات مفسَّرة (Raw ≠ Alert)
✅ خمسة أسئلة يجيب عنها كل تنبيه بلا تعليمات استثمارية
✅ خمس طبقات للتنبيهات (Transaction / Behavior / Portfolio / Risk / Reports)
✅ Alert Intelligence Pipeline مع نموذج Enrichment كامل
✅ Alert Importance Score بأوزان محددة ونسبية للمحفظة
✅ سبع فئات بشروط واضحة ونصوص عربية
✅ `ShouldNotify()` — قواعد الفلترة الذكية ومنع الضجيج
✅ `alert_preferences` + ثلاثة أوضاع (Investor / Trader / Security)
✅ خريطة توافق مع واجهة Telegram / Email المُنفَّذة
✅ خمس درجات Severity + قاعدة منع لغة التخويف
✅ سلوك Telegram (ملخص مفسَّر لا قائمة عمليات) + Daily Brief + Weekly Report
✅ قاعدة بيانات مقترحة + Backend Jobs + Tool Interface

---

## الجزء القادم

سننتقل إلى:

# Module 10 — AI Agent Architecture & System Prompt

وهي الوحدة التي تجمع كل ما سبق في وكيل واحد.

سنصمم فيها:

* Final System Prompt
* Agent Personality
* Agent Rules
* Reasoning Framework
* Tool Calling Strategy
* Data Access Rules
* In-App vs Telegram Answering
* Hallucination Prevention
* Tool Selection Logic

ملاحظة مهمة:

هذه الوحدة **توحّد** Parts 1–4 مع كل وحدات Part 5 في مواصفة تشغيل واحدة للوكيل.

وتبقى **مواصفة**؛ لا تنفيذ Prompt داخل التطبيق في هذه المرحلة.
