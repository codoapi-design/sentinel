# Sentinel AI Design Specification

# PART 6 — Data & Function Architecture

# Module 11 — Supabase Database Architecture & AI Function Calling Layer

> **Normative (Part 6 · Module 11).** هذه الوحدة هي **المرجع الرسمي (Authoritative Schema Reference)** لبنية قاعدة البيانات وطبقة استدعاء الدوال في Sentinel AI. Spec only — لا هجرات SQL ولا كود ولا تنفيذ مطلوب بهذه الوثيقة وحدها.

> **Part 6 scope:** هذا الجزء ليس امتداداً لـ Part 5 (Intelligence Modules)، بل جزء مستقل يصف **كيف تُخزَّن البيانات وكيف يصل إليها الوكيل**. Part 6 يحتوي **Module 11** (هذه الوثيقة). الوحدة التالية — **Module 12 — Full Sentinel AI Prompt Package** — تُسجَّل في [`07-01-production-prompt-package.md`](./07-01-production-prompt-package.md).

> **Cross-links:** Part 2 — Portfolio Intelligence Engine ([`02-ai-architecture.md`](./02-ai-architecture.md) §2.18). Part 3 — Business Tools / RPC / Tool Catalog / Bundles / Cache / Backend Intelligence Engine ([`03-data-layer-tool-calling.md`](./03-data-layer-tool-calling.md) §3.1–§3.12). Part 4 — Evidence & Confidence & No-Recommendation ([`04-core-system-prompt.md`](./04-core-system-prompt.md)). Part 5 — Intelligence Framework ([`05-00-intelligence-framework.md`](./05-00-intelligence-framework.md)) والوحدات 01–10 التي تُنتج المقاييس المخزَّنة هنا. Living Spec — [`SPEC.md`](./SPEC.md).

> **Next:** Module 12 — Full Sentinel AI Prompt Package ([`07-01-production-prompt-package.md`](./07-01-production-prompt-package.md)).

---

# 6.1 Database Philosophy

## القاعدة المركزية

```
AI must never read raw tables
```

الوكيل لا يقرأ الجداول الخام إطلاقاً.

---

## النمط المرفوض (Anti-Pattern)

```sql
SELECT * FROM transactions
```

لماذا هذا خطأ معماري وليس مجرد ممارسة سيئة؟

```
Expensive      تكلفة رموز عالية جداً

Slow           زمن استجابة مرتفع

Error-prone    أخطاء في التجميع والحساب

Huge context   آلاف الصفوف داخل نافذة السياق

Hallucination  الوكيل «يحسب» بدل أن يقرأ نتيجة محسوبة
```

الخلاصة:

```
كل عملية حساب يقوم بها الـ LLM

هي عملية يمكن أن تكون خاطئة
```

---

## الطبقات المعتمدة

```
Raw Data

↓

Analytics Layer

↓

AI Intelligence Layer

↓

AI Tools
```

| الطبقة | المسؤولية |
|--------|-----------|
| **Raw Data** | ما تم جلبه من البلوكشين كما هو: عمليات، أرصدة، أسعار |
| **Analytics Layer** | تجميع وحساب: مقاييس الأداء والتدفقات والتوزيع لكل فترة |
| **AI Intelligence Layer** | مخرجات وحدات Part 5: Scores / Patterns / Insights جاهزة |
| **AI Tools** | الواجهة الوحيدة التي يراها الوكيل (Business Tools → RPC) |

الوكيل يقف عند الطبقة الأخيرة فقط. هذا امتداد مباشر لقاعدة Part 3 §3.1: *الـ AI لا يعرف قاعدة البيانات*.

---

## المثال المرجعي — 10,000 عملية مقابل ملخص التداول

الطريقة الخاطئة:

```
User: كيف كان تداولي؟

↓

SELECT * FROM transactions   →  10,000 rows

↓

10,000 صف داخل الـ Context

↓

LLM يحاول الجمع والقسمة والتصنيف

↓

نتيجة بطيئة ومكلفة وقابلة للخطأ
```

الطريقة المعتمدة:

```
User: كيف كان تداولي؟

↓

get_trading_intelligence(wallet_id, '30d')

↓

Supabase RPC يقرأ trading_metrics المحسوبة مسبقاً

↓

JSON صغير:
{
  "trade_count": 47,
  "volume_usd": 68150,
  "avg_trade_size": 1450,
  "trading_result_usd": 1500,
  "appreciation_usd": 18500
}

↓

LLM يشرح فقط
```

الفرق:

```
10,000 rows        →   ~40 tokens

قابل للخطأ         →   محسوب في Postgres

ثوانٍ               →   أجزاء من الثانية
```

القاعدة النهائية:

```
Database calculates

AI explains
```

---

# 6.2 The Six Domains

