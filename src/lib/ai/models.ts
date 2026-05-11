/**
 * CryptoBooks AI Model Configuration
 *
 * Defines all supported models with their specifications:
 * - Display names and descriptions
 * - Token limits and pricing
 * - Capabilities and feature support
 * - Model selection helpers
 * - Cost calculation utilities
 */

// ============================================================
// Types
// ============================================================

export interface ModelSpec {
  /** Unique identifier (matches OpenRouter model ID) */
  id: string;
  /** Short display name for UI (Arabic) */
  displayName: string;
  /** Short display name for UI (English) */
  displayNameEn: string;
  /** Provider name */
  provider: 'openai' | 'deepseek' | 'google' | 'meta' | 'other';
  /** Model family for grouping */
  family: string;
  /** Pricing per 1M tokens (USD) */
  pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
  /** Token limits */
  limits: {
    maxContextTokens: number;
    maxOutputTokens: number;
    recommendedContextTokens: number; // Leave room for output
  };
  /** Capabilities */
  capabilities: {
    reasoning: boolean;
    streaming: boolean;
    functionCalling: boolean;
    jsonMode: boolean;
    vision: boolean;
  };
  /** Reasoning model (uses reasoning_effort instead of temperature) */
  isReasoningModel: boolean;
  /** Default reasoning effort for reasoning models */
  defaultReasoningEffort: 'low' | 'medium' | 'high';
  /** Default temperature for non-reasoning models */
  defaultTemperature: number;
  /** Region restrictions — some models may not be available in all regions */
  regionRestricted: boolean;
  /** Whether this is a free model */
  isFree: boolean;
  /** Quality tier — affects model selection for different tasks */
  qualityTier: 'basic' | 'standard' | 'advanced' | 'premium';
  /** Supported use cases */
  useCases: Array<'chat' | 'analysis' | 'classification' | 'summarization'>;
  /** Description for model selection UI */
  descriptionAr: string;
}

export interface ModelCostEstimate {
  /** Estimated input tokens */
  inputTokens: number;
  /** Estimated output tokens */
  outputTokens: number;
  /** Cost in USD */
  costUsd: number;
  /** Formatted cost string */
  costFormatted: string;
  /** Which model was used */
  modelId: string;
}

// ============================================================
// Model Registry
// ============================================================

