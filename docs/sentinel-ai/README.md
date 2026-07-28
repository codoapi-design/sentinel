# Sentinel AI — Design Spec

This folder holds the **Sentinel AI Design Specification**, the engineering **Source of Truth (SoT)** for Sentinel AI.

| Part | Document | Status |
|------|----------|--------|
| **Part 1** — Vision, Philosophy & Core Principles | [`SPEC.md`](./SPEC.md) | Normative (v1.0) |
| **Part 2** — AI Architecture | [`02-ai-architecture.md`](./02-ai-architecture.md) · also in [`SPEC.md`](./SPEC.md) | Normative (v1.0) |
| **Part 3** — Data Layer & Tool Calling Architecture | [`03-data-layer-tool-calling.md`](./03-data-layer-tool-calling.md) · also in [`SPEC.md`](./SPEC.md) | Normative (v1.0) |
| **Part 4** — Core System Prompt | [`04-core-system-prompt.md`](./04-core-system-prompt.md) · also in [`SPEC.md`](./SPEC.md) | Normative (v1.0) |
| **Part 5** — Intelligence Framework (foundation) | [`05-00-intelligence-framework.md`](./05-00-intelligence-framework.md) · also in [`SPEC.md`](./SPEC.md) | Normative foundation (v1.0) |
| **Part 5 · Module 01** — Performance Intelligence | [`05-01-performance-intelligence.md`](./05-01-performance-intelligence.md) · also in [`SPEC.md`](./SPEC.md) | **Complete** |
| **Part 5 · Module 02** — Flow Intelligence | [`05-02-flow-intelligence.md`](./05-02-flow-intelligence.md) · also in [`SPEC.md`](./SPEC.md) | **Complete** |
| **Part 5 · Module 03** — Portfolio Intelligence | [`05-03-portfolio-intelligence.md`](./05-03-portfolio-intelligence.md) · also in [`SPEC.md`](./SPEC.md) | **Complete** |
| **Part 5 · Module 04** — Asset Intelligence | [`05-04-asset-intelligence.md`](./05-04-asset-intelligence.md) · also in [`SPEC.md`](./SPEC.md) | **Complete** |
| **Part 5 · Module 05** — Risk Intelligence | [`05-05-risk-intelligence.md`](./05-05-risk-intelligence.md) · also in [`SPEC.md`](./SPEC.md) | **Complete** |
| **Part 5 · Module 06** — Trading Intelligence | [`05-06-trading-intelligence.md`](./05-06-trading-intelligence.md) · also in [`SPEC.md`](./SPEC.md) | **Complete** |
| **Part 5 · Module 07** — Network Intelligence | [`05-07-network-intelligence.md`](./05-07-network-intelligence.md) · also in [`SPEC.md`](./SPEC.md) | **Complete** |
| **Part 5 · Module 08** — Counterparty Intelligence | [`05-08-counterparty-intelligence.md`](./05-08-counterparty-intelligence.md) · also in [`SPEC.md`](./SPEC.md) | **Complete** |
| **Part 5 · Module 09** — Alert Intelligence Engine | [`05-09-alert-intelligence.md`](./05-09-alert-intelligence.md) · also in [`SPEC.md`](./SPEC.md) | **Complete** |
| **Part 5 · Module 10** — AI Agent Architecture & System Prompt | [`05-10-agent-architecture.md`](./05-10-agent-architecture.md) · also in [`SPEC.md`](./SPEC.md) | **Complete** |
| **Part 6** — Data & Function Architecture · **Module 11** — Supabase Database Architecture & AI Function Calling Layer | [`06-01-database-function-architecture.md`](./06-01-database-function-architecture.md) · also in [`SPEC.md`](./SPEC.md) | **Complete** |
| **Part 7** — AI Prompt Architecture · **Module 12** — Production Prompt Package | [`07-01-production-prompt-package.md`](./07-01-production-prompt-package.md) · also in [`SPEC.md`](./SPEC.md) | **Complete** |
| **Part 8** — Deferred & Rejected Modules (decision log) | [`08-deferred-modules.md`](./08-deferred-modules.md) | Normative decision log (v1.1) |
| **Part 9** — Pricing Layer (providers, failover, caching, backfill) | [`09-pricing-layer.md`](./09-pricing-layer.md) | Implementation spec (shipped) |

