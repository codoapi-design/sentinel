# Radareum AI Design Specification

# PART 5 — Intelligence Framework

# Module 07 — Network Intelligence

> **Normative (Module 07).** Network Intelligence Engine — seventh chapter of the Radareum Intelligence Framework. Spec only; no runtime implementation required by this document alone.

> **Framework intro:** [`05-00-intelligence-framework.md`](./05-00-intelligence-framework.md) — 12 modules, unified Module Template (Goal / Questions / Metrics / Patterns / Insights / Evidence / Confidence / Output), **Reactive + Proactive** modes → `wallet_insights`. Living Spec — [`SPEC.md`](./SPEC.md). Prior modules: [`05-01-performance-intelligence.md`](./05-01-performance-intelligence.md) · [`05-02-flow-intelligence.md`](./05-02-flow-intelligence.md) · [`05-03-portfolio-intelligence.md`](./05-03-portfolio-intelligence.md) · [`05-04-asset-intelligence.md`](./05-04-asset-intelligence.md) · [`05-05-risk-intelligence.md`](./05-05-risk-intelligence.md) · [`05-06-trading-intelligence.md`](./05-06-trading-intelligence.md).

> **Cross-links:** Part 2 Portfolio Intelligence Engine ([`02-ai-architecture.md`](./02-ai-architecture.md) §2.18). Part 3 Business Tools / Cache / Backend Intelligence Engine ([`03-data-layer-tool-calling.md`](./03-data-layer-tool-calling.md) §3.11–§3.12). Part 4 Analysis Mode / Confidence / Evidence / Negative Prompt ([`04-core-system-prompt.md`](./04-core-system-prompt.md) §4.20). Module 02 (مصادر ووجهات التدفق + سياق الغاز) · Module 05 (تأطير التركّز والاعتماد كمخاطرة) · Module 06 (نمط التوسع الشبكي).

> **Next:** Module 08 — Counterparty Intelligence.

---

# 5.99 Purpose

## الاسم

```text
Network Intelligence Engine
```

---

## الهدف

تحويل البيانات متعددة الشبكات من مجرد وسم على كل صف:

```
Transaction → network
Asset       → network
```

إلى فهم مالي لكيفية استخدام المحفظة للشبكات:

```
أين يتوزع رأس المال؟

أين يحدث النشاط؟

على أي شبكة تعتمد المحفظة؟

كيف تغير استخدام الشبكات عبر الزمن؟

كم تكلف كل شبكة تشغيلياً؟

ما السلوك الذي تمارسه على كل شبكة؟
```

---

Module 03 يجيب: كيف تتوزع المحفظة على الأصول.

Module 06 يجيب: كيف تتداول.

Module 07 يجيب: **أين يحدث كل ذلك، ولماذا يهم**.

---

# 5.100 Core Philosophy

الشبكة ليست مجرد **موقع** للأصل.

الشبكة **جزء من استراتيجية المحفظة**.

---

## مثال — محفظتان بنفس القيمة

المحفظة الأولى:

```
Ethereum   95%
Others      5%
```

المحفظة الثانية:

```
Ethereum   40%
Arbitrum   30%
Base       20%
Polygon    10%
```

القيمة الإجمالية متطابقة.

لكن:

```
Structure   مختلف
Behavior    مختلف
Cost        مختلف
Dependency  مختلف
```

المحفظة الأولى مرتبطة بالكامل بشبكة واحدة (تكلفة أعلى، اعتماد أعلى).

المحفظة الثانية موزعة، لكنها أكثر تعقيداً في المتابعة والتشغيل.

لا واحدة منهما «أفضل».

كلٌّ منهما **بنية مختلفة** يجب وصفها كما هي.

---

## الأسئلة الثلاثة الجوهرية

```
Where is the money?

Where is the activity?

Where is the behavior?
```

الإجابة عن هذه الأسئلة الثلاثة هي كامل مهمة هذه الوحدة.

---

# 5.101 Intelligence Questions

---

## السؤال الأول

# Capital Distribution

كيف تتوزع قيمة المحفظة على الشبكات؟

```
Network Value

Network Allocation %

Rank
```

---

## السؤال الثاني

# Activity Distribution

أين يحدث النشاط فعلياً؟

```
Transaction Count per Network

Volume per Network

Activity Share %
```

مثال مهم — عدم التطابق بين القيمة والنشاط:

