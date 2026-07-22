/**
 * Asset Performance history — thin alias over shared flow-performance-history
 * so existing Asset imports keep working.
 */

export {
  buildFlowPerformanceHistory as buildAssetPerformanceHistory,
  type FlowPerfTxInput as AssetPerfTxInput,
  type FlowPerfPoint as AssetPerfPoint,
  type FlowPerfResult as AssetPerfResult,
} from '@/lib/finance/flow-performance-history';
