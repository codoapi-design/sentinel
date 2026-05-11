'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  MessageCircle,
  Plus,
  Clock,
  Star,
  Send,
  Headphones,
  User,
  Check,
  Phone,
  Mail,
  Loader2,
  X,
} from 'lucide-react';
import { useSupportStore } from '@/stores/support-store';
import type {
  SupportTicket,
  TicketPriority,
  TicketStatus,
  TicketCategory,
  TicketMessage,
  DedicatedAccountant,
} from '@/lib/support/types';
import { toast } from 'sonner';

// ============================================================
// Constants & Helpers
// ============================================================

const STATUS_TABS: { value: TicketStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting_user', label: 'Waiting for You' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string; bg: string; border: string }> = {
  low: { label: 'Low', color: 'text-[#8a8f98]', bg: 'bg-[#8a8f98]/10', border: 'border-[#8a8f98]/20' },
  medium: { label: 'Medium', color: 'text-[#0052ff]', bg: 'bg-[#0052ff]/10', border: 'border-[#0052ff]/20' },
  high: { label: 'High', color: 'text-[#f7931a]', bg: 'bg-[#f7931a]/10', border: 'border-[#f7931a]/20' },
  urgent: { label: 'Urgent', color: 'text-[#f6465d]', bg: 'bg-[#f6465d]/10', border: 'border-[#f6465d]/20' },
};

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; bg: string; border: string }> = {
  open: { label: 'Open', color: 'text-[#0052ff]', bg: 'bg-[#0052ff]/10', border: 'border-[#0052ff]/20' },
  in_progress: { label: 'In Progress', color: 'text-[#f7931a]', bg: 'bg-[#f7931a]/10', border: 'border-[#f7931a]/20' },
  waiting_user: { label: 'Waiting', color: 'text-[#8a8f98]', bg: 'bg-[#8a8f98]/10', border: 'border-[#8a8f98]/20' },
  resolved: { label: 'Resolved', color: 'text-[#0ecb81]', bg: 'bg-[#0ecb81]/10', border: 'border-[#0ecb81]/20' },
  closed: { label: 'Closed', color: 'text-[#8a8f98]', bg: 'bg-[#8a8f98]/10', border: 'border-[#8a8f98]/20' },
};