قاعدة بيانات Sentinel مقسّمة إلى ستة نطاقات (Domains). كل جدول ينتمي إلى نطاق واحد فقط.

```
1. User & Subscription Domain

2. Wallet Data Domain

3. Blockchain Activity Domain

4. Intelligence Layer Domain

5. AI Layer Domain

6. Alert Layer Domain
```

---

| # | Domain | الغرض | أمثلة الجداول |
|---|--------|-------|----------------|
| 1 | **User & Subscription** | الهوية والخطط والحدود | `users`, `subscriptions` |
| 2 | **Wallet Data** | المحافظ وحالة المزامنة | `wallets`, `wallet_sync_status` |
| 3 | **Blockchain Activity** | البيانات الخام من الشبكات | `transactions`, `wallet_assets`, `portfolio_snapshots` |
| 4 | **Intelligence Layer** | مخرجات وحدات Part 5 | `portfolio_metrics`, `performance_metrics`, `flow_metrics`, `risk_scores`, `trading_metrics`, `network_metrics` |
| 5 | **AI Layer** | المحادثات والذاكرة | `ai_conversations`, `ai_messages`, `agent_memory` |
| 6 | **Alert Layer** | التنبيهات المولّدة | `alerts` |

بينهما نطاق مساعد للأطراف المقابلة (`counterparties`, `wallet_counterparties`) يخدم Blockchain Activity و Intelligence معاً (§6.6).

---

قاعدة التبعية:

```
Domain 3  يغذي  Domain 4

Domain 4  يغذي  Domain 6

Domain 5  يقرأ من Domain 4 عبر Tools فقط
```

لا يقرأ الوكيل من Domain 3 مباشرة أبداً.

---

# 6.3 User & Subscription Domain

---

## users

```sql
id                  uuid primary key

email               text unique

name                text

avatar_url          text

locale              text          -- ar / en

timezone            text

created_at          timestamptz

last_login_at       timestamptz
```

---

## subscriptions

```sql
id                  uuid primary key

user_id             uuid references users(id)

plan                text          -- free / pro / elite

status              text          -- active / past_due / canceled

wallet_limit        int

network_limit       int

features_json       jsonb

current_period_end  timestamptz

created_at          timestamptz

updated_at          timestamptz
```

---

### مثال الخطة

```json
{
  "plan": "pro",
  "status": "active",
  "wallet_limit": 10,
  "network_limit": 8,
  "features_json": {
    "ai_chat": true,
    "telegram_agent": true,
    "daily_report": true,
    "proactive_alerts": true,
    "history_days": 365
  },
  "current_period_end": "2026-01-31T00:00:00Z"
}
```

---

### قاعدة الحدود

```
كل Tool يتحقق من الحدود قبل التنفيذ

لا يُطبَّق الحد داخل الـ Prompt
```

الوكيل لا «يتذكر» أن المستخدم على خطة مجانية؛ الطبقة الخلفية هي التي تمنع أو تسمح، ثم تُرجع للوكيل سبباً واضحاً يشرحه للمستخدم.

---

# 6.4 Wallet Data Domain

---

## wallets

```sql
id                  uuid primary key

user_id             uuid references users(id)

address             text

label               text

networks            text[]        -- ['ethereum','base','arbitrum']

is_primary          boolean

is_active           boolean

first_seen_at       timestamptz

created_at          timestamptz
```

---

### مثال

```json
{
  "id": "w_9f3a",
  "user_id": "u_112",
  "address": "0x4f2a...9c1b",
  "label": "Main Wallet",
  "networks": ["ethereum", "base", "arbitrum"],
  "is_primary": true,
  "is_active": true
}
```

---

## wallet_sync_status

```sql
id                  uuid primary key

wallet_id           uuid references wallets(id)

network             text

status              text          -- idle / syncing / failed

last_synced_at      timestamptz

last_block          bigint

tx_count_synced     int

error_message       text

updated_at          timestamptz
```

---

### مثال

```json
{
  "wallet_id": "w_9f3a",
  "network": "ethereum",
  "status": "idle",
  "last_synced_at": "2026-01-14T09:12:00Z",
  "last_block": 21458122,
  "tx_count_synced": 1832,
  "error_message": null
}
```

---

### لماذا هذا الجدول مهم للوكيل؟

```
Data freshness  →  Confidence
```

إذا كانت آخر مزامنة قديمة أو فشلت لشبكة ما، تنخفض الثقة ويُذكر ذلك صراحة في الرد (Part 4 — Evidence & Confidence). كل Tool يُرجع `data_freshness` مستمدّاً من هذا الجدول.

---

# 6.5 Blockchain Activity Domain

---

## transactions

