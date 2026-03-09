import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Plus, X, ArrowLeft, Users, Pencil, Trash2, Check, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { formatPhone } from "@/lib/utils";

interface Contact {
  id: string;
  name: string;
  phone: string;
}

interface ExpectedParticipant {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
}

interface Group {
  id: string;
  name: string;
  createdAt: string;
  memberIds: string[];
}

function validatePhone(phone: string): { valid: boolean; error?: string } {
  if (!phone) return { valid: false };
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 10) {
    return { valid: false, error: "Phone number must be at least 10 digits" };
  }
  if (cleaned.length > 11) {
    return { valid: false, error: "Phone number is too long" };
  }
  if (cleaned.length === 11 && !cleaned.startsWith('1')) {
    return { valid: false, error: "11-digit numbers must start with 1" };
  }
  return { valid: true };
}

export default function Contacts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'contacts' | 'groups'>('contacts');
  const [showAddContact, setShowAddContact] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [managingGroup, setManagingGroup] = useState<Group | null>(null);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);
  
  const authToken = localStorage.getItem('banter_auth_token') || '';
  
  if (!authToken) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6">
        <p className="text-slate-400 mb-4" data-testid="text-sign-in-prompt">Please sign in on the main page first</p>
        <Link href="/mobley" className="text-emerald-400 hover:text-emerald-300 transition-colors" data-testid="link-sign-in">
          Go to sign in
        </Link>
      </div>
    );
  }

  const handlePhoneChange = (value: string) => {
    setNewPhone(value);
    const validation = validatePhone(value);
    setPhoneError(value && !validation.valid ? (validation.error || null) : null);
  };
  
  const handleConfirmDelete = () => {
    if (confirmDeleteId) {
      deleteContact.mutate(confirmDeleteId);
      setConfirmDeleteId(null);
    }
  };

  const { data: contacts = [], isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    queryFn: async () => {
      const res = await fetch("/api/contacts", {
        headers: { 'Authorization': 'Bearer ' + authToken },
      });
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json();
    },
  });

  const { data: participants = [] } = useQuery<ExpectedParticipant[]>({
    queryKey: ["/api/expected"],
    queryFn: async () => {
      const res = await fetch("/api/expected", {
        headers: { 'Authorization': 'Bearer ' + authToken },
      });
      if (!res.ok) throw new Error("Failed to fetch participants");
      return res.json();
    },
  });

  const { data: groups = [], isLoading: groupsLoading } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
    queryFn: async () => {
      const res = await fetch("/api/groups", {
        headers: { 'Authorization': 'Bearer ' + authToken },
      });
      if (!res.ok) throw new Error("Failed to fetch groups");
      return res.json();
    },
  });

  const addContact = useMutation({
    mutationFn: async ({ name, phone }: { name: string; phone: string }) => {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, name, phone }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || "Failed to add contact");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setNewName("");
      setNewPhone("");
      setShowAddContact(false);
      toast({ title: "Contact added", description: "New contact has been saved." });
    },
    onError: (error: Error) => {
      const isDuplicate = error.message.toLowerCase().includes("already exists") || error.message.toLowerCase().includes("duplicate");
      toast({
        title: "Failed to add contact",
        description: isDuplicate ? "A contact with this phone number already exists" : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/contacts/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken }),
      });
      if (!res.ok) throw new Error("Failed to delete contact");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete contact", description: "Please try again.", variant: "destructive" });
    },
  });

  const createGroup = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, name }),
      });
      if (!res.ok) throw new Error("Failed to create group");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setNewGroupName("");
      setShowAddGroup(false);
      toast({ title: "Group created" });
    },
    onError: () => {
      toast({ title: "Failed to create group", description: "Please try again.", variant: "destructive" });
    },
  });

  const updateGroup = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch(`/api/groups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, name }),
      });
      if (!res.ok) throw new Error("Failed to update group");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setEditingGroup(null);
      toast({ title: "Group updated" });
    },
    onError: () => {
      toast({ title: "Failed to update group", description: "Please try again.", variant: "destructive" });
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/groups/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken }),
      });
      if (!res.ok) throw new Error("Failed to delete group");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setConfirmDeleteGroupId(null);
      toast({ title: "Group deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete group", description: "Please try again.", variant: "destructive" });
    },
  });

  const addGroupMember = useMutation({
    mutationFn: async ({ groupId, participantId }: { groupId: string; participantId: string }) => {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, participantId }),
      });
      if (!res.ok) throw new Error("Failed to add member");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setManagingGroup(data);
    },
    onError: () => {
      toast({ title: "Failed to add member", description: "Please try again.", variant: "destructive" });
    },
  });

  const removeGroupMember = useMutation({
    mutationFn: async ({ groupId, participantId }: { groupId: string; participantId: string }) => {
      const res = await fetch(`/api/groups/${groupId}/members/${participantId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken }),
      });
      if (!res.ok) throw new Error("Failed to remove member");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setManagingGroup(data);
    },
    onError: () => {
      toast({ title: "Failed to remove member", description: "Please try again.", variant: "destructive" });
    },
  });

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName && newPhone) {
      addContact.mutate({ name: newName, phone: newPhone });
    }
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (newGroupName.trim()) {
      createGroup.mutate(newGroupName.trim());
    }
  };

  const handleUpdateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingGroup && editGroupName.trim()) {
      updateGroup.mutate({ id: editingGroup.id, name: editGroupName.trim() });
    }
  };

  const getParticipantName = (id: string) => {
    const p = participants.find(p => p.id === id);
    return p?.name || 'Unknown';
  };

  const filteredContacts = contacts.filter((c) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(query) || c.phone.toLowerCase().includes(query);
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="flex-1 flex flex-col items-center px-6 py-8">
        <div className="w-full max-w-xs">
          <Link href="/account" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8" data-testid="link-back">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back</span>
          </Link>

          <h1 className="text-2xl font-bold mb-6 text-center" data-testid="text-title">Contacts</h1>

          <div className="flex bg-slate-800/50 rounded-full p-1 mb-6">
            <button
              onClick={() => setActiveTab('contacts')}
              className={`flex-1 py-2 px-4 rounded-full text-sm font-medium transition-colors ${
                activeTab === 'contacts' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
              data-testid="tab-contacts"
            >
              Contacts
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`flex-1 py-2 px-4 rounded-full text-sm font-medium transition-colors ${
                activeTab === 'groups' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
              data-testid="tab-groups"
            >
              Groups
            </button>
          </div>

          {activeTab === 'contacts' ? (
            <>
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
                <form onSubmit={handleAddContact} className="bg-slate-800/50 rounded-xl p-4 mb-4 space-y-3">
                  <input
                    type="text"
                    inputMode="text"
                    autoComplete="name"
                    autoCapitalize="words"
                    autoCorrect="off"
                    placeholder="Name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full bg-slate-900 rounded-xl px-4 py-3.5 outline-none focus:ring-2 ring-emerald-500"
                    style={{ fontSize: '16px' }}
                    data-testid="input-contact-name"
                  />
                  <div>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      autoCorrect="off"
                      placeholder="Phone number"
                      value={newPhone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      className={`w-full bg-slate-900 rounded-xl px-4 py-3.5 outline-none focus:ring-2 ${phoneError ? 'ring-2 ring-red-500' : 'ring-emerald-500'}`}
                      style={{ fontSize: '16px' }}
                      data-testid="input-contact-phone"
                    />
                    {phoneError && (
                      <p className="text-red-400 text-xs mt-1">{phoneError}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddContact(false)}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
                      data-testid="button-cancel-add-contact"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addContact.isPending || !newName || !newPhone || !validatePhone(newPhone).valid}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                      data-testid="button-save-contact"
                    >
                      {addContact.isPending ? 'Adding...' : 'Save'}
                    </button>
                  </div>
                </form>
              )}

              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-800/50 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 ring-emerald-500 text-sm"
                  style={{ fontSize: '16px' }}
                  data-testid="input-search-contacts"
                />
              </div>

              {contactsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 bg-slate-800/40 rounded-lg px-4 py-3 animate-pulse">
                      <div className="w-10 h-10 rounded-full bg-slate-700" />
                      <div className="flex-1 min-w-0">
                        <div className="h-4 bg-slate-700 rounded w-24 mb-2" />
                        <div className="h-3 bg-slate-700/50 rounded w-32" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredContacts.length > 0 ? (
                <div className="space-y-2">
                  {filteredContacts.map((c) => (
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
                        onClick={() => setConfirmDeleteId(c.id)}
                        className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                        data-testid={`button-delete-${c.id}`}
                      >
                        <X className="w-4 h-4 text-slate-500" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : contacts.length > 0 && searchQuery ? (
                <div className="text-center py-12">
                  <p className="text-slate-500 mb-2">No contacts match your search</p>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-slate-500 mb-2">No contacts yet</p>
                  <p className="text-sm text-slate-600">Add contacts to see names when they call</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-slate-400" />
                  <h2 className="font-semibold">Groups</h2>
                  <span className="text-sm text-slate-500">({groups.length})</span>
                </div>
                <button 
                  onClick={() => setShowAddGroup(!showAddGroup)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 rounded-full text-sm font-medium transition-colors"
                  data-testid="button-add-group"
                >
                  <Plus className="w-4 h-4" />
                  New
                </button>
              </div>

              {showAddGroup && (
                <form onSubmit={handleCreateGroup} className="bg-slate-800/50 rounded-xl p-4 mb-4 space-y-3">
                  <input
                    type="text"
                    placeholder="Group name (e.g. Kitchen Team)"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full bg-slate-900 rounded-xl px-4 py-3.5 outline-none focus:ring-2 ring-emerald-500"
                    style={{ fontSize: '16px' }}
                    data-testid="input-group-name"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setShowAddGroup(false); setNewGroupName(""); }}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
                      data-testid="button-cancel-add-group"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={createGroup.isPending || !newGroupName.trim()}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                      data-testid="button-save-group"
                    >
                      {createGroup.isPending ? 'Creating...' : 'Create'}
                    </button>
                  </div>
                </form>
              )}

              {groupsLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-slate-800/40 rounded-lg px-4 py-3 animate-pulse">
                      <div className="h-5 bg-slate-700 rounded w-32 mb-2" />
                      <div className="h-3 bg-slate-700/50 rounded w-20" />
                    </div>
                  ))}
                </div>
              ) : groups.length > 0 ? (
                <div className="space-y-2">
                  {groups.map((g) => (
                    <div 
                      key={g.id} 
                      className="bg-slate-800/40 rounded-lg px-4 py-3"
                      data-testid={`group-${g.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-emerald-400" />
                          <span className="font-medium">{g.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditingGroup(g); setEditGroupName(g.name); }}
                            className="p-1.5 rounded hover:bg-slate-700 transition-colors"
                            data-testid={`button-edit-group-${g.id}`}
                          >
                            <Pencil className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteGroupId(g.id)}
                            className="p-1.5 rounded hover:bg-slate-700 transition-colors"
                            data-testid={`button-delete-group-${g.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 mb-2">
                        {g.memberIds.length} member{g.memberIds.length !== 1 ? 's' : ''}
                      </p>
                      <button
                        onClick={() => setManagingGroup(g)}
                        className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                        data-testid={`button-manage-members-${g.id}`}
                      >
                        Manage members
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 mb-2">No groups yet</p>
                  <p className="text-sm text-slate-600">Create groups for quick invites</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <h2 className="text-xl font-bold text-center mb-2">Delete Contact?</h2>
            <p className="text-sm text-slate-400 text-center mb-6">
              This contact will be removed. This action cannot be undone.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleConfirmDelete}
                className="w-full bg-red-500 hover:bg-red-400 text-white font-medium py-3.5 rounded-full transition-colors"
                data-testid="button-confirm-delete"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3.5 rounded-full transition-colors"
                data-testid="button-cancel-delete"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteGroupId && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <h2 className="text-xl font-bold text-center mb-2">Delete Group?</h2>
            <p className="text-sm text-slate-400 text-center mb-6">
              This group and its member list will be deleted. This action cannot be undone.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => deleteGroup.mutate(confirmDeleteGroupId)}
                disabled={deleteGroup.isPending}
                className="w-full bg-red-500 hover:bg-red-400 text-white font-medium py-3.5 rounded-full transition-colors disabled:opacity-50"
                data-testid="button-confirm-delete-group"
              >
                {deleteGroup.isPending ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={() => setConfirmDeleteGroupId(null)}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3.5 rounded-full transition-colors"
                data-testid="button-cancel-delete-group"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {editingGroup && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <h2 className="text-xl font-bold text-center mb-4">Edit Group</h2>
            <form onSubmit={handleUpdateGroup} className="space-y-4">
              <input
                type="text"
                placeholder="Group name"
                value={editGroupName}
                onChange={(e) => setEditGroupName(e.target.value)}
                className="w-full bg-slate-800 rounded-xl px-4 py-3.5 outline-none focus:ring-2 ring-emerald-500"
                style={{ fontSize: '16px' }}
                data-testid="input-edit-group-name"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingGroup(null)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
                  data-testid="button-cancel-edit-group"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateGroup.isPending || !editGroupName.trim()}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-3 rounded-full transition-colors disabled:opacity-50"
                  data-testid="button-update-group"
                >
                  {updateGroup.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {managingGroup && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-sm max-h-[80vh] flex flex-col">
            <h2 className="text-xl font-bold text-center mb-2">{managingGroup.name}</h2>
            <p className="text-sm text-slate-400 text-center mb-4">
              Select participants to add or remove from this group
            </p>
            
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {participants.length === 0 ? (
                <p className="text-center text-slate-500 py-4">No participants available</p>
              ) : (
                participants.map((p) => {
                  const isMember = managingGroup.memberIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (isMember) {
                          removeGroupMember.mutate({ groupId: managingGroup.id, participantId: p.id });
                        } else {
                          addGroupMember.mutate({ groupId: managingGroup.id, participantId: p.id });
                        }
                      }}
                      disabled={addGroupMember.isPending || removeGroupMember.isPending}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                        isMember ? 'bg-emerald-500/20 border border-emerald-500/50' : 'bg-slate-800 hover:bg-slate-700'
                      }`}
                      data-testid={`member-toggle-${p.id}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                        <span className="text-sm font-medium text-slate-300">
                          {p.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-xs text-slate-500">{formatPhone(p.phone)}</p>
                      </div>
                      {isMember && (
                        <Check className="w-5 h-5 text-emerald-400" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
            
            <button
              onClick={() => setManagingGroup(null)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3.5 rounded-full transition-colors"
              data-testid="button-close-manage-members"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