> ✅ **Specification v1.0 complete (Parts 1–7).** All twelve modules are recorded. What follows is **implementation**, not specification.

> 🔁 **v1.1 amendments (additive).** v1.0 يبقى كاملاً وسارياً. أُضيفت ثلاثة تعديلات ملزمة + سجل قرارات، بلا حذف أو إعادة ترتيب:
>
> | Amendment | أين |
> |-----------|-----|
> | **Unified Engine Output Contract** — ظرف مخرجات موحّد لكل محرك ذكاء (`engine` · `status` · `metrics` · `patterns` · `findings` · `evidence` · `confidence` · `dataQuality` · `recommendedFollowup`) | [`05-00-intelligence-framework.md`](./05-00-intelligence-framework.md) §5.0.6.1 · مُشار إليه في [`SPEC.md`](./SPEC.md) |
> | **Engine Evaluation Criteria** — Accuracy · Evidence Usage · Relevance · Cost · Latency + golden-input fixtures + حتمية المحركات | [`07-01-production-prompt-package.md`](./07-01-production-prompt-package.md) §7.10.1 |
> | **`detect_anomalies`** — أداة من الدرجة الأولى تجمّع أنماط Risk §5.72 + Flow §5.21 + Counterparty §5.123 (بلا منطق كشف جديد) | [`03-data-layer-tool-calling.md`](./03-data-layer-tool-calling.md) §3.7 · المجموعة الحادية عشرة · [`07-01-production-prompt-package.md`](./07-01-production-prompt-package.md) §7.4.1 |
> | **Deferred & Rejected Modules** — سجل قرارات: Market Context + Security مؤجَّلان؛ بنية Multi-Agent الهرمية **مرفوضة** مع محفّز إعادة تقييم | [`08-deferred-modules.md`](./08-deferred-modules.md) |

**Living Spec:** [`SPEC.md`](./SPEC.md) includes Part 1 + Part 2 + Part 3 + Part 4 + Part 5 foundation + Modules 01–08 (Performance + Flow + Portfolio + Asset + Risk + Trading + Network + **Counterparty**) + **Module 09 — Alert Intelligence Engine** + **Module 10 — AI Agent Architecture & System Prompt** + **Part 6 — Data & Function Architecture · Module 11** + **Part 7 — AI Prompt Architecture · Module 12**.

Implementation must not contradict the Spec.