```
Value

Ethereum   80%
Arbitrum    9%

Activity

Ethereum   12%
Arbitrum   64%
```

القراءة:

> المال على شبكة، والحركة على شبكة أخرى.

هذه معلومة لا تظهر في أي Dashboard تقليدي.

---

## السؤال الثالث

# Network Dependency

إلى أي درجة ترتبط المحفظة بشبكة واحدة؟

```
Largest Network Share

Number of Active Networks

Concentration of Value + Activity
```

يُقرأ مع Concentration / Dependency في Module 05 — نفس التأطير: **اعتماد**، لا حكم على الشبكة.

---

## السؤال الرابع

# Network Evolution

كيف تغيّر استخدام الشبكات عبر الزمن؟

```
New Network Appeared

Network Share Rising

Network Share Falling

Network Became Inactive
```

هذا يتقاطع مع **Network Expansion Pattern** في Module 06.

---

## السؤال الخامس

# Cost Efficiency

كم تكلف كل شبكة تشغيلياً؟

```
Total Gas Spent

Average Gas per Transaction

Gas as % of Volume
```

سياق الغاز مأخوذ من Module 02 (Flow Intelligence).

---

## السؤال السادس

# Network Behavior

ما نوع السلوك على كل شبكة؟

مثال:

```
Ethereum
→ Holdings

Arbitrum
→ Trading
```

نفس المستخدم، سلوكان مختلفان، حسب الشبكة.

هذا ما يحوّل الشبكة من عمود في جدول إلى **بُعد تحليلي**.

---

# 5.102 Required Data Sources

---

## transactions

```
network

direction

amount

usd_value

gas_fee

to_address

timestamp
```

---

## assets

```
symbol

network

balance

value_usd
```

---

## gas data

```
gas_fee

gas_used

fee_usd
```

المصدر نفسه المستخدم في Module 02 لسياق الرسوم.

---

## portfolio_snapshots

لقياس تغير حصة كل شبكة عبر الزمن.

---

## counterparties

لفهم **مع من** يتم التفاعل داخل كل شبكة (عقود، منصات، عناوين متكررة).

التحليل الكامل لهذا المصدر يأتي في **Module 08 — Counterparty Intelligence**.

---

# 5.103 Metrics Layer

---

# Network Allocation

```
Network Allocation = Network Value / Portfolio Value × 100
```

---

# Activity Share

```
Activity Share = Network Transactions / Total Transactions × 100
```

---

# Transaction Count

```
عدد العمليات لكل شبكة خلال الفترة
```

---

# Volume

```
Volume = Σ usd_value of transactions on the network
```

---

# Gas Consumption

```
Gas Consumption = Σ fee_usd on the network
```

---

# Average Gas Cost

```
Average Gas Cost = Gas Consumption / Transaction Count
```

---

# Contract Interaction Count

```
عدد التفاعلات مع عقود ذكية على الشبكة
```

يميز بين:

```
Simple Transfers

vs

Protocol Usage
```

---

# 5.104 Network Health Score

Score من:

```
0 - 100
```

---

## تحذير مهم

هذا **ليس** تقييماً للشبكات.

هذا تقييم لـ **استخدام المستخدم للشبكات**:

```
Evaluates the user's use of networks

NOT

The networks themselves
```

لا نقيّم Ethereum ولا Arbitrum ولا Base.

نقيّم بنية استخدام المحفظة لها.

---

## الأوزان

```
Distribution        30
Activity Balance    25
Cost Efficiency     20
Network Diversity   15
Data Quality        10
```

---

### Distribution (30)

مدى توزّع القيمة على الشبكات مقابل تركّزها في شبكة واحدة.

---

### Activity Balance (25)

مدى تطابق توزيع النشاط مع توزيع القيمة.

الفجوة الكبيرة تخفض النتيجة لأنها تعني بنية تشغيلية غير متسقة.

---

### Cost Efficiency (20)

تكلفة الغاز مقارنة بحجم العمليات المنفذة.

---

### Network Diversity (15)

عدد الشبكات النشطة فعلياً (وليس عدد الشبكات التي تحوي غباراً).

---

### Data Quality (10)

اكتمال بيانات الشبكة: الأسعار، الرسوم، التغطية الزمنية.

---

## مثال

```json
{
"network_health_score":
62,

"components":
{
"distribution": 45,
"activity_balance": 40,
"cost_efficiency": 70,
"network_diversity": 80,
"data_quality": 95
},

"active_networks":
4,

"dominant_network":
"Ethereum",

"confidence":
"high"
}
```

