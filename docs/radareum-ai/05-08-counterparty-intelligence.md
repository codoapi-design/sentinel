# Radareum AI Design Specification

# PART 5 — Intelligence Framework

# Module 08 — Counterparty Intelligence

> **Normative (Module 08).** Counterparty Intelligence Engine — eighth chapter of the Radareum Intelligence Framework. Spec only; no runtime implementation required by this document alone.

> **Framework intro:** [`05-00-intelligence-framework.md`](./05-00-intelligence-framework.md) — 12 modules, unified Module Template (Goal / Questions / Metrics / Patterns / Insights / Evidence / Confidence / Output), **Reactive + Proactive** modes → `wallet_insights`. Living Spec — [`SPEC.md`](./SPEC.md). Prior modules: [`05-01-performance-intelligence.md`](./05-01-performance-intelligence.md) · [`05-02-flow-intelligence.md`](./05-02-flow-intelligence.md) · [`05-03-portfolio-intelligence.md`](./05-03-portfolio-intelligence.md) · [`05-04-asset-intelligence.md`](./05-04-asset-intelligence.md) · [`05-05-risk-intelligence.md`](./05-05-risk-intelligence.md) · [`05-06-trading-intelligence.md`](./05-06-trading-intelligence.md) · [`05-07-network-intelligence.md`](./05-07-network-intelligence.md).

> **Cross-links:** Part 2 Portfolio Intelligence Engine ([`02-ai-architecture.md`](./02-ai-architecture.md) §2.18). Part 3 Cache / Backend Intelligence Engine ([`03-data-layer-tool-calling.md`](./03-data-layer-tool-calling.md) §3.11–§3.12). Part 4 Analysis Modes / Confidence / Evidence / No-Recommendation rules ([`04-core-system-prompt.md`](./04-core-system-prompt.md) §4.20). Module 02 (Flow) → مصادر ووجهات الأموال. Module 05 (Risk) → Unknown Exposure و Behavioral Risk. Module 07 (Network) → **أين** تحدث هذه التعاملات.

> **App convention:** أسماء العملاء المخصّصة (Custom Client Names) لها الأولوية على العناوين الخام في كل عرض — راجع `resolveCounterpartyDisplay` في `src/lib/clients/display.ts` (الترتيب: Custom Client Name → Counterparty Label → Truncated Address).

> **Next:** Module 09 — Alert Intelligence Engine.

---

# 5.116 Purpose

## الاسم

```text
Counterparty Intelligence Engine
```

---

## الهدف

تحويل سجل التحويلات:

```
Transfers Log
```

إلى:

```
Understandable Financial Relationship Network
```

أي أن المحفظة لا تُقرأ كقائمة عمليات، بل كشبكة علاقات مالية لها أطراف متكررة، وأوزان، وتاريخ.

---

## الأسئلة التي يجيب عنها

```
Who does this wallet deal with?

Where does the money come from?

Where does the money go?

Which relationships matter most?

Which relationships are new?

Which relationships stopped?
```

---

## ما ليس هذا المحرك

هذا المحرك **ليس أداة تتبّع هوية**.

ولا **نظام امتثال (Compliance / AML)**.

Radareum لا يقول:

> هذا العنوان يخص فلاناً.

ولا:

> هذا العنوان مشبوه.

بل يصف:

```
Counterparty = Classification + Interaction History + Weight
```

---

# 5.117 Core Philosophy

معظم المنتجات تعرض العنوان كنص:

```
0x8f3a...b21c
```

وهذا ليس معلومة.

هذا **معرّف تقني**.

---

## القاعدة الأساسية

```
Address = Identity + Behavior + Relationship History
```

العنوان وحده لا يعني شيئاً.

العنوان + سلوك التعامل + تاريخ العلاقة = معلومة مالية.

---

## الفرق بين Raw Transfer و Intelligence

### Raw Transfer

```
Sent 20,000 USDT → 0x8f3a...b21c
```

