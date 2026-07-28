# Sentinel AI Design Specification

# Part 3 — Data Layer & Tool Calling Architecture

> **Normative.** This part is the engineering Source of Truth for Sentinel AI data access and tool calling. Implementation later must follow this architecture. No runtime agents, APIs, or tools are required by this document alone.

> **Related:** Living Spec — [`SPEC.md`](./SPEC.md) (Parts 1–4). Part 2 architecture — [`02-ai-architecture.md`](./02-ai-architecture.md). Part 4 — [`04-core-system-prompt.md`](./04-core-system-prompt.md). Cross-link: **Portfolio Intelligence Engine** (§2.18) consumes / feeds metrics & insights produced by the Cache Layer (§3.11) and Backend Intelligence Engine (§3.12).

> **Part 4 recorded:** Core System Prompt — [`04-core-system-prompt.md`](./04-core-system-prompt.md) · also in [`SPEC.md`](./SPEC.md). Part 5 forthcoming: Analysis Framework.

---

# 3.1 Philosophy

هذه هي القاعدة الأولى.

> **الـ AI لا يعرف قاعدة البيانات.**

ولا يعرف

* أسماء الجداول
* العلاقات
* SQL
* Postgres
* Supabase

كل ذلك مخفي.

هو يعرف فقط

> Business Objects

وليس

Database Objects.

أي بدلاً من أن يعرف جدولًا اسمه

```text
wallet_snapshots
```

يعرف شيئًا اسمه

```text
Portfolio Performance
```

---

# 3.2 Layer Architecture

لن نجعل الـ LLM يتعامل مع Supabase.

بل ستكون الطبقات كالتالي

```text
AI

↓

Business Tool Layer

↓

Application Service Layer

↓

Supabase RPC

↓

Postgres
```

لاحظ أن الـ AI لا يستطيع تجاوز طبقة الـ Business Tools.

---

# 3.3 لماذا RPC؟

أنصح باستخدام **Supabase RPC Functions** بدلاً من الاعتماد على استعلامات REST المباشرة.

السبب:

بدلاً من

```text
AI

↓

5 SQL Queries

↓

Merge

↓

Return
```

سيكون

```text
AI

↓

One RPC

↓

Everything
```

وهذا أسرع.

---

# 3.4 مبدأ مهم جداً

لا تبني Tools على مستوى الجداول.

ابنها على مستوى الأعمال.

مثلاً لا تبني

```text
get_transactions_table()

get_assets_table()

wallet_table()
```

بل

```text
Analyze Portfolio

Analyze Assets

Analyze Trading

Analyze Networks
```

الفرق ضخم.

---

# 3.5 أنواع الـ Tools

أنا أقسم الأدوات إلى ست فئات.

---

## النوع الأول

### Retrieval Tools

هذه تعيد بيانات.

مثلاً

```text
Portfolio Summary

Assets

Transactions

Snapshots

Flows

ROI

Counterparties

Networks
```

---

## النوع الثاني

### Analysis Tools

هذه لا تعيد بيانات خام.

بل تحليلاً جاهزاً.

مثلاً

```text
Analyze Portfolio

Analyze Trading

Analyze ROI

Analyze Networks

Analyze Activity
```

---

## النوع الثالث

### Intelligence Tools

هذه تعيد Insights جاهزة.

مثلاً

```text
Detect Risks

Detect Changes

Detect Outliers

Detect Trends

Detect Opportunities

Detect Anomalies
```

> **v1.1 amendment — `detect_anomalies`:** أداة من الدرجة الأولى تُوحّد كشف الشذوذ المبعثر اليوم بين **Risk (§5.72)** و **Flow (§5.21)** و **Counterparty (§5.123)**. انظر §3.7 · المجموعة الحادية عشرة.

---

## النوع الرابع

### Export Tools

```text
Generate PDF

Generate Excel
```

---

## النوع الخامس

### Alert Tools

```text
Recent Alerts

Alert Settings

Notification History
```

---

## النوع السادس

### Action Tools

```text
Rename Counterparty

Refresh Wallet

Sync Wallet

Enable Alerts
```

---

# 3.6 أهم قرار معماري

أنا لا أريد

```text
get_transactions()

↓

AI يحلل
```

أنا أريد

```text
analyze_transactions()

↓

AI يفسر
```

وهذا فرق كبير.

---

# 3.7 Tool Catalog

سأقسم جميع أدوات Sentinel إلى مجموعات.

---

# المجموعة الأولى

## Portfolio

بدلاً من عشر أدوات

نجعلها ثلاثاً فقط.

---

### Tool

```text
get_portfolio_overview
```

ترجع

```text
Current Value

Change

ROI

Allocation

Top Assets

Networks

Wallet Health

Diversification

Concentration

Summary Cards
```

لاحظ

ليست مجرد بيانات.

بل Dashboard كاملة.

---

### Tool

```text
get_portfolio_performance
```

ترجع

```text
Snapshots

ROI

Growth

Performance Timeline

Drawdown

Recovery

Best Day

Worst Day
```

---

### Tool