---

# 5.105 Pattern Detection

---

# Pattern 1

# Single Network Dependency

## الشروط

```
Largest Network Share ≥ 80%

+

Active Networks ≤ 2
```

Insight:

```
Most of the portfolio value sits on a single network.
```

---

التفسير:

```
Portfolio outcomes and operating conditions are tied to one network environment.
```

يُقرأ مع Dependency Risk في Module 05.

---

# Pattern 2

# Multi-chain Expansion

## الشروط

```
New network appeared in the period

+

Its share is rising
```

Insight:

```
Activity extended to a network that was not previously used.
```

---

التفسير:

```
The operating footprint of the wallet widened during this period.
```

نفس النمط المرصود في Module 06 من زاوية التداول؛ هنا يُقرأ من زاوية البنية.

---

# Pattern 3

# Activity Migration

## الشروط

```
Activity Share on Network A ↓

+

Activity Share on Network B ↑

+

Similar timing
```

Insight:

```
Transaction activity shifted from one network to another during the period.
```

---

التفسير:

```
The change appears in where operations are executed, not necessarily in what is held.
```

لا نفترض السبب (رسوم، فرص، تفضيل) قبل توفر دليل.

---

# Pattern 4

# Capital vs Activity Mismatch

## الشروط

```
Network Allocation ≥ 70%

AND

Activity Share ≤ 20%
```

أو العكس:

```
Network Allocation ≤ 15%

AND

Activity Share ≥ 50%
```

Insight:

```
Value is concentrated on one network while activity happens mainly on another.
```

---

التفسير:

```
The wallet stores value in one environment and operates in another.
```

هذا أهم نمط في الوحدة، لأنه يفسّر بنية لا تظهر في أي عرض تقليدي.

---

# Pattern 5

# High Gas Exposure

## الشروط

```
Gas as % of Volume above the wallet's own baseline

+

Gas concentrated on a single network
```

Insight:

```
A large share of operating cost is generated on one network.
```

---

التفسير:

```
Operating cost is structurally linked to where transactions are executed.
```

نصف التكلفة، ولا نصدر حكماً بأنها «مرتفعة جداً».

---

# Pattern 6

# Dormant Network

## الشروط

```
No transactions on the network for an extended period

+

Value still present
```

Insight:

```
This network holds value without recent activity.
```

---

التفسير:

```
Exposure remains on a network that is no longer part of active operations.
```

يتقاطع مع Forgotten Asset في Module 04.

---

# 5.106 Network Behavior Profiles

تصنيف وصفي لسلوك المحفظة عبر الشبكات.

---

## Single Chain User

```
Active Networks ≤ 2

+

Largest Network Share ≥ 80%
```

كل شيء — القيمة والنشاط — في بيئة واحدة.

---

## Multi-chain User

```
Active Networks ≥ 3

+

No network above ~60%

+

Activity distributed
```

يستخدم أكثر من بيئة بشكل فعلي، لا اسمياً.

---

## DeFi Explorer

```
High Contract Interaction Count

+

Multiple networks

+

Interactions spread across protocols
```

النشاط ليس تحويلات بسيطة، بل تفاعل مع عقود.

---

## Network Specialist

```
Value distributed across networks

+

Activity concentrated on one network
```

يحتفظ في أماكن متعددة، لكنه يعمل في مكان واحد.

---

مهم:

هذه أوصاف **لسلوك المحفظة**، وليست ألقاباً للشخص (نفس قاعدة Module 03 و Module 06).

---

# 5.107 Network Risk Analysis

هنا القاعدة الأخطر في هذه الوحدة.

---

## القاعدة

لا نحكم على الشبكة أبداً.

الشبكة ليست موضوع التحليل؛ **علاقة المحفظة بها** هي الموضوع.

---

## الخاطئ

❌

> Ethereum risk

❌

> شبكة Solana خطرة

❌

> Polygon غير آمنة

---

## الصحيح

✅

> 82% من قيمة المحفظة موجودة على شبكة واحدة، وهو ما يجعل أداء المحفظة وظروف تشغيلها مرتبطين ببيئة واحدة.

✅

> النشاط يتركز على شبكة تمثل 9% فقط من القيمة.

✅

> لم تُسجَّل أي عملية على هذه الشبكة منذ 96 يوماً رغم وجود قيمة عليها.

---

القاعدة العامة:

