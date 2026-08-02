/**
 * Generic stub for optional wallet-connector peers that are not required for
 * the Radareum production build. Runtime wallet connect features that need the
 * real SDK should install the peer explicitly.
 */
const handler: ProxyHandler<object> = {
  get(_t, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'default') return new Proxy({}, handler);
    return (..._args: unknown[]) => {
      throw new Error(`Optional peer dependency is not installed (accessed: ${String(prop)}).`);
    };
  },
};

const stub = new Proxy({}, handler);
export default stub;
export const CoinbaseWalletSDK = stub;
export const EthereumProvider = stub;
