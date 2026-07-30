# Radareum AI Design Specification

# PART 5 — Intelligence Framework

# Module 06 — Trading Intelligence

> **Normative (Module 06).** Trading Intelligence Engine — sixth chapter of the Radareum Intelligence Framework. Spec only; no runtime implementation required by this document alone.

> **Framework intro:** [`05-00-intelligence-framework.md`](./05-00-intelligence-framework.md) — 12 modules, unified Module Template (Goal / Questions / Metrics / Patterns / Insights / Evidence / Confidence / Output), **Reactive + Proactive** modes → `wallet_insights`. Living Spec — [`SPEC.md`](./SPEC.md). Prior modules: [`05-01-performance-intelligence.md`](./05-01-performance-intelligence.md) · [`05-02-flow-intelligence.md`](./05-02-flow-intelligence.md) · [`05-03-portfolio-intelligence.md`](./05-03-portfolio-intelligence.md) · [`05-04-asset-intelligence.md`](./05-04-asset-intelligence.md) · [`05-05-risk-intelligence.md`](./05-05-risk-intelligence.md).

> **Cross-links:** Part 2 Portfolio Intelligence Engine ([`02-ai-architecture.md`](./02-ai-architecture.md) §2.18). Part 3 Business Tools / Cache / Backend Intelligence Engine ([`03-data-layer-tool-calling.md`](./03-data-layer-tool-calling.md) §3.11–§3.12). Part 4 Analysis Modes + No-Recommendation & Confidence rules ([`04-core-system-prompt.md`](./04-core-system-prompt.md) §4.20).

> **Next:** Module 07 — Network Intelligence.

---

# 5.82 Purpose

## الاسم

```text
Trading Intelligence Engine
```

---

## الهدف

الوحدات السابقة أجابت عن:

```
كيف أدت المحفظة        (Module 01)

كيف تحرك رأس المال     (Module 02)

كيف تتوزع المحفظة       (Module 03)

ماذا يفعل كل أصل        (Module 04)

أين نقاط الضعف          (Module 05)
```

Module 06 يجيب عن سؤال مختلف تماماً:

```
كيف يتصرف صاحب المحفظة؟
```

أي أن هذه الوحدة تحلل **سلوك التداول والنشاط التشغيلي**، وليست تحليلاً للأرصدة.

---

الفرق:

```
Holdings   = ماذا تملك

Trading    = ماذا تفعل
```

المحفظتان قد تملكان نفس الأصول تماماً، ومع ذلك تكونان مختلفتين كلياً في السلوك: إحداهما تحتفظ، والأخرى تُدير عشرات العمليات شهرياً.

---

# 5.83 Core Philosophy

## ما ليست هذه الوحدة

```
NOT trade recommendations

NOT buy / sell signals

NOT price prediction

NOT market timing
```

لن يقول Radareum أبداً: «ادخل هنا» أو «اخرج الآن» أو «هذه صفقة ناجحة».

---

## ما هي هذه الوحدة

```
IS trading-behavior analysis
```

أي وصف وتفسير **لسلوك التداول كما ظهر في البيانات**.

---

## مثال

البيانات الخام تقول:

```
250 swaps

$1.2M volume

18 assets
```

هذه ليست معلومة مالية. هذه إحصائية.

المعلومة المالية هي:

```
تُظهر المحفظة نشاط تداول مرتفعاً نسبياً:
250 عملية خلال 90 يوماً بمتوسط $4,800 للعملية

النشاط موزع على 18 أصلاً، ما يشير إلى معدل تدوير مرتفع
وليس إلى الاحتفاظ طويل المدى

خلال نفس الفترة جاء الجزء الأكبر من تغير قيمة المحفظة
من ارتفاع الأصول المحتفظ بها، وليس من نتائج التداول
```

---

الفرق:

```
Raw Data      = How much activity

Intelligence  = What the activity means
```

---

## العلاقة مع Module 03

Module 03 (Portfolio Intelligence) يصنّف **سلوك المحفظة الهيكلي** (Investor Behavior Classification) من زاوية التوزيع والاستقرار.

Module 06 يصنّف **سلوك التداول التشغيلي** من زاوية العمليات والتكرار والحجم.

القاعدة لتجنب التناقض:

