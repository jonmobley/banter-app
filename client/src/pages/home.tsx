import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Radio, Phone, Users, Plus, X, UserPlus } from "lucide-react";
import { useState } from "react";

interface Participant {
  callSid: string;
  phone: string;
  name: string | null;
  muted: boolean;
  hold: boolean;
}

interface ParticipantsData {
  count: number;
  participants: Participant[];
  conferenceActive: boolean;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
}

function formatPhone(phone: string): string {
  if (!phone || phone === 'Unknown') return 'Unknown';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    const number = cleaned.slice(1);
    return `(${number.slice(0, 3)}) ${number.slice(3, 6)}-${number.slice(6)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

export default function Home() {
  const queryClient = useQueryClient();
  const [showAddContact, setShowAddContact] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const { data: health } = useQuery({
    queryKey: ["/api/health"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error("Health check failed");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: participantsData } = useQuery<ParticipantsData>({
    queryKey: ["/api/participants"],
    queryFn: async () => {
      const res = await fetch("/api/participants");
      if (!res.ok) throw new Error("Failed to fetch participants");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    queryFn: async () => {
      const res = await fetch("/api/contacts");
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json();
    },
  });

  const addContact = useMutation({
    mutationFn: async ({ name, phone }: { name: string; phone: string }) => {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone }),
      });
      if (!res.ok) throw new Error("Failed to add contact");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setNewName("");
      setNewPhone("");
      setShowAddContact(false);
    },
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete contact");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    },
  });

  const isOnline = health?.status === "ok";
  const participantCount = participantsData?.count || 0;
  const participants = participantsData?.participants || [];

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName && newPhone) {
      addContact.mutate({ name: newName, phone: newPhone });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="flex-1 flex flex-col items-center px-6 py-10">
        <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
          <Radio className="w-7 h-7 text-emerald-400" />
        </div>
        
        <h1 className="text-3xl font-bold mb-1" data-testid="text-title">Banter</h1>
        <p className="text-slate-400 text-sm mb-5">Call to talk</p>

        <a
          href="tel:+12202423245"
          className="flex items-center justify-center gap-2 w-full max-w-xs bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-3 px-6 rounded-full mb-6 transition-colors"
          data-testid="button-connect"
        >
          <Phone className="w-5 h-5" />
          Connect
        </a>

        <div className="flex items-center gap-2 mb-6">
          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="text-xs text-slate-400" data-testid="text-status">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* On Call Section */}
        <div className="w-full max-w-xs mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-400 uppercase tracking-wide" data-testid="text-participant-count">
              On Call ({participantCount})
            </span>
          </div>

          {participants.length > 0 ? (
            <div className="space-y-2">
              {participants.map((p, i) => (
                <div 
                  key={p.callSid} 
                  className="flex items-center gap-3 bg-slate-800/50 rounded-lg px-3 py-2"
                  data-testid={`participant-${i}`}
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <span className="text-sm font-medium text-emerald-400">
                      {p.name ? p.name.charAt(0).toUpperCase() : '?'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {p.name || formatPhone(p.phone)}
                    </p>
                    {p.name && (
                      <p className="text-xs text-slate-500 truncate">{formatPhone(p.phone)}</p>
                    )}
                  </div>
                  <div className={`w-2 h-2 rounded-full ${p.muted ? 'bg-slate-500' : 'bg-emerald-400'}`} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600 text-center py-4">No one on the call</p>
          )}
        </div>

        {/* Contacts Section */}
        <div className="w-full max-w-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-400 uppercase tracking-wide">
                Contacts ({contacts.length})
              </span>
            </div>
            <button 
              onClick={() => setShowAddContact(!showAddContact)}
              className="p-1 rounded hover:bg-slate-800 transition-colors"
              data-testid="button-add-contact"
            >
              <Plus className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {showAddContact && (
            <form onSubmit={handleAddContact} className="bg-slate-800/50 rounded-lg p-3 mb-3 space-y-2">
              <input
                type="text"
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-slate-900 rounded px-3 py-2 text-sm outline-none focus:ring-1 ring-emerald-500"
                data-testid="input-contact-name"
              />
              <input
                type="tel"
                placeholder="Phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full bg-slate-900 rounded px-3 py-2 text-sm outline-none focus:ring-1 ring-emerald-500"
                data-testid="input-contact-phone"
              />
              <button
                type="submit"
                disabled={addContact.isPending}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-2 rounded text-sm transition-colors disabled:opacity-50"
                data-testid="button-save-contact"
              >
                {addContact.isPending ? 'Adding...' : 'Add Contact'}
              </button>
            </form>
          )}

          {contacts.length > 0 ? (
            <div className="space-y-2">
              {contacts.map((c) => (
                <div 
                  key={c.id} 
                  className="flex items-center gap-3 bg-slate-800/30 rounded-lg px-3 py-2"
                  data-testid={`contact-${c.id}`}
                >
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                    <span className="text-sm font-medium text-slate-300">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-slate-500 truncate">{formatPhone(c.phone)}</p>
                  </div>
                  <button
                    onClick={() => deleteContact.mutate(c.id)}
                    className="p-1 rounded hover:bg-slate-700 transition-colors"
                    data-testid={`button-delete-${c.id}`}
                  >
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600 text-center py-4">No contacts yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