export const MODEL_REGISTRY: Record<string, ModelSpec> = {
  'openai/o4-mini': {
    id: 'openai/o4-mini',
    displayName: 'O4 Mini',
    displayNameEn: 'o4-mini',
    provider: 'openai',
    family: 'o4',
    pricing: {
      inputPerMillion: 1.10,
      outputPerMillion: 4.40,
    },
    limits: {
      maxContextTokens: 200000,
      maxOutputTokens: 100000,
      recommendedContextTokens: 120000,
    },
    capabilities: {
      reasoning: true,
      streaming: true,
      functionCalling: false,
      jsonMode: true,
      vision: false,
    },
    isReasoningModel: true,
    defaultReasoningEffort: 'medium',
    defaultTemperature: 0.3,
    regionRestricted: true,
    isFree: false,
    qualityTier: 'advanced',
    useCases: ['chat', 'analysis', 'classification', 'summarization'],
    descriptionAr: 'نموذج استدلال متقدم من OpenAI — مثالي للتحليل المالي المعقد والتقارير المفصلة',
  },
  'openai/gpt-4o-mini': {
    id: 'openai/gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    displayNameEn: 'gpt-4o-mini',
    provider: 'openai',
    family: 'gpt-4o',
    pricing: {
      inputPerMillion: 0.15,
      outputPerMillion: 0.60,
    },
    limits: {
      maxContextTokens: 128000,
      maxOutputTokens: 16384,
      recommendedContextTokens: 60000,
    },
    capabilities: {
      reasoning: false,
      streaming: true,
      functionCalling: true,
      jsonMode: true,
      vision: true,
    },
    isReasoningModel: false,
    defaultReasoningEffort: 'medium',
    defaultTemperature: 0.3,
    regionRestricted: true,
    isFree: false,
    qualityTier: 'standard',
    useCases: ['chat', 'analysis', 'classification', 'summarization'],
    descriptionAr: 'نموذج سريع واقتصادي من OpenAI — مناسب للمحادثات والتحليلات البسيطة',
  },
  'deepseek/deepseek-chat': {
    id: 'deepseek/deepseek-chat',
    displayName: 'DeepSeek Chat',
    displayNameEn: 'deepseek-chat',
    provider: 'deepseek',
    family: 'deepseek',
    pricing: {
      inputPerMillion: 0.32,
      outputPerMillion: 1.28,
    },
    limits: {
      maxContextTokens: 64000,
      maxOutputTokens: 8192,
      recommendedContextTokens: 32000,
    },
    capabilities: {
      reasoning: false,
      streaming: true,
      functionCalling: true,
      jsonMode: true,
      vision: false,
    },
    isReasoningModel: false,
    defaultReasoningEffort: 'medium',
    defaultTemperature: 0.3,
    regionRestricted: false,
    isFree: false,
    qualityTier: 'standard',
    useCases: ['chat', 'analysis', 'classification', 'summarization'],
    descriptionAr: 'نموذج أفضل قيمة — يعمل عالمياً بأسعار معقولة وجودة عالية',
  },
  'deepseek/deepseek-r1': {
    id: 'deepseek/deepseek-r1',
    displayName: 'DeepSeek R1',
    displayNameEn: 'deepseek-r1',
    provider: 'deepseek',
    family: 'deepseek',
    pricing: {
      inputPerMillion: 0.55,
      outputPerMillion: 2.19,
    },
    limits: {
      maxContextTokens: 64000,
      maxOutputTokens: 8192,
      recommendedContextTokens: 32000,
    },
    capabilities: {
      reasoning: true,
      streaming: true,
      functionCalling: false,
      jsonMode: true,
      vision: false,
    },
    isReasoningModel: true,
    defaultReasoningEffort: 'medium',
    defaultTemperature: 0.3,
    regionRestricted: false,
    isFree: false,
    qualityTier: 'advanced',
    useCases: ['chat', 'analysis', 'classification'],
    descriptionAr: 'نموذج استدلال من DeepSeek — مثالي للتحليل المالي المعقد بأسعار معقولة',
  },
  'google/gemini-2.0-flash-001': {
    id: 'google/gemini-2.0-flash-001',
    displayName: 'Gemini 2.0 Flash',
    displayNameEn: 'gemini-2.0-flash',
    provider: 'google',
    family: 'gemini',
    pricing: {
      inputPerMillion: 0.10,
      outputPerMillion: 0.40,
    },
    limits: {
      maxContextTokens: 1048576,
      maxOutputTokens: 8192,
      recommendedContextTokens: 500000,
    },
    capabilities: {
      reasoning: false,
      streaming: true,
      functionCalling: true,
      jsonMode: true,
      vision: true,
    },
    isReasoningModel: false,
    defaultReasoningEffort: 'medium',
    defaultTemperature: 0.3,
    regionRestricted: true,
    isFree: false,
    qualityTier: 'standard',
    useCases: ['chat', 'analysis', 'classification', 'summarization'],
    descriptionAr: 'نموذج سريع من Google — سياق ضخم وسعر منخفض',
  },
  'openai/gpt-oss-120b:free': {
    id: 'openai/gpt-oss-120b:free',
    displayName: 'GPT-OSS 120B (مجاني)',
    displayNameEn: 'gpt-oss-120b-free',
    provider: 'openai',
    family: 'gpt-oss',
    pricing: {
      inputPerMillion: 0,
      outputPerMillion: 0,
    },
    limits: {
      maxContextTokens: 32000,
      maxOutputTokens: 4096,
      recommendedContextTokens: 16000,
    },
    capabilities: {
      reasoning: false,
      streaming: true,
      functionCalling: false,
      jsonMode: false,
      vision: false,
    },
    isReasoningModel: false,
    defaultReasoningEffort: 'medium',
    defaultTemperature: 0.4,
    regionRestricted: false,
    isFree: true,
    qualityTier: 'basic',
    useCases: ['chat', 'summarization'],
    descriptionAr: 'نموذج مجاني — جودة أقل لكن بدون تكلفة',
  },
};

// ============================================================
// Default Model
// ============================================================

/** The default model ID used when no preference is set */
export const DEFAULT_MODEL_ID = 'openai/o4-mini';

// ============================================================
// Model Selection Helpers
// ============================================================

/**
 * Get the model spec for a given model ID.
 * Falls back to the default model if the ID is not found.
 */
export function getModelSpec(modelId?: string): ModelSpec {
  const id = modelId || DEFAULT_MODEL_ID;
  return MODEL_REGISTRY[id] || MODEL_REGISTRY[DEFAULT_MODEL_ID];
}

/**
 * Get the current active model ID from environment or default.
 * Used on the server side only.
 */
export function getActiveModelId(): string {
  return process.env.AI_MODEL || DEFAULT_MODEL_ID;
}

/**
 * Get a display-friendly model name for the UI.
 * Returns the Arabic display name, or the raw ID as fallback.
 */
export function getModelDisplayName(modelId?: string): string {
  const spec = getModelSpec(modelId);
  return spec.displayNameEn;
}

/**
 * Select the best model for a given task based on quality and cost.
 */
