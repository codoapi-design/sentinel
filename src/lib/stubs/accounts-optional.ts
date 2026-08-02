/**
 * Optional peer stub for wagmi Tempo connectors (`accounts` package).
 * Radareum does not use Tempo Wallet; this satisfies bundler resolution only.
 */
export const Provider = {
  create() {
    throw new Error('Tempo Wallet (accounts) is not enabled in Radareum.');
  },
};

export function dialog() {
  throw new Error('Tempo Wallet (accounts) is not enabled in Radareum.');
}

export function webAuthn() {
  throw new Error('Tempo Wallet (accounts) is not enabled in Radareum.');
}

export function dangerous_secp256k1() {
  throw new Error('Tempo Wallet (accounts) is not enabled in Radareum.');
}

export default {
  Provider,
  dialog,
  webAuthn,
  dangerous_secp256k1,
};