```
عند اختلاف التصنيفين

يُعرض تصنيف Module 06 كـ Trading Profile

ولا يُعاد كتابة تصنيف Module 03
```

أي أن الوصفين يتكاملان ولا يتنافسان: أحدهما يصف بنية المحفظة، والآخر يصف نشاطها.

---

# 5.84 Intelligence Questions

خمس مجموعات من الأسئلة.

---

## السؤال الأول

# Trading Activity

ما حجم النشاط ومستواه؟

```
Trade Count

Volume

Frequency

Active Days
```

هل النشاط مرتفع، معتدل، منخفض، أم متوقف؟

---

## السؤال الثاني

# Trading Style

ما نمط التداول الظاهر من البيانات؟

```
Active Trader

Swing Trader

Occasional Trader

Holder

Explorer
```

ملاحظة: هذا وصف لنمط **نشاط المحفظة**، وليس تصنيفاً لشخص المستخدم.

---

## السؤال الثالث

# Trading Behavior

كيف يتم التداول؟

```
هل يتم التركيز على أصل واحد أم توزيع النشاط؟

هل الأحجام متقاربة أم متفاوتة؟

هل النشاط مستمر أم على دفعات؟

هل يتم التعامل مع بروتوكولات جديدة؟
```

---

## السؤال الرابع

# Trading Impact

وهذا أهم سؤال في الوحدة:

```
هل جاءت النتيجة من التداول

أم من ارتفاع قيمة الأصول المحتفظ بها؟
```

الفصل بين:

```
Trading Gains

vs

Asset Appreciation
```

بدون هذا الفصل تصبح كل قراءة للأداء غير دقيقة.

---

## السؤال الخامس

# Trading Evolution

كيف تغير سلوك التداول عبر الزمن؟

مثال:

```
منذ 6 أشهر:   5 عمليات / شهر

اليوم:        80 عملية / شهر
```

الوصف الصحيح:

```
ارتفع معدل النشاط بشكل ملحوظ خلال الأشهر الأخيرة
```

وليس:

```
أصبحت متداولاً محترفاً
```

---

# 5.85 Required Data Sources

Trading Intelligence يعتمد على خمسة مصادر.

---

## transactions

المصدر الأساسي:

```
type (swap / transfer / contract)

direction

asset_in / asset_out

amount

usd_value

timestamp

network

gas_fee
```

---

## assets

لربط النشاط بالأصول المحتفظ بها ولمعرفة ما إذا كان الأصل ما زال داخل المحفظة.

---

## Performance Intelligence (Module 01)

لمعرفة إجمالي تغير القيمة، وهو الطرف الأول في معادلة Trading Attribution.

---

## Flow Intelligence (Module 02)

لفصل حركة رأس المال (Deposits / Withdrawals) عن نشاط التداول الداخلي؛ التحويل الوارد ليس صفقة.

---

## counterparties

تصنيف الجهة المقابلة:

```
DEX

CEX

Protocol / Contract

Unknown
```

يستخدم لقياس Network Activity و DEX Interaction، ويُمرَّر لاحقاً إلى Module 09 — Counterparty Intelligence.

---

# 5.86 Metrics Layer

---

# Trading Volume

```
Volume = Σ usd_value of trades in period
```

يُحسب لكل فترة (7d / 30d / 90d / all).

---

# Trade Count

```
Trade Count = عدد العمليات المصنفة كتداول
```

لا تُحتسب التحويلات الداخلية بين محافظ المستخدم نفسه (تُستبعد عبر Module 02).

---

# Average Trade Size

```
Average Trade Size = Volume / Trade Count
```

يميز بين نشاط كثيف بأحجام صغيرة ونشاط محدود بأحجام كبيرة.

---

# Trading Frequency

```
Frequency = Trade Count / Days in Period
```

ويُعرض أيضاً كـ:

```
Trades per Week

Trades per Month
```

---

# Asset Rotation Rate

```
Rotation Rate = Unique Assets Traded / Total Assets Held
```

يقيس مدى تحرك الانكشاف بين الأصول (يُقرأ مع Asset Rotation في Module 04 §5.55 Pattern 6).

---

# Network Activity

```
Distinct Networks Used

Trades per Network
```

