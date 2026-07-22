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
  Pencil,
  Copy,
  Check,
  Search,
  Wallet,
  UserPlus,
} from 'lucide-react';
import { type Client, type Transaction } from '@/lib/mock-data';
import { cn } from '@/lib/utils';
import { TablePagination } from '@/components/table-pagination';
import { useTablePagination } from '@/hooks/use-table-pagination';

interface ClientSettingsProps {
  clients: Client[];
  onClientsChange: (clients: Client[]) => void;
  transactions: Transaction[];
  defineAddress?: string | null;
  onDefineConsumed?: () => void;
}

const clientColors = [
  '#ff007a', '#0052ff', '#0ecb81', '#f6465d', '#f7931a',
  '#627eea', '#b6509e', '#00d395', '#2775ca', '#8a8f98',
];

export function ClientSettings({ clients, onClientsChange, transactions, defineAddress, onDefineConsumed }: ClientSettingsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [definingAddress, setDefiningAddress] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formColor, setFormColor] = useState(clientColors[0]);

  // Extract all unique counterparty addresses from transactions
  const allCounterparties = useMemo(() => {
    const addressMap = new Map<string, { address: string; label: string; txCount: number }>();
    transactions.forEach(tx => {
      const key = tx.counterparty.toLowerCase();
      const existing = addressMap.get(key);
      if (existing) {
        existing.txCount++;
      } else {
        addressMap.set(key, {
          address: tx.counterparty,
          label: tx.counterpartyLabel,
          txCount: 1,
        });
      }
    });
    return Array.from(addressMap.values()).sort((a, b) => b.txCount - a.txCount);
  }, [transactions]);

  // Separate defined vs undefined
  const definedAddressSet = useMemo(() => {
    return new Set(clients.map(c => c.address.toLowerCase()));
  }, [clients]);

  const undefinedAddresses = useMemo(() => {
    return allCounterparties.filter(a => !definedAddressSet.has(a.address.toLowerCase()));
  }, [allCounterparties, definedAddressSet]);

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

  const openAddDialog = () => {
    resetForm();
    setEditingClient(null);
    setDefiningAddress(null);
    setShowAddDialog(true);
  };

  const openEditDialog = (client: Client) => {
    setFormName(client.name);
    setFormAddress(client.address);
    setFormNotes(client.notes);
    setFormColor(client.color);
    setEditingClient(client);
    setDefiningAddress(null);
    setShowAddDialog(true);
  };

  const openDefineDialog = (address: string) => {
    setFormName('');
    setFormAddress(address);
    setFormNotes('');
    setFormColor(clientColors[Math.floor(Math.random() * clientColors.length)]);
    setEditingClient(null);
    setDefiningAddress(address);
    setShowAddDialog(true);
  };

  const handleSave = () => {
    if (!formName.trim() || !formAddress.trim()) return;

    if (editingClient) {
      // Update existing defined client
      onClientsChange(
        clients.map(c =>
          c.id === editingClient.id
            ? { ...c, name: formName.trim(), address: formAddress.trim(), notes: formNotes.trim(), color: formColor }
            : c
        )
      );
    } else {
      // Add new defined client (either manual "Add Client" or defining an existing address)
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

    setShowAddDialog(false);
    resetForm();
  };

  const copyAddress = async (address: string, id: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  // Filter by search
  const filteredDefined = useMemo(
    () =>
      clients.filter(
        c =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.notes.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [clients, searchQuery],
  );

  const filteredUndefined = useMemo(
    () =>
      undefinedAddresses.filter(
        a =>
          a.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.label.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [undefinedAddresses, searchQuery],
  );

  const definedPaging = useTablePagination(filteredDefined);
  const undefinedPaging = useTablePagination(filteredUndefined);

  useEffect(() => {
    definedPaging.setPage(1);
    undefinedPaging.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  return (
    <>
      <Card className="bg-[#0f1011] border-white/5">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#b6509e]/10">
                <Users className="h-4 w-4 text-[#b6509e]" />
              </div>
              <div>
                <CardTitle className="text-[#f7f8f8] text-base">Client Management</CardTitle>
                <p className="text-xs text-[#8a8f98] mt-0.5">All wallets you've transacted with — name them for easy identification</p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-[#b6509e] hover:bg-[#b6509e]/80 text-white"
              onClick={openAddDialog}
            >
              <UserPlus className="h-4 w-4 ml-1" />
              Add Client
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
            <Input
              placeholder="Search by name or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-sm h-10 pr-10"
            />
          </div>

          {/* Counts */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] bg-[#0ecb81]/5 text-[#0ecb81] border-[#0ecb81]/20">
              {clients.length} Defined
            </Badge>
            <Badge variant="outline" className="text-[10px] bg-[#8a8f98]/5 text-[#8a8f98] border-[#8a8f98]/20">
              {undefinedAddresses.length} Undefined
            </Badge>
          </div>

          {/* Defined clients section */}
          {filteredDefined.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#0ecb81]" />
                <span className="text-[11px] text-[#0ecb81] font-medium">Defined Clients</span>
              </div>
              <div className="space-y-1.5">
                {definedPaging.pageItems.map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center gap-3 bg-[#191a1b] rounded-lg p-3 hover:bg-[#1e1f20] transition-colors group"
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${client.color}15` }}
                    >
                      <Wallet className="h-4 w-4" style={{ color: client.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#f7f8f8]">{client.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-[#8a8f98] font-mono" dir="ltr">
                          {truncateAddress(client.address)}
                        </span>
                        <button
                          className="p-0.5 rounded hover:bg-[#28282c] transition-colors"
                          onClick={(e) => { e.stopPropagation(); copyAddress(client.address, client.id); }}
                          title="Copy Address"
                        >
                          {copiedId === client.id ? (
                            <Check className="h-2.5 w-2.5 text-[#0ecb81]" />
                          ) : (
                            <Copy className="h-2.5 w-2.5 text-[#8a8f98]" />
                          )}
                        </button>
                      </div>
                      {client.notes && (
                        <p className="text-[10px] text-[#8a8f98]/60 mt-0.5 truncate">{client.notes}</p>
                      )}
                    </div>
                    <button
                      className="p-1.5 rounded hover:bg-[#28282c] transition-colors opacity-60 group-hover:opacity-100"
                      onClick={() => openEditDialog(client)}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5 text-[#8a8f98]" />
                    </button>
                  </div>
                ))}
              </div>
              <TablePagination
                page={definedPaging.page}
                pageSize={definedPaging.pageSize}
                totalItems={definedPaging.totalItems}
                onPageChange={definedPaging.setPage}
                className="px-0"
              />
            </div>
          )}

          {/* Undefined addresses section */}
          {filteredUndefined.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 mt-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#8a8f98]" />
                <span className="text-[11px] text-[#8a8f98] font-medium">Undefined Addresses</span>
              </div>
              <div className="space-y-1.5">
                {undefinedPaging.pageItems.map((addr) => (
                  <div
                    key={addr.address}
                    className="flex items-center gap-3 bg-[#191a1b]/40 rounded-lg p-3 hover:bg-[#191a1b] transition-colors group border border-dashed border-white/5"
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#8a8f98]/10">
                      <Wallet className="h-4 w-4 text-[#8a8f98]/40" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[#8a8f98]">{addr.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-[#8a8f98]/50 font-mono" dir="ltr">
                          {truncateAddress(addr.address)}
                        </span>
                        <button
                          className="p-0.5 rounded hover:bg-[#28282c] transition-colors"
                          onClick={(e) => { e.stopPropagation(); copyAddress(addr.address, addr.address); }}
                          title="Copy Address"
                        >
                          {copiedId === addr.address ? (
                            <Check className="h-2.5 w-2.5 text-[#0ecb81]" />
                          ) : (
                            <Copy className="h-2.5 w-2.5 text-[#8a8f98]/30" />
                          )}
                        </button>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] bg-[#b6509e]/5 border-[#b6509e]/20 text-[#b6509e] hover:bg-[#b6509e]/10 hover:text-[#b6509e]"
                      onClick={() => openDefineDialog(addr.address)}
                    >
                      <UserPlus className="h-3 w-3 ml-1" />
                      Define</Button>
                  </div>
                ))}
              </div>
              <TablePagination
                page={undefinedPaging.page}
                pageSize={undefinedPaging.pageSize}
                totalItems={undefinedPaging.totalItems}
                onPageChange={undefinedPaging.setPage}
                className="px-0"
              />
            </div>
          )}

          {/* Empty state */}
          {filteredDefined.length === 0 && filteredUndefined.length === 0 && (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-[#28282c] mx-auto mb-3" />
              <p className="text-sm text-[#8a8f98]">
                {searchQuery ? 'No results found' : 'No transactions yet'}
              </p>
              <p className="text-xs text-[#8a8f98]/60 mt-1">
                {searchQuery ? 'Try a different search term' : 'Wallet addresses you transact with will appear here automatically'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit/Define Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-[#0f1011] border-white/10 text-[#f7f8f8] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5 text-[#b6509e]" />
              {editingClient ? 'Edit Client' : definingAddress ? 'Define Client' : 'Add New Client'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#8a8f98]">Client Name</label>
              <Input
                placeholder="e.g., John, XYZ Corp..."
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-sm h-10"
                autoFocus
              />
            </div>

            {/* Wallet Address */}
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
                <p className="text-[10px] text-[#8a8f98]/60">Wallet address is locked from transactions</p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#8a8f98]">Notes (optional)</label>
              <Input
                placeholder="Notes about the client..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-sm h-10"
              />
            </div>

            {/* Color */}
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

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                className="flex-1 bg-[#b6509e] hover:bg-[#b6509e]/80 text-white"
                onClick={handleSave}
                disabled={!formName.trim() || !formAddress.trim()}
              >
                {editingClient ? 'Save Changes' : 'Add Client'}
              </Button>
              <Button
                variant="outline"
                className="bg-[#191a1b] border-white/10 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8]"
                onClick={() => setShowAddDialog(false)}
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