```
Express network exposure as portfolio dependency

Not

As a judgment about the chain
```

هذا التأطير مطابق لما اعتُمد في Module 05 (Concentration / Dependency).

---

# 5.108 Network Insight Object

```json
{
"type":
"capital_activity_mismatch",

"network":
"Ethereum",

"title":
"Value and activity are on different networks",

"description":
"Most portfolio value is held on one network while most transactions are executed on another.",

"severity":
"medium",

"confidence":
"high",

"evidence":
{
"value_share":"80%",
"activity_share":"12%",
"secondary_network":"Arbitrum",
"secondary_activity_share":"64%",
"period":"30d"
},

"related_entities":
[
"Ethereum",
"Arbitrum",
"Flow Intelligence"
],

"created_at":
"timestamp"
}
```

الشكل مطابق لـ Flow Insight Object (§5.23) مع إضافة حقل `network`.

---

# 5.109 Interpretation Rules

---

## القاعدة الأولى

عدد الشبكات ليس مخاطرة بحد ذاته.

❌

> استخدام شبكات كثيرة يعني مخاطرة أعلى.

✅

> يتوزع النشاط على أربع شبكات، وهو ما يزيد من تعقيد المتابعة مقارنة بمحفظة تعمل على شبكة واحدة.

---

## القاعدة الثانية

لا نحكم على الرسوم.

❌

> رسومك مرتفعة جداً.

✅

> بلغت رسوم الغاز $312 خلال 30 يوماً، تمثل 1.8% من حجم العمليات، وتركّز 84% منها على شبكة واحدة.

---

## القاعدة الثالثة

لا نحكم على الشبكة (§5.107).

❌

> يجب أن تنتقل إلى شبكة أرخص.

✅

> متوسط تكلفة العملية على هذه الشبكة أعلى من بقية الشبكات المستخدمة في المحفظة.

---

## القاعدة الرابعة

لا نفترض النية وراء التوزيع.

❌

> أنت توزع أصولك لتقليل المخاطر.

✅

> تتوزع القيمة على أربع شبكات بنسب 40/30/20/10.

---

القاعدة العامة:

```
Describe structure and cost

Not

Prescribe where to operate
```

---

# 5.110 Analysis Modes

---

# Mode 1

## Network Overview

السؤال:

> ما الشبكات التي أستخدمها؟

يعرض:

```
Networks

Value

Allocation %

Activity Share
```

---

# Mode 2

## Network Behavior

السؤال:

> ماذا أفعل على كل شبكة؟

يحلل:

```
Transaction Types

Contract Interactions

Holdings vs Trading
```

---

# Mode 3

## Network Cost Analysis

السؤال:

> كم أدفع رسوماً على كل شبكة؟

يحلل:

```
Gas Consumption

Average Gas Cost

Gas as % of Volume
```

---

# Mode 4

## Multi-chain Diagnosis

السؤال:

> هل أنا مستخدم Multi-chain؟

يحلل:

```
Active Networks

Distribution

Activity Balance

Behavior Profile
```

---

# 5.111 Response Template

أي تحليل شبكات:

---

## Summary

مثال:

> تعمل المحفظة حالياً على 4 شبكات. يتركز 68% من القيمة على Ethereum، بينما يحدث 61% من النشاط على Arbitrum.

---

## Network Distribution

```
Ethereum   68%   $96,700   Activity 14%
Arbitrum   16%   $22,700   Activity 61%
Base        9%   $12,800   Activity 19%
Polygon     7%    $9,900   Activity  6%
```

---

## Key Insights

```
Capital vs Activity Mismatch

Rising Share on Arbitrum

Dormant Value on Polygon
```

---

## Interpretation

شرح معنى الفجوة بين مكان القيمة ومكان النشاط، وأثرها على التكلفة والاعتماد.

---

## Things To Watch

نقاط المتابعة، بدون توصيات.

---

# 5.112 Backend Intelligence Jobs

بعد كل Sync:

تشغيل:

```
calculate_network_intelligence()
```

يقوم بـ:

1. تحميل العمليات والأصول مجمّعة حسب الشبكة.
2. حساب Network Allocation لكل شبكة.
3. حساب Activity Share و Volume و Transaction Count.
4. حساب Gas Consumption و Average Gas Cost.
5. اكتشاف Patterns (Dependency / Expansion / Migration / Mismatch / Gas / Dormant).
6. حساب Network Health Score وتحديد Behavior Profile.
7. إنشاء Insights وتخزينها.

