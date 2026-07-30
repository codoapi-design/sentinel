import { getAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  getPaymentContractAddress,
} from '@/lib/payments/config';
import { PAYMENT_INTENT_TYPES } from '@/lib/payments/abi';

export type PaymentIntentMessage = {
  userId: Hex;
  planId: Hex;
  paymentToken: Address;
  amount: bigint;
  payer: Address;
  referrer: Address;
  nonce: bigint;
  deadline: bigint;
};

function getSignerAccount() {
  const raw = process.env.PAYMENT_SIGNER_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error(
      'PAYMENT_SIGNER_PRIVATE_KEY is not configured. Add the private key of the contract paymentSigner.',
    );
  }
  const key = (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
  return privateKeyToAccount(key);
}

export async function signPaymentIntent(args: {
  chainId: number;
  intent: PaymentIntentMessage;
}): Promise<{ signature: Hex; signer: Address }> {
  const verifyingContract = getPaymentContractAddress(args.chainId);
  if (!verifyingContract) {
    throw new Error(`No payment contract configured for chain ${args.chainId}`);
  }

  const account = getSignerAccount();
  const signature = await account.signTypedData({
    domain: {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId: args.chainId,
      verifyingContract,
    },
    types: PAYMENT_INTENT_TYPES,
    primaryType: 'PaymentIntent',
    message: {
      userId: args.intent.userId,
      planId: args.intent.planId,
      paymentToken: getAddress(args.intent.paymentToken),
      amount: args.intent.amount,
      payer: getAddress(args.intent.payer),
      referrer: getAddress(args.intent.referrer),
      nonce: args.intent.nonce,
      deadline: args.intent.deadline,
    },
  });

  return { signature, signer: account.address };
}