```sql
id                  uuid primary key

wallet_id           uuid references wallets(id)

network             text

tx_hash             text

block_number        bigint

timestamp           timestamptz

type                text          -- swap / transfer / contract / approve

direction           text          -- in / out / internal

asset_in            text

asset_out           text

amount_in           numeric

amount_out          numeric

usd_value           numeric

gas_fee_usd         numeric

counterparty_address text

status              text          -- success / failed

created_at          timestamptz
```

---

### مثال

```json
{
  "tx_hash": "0x8ac1...4d7e",
  "network": "base",
  "timestamp": "2026-01-12T18:44:10Z",
  "type": "swap",
  "direction": "internal",
  "asset_in": "USDC",
  "asset_out": "ETH",
  "amount_in": 2400,
  "amount_out": 0.71,
  "usd_value": 2400,
  "gas_fee_usd": 0.42,
  "counterparty_address": "0xdef1...5a2c",
  "status": "success"
}
```

---

## wallet_assets

الرصيد الحالي لكل أصل داخل كل محفظة وشبكة.

```sql
id                  uuid primary key

wallet_id           uuid references wallets(id)

network             text

asset_symbol        text

asset_address       text

balance             numeric

price_usd           numeric

value_usd           numeric

allocation_pct      numeric

cost_basis_usd      numeric

unrealized_pnl_usd  numeric

first_acquired_at   timestamptz

updated_at          timestamptz
```

---

### مثال

```json
{
  "asset_symbol": "ETH",
  "network": "ethereum",
  "balance": 12.4,
  "price_usd": 3180,
  "value_usd": 39432,
  "allocation_pct": 61.2,
  "cost_basis_usd": 28900,
  "unrealized_pnl_usd": 10532,
  "first_acquired_at": "2025-03-02T11:20:00Z"
}
```

---

## portfolio_snapshots

لقطة يومية لقيمة المحفظة — الأساس الزمني لكل تحليل أداء.

```sql
id                  uuid primary key

wallet_id           uuid references wallets(id)

snapshot_date       date

total_value_usd     numeric

asset_count         int

network_count       int

net_flow_usd        numeric

breakdown_json      jsonb

created_at          timestamptz
```

---

### مثال

```json
{
  "snapshot_date": "2026-01-14",
  "total_value_usd": 64420,
  "asset_count": 9,
  "network_count": 3,
  "net_flow_usd": 0,
  "breakdown_json": {
    "ETH": 39432,
    "USDC": 12100,
    "ARB": 6420,
    "other": 6468
  }
}
```

---

قاعدة:

```
Snapshots تُكتب مرة يومياً

ولا تُعاد كتابتها بأثر رجعي

أي تصحيح يُسجَّل كصف جديد
```

---

# 6.6 Counterparty Domain

---

## counterparties

سجل عالمي للعناوين المعروفة (يُشارَك بين كل المستخدمين، ولا يحتوي بيانات مستخدم).

```sql
id                  uuid primary key

address             text unique

network             text

label               text          -- Uniswap V3 Router / Binance Hot Wallet

type                text          -- dex / cex / bridge / protocol / contract / unknown

category            text

is_verified         boolean

risk_flag           text          -- none / caution / flagged

source              text

updated_at          timestamptz
```

---

## wallet_counterparties

علاقة المحفظة بالطرف المقابل — تُحسب من `transactions`.

```sql
id                  uuid primary key

wallet_id           uuid references wallets(id)

counterparty_id     uuid references counterparties(id)

interaction_count   int

total_volume_usd    numeric

first_interaction_at timestamptz

last_interaction_at timestamptz

dominant_direction  text          -- in / out / balanced

updated_at          timestamptz
```

---

### مثال

```json
{
  "counterparty": "Uniswap V3 Router",
  "type": "dex",
  "interaction_count": 38,
  "total_volume_usd": 41200,
  "first_interaction_at": "2025-06-11T08:00:00Z",
  "last_interaction_at": "2026-01-12T18:44:10Z",
  "dominant_direction": "balanced"
}
```

هذا النطاق يغذي Module 09 — Counterparty Intelligence، ويُستخدم في Trading و Risk لتصنيف نوع النشاط.

---

# 6.7 Intelligence Layer Domain

هذه الجداول ليست بيانات خام — بل **نتائج محسوبة** تنتجها وظائف Part 5 بعد كل مزامنة. هي المصدر الوحيد الذي تقرأ منه دوال RPC الخاصة بالوكيل.

---

## portfolio_metrics

```sql
id                  uuid primary key

wallet_id           uuid

period              text          -- 7d / 30d / 90d / all

total_value_usd     numeric

asset_count         int

network_count       int

top_asset           text

top_asset_pct       numeric

hhi_concentration   numeric

diversification_score numeric

stable_pct          numeric

structure_type      text

updated_at          timestamptz
```

---

## performance_metrics

