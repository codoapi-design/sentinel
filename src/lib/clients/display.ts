/**
 * Shared counterparty / client display resolution.
 * Prefer custom client names over raw addresses and truncated labels.
 */

import { truncateAddress } from '@/lib/wallet/address-validation';

/** Minimal client shape needed for named display (full Client satisfies this). */
export type ClientNameRef = {
  name: string;
  address: string;
};

export type CounterpartyFields = {
  counterparty?: string | null;
  counterpartyLabel?: string | null;
};

function normalizeAddr(value: string): string {
  return value.trim().toLowerCase();
}

export function isBlankCounterparty(value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower === 'unknown' ||
    lower === 'n/a' ||
    lower === 'na' ||
    lower === '-' ||
    lower === '—' ||
    lower === 'null' ||
    lower === 'none'
  );
}

/**
 * True when `label` is the same address (any checksum) or a truncated form
 * of that address (e.g. `0xabc1...def0`).
 */
export function isAddressLikeLabel(label: string, address: string): boolean {
  const a = address.trim();
  const l = label.trim();
  if (!a || !l) return false;
  if (normalizeAddr(l) === normalizeAddr(a)) return true;

  const m = l.match(/^(0x[a-fA-F0-9]+)\.\.\.([a-fA-F0-9]+)$/);
  if (!m) return false;
  const head = m[1].toLowerCase();
  const tail = m[2].toLowerCase();
  const aLower = normalizeAddr(a);
  return aLower.startsWith(head) && aLower.endsWith(tail);
}

export function findClientByAddress(
  address: string | null | undefined,
  clients: ClientNameRef[] | null | undefined,
): ClientNameRef | null {
  if (!address || !clients?.length) return null;
  const key = normalizeAddr(address);
  if (!key) return null;
  return clients.find(c => normalizeAddr(c.address || '') === key) ?? null;
}

/**
 * Named client string when the client has a real name (not merely a
 * truncated / full-address auto label). Case-insensitive address match.
 */
export function getClientNameByAddress(
  address: string | null | undefined,
  clients: ClientNameRef[] | null | undefined,
): string | null {
  if (!address) return null;
  const client = findClientByAddress(address, clients);
  if (!client?.name?.trim()) return null;
  const name = client.name.trim();
  if (isAddressLikeLabel(name, address)) return null;
  return name;
}

/**
 * Resolve counterparty display for UI, exports, AI, and charts.
 * Order: custom client name → meaningful counterpartyLabel → short address.
 */
export function resolveCounterpartyDisplay(
  { counterparty, counterpartyLabel }: CounterpartyFields,
  clients: ClientNameRef[] | null | undefined = [],
): string {
  const addr = (counterparty ?? '').trim();
  const label = (counterpartyLabel ?? '').trim();

  if (addr) {
    const clientName = getClientNameByAddress(addr, clients);
    if (clientName) return clientName;

    if (
      label &&
      !isBlankCounterparty(label) &&
      !isAddressLikeLabel(label, addr)
    ) {
      return label;
    }

    return truncateAddress(addr) || label || addr;
  }

  if (label && !isBlankCounterparty(label)) return label;
  return 'Unknown';
}
