'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Filter } from 'lucide-react';
import {
  INVESTMENT_RETURN_PERIODS,
  type InvestmentReturnPeriodDays,
} from '@/lib/finance/investment-return-period';

const PERIOD_PILL =
  'h-7 px-2 sm:px-2.5 text-[11px] rounded-md transition-all shrink-0';

export interface InvestmentReturnPeriodControlsProps {
  activePeriod: InvestmentReturnPeriodDays;
  onPeriodClick: (days: InvestmentReturnPeriodDays) => void;
  /** Fixed From date shown in the custom-range popover (read-only), unless fromEditable. */
  baselineDate: string;
  today: string;
  isCustomActive: boolean;
  filterOpen: boolean;
  onFilterOpenChange: (open: boolean) => void;
  draftTo: string;
  onDraftToChange: (value: string) => void;
  onApplyCustom: () => void;
  onClearCustom: () => void;
  /** Label above the From date. Default: "From". */
  fromFieldLabel?: string;
  /** Accessible name for the From input. */
  fromAriaLabel?: string;
  /** Optional helper under the From date. */
  fromHelperText?: string;
  /** When true, From is an editable date input (draftFrom / onDraftFromChange). */
  fromEditable?: boolean;
  draftFrom?: string;
  onDraftFromChange?: (value: string) => void;
}

export function InvestmentReturnPeriodControls({
  activePeriod,
  onPeriodClick,
  baselineDate,
  today,
  isCustomActive,
  filterOpen,
  onFilterOpenChange,
  draftTo,
  onDraftToChange,
  onApplyCustom,
  onClearCustom,
  fromFieldLabel = 'From',
  fromAriaLabel = 'Baseline date (fixed)',
  fromHelperText,
  fromEditable = false,
  draftFrom = '',
  onDraftFromChange,
}: InvestmentReturnPeriodControlsProps) {
  const fromValue = fromEditable ? draftFrom : baselineDate;
  const toMin = fromEditable ? draftFrom || undefined : baselineDate || undefined;
  const applyDisabled = fromEditable ? !draftFrom : !draftTo;

  return (
    <div className="flex items-center gap-1 bg-[#191a1b] rounded-lg p-0.5 self-start sm:self-end shrink-0">
      {INVESTMENT_RETURN_PERIODS.map(period => (
        <Button
          key={period.days}
          type="button"
          variant="ghost"
          size="sm"
          className={`${PERIOD_PILL} ${
            activePeriod === period.days
              ? 'bg-[#28282c] text-[#f7f8f8]'
              : 'text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-transparent'
          }`}
          onClick={() => onPeriodClick(period.days)}
        >
          {period.label}
        </Button>
      ))}

      <Popover open={filterOpen} onOpenChange={onFilterOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`${PERIOD_PILL} w-7 px-0 ${
              isCustomActive || filterOpen
                ? 'bg-[#28282c] text-[#f7f8f8]'
                : 'text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-transparent'
            }`}
            aria-label="Custom date range"
            title={fromEditable ? 'Custom date range' : 'Custom end date'}
          >
            <Filter className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[240px] bg-[#191a1b] border-white/10 text-[#f7f8f8] p-3 shadow-xl"
          dir="ltr"
        >
          <p className="text-xs font-medium text-[#d0d6e0] mb-2.5">Custom range</p>
          <div className="space-y-2.5">
            <div className="space-y-1">
              <label className="text-[10px] text-[#8a8f98] block">{fromFieldLabel}</label>
              {fromEditable ? (
                <Input
                  type="date"
                  value={fromValue}
                  max={draftTo || today}
                  onChange={e => onDraftFromChange?.(e.target.value)}
                  className="bg-[#0f1011] border-white/10 text-[#d0d6e0] text-xs h-8"
                  aria-label={fromAriaLabel}
                />
              ) : (
                <Input
                  type="date"
                  value={fromValue}
                  disabled
                  readOnly
                  className="bg-[#0f1011] border-white/10 text-[#8a8f98] text-xs h-8 opacity-80 cursor-not-allowed"
                  aria-label={fromAriaLabel}
                />
              )}
              {fromHelperText ? (
                <p className="text-[10px] text-[#8a8f98]/80">{fromHelperText}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-[#8a8f98] block">To</label>
              <Input
                type="date"
                value={draftTo}
                min={toMin}
                max={today}
                onChange={e => onDraftToChange(e.target.value)}
                className="bg-[#0f1011] border-white/10 text-[#d0d6e0] text-xs h-8"
                aria-label="End date"
              />
              <p className="text-[10px] text-[#8a8f98]/80">
                Leave empty and clear to use today.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <Button
                type="button"
                size="sm"
                className="h-7 flex-1 text-xs bg-[#28282c] hover:bg-[#323238] text-[#f7f8f8]"
                disabled={applyDisabled}
                onClick={onApplyCustom}
              >
                Apply
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-[#8a8f98] hover:text-[#d0d6e0]"
                onClick={onClearCustom}
              >
                Clear
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
