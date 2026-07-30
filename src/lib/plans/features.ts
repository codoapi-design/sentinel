/**
 * Feature flags derived from the active plan.
 */

import { normalizePlanId } from '@/lib/plans/address-families';
import {
  planAllowsAdvancedAlerts as alertsAdvanced,
  planAllowsInstantAlerts as alertsInstant,
} from '@/lib/plans/alerts';

export function planAllowsExcelExport(planId: string | null | undefined): boolean {
  return normalizePlanId(planId) === 'business';
}

export function planAllowsCsvExport(_planId: string | null | undefined): boolean {
  return true;
}

export function planAllowsPdfExport(_planId: string | null | undefined): boolean {
  return true;
}

export function planAllowsAdvancedAlerts(planId: string | null | undefined): boolean {
  return alertsAdvanced(planId);
}

export function planAllowsInstantAlerts(planId: string | null | undefined): boolean {
  return alertsInstant(planId);
}

export function planAllowsCustomReports(planId: string | null | undefined): boolean {
  return normalizePlanId(planId) === 'business';
}

export function planAllowsPrioritySupport(planId: string | null | undefined): boolean {
  return normalizePlanId(planId) === 'business';
}
