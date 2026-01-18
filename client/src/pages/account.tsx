import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Plus, X, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

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

export default function Account() {
  const queryClient = useQueryClient();
  const [showAddContact, setShowAddContact] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

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

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName && newPhone) {
      addContact.mutate({ name: newName, phone: newPhone });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="flex-1 flex flex-col items-center px-6 py-8">
        <div className="w-full max-w-xs">
          <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back</span>
          </Link>

          <h1 className="text-2xl font-bold mb-8 text-center" data-testid="text-title">Account</h1>

          {/* Contacts Section */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-slate-400" />
              <h2 className="font-semibold">Contacts</h2>
              <span className="text-sm text-slate-500">({contacts.length})</span>
            </div>
            <button 
              onClick={() => setShowAddContact(!showAddContact)}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 rounded-full text-sm font-medium transition-colors"
              data-testid="button-add-contact"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>

          {showAddContact && (
            <form onSubmit={handleAddContact} className="bg-slate-800/50 rounded-lg p-4 mb-4 space-y-3">
              <input
                type="text"
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-slate-900 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 ring-emerald-500"
                data-testid="input-contact-name"
              />
              <input
                type="tel"
                placeholder="Phone number"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full bg-slate-900 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 ring-emerald-500"
                data-testid="input-contact-phone"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddContact(false)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addContact.isPending || !newName || !newPhone}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                  data-testid="button-save-contact"
                >
                  {addContact.isPending ? 'Adding...' : 'Save'}
                </button>
              </div>
            </form>
          )}

          {contacts.length > 0 ? (
            <div className="space-y-2">
              {contacts.map((c) => (
                <div 
                  key={c.id} 
                  className="flex items-center gap-3 bg-slate-800/40 rounded-lg px-4 py-3"
                  data-testid={`contact-${c.id}`}
                >
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                    <span className="text-base font-medium text-slate-300">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{c.name}</p>
                    <p className="text-sm text-slate-500 truncate">{formatPhone(c.phone)}</p>
                  </div>
                  <button
                    onClick={() => deleteContact.mutate(c.id)}
                    className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                    data-testid={`button-delete-${c.id}`}
                  >
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-slate-500 mb-2">No contacts yet</p>
              <p className="text-sm text-slate-600">Add contacts to see names when they call</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