```sql
id                  uuid primary key

wallet_id           uuid

period              text

start_value_usd     numeric

end_value_usd       numeric

value_change_usd    numeric

roi_pct             numeric

net_flow_adjusted_roi_pct numeric

max_drawdown_pct    numeric

best_day_pct        numeric

worst_day_pct       numeric

trend               text          -- rising / flat / declining

updated_at          timestamptz
```

---

## flow_metrics

```sql
id                  uuid primary key

wallet_id           uuid

period              text

deposits_usd        numeric

withdrawals_usd     numeric

net_flow_usd        numeric

internal_transfers_usd numeric

flow_pattern        text          -- accumulation / distribution / neutral

largest_inflow_usd  numeric

largest_outflow_usd numeric

updated_at          timestamptz
```

---

## risk_scores

```sql
id                  uuid primary key

wallet_id           uuid

overall_risk_score  numeric       -- 0–100

risk_level          text          -- low / moderate / elevated / high

concentration_risk  numeric

network_risk        numeric

asset_quality_risk  numeric

volatility_risk     numeric

liquidity_risk      numeric

data_quality_risk   numeric

factors_json        jsonb

confidence          text

updated_at          timestamptz
```

---

## trading_metrics

```sql
id                  uuid primary key

wallet_id           uuid

period              text

trade_count         int

volume_usd          numeric

avg_trade_size      numeric

frequency           numeric

rotation_rate       numeric

avg_holding_time_days numeric

distinct_assets_traded int

distinct_networks   int

distinct_protocols  int

trading_result_usd  numeric

appreciation_usd    numeric

trading_impact_ratio numeric

trading_profile     text

updated_at          timestamptz
```

---

## network_metrics

```sql
id                  uuid primary key

wallet_id           uuid

network             text

period              text

value_usd           numeric

value_pct           numeric

tx_count            int

gas_spent_usd       numeric

asset_count         int

is_dominant         boolean

activity_trend      text          -- expanding / stable / contracting

updated_at          timestamptz
```

---

## alerts

```sql
id                  uuid primary key

user_id             uuid

wallet_id           uuid

type                text          -- concentration / drawdown / large_flow / new_network / dormancy / anomaly

severity            text          -- info / warning / critical

title               text

description         text

evidence_json       jsonb

source_module       text          -- Module 01 … Module 10

confidence          text

status              text          -- new / seen / dismissed

created_at          timestamptz

delivered_at        timestamptz
```

---

قاعدة عامة لهذا النطاق:

```
لا يكتب فيها المستخدم

تكتبها Backend Intelligence Jobs فقط

ويقرؤها الوكيل عبر RPC فقط
```

---

# 6.8 AI Layer Domain

---

## ai_conversations

```sql
id                  uuid primary key

user_id             uuid references users(id)

wallet_id           uuid          -- nullable (محادثة عامة)

channel             text          -- web / telegram

title               text

message_count       int

last_message_at     timestamptz

created_at          timestamptz
```

قناة واحدة من اثنتين:

```
web       →  الوكيل داخل لوحة التحكم

telegram  →  وكيل تيليجرام
```

المحادثات مفصولة بالقناة، لكن **الذاكرة مشتركة على مستوى المستخدم** (`agent_memory`) حتى يبقى السياق متسقاً عبر القناتين.

---

## ai_messages

```sql
id                  uuid primary key

conversation_id     uuid references ai_conversations(id)

role                text          -- user / assistant / tool

content             text

tool_name           text

tool_args_json      jsonb

tool_result_json    jsonb

tokens_in           int

tokens_out          int

model               text

latency_ms          int

created_at          timestamptz
```

تسجيل `tool_name` و`tool_result_json` ليس ترفاً: هو ما يجعل كل إجابة **قابلة للتدقيق** — يمكن دائماً إثبات أن الرقم جاء من دالة لا من تخمين.

---

## agent_memory

```sql
id                  uuid primary key

user_id             uuid references users(id)

wallet_id           uuid          -- nullable

key                 text          -- preferred_period / language / focus_asset

value_json          jsonb

scope               text          -- user / wallet

source              text          -- explicit / inferred

expires_at          timestamptz

updated_at          timestamptz
```

قاعدة الذاكرة:

```
Memory يحفظ التفضيلات والسياق

ولا يحفظ الأرقام المالية أبداً
```

أي رقم يُعاد جلبه من الأدوات في كل مرة؛ الذاكرة لا تُستخدم كمصدر بيانات.

---

# 6.9 Supabase RPC Functions

ثماني دوال. هذه هي **كل** ما يستطيع الوكيل استدعاءه على مستوى البيانات.

كل دالة:

```
تتحقق من الملكية

تقرأ من Intelligence Layer

تُرجع JSON صغيراً وجاهزاً للشرح
```

---

## Function 1 — get_portfolio_overview

```sql
get_portfolio_overview(
  p_wallet_id uuid,
  p_period text default '30d'
) returns jsonb
```