هذه بيانات.

---

### Intelligence

> أرسلت 20,000 دولار إلى منصة تداول تتعامل معها منذ 6 أشهر، بواقع 14 تعاملاً خلال تلك الفترة.

هذه معلومة.

---

## لماذا هذا مهم

```
Same amount

+

Known counterparty

≠

Same meaning as unknown counterparty
```

نفس المبلغ إلى طرف معروف ومتكرر ليس له نفس دلالة نفس المبلغ إلى طرف يظهر لأول مرة.

---

# 5.118 Intelligence Questions

---

## السؤال الأول

# Counterparty Identity

مع من تتعامل هذه المحفظة؟

```
Exchange

Personal Wallet

DeFi Protocol

Bridge

Contract

Unknown
```

التصنيف وصفي، ومبني على بيانات متاحة فقط.

---

## السؤال الثاني

# Relationship Strength

ما قوة العلاقة مع هذا الطرف؟

```
Interaction Count

Total Volume

Duration

Recency
```

---

## السؤال الثالث

# Capital Source Analysis

من أين تأتي الأموال؟

```
Top Inbound Counterparties

Share of Total Inflow
```

المصدر: Module 02 (Flow) — Inflow.

---

## السؤال الرابع

# Capital Destination Analysis

إلى أين تذهب الأموال؟

```
Top Outbound Counterparties

Share of Total Outflow
```

المصدر: Module 02 (Flow) — Outflow.

---

## السؤال الخامس

# Relationship Changes

هل تغيّرت خريطة العلاقات؟

```
New Counterparty

Growing Relationship

Decaying Relationship

Stopped Relationship
```

---

# 5.119 Required Data Sources

---

## Transactions

```
counterparty (address)

counterparty_label

direction (in / out)

value_usd

timestamp

network
```

---

## counterparties (table)

```
Classification

Known Label

Type

Confidence
```

---

## User Custom Labels

هذه نقطة تميّز موجودة **بالفعل** في التطبيق.

التطبيق يدعم أسماء عملاء مخصّصة (Custom Client Names)، وهي **تسبق** العنوان الخام في العرض.

ترتيب العرض المعتمد:

```
Custom Client Name

↓

Counterparty Label (meaningful)

↓

Truncated Address
```

المرجع في الكود: `resolveCounterpartyDisplay` — `src/lib/clients/display.ts`.

القاعدة:

```
User Label > System Label > Raw Address
```

إذا سمّى المستخدم عنواناً باسم معيّن، فهذا الاسم هو **مصدر الحقيقة للعرض**، ويُستخدم في التحليل والتقارير والرسائل.

---

## Networks

```
Network of interaction

Cross-network presence of the same counterparty
```

المصدر: Module 07 (Network) — **أين** يحدث التعامل.

---

# 5.120 Classification System

المحرك يصنّف كل طرف إلى واحد من **ستة أنواع**.

---

# Type 1

# Exchange

## الدلالة

عنوان معروف يخص منصة تداول (Deposit / Withdrawal Address).

## الإشارات

```
Known exchange address list

High interaction frequency

Deposit-style patterns
```

## ملاحظة تفسيرية

```
Exchange interaction ≠ Sell
```

التحويل إلى منصة **ليس** دليلاً على بيع.

---

# Type 2

# DeFi Protocol

## الدلالة

عقد ذكي يخص بروتوكول (Swap / Lending / Staking).

## الإشارات

```
Contract address

Known protocol registry

Method-level interaction
```

المصدر التكميلي: Module 06 (Trading) للـ Swaps.

---

# Type 3

# Bridge

## الدلالة

عقد أو عنوان ينقل القيمة بين الشبكات.

## الإشارات

```
Known bridge contracts

Paired activity across networks
```

المصدر التكميلي: Module 07 (Network) — Cross-network movement.

---

# Type 4

# Personal Wallet

## الدلالة