يُمرَّر إلى Module 07 — Network Intelligence.

---

# DEX Interaction

```
Distinct DEXs / Protocols

Trades per Counterparty Type
```

يقيس اتساع التعامل مع البروتوكولات، لا جودتها.

---

# Holding Time Between Trades

```
Holding Time = Avg(time between acquiring an asset and reducing it)
```

هذا المقياس هو الأدق في التمييز بين:

```
Swing Trading

vs

Long-Term Holding
```

إذا لم تتوفر بيانات كافية لتتبع الدخول والخروج، يُخفض الـ Confidence ويُذكر ذلك صراحة (Part 4 — Evidence & Confidence).

---

# 5.87 Trading Profiles

خمسة أنماط. كل نمط يوصف **كسلوك للمحفظة**، لا كصفة للشخص.

---

# Profile 1

# Long-Term Holder

## المؤشرات

```
Low Trade Count

Low Frequency

High Holding Time

Low Rotation Rate
```

Output:

```
تُظهر بيانات المحفظة نمط احتفاظ طويل المدى مع نشاط تداول محدود.
```

---

# Profile 2

# Active Trader

## المؤشرات

```
High Trade Count

High Frequency

Short Holding Time

High Volume relative to portfolio value
```

Output:

```
تُظهر المحفظة نشاط تداول مرتفعاً ومستمراً خلال الفترة.
```

---

# Profile 3

# Swing Trader

## المؤشرات

```
Medium Trade Count

Trades occur in bursts

Medium Holding Time

Repeated entry / reduction on the same assets
```

Output:

```
يظهر النشاط على شكل دفعات متباعدة بدلاً من تداول يومي مستمر.
```

---

# Profile 4

# DeFi Explorer

## المؤشرات

```
Many distinct protocols / contracts

Many small-value interactions

Multiple networks

Low average trade size
```

Output:

```
تتعامل المحفظة مع عدد واسع من البروتوكولات بأحجام صغيرة نسبياً.
```

---

# Profile 5

# Market Participant

## المؤشرات

```
Moderate activity

No dominant pattern

Mixed holding times
```

Output:

```
يقع نشاط المحفظة في نطاق متوسط دون نمط تداول غالب.
```

---

## قاعدة الصياغة

```
Describe the behavior of the wallet

Not

Label the person
```

الصياغة الخاطئة:

> أنت متداول نشط.

الصياغة المعتمدة:

> تُظهر بيانات هذه المحفظة نمط تداول نشط خلال الفترة.

---

# 5.88 Pattern Detection

---

# Pattern 1

# Increasing Trading Activity

## الشروط

```
Current Period Trade Count

>

Previous Period Trade Count × 1.5
```

Insight:

```
Trading activity increased significantly compared to the previous period.
```

---

التفسير:

```
The wallet is being managed more actively than before.
```

لا نفترض السبب (سوق، وقت فراغ، استراتيجية جديدة).

---

# Pattern 2

# Asset Rotation Behavior

## الشروط

```
High Rotation Rate

+

Short Holding Time

+

Assets exited shortly after entry
```

Insight:

```
Exposure moves between assets frequently rather than being held.
```

---

التفسير:

```
Portfolio composition is driven by activity, not by accumulation.
```

يُقرأ مع Module 04 (Asset Rotation) لتفادي تكرار نفس الاستنتاج.

---

# Pattern 3

# Trading Concentration

## الشروط

```
≥ 60% of trades

OR

≥ 60% of volume

on a single asset
```

Insight:

```
Most trading activity is concentrated in one asset.
```

---

التفسير:

```
Trading results are largely tied to the behavior of a single asset.
```

يُمرَّر إلى Module 05 — Risk Intelligence كمُدخل تركّز سلوكي (وليس تركّز أرصدة).

---

# Pattern 4

# Network Expansion

## الشروط

```
New networks appear in the current period

+

Trades distributed across more networks than before
```

Insight:

```
Trading activity expanded to networks not used in the previous period.
```

---

التفسير:

```
Operational surface of the wallet increased.
```

يُمرَّر إلى Module 07 — Network Intelligence.

---

# Pattern 5

# Trading Dormancy

## الشروط

```
Trade Count ≈ 0 for an extended period

+

Assets still held
```

