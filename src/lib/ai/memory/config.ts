/**
 * Package 3 memory model versions and tunables.
 */

export const MEMORY_MODEL_VERSIONS = {
  memoryModel: 'memory-model-v1',
  conversationSummary: 'conversation-summary-v1',
  preferenceResolution: 'preference-resolution-v1',
  analysisPersistence: 'analysis-persistence-v1',
  lifecycleIdentity: 'lifecycle-identity-v1',
  lifecycleTransition: 'lifecycle-transition-v1',
  analysisComparison: 'analysis-comparison-v1',
  timelineModel: 'timeline-model-v1',
  memoryRetrieval: 'memory-retrieval-v1',
  historicalNumericValidation: 'historical-numeric-validation-v1',
} as const;

export const MEMORY_DEFAULTS = {
  recentMessageLimit: 10,
  summaryTriggerMessageCount: 16,
  maxSummaryCharacters: 3500,
  maxHistoricalAnalyses: 2,
  maxLifecycleRecords: 12,
  maxMemoryContextCharacters: 12_000,
  worseningMaterialityDelta: 0.08,
  improvingMaterialityDelta: 0.08,
  stablePriorityEpsilon: 0.03,
  timelineMinPriority: 0.35,
} as const;

export type PreferenceKey =
  | 'language'
  | 'fiat_currency'
  | 'analysis_depth'
  | 'default_wallet'
  | 'focus_areas'
  | 'response_style';

export const PREFERENCE_KEYS: PreferenceKey[] = [
  'language',
  'fiat_currency',
  'analysis_depth',
  'default_wallet',
  'focus_areas',
  'response_style',
];

export const ANALYSIS_DEPTH_VALUES = ['simple', 'balanced', 'advanced'] as const;
export const RESPONSE_STYLE_VALUES = ['concise', 'standard', 'detailed'] as const;
export const FOCUS_AREA_VALUES = ['performance', 'risk', 'trading', 'security'] as const;