عنوان EOA لا ينتمي إلى منصة أو بروتوكول.

## الإشارات

```
Non-contract address

Low / irregular frequency

No known registry match
```

## ملاحظة تفسيرية

"Personal Wallet" وصف **تقني** لنوع العنوان.

ليس تحديداً لهوية شخص.

---

# Type 5

# Internal Wallet

## الدلالة

محفظة أخرى **يملكها المستخدم نفسه** داخل Radareum.

## الإشارات

```
Address exists in user's wallets

Bidirectional transfers
```

## أهمية هذا النوع

```
Internal Transfer ≠ Inflow / Outflow
```

التحويل الداخلي لا يُحتسب دخولاً أو خروجاً لرأس المال — يجب استبعاده من Capital Flow (Module 02).

---

# Type 6

# Unknown

## الدلالة

عنوان لم يُصنّف ضمن البيانات المتاحة.

## القاعدة

```
Unknown = Missing Data

Unknown ≠ Suspicious
```

وجود نسبة مرتفعة من Unknown **يخفض الثقة**، ويُبلَّغ عنه كحد من حدود البيانات (Module 05 — Data Risk / Unknown Exposure).

---

# 5.121 Relationship Metrics

لكل طرف (Counterparty) تُحسب المقاييس التالية.

---

# Interaction Count

عدد العمليات مع هذا الطرف.

```
Total interactions (in + out)
```

---

# Total Volume

مجموع القيمة المتبادلة بالدولار.

```
Inbound USD + Outbound USD
```

---

# First Seen

تاريخ أول تعامل مسجّل.

```
First interaction date
```

---

# Last Seen

تاريخ آخر تعامل مسجّل.

```
Last interaction date
```

---

# Relationship Duration

المدة بين أول وآخر تعامل.

```
Last Seen − First Seen
```

مثال:

```
6 months
```

---

# Average Transfer Size

متوسط قيمة العملية مع هذا الطرف.

```
Total Volume ÷ Interaction Count
```

---

# Dominance

حصة هذا الطرف من الحركة الكلية.

```
Counterparty Volume ÷ Total Wallet Volume
```

مثال:

```
Dominance: 41%
```

هذا المقياس هو ما يحوّل "طرف من الأطراف" إلى **علاقة مهيمنة**.

---

# 5.122 Counterparty Relationship Score

---

## المدى

```
0 - 100
```

---

## المعنى

```
Higher = Stronger, more established relationship
```

المقياس يصف **قوة العلاقة**، لا جودتها.

```
100 ≠ Good

0 ≠ Bad
```

---

## الأوزان

| Component | Weight |
|-----------|--------|
| Frequency | 30 |
| Volume | 30 |
| Recency | 20 |
| Consistency | 20 |

المجموع:

```
100
```

---

## معنى كل مكوّن

```
Frequency   → عدد التعاملات مقارنة ببقية الأطراف

Volume      → حجم القيمة المتبادلة

Recency     → قرب آخر تعامل من الآن

Consistency → انتظام التعامل عبر الزمن (لا دفعة واحدة)
```

---

## مثال

```json
{
"counterparty":
"0x8f3a...b21c",

"display_name":
"Binance Deposit",

"type":
"exchange",

"relationship_score": 84,

"components": {
"frequency": 26,
"volume": 27,
"recency": 18,
"consistency": 13
},

"interaction_count": 14,

"total_volume_usd": 182000,

"first_seen": "2026-01-18",

"last_seen": "2026-07-21",

"dominance": "41%",

"confidence": "high"
}
```

---

## التفسير

```
An established, recurring relationship that carries a large share of wallet movement.
```

وصف للعلاقة.

لا حكم على الطرف.

---

# 5.123 Pattern Detection

---

# Pattern 1

# New Important Counterparty

## الشروط

```
First Seen within recent period

+

High value relative to wallet baseline
```

Insight:

