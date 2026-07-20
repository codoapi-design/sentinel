/**
 * Address validators for multi-chain wallet families.
 */

export type AddressFamily = 'evm' | 'solana' | 'tron' | 'bitcoin';

export interface WalletAddressesInput {
  label: string;
  evmAddress?: string | null;
  solanaAddress?: string | null;
  tronAddress?: string | null;
  bitcoinAddress?: string | null;
}

const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
/** Base58 Solana pubkey (32–44 chars, no 0/O/I/l) */
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** Tron mainnet Base58Check starting with T */
const TRON_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
/** Bitcoin legacy / P2SH / bech32 */
const BITCOIN_RE =
  /^(bc1[a-z0-9]{39,59}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|tb1[a-z0-9]{39,59})$/;

export function normalizeOptional(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isValidEvmAddress(address: string): boolean {
  return EVM_RE.test(address);
}

export function isValidSolanaAddress(address: string): boolean {
  return SOLANA_RE.test(address);
}

export function isValidTronAddress(address: string): boolean {
  return TRON_RE.test(address);
}

export function isValidBitcoinAddress(address: string): boolean {
  return BITCOIN_RE.test(address);
}

export function validateWalletAddresses(input: {
  label?: unknown;
  address?: unknown;
  evmAddress?: unknown;
  solanaAddress?: unknown;
  tronAddress?: unknown;
  bitcoinAddress?: unknown;
}): { ok: true; data: WalletAddressesInput } | { ok: false; error: string } {
  const label = normalizeOptional(input.label);
  if (!label) {
    return { ok: false, error: 'Wallet name is required' };
  }

  // Backward compat: `address` maps to EVM
  const evm =
    normalizeOptional(input.evmAddress) ?? normalizeOptional(input.address);
  const solana = normalizeOptional(input.solanaAddress);
  const tron = normalizeOptional(input.tronAddress);
  const bitcoin = normalizeOptional(input.bitcoinAddress);

  if (!evm && !solana && !tron && !bitcoin) {
    return { ok: false, error: 'At least one address is required (EVM, Solana, Tron, or Bitcoin)' };
  }

  if (evm && !isValidEvmAddress(evm)) {
    return { ok: false, error: 'Invalid EVM address (must be 0x + 40 hex chars)' };
  }
  if (solana && !isValidSolanaAddress(solana)) {
    return { ok: false, error: 'Invalid Solana address' };
  }
  if (tron && !isValidTronAddress(tron)) {
    return { ok: false, error: 'Invalid Tron address (must start with T)' };
  }
  if (bitcoin && !isValidBitcoinAddress(bitcoin)) {
    return { ok: false, error: 'Invalid Bitcoin address' };
  }

  return {
    ok: true,
    data: {
      label,
      evmAddress: evm ? evm.toLowerCase() : null,
      solanaAddress: solana,
      tronAddress: tron,
      bitcoinAddress: bitcoin,
    },
  };
}

/** Primary display address: EVM → Solana → Tron → Bitcoin */
export function primaryDisplayAddress(w: {
  address?: string | null;
  solanaAddress?: string | null;
  tronAddress?: string | null;
  bitcoinAddress?: string | null;
  solana_address?: string | null;
  tron_address?: string | null;
  bitcoin_address?: string | null;
}): string {
  return (
    w.address ||
    w.solanaAddress ||
    w.solana_address ||
    w.tronAddress ||
    w.tron_address ||
    w.bitcoinAddress ||
    w.bitcoin_address ||
    ''
  );
}

export function truncateAddress(address: string, head = 6, tail = 4): string {
  if (!address) return '';
  if (address.length <= head + tail + 3) return address;
  return `${address.slice(0, head)}...${address.slice(-tail)}`;
}
