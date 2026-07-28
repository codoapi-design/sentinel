# Sentinel AI Design Specification

# Part 2 — AI Architecture

> **Normative.** This part is the engineering Source of Truth for Sentinel AI architecture. Implementation later must follow this architecture. No runtime agents, APIs, or tools are required by this document alone.

> **Related:** Living Spec — [`SPEC.md`](./SPEC.md) (Parts 1–4). Part 3 — [`03-data-layer-tool-calling.md`](./03-data-layer-tool-calling.md). Part 4 — [`04-core-system-prompt.md`](./04-core-system-prompt.md). Part 5 forthcoming: Analysis Framework.

---

# 2.1 Architecture Philosophy

أول قرار معماري في Sentinel هو:

> **Sentinel ليس LLM.**

الـ LLM مجرد محرك استدلال (Reasoning Engine).

أما Sentinel فهو نظام كامل مكون من عدة محركات.

الـ AI هو جزء واحد فقط.

ولهذا السبب فإن معمارية Sentinel يجب أن تكون **Tool-first** وليس **LLM-first**.

أي أن النظام يعتمد على البيانات والأدوات أولاً، ثم يستخدم الـ LLM لفهمها وتفسيرها.

وليس العكس.

---

# 2.2 High Level Architecture

المعمارية العامة ستكون بالشكل التالي:

```text
                 User
                   │
                   ▼
      ┌────────────────────────┐
      │  API Gateway / Chat API │
      └────────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │   Orchestrator Agent │
        └────────────┬─────────┘
                     │
     ┌───────────────┼────────────────┐
     ▼               ▼                ▼
Intent Engine   Context Engine   Memory Engine
                     │
                     ▼
           Tool Planning Engine
                     │
                     ▼
             Tool Execution Layer
                     │
         ┌───────────┴────────────┐
         ▼                        ▼
     Supabase                 External APIs
                     │
                     ▼
            Analytics Engine
                     │
                     ▼
      Portfolio Intelligence Engine
                     │
                     ▼
             Insight Engine
                     │
                     ▼
         Explanation Engine
                     │
                     ▼
              Response Builder
                     │
                     ▼
                  User
```

> **Note:** The **Portfolio Intelligence Engine** (layer 10) sits between Analytics and Insight. See §2.18.

---

# 2.3 لماذا لا نجعل الـ LLM يستدعي Supabase مباشرة؟

لأن هذا يجعل النظام:

* أبطأ.
* أغلى.
* أقل قابلية للصيانة.
* أكثر عرضة للهلوسة.

بدلاً من ذلك:

```text
LLM

↓

حدد البيانات المطلوبة

↓

Tool Planner

↓

نفذ الأدوات

↓

ارجع النتائج

↓

LLM يحللها
```

لاحظ أن الـ LLM **لا يعرف SQL**.

ولا يعرف أسماء الجداول.

ولا يعرف العلاقات.

كل ذلك موجود داخل طبقة الأدوات.

---

# 2.4 مكونات النظام

سنقسم النظام إلى تسعة محركات رئيسية في مسار الطلب، مع طبقة عاشرة (Portfolio Intelligence) تعمل خلفياً وتُغذّي Insight — انظر §2.18.

---

## 1. Orchestrator

هو العقل الإداري.

وظيفته ليست التحليل.

بل إدارة بقية النظام.

مسؤول عن:

* فهم السؤال.
* تحديد نوعه.
* تحديد الوكلاء المطلوبين.
* تحديد الأدوات.
* ترتيب التنفيذ.
* دمج النتائج.

هو لا يحسب أي شيء.

---

## 2. Intent Engine

أول شيء يحدث بعد وصول الرسالة.

وظيفته معرفة نية المستخدم.

مثلاً

```text
"What happened today?"
```

↓

Intent

```text
Timeline Analysis
```

---

```text
"Show my ROI"
```

↓

```text
ROI Query
```

---

```text
"Compare ETH and SOL"
```

↓

```text
Comparison
```

---

```text
"Export PDF"
```

↓

```text
Action Request
```

---

كل سؤال يجب أن يصنف قبل أي Tool Call.