Insight:

```
No trading activity was recorded during this period while holdings remained.
```

---

التفسير:

```
Portfolio changes during the period came from price movement, not from activity.
```

هذا النمط مفيد جداً في تفسير الأداء: لا نشاط ⇒ التغير سعري.

---

# Pattern 6

# High Turnover Behavior

## الشروط

```
Volume ≥ 3 × Portfolio Value

within the period
```

Insight:

```
Traded volume during the period is several times the portfolio value.
```

---

التفسير:

```
The same capital was recycled multiple times through trades.
```

ملاحظة مهمة:

الحجم المرتفع لا يعني ربحاً ولا خسارة؛ هو مقياس نشاط فقط.

---

# 5.89 Trading Performance Attribution

هذا هو قلب الوحدة.

---

## المعادلة

```
Total Value Change
=
Asset Appreciation
+
Trading Result
+
Net External Flows
```

الطرف الأخير يأتي من Module 02، ويُطرح قبل أي مقارنة.

---

## مثال

```
Portfolio Change:
+$20,000

↓

Asset Appreciation:   +$18,500

Trading Result:        +$1,500
```

---

التحليل الناتج:

> ارتفعت قيمة المحفظة بمقدار $20,000 خلال الفترة. جاء الجزء الأكبر من هذا الارتفاع — نحو $18,500 — من ارتفاع أسعار الأصول المحتفظ بها، بينما بلغ صافي أثر عمليات التداول +$1,500. أي أن النتيجة خلال هذه الفترة كانت مدفوعة بحركة الأسعار أكثر من النشاط.

---

لاحظ:

```
لا نقول: تداولك جيد

نقول: هذا هو مصدر النتيجة
```

وهذا هو الجسر بين Module 01 (Performance) و Module 06 (Trading).

---

## حالة نقص البيانات

إذا لم يتوفر Cost Basis أو تسلسل كامل للعمليات:

```
Trading Result = تقديري

Confidence = Medium أو Low

ويُذكر السبب في الرد
```

---

# 5.90 Trading Efficiency Metrics

مقاييس وصفية فقط — **لا نصيحة ولا حكم**.

---

# Volume Efficiency

```
Volume Efficiency = Trading Result / Trading Volume
```

مثال:

```
Wallet A:
Volume $1,000,000
Trading Result +$5,000

Wallet B:
Volume $100,000
Trading Result +$5,000
```

الوصف:

```
حققت المحفظتان نفس الأثر من التداول
بينما كان حجم النشاط في الأولى أكبر بعشر مرات
```

لا نقول إن B «أفضل»؛ نصف العلاقة بين النشاط والنتيجة فقط.

---

# Trading Impact Ratio

```
Trading Impact Ratio = Trading Result / Total Value Change
```

يوضح النسبة التي فسّرها التداول من إجمالي التغير.

مثال:

```
+$1,500 / +$20,000 = 7.5%
```

---

# Asset Rotation Efficiency

```
Rotation Efficiency = Value Change of rotated assets after rotation
```

يصف ما إذا كان تحرك الانكشاف بين الأصول قد ترافق مع تغير موجب أو سالب في القيمة، **بعد** حدوثه.

الصياغة الممنوعة:

> كان يجب أن تبقى على الأصل السابق.

الصياغة المعتمدة:

> بعد انتقال الانكشاف من A إلى B، سجل B تغيراً بقيمة X خلال الفترة اللاحقة.

---

# 5.91 Trading Insight Object

يتم تخزينه:

```json
{
"type":
"increasing_trading_activity",

"title":
"Trading activity increased compared to the previous period",

"description":
"Trade count rose from 12 to 47 between the two periods while average trade size decreased.",

"severity":
"info",

"confidence":
"high",

"evidence":
{
"previous_trade_count":12,
"current_trade_count":47,
"previous_avg_size":"$3,100",
"current_avg_size":"$1,450",
"volume":"$68,150",
"period":"30d"
},

"trading_profile":
"active_trader",

"related_entities":
[
"Performance Intelligence",
"Flow Intelligence"
],

"created_at":
"timestamp"
}
```

الشكل مطابق لـ Flow Insight Object (§5.23) مع إضافة حقل `trading_profile`.

