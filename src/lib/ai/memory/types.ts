/**
 * Package 3 — Persistent intelligence memory contracts.
 */

import type {
  AnalysisScope,
  ConfidenceScore,
  DomainStatus,
} from '@/lib/ai/trust/types';
import type {
  MonitoringPoint,
  ReasonedIntelligencePackage,
  ReasoningConfidence,
  WhatMattersSummary,
} from '@/lib/ai/intelligence-quality/types';

import type { PreferenceKey } from './config';

export type ConversationChannel = 'web' | 'telegram' | 'system';
export type ConversationStatus = 'active' | 'archived' | 'deleted';
export type MessageRole = 'user' | 'assistant' | 'system_event';

export type LifecycleState =
  | 'new'
  | 'recurring'
  | 'persistent'
  | 'worsening'
  | 'improving'
  | 'stable'
  | 'resolved'
  | 'reopened'
  | 'superseded'
  | 'unknown';

export type MonitoringLifecycleState =
  | 'active'
  | 'triggered'
  | 'improved'
  | 'resolved'
  | 'expired'
  | 'superseded';

export interface MonitoringPointState {
  id: string;
  userId: string;
  walletId: string;
  monitoringKey: string;
  lifecycleKey?: string | null;
  analysisId?: string | null;
  metric: string;
  state: MonitoringLifecycleState;
  currentValue?: number | null;
  threshold?: number | null;
  explanation: string;
  lastAnalysisId?: string | null;
  updatedAt: string;
  createdAt: string;
}

export type PreferenceSource =
  | 'explicit_user_setting'
  | 'explicit_chat_confirmation'
  | 'inferred';

export interface EntityRef {
  type: string;
  id?: string;
  symbol?: string;
}

export interface AiConversation {
  id: string;
  userId: string;
  walletId?: string | null;
  title?: string | null;
  channel: ConversationChannel;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string | null;
  metadata: {
    currentEntity?: EntityRef;
    language?: string;
  };
}

export interface AiConversationMessage {
  id: string;
  conversationId: string;
  userId: string;
  role: MessageRole;
  content: string;
  relatedAnalysisId?: string | null;
  traceId?: string | null;
  createdAt: string;
  metadata: {
    page?: string;
    entity?: string;
    model?: string;
    completionStatus?: string;
    source?: 'server' | 'client_untrusted';
  };
}

export interface AiConversationSummary {
  id: string;
  conversationId: string;
  summaryVersion: string;
  coveredUntilMessageId: string;
  coveredMessageCount: number;
  summary: {
    userGoals: string[];
    confirmedPreferences: string[];
    discussedEntities: EntityRef[];
    unresolvedQuestions: string[];
    priorConclusions: Array<{
      analysisId?: string;
      findingType: string;
      historicalOnly: true;
    }>;
  };
  createdAt: string;
}

export interface AiUserPreference {
  id: string;
  userId: string;
  key: PreferenceKey;
  value: unknown;
  source: PreferenceSource;
  confidence: number;
  firstObservedAt: string;
  lastConfirmedAt?: string | null;
  expiresAt?: string | null;
  active: boolean;
}

export interface PersistedInsightSnapshot {
  snapshotId: string;
  analysisId: string;
  lifecycleKey: string;
  findingId: string;
  findingType: string;
  category: string;
  entityRefs: EntityRef[];
  priorityScore: number;
  priorityLevel: string;
  materialityScore: number;
  significanceScore: number;
  confidence: ConfidenceScore;
  reasoningConfidence?: ReasoningConfidence;
  evidenceIds: string[];
  limitations: string[];
  observedValues: Record<string, number | string | boolean | null>;
  selected: boolean;
  eligibleButNotSelected: boolean;
  createdAt: string;
}

export interface PersistedReasonedAnalysis {
  id: string;
  userId: string;
  walletId: string;
  conversationId?: string | null;
  parentAnalysisId?: string | null;
  jobId?: string | null;
  analysisType: string;
  analysisLevel: 'wallet' | 'user_portfolio';
  scope: AnalysisScope;
  completionStatus: string;
  whatMatters: WhatMattersSummary;
  approvedInsights: PersistedInsightSnapshot[];
  monitoringPoints: MonitoringPoint[];
  attribution: ReasonedIntelligencePackage['attribution'];
  domainStatuses: DomainStatus[];
  limitations: string[];
  eligibleFindingKeys: string[];
  versions: {
    pipelineVersion: string;
    responseSchemaVersion: string;
    reasoningEngine: string;
    eligibilityRules: string;
    rankingModel: string;
    attributionModel: string;
    memoryModel: string;
  };
  dataAsOf: {
    holdings?: string;
    transactions?: string;
    prices?: string;
    snapshots?: string;
  };
  fingerprint: string;
  traceId: string;
  createdAt: string;
}