```json
{
  "total_value_usd": 64420,
  "asset_count": 9,
  "network_count": 3,
  "top_asset": { "symbol": "ETH", "pct": 61.2, "value_usd": 39432 },
  "allocation": [
    { "symbol": "ETH", "pct": 61.2 },
    { "symbol": "USDC", "pct": 18.8 },
    { "symbol": "ARB", "pct": 10.0 }
  ],
  "structure_type": "concentrated",
  "diversification_score": 42,
  "period": "30d",
  "data_freshness": "2026-01-14T09:12:00Z",
  "confidence": "high"
}
```

---

## Function 2 — get_performance_analysis

```sql
get_performance_analysis(
  p_wallet_id uuid,
  p_period text default '30d'
) returns jsonb
```

```json
{
  "start_value_usd": 44420,
  "end_value_usd": 64420,
  "value_change_usd": 20000,
  "roi_pct": 45.0,
  "net_flow_adjusted_roi_pct": 45.0,
  "max_drawdown_pct": -12.4,
  "trend": "rising",
  "top_contributors": [
    { "symbol": "ETH", "contribution_usd": 15200 },
    { "symbol": "ARB", "contribution_usd": 3300 }
  ],
  "detractors": [
    { "symbol": "OP", "contribution_usd": -640 }
  ],
  "period": "30d",
  "confidence": "high"
}
```

---

## Function 3 — get_flow_analysis

```sql
get_flow_analysis(
  p_wallet_id uuid,
  p_period text default '30d'
) returns jsonb
```

```json
{
  "deposits_usd": 5000,
  "withdrawals_usd": 1200,
  "net_flow_usd": 3800,
  "internal_transfers_usd": 900,
  "flow_pattern": "accumulation",
  "largest_inflow": { "usd": 5000, "date": "2026-01-04" },
  "largest_outflow": { "usd": 1200, "date": "2026-01-09" },
  "period": "30d",
  "confidence": "high"
}
```

---

## Function 4 — get_risk_intelligence

```sql
get_risk_intelligence(
  p_wallet_id uuid
) returns jsonb
```

```json
{
  "overall_risk_score": 68,
  "risk_level": "elevated",
  "factors": [
    { "factor": "concentration", "score": 82, "detail": "ETH = 61.2% of portfolio" },
    { "factor": "network", "score": 74, "detail": "88% of value on one network" },
    { "factor": "asset_quality", "score": 40, "detail": "2 unverified assets, 1.4% of value" },
    { "factor": "volatility", "score": 61, "detail": "30d drawdown -12.4%" },
    { "factor": "liquidity", "score": 35, "detail": "low-liquidity assets = 2.1%" },
    { "factor": "data_quality", "score": 20, "detail": "all networks synced" }
  ],
  "top_risk": "concentration",
  "confidence": "high",
  "updated_at": "2026-01-14T09:15:00Z"
}
```

---

## Function 5 — get_trading_intelligence

```sql
get_trading_intelligence(
  p_wallet_id uuid,
  p_period text default '30d'
) returns jsonb
```

```json
{
  "trade_count": 47,
  "volume_usd": 68150,
  "avg_trade_size": 1450,
  "frequency_per_day": 1.6,
  "avg_holding_time_days": 4.2,
  "rotation_rate": 0.72,
  "trading_profile": "active_trader",
  "attribution": {
    "appreciation_usd": 18500,
    "trading_result_usd": 1500,
    "trading_impact_ratio": 0.075
  },
  "period": "30d",
  "confidence": "medium"
}
```

---

## Function 6 — get_network_intelligence

```sql
get_network_intelligence(
  p_wallet_id uuid,
  p_period text default '30d'
) returns jsonb
```

```json
{
  "networks": [
    { "network": "ethereum", "value_usd": 56600, "value_pct": 87.9, "tx_count": 21, "gas_spent_usd": 184.2, "activity_trend": "stable" },
    { "network": "base", "value_usd": 5100, "value_pct": 7.9, "tx_count": 22, "gas_spent_usd": 9.6, "activity_trend": "expanding" },
    { "network": "arbitrum", "value_usd": 2720, "value_pct": 4.2, "tx_count": 4, "gas_spent_usd": 3.1, "activity_trend": "contracting" }
  ],
  "dominant_network": "ethereum",
  "dominance_pct": 87.9,
  "total_gas_usd": 196.9,
  "period": "30d",
  "confidence": "high"
}
```

---

## Function 7 — get_counterparty_intelligence

```sql
get_counterparty_intelligence(
  p_wallet_id uuid,
  p_period text default '90d',
  p_limit int default 10
) returns jsonb
```

