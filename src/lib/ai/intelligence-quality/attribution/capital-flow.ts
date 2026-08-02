import type { EngineOutput } from '@/lib/ai/tools/registry';

import { numberOrNull } from '../confidence-util';
import type { CapitalMovementAttribution } from '../types';

/**
 * Capital movement attribution with internal-transfer exclusion at the requested analysis level.
 *
 * Individual wallet: internal transfers between owned addresses on the same wallet are excluded
 * from external flow when the flow engine already classified them.
 * Combined user portfolio: same-user cross-wallet transfers should not count as external
 * (requires sibling addresses in context — otherwise limitation is recorded).
 */
export function attributeCapitalMovement(input: {
  envelopes: EngineOutput[];
  analysisLevel?: CapitalMovementAttribution['analysisLevel'];
  hasSiblingWalletAddresses?: boolean;
}): CapitalMovementAttribution {
  const flow = input.envelopes.find(e => e.engine === 'flow');
  const m = (flow?.metrics ?? {}) as Record<string, unknown>;
  const analysisLevel = input.analysisLevel ?? 'individual_wallet';

  const externalInflowUsd =
    numberOrNull(m.externalInflowUsd) ?? numberOrNull(m.inflowUsd) ?? 0;
  const externalOutflowUsd =
    numberOrNull(m.externalOutflowUsd) ?? numberOrNull(m.outflowUsd) ?? 0;
  const internalTransferUsd =
    numberOrNull(m.internalTransferUsd) ?? numberOrNull(m.internalVolumeUsd) ?? 0;
  const feesUsd = numberOrNull(m.gasFeesUsd) ?? numberOrNull(m.feesUsd) ?? 0;
  const swapLegsUsd = numberOrNull(m.swapVolumeUsd) ?? numberOrNull(m.tradingVolumeUsd) ?? 0;
  const unknownTransferUsd = numberOrNull(m.unknownTransferUsd) ?? 0;

  const limitations: string[] = [];
  if (analysisLevel === 'combined_user_portfolio' && !input.hasSiblingWalletAddresses) {
    limitations.push(
      'Combined portfolio level requested without sibling wallet addresses — cross-wallet internal transfers may be misclassified as external.',
    );
  }
  if (swapLegsUsd > 0) {
    limitations.push('Swap legs are not counted as external capital flow.');
  }

  // Prefer engine external figures; if only gross inflow/outflow present, subtract internal when known.
  let extIn = externalInflowUsd;
  let extOut = externalOutflowUsd;
  if (
    numberOrNull(m.externalInflowUsd) == null &&
    numberOrNull(m.inflowUsd) != null &&
    internalTransferUsd > 0
  ) {
    // Cannot split precisely without event-level data — record limitation.
    limitations.push('External vs internal split approximated from aggregate metrics.');
  }

  return {
    analysisLevel,
    externalInflowUsd: extIn,
    externalOutflowUsd: extOut,
    netExternalFlowUsd: extIn - Math.abs(extOut),
    internalTransferUsd,
    feesUsd,
    swapLegsUsd,
    unknownTransferUsd,
    limitations,
  };
}
