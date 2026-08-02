import type { NextConfig } from "next";
import path from "node:path";

// Relative aliases for Turbopack (Windows rejects absolute path aliases).
const wagmiConnectorsShimRel = "./src/lib/stubs/wagmi-connectors.ts";
const accountsStubRel = "./src/lib/stubs/accounts-optional.ts";
const optionalPeerStubRel = "./src/lib/stubs/optional-peer.ts";
const wagmiConnectorsShim = path.join(__dirname, "src/lib/stubs/wagmi-connectors.ts");
const accountsStub = path.join(__dirname, "src/lib/stubs/accounts-optional.ts");
const optionalPeerStub = path.join(__dirname, "src/lib/stubs/optional-peer.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    resolveAlias: {
      // Replace the full connectors barrel with our narrow shim.
      "@wagmi/connectors": wagmiConnectorsShimRel,
      accounts: accountsStubRel,
      "@coinbase/wallet-sdk": optionalPeerStubRel,
      "@walletconnect/ethereum-provider": optionalPeerStubRel,
    },
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@wagmi/connectors": wagmiConnectorsShim,
      accounts: accountsStub,
      "@coinbase/wallet-sdk": optionalPeerStub,
      "@walletconnect/ethereum-provider": optionalPeerStub,
    };
    // exceljs is used client-side for report downloads; stub Node builtins.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        stream: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