```text
analyze_portfolio
```

هذه أهم واحدة.

ترجع

```text
Executive Summary

Portfolio Health Score

Growth Score

Diversification Score

Risk Score

Main Findings

Key Changes

Things To Watch

Detected Risks

Detected Opportunities
```

لاحظ

هذه لا تحتاج LLM.

> **Cross-link:** Scores and precomputed findings align with **Portfolio Intelligence Engine** ([Part 2 §2.18](./02-ai-architecture.md#218-portfolio-intelligence-engine-الطبقة-العاشرة)) and Cache / Intelligence layers (§3.11–§3.12).

---

# المجموعة الثانية

## Assets

بدلاً من

```text
get_asset()

get_asset_price()

get_asset_balance()

get_asset_cost()
```

نجعلها

---

```text
get_assets_overview
```

ترجع

```text
Assets

Balances

Values

Allocation

Average Cost

PnL

Categories

Spam Hidden

Dormant Assets
```

---

ثم

```text
analyze_assets
```

ترجع

```text
Largest Winners

Largest Losers

High Concentration

Dormant Assets

Inactive Tokens

Portfolio Balance

Diversification Findings

Risk Findings
```

---

# المجموعة الثالثة

## Transactions

```text
search_transactions
```

هذه الوحيدة التي تبحث.

مدخلاتها

```text
wallet

date

network

asset

counterparty

type

direction

amount

gas

limit

offset
```

---

أما التحليل

```text
analyze_transactions
```

يعيد

```text
Activity Trend

Transfer Pattern

Trading Pattern

Gas Pattern

Large Transfers

Frequent Transfers

Interesting Events
```

---

# المجموعة الرابعة

## Networks

```text
get_networks_overview
```

---

```text
analyze_networks
```

---

# المجموعة الخامسة

## Counterparties

```text
get_counterparties
```

---

```text
analyze_counterparties
```

---

# المجموعة السادسة

## Capital Flow

```text
get_capital_flows
```

---

```text
analyze_capital_flows
```

---

# المجموعة السابعة

## ROI

```text
get_roi
```

---

```text
analyze_roi
```

---

# المجموعة الثامنة

## Trading

```text
get_trading_statistics
```

---

```text
analyze_trading
```

---

# المجموعة التاسعة

## Reports

```text
generate_pdf_report
```

---

```text
generate_excel_report
```

---

# المجموعة العاشرة

## Alerts

```text
get_alerts
```

---

```text
update_alert_settings
```

---

# المجموعة الحادية عشرة

## Intelligence

> **v1.1 amendment.** أُضيفت هذه المجموعة بعد اكتمال المواصفة v1.0.

### Tool

```text
detect_anomalies
```

كشف الشذوذ موجود اليوم لكنه **مبعثر**: أنماط داخل Risk (§5.72) وداخل Flow (§5.21) وداخل Counterparty (§5.123). المستخدم لا يسأل «أعطني نمط المخاطر رقم ٣» — بل يسأل:

```text
هل هذه المعاملة طبيعية؟

هل حدث شيء غير معتاد هذا الأسبوع؟
```

لذلك يصبح كشف الشذوذ **أداة من الدرجة الأولى** بسطح استدعاء واحد.

---

### Input

```ts
detect_anomalies({
  wallet_id: string;
  period?: string;                                          // default: last 30d
  scope?: 'transactions' | 'flow' | 'counterparty' | 'all'; // default: 'all'
})
```

---

### Output

```ts
{
  anomalies: Array<{
    type: string;            // e.g. "unusual_transaction_size" | "activity_spike"
                             //      | "new_high_value_counterparty" | "flow_reversal"
                             //      | "dormant_asset_movement" | "gas_outlier"
    severity: 'high' | 'medium' | 'low';
    confidence: 'high' | 'medium' | 'low';
    evidence: Record<string, string | number>;   // القيم التي بُني عليها الحكم
    relatedEntities: {
      transactionHashes?: string[];
      assets?: string[];
      counterparties?: string[];
      networks?: string[];
    };
    detectedBy: 'risk' | 'flow' | 'counterparty';  // مصدر النمط الأصلي
  }>;
  status: 'completed' | 'partial' | 'insufficient_data';
}
```

---

### قاعدة ملزمة

`detect_anomalies` **يجمّع أنماطاً قائمة**، ولا يقدّم منطق كشف جديداً.

```text
detect_anomalies

  ↓  يقرأ

Risk patterns (§5.72)
Flow patterns (§5.21)
Counterparty patterns (§5.123)

  ↓  يوحّد + يرتّب حسب الخطورة

anomalies[]
```

أي نمط جديد يُعرَّف داخل وحدته الأصلية أولاً، ثم يظهر تلقائياً عبر هذه الأداة. لا يوجد كشف يعيش داخل الأداة نفسها.

مخرجاتها تُغلَّف داخل **Unified Engine Output Contract** (§5.0.6.1) عند تمريرها إلى الـ Orchestrator.

---

# 3.8 تصميم الـ RPC

الآن أهم نقطة.

أنا لا أحب أن يكون كل Tool عبارة عن SQL.

بل يكون

```text
Tool

↓

Application Service

↓

RPC

↓

SQL
```

مثلاً

```text
analyze_portfolio()
```

داخلياً

يستدعي

```text
rpc_portfolio_summary()

rpc_assets()

rpc_roi()

rpc_flows()

rpc_networks()

rpc_risk()
```

ثم يدمجها.

الـ AI لا يرى ذلك إطلاقاً.

---

# 3.9 Smart Tool Planning

بدلاً من

```text
Question

↓

10 Tools
```

سنستخدم

Bundles.

مثلاً

إذا قال

> Analyze my wallet.

بدلاً من

```text
12 Tool Calls
```

نجعل

```text
portfolio_bundle()
```

وترجع كل شيء.

---

# 3.10 Bundles

أنصح بتصميم Bundles جاهزة.

مثل

---

## Dashboard Bundle

```text
Portfolio

Assets

ROI

Flows

Snapshots
```

---

## Trading Bundle

```text
Transactions

Gas

Volume

Networks
```

---

## Network Bundle

```text
Networks

Flows

Transactions
```

---

## Report Bundle

```text
Everything
```

---

# 3.11 Cache Layer (إضافة أوصي بها بقوة)

أقترح ألا تُحسب كل المؤشرات عند كل سؤال.

بعد كل عملية **Sync** للمحفظة، شغّل Job في الخلفية يقوم بحساب جميع المؤشرات الثقيلة مرة واحدة، ثم يخزنها في جداول مخصصة مثل:

```sql
portfolio_metrics
asset_metrics
network_metrics
transaction_metrics
counterparty_metrics
wallet_insights
wallet_risk_scores
wallet_health
```

بهذا تصبح أدوات مثل:

```text
analyze_portfolio
```

أو

```text
analyze_assets
```

تقرأ من هذه الجداول مباشرة بدلاً من إعادة تحليل آلاف المعاملات في كل مرة.

> **Cross-link:** هذه الجداول هي مصدر القراءة لمؤشرات **Portfolio Intelligence Engine** ([Part 2 §2.18](./02-ai-architecture.md#218-portfolio-intelligence-engine-الطبقة-العاشرة)) بعد المزامنة.

---

# 3.12 أهم اقتراح في الوثيقة حتى الآن

أرى أن **Sentinel لا ينبغي أن يعتمد على الـ LLM لإنتاج الـ Insights الأساسية**.

بل أنشئ داخل الـ Backend **Intelligence Engine** يطبق قواعد واضحة (Rules + SQL + Jobs) لاكتشاف:

* تغيرات كبيرة في التدفقات.
* زيادة غير طبيعية في الغاز.
* تركّز المحفظة.
* الأصول الخاملة.
* النشاط غير المعتاد.
* التغيرات في أسلوب التداول.
* المخاطر.

ثم يخزن النتائج في جدول مثل:

```sql
wallet_insights
```

كل Insight يحتوي على:

* `type`
* `severity`
* `title`
* `description`
* `evidence`
* `created_at`
* `confidence`
* `metadata`

وعندها يصبح دور الـ LLM هو:

* ترتيب الـ Insights.
* ربطها بسؤال المستخدم.
* شرحها بلغة طبيعية.
* الإجابة عن الأسئلة المركبة.

وليس اكتشافها من الصفر كل مرة.

> **Cross-link:** Backend Intelligence Engine يكتب؛ Portfolio Intelligence / Insight / Explanation Engines ([Part 2](./02-ai-architecture.md)) تقرأ وترتّب وتفسّر — الـ LLM لا يكتشف Insights من الصفر.

---

# ملخص الجزء الثالث

في هذا الجزء وضعنا المبادئ الأساسية لطبقة البيانات:

* فصل الـ AI تمامًا عن قاعدة البيانات.
* اعتماد Business Tools بدلاً من أدوات مرتبطة بالجداول.
* استخدام RPC وBundles لتقليل عدد الاستدعاءات.
* تقسيم الأدوات إلى Retrieval وAnalysis وIntelligence وExport وAlert وAction.
* إضافة طبقة Cache وIntelligence لتوليد مؤشرات ورؤى مسبقة.

---

## انتهى الجزء الثالث

بعد هذا الجزء أصبح لدينا:

* فلسفة Business Objects فقط (لا جداول / SQL للـ AI).
* طبقة الوصول: AI → Business Tools → Application Service → Supabase RPC → Postgres.
* كتالوج الأدوات الكامل بالمجموعات وأشكال الإرجاع.
* Smart Tool Planning عبر Bundles.
* Cache بعد Sync + Backend Intelligence Engine يكتب `wallet_insights`.

---

## الجزء التالي — Part 4 (Core System Prompt)

> **Status:** Recorded. Standalone: [`04-core-system-prompt.md`](./04-core-system-prompt.md). Also in [`SPEC.md`](./SPEC.md).

Part 4 هو **Operating System** للوكيل (ليس Prompt دردشة). Part 5 forthcoming: Analysis Framework.