```json
{
  "counterparties": [
    { "label": "Uniswap V3 Router", "type": "dex", "interaction_count": 38, "volume_usd": 41200, "last_interaction_at": "2026-01-12" },
    { "label": "Binance Hot Wallet", "type": "cex", "interaction_count": 6, "volume_usd": 9800, "last_interaction_at": "2026-01-04" },
    { "label": "Unknown Contract", "type": "unknown", "interaction_count": 3, "volume_usd": 640, "last_interaction_at": "2025-12-28" }
  ],
  "type_breakdown": { "dex": 0.71, "cex": 0.17, "protocol": 0.08, "unknown": 0.04 },
  "unknown_exposure_pct": 4.0,
  "period": "90d",
  "confidence": "medium"
}
```

---

## Function 8 — get_wallet_alerts

```sql
get_wallet_alerts(
  p_wallet_id uuid,
  p_status text default 'new',
  p_limit int default 20
) returns jsonb
```

```json
{
  "alerts": [
    {
      "id": "al_7712",
      "type": "concentration",
      "severity": "warning",
      "title": "Concentration increased to 61.2%",
      "description": "ETH allocation rose from 54.0% to 61.2% during the last 30 days.",
      "evidence": { "previous_pct": 54.0, "current_pct": 61.2, "period": "30d" },
      "source_module": "Module 03",
      "confidence": "high",
      "created_at": "2026-01-14T09:16:00Z"
    }
  ],
  "count_new": 1,
  "count_total": 12
}
```

---

قاعدة موحّدة لكل الدوال الثماني:

```
كل استجابة تحتوي

period + confidence + data_freshness

ولا تحتوي صفوفاً خاماً
```

---

# 6.10 OpenAI Function Calling Schema

الوكيل يرى الدالة على هذا الشكل — لا أكثر:

```json
{
  "type": "function",
  "function": {
    "name": "get_risk_intelligence",
    "description": "Returns the precomputed risk profile of a wallet: overall risk score, risk level, and the individual risk factors with supporting evidence. Use this when the user asks about risk, weaknesses, concentration, exposure, or portfolio safety. Never compute risk yourself.",
    "parameters": {
      "type": "object",
      "properties": {
        "wallet_id": {
          "type": "string",
          "description": "The wallet identifier from the current session context."
        }
      },
      "required": ["wallet_id"],
      "additionalProperties": false
    }
  }
}
```

---

ملاحظات إلزامية على الوصف (`description`):

```
1. يذكر ماذا تُرجع الدالة

2. يذكر متى تُستخدم

3. يذكر صراحة: لا تحسب بنفسك
```

ولا يُمرَّر `user_id` من الوكيل أبداً؛ يُستنتج من الجلسة في الطبقة الخلفية (§6.12).

---

# 6.11 Tool Selection Architecture

```
User Question

↓

AI (intent detection)

↓

Function Selection

↓

Business Tool Layer      (Part 3 §3.2)

↓

Supabase RPC

↓

Postgres  →  Intelligence Layer tables

↓

JSON Result

↓

AI Explanation
```

---

مثال كامل:

```
User: هل محفظتي معرضة لمخاطر؟

↓

Intent: Risk Assessment

↓

get_risk_intelligence(wallet_id)

↓

RPC → risk_scores

↓

{ "overall_risk_score": 68, "top_risk": "concentration", ... }

↓

Response:

«يبلغ مستوى المخاطر الحالي 68 من 100 (مرتفع نسبياً).
العامل الأكبر هو التركّز: يمثل ETH نحو 61.2% من قيمة المحفظة،
كما أن 87.9% من القيمة موجودة على شبكة واحدة.»
```

لاحظ:

```
الوكيل لم يحسب شيئاً

الوكيل شرح ما حسبته قاعدة البيانات
```

---

## قواعد الاختيار

```
سؤال واحد  →  دالة واحدة كلما أمكن

سؤال مركّب  →  عدة دوال ثم دمج

لا توجد دالة مناسبة  →  قل ذلك، ولا تخترع
```

هذا يتوافق مع Smart Tool Planning و Bundles في Part 3 §3.9–§3.10.

---

# 6.12 Security Model

---

## Row Level Security

```
RLS مفعّل على كل جدول يحتوي بيانات مستخدم
```

```sql
-- نموذج المبدأ (توضيحي، ليس هجرة)
policy: wallets_select_own
  using (user_id = auth.uid())

policy: transactions_select_own
  using (
    wallet_id in (
      select id from wallets where user_id = auth.uid()
    )
  )
```

---

## Wallet Ownership Check

كل دالة RPC تبدأ بالتحقق نفسه:

```
1. استخراج user_id من auth.uid()

2. التأكد أن p_wallet_id يخص هذا المستخدم

3. عند الفشل: خطأ صريح — لا نتيجة فارغة
```

الفرق مهم:

```
نتيجة فارغة   →  الوكيل قد يقول «لا توجد بيانات»

خطأ صريح      →  الوكيل يقول «لا يمكن الوصول إلى هذه المحفظة»
```

