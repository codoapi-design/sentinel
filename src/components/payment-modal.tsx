'use client';

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useSendTransaction, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { X, Wallet, ChevronDown, ChevronUp, Check, Loader2, AlertTriangle, ExternalLink, Copy, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { pricingTiers, type PricingTier } from '@/lib/mock-data';
import { USDC_ADDRESSES, USDT_ADDRESSES, PLATFORM_WALLET, ERC20_ABI, paymentChains } from '@/lib/web3-config';
import { toast } from 'sonner';

// ============================================================
// Types
// ============================================================

type PaymentStep = 'invoice' | 'connect' | 'confirm' | 'processing' | 'success' | 'error';
type PaymentToken = 'USDC' | 'USDT';

interface PaymentModalProps {
  tier: PricingTier;
  billingPeriod: 'monthly' | 'yearly';
  onClose: () => void;
  onSuccess: (txHash: string, tierId: string, period: 'monthly' | 'yearly') => void;
}

interface WalletOption {
  id: string;
  name: string;
  icon: string;
  connector: any;
}

// ============================================================
// Chain labels
// ============================================================

const chainLabels: Record<number, { name: string; color: string }> = {
  1: { name: 'Ethereum', color: '#627eea' },
  8453: { name: 'Base', color: '#0052ff' },
  42161: { name: 'Arbitrum', color: '#28a0f0' },
  10: { name: 'Optimism', color: '#ff0420' },
  137: { name: 'Polygon', color: '#8247e5' },
  56: { name: 'BSC', color: '#f3ba2f' },
};

// ============================================================
// Payment Modal
// ============================================================

export function PaymentModal({ tier, billingPeriod, onClose, onSuccess }: PaymentModalProps) {
  const [step, setStep] = useState<PaymentStep>('invoice');
  const [selectedToken, setSelectedToken] = useState<PaymentToken>('USDC');
  const [selectedChainId, setSelectedChainId] = useState<number>(8453); // Base default (cheapest fees)
  const [showChainSelector, setShowChainSelector] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  // Wagmi hooks
  const { address, isConnected, connector } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();

  // Calculate price
  const price = billingPeriod === 'yearly' ? tier.yearlyMonthly : tier.price;
  const annualTotal = billingPeriod === 'yearly' ? price * 12 : price;

  // Get token address for current chain
  const tokenAddress = selectedToken === 'USDC'
    ? USDC_ADDRESSES[selectedChainId]
    : USDT_ADDRESSES[selectedChainId];

  // Auto-advance steps
  useEffect(() => {
    if (isConnected && (step === 'connect' || step === 'invoice')) {
      if (chainId !== selectedChainId) {
        switchChain?.({ chainId: selectedChainId });
      }
      setStep('confirm');
    }
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle payment
  const handlePay = async () => {
    if (!isConnected || !address) return;

    setStep('processing');

    try {
      // Build ERC-20 transfer call
      const decimals = selectedToken === 'USDC' ? 6 : selectedToken === 'USDT' && selectedChainId === 56 ? 18 : selectedChainId === 42161 ? 6 : 6;
      const amount = parseUnits(price.toString(), decimals);

      // Use window.ethereum directly for ERC-20 transfers
      if (!window.ethereum) throw new Error('No wallet found');

      const tokenContract = tokenAddress;

      // ERC-20 transfer encoding
      const transferSignature = '0xa9059cbb'; // transfer(address,uint256)
      const paddedAddress = PLATFORM_WALLET.toLowerCase().replace('0x', '').padStart(64, '0');
      const paddedAmount = amount.toString(16).padStart(64, '0');
      const data = `0x${transferSignature}${paddedAddress}${paddedAmount}` as `0x${string}`;

      const tx = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: tokenContract,
          data,
        }],
      });

      setTxHash(tx as `0x${string}`);
      setStep('success');
      onSuccess(tx as string, tier.id, billingPeriod);
      toast.success('Payment successful! Your plan is now active');

    } catch (err: any) {
      console.error('Payment error:', err);
      if (err.code === 4001 || err.message?.includes('rejected')) {
        setStep('confirm');
        toast.error('Transaction rejected');
      } else {
        setStep('error');
        toast.error('Payment failed: ' + (err.message || 'Unknown error'));
      }
    }
  };

  // Handle wallet connect
  const handleConnect = (connectorId: number) => {
    const c = connectors[connectorId];
    if (c) {
      connect({ connector: c });
    }
  };

  // Copy tx hash
  const copyTxHash = () => {
    if (txHash) {
      navigator.clipboard.writeText(txHash);
      toast.success('Transaction hash copied');
    }
  };

  // ============================================================
  // RENDER: Invoice Step
  // ============================================================

  const renderInvoice = () => (
    <div className="space-y-5">
      {/* Invoice header */}
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#0052ff]/10 flex items-center justify-center mx-auto mb-3">
          <Wallet className="h-7 w-7 text-[#0052ff]" />
        </div>
        <h3 className="text-lg font-bold text-[#f7f8f8]">Subscription Invoice</h3>
        <p className="text-xs text-[#8a8f98] mt-1">Review the details then click Pay Now</p>
      </div>

      {/* Invoice details */}
      <div className="bg-[#08090a] rounded-xl border border-white/5 p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs text-[#8a8f98]">Plan</span>
          <span className="text-sm font-medium text-[#f7f8f8]">{tier.name}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-[#8a8f98]">Billing Cycle</span>
          <span className="text-sm text-[#d0d6e0]">
            {billingPeriod === 'yearly' ? 'Yearly' : 'Monthly'}
          </span>
        </div>
        <div className="border-t border-white/5 pt-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#8a8f98]">Amount</span>
            <div className="text-right">
              <span className="text-xl font-bold text-[#f7f8f8] font-mono">${price}</span>
              {billingPeriod === 'yearly' && (
                <span className="text-[10px] text-[#8a8f98] block">Invoice: ${annualTotal}/yr</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Token selection */}
      <div className="space-y-2">
        <span className="text-xs text-[#8a8f98]">Payment Currency</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSelectedToken('USDC')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all ${
              selectedToken === 'USDC'
                ? 'bg-[#2775ca]/20 border border-[#2775ca]/50 text-[#2775ca]'
                : 'bg-[#191a1b] border border-white/5 text-[#8a8f98] hover:border-white/10'
            }`}
          >
            <span className="text-lg">💲</span>
            USDC
          </button>
          <button
            onClick={() => setSelectedToken('USDT')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all ${
              selectedToken === 'USDT'
                ? 'bg-[#26a17b]/20 border border-[#26a17b]/50 text-[#26a17b]'
                : 'bg-[#191a1b] border border-white/5 text-[#8a8f98] hover:border-white/10'
            }`}
          >
            <span className="text-lg">₮</span>
            USDT
          </button>
        </div>
      </div>

      {/* Chain selector */}
      <div className="space-y-2">
        <span className="text-xs text-[#8a8f98]">Network</span>
        <button
          onClick={() => setShowChainSelector(!showChainSelector)}
          className="w-full flex items-center justify-between py-2.5 px-3 bg-[#191a1b] border border-white/5 rounded-xl hover:border-white/10 transition-all"
        >
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: chainLabels[selectedChainId]?.color }}
            >
              {chainLabels[selectedChainId]?.name[0]}
            </div>
            <span className="text-sm text-[#d0d6e0]">{chainLabels[selectedChainId]?.name}</span>
          </div>
          {showChainSelector ? <ChevronUp className="h-4 w-4 text-[#8a8f98]" /> : <ChevronDown className="h-4 w-4 text-[#8a8f98]" />}
        </button>

        {showChainSelector && (
          <div className="space-y-1 bg-[#08090a] border border-white/5 rounded-xl p-2">
            {paymentChains.map((chain) => {
              const info = chainLabels[chain.id];
              const hasToken = selectedToken === 'USDC' ? !!USDC_ADDRESSES[chain.id] : !!USDT_ADDRESSES[chain.id];
              return (
                <button
                  key={chain.id}
                  disabled={!hasToken}
                  onClick={() => {
                    setSelectedChainId(chain.id);
                    setShowChainSelector(false);
                  }}
                  className={`w-full flex items-center justify-between py-2 px-3 rounded-lg transition-all ${
                    selectedChainId === chain.id
                      ? 'bg-[#191a1b] border border-white/10'
                      : hasToken
                        ? 'hover:bg-[#191a1b]'
                        : 'opacity-40 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: info?.color }}
                    >
                      {info?.name[0]}
                    </div>
                    <span className="text-xs text-[#d0d6e0]">{info?.name}</span>
                  </div>
                  {selectedChainId === chain.id && <Check className="h-3.5 w-3.5 text-[#0ecb81]" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tip */}
      <div className="bg-[#0ecb81]/5 border border-[#0ecb81]/10 rounded-xl p-3">
        <p className="text-[10px] text-[#0ecb81] leading-relaxed">
          💡 We recommend paying on Base network — lower gas fees and faster transactions
        </p>
      </div>

      {/* Pay button */}
      <Button
        onClick={() => {
          if (isConnected) {
            if (chainId !== selectedChainId) {
              switchChain?.({ chainId: selectedChainId });
            }
            setStep('confirm');
          } else {
            setStep('connect');
          }
        }}
        className="w-full h-11 rounded-xl bg-[#0ecb81] hover:bg-[#0db874] text-black font-bold text-sm"
      >
        Pay Now — ${price} {selectedToken}
      </Button>
    </div>
  );

  // ============================================================
  // RENDER: Connect Wallet Step
  // ============================================================

  const renderConnect = () => (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#0052ff]/10 flex items-center justify-center mx-auto mb-3">
          <Wallet className="h-7 w-7 text-[#0052ff]" />
        </div>
        <h3 className="text-lg font-bold text-[#f7f8f8]">Connect Your Wallet</h3>
        <p className="text-xs text-[#8a8f98] mt-1">Choose the wallet you want to pay from</p>
      </div>

      {/* Invoice summary */}
      <div className="bg-[#08090a] rounded-xl border border-white/5 p-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-[#8a8f98]">Amount Due</p>
          <p className="text-base font-bold text-[#f7f8f8] font-mono">${price} {selectedToken}</p>
        </div>
        <Badge className="bg-[#08090a] text-[#8a8f98] border border-white/10 text-[10px]">
          {chainLabels[selectedChainId]?.name}
        </Badge>
      </div>

      {/* Wallet options */}
      <div className="space-y-2">
        {connectors.map((c, idx) => (
          <button
            key={c.uid}
            onClick={() => handleConnect(idx)}
            disabled={isConnecting}
            className="w-full flex items-center gap-3 py-3 px-4 bg-[#191a1b] border border-white/5 rounded-xl hover:border-white/10 hover:bg-[#1e1f21] transition-all"
          >
            <div className="w-9 h-9 rounded-lg bg-[#08090a] flex items-center justify-center">
              {c.icon ? (
                <img src={c.icon} alt={c.name} className="w-6 h-6" />
              ) : (
                <Wallet className="h-4 w-4 text-[#8a8f98]" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-[#f7f8f8]">{c.name}</p>
              <p className="text-[10px] text-[#5a5d64]">
                {c.name === 'MetaMask' ? 'Popular browser wallet' :
                 c.name === 'WalletConnect' ? 'Connect to mobile wallets' :
                 c.name === 'Coinbase Wallet' ? 'Coinbase Wallet' :
                 'Connect to your wallet'}
              </p>
            </div>
            {isConnecting ? (
              <Loader2 className="h-4 w-4 text-[#0052ff] animate-spin" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#8a8f98] rotate-[-90deg]" />
            )}
          </button>
        ))}
      </div>

      {/* Back button */}
      <Button
        variant="ghost"
        onClick={() => setStep('invoice')}
        className="w-full text-[#8a8f98] hover:text-[#d0d6e0] text-xs"
      >
        <ArrowLeft className="h-3.5 w-3.5 ml-1" />
        Back to Invoice
      </Button>
    </div>
  );

  // ============================================================
  // RENDER: Confirm Step
  // ============================================================

  const renderConfirm = () => (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#0ecb81]/10 flex items-center justify-center mx-auto mb-3">
          <Check className="h-7 w-7 text-[#0ecb81]" />
        </div>
        <h3 className="text-lg font-bold text-[#f7f8f8]">Confirm Payment</h3>
        <p className="text-xs text-[#8a8f98] mt-1">Review the details and confirm the transaction from your wallet</p>
      </div>

      {/* Connected wallet */}
      <div className="bg-[#08090a] rounded-xl border border-white/5 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-[#8a8f98]">Connected Wallet</span>
          <button
            onClick={() => disconnect()}
            className="text-[10px] text-[#f6465d] hover:underline"
          >
            Disconnect
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#0052ff]/20 flex items-center justify-center">
            <Wallet className="h-3 w-3 text-[#0052ff]" />
          </div>
          <code className="text-xs text-[#d0d6e0] font-mono" dir="ltr">
            {address ? `${address.slice(0, 8)}...${address.slice(-6)}` : ''}
          </code>
        </div>
      </div>

      {/* Payment details */}
      <div className="bg-[#08090a] rounded-xl border border-white/5 p-4 space-y-3">
        <div className="flex justify-between">
          <span className="text-xs text-[#8a8f98]">Plan</span>
          <span className="text-sm text-[#f7f8f8]">{tier.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-[#8a8f98]">Period</span>
          <span className="text-sm text-[#d0d6e0]">{billingPeriod === 'yearly' ? 'Yearly' : 'Monthly'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-[#8a8f98]">Network</span>
          <span className="text-sm text-[#d0d6e0]">{chainLabels[selectedChainId]?.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-[#8a8f98]">Currency</span>
          <span className="text-sm text-[#d0d6e0]">{selectedToken}</span>
        </div>
        <div className="border-t border-white/5 pt-3">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#8a8f98]">Total Amount</span>
            <span className="text-xl font-bold text-[#f7f8f8] font-mono">${price}</span>
          </div>
        </div>
      </div>

      {/* Destination */}
      <div className="bg-[#08090a] rounded-xl border border-white/5 p-3">
        <span className="text-[10px] text-[#8a8f98] block mb-1">Funds will be sent to</span>
        <code className="text-[10px] text-[#5a5d64] font-mono break-all" dir="ltr">
          {PLATFORM_WALLET}
        </code>
      </div>

      {/* Confirm button */}
      <Button
        onClick={handlePay}
        className="w-full h-11 rounded-xl bg-[#0ecb81] hover:bg-[#0db874] text-black font-bold text-sm"
      >
        Confirm Payment — ${price} {selectedToken}
      </Button>

      {/* Change wallet */}
      <Button
        variant="ghost"
        onClick={() => setStep('connect')}
        className="w-full text-[#8a8f98] hover:text-[#d0d6e0] text-xs"
      >
        <ArrowLeft className="h-3.5 w-3.5 ml-1" />
        Change Wallet
      </Button>
    </div>
  );

  // ============================================================
  // RENDER: Processing Step
  // ============================================================

  const renderProcessing = () => (
    <div className="space-y-5 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#0052ff]/10 flex items-center justify-center mx-auto">
        <Loader2 className="h-7 w-7 text-[#0052ff] animate-spin" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-[#f7f8f8]">Processing...</h3>
        <p className="text-xs text-[#8a8f98] mt-1">
          Please confirm the transaction from your wallet and do not close this window
        </p>
      </div>
      <div className="bg-[#08090a] rounded-xl border border-white/5 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#8a8f98]">Amount</span>
          <span className="text-base font-bold text-[#f7f8f8] font-mono">${price} {selectedToken}</span>
        </div>
      </div>
      <div className="bg-[#f7931a]/5 border border-[#f7931a]/10 rounded-xl p-3">
        <p className="text-[10px] text-[#f7931a] leading-relaxed">
          ⏳ Waiting for transaction confirmation in your wallet. If the confirmation window doesn't appear, check your wallet extension.
        </p>
      </div>
    </div>
  );

  // ============================================================
  // RENDER: Success Step
  // ============================================================

  const renderSuccess = () => (
    <div className="space-y-5 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#0ecb81]/10 flex items-center justify-center mx-auto">
        <Check className="h-7 w-7 text-[#0ecb81]" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-[#0ecb81]">Payment Successful!</h3>
        <p className="text-xs text-[#8a8f98] mt-1">Your plan is now active. Enjoy all the features!</p>
      </div>

      {/* Transaction hash */}
      {txHash && (
        <div className="bg-[#08090a] rounded-xl border border-white/5 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[#8a8f98]">Transaction Hash</span>
            <button onClick={copyTxHash} className="text-[#8a8f98] hover:text-[#d0d6e0]">
              <Copy className="h-3 w-3" />
            </button>
          </div>
          <code className="text-[10px] text-[#5a5d64] font-mono break-all" dir="ltr">
            {txHash}
          </code>
        </div>
      )}

      {/* Subscription details */}
      <div className="bg-[#08090a] rounded-xl border border-white/5 p-4 space-y-2">
        <div className="flex justify-between">
          <span className="text-xs text-[#8a8f98]">Plan</span>
          <span className="text-sm text-[#f7f8f8]">{tier.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-[#8a8f98]">Start Date</span>
          <span className="text-sm text-[#d0d6e0]">{new Date().toLocaleDateString('en-US')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-[#8a8f98]">End Date</span>
          <span className="text-sm text-[#d0d6e0]">
            {new Date(Date.now() + (billingPeriod === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000).toLocaleDateString('en-US')}
          </span>
        </div>
      </div>

      <Button
        onClick={onClose}
        className="w-full h-11 rounded-xl bg-[#0052ff] hover:bg-[#0045dd] text-white font-medium text-sm"
      >
        Start Using
      </Button>
    </div>
  );

  // ============================================================
  // RENDER: Error Step
  // ============================================================

  const renderError = () => (
    <div className="space-y-5 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#f6465d]/10 flex items-center justify-center mx-auto">
        <AlertTriangle className="h-7 w-7 text-[#f6465d]" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-[#f6465d]">Payment Failed</h3>
        <p className="text-xs text-[#8a8f98] mt-1">An error occurred during payment processing. You can try again.</p>
      </div>
      <Button
        onClick={() => setStep('confirm')}
        className="w-full h-11 rounded-xl bg-[#0052ff] hover:bg-[#0045dd] text-white font-medium text-sm"
      >
        Retry
      </Button>
      <Button
        variant="ghost"
        onClick={onClose}
        className="w-full text-[#8a8f98] hover:text-[#d0d6e0] text-xs"
      >
        Cancel
      </Button>
    </div>
  );

  // ============================================================
  // Step renderer
  // ============================================================

  const renderStep = () => {
    switch (step) {
      case 'invoice': return renderInvoice();
      case 'connect': return renderConnect();
      case 'confirm': return renderConfirm();
      case 'processing': return renderProcessing();
      case 'success': return renderSuccess();
      case 'error': return renderError();
    }
  };

  // ============================================================
  // Step indicator
  // ============================================================

  const steps = [
    { id: 'invoice', label: 'Invoice' },
    { id: 'connect', label: 'Connect Wallet' },
    { id: 'confirm', label: 'Confirm' },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step) ?? 0;
  const isFinalStep = ['processing', 'success', 'error'].includes(step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0f1011] border border-white/5 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <h2 className="text-sm font-bold text-[#f7f8f8]">
            {step === 'success' ? 'Subscribed' : step === 'error' ? 'Payment Error' : 'Crypto Payment'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#191a1b] flex items-center justify-center text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#28282c] transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicator */}
        {!isFinalStep && (
          <div className="flex items-center justify-center gap-2 px-4 pt-4">
            {steps.map((s, idx) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                  idx < currentStepIndex
                    ? 'bg-[#0ecb81] text-black'
                    : idx === currentStepIndex
                      ? 'bg-[#0052ff] text-white'
                      : 'bg-[#191a1b] text-[#5a5d64]'
                }`}>
                  {idx < currentStepIndex ? <Check className="h-3 w-3" /> : idx + 1}
                </div>
                {idx < steps.length - 1 && (
                  <div className={`w-8 h-0.5 ${idx < currentStepIndex ? 'bg-[#0ecb81]' : 'bg-[#191a1b]'}`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="p-5">
          {renderStep()}
        </div>
      </div>
    </div>
  );
}
