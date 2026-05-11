'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Wallet, Link2, Unlink } from 'lucide-react';

interface WalletConnectProps {
  walletAddress: string | null;
  onConnect: (address: string) => void;
  onDisconnect: () => void;
  isLive: boolean;
}

export function WalletConnect({ walletAddress, onConnect, onDisconnect, isLive }: WalletConnectProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [inputAddress, setInputAddress] = useState('');

  const handleConnect = () => {
    const addr = inputAddress.trim();
    if (addr.startsWith('0x') && addr.length === 42) {
      onConnect(addr);
      setShowDialog(false);
      setInputAddress('');
    }
  };

  if (walletAddress && isLive) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 bg-[#0ecb81]/10 border border-[#0ecb81]/20 rounded-lg px-3 py-1.5">
          <div className="w-2 h-2 rounded-full bg-[#0ecb81] animate-pulse" />
          <span className="text-xs text-[#0ecb81] font-mono" dir="ltr">
            {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-[#f6465d] hover:text-[#f6465d] hover:bg-[#f6465d]/10"
          onClick={onDisconnect}
        >
          <Unlink className="h-3.5 w-3.5 ml-1" />
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        size="sm"
        className="bg-[#0052ff] hover:bg-[#0052ff]/80 text-white h-8"
        onClick={() => setShowDialog(true)}
      >
        <Wallet className="h-4 w-4 ml-1" />
        Connect Wallet
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-[#0f1011] border-white/10 text-[#f7f8f8] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Wallet className="h-5 w-5 text-[#0052ff]" />
              Connect Wallet
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-xs text-[#8a8f98]">Wallet Address</label>
              <Input
                placeholder="0x..."
                value={inputAddress}
                onChange={(e) => setInputAddress(e.target.value)}
                className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-sm h-10 font-mono"
                dir="ltr"
                autoFocus
              />
              <p className="text-[10px] text-[#8a8f98]/60">
                Enter an Ethereum wallet address to fetch real transactions from the blockchain
              </p>
            </div>

            <div className="bg-[#191a1b] rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-[#0052ff]" />
                <span className="text-xs text-[#d0d6e0] font-medium">Supported Networks</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['Ethereum', 'Base', 'Arbitrum', 'Optimism', 'Polygon'].map(n => (
                  <span key={n} className="text-[10px] text-[#8a8f98] bg-[#28282c] rounded px-2 py-0.5">
                    {n}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                className="flex-1 bg-[#0052ff] hover:bg-[#0052ff]/80 text-white"
                onClick={handleConnect}
                disabled={!inputAddress.trim() || !inputAddress.startsWith('0x') || inputAddress.length !== 42}
              >
                <Link2 className="h-4 w-4 ml-1" />
                Connect Wallet
              </Button>
              <Button
                variant="outline"
                className="bg-[#191a1b] border-white/10 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8]"
                onClick={() => setShowDialog(false)}
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