---

# 2.5 Intent Taxonomy

Sentinel يدعم هذه الفئات الأساسية:

```text
Portfolio Overview

Portfolio Analysis

Transaction Search

Asset Analysis

ROI Analysis

Flow Analysis

Network Analysis

Counterparty Analysis

Trading Analysis

Performance Analysis

Timeline Analysis

Comparison

Export

Alert Query

Wallet Settings

General Crypto Knowledge

Conversation

Help
```

أي سؤال يجب أن ينتمي إلى واحدة أو أكثر من هذه الفئات.

---

# 2.6 Context Engine

هذه الطبقة مسؤولة عن الإجابة على سؤال واحد:

> ما هو السياق الحالي؟

مثال:

إذا كان المستخدم داخل صفحة Assets.

وقال:

> Why is this dropping?

السياق يقول

"this"

يقصد

الأصل المفتوح.

وليس المحفظة.

---

إذا كان داخل صفحة Networks.

وقال

> Compare with last month.

السياق هو

الشبكة الحالية.

---

السياق يأتي من:

* الصفحة الحالية.
* الفلاتر.
* الأصل المحدد.
* الشبكة المحددة.
* الفترة الزمنية.
* المحفظة النشطة.
* الرسالة السابقة.

---

# 2.7 Memory Engine

هذه ليست ذاكرة طويلة الأمد.

بل Session Memory.

تحتفظ بـ

* آخر Wallet.
* آخر أصل.
* آخر فترة زمنية.
* آخر شبكة.
* آخر مقارنة.
* آخر تقرير.

حتى لا يكرر المستخدم كل شيء.

مثلاً

> Compare with last month.

يعرف ماذا يقارن.

---

# 2.8 Tool Planner

هذه الطبقة من أهم الطبقات.

لا تنفذ أي Tool.

بل تخطط.

مثلاً

السؤال

> Why did my ROI decrease?

Tool Planner يقرر

```text
Portfolio Summary

ROI

Snapshots

Asset Performance

Recent Transactions
```

ثم يرسل الخطة للتنفيذ.

---

مثال آخر

> Largest outgoing transaction

↓

الخطة

```text
Transactions

Sort Desc

Limit 1
```

---

# 2.9 Tool Execution Layer

هذه الطبقة لا تعرف أي شيء عن الذكاء الاصطناعي.

هي مجرد Executor.

تستقبل:

```json
{
  "tool": "get_transactions",
  "filters": {
    "direction": "outgoing",
    "limit": 1
  }
}
```

ثم تنفذ.

ثم تعيد JSON فقط.

---

# 2.10 لماذا نمنع الـ LLM من كتابة SQL؟

لأن SQL يجب أن يكون محصوراً داخل طبقة مستقلة.

بدلاً من

```text
LLM

↓

SQL
```

سنستخدم

```text
LLM

↓

Tool

↓

RPC

↓

Supabase
```

هذا أكثر أماناً.

---

# 2.11 Analytics Engine

هذه أهم طبقة بعد قاعدة البيانات.

الـ LLM لا يحلل البيانات الخام.

بل يحلل مؤشرات جاهزة.

مثلاً

بدلاً من إرسال

٢٠٠٠ معاملة.

يرسل Analytics Engine

```json
{
  "largest_transfer": 42000,
  "average_transfer": 312,
  "swap_ratio": 0.62,
  "gas_average": 18,
  "gas_trend": "+21%",
  "most_used_network": "Ethereum",
  "most_active_day": "Monday"
}
```

لاحظ الفرق.

---

# 2.12 لماذا؟

لأن

الـ LLM ممتاز في

Reasoning

وليس

Aggregation.

الحسابات يجب أن تتم خارج الـ LLM.

---

# 2.13 Insight Engine

Analytics يجيب

> ماذا حدث؟

Insight Engine يجيب

> لماذا يهم؟

مثلاً

Analytics

```text
ETH Allocation = 81%
```

Insight

```text
Portfolio concentration risk increased.
```

---

Analytics

```text
Gas = +55%
```

Insight

```text
Trading efficiency decreased.
```

---

Analytics

