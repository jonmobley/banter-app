import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Calendar, Clock, Bell, X, Trash2, Users, Radio, Copy, Check } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface ExpectedParticipant {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
}

interface ScheduledBanter {
  id: string;
  name: string;
  slug: string;
  scheduledAt: string;
  autoCallEnabled: string;
  reminderEnabled: string;
  status: string;
  participantIds: string[];
  createdAt: string;
}

interface Group {
  id: string;
  name: string;
  memberIds: string[];
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function getCurrentTimeString(): string {
  const now = new Date();
  return now.toTimeString().slice(0, 5);
}

export default function Schedule() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [authToken] = useState(() => localStorage.getItem('banter_auth_token') || '');
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [banterName, setBanterName] = useState("");
  const [banterDate, setBanterDate] = useState("");
  const [banterTime, setBanterTime] = useState("");
  const [autoCallEnabled, setAutoCallEnabled] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  const handleConfirmDelete = () => {
    if (confirmDeleteId) {
      deleteBanter.mutate(confirmDeleteId);
      setConfirmDeleteId(null);
    }
  };

  useEffect(() => {
    if (!authToken) {
      navigate('/mobley');
    }
  }, [authToken, navigate]);

  const { data: banters = [], isLoading: bantersLoading } = useQuery<ScheduledBanter[]>({
    queryKey: ["/api/banters"],
    queryFn: async () => {
      const res = await fetch("/api/banters", {
        headers: { 'Authorization': 'Bearer ' + authToken },
      });
      if (!res.ok) throw new Error("Failed to fetch banters");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: expectedParticipants = [] } = useQuery<ExpectedParticipant[]>({
    queryKey: ["/api/expected"],
    queryFn: async () => {
      const res = await fetch("/api/expected", {
        headers: { 'Authorization': 'Bearer ' + authToken },
      });
      if (!res.ok) throw new Error("Failed to fetch expected");
      return res.json();
    },
  });

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
    queryFn: async () => {
      const res = await fetch("/api/groups", {
        headers: { 'Authorization': 'Bearer ' + authToken },
      });
      if (!res.ok) throw new Error("Failed to fetch groups");
      return res.json();
    },
  });