---

# 5.92 Interpretation Rules

أخطر نقطة في هذه الوحدة، لأن التداول أقرب موضوع إلى النصيحة المالية.

---

## القاعدة الأولى

لا نحكم على جودة التداول.

```
❌ تداولاتك جيدة

✅ بلغ صافي أثر التداول +$1,500 خلال الفترة
```

---

## القاعدة الثانية

لا نحكم على صفقة منفردة.

```
❌ كانت هذه صفقة ناجحة

✅ بعد هذه العملية سجل الأصل تغيراً بقيمة X خلال الفترة اللاحقة
```

---

## القاعدة الثالثة

لا نصنّف الشخص.

```
❌ أنت متداول محترف

✅ تُظهر بيانات هذه المحفظة نمط تداول نشط خلال الفترة
```

---

## القاعدة الرابعة

لا توصيات ولا توقيت.

```
❌ قلل عدد الصفقات

❌ انتظر قبل الدخول

✅ ارتفع عدد العمليات من 12 إلى 47 مقارنة بالفترة السابقة
```

---

## القاعدة الخامسة

لا افتراض للنية.

```
❌ أنت تحاول تعويض خسائرك

✅ زاد النشاط بعد فترة تراجع في قيمة المحفظة
```

---

القاعدة العامة:

```
Describe activity

Not

Evaluate skill
```

هذه القواعد امتداد مباشر لـ Part 4 (No-Recommendation Rule + Confidence).

---

# 5.93 Analysis Modes

---

# Mode 1

## Trading Overview

السؤال:

> ما مستوى نشاطي؟

يعرض:

```
Trade Count

Volume

Average Trade Size

Frequency

Trading Profile
```

---

# Mode 2

## Trading Behavior

السؤال:

> كيف أتداول؟

يحلل:

```
Rotation Rate

Holding Time

Trading Concentration

Networks & Protocols
```

---

# Mode 3

## Trading Impact

السؤال:

> هل التداول يفيدني؟ (يُعاد صياغته كسؤال عن المصدر)

يحلل:

```
Asset Appreciation vs Trading Result

Trading Impact Ratio

Volume Efficiency
```

الرد يصف مصدر النتيجة، ولا يقيّم المهارة.

---

# Mode 4

## Activity Change

السؤال:

> هل تغير نشاطي؟

يحلل:

```
Period over Period Trade Count

Volume Trend

Profile Shift

Dormancy / Expansion
```

---

# 5.94 Response Template

أي تحليل تداول:

---

## Summary

مثال:

> خلال آخر 30 يوماً سجلت المحفظة 47 عملية بحجم إجمالي $68,150 ومتوسط $1,450 للعملية. النشاط أعلى من الفترة السابقة التي سجلت 12 عملية.

---

## Trading Profile

```
Profile:          Active Trader

Frequency:        1.6 trades / day

Holding Time:     4.2 days (avg)

Rotation Rate:    0.72
```

---

## Activity Breakdown

```
Trades:           47
Volume:           $68,150
Avg Size:         $1,450
Assets Traded:    9
Networks:         3
Protocols:        5
```

---

## Interpretation

شرح مصدر النتيجة والفرق بين ارتفاع الأصول ونتيجة التداول، مع ذكر مستوى الثقة إن كانت البيانات ناقصة.

---

## Things To Watch

نقاط للمتابعة، بدون توصيات:

```
تركّز 62% من حجم التداول في أصل واحد

ظهور شبكة جديدة لم تُستخدم سابقاً
```

---

# 5.95 Backend Intelligence Jobs

بعد كل Sync:

تشغيل:

```
calculate_trading_intelligence()
```

يقوم بـ:

1. تحميل العمليات وتصنيفها (Trade / Transfer / Contract) واستبعاد التحويلات الداخلية عبر Module 02.
2. حساب Metrics لكل فترة (7d / 30d / 90d / all).
3. تحديد Trading Profile.
4. حساب Trading Attribution (Appreciation vs Trading Result) بعد طرح صافي التدفقات الخارجية.
5. اكتشاف Patterns ومقارنة الفترة بالسابقة.
6. إنشاء Insights وتخزينها.

النتيجة تُكتب إلى الجداول أدناه و`wallet_insights` (Part 3 §3.12).