export interface InsightLifecycleRecord {
  id: string;
  userId: string;
  walletId: string;
  lifecycleKey: string;
  findingType: string;
  category: string;
  entityRefs: EntityRef[];
  state: LifecycleState;
  firstDetectedAt: string;
  lastDetectedAt: string;
  resolvedAt?: string | null;
  occurrenceCount: number;
  consecutiveOccurrenceCount: number;
  currentSnapshotId?: string | null;
  previousSnapshotId?: string | null;
  currentPriorityScore?: number | null;
  previousPriorityScore?: number | null;
  currentMaterialityScore?: number | null;
  previousMaterialityScore?: number | null;
  change: {
    priorityDelta?: number | null;
    materialityDelta?: number | null;
    observedValueChanges: Record<
      string,
      { previous: number | string | boolean | null; current: number | string | boolean | null }
    >;
  };
  supersededByLifecycleKey?: string | null;
  memoryVersion: string;
  updatedAt: string;
}

export interface AnalysisComparison {
  currentAnalysisId: string;
  previousAnalysisId?: string | null;
  newInsightKeys: string[];
  recurringInsightKeys: string[];
  worseningInsightKeys: string[];
  improvingInsightKeys: string[];
  stableInsightKeys: string[];
  resolvedInsightKeys: string[];
  reopenedInsightKeys: string[];
  supersededInsightKeys: string[];
  whatChanged: Array<{
    lifecycleKey: string;
    changeType: string;
    summary: string;
    evidenceIds: string[];
    confidence: ConfidenceScore;
  }>;
  limitations: string[];
}

export interface ConclusionChangeExplanation {
  previousAnalysisId: string;
  currentAnalysisId: string;
  reasons: Array<{
    type:
      | 'wallet_data_changed'
      | 'scope_changed'
      | 'coverage_changed'
      | 'pricing_changed'
      | 'classification_changed'
      | 'model_version_changed'
      | 'previous_partial'
      | 'superseded';
    description: string;
    evidenceIds: string[];
  }>;
  confidence: ConfidenceScore;
}

export interface HistoricalWhatMatters {
  current: WhatMattersSummary;
  sincePrevious?: {
    mainChange: string;
    newIssues: string[];
    worseningIssues: string[];
    improvingIssues: string[];
    resolvedIssues: string[];
  };
  continuity: {
    longestPersistentInsight?: string;
    mostChangedInsight?: string;
  };
  limitations: string[];
}

export interface IntelligenceTimelineEvent {
  id: string;
  userId: string;
  walletId: string;
  eventType:
    | 'insight_new'
    | 'insight_worsened'
    | 'insight_improved'
    | 'insight_resolved'
    | 'insight_reopened'
    | 'monitoring_triggered'
    | 'monitoring_improved'
    | 'monitoring_resolved'
    | 'monitoring_expired'
    | 'monitoring_superseded'
    | 'what_matters_changed'
    | 'attribution_changed'
    | 'behavior_changed'
    | 'data_quality_changed';
  lifecycleKey?: string;
  analysisId: string;
  title: string;
  summary: string;
  priority: number;
  confidence: ConfidenceScore;
  evidenceIds: string[];
  occurredAt: string;
}

export interface MemoryRetrievalPlan {
  conversation: {
    required: boolean;
    conversationId?: string;
    recentMessageLimit: number;
    includeSummary: boolean;
  };
  preferences: {
    required: boolean;
    keys: PreferenceKey[];
  };
  previousAnalyses: {
    required: boolean;
    walletId?: string;
    analysisType?: string;
    sameScopeOnly: boolean;
    limit: number;
  };
  lifecycle: {
    required: boolean;
    entityKeys?: string[];
    activeOnly?: boolean;
  };
  tokenBudget: {
    maxCharacters: number;
    maxHistoricalAnalyses: number;
    maxLifecycleRecords: number;
  };
}

export interface MemoryContextBundle {
  plan: MemoryRetrievalPlan;
  conversation?: AiConversation | null;
  recentMessages: AiConversationMessage[];
  summary?: AiConversationSummary | null;
  preferences: AiUserPreference[];
  previousAnalyses: PersistedReasonedAnalysis[];
  lifecycleRecords: InsightLifecycleRecord[];
  comparison?: AnalysisComparison | null;
  historicalWhatMatters?: HistoricalWhatMatters | null;
  conclusionChange?: ConclusionChangeExplanation | null;
  omitted: string[];
  charactersUsed: number;
}