```
A new counterparty appeared and immediately accounts for a significant share of movement.
```

---

التفسير:

```
This describes a change in the relationship map, not a judgment about the counterparty.
```

---

# Pattern 2

# Frequent Exchange Interaction

## الشروط

```
Counterparty Type = Exchange

+

Interaction Count above wallet baseline
```

Insight:

```
Interactions with exchange addresses increased compared with the historical baseline.
```

---

مهم:

```
Exchange interaction ≠ Selling
```

لا نستنتج بيعاً ولا خروجاً من السوق.

---

# Pattern 3

# Major Capital Destination

## الشروط

```
Outbound Dominance > Threshold
```

Insight:

```
A large share of outgoing value goes to a single counterparty.
```

---

التفسير:

```
Outgoing movement is concentrated in one destination.
```

---

# Pattern 4

# Major Capital Source

## الشروط

```
Inbound Dominance > Threshold
```

Insight:

```
A large share of incoming value comes from a single counterparty.
```

---

التفسير:

```
Incoming movement depends on one source.
```

---

# Pattern 5

# Relationship Decay

## الشروط

```
Previously active counterparty

+

No interactions in recent period
```

Insight:

```
A previously recurring relationship shows no recent activity.
```

---

مهم:

لا نقول "انتهت العلاقة".

نصف غياب النشاط خلال الفترة فقط.

---

# Pattern 6

# Unknown High-Value Interaction

## الشروط

```
Counterparty Type = Unknown

+

Value above wallet baseline
```

Insight:

```
A high-value interaction occurred with an address that could not be classified.
```

---

التفسير:

```
This is reported as a data limitation and lowers analysis confidence. It is not a security judgment.
```

الارتباط: Module 05 — Unknown Exposure / Operational Risk.

---

# 5.124 Counterparty Network Graph

المخرَج ليس جدولاً فقط، بل **شبكة**.

---

## الشكل

```text
                    ┌──────────────────┐
                    │  Binance Deposit │
                    │   (Exchange)     │
                    └────────▲─────────┘
                             │ out 41%
                             │
┌───────────────┐   in 33%   │            out 12%   ┌──────────────┐
│ Coinbase W/D  ├────────────┼──────────────────────►  Uniswap V3  │
│  (Exchange)   │            │                      │  (Protocol)  │
└───────────────┘     ┌──────┴───────┐              └──────────────┘
                      │  YOUR WALLET │
┌───────────────┐     └──────┬───────┘              ┌──────────────┐
│ Client — Ali  ├────────────┘   out 9%             │ 0x8f3a...b21c│
│ (Personal)    │  in 21%        ─────────────────► │  (Unknown)   │
└───────────────┘                                   └──────────────┘
```

---

## Node Shape

```json
{
"address":
"0x8f3a...b21c",

"display_name":
"Binance Deposit",

"type":
"exchange",

"direction":
"outbound",

"interaction_count": 14,

"total_volume_usd": 182000,

"share_of_direction": "41%",

"relationship_score": 84,

"first_seen": "2026-01-18",

"last_seen": "2026-07-21",

"network": "Ethereum",

"label_source": "user_custom"
}
```

---

حقل `label_source` مهم:

```
user_custom > system_known > unlabeled
```

يوضّح مصدر الاسم المعروض حتى لا يُخلط اسم المستخدم بتصنيف النظام.

---

# 5.125 Importance Ranking

الشبكة وحدها لا تكفي.

المستخدم يحتاج **ترتيباً**.

---

## Top Sources

من أين تأتي الأموال؟

مثال:

```
1. Coinbase Withdrawal   —  $142,000   —  33% of inflow   —  9 interactions

2. Client — Ali          —   $91,000   —  21% of inflow   —  17 interactions

3. Unknown (0x41d9...)   —   $28,000   —   6% of inflow   —  2 interactions
```

---

## Top Destinations

إلى أين تذهب الأموال؟

مثال:

```
1. Binance Deposit       —  $182,000   —  41% of outflow  —  14 interactions

2. Uniswap V3 Router     —   $53,000   —  12% of outflow  —  31 interactions

3. 0x8f3a...b21c         —   $40,000   —   9% of outflow  —  1 interaction
```

---

## قاعدة الترتيب

```
Rank by Volume Share

Then by Relationship Score
```

الحجم يحدد الأهمية المالية.

درجة العلاقة تحدد مدى رسوخها.

---

# 5.126 Counterparty Insight Object

يتم تخزينه:

```json
{
"type":
"major_capital_destination",

"title":
"Outgoing value concentrated in one counterparty",

"description":
"A large share of outgoing value went to a single exchange address during the period.",

"counterparty":
"0x8f3a...b21c",

"display_name":
"Binance Deposit",

"counterparty_type":
"exchange",

"severity":
"medium",

"confidence":
"high",

"evidence":
{
"outbound_share":"41%",
"total_volume_usd":182000,
"interaction_count":14,
"first_seen":"2026-01-18",
"last_seen":"2026-07-21",
"network":"Ethereum"
},

"related_modules":
[
"flow",
"network"
],

"created_at":
"timestamp"
}
```

---

حقل `display_name` يتبع قاعدة العرض:

```
Custom Client Name → Counterparty Label → Truncated Address
```

---

# 5.127 Interpretation Rules

هذه أهم نقطة في الوحدة.

الأطراف المقابلة هي المنطقة التي يسهل فيها ارتكاب أخطاء تفسيرية خطيرة.

---

## حالة: عنوان غير معروف

❌ الخطأ:

> هذا العنوان يخص شخصاً ما.

✅ الصحيح:

> لم يتم تصنيف هذا العنوان ضمن البيانات المتاحة، لذلك يظهر كطرف غير معروف وتم خفض مستوى الثقة في هذا الجزء من التحليل.

---

## حالة: تحويل إلى منصة تداول

❌ الخطأ:

> لقد قمت ببيع أصولك.

✅ الصحيح:

> تم تحويل 20,000 دولار إلى عنوان يخص منصة تداول. لا يمكن تحديد ما إذا تم بيع الأصول أم لا، لأن ما يحدث داخل المنصة لا يظهر في بيانات الشبكة.

---

## حالة: عنوان يتكرر بمبالغ كبيرة

❌ الخطأ:

> هذا العنوان مشبوه.

✅ الصحيح:

> يتكرر التعامل مع هذا العنوان بمبالغ أعلى من المتوسط، ويمثل الحصة الأكبر من الحركة الصادرة خلال الفترة.

---

## حالة: طرف جديد بمبلغ كبير

❌ الخطأ:

> هناك نشاط غير طبيعي أو محاولة اختراق.

✅ الصحيح:

> ظهر طرف جديد لأول مرة خلال هذه الفترة، ويستحوذ على حصة ملحوظة من الحركة مقارنة بالمعدل التاريخي للمحفظة.

---

## حالة: توقف التعامل مع طرف

❌ الخطأ:

> أنهيت علاقتك بهذه الجهة.

✅ الصحيح:

> لا توجد تعاملات مسجّلة مع هذا الطرف خلال الفترة الأخيرة، بعد أن كان من الأطراف المتكررة سابقاً.

---

## حالة: اسم عميل مخصّص

❌ الخطأ:

> تجاهل الاسم المخصّص وعرض العنوان الخام.

✅ الصحيح:

> استخدام الاسم الذي حدده المستخدم (مثل «العميل — علي») في كل عرض وتحليل وتقرير، مع الإبقاء على العنوان كمرجع تقني عند الحاجة.

---

## القواعد النهائية

```
Never attribute an address to a person without confirmed data.

Never infer "you sold" from an exchange transfer.

Never call an address "suspicious".

Unknown = Missing Data, not risk verdict.
```

