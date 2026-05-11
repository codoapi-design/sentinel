'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronLeft,
  Wallet,
  UserPlus,
  Search,
  Pencil,
} from 'lucide-react';
import {
  type Client,
  type Transaction,
} from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const clientColors = [
  '#ff007a', '#0052ff', '#0ecb81', '#f6465d', '#f7931a',
  '#627eea', '#b6509e', '#00d395', '#2775ca', '#8a8f98',
];

interface ClientsSectionProps {
  clients: Client[];
  transactions: Transaction[];
  onClientClick: (identifier: string) => void;
  onDefineClient?: (address: string) => void;
  onClientsChange?: (clients: Client[]) => void;
  showToolbar?: boolean;
  defineAddress?: string | null;
  onDefineConsumed?: () => void;
}

interface CounterpartyStats {
  address: string;
  label: string;
  isDefined: boolean;
  client?: Client;
  totalRevenue: number;
  totalExpenses: number;
  totalVolume: number;
  txCount: number;
  netFlow: number;
  lastTxDate: string | null;
  topToken: string | null;
}

export function ClientsSection({
  clients,
  transactions,
  onClientClick,
  onDefineClient,
  onClientsChange,
  showToolbar = false,
  defineAddress,
  onDefineConsumed,
}: ClientsSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [definingAddress, setDefiningAddress] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formColor, setFormColor] = useState(clientColors[0]);

  // Handle external define trigger
  useEffect(() => {
    if (defineAddress) {
      openDefineDialog(defineAddress);
      onDefineConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defineAddress]);

  const resetForm = () => {
    setFormName('');
    setFormAddress('');
    setFormNotes('');
    setFormColor(clientColors[Math.floor(Math.random() * clientColors.length)]);
  };

  const openNewDialog = () => {
    resetForm();
    setEditingClient(null);
    setDefiningAddress(null);
    setShowDialog(true);
  };

  const openEditDialog = (client: Client) => {
    setFormName(client.name);
    setFormAddress(client.address);
    setFormNotes(client.notes);
    setFormColor(client.color);
    setEditingClient(client);
    setDefiningAddress(null);
    setShowDialog(true);
  };

  const openDefineDialog = (address: string) => {
    setFormName('');
    setFormAddress(address);
    setFormNotes('');
    setFormColor(clientColors[Math.floor(Math.random() * clientColors.length)]);
    setEditingClient(null);
    setDefiningAddress(address);
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!formName.trim() || !formAddress.trim() || !onClientsChange) return;

    if (editingClient) {
      onClientsChange(
        clients.map(c =>
          c.id === editingClient.id
            ? { ...c, name: formName.trim(), address: formAddress.trim(), notes: formNotes.trim(), color: formColor }
            : c
        )
      );
    } else {
      const newClient: Client = {
        id: `client-${Date.now()}`,
        name: formName.trim(),
        address: formAddress.trim(),
        notes: formNotes.trim(),
        color: formColor,
        createdAt: new Date().toISOString().split('T')[0],
      };
      onClientsChange([...clients, newClient]);
    }

    setShowDialog(false);
    resetForm();
  };

  const handleDefineFromRow = (address: string) => {
    if (onDefineClient) {
      onDefineClient(address);
    } else if (onClientsChange) {
      openDefineDialog(address);
    }
  };

  // Build comprehensive list of all counterparties
  const allCounterparties = useMemo((): CounterpartyStats[] => {
    const statsMap = new Map<string, CounterpartyStats & { tokenCounts: Record<string, number> }>();

    transactions.forEach(tx => {
      const key = tx.counterparty.toLowerCase();
      const existing = statsMap.get(key);

      if (existing) {
        existing.txCount++;
        existing.totalVolume += tx.value;
        if (tx.type === 'income' || tx.type === 'staking' || tx.type === 'defi') {
          existing.totalRevenue += tx.value;
        }
        if (tx.type === 'expense' || tx.type === 'gas') {
          existing.totalExpenses += tx.value;
        }
        existing.netFlow = existing.totalRevenue - existing.totalExpenses;
        if (!existing.lastTxDate || tx.date > existing.lastTxDate) {
          existing.lastTxDate = tx.date;
        }
        existing.tokenCounts[tx.token] = (existing.tokenCounts[tx.token] || 0) + 1;
      } else {
        const client = clients.find(c => c.address.toLowerCase() === key);
        const revenue = (tx.type === 'income' || tx.type === 'staking' || tx.type === 'defi') ? tx.value : 0;
        const expenses = (tx.type === 'expense' || tx.type === 'gas') ? tx.value : 0;
        statsMap.set(key, {
          address: tx.counterparty,
          label: tx.counterpartyLabel,
          isDefined: !!client,
          client,
          totalRevenue: revenue,
          totalExpenses: expenses,
          totalVolume: tx.value,
          txCount: 1,
          netFlow: revenue - expenses,
          lastTxDate: tx.date,
          topToken: null,
          tokenCounts: { [tx.token]: 1 },
        });
      }
    });

    // Resolve topToken for each
    statsMap.forEach(stats => {
      const sorted = Object.entries(stats.tokenCounts).sort(([, a], [, b]) => b - a);
      stats.topToken = sorted[0]?.[0] || null;
    });

    const result = Array.from(statsMap.values()).map(({ tokenCounts, ...rest }) => rest);
    result.sort((a, b) => {
      if (a.isDefined !== b.isDefined) return a.isDefined ? -1 : 1;
      return b.txCount - a.txCount;
    });

    return result;
  }, [clients, transactions]);

  // Filter by search
  const filteredCounterparties = useMemo(() => {
    if (!searchQuery.trim()) return allCounterparties;
    const q = searchQuery.toLowerCase();
    return allCounterparties.filter(cp =>
      cp.address.toLowerCase().includes(q) ||
      cp.label.toLowerCase().includes(q) ||
      (cp.isDefined && cp.client?.name.toLowerCase().includes(q)) ||
      (cp.isDefined && cp.client?.notes.toLowerCase().includes(q))
    );
  }, [allCounterparties, searchQuery]);

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const definedCount = allCounterparties.filter(c => c.isDefined).length;
  const undefinedCount = allCounterparties.filter(c => !c.isDefined).length;

  return (
    <>
      <Card className="bg-[#0f1011] border-white/5">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[#f7f8f8] text-base flex items-center gap-2">
              <Users className="h-5 w-5 text-[#b6509e]" />
              Clients
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#0ecb81]">{definedCount} defined</span>
                <span className="text-[10px] text-[#8a8f98]">{undefinedCount} undefined</span>
              </div>
              {showToolbar && onClientsChange && (
                <Button
                  size="sm"
                  className="bg-[#b6509e] hover:bg-[#b6509e]/80 text-white h-8"
                  onClick={openNewDialog}
                >
                  <UserPlus className="h-4 w-4 ml-1" />
                  Define Client
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Search bar - only in full Clients tab */}
        {showToolbar && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
              <Input
                placeholder="Search by name or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-sm h-9 pr-10"
              />
            </div>
          </div>
        )}

        <CardContent className="p-0">
          {filteredCounterparties.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-10 w-10 text-[#28282c] mx-auto mb-3" />
              <p className="text-sm text-[#8a8f98]">
                {searchQuery ? 'No results found' : 'No transactions yet'}
              </p>
              <p className="text-xs text-[#8a8f98]/60 mt-1">
                {searchQuery ? 'Try a different search' : 'Wallet addresses you interact with will appear here automatically'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Client</th>
                    <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Revenue</th>
                    <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Expense</th>
                    <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Net Flow</th>
                    <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Transactions</th>
                    <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Last Transaction</th>
                    <th className="w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCounterparties.map((cp) => {
                    const isNetPositive = cp.netFlow >= 0;
                    const clickIdentifier = cp.isDefined && cp.client ? cp.client.id : cp.address;

                    return (
                      <tr
                        key={cp.address}
                        className={cn(
                          'border-b border-white/5 hover:bg-[#191a1b]/50 transition-colors cursor-pointer group',
                          !cp.isDefined && 'border-dashed'
                        )}
                        onClick={() => onClientClick(clickIdentifier)}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={cn(
                                'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                                !cp.isDefined && 'bg-[#8a8f98]/10'
                              )}
                              style={cp.isDefined && cp.client ? { backgroundColor: `${cp.client.color}15` } : undefined}
                            >
                              <Wallet
                                className={cn('h-4 w-4', !cp.isDefined && 'text-[#8a8f98]/40')}
                                style={cp.isDefined && cp.client ? { color: cp.client.color } : undefined}
                              />
                            </div>
                            <div>
                              <p className={cn('text-sm', cp.isDefined ? 'font-medium text-[#f7f8f8]' : 'text-[#8a8f98]')}>
                                {cp.isDefined && cp.client ? cp.client.name : cp.label}
                              </p>
                              <p className="text-[10px] text-[#8a8f98]/60 font-mono" dir="ltr">
                                {truncateAddress(cp.address)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <ArrowDownLeft className="h-3 w-3 text-[#0ecb81]" />
                            <span className="font-mono-num text-xs text-[#0ecb81]">
                              ${cp.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <ArrowUpRight className="h-3 w-3 text-[#f6465d]" />
                            <span className="font-mono-num text-xs text-[#f6465d]">
                              ${cp.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <span className={cn(
                            'font-mono-num text-xs font-medium',
                            isNetPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
                          )}>
                            {isNetPositive ? '+' : ''}${Math.abs(cp.netFlow).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <span className="font-mono-num text-xs text-[#d0d6e0]">{cp.txCount}</span>
                        </td>
                        <td className="p-3 text-right">
                          <span className="text-xs text-[#8a8f98]">{cp.lastTxDate || '-'}</span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            {cp.isDefined && showToolbar && cp.client && onClientsChange ? (
                              <button
                                className="p-1.5 rounded hover:bg-[#28282c] transition-colors opacity-0 group-hover:opacity-100"
                                onClick={(e) => { e.stopPropagation(); openEditDialog(cp.client!); }}
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5 text-[#8a8f98]" />
                              </button>
                            ) : null}
                            {!cp.isDefined && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] bg-[#b6509e]/5 border-[#b6509e]/20 text-[#b6509e] hover:bg-[#b6509e]/10 hover:text-[#b6509e] px-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDefineFromRow(cp.address);
                                }}
                              >
                                <UserPlus className="h-3 w-3 ml-0.5" />
                                Define
                              </Button>
                            )}
                            <ChevronLeft className="h-4 w-4 text-[#8a8f98] group-hover:text-[#d0d6e0] transition-colors opacity-0 group-hover:opacity-100 transform group-hover:-translate-x-0.5 transition-transform" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Define/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-[#0f1011] border-white/10 text-[#f7f8f8] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5 text-[#b6509e]" />
              {editingClient ? 'Edit Client' : definingAddress ? 'Define Client' : 'New Client'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-xs text-[#8a8f98]">Client Name</label>
              <Input
                placeholder="e.g.: Alice, XYZ Corp..."
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-sm h-10"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#8a8f98]">Wallet Address</label>
              <Input
                placeholder="0x..."
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-sm h-10 font-mono"
                dir="ltr"
                disabled={!!definingAddress}
              />
              {definingAddress && (
                <p className="text-[10px] text-[#8a8f98]/60">Wallet Address locked from transactions</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#8a8f98]">Notes (optional)</label>
              <Input
                placeholder="Notes about client..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-sm h-10"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#8a8f98]">Color</label>
              <div className="flex items-center gap-2">
                {clientColors.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      'w-7 h-7 rounded-full transition-all border-2',
                      formColor === color
                        ? 'border-white scale-110'
                        : 'border-transparent hover:border-white/30'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormColor(color)}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                className="flex-1 bg-[#b6509e] hover:bg-[#b6509e]/80 text-white"
                onClick={handleSave}
                disabled={!formName.trim() || !formAddress.trim()}
              >
                {editingClient ? 'Save Changes' : 'Define Client'}
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
