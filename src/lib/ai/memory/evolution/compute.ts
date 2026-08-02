import type { EvolutionObservation, IntelligenceEvolution } from './types';

function observationValue(observation: EvolutionObservation): number | null {
  if (typeof observation.value === 'number' && Number.isFinite(observation.value)) return observation.value;
  const values = Object.values(observation.observedValues ?? {});
  return values.find((value): value is number => typeof value === 'number' && Number.isFinite(value)) ?? null;
}

function directionFor(observations: EvolutionObservation[]): number {
  return observations.some(o => o.direction === 'higher_is_better') ? 1 : -1;
}

export function computeIntelligenceEvolution(input: {
  lifecycleKey: string;
  observations: EvolutionObservation[];
}): IntelligenceEvolution {
  const values = input.observations.map(observationValue).filter((value): value is number => value != null);
  const base: IntelligenceEvolution = {
    lifecycleKey: input.lifecycleKey,
    state: 'insufficient_history',
    observationCount: values.length,
    sufficientHistory: values.length >= 3,
    firstValue: values[0] ?? null,
    latestValue: values.at(-1) ?? null,
    changeRate: null,
    acceleration: null,
    transitionNote: null,
  };
  if (values.length < 2) return base;

  const orientation = directionFor(input.observations);
  const deltas = values.slice(1).map((value, index) => (value - values[index]!) * orientation);
  const changeRate = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  const acceleration = deltas.length >= 2 ? deltas.at(-1)! - deltas.at(-2)! : null;
  if (values.length === 2) {
    return {
      ...base,
      changeRate,
      acceleration,
      transitionNote: changeRate === 0
        ? 'A single transition is stable so far.'
        : `A single ${changeRate > 0 ? 'improving' : 'worsening'} transition is observed.`,
    };
  }

  const epsilon = Math.max(Math.abs(values[0]!) * 0.01, 0.000001);
  const signs = deltas.map(delta => (Math.abs(delta) <= epsilon ? 0 : Math.sign(delta)));
  const nonZero = signs.filter(sign => sign !== 0);
  const changes = nonZero.slice(1).filter((sign, index) => sign !== nonZero[index]).length;
  let state: IntelligenceEvolution['state'];
  if (nonZero.length === 0) state = 'stable_trend';
  else if (changes >= 2) state = 'volatile';
  else if (nonZero.length >= 2 && nonZero[0] !== nonZero.at(-1)) {
    state = nonZero.at(-1) === 1 ? 'reversal_positive' : 'reversal_negative';
  } else if (Math.abs(changeRate) <= epsilon) state = 'stable_trend';
  else state = changeRate > 0 ? 'improving_trend' : 'worsening_trend';

  return { ...base, state, changeRate, acceleration };
}
