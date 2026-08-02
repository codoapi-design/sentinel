import type {
  AnalyticalObservation,
  CandidateFinding,
  IntelligenceEdge,
  IntelligenceNode,
} from './types';

export function buildIntelligenceGraph(input: {
  observations: AnalyticalObservation[];
  candidates: CandidateFinding[];
}): { nodes: IntelligenceNode[]; edges: IntelligenceEdge[] } {
  const nodes: IntelligenceNode[] = [];
  const edges: IntelligenceEdge[] = [];

  for (const obs of input.observations.slice(0, 200)) {
    nodes.push({
      id: obs.id,
      type: 'observation',
      data: { key: obs.metric.key, value: obs.metric.value, engine: obs.engine },
    });
  }

  for (const c of input.candidates) {
    nodes.push({
      id: c.id,
      type: 'finding',
      data: { type: c.type, category: c.category, eligible: c.eligibility.eligible },
    });
    for (const oid of c.observationIds.slice(0, 6)) {
      edges.push({
        from: oid,
        to: c.id,
        relationship: 'supports',
        strength: 0.6,
        evidenceIds: c.evidenceIds.slice(0, 3),
      });
    }
    for (const ent of c.entityIds.slice(0, 3)) {
      const entId = `entity:${ent}`;
      if (!nodes.some(n => n.id === entId)) {
        nodes.push({ id: entId, type: 'asset', data: { name: ent } });
      }
      edges.push({
        from: c.id,
        to: entId,
        relationship: 'belongs_to',
        strength: 0.8,
        evidenceIds: [],
      });
    }
  }

  return { nodes, edges };
}