---

## User Isolation

```
الوكيل لا يستقبل user_id كوسيط

الوكيل لا يستطيع تغيير هوية المستخدم

الوكيل لا يستطيع الاستعلام عن محفظة ليست في سياق الجلسة
```

طبقات العزل الثلاث:

| الطبقة | الحماية |
|--------|---------|
| **Session** | `user_id` يُحقن من الخادم، لا من نموذج اللغة |
| **RPC** | فحص الملكية داخل كل دالة |
| **Postgres RLS** | خط الدفاع الأخير حتى لو أخطأت الطبقات فوقها |

---

## قواعد إضافية

```
لا SQL ديناميكي مبني على نص المستخدم

لا تمرير أسماء جداول كوسائط

كل الدوال SECURITY DEFINER مع فحص ملكية صريح

تسجيل كل استدعاء أداة في ai_messages
```

---

# 6.13 Edge Functions

ثلاث وظائف خلفية تعمل خارج مسار المحادثة.

---

## sync_wallet_data()

```
Trigger: كل N دقيقة + عند الطلب اليدوي

1. قراءة wallets النشطة
2. جلب العمليات والأرصدة الجديدة لكل شبكة
3. الكتابة إلى transactions / wallet_assets
4. كتابة portfolio_snapshot اليومي
5. تحديث wallet_sync_status
6. تشغيل وظائف Intelligence (Part 5) لتحديث جداول §6.7
```

---

## generate_daily_report()

```
Trigger: يومياً (حسب timezone المستخدم)

1. قراءة Intelligence Layer (لا حساب جديد)
2. تكوين ملخص: الأداء + التدفقات + المخاطر + التغيرات
3. توليد النص عبر الوكيل في وضع التقرير
4. الإرسال عبر البريد / تيليجرام حسب الخطة
```

---

## process_alerts()

```
Trigger: بعد كل مزامنة ناجحة

1. مقارنة الفترة الحالية بالسابقة
2. تطبيق شروط الأنماط المعرّفة في Part 5
3. إنشاء صفوف في alerts (مع evidence_json + confidence)
4. منع التكرار (نفس النوع + نفس النافذة الزمنية)
5. التسليم ثم تحديث delivered_at
```

---

قاعدة:

```
Edge Functions تحسب وتكتب

الوكيل يقرأ فقط
```

---

# 6.14 Final Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                        BLOCKCHAIN                        │
│         Ethereum · Base · Arbitrum · Others              │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
                 ┌────────────────────┐
                 │  sync_wallet_data  │   (Edge Function)
                 └──────────┬─────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                     RAW DATA LAYER                       │
│   transactions · wallet_assets · portfolio_snapshots     │
│              wallet_sync_status · counterparties         │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
                 ┌────────────────────┐
                 │ Intelligence Jobs  │   (Part 5 Modules 01–10)
                 └──────────┬─────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  INTELLIGENCE LAYER                      │
│  portfolio_metrics · performance_metrics · flow_metrics  │
│  risk_scores · trading_metrics · network_metrics         │
│  wallet_counterparties · alerts                          │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   SUPABASE RPC LAYER                     │
│  get_portfolio_overview   get_performance_analysis       │
│  get_flow_analysis        get_risk_intelligence          │
│  get_trading_intelligence get_network_intelligence       │
│  get_counterparty_intelligence   get_wallet_alerts       │
│              + RLS + ownership checks                    │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
                 ┌────────────────────┐
                 │  Business Tools    │   (Part 3 §3.2)
                 └──────────┬─────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                      SENTINEL AI                         │
│        Function Calling  →  Explanation  →  Answer       │
│         ai_conversations · ai_messages · agent_memory    │
└───────────────────────────┬─────────────────────────────┘
                            │
             ┌──────────────┴──────────────┐
             ▼                             ▼
      ┌─────────────┐              ┌──────────────┐
      │  Dashboard  │              │   Telegram   │
      │   (web)     │              │    Agent     │
      └─────────────┘              └──────────────┘