export function selectModelForTask(
  task: 'chat' | 'analysis' | 'classification' | 'summarization',
  options?: {
    preferCheapest?: boolean;
    preferHighestQuality?: boolean;
    avoidRegionRestricted?: boolean;
  }
): ModelSpec {
  const candidates = Object.values(MODEL_REGISTRY)
    .filter(m => m.useCases.includes(task))
    .filter(m => !options?.avoidRegionRestricted || !m.regionRestricted);

  if (candidates.length === 0) {
    return getModelSpec(DEFAULT_MODEL_ID);
  }

  if (options?.preferCheapest) {
    // Sort by input price ascending
    candidates.sort((a, b) => a.pricing.inputPerMillion - b.pricing.inputPerMillion);
    return candidates[0];
  }

  if (options?.preferHighestQuality) {
    const tierOrder: Record<string, number> = { basic: 0, standard: 1, advanced: 2, premium: 3 };
    candidates.sort((a, b) => tierOrder[b.qualityTier] - tierOrder[a.qualityTier]);
    return candidates[0];
  }

  // Default: return the default model if it supports the task
  const defaultSpec = getModelSpec(DEFAULT_MODEL_ID);
  if (defaultSpec.useCases.includes(task)) {
    return defaultSpec;
  }

  // Otherwise pick the best quality available
  const tierOrder: Record<string, number> = { basic: 0, standard: 1, advanced: 2, premium: 3 };
  candidates.sort((a, b) => tierOrder[b.qualityTier] - tierOrder[a.qualityTier]);
  return candidates[0];
}

/**
 * Check if a model is available for the current environment.
 */
export function isModelAvailable(modelId: string): boolean {
  return modelId in MODEL_REGISTRY;
}

/**
 * Get all available models, optionally filtered.
 */
export function getAvailableModels(options?: {
  includeFree?: boolean;
  includeRegionRestricted?: boolean;
  minQualityTier?: 'basic' | 'standard' | 'advanced' | 'premium';
}): ModelSpec[] {
  const tierOrder: Record<string, number> = { basic: 0, standard: 1, advanced: 2, premium: 3 };
  const minTier = tierOrder[options?.minQualityTier ?? 'basic'];

  return Object.values(MODEL_REGISTRY)
    .filter(m => options?.includeFree || !m.isFree)
    .filter(m => options?.includeRegionRestricted || !m.regionRestricted)
    .filter(m => tierOrder[m.qualityTier] >= minTier);
}

// ============================================================
// Cost Calculation
// ============================================================

/**
 * Calculate the cost for a given model and token usage.
 */
export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): ModelCostEstimate {
  const spec = getModelSpec(modelId);
  const inputCost = (inputTokens / 1_000_000) * spec.pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * spec.pricing.outputPerMillion;
  const totalCost = inputCost + outputCost;

  return {
    inputTokens,
    outputTokens,
    costUsd: totalCost,
    costFormatted: formatCost(totalCost),
    modelId: spec.id,
  };
}

/**
 * Estimate the cost for a chat interaction based on message history size.
 * Provides a rough estimate before the actual API call.
 */
export function estimateChatCost(
  modelId: string,
  messageCount: number,
  averageMessageLength: number = 200
): ModelCostEstimate {
  // Rough token estimation: 1 token ≈ 4 characters for English, ≈ 2 characters for Arabic
  // We use a mixed estimate of ~3 chars per token
  const estimatedInputTokens = Math.ceil((messageCount * averageMessageLength) / 3) + 500; // +500 for system prompt
  const estimatedOutputTokens = 800; // Average response length

  return calculateCost(modelId, estimatedInputTokens, estimatedOutputTokens);
}

/**
 * Estimate the cost for a data analysis request.
 */
export function estimateAnalysisCost(
  modelId: string,
  transactionCount: number
): ModelCostEstimate {
  // Analysis uses more tokens: system prompt + data + output
  const estimatedInputTokens = Math.min(50000, 2000 + transactionCount * 30);
  const estimatedOutputTokens = 3000; // Analysis output is longer

  return calculateCost(modelId, estimatedInputTokens, estimatedOutputTokens);
}

/**
 * Format a cost in USD for display.
 */
export function formatCost(costUsd: number): string {
  if (costUsd === 0) return '$0.00';
  if (costUsd < 0.001) return '<$0.001';
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  if (costUsd < 1) return `$${costUsd.toFixed(3)}`;
  return `$${costUsd.toFixed(2)}`;
}

/**
 * Calculate total monthly cost based on usage patterns.
 */
export function calculateMonthlyCostEstimate(
  modelId: string,
  chatsPerMonth: number,
  analysesPerMonth: number
): {
  chatCost: ModelCostEstimate;
  analysisCost: ModelCostEstimate;
  totalCostUsd: number;
  totalCostFormatted: string;
} {
  const chatCost = estimateChatCost(modelId, 10); // Average 10 messages per conversation
  const perChatCost = chatCost.costUsd;
  const totalChatCost = perChatCost * chatsPerMonth;

  const analysisCost = estimateAnalysisCost(modelId, 50); // Average 50 transactions
  const totalAnalysisCost = analysisCost.costUsd * analysesPerMonth;

  const totalCost = totalChatCost + totalAnalysisCost;

  return {
    chatCost: { ...chatCost, costUsd: totalChatCost, costFormatted: formatCost(totalChatCost) },
    analysisCost: { ...analysisCost, costUsd: totalAnalysisCost, costFormatted: formatCost(totalAnalysisCost) },
    totalCostUsd: totalCost,
    totalCostFormatted: formatCost(totalCost),
  };
}