---

# 5.96 Database Design

---

## trading_metrics

```sql
id

wallet_id

period

trade_count

volume_usd

avg_trade_size

frequency

rotation_rate

avg_holding_time_days

distinct_assets_traded

distinct_networks

distinct_protocols

trading_result_usd

appreciation_usd

trading_impact_ratio

updated_at
```

---

## trading_profiles

```sql
id

wallet_id

period

profile

confidence

indicators_json

previous_profile

changed_at

updated_at
```

---

## trading_insights

```sql
id

wallet_id

type

severity

confidence

title

description

evidence_json

trading_profile

created_at
```

---

# 5.97 Tool Interface

الـ LLM لا يستدعي الحسابات.

يستدعي (Business Tool — Part 3 §3.x conventions):

```
get_trading_intelligence
```

Response:

```json
{
summary,

metrics,

trading_profile,

attribution,

efficiency,

patterns,

insights,

period_comparison,

confidence
}
```

---

# 5.98 مثال كامل

المستخدم:

> هل أنا متداول أم مستثمر؟

الوكيل داخلياً:

```
Intent:
Behavior Classification

↓

Get Trading Intelligence

↓

Get Portfolio Intelligence

↓

Get Flow Analysis

↓

Combine Activity + Structure + Capital Movement

↓

Generate Explanation
```

---

النتيجة:

> تُظهر بيانات المحفظة نشاط تداول متوسط إلى مرتفع خلال آخر 90 يوماً: 47 عملية بحجم إجمالي $68,150 ومتوسط $1,450 للعملية، بمعدل احتفاظ يبلغ 4.2 يوماً بين الدخول والتقليص.
>
> في المقابل، تبقى بنية المحفظة أقرب إلى الاستثمار طويل المدى: يمثل ETH نحو 61% من القيمة ولم تُسجَّل عليه عمليات خلال الفترة، أي أن النشاط يتركز في الجزء الأصغر من المحفظة.
>
> على مستوى النتيجة، ارتفعت قيمة المحفظة بمقدار $20,000، جاء منها نحو $18,500 من ارتفاع أسعار الأصول المحتفظ بها و$1,500 من صافي أثر التداول. لم تُسجَّل تدفقات خارجية مؤثرة خلال الفترة.
>
> بعبارة أخرى: النشاط التشغيلي للمحفظة يشبه التداول، بينما مصدر النتيجة يشبه الاستثمار.

---

لاحظ:

```
Trading Intelligence
+
Portfolio Intelligence
+
Flow Intelligence (للنفي)
```

ثلاث وحدات في إجابة واحدة، بدون أي توصية وبدون تصنيف للشخص.

---

# انتهت الوحدة السادسة — Trading Intelligence

أصبح لدينا الآن:

✅ تحليل سلوك التداول لا الأرصدة
✅ فلسفة صريحة: لا توصيات ولا إشارات ولا توقّع أسعار
✅ خمس مجموعات أسئلة بما فيها Trading Evolution
✅ ثمانية Metrics بما فيها Holding Time Between Trades
✅ خمسة Trading Profiles تصف المحفظة لا الشخص
✅ ستة Patterns بشروط واضحة
✅ Trading Performance Attribution (Appreciation vs Trading)
✅ Trading Efficiency Metrics وصفية بلا حكم
✅ قواعد تفسير بأمثلة ❌/✅
✅ أربعة Analysis Modes + Response Template
✅ Backend Job + قاعدة بيانات مقترحة + Tool Interface

---

## الجزء القادم

سننتقل إلى:

# Module 07 — Network Intelligence

وستجيب عن:

* كيف تتوزع المحفظة عبر الشبكات (Cross-Chain Distribution)؟
* ما الشبكة الأكثر استخداماً؟
* هل توجد تبعية لشبكة واحدة (Single-Network Dependency Risk)؟
* هل هاجر النشاط من شبكة إلى أخرى عبر الزمن؟
* ما تكلفة رسوم الغاز وكيف تتغير؟
* ما سلوك المحفظة عبر السلاسل (Cross-Chain Behavior)؟

وهذه الوحدة تحديداً هي ما يميز Radareum عن أدوات التتبع أحادية الشبكة.