انظر Part 4 (§4.20) — Analysis Modes / Evidence / No-Recommendation.

---

# 5.128 Analysis Modes

---

# Mode 1

## Counterparty Overview

السؤال:

> مع من أتعامل؟

يعرض:

```
Counterparty Count

Type Breakdown

Top Relationships

Confidence
```

---

# Mode 2

## Money Flow Analysis

السؤال:

> من أين جاءت الأموال؟

يعرض:

```
Top Sources

Inbound Share

Source Types
```

المصدر التكميلي: Module 02 (Flow).

---

# Mode 3

## Destination Analysis

السؤال:

> إلى أين ذهبت الأموال؟

يعرض:

```
Top Destinations

Outbound Share

Destination Types
```

---

# Mode 4

## Relationship History

السؤال:

> منذ متى أتعامل مع هذا الطرف؟

يعرض:

```
First Seen / Last Seen

Duration

Interaction Timeline

Relationship Score
```

---

# 5.129 Response Template

أي تحليل للأطراف المقابلة يتبع هذا الشكل.

---

## Summary

مثال:

> خلال آخر 90 يوماً تعاملت المحفظة مع 23 طرفاً مختلفاً. تتركز الحركة الصادرة في عنوان واحد يخص منصة تداول (41% من إجمالي الصادر)، بينما يأتي أكبر مصدر للأموال من عنوان سحب منصة (33% من إجمالي الوارد). مستوى الثقة مرتفع، مع ملاحظة أن 6% من القيمة تعاملت مع عناوين لم يتم تصنيفها.

---

## Main Relationships

```
Binance Deposit (Exchange)   —  out  —  41%  —  14 interactions  —  6 months

Coinbase W/D (Exchange)      —  in   —  33%  —   9 interactions  —  7 months

Client — Ali (Personal)      —  in   —  21%  —  17 interactions  —  1 year
```

---

## Interpretation

```
Outgoing movement is concentrated in one destination.

Incoming movement comes mainly from two recurring sources.

One high-value interaction involved an unclassified address.
```

بدون استنتاج نية.

بدون تحديد هوية.

---

## Monitoring Points

نقاط المتابعة — وليست توصيات:

```
Outbound dominance of the top destination

Newly appearing counterparties

Share of unknown counterparties
```

---

# 5.130 Backend Intelligence Jobs

بعد كل Sync:

تشغيل:

```
calculate_counterparty_intelligence()
```

يقوم بـ:

1. استخراج جميع الأطراف من `transactions` (عناوين + اتجاه + قيمة + شبكة).
2. تصنيف كل طرف إلى أحد الأنواع الستة (مع استبعاد Internal Wallets من Capital Flow).
3. حساب Relationship Metrics لكل طرف (Count / Volume / First Seen / Last Seen / Duration / Average / Dominance).
4. حساب Counterparty Relationship Score بالأوزان المعتمدة.
5. اكتشاف Patterns الستة ومقارنتها بالفترة السابقة.
6. إنشاء Counterparty Insights وتخزينها.

---

النتائج تُكتب أيضاً إلى `wallet_insights` (Proactive Mode — Part 3 §3.12).

---

# 5.131 Database Design

---

## counterparties

```sql
id

address

type

known_label

label_source

confidence

first_classified_at

updated_at
```

---

## counterparty_relationships

```sql
id

wallet_id

counterparty_id

interaction_count

inbound_volume_usd

outbound_volume_usd

total_volume_usd

average_transfer_usd

dominance

relationship_score

first_seen

last_seen

primary_network

calculated_at
```

---

## counterparty_insights

```sql
id

wallet_id

counterparty_id

type

severity

confidence

title

description

evidence_json

created_at
```

---

`counterparty_relationships` هو ما يسمح باكتشاف **Relationship Decay** (Pattern 5) و **New Important Counterparty** (Pattern 1) عبر مقارنة الفترات.

---

# 5.132 Tool Interface

