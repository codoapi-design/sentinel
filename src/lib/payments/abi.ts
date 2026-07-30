export const PAYMENT_CONTRACT_ABI = [
  {
    type: 'function',
    name: 'paySubscription',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'intent',
        type: 'tuple',
        components: [
          { name: 'userId', type: 'bytes32' },
          { name: 'planId', type: 'bytes32' },
          { name: 'paymentToken', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'payer', type: 'address' },
          { name: 'referrer', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'allowedTokens',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'event',
    name: 'PaymentReceived',
    inputs: [
      { name: 'userId', type: 'bytes32', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'planId', type: 'bytes32', indexed: true },
      { name: 'paymentToken', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'referrer', type: 'address', indexed: false },
      { name: 'treasuryAmount', type: 'uint256', indexed: false },
      { name: 'referrerAmount', type: 'uint256', indexed: false },
      { name: 'intentNonce', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const ERC20_PAYMENT_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

export const PAYMENT_INTENT_TYPES = {
  PaymentIntent: [
    { name: 'userId', type: 'bytes32' },
    { name: 'planId', type: 'bytes32' },
    { name: 'paymentToken', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'payer', type: 'address' },
    { name: 'referrer', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;