const CATEGORY_CONFIG: Record<TicketCategory, { label: string; color: string; bg: string; border: string }> = {
  technical: { label: 'Technical', color: 'text-[#0052ff]', bg: 'bg-[#0052ff]/10', border: 'border-[#0052ff]/20' },
  billing: { label: 'Billing', color: 'text-[#f7931a]', bg: 'bg-[#f7931a]/10', border: 'border-[#f7931a]/20' },
  accounting: { label: 'Accounting', color: 'text-[#0ecb81]', bg: 'bg-[#0ecb81]/10', border: 'border-[#0ecb81]/20' },
  feature_request: { label: 'Feature Request', color: 'text-[#8a8f98]', bg: 'bg-[#8a8f98]/10', border: 'border-[#8a8f98]/20' },
  bug: { label: 'Bug', color: 'text-[#f6465d]', bg: 'bg-[#f6465d]/10', border: 'border-[#f6465d]/20' },
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================
// Sub-Components
// ============================================================

function AccountantCard({ accountant }: { accountant: DedicatedAccountant }) {
  return (
    <Card className="bg-[#0f1011] border-white/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14 border-2 border-[#0052ff]/30">
            <AvatarFallback className="bg-[#0052ff]/10 text-[#0052ff] text-lg font-semibold">
              {accountant.name.charAt(0)}{accountant.name.charAt(accountant.name.indexOf(' ') + 1)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-medium text-[#f7f8f8]">{accountant.name}</p>
              <div className={`w-2 h-2 rounded-full ${accountant.available ? 'bg-[#0ecb81]' : 'bg-[#f6465d]'}`} />
            </div>
            <p className="text-xs text-[#8a8f98] mb-2">{accountant.title}</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {accountant.specializations.map((spec) => (
                <Badge key={spec} variant="outline" className="text-[10px] px-1.5 py-0 bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20">
                  {spec}
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[#8a8f98]">
              <a href={`mailto:${accountant.email}`} className="flex items-center gap-1 hover:text-[#0052ff] transition-colors">
                <Mail className="h-3 w-3" />
                {accountant.email}
              </a>
              <a href={`tel:${accountant.phone}`} className="flex items-center gap-1 hover:text-[#0ecb81] transition-colors" dir="ltr">
                <Phone className="h-3 w-3" />
                {accountant.phone}
              </a>
            </div>
          </div>
          <div className="shrink-0">
            <Button
              size="sm"
              className="bg-[#0052ff] hover:bg-[#0052ff]/80 text-white text-xs rounded-full px-4"
              disabled={!accountant.available}
            >
              <Headphones className="h-3.5 w-3.5 ml-1.5" />
              Contact
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TicketCard({
  ticket,
  onClick,
}: {
  ticket: SupportTicket;
  onClick: () => void;
}) {
  const priority = PRIORITY_CONFIG[ticket.priority];
  const status = STATUS_CONFIG[ticket.status];
  const category = CATEGORY_CONFIG[ticket.category];
  const lastMessage = ticket.messages[ticket.messages.length - 1];

  return (
    <button
      onClick={onClick}
      className="w-full text-right bg-[#0f1011] border border-white/5 rounded-lg p-4 hover:bg-[#191a1b]/50 hover:border-white/10 transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#f7f8f8] truncate">{ticket.subject}</p>
          {lastMessage && (
            <p className="text-[10px] text-[#8a8f98] truncate mt-0.5">{lastMessage.content}</p>
          )}
        </div>
        <Badge variant="outline" className={`${priority.bg} ${priority.color} ${priority.border} text-[10px] px-1.5 shrink-0`}>
          {priority.label}
        </Badge>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={`${status.bg} ${status.color} ${status.border} text-[10px] px-1.5`}>
          {status.label}
        </Badge>
        <Badge variant="outline" className={`${category.bg} ${category.color} ${category.border} text-[10px] px-1.5`}>
          {category.label}
        </Badge>
        {ticket.assignedTo && (
          <span className="text-[10px] text-[#8a8f98] flex items-center gap-1">
            <User className="h-2.5 w-2.5" />
            {ticket.assignedTo}
          </span>
        )}
        <span className="text-[10px] text-[#8a8f98] flex items-center gap-1 mr-auto">
          <Clock className="h-2.5 w-2.5" />
          {formatTimeAgo(ticket.createdAt)}
        </span>
      </div>
    </button>
  );
}

function TicketDetail({
  ticket,
  onBack,
  onSendMessage,
  onCloseTicket,
  onRate,
}: {
  ticket: SupportTicket;
  onBack: () => void;
  onSendMessage: (content: string) => void;
  onCloseTicket: () => void;
  onRate: (rating: number) => void;
}) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const priority = PRIORITY_CONFIG[ticket.priority];
  const status = STATUS_CONFIG[ticket.status];
  const category = CATEGORY_CONFIG[ticket.category];

  const handleSend = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      onSendMessage(reply.trim());
      setReply('');
      toast.success('Message sent');
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const canReply = ticket.status !== 'closed';
  const canRate = (ticket.status === 'resolved' || ticket.status === 'closed') && !ticket.satisfactionRating;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-[#191a1b] -mr-2"
          onClick={onBack}
        >
          ← Back
        </Button>
      </div>
      <div>
        <h3 className="text-base font-semibold text-[#f7f8f8] mb-2">{ticket.subject}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`${status.bg} ${status.color} ${status.border} text-[10px] px-1.5`}>
            {status.label}
          </Badge>
          <Badge variant="outline" className={`${priority.bg} ${priority.color} ${priority.border} text-[10px] px-1.5`}>
            {priority.label}
          </Badge>
          <Badge variant="outline" className={`${category.bg} ${category.color} ${category.border} text-[10px] px-1.5`}>
            {category.label}
          </Badge>
          {ticket.assignedTo && (
            <span className="text-[10px] text-[#8a8f98] flex items-center gap-1">
              <User className="h-2.5 w-2.5" />
              Accountant: {ticket.assignedTo}
            </span>
          )}
        </div>
      </div>

      <Separator className="bg-white/5" />

      {/* Message Thread */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar py-2">
        {ticket.messages.map((message) => {
          const isUser = message.sender === 'user';
          return (
            <div
              key={message.id}
              className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  isUser
                    ? 'bg-[#0052ff]/10 border border-[#0052ff]/20'
                    : 'bg-[#191a1b] border border-white/5'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {!isUser && (
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className={`text-[8px] ${message.sender === 'accountant' ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#8a8f98]/10 text-[#8a8f98]'}`}>
                        {message.sender === 'accountant' ? 'A' : 'S'}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <span className={`text-[10px] font-medium ${isUser ? 'text-[#0052ff]' : message.sender === 'accountant' ? 'text-[#0ecb81]' : 'text-[#8a8f98]'}`}>
                    {message.senderName}
                  </span>
                  <span className="text-[9px] text-[#8a8f98]">{formatMessageTime(message.createdAt)}</span>
                </div>
                <p className="text-xs text-[#d0d6e0] leading-relaxed whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          );
        })}
      </div>

      <Separator className="bg-white/5" />

      {/* Actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {canRate && <RatingInput onRate={onRate} />}
          {ticket.status !== 'closed' && (
            <Button
              variant="outline"
              size="sm"
              className="bg-[#191a1b] border-white/5 text-[#8a8f98] hover:text-[#f6465d] hover:bg-[#f6465d]/10 text-xs"
              onClick={onCloseTicket}
            >
              <X className="h-3.5 w-3.5 ml-1" />
              Close Ticket
            </Button>
          )}
        </div>
        {ticket.satisfactionRating && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[#8a8f98] ml-1">Your rating:</span>
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`h-3.5 w-3.5 ${star <= ticket.satisfactionRating! ? 'fill-[#f7931a] text-[#f7931a]' : 'text-[#8a8f98]/30'}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reply Input */}
      {canReply && (
        <div className="flex items-end gap-2">
          <Textarea
            placeholder="Type your reply..."
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            className="bg-[#191a1b] border-white/5 text-[#d0d6e0] placeholder-[#8a8f98] text-sm min-h-[60px] resize-none"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (reply.trim()) handleSend();
              }
            }}
          />
          <Button
            size="sm"
            className="bg-[#0052ff] hover:bg-[#0052ff]/80 text-white h-9 w-9 p-0 shrink-0"
            onClick={handleSend}
            disabled={!reply.trim() || sending}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}

function RatingInput({ onRate }: { onRate: (rating: number) => void }) {
  const [hovered, setHovered] = useState(0);
  const [rated, setRated] = useState(0);

  const handleRate = (rating: number) => {
    setRated(rating);
    onRate(rating);
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-[#8a8f98] ml-1">Rate:</span>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => handleRate(star)}
          className="transition-colors"
        >
          <Star
            className={`h-4 w-4 ${
              star <= (hovered || rated)
                ? 'fill-[#f7931a] text-[#f7931a]'
                : 'text-[#8a8f98]/30 hover:text-[#f7931a]/50'
            }`}
          />
        </button>
      ))}
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export function SupportCenter() {
  const store = useSupportStore();
  const { tickets, dedicatedAccountant, isLoading } = store;

  // UI state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeTab, setActiveTab] = useState<TicketStatus | 'all'>('all');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // Create form state
  const [newSubject, setNewSubject] = useState('');
  const [newCategory, setNewCategory] = useState<TicketCategory>('technical');
  const [newPriority, setNewPriority] = useState<TicketPriority>('medium');
  const [newDescription, setNewDescription] = useState('');

  // Load accountant on mount
  useEffect(() => {
    store.loadAccountant();
  }, [store]);

  // Get selected ticket
  const selectedTicket = selectedTicketId
    ? tickets.find((t) => t.id === selectedTicketId) ?? null
    : null;

  // Filtered tickets
  const filteredTickets = activeTab === 'all'
    ? tickets
    : tickets.filter((t) => t.status === activeTab);

  // Ticket counts by status
  const ticketCounts = useCallback(() => {
    const counts: Record<string, number> = { all: tickets.length };
    for (const t of tickets) {
      counts[t.status] = (counts[t.status] || 0) + 1;
    }
    return counts;
  }, [tickets]);

  const counts = ticketCounts();

  const handleCreateTicket = () => {
    if (!newSubject.trim()) {
      toast.error('Please enter a ticket subject');
      return;
    }
    if (!newDescription.trim()) {
      toast.error('Please describe the issue');
      return;
    }

    try {
      store.createTicket(newSubject.trim(), newDescription.trim(), newCategory, newPriority);
      toast.success('Ticket created successfully');
      setShowCreateForm(false);
      setNewSubject('');
      setNewCategory('technical');
      setNewPriority('medium');
      setNewDescription('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create ticket');
    }
  };

  const handleSendMessage = (content: string) => {
    if (selectedTicketId) {
      store.addMessage(selectedTicketId, content, 'user');
    }
  };

  const handleCloseTicket = () => {
    if (selectedTicketId) {
      store.closeTicket(selectedTicketId);
      toast.success('Ticket closed');
    }
  };

  const handleRate = (rating: number) => {
    if (selectedTicketId) {
      try {
        store.rateTicket(selectedTicketId, rating);
        toast.success('Thanks for your rating!');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to submit rating');
      }
    }
  };

  // If a ticket is selected, show detail view
  if (selectedTicket) {
    return (
      <div >
        <TicketDetail
          ticket={selectedTicket}
          onBack={() => setSelectedTicketId(null)}
          onSendMessage={handleSendMessage}
          onCloseTicket={handleCloseTicket}
          onRate={handleRate}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0ecb81]/10 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-[#0ecb81]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#f7f8f8]">Support Center</h2>
            <p className="text-xs text-[#8a8f98]">Get help from the support team and specialized accountants</p>
          </div>
        </div>
        <Button
          onClick={() => setShowCreateForm(true)}
          className="bg-[#0ecb81] hover:bg-[#0ecb81]/80 text-white rounded-full px-4"
        >
          <Plus className="h-4 w-4 ml-2" />
          New Ticket
        </Button>
      </div>

      {/* Dedicated Accountant Card */}
      {dedicatedAccountant && <AccountantCard accountant={dedicatedAccountant} />}

      {/* Create Ticket Dialog */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="bg-[#0f1011] border-white/10 text-[#f7f8f8] max-w-lg" >
          <DialogHeader>
            <DialogTitle className="text-[#f7f8f8]">Create Support Ticket</DialogTitle>
            <DialogDescription className="text-[#8a8f98] text-xs">
              Describe your issue and the support team will get back to you as soon as possible
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Subject */}
            <div className="space-y-2">
              <Label className="text-xs text-[#8a8f98]">Subject</Label>
              <Input
                placeholder="e.g.: Wallet sync issue"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                className="bg-[#191a1b] border-white/5 text-[#d0d6e0] placeholder-[#8a8f98] text-sm"
              />
            </div>

            {/* Category & Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-[#8a8f98]">Category</Label>
                <Select value={newCategory} onValueChange={(v) => setNewCategory(v as TicketCategory)}>
                  <SelectTrigger className="bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#191a1b] border-white/10">
                    <SelectItem value="technical" className="text-[#d0d6e0] text-xs">Technical</SelectItem>
                    <SelectItem value="billing" className="text-[#d0d6e0] text-xs">Billing</SelectItem>
                    <SelectItem value="accounting" className="text-[#d0d6e0] text-xs">Accounting</SelectItem>
                    <SelectItem value="feature_request" className="text-[#d0d6e0] text-xs">Feature Request</SelectItem>
                    <SelectItem value="bug" className="text-[#d0d6e0] text-xs">Bug</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-[#8a8f98]">Priority</Label>
                <Select value={newPriority} onValueChange={(v) => setNewPriority(v as TicketPriority)}>
                  <SelectTrigger className="bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#191a1b] border-white/10">
                    <SelectItem value="low" className="text-[#d0d6e0] text-xs">Low</SelectItem>
                    <SelectItem value="medium" className="text-[#d0d6e0] text-xs">Medium</SelectItem>
                    <SelectItem value="high" className="text-[#d0d6e0] text-xs">High</SelectItem>
                    <SelectItem value="urgent" className="text-[#d0d6e0] text-xs">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-xs text-[#8a8f98]">Description</Label>
              <Textarea
                placeholder="Describe your issue in detail..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="bg-[#191a1b] border-white/5 text-[#d0d6e0] placeholder-[#8a8f98] text-sm min-h-[100px]"
                rows={4}
              />
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleCreateTicket}
                className="flex-1 bg-[#0ecb81] hover:bg-[#0ecb81]/80 text-white"
                disabled={!newSubject.trim() || !newDescription.trim()}
              >
                <Send className="h-4 w-4 ml-2" />
                Send Ticket
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCreateForm(false)}
                className="bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8]"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 custom-scrollbar">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.value
                ? 'bg-[#0052ff] text-white'
                : 'text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-[#191a1b]'
            }`}
          >
            {tab.label}
            {counts[tab.value] !== undefined && counts[tab.value] > 0 && (
              <span className="mr-1 text-[10px] opacity-70">({counts[tab.value]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-[#0ecb81] animate-spin" />
        </div>
      )}

      {/* Tickets List */}
      {!isLoading && filteredTickets.length > 0 && (
        <div className="space-y-2">
          {filteredTickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onClick={() => setSelectedTicketId(ticket.id)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredTickets.length === 0 && (
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="py-16 flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-[#0ecb81]/10 flex items-center justify-center mb-4">
              <MessageCircle className="h-8 w-8 text-[#0ecb81] opacity-50" />
            </div>
            <h3 className="text-base font-medium text-[#f7f8f8] mb-2">
              {activeTab === 'all' ? 'No tickets' : `No tickets ${STATUS_TABS.find(t => t.value === activeTab)?.label}`}
            </h3>
            <p className="text-sm text-[#8a8f98] text-center max-w-sm mb-4">
              {activeTab === 'all'
                ? "Create a new support ticket and you'll get a response as soon as possible"
                : 'Try a different filter or create a new ticket'
              }
            </p>
            <Button
              onClick={() => setShowCreateForm(true)}
              className="bg-[#0ecb81] hover:bg-[#0ecb81]/80 text-white rounded-full px-6"
            >
              <Plus className="h-4 w-4 ml-2" />
              New Ticket
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