```

---

# 6.15 Outcome

بعد هذه الوحدة أصبح لدينا:

```
✅ فلسفة قاعدة بيانات صريحة: Database calculates, AI explains
✅ رفض نمط SELECT * FROM transactions مع تبرير هندسي
✅ أربع طبقات: Raw → Analytics → AI Intelligence → AI Tools
✅ ستة نطاقات (Domains) بحدود واضحة
✅ جداول المستخدم والاشتراك مع مثال حدود الخطة
✅ جداول المحافظ والمزامنة كمصدر Data Freshness
✅ جداول النشاط الخام مع أمثلة JSON
✅ نطاق الأطراف المقابلة (عالمي + على مستوى المحفظة)
✅ سبعة جداول لطبقة الذكاء تُغذيها وحدات Part 5
✅ طبقة محادثات وذاكرة قابلة للتدقيق
✅ ثماني دوال RPC بتوقيعات ومخرجات JSON محددة
✅ مثال OpenAI Function Calling Schema كامل
✅ مسار اختيار الأداة من السؤال إلى الشرح
✅ نموذج أمان بثلاث طبقات (Session / RPC / RLS)
✅ ثلاث Edge Functions للمزامنة والتقارير والتنبيهات
✅ مخطط تدفق البيانات النهائي
✅ Reconciliation مع المخطط القائم والأجزاء السابقة (§6.16)
```

---

# 6.16 Reconciliation with Existing Sentinel Schema & Prior Parts

> **مهم.** هذه الفقرة تُسجَّل صراحة لأن الوثيقة تُبنى على مراحل، ولأن التطبيق يحتوي بالفعل على مخطط قاعدة بيانات حقيقي.

---

## 1. Part 6 هو المرجع الرسمي للمخطط

```
Part 6 §6.3–§6.8 = Authoritative Schema Reference
```

أسماء الجداول الواردة في وحدات Part 5 كانت **توضيحية ضمن سياق كل وحدة**، وليست مخططاً نهائياً. عند أي اختلاف في التسمية، تُعتمد أسماء Part 6.

---

### فروق التسمية التي يجب توحيدها عند التنفيذ

| ورد في أجزاء سابقة | المعتمد في Part 6 |
|---------------------|--------------------|
| `portfolio_risk_scores` | `risk_scores` |
| `counterparty_relationships` | `wallet_counterparties` |
| `asset_metrics` | يُغطى ضمن `wallet_assets` + `portfolio_metrics` |
| `portfolio_health` | يُغطى ضمن `risk_scores` (score + level + factors) |
| `alert_preferences` | لا يوجد جدول مقابل في Part 6 — بند تنفيذ مفتوح |
| `alert_history` | `alerts` (مع `status` و`delivered_at`) |
| `wallet_insights` | يبقى مفهوم Part 3 §3.12 للـ Proactive Insights؛ علاقته بـ `alerts` يجب حسمها في التنفيذ |

هذه قائمة **تعارضات تسمية مرصودة**، لا قرارات ترحيل. أي توحيد فعلي يتم في مرحلة التنفيذ، لا في هذه الوثيقة.

---

## 2. توحيد كتالوج الأدوات

ثلاثة مصادر تصف الأدوات حالياً:

```
Part 3 §3.7    كتالوج Business Tools + Bundles

Module 10      قائمة أدوات الوكيل (10 أدوات)

Part 6 §6.9    توقيعات RPC (8 دوال)
```

القاعدة:

```
Module 12 / التنفيذ يشتق مخططاً واحداً موثوقاً للأدوات
```

ويبقى ترتيب الطبقات من Part 3 §3.2 حاكماً بلا تغيير:

```
AI  →  Business Tools  →  Application Service  →  Supabase RPC  →  Postgres
```

أي أن دوال §6.9 هي الطرف السفلي من السلسلة، وليست الواجهة التي يراها الوكيل مباشرة؛ الأسماء قد تتطابق، لكن الطبقتين تبقيان منفصلتين.

---

## 3. التوافق مع المخطط القائم في التطبيق

التطبيق الحالي يحتوي بالفعل على جداول وهجرات حقيقية، من بينها لقطات المحفظة ودفعات عائد الاستثمار (Investment Return Lots) ونموذج مزامنة/محافظ قائم.

القاعدة:

```
التنفيذ يربط جداول هذه الوثيقة بالمخطط القائم

ولا ينشئ جداول مكررة
```

وهذا الربط (Mapping) **بند تنفيذ مفتوح** يُحسم عند بدء العمل الهندسي، وليس جزءاً من هذه الوثيقة. لا تفترض هذه الوثيقة أي تفاصيل إضافية عن المخطط القائم بخلاف ضرورة الربط.

---

# انتهت الوحدة الحادية عشرة — Database & Function Architecture

أصبح لدى Sentinel الآن **عمود فقري للبيانات**: مكان محدد لكل رقم، ودالة محددة لكل سؤال، وحدود أمان واضحة، وقاعدة واحدة لا تتغير:

```
Database calculates

AI explains
```

---

## الجزء القادم

سننتقل إلى:

# Module 12 — Full Sentinel AI Prompt Package

تُسجَّل في [`07-01-production-prompt-package.md`](./07-01-production-prompt-package.md)، وتحتوي على:

* Production System Prompt (النسخة النهائية القابلة للنشر)
* Developer Prompt
* Tool Usage Instructions
* Response Templates
* Guardrails
* Telegram Agent Prompt
* Dashboard Embedded Agent Prompt

وهي الوحدة التي تحوّل كل ما سبق إلى **حزمة تشغيل جاهزة**.
