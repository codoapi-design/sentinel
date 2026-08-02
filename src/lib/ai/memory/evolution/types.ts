export type IntelligenceEvolutionState =
  | 'improving_trend'
  | 'worsening_trend'
  | 'stable_trend'
  | 'reversal_positive'
  | 'reversal_negative'
  | 'volatile'
  | 'insufficient_history';

export interface EvolutionObservation {
  observedAt?: string;
  analysisId?: string;
  metric?: string;
  value?: number | null;
  /** Defaults to lower-is-better for risk-style intelligence metrics. */
  direction?: 'higher_is_better' | 'lower_is_better';
  observedValues?: Record<string, number | string | boolean | null>;
}

export interface IntelligenceEvolution {
  lifecycleKey: string;
  state: IntelligenceEvolutionState;
  observationCount: number;
  sufficientHistory: boolean;
  changeRate?: number | null;
  acceleration?: number | null;
  firstValue?: number | null;
  latestValue?: number | null;
  transitionNote?: string | null;
}

export interface EvolutionDriver {
  signal: 'quantity' | 'price' | 'allocation' | 'fees' | 'diversification' | 'unknown';
  description: string;
  previousValue?: number;
  currentValue?: number;
}

export interface EvolutionAttribution {
  mainDrivers: EvolutionDriver[];
}