```text
No activity for 120 days
```

Insight

```text
Wallet appears dormant.
```

---

# 2.14 Explanation Engine

بعد استخراج الـ Insights.

يأتي دور التفسير.

كل Insight يجب أن يتحول إلى أربع طبقات:

```text
Observation

↓

Interpretation

↓

Why It Matters

↓

Supporting Evidence
```

مثال

Observation

```text
Most trading occurred on Base.
```

↓

Interpretation

```text
Your activity has shifted from Ethereum to Base.
```

↓

Importance

```text
This reduced average gas costs while maintaining similar trading volume.
```

↓

Evidence

```text
Trading Volume

Gas Trend

Network Distribution
```

---

# 2.15 Response Builder

آخر طبقة.

وظيفتها

بناء الرد النهائي.

كل رد يتكون من:

```text
Executive Summary

↓

Key Insights

↓

Detailed Explanation

↓

Evidence

↓

Things To Watch
```

وليس مجرد فقرة.

---

# 2.16 أنواع الاستجابة

Sentinel يدعم أربعة أوضاع للرد.

### Quick Answer

سؤال بسيط.

إجابة مختصرة.

---

### Analytical

تحليل متوسط.

---

### Deep Analysis

تحليل كامل.

---

### Executive Report

تقرير احترافي.

---

# 2.17 قاعدة ذهبية (Golden Pipeline)

أي سؤال يجب أن يمر بهذا الـ Pipeline:

```text
User Question

↓

Intent Detection

↓

Context Resolution

↓

Memory Resolution

↓

Tool Planning

↓

Tool Execution

↓

Analytics

↓

Portfolio Intelligence

↓

Insights

↓

Explanation

↓

Response Generation

↓

User
```

لا يجوز تجاوز أي مرحلة إلا إذا كان السؤال لا يحتاج إلى بيانات (مثل سؤال عام عن مفهوم في الكريبتو).

---

# 2.18 Portfolio Intelligence Engine (الطبقة العاشرة)

طبقة عاشرة بين **Analytics Engine** و**Insight Engine** اسمها **Portfolio Intelligence Engine**.

هذه الطبقة لا تستجيب لأسئلة المستخدم مباشرة، بل تعمل في الخلفية بعد كل مزامنة أو تحديث مهم، وتقوم بحساب مؤشرات جاهزة مثل:

* Concentration Score
* Diversification Score
* Activity Score
* Gas Efficiency Score
* Trading Style Classification
* Wallet Health Score
* Capital Flow Trend
* Dormancy Detection
* Network Dependency Score
* Stablecoin Exposure
* Risk Flags

ثم تُخزَّن هذه النتائج في قاعدة البيانات أو في Cache.

الفائدة أن الوكيل عند سؤال مثل:

> "كيف تبدو محفظتي؟"

لن يبدأ بالحساب من الصفر، بل سيقرأ مؤشرات جاهزة، ثم يفسرها ويضعها في سياقها. هذا يقلل زمن الاستجابة بشكل كبير، ويجعل التحليلات متسقة في الموقع، والشات، وتيليجرام، والتقارير.

---

## انتهى الجزء الثاني

بعد هذا الجزء أصبح لدينا:

* معمارية النظام بالكامل.
* توزيع المسؤوليات بين المحركات.
* تدفق البيانات من المستخدم حتى الرد.
* فصل واضح بين التحليل، التفسير، وتنفيذ الأدوات.
* أساس قوي سنبني عليه بقية المواصفات.
* الطبقة العاشرة: Portfolio Intelligence Engine (مؤشرات جاهزة post-sync).

---

## الجزء التالي — Part 3 (Data Layer & Tool Calling Architecture)

> **Status:** Recorded. Standalone copy: [`03-data-layer-tool-calling.md`](./03-data-layer-tool-calling.md). Also in [`SPEC.md`](./SPEC.md).

Part 3 يغطي Business Tools، RPC، Tool Catalog، Bundles، Cache، وBackend Intelligence Engine. Part 4 recorded: [`04-core-system-prompt.md`](./04-core-system-prompt.md). Part 5 forthcoming: Analysis Framework.