- **Part 1** — behavior and philosophy
- **Part 2** — Tool-first architecture, engines, intent taxonomy, response modes, golden pipeline, Portfolio Intelligence Engine
- **Part 3** — Business Tools (not table-level), RPC stack, Tool Catalog, Bundles, Cache metrics, Backend Intelligence Engine (`wallet_insights`)
- **Part 4** — agent **Operating System** (identity, Increase Understanding, SoT roles, thinking pipeline, tools/conversation/reasoning, confidence, formatting, Negative Prompt, Behavioral Hierarchy, Analysis Modes). The **canonical runtime system prompt** will be derived from Part 4 later — **no app prompt implementation yet**
- **Part 5** — Intelligence axes/modules (not page-based analysis), unified Module Template, composition model, Reactive + Proactive modes; **Modules 01–08** (Performance + Flow + Portfolio + Asset + Risk + Trading + Network + **Counterparty** — counterparty classification 6 types, relationship metrics, Relationship Score 30/30/20/20, 6 patterns, network graph + importance ranking, custom client names take precedence over raw addresses per `resolveCounterpartyDisplay`) recorded, plus **Module 09 — Alert Intelligence Engine** (alert layers, enrichment pipeline, Importance Score, 7 categories, `ShouldNotify()` filtering, `alert_preferences` + Investor/Trader/Security modes, severity language rules, Telegram Daily Brief + Weekly Report, alert tables & tools — mapped to the shipped Telegram/Email alert toggles §5.141.1) and **Module 10 — AI Agent Architecture & System Prompt** (agent layers, tool calling, hallucination prevention, response standard, memory, **Final System Prompt** §5.165 — condensed canonical runtime prompt derived from Part 4; **Part 4 governs on any divergence**)
- **Part 6** — Data & Function Architecture · **Module 11**: database philosophy (*Database calculates, AI explains* — never `SELECT * FROM transactions`), the Raw → Analytics → AI Intelligence → AI Tools layering, six data domains, final tables (user/subscription, wallet & sync, blockchain activity, counterparties, Intelligence Layer, AI conversation layer), **8 Supabase RPC functions** with signatures + JSON outputs, OpenAI function-calling schema, tool-selection flow, security model (RLS + wallet-ownership + user isolation), 3 Edge Functions, final data-flow diagram, and a **Reconciliation** section (§6.16). **Part 6 is the authoritative schema reference** on naming divergence with earlier parts
- **Part 7** — AI Prompt Architecture · **Module 12**: the layered prompt stack (System + Developer + Tool Definitions + Runtime Context + User Message — not one giant prompt), **SENTINEL SYSTEM PROMPT v1.0** (§7.2 — the production text to ship), Developer Prompt (§7.3), Tool Instruction Prompt for the ten functions (§7.4), Runtime Context injection (§7.5), four Response Templates (§7.6), four Guardrail families (§7.7), three Agent Modes (§7.8), a full worked conversation (§7.9), five Evaluation Criteria with publish gates (§7.10), the Production Deployment Flow (§7.11), and **Prompt Authority & Reconciliation** (§7.12)
- **Part 8** — **Deferred & Rejected Modules** (v1.1 decision log): سجل قرارات لا مواصفة بناء. **مؤجَّل:** Market Context Intelligence (فجوة **بيانات** لا فجوة وكيل — يُبنى كمحرك ذكاء عادي بمصدر بيانات سوق، وتبقى قيود Part 4 / §7.7 على التوقعات سارية) و Security Intelligence Engine (بانتظار بيانات approvals/العقود). **مرفوض:** بنية Chief Agent + سبعة وكلاء LLM (مغطاة بـ Orchestrator في Part 2 + محركات Part 5 الحتمية؛ تضاعف التكلفة والزمن؛ تخاطر بتناقض بين الوكلاء)، والذاكرة الخاصة لكل وكيل (الذاكرة مركزية — Module 10 §5.164)، ووكلاء Tax / DeFi / NFT / Whale (توسعة بيانات لا ذكاء). **محفّز إعادة التقييم:** تجاوز سطح الأدوات ~30 أداة، أو أن يصبح الوكلاء مطالبين باتخاذ قرارات مستقلة بدل التحليل

**Prompt authority order (normative):** **Part 4** is the normative constitution and **governs on any conflict** → **Module 10 §5.165** is the condensed canonical runtime prompt → **Part 7 §7.2** is the **production system prompt v1.0 to ship**. §7.2 is the deployable text and must stay consistent with Part 4; if they diverge, **Part 4 governs and §7.2 is updated**.

**Next: implementation.** The specification is closed; remaining work is engineering:

1. Unify the tool schema across Parts 3 / 6 / 7 and Module 10 into one authoritative schema
2. Resolve table naming conflicts (**Part 6 authoritative**) and map them onto the existing Sentinel schema
3. Map alert categories to the existing Telegram/Email settings toggles
4. Wire the existing "AI Data Analysis" button stubs to the new agent
5. Build the intelligence jobs (post-sync) before the chat layer