  const createBanter = useMutation({
    mutationFn: async () => {
      const scheduledAt = new Date(`${banterDate}T${banterTime}`);
      const res = await fetch("/api/banters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authToken,
          name: banterName,
          scheduledAt: scheduledAt.toISOString(),
          autoCallEnabled,
          reminderEnabled,
          participantIds: selectedParticipants
        }),
      });
      if (!res.ok) throw new Error("Failed to create banter");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/banters"] });
      resetModal();
      setShowCreateModal(false);
      toast({ title: "Banter scheduled", description: "Your call has been scheduled." });
    },
    onError: () => {
      toast({ title: "Failed to schedule", description: "Please try again.", variant: "destructive" });
    },
  });

  const deleteBanter = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/banters/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken }),
      });
      if (!res.ok) throw new Error("Failed to delete banter");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/banters"] });
      toast({ title: "Banter cancelled" });
    },
    onError: () => {
      toast({ title: "Failed to cancel", description: "Please try again.", variant: "destructive" });
    },
  });

  const resetModal = () => {
    setBanterName("");
    setBanterDate("");
    setBanterTime("");
    setAutoCallEnabled(false);
    setReminderEnabled(true);
    setSelectedParticipants([]);
  };

  const toggleParticipant = (id: string) => {
    setSelectedParticipants(prev => 
      prev.includes(id) 
        ? prev.filter(p => p !== id)
        : [...prev, id]
    );
  };

  const addGroupMembers = (group: Group) => {
    setSelectedParticipants(prev => {
      const newIds = group.memberIds.filter(id => !prev.includes(id));
      return [...prev, ...newIds];
    });
  };

  const pendingBanters = banters.filter(b => b.status === 'pending');
  const pastBanters = banters.filter(b => b.status !== 'pending');

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="flex items-center gap-4 px-4 py-4 border-b border-slate-800">
        <Link 
          href="/account"
          className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold" data-testid="text-title">Scheduled Banters</h1>
        <div className="flex-1" />
        <button
          onClick={() => setShowCreateModal(true)}
          className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors"
          data-testid="button-create"
        >
          <Plus className="w-5 h-5 text-emerald-400" />
        </button>
      </header>

      <div className="flex-1 overflow-auto px-4 py-6">
        {bantersLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-slate-800/50 rounded-xl p-4 animate-pulse">
                <div className="h-5 bg-slate-700 rounded w-32 mb-3" />
                <div className="h-4 bg-slate-700/50 rounded w-48 mb-3" />
                <div className="flex gap-2">
                  <div className="h-6 bg-slate-700/30 rounded-full w-20" />
                  <div className="h-6 bg-slate-700/30 rounded-full w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : pendingBanters.length === 0 && pastBanters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="w-16 h-16 text-slate-600 mb-4" />
            <h2 className="text-lg font-medium text-slate-400 mb-2">No Scheduled Banters</h2>
            <p className="text-sm text-slate-500 mb-6">Schedule a call to get started</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-3 px-6 rounded-full transition-colors"
              data-testid="button-create-first"
            >
              <Plus className="w-5 h-5" />
              Schedule a Banter
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {pendingBanters.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">Upcoming</h2>
                <div className="space-y-3">
                  {pendingBanters.map(banter => (
                    <div 
                      key={banter.id} 
                      className="bg-slate-800/50 rounded-xl p-4"
                      data-testid={`banter-${banter.id}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-medium text-lg">{banter.name}</h3>
                          <div className="flex items-center gap-2 text-sm text-slate-400 mt-1">
                            <Clock className="w-4 h-4" />
                            {formatDateTime(banter.scheduledAt)}
                          </div>
                        </div>
                        <button
                          onClick={() => setConfirmDeleteId(banter.id)}
                          className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                          data-testid={`button-delete-${banter.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {banter.autoCallEnabled === 'true' && (
                          <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full flex items-center gap-1">
                            <Bell className="w-3 h-3" />
                            Auto-notify
                          </span>
                        )}
                        {banter.reminderEnabled === 'true' && (
                          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full flex items-center gap-1">
                            <Bell className="w-3 h-3" />
                            15min reminder
                          </span>
                        )}
                        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {banter.participantIds.length} participants
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Link
                          href={`/join/${banter.slug}`}
                          className="flex items-center justify-center gap-2 flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-2.5 rounded-full transition-colors"
                          data-testid={`button-join-${banter.id}`}
                        >
                          <Radio className="w-4 h-4" />
                          Join Banter
                        </Link>
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/join/${banter.slug}`;
                            navigator.clipboard.writeText(url).then(() => {
                              toast({ title: 'Link copied!' });
                            }).catch(() => {
                              toast({ title: 'Failed to copy link', variant: 'destructive' });
                            });
                          }}
                          className="flex items-center justify-center px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-full transition-colors"
                          data-testid={`button-copy-link-${banter.id}`}
                          title="Copy join link"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pastBanters.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">Past</h2>
                <div className="space-y-3">
                  {pastBanters.map(banter => (
                    <div 
                      key={banter.id} 
                      className="bg-slate-800/30 rounded-xl p-4 opacity-60"
                      data-testid={`banter-past-${banter.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-medium">{banter.name}</h3>
                          <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                            <Clock className="w-4 h-4" />
                            {formatDateTime(banter.scheduledAt)}
                          </div>
                        </div>
                        <span className="text-xs bg-slate-700 text-slate-400 px-2 py-1 rounded-full capitalize">
                          {banter.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
          <div className="bg-slate-900 rounded-t-3xl w-full max-w-lg max-h-[90vh] max-h-[90dvh] overflow-auto">
            <div className="sticky top-0 bg-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-xl font-bold">Schedule a Banter</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetModal();
                }}
                className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
                data-testid="button-close-modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-6 pb-safe space-y-6">
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Name</label>
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="words"
                  autoCorrect="off"
                  value={banterName}
                  onChange={(e) => setBanterName(e.target.value)}
                  placeholder="Weekly sync"
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none transition-colors"
                  style={{ fontSize: '16px' }}
                  data-testid="input-banter-name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-400 mb-2 block">Date</label>
                  <input
                    type="date"
                    value={banterDate}
                    onChange={(e) => setBanterDate(e.target.value)}
                    min={getTodayDateString()}
                    className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none transition-colors appearance-none"
                    style={{ fontSize: '16px' }}
                    data-testid="input-banter-date"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-400 mb-2 block">Time</label>
                  <input
                    type="time"
                    value={banterTime}
                    onChange={(e) => setBanterTime(e.target.value)}
                    min={banterDate === getTodayDateString() ? getCurrentTimeString() : undefined}
                    className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none transition-colors appearance-none"
                    style={{ fontSize: '16px' }}
                    data-testid="input-banter-time"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm text-slate-400">Participants</label>
                  {expectedParticipants.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedParticipants.length === expectedParticipants.length) {
                          setSelectedParticipants([]);
                        } else {
                          setSelectedParticipants(expectedParticipants.map(p => p.id));
                        }
                      }}
                      className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                      data-testid="button-select-all-participants"
                    >
                      {selectedParticipants.length === expectedParticipants.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>
                
                {groups.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-slate-500 mb-2">Quick add from group:</p>
                    <div className="flex flex-wrap gap-2">
                      {groups.map(g => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => addGroupMembers(g)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-full text-sm transition-colors"
                          data-testid={`button-add-group-${g.id}`}
                        >
                          <Users className="w-3.5 h-3.5 text-emerald-400" />
                          {g.name}
                          <span className="text-slate-400">({g.memberIds.length})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="space-y-2 max-h-40 overflow-auto">
                  {expectedParticipants.map(p => (
                    <label 
                      key={p.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedParticipants.includes(p.id) 
                          ? 'bg-emerald-500/20 border border-emerald-500/50' 
                          : 'bg-slate-800 border border-transparent'
                      }`}
                      data-testid={`participant-select-${p.id}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedParticipants.includes(p.id)}
                        onChange={() => toggleParticipant(p.id)}
                        className="sr-only"
                      />
                      <div className="w-8 h-8 rounded-full bg-slate-600/50 flex items-center justify-center">
                        <span className="text-sm font-medium text-slate-300">
                          {p.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="font-medium">{p.name}</span>
                    </label>
                  ))}
                  {expectedParticipants.length === 0 && (
                    <div className="text-center py-4">
                      <p className="text-sm text-slate-500 mb-2">
                        No participants yet.
                      </p>
                      <Link
                        href="/contacts"
                        className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1"
                        data-testid="link-add-participants"
                      >
                        <Plus className="w-4 h-4" />
                        Add participants from Contacts
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center justify-between p-4 rounded-xl bg-slate-800 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-emerald-400" />
                    <div>
                      <p className="font-medium">Auto-notify participants</p>
                      <p className="text-sm text-slate-400">Text everyone when the banter starts</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoCallEnabled}
                    onChange={(e) => setAutoCallEnabled(e.target.checked)}
                    className="w-5 h-5 rounded accent-emerald-500"
                    data-testid="toggle-auto-call"
                  />
                </label>

                <label className="flex items-center justify-between p-4 rounded-xl bg-slate-800 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-blue-400" />
                    <div>
                      <p className="font-medium">Send reminder</p>
                      <p className="text-sm text-slate-400">Text participants 15 min before</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={(e) => setReminderEnabled(e.target.checked)}
                    className="w-5 h-5 rounded accent-blue-500"
                    data-testid="toggle-reminder"
                  />
                </label>
              </div>

              <button
                onClick={() => createBanter.mutate()}
                disabled={!banterName || !banterDate || !banterTime}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium py-4 rounded-full transition-colors"
                data-testid="button-schedule"
              >
                Schedule Banter
              </button>
            </div>
          </div>
        </div>
      )}
      
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <h2 className="text-xl font-bold text-center mb-2">Cancel Banter?</h2>
            <p className="text-sm text-slate-400 text-center mb-6">
              This scheduled call will be cancelled. This action cannot be undone.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleConfirmDelete}
                className="w-full bg-red-500 hover:bg-red-400 text-white font-medium py-3.5 rounded-full transition-colors"
                data-testid="button-confirm-delete"
              >
                Cancel Banter
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3.5 rounded-full transition-colors"
                data-testid="button-cancel-delete"
              >
                Keep
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