الـ LLM لا يبني شبكة العلاقات.

يستدعي:

```
get_counterparty_intelligence
```

Response:

```json
{
counterparty_count,

type_breakdown,

top_sources,

top_destinations,

relationships,

network_graph,

patterns,

insights,

evidence,

unknown_share,

confidence
}
```

---

# 5.133 مثال كامل

المستخدم:

> من أين جاءت الأموال؟

---

الوكيل داخلياً:

```
Intent:
Capital Source Analysis

↓

Get Flow Intelligence (Module 02)

↓

Get Counterparty Intelligence (Module 08)

↓

Rank Inbound Counterparties by Volume Share

↓

Apply Display Rule (Custom Name > Label > Address)

↓

Generate Explanation (no identity, no intent)
```

---

النتيجة:

> خلال آخر 90 يوماً بلغ إجمالي الوارد إلى المحفظة 430,000 دولار، جاء معظمه من مصدرين متكررين. المصدر الأول هو عنوان سحب يخص منصة تداول بقيمة 142,000 دولار (33% من الوارد) عبر 9 عمليات، والعلاقة معه مستمرة منذ نحو 7 أشهر. المصدر الثاني هو العنوان الذي سميته «العميل — علي» بقيمة 91,000 دولار (21% من الوارد) عبر 17 عملية منذ أكثر من سنة، وهو أكثر الأطراف انتظاماً في التعامل. أما البقية فموزعة على 12 طرفاً بمبالغ أصغر، من بينها 28,000 دولار (6% من الوارد) من عنوان لم يتم تصنيفه ضمن البيانات المتاحة، لذلك تم خفض مستوى الثقة في ذلك الجزء تحديداً. لا يمكن تحديد هوية أصحاب هذه العناوين، ولا سبب التحويلات، لأن ذلك غير متاح في بيانات الشبكة.

---

لاحظ:

* لا تحديد هوية.
* لا استنتاج نية.
* أسماء مخصّصة محترمة كما حددها المستخدم.
* حصص رقمية + عدد عمليات + مدة علاقة.
* إفصاح صريح عن حدود البيانات.

---

# انتهت الوحدة الثامنة — Counterparty Intelligence

أصبح لدينا الآن:

✅ تحويل سجل التحويلات إلى شبكة علاقات مالية مفهومة
✅ قاعدة Address = Identity + Behavior + Relationship History
✅ خمسة أسئلة Intelligence (Identity / Strength / Source / Destination / Change)
✅ نظام تصنيف من ستة أنواع بما فيها Internal Wallet و Unknown
✅ Relationship Metrics كاملة (Count / Volume / Seen / Duration / Average / Dominance)
✅ Counterparty Relationship Score بأوزان واضحة (30/30/20/20)
✅ ستة Patterns مع تفسيراتها
✅ Counterparty Network Graph + Importance Ranking
✅ احترام أسماء العملاء المخصّصة كمصدر عرض أول (App convention)
✅ قواعد تفسير صارمة (❌ / ✅) تمنع نسب العناوين لأشخاص أو وصفها بالمشبوهة
✅ أربعة Analysis Modes + Response Template
✅ Backend Job + قاعدة بيانات مقترحة + Tool Interface

---

## الجزء القادم

سننتقل إلى:

# Module 09 — Alert Intelligence Engine

وهي الوحدة التي تحدد **متى** يتحدث Radareum من تلقاء نفسه.

سنصمم فيها:

* When to Alert
* Signal vs Noise
* Smart Alert Types
* Context-Aware Alerts
* Risk-Based Notifications
* Daily / Weekly AI Reports
* Professional Telegram Voice

ملاحظة مهمة:

هذه الوحدة هي **قلب تجربة خارج التطبيق** (Out-of-App Experience).

المستخدم لا يفتح Radareum كل يوم؛ لذلك جودة التنبيه هي ما يحدد قيمة المنتج الحقيقية.