النتيجة تُكتب إلى الجداول أدناه و`wallet_insights` (Part 3 §3.12).

---

# 5.113 Database Design

---

## network_metrics

```sql
id

wallet_id

network

period

value_usd

allocation_pct

transaction_count

activity_share_pct

volume_usd

gas_spent_usd

avg_gas_cost_usd

contract_interactions

health_score

behavior_profile

updated_at
```

---

## network_history

```sql
id

wallet_id

network

snapshot_date

value_usd

allocation_pct

transaction_count

activity_share_pct

gas_spent_usd
```

---

## network_insights

```sql
id

wallet_id

network

type

severity

confidence

title

description

evidence_json

created_at
```

---

# 5.114 Tool Interface

الـ LLM لا يستدعي الحسابات.

يستدعي (Business Tool — Part 3 §3.x conventions):

```
get_network_intelligence
```

Response:

```json
{
summary,

networks,

allocation,

activity,

gas,

patterns,

behavior_profile,

insights,

health_score,

confidence
}
```

---

# 5.115 مثال كامل

المستخدم:

> هل أنا مستخدم Multi-chain؟

الوكيل داخلياً:

```
Intent:
Multi-chain Diagnosis

↓

Get Network Intelligence

↓

Compare Value Distribution vs Activity Distribution

↓

Detect Patterns

↓

Resolve Behavior Profile

↓

Generate Explanation
```

النتيجة:

> تعمل المحفظة حالياً على 4 شبكات، لكن التوزيع غير متكافئ. تتركز القيمة بنسبة 68% على Ethereum، بينما يتركز النشاط بنسبة 61% على Arbitrum التي لا تمثل سوى 16% من القيمة.
>
> على مستوى السلوك، تظهر Ethereum كمكان للاحتفاظ (14% فقط من العمليات رغم أنها الأكبر قيمة)، بينما تظهر Arbitrum كمكان للتنفيذ، مع 43 عملية خلال 30 يوماً وأغلبها تفاعلات مع عقود.
>
> من ناحية التكلفة، بلغت رسوم الغاز $312 خلال الفترة، وتركّز 84% منها على Ethereum، بمتوسط أعلى من بقية الشبكات المستخدمة.
>
> كما توجد قيمة بمقدار $9,900 على Polygon دون أي عملية منذ 96 يوماً.
>
> بهذا المعنى، البنية أقرب إلى **Network Specialist**: قيمة موزعة على عدة شبكات، ونشاط مركّز في بيئة واحدة.

لاحظ:

```
Network Intelligence
+
Flow Intelligence (الغاز والتدفقات)
+
Asset Intelligence (القيمة الخاملة)
```

ثلاث وحدات تعمل معاً في إجابة واحدة، بدون أي توصية وبدون أي حكم على الشبكات.

---

# انتهت الوحدة السابعة — Network Intelligence

أصبح لدينا الآن:

✅ التعامل مع الشبكة كبُعد تحليلي لا كعمود في جدول
✅ فصل توزيع رأس المال عن توزيع النشاط
✅ Metrics Layer كامل (Allocation / Activity / Volume / Gas / Contracts)
✅ Network Health Score لاستخدام المستخدم للشبكات لا للشبكات نفسها
✅ ستة أنماط بما فيها Capital vs Activity Mismatch
✅ أربعة Network Behavior Profiles
✅ قاعدة صارمة: لا حكم على الشبكة — يُعبَّر عنها كاعتماد للمحفظة
✅ قواعد تفسير بلا توصيات
✅ أربعة Analysis Modes + Response Template
✅ Backend Job + قاعدة بيانات مقترحة + Tool Interface

---

## الجزء القادم

سننتقل إلى:

# Module 08 — Counterparty Intelligence

وهذه الوحدة تجيب عن سؤال: **مع من تتعامل هذه المحفظة؟**

سنصمم فيها:

* تحديد الأطراف المقابلة (Counterparty Identification)
* اكتشاف المنصات (Exchange Detection)
* المحافظ المرتبطة (Linked Wallets)
* أكبر مصادر الأموال وأكبر وجهاتها
* تغيّر العلاقات المالية عبر الزمن

وستكون الأساس للإجابة عن أسئلة مثل:

```
من أين جاء هذا المال؟

إلى أين ذهب؟

هل هذا العنوان مهم؟

هل تعاملت مع هذا الطرف من قبل؟
```
