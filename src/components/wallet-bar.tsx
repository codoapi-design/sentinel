'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus,
  Wallet,
  ChevronDown,
  Loader2,
  Check,
  AlertCircle,
  Link2,
  Copy,
} from 'lucide-react';
import { useWalletStore, PLAN_WALLET_LIMITS, type WalletInfo } from '@/stores/wallet-store';
import { toast } from 'sonner';
import {
  isValidBitcoinAddress,
  isValidEvmAddress,
  isValidSolanaAddress,
  isValidTronAddress,
  truncateAddress,
} from '@/lib/wallet/address-validation';

function familyBadges(wallet: WalletInfo): string[] {
  const badges: string[] = [];
  if (wallet.address) badges.push('EVM');
  if (wallet.solanaAddress) badges.push('SOL');
  if (wallet.tronAddress) badges.push('TRX');
  if (wallet.bitcoinAddress) badges.push('BTC');
  return badges;
}

export function WalletBar() {
  const {
    wallets,
    activeWalletId,
    setActiveWallet,
    addWallet,
    canAddWallet,
    currentPlan,
    isAddingWallet,
    isSyncing,
    error,
    setError,
  } = useWalletStore();

  const [showDropdown, setShowDropdown] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [evmAddress, setEvmAddress] = useState('');
  const [solanaAddress, setSolanaAddress] = useState('');
  const [tronAddress, setTronAddress] = useState('');
  const [bitcoinAddress, setBitcoinAddress] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const activeWallet = wallets.find(w => w.id === activeWalletId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        barRef.current &&
        !barRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const resetForm = () => {
    setNewLabel('');
    setEvmAddress('');
    setSolanaAddress('');
    setTronAddress('');
    setBitcoinAddress('');
  };

  const hasAnyAddress =
    !!evmAddress.trim() ||
    !!solanaAddress.trim() ||
    !!tronAddress.trim() ||
    !!bitcoinAddress.trim();

  const addressesValid =
    (!evmAddress.trim() || isValidEvmAddress(evmAddress.trim())) &&
    (!solanaAddress.trim() || isValidSolanaAddress(solanaAddress.trim())) &&
    (!tronAddress.trim() || isValidTronAddress(tronAddress.trim())) &&
    (!bitcoinAddress.trim() || isValidBitcoinAddress(bitcoinAddress.trim()));

  const handleAddWallet = async () => {
    const label = newLabel.trim();
    if (!label) {
      toast.error('Please enter a wallet name');
      return;
    }
    if (!hasAnyAddress) {
      toast.error('Enter at least one address');
      return;
    }
    if (!addressesValid) {
      toast.error('One or more addresses have an invalid format');
      return;
    }

    await addWallet({
      label,
      evmAddress: evmAddress.trim() || undefined,
      solanaAddress: solanaAddress.trim() || undefined,
      tronAddress: tronAddress.trim() || undefined,
      bitcoinAddress: bitcoinAddress.trim() || undefined,
    });

    const state = useWalletStore.getState();
    if (state.error) {
      toast.error(state.error);
      setError(null);
      return;
    }

    setShowAddModal(false);
    resetForm();
    toast.success(`Wallet "${label}" added successfully`);
  };

  const handleCopyAddress = (address: string, walletId: string) => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopiedId(walletId);
    toast.success('Address copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleWalletSwitch = (walletId: string) => {
    setActiveWallet(walletId);
    setShowDropdown(false);
    const wallet = wallets.find(w => w.id === walletId);
    if (wallet) {
      toast.success(`Switched to ${wallet.label}`);
    }
  };

  const walletLimit = PLAN_WALLET_LIMITS[currentPlan] ?? 1;

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="bg-[#0052ff] hover:bg-[#0052ff]/80 text-white h-8 gap-1.5"
          onClick={() => {
            if (!canAddWallet()) {
              toast.error(
                `You've reached the wallet limit for your plan (${walletLimit} wallets). Upgrade your plan to add more.`,
              );
              return;
            }
            setShowAddModal(true);
          }}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">Add Wallet</span>
        </Button>

        <div ref={barRef} className="relative">
          {wallets.length > 0 && activeWallet ? (
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 bg-[#0f1011] border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition-all duration-200 cursor-pointer"
            >
              {isSyncing[activeWallet.id] ? (
                <Loader2 className="h-3.5 w-3.5 text-[#0052ff] animate-spin" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-[#0ecb81]" />
              )}

              <span className="text-xs text-[#d0d6e0] font-medium max-w-[80px] truncate">
                {activeWallet.label}
              </span>

              <span className="text-[10px] text-[#8a8f98] font-mono" dir="ltr">
                {truncateAddress(activeWallet.displayAddress || activeWallet.address || '')}
              </span>

              <div className="hidden md:flex items-center gap-0.5">
                {familyBadges(activeWallet).map(b => (
                  <span
                    key={b}
                    className="text-[9px] text-[#8a8f98] bg-white/5 rounded px-1 py-0.5"
                  >
                    {b}
                  </span>
                ))}
              </div>

              <ChevronDown
                className={`h-3.5 w-3.5 text-[#8a8f98] transition-transform duration-200 ${
                  showDropdown ? 'rotate-180' : ''
                }`}
              />
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-[#0f1011]/50 border border-white/5 rounded-lg px-3 py-1.5">
              <Wallet className="h-3.5 w-3.5 text-[#8a8f98]" />
              <span className="text-xs text-[#8a8f98]">No wallets</span>
            </div>
          )}

          {showDropdown && wallets.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute top-full mt-2 left-0 z-50 min-w-[300px] bg-[#0f1011] border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-slide-up"
              style={{ animationDuration: '150ms' }}
            >
              <div className="px-3 py-2 border-b border-white/5">
                <p className="text-[10px] text-[#8a8f98] uppercase tracking-wider">
                  Wallets ({wallets.length}/{walletLimit === Infinity ? '∞' : walletLimit})
                </p>
              </div>

              <div className="max-h-[300px] overflow-y-auto py-1">
                {wallets.map(wallet => {
                  const isActive = wallet.id === activeWalletId;
                  const isCurrentSyncing = isSyncing[wallet.id];
                  const display = wallet.displayAddress || wallet.address || '';

                  return (
                    <button
                      key={wallet.id}
                      onClick={() => handleWalletSwitch(wallet.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors duration-150 text-left ${
                        isActive
                          ? 'bg-[#0052ff]/10 border-l-2 border-[#0052ff]'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="flex-shrink-0">
                        {isCurrentSyncing ? (
                          <Loader2 className="h-4 w-4 text-[#0052ff] animate-spin" />
                        ) : isActive ? (
                          <div className="w-4 h-4 rounded-full bg-[#0052ff]/20 flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-[#0052ff]" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-white/5" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[#f7f8f8] font-medium truncate">
                            {wallet.label}
                          </span>
                          {familyBadges(wallet).map(b => (
                            <span
                              key={b}
                              className="text-[9px] text-[#8a8f98] bg-white/5 rounded px-1 py-0.5"
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] text-[#8a8f98] font-mono" dir="ltr">
                            {truncateAddress(display, 10, 6)}
                          </span>
                          {display && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                handleCopyAddress(display, wallet.id);
                              }}
                              className="p-0.5 hover:bg-white/10 rounded transition-colors"
                            >
                              {copiedId === wallet.id ? (
                                <Check className="h-3 w-3 text-[#0ecb81]" />
                              ) : (
                                <Copy className="h-3 w-3 text-[#8a8f98]" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {wallet.lastSyncedAt && !isCurrentSyncing && (
                        <span className="text-[9px] text-[#8a8f98]/60 flex-shrink-0">
                          {new Date(wallet.lastSyncedAt).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="px-3 py-2 border-t border-white/5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start text-xs text-[#8a8f98] hover:text-[#d0d6e0] gap-1.5 h-8"
                  onClick={() => {
                    setShowDropdown(false);
                    if (!canAddWallet()) {
                      toast.error(
                        `You've reached the wallet limit for your plan (${walletLimit} wallets).`,
                      );
                      return;
                    }
                    setShowAddModal(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add new wallet
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent
          className="bg-[#0f1011] border-white/10 text-[#f7f8f8] max-w-lg max-h-[90vh] overflow-y-auto"
          dir="ltr"
        >
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Wallet className="h-5 w-5 text-[#0052ff]" />
              Add new wallet
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-xs text-[#8a8f98]">Wallet Name</label>
              <Input
                placeholder="e.g. Main Wallet"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-sm h-10"
                autoFocus
                maxLength={30}
              />
            </div>

            <div className="space-y-3 rounded-lg border border-white/5 bg-[#191a1b]/50 p-3">
              <p className="text-[11px] text-[#8a8f98]">
                Enter at least one address. All addresses share this wallet name and dashboard.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs text-[#d0d6e0]">EVM Address</label>
                <Input
                  placeholder="0x… (Ethereum, Base, Arb, OP, Polygon, BSC, Linea…)"
                  value={evmAddress}
                  onChange={e => setEvmAddress(e.target.value)}
                  className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-sm h-10 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[#d0d6e0]">Solana Address</label>
                <Input
                  placeholder="Base58 Solana pubkey"
                  value={solanaAddress}
                  onChange={e => setSolanaAddress(e.target.value)}
                  className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-sm h-10 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[#d0d6e0]">Tron Address</label>
                <Input
                  placeholder="T… Tron address"
                  value={tronAddress}
                  onChange={e => setTronAddress(e.target.value)}
                  className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-sm h-10 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[#d0d6e0]">Bitcoin Address</label>
                <Input
                  placeholder="bc1… / 1… / 3…"
                  value={bitcoinAddress}
                  onChange={e => setBitcoinAddress(e.target.value)}
                  className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-sm h-10 font-mono"
                />
              </div>
            </div>

            <div className="bg-[#191a1b] rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-[#0052ff]" />
                <span className="text-xs text-[#d0d6e0] font-medium">Synced networks</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Ethereum',
                  'Base',
                  'Arbitrum',
                  'OP',
                  'Polygon',
                  'BSC',
                  'Linea',
                  'HyperEVM',
                  'Monad',
                  'Solana',
                  'Tron',
                  'Bitcoin',
                ].map(n => (
                  <span
                    key={n}
                    className="text-[10px] text-[#8a8f98] bg-[#28282c] rounded px-2 py-0.5"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 bg-[#0052ff]/5 border border-[#0052ff]/10 rounded-lg p-2.5">
              <AlertCircle className="h-4 w-4 text-[#0052ff] flex-shrink-0" />
              <p className="text-[11px] text-[#d0d6e0]">
                Your current plan supports up to{' '}
                <span className="text-[#0052ff] font-medium">
                  {walletLimit === Infinity ? 'unlimited' : walletLimit}
                </span>{' '}
                wallets ({wallets.length} currently added). Address-family limits by plan come later.
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-[#f6465d]/10 border border-[#f6465d]/20 rounded-lg p-2.5">
                <AlertCircle className="h-4 w-4 text-[#f6465d] flex-shrink-0" />
                <p className="text-[11px] text-[#f6465d]">{error}</p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Button
                className="flex-1 bg-[#0052ff] hover:bg-[#0052ff]/80 text-white"
                onClick={handleAddWallet}
                disabled={
                  isAddingWallet || !newLabel.trim() || !hasAnyAddress || !addressesValid
                }
              >
                {isAddingWallet ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Adding & Syncing...
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4 mr-1" />
                    Add & Sync
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="bg-[#191a1b] border-white/10 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8]"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
