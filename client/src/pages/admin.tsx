import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Mail, Calendar, LogOut, Users, Plus, Trash2, Phone, X, FolderOpen, ChevronDown, ChevronRight, UserPlus, Pencil, Check } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface BetaRequest {
  id: string;
  email: string;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
}

interface GroupWithMembers {
  id: string;
  name: string;
  createdAt: string;
  memberIds: string[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

export default function Admin() {
  const authToken = localStorage.getItem('banter_auth_token');
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');

  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');

  const { data: betaRequests = [], isLoading: loadingBeta } = useQuery<BetaRequest[]>({
    queryKey: ["/api/beta-requests", authToken],
    queryFn: async () => {
      if (!authToken) return [];
      const res = await fetch("/api/beta-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken }),
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Invalid auth token");
        throw new Error("Failed to fetch beta requests");
      }
      return res.json();
    },
    enabled: !!authToken,
    retry: false,
  });

  const { data: usersList = [], isLoading: loadingUsers } = useQuery<User[]>({
    queryKey: ["/api/users", authToken],
    queryFn: async () => {
      if (!authToken) return [];
      const res = await fetch("/api/users", {
        headers: { "Authorization": `Bearer ${authToken}` },
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Unauthorized");
        throw new Error("Failed to fetch users");
      }
      return res.json();
    },
    enabled: !!authToken,
    retry: false,
  });

  const addUserMutation = useMutation({
    mutationFn: async (data: { name: string; phone?: string; email?: string }) => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, ...data }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowAddUser(false);
      setNewUserName('');
      setNewUserPhone('');
      setNewUserEmail('');
      toast({ title: "User added" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error("Failed to delete user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove user", variant: "destructive" });
    },
  });

  const { data: groupsList = [], isLoading: loadingGroups } = useQuery<GroupWithMembers[]>({
    queryKey: ["/api/groups", authToken],
    queryFn: async () => {
      if (!authToken) return [];
      const res = await fetch("/api/groups", {
        headers: { "Authorization": `Bearer ${authToken}` },
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Unauthorized");
        throw new Error("Failed to fetch groups");
      }
      return res.json();
    },
    enabled: !!authToken,
    retry: false,
  });

  const createGroupMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, name }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create group");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setShowAddGroup(false);
      setNewGroupName('');
      toast({ title: "Group created" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const renameGroupMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch(`/api/groups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, name }),
      });
      if (!res.ok) throw new Error("Failed to rename group");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setEditingGroupId(null);
      toast({ title: "Group renamed" });
    },
    onError: () => {
      toast({ title: "Failed to rename group", variant: "destructive" });
    },
  });

  const deleteGroupMutation = useMutation({
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
      toast({ title: "Group deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete group", variant: "destructive" });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ groupId, participantId }: { groupId: string; participantId: string }) => {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, participantId }),
      });
      if (!res.ok) throw new Error("Failed to add member");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
    },
    onError: () => {
      toast({ title: "Failed to add member", variant: "destructive" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ groupId, participantId }: { groupId: string; participantId: string }) => {
      const res = await fetch(`/api/groups/${groupId}/members/${participantId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken }),
      });
      if (!res.ok) throw new Error("Failed to remove member");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
    },
    onError: () => {
      toast({ title: "Failed to remove member", variant: "destructive" });
    },
  });

  const getUserName = (userId: string): string => {
    const user = usersList.find(u => u.id === userId);
    return user?.name || userId;
  };

  const handleLogout = () => {
    localStorage.removeItem('banter_verified_phone');
    localStorage.removeItem('banter_verified_email');
    localStorage.removeItem('banter_auth_token');
    toast({ title: "Signed out" });
    navigate("/login");
  };

  const handleAddUser = () => {
    if (!newUserName.trim()) return;
    if (!newUserPhone.trim() && !newUserEmail.trim()) {
      toast({ title: "Phone or email is required", variant: "destructive" });
      return;
    }
    const data: { name: string; phone?: string; email?: string } = { name: newUserName.trim() };
    if (newUserPhone.trim()) data.phone = newUserPhone.trim();
    if (newUserEmail.trim()) data.email = newUserEmail.trim();
    addUserMutation.mutate(data);
  };

  if (!authToken) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col safe-top safe-bottom">
        <header className="flex items-center gap-4 px-4 py-4 border-b border-slate-800">
          <Link 
            href="/login"
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold" data-testid="text-title">Admin</h1>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="text-center">
            <p className="text-slate-300 mb-4">Please sign in on the main page first</p>
            <Link 
              href="/login"
              className="text-emerald-500 hover:text-emerald-400 transition-colors"
              data-testid="link-signin"
            >
              Go to main page
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col safe-top safe-bottom">
      <header className="flex items-center gap-4 px-4 py-4 border-b border-slate-800">
        <Link 
          href="/login"
          className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold flex-1" data-testid="text-title">Admin</h1>
        <button
          onClick={handleLogout}
          className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-red-400"
          data-testid="button-logout"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 overflow-auto px-4 py-6 space-y-8">
        {/* Users Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide flex items-center gap-2">
              <Users className="w-4 h-4" />
              Users ({usersList.length})
            </h2>
            <button
              onClick={() => setShowAddUser(true)}
              className="flex items-center gap-1 text-emerald-500 hover:text-emerald-400 text-sm font-medium transition-colors"
              data-testid="button-add-user"
            >
              <Plus className="w-4 h-4" />
              Add User
            </button>
          </div>

          {showAddUser && (
            <div className="bg-slate-800/50 rounded-xl p-4 mb-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">New User</span>
                <button
                  onClick={() => { setShowAddUser(false); setNewUserName(''); setNewUserPhone(''); setNewUserEmail(''); }}
                  className="p-1 hover:bg-slate-700 rounded transition-colors"
                  data-testid="button-cancel-add-user"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <input
                type="text"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Name"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                data-testid="input-new-user-name"
              />
              <input
                type="tel"
                value={newUserPhone}
                onChange={(e) => setNewUserPhone(e.target.value)}
                placeholder="Phone (optional)"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                data-testid="input-new-user-phone"
              />
              <input
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="Email (optional)"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                data-testid="input-new-user-email"
              />
              <button
                onClick={handleAddUser}
                disabled={!newUserName.trim() || (!newUserPhone.trim() && !newUserEmail.trim()) || addUserMutation.isPending}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition-colors text-sm"
                data-testid="button-submit-add-user"
              >
                {addUserMutation.isPending ? 'Adding...' : 'Add User'}
              </button>
            </div>
          )}

          {loadingUsers ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-slate-800/50 rounded-xl p-4 animate-pulse">
                  <div className="h-4 bg-slate-700 rounded w-48" />
                </div>
              ))}
            </div>
          ) : usersList.length === 0 ? (
            <div className="bg-slate-800/30 rounded-xl p-6 text-center">
              <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No users yet</p>
              <p className="text-slate-500 text-sm mt-1">Users are created when people sign in or when you add them</p>
            </div>
          ) : (
            <div className="space-y-2">
              {usersList.map((user) => (
                <div 
                  key={user.id}
                  className="bg-slate-800/50 rounded-xl p-4 flex items-center justify-between"
                  data-testid={`user-item-${user.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{user.name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                      {user.phone && (
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {formatPhone(user.phone)}
                        </p>
                      )}
                      {user.email && (
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {user.email}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${user.name}?`)) {
                        deleteUserMutation.mutate(user.id);
                      }
                    }}
                    className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-red-400 ml-2 flex-shrink-0"
                    data-testid={`button-delete-user-${user.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Groups Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide flex items-center gap-2">
              <FolderOpen className="w-4 h-4" />
              Groups ({groupsList.length})
            </h2>
            <button
              onClick={() => setShowAddGroup(true)}
              className="flex items-center gap-1 text-emerald-500 hover:text-emerald-400 text-sm font-medium transition-colors"
              data-testid="button-add-group"
            >
              <Plus className="w-4 h-4" />
              Add Group
            </button>
          </div>

          {showAddGroup && (
            <div className="bg-slate-800/50 rounded-xl p-4 mb-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">New Group</span>
                <button
                  onClick={() => { setShowAddGroup(false); setNewGroupName(''); }}
                  className="p-1 hover:bg-slate-700 rounded transition-colors"
                  data-testid="button-cancel-add-group"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                data-testid="input-new-group-name"
                onKeyDown={(e) => { if (e.key === 'Enter' && newGroupName.trim()) createGroupMutation.mutate(newGroupName.trim()); }}
              />
              <button
                onClick={() => createGroupMutation.mutate(newGroupName.trim())}
                disabled={!newGroupName.trim() || createGroupMutation.isPending}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition-colors text-sm"
                data-testid="button-submit-add-group"
              >
                {createGroupMutation.isPending ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          )}

          {loadingGroups ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-slate-800/50 rounded-xl p-4 animate-pulse">
                  <div className="h-4 bg-slate-700 rounded w-48" />
                </div>
              ))}
            </div>
          ) : groupsList.length === 0 ? (
            <div className="bg-slate-800/30 rounded-xl p-6 text-center">
              <FolderOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No groups yet</p>
              <p className="text-slate-500 text-sm mt-1">Groups let you organize users into teams</p>
            </div>
          ) : (
            <div className="space-y-2">
              {groupsList.map((group) => {
                const isExpanded = expandedGroup === group.id;
                const isEditing = editingGroupId === group.id;
                const nonMembers = usersList.filter(u => !group.memberIds.includes(u.id));
                return (
                  <div
                    key={group.id}
                    className="bg-slate-800/50 rounded-xl overflow-hidden"
                    data-testid={`group-item-${group.id}`}
                  >
                    <div className="p-4 flex items-center gap-3">
                      <button
                        onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                        className="text-slate-400 hover:text-white transition-colors"
                        data-testid={`button-expand-group-${group.id}`}
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingGroupName}
                              onChange={(e) => setEditingGroupName(e.target.value)}
                              className="flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                              data-testid={`input-rename-group-${group.id}`}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && editingGroupName.trim()) renameGroupMutation.mutate({ id: group.id, name: editingGroupName.trim() });
                                if (e.key === 'Escape') setEditingGroupId(null);
                              }}
                            />
                            <button
                              onClick={() => { if (editingGroupName.trim()) renameGroupMutation.mutate({ id: group.id, name: editingGroupName.trim() }); }}
                              className="p-1 hover:bg-slate-700 rounded transition-colors text-emerald-400"
                              data-testid={`button-save-rename-${group.id}`}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{group.name}</p>
                            <span className="text-xs text-slate-500">{group.memberIds.length} {group.memberIds.length === 1 ? 'member' : 'members'}</span>
                          </div>
                        )}
                      </div>
                      {!isEditing && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => { setEditingGroupId(group.id); setEditingGroupName(group.name); }}
                            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
                            data-testid={`button-rename-group-${group.id}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { if (confirm(`Delete "${group.name}" and all its members?`)) deleteGroupMutation.mutate(group.id); }}
                            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-red-400"
                            data-testid={`button-delete-group-${group.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-700/50 px-4 py-3 space-y-2">
                        {group.memberIds.length > 0 && (
                          <div className="space-y-1">
                            {group.memberIds.map((memberId) => (
                              <div
                                key={memberId}
                                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-700/30"
                                data-testid={`group-member-${group.id}-${memberId}`}
                              >
                                <span className="text-sm text-slate-300">{getUserName(memberId)}</span>
                                <button
                                  onClick={() => removeMemberMutation.mutate({ groupId: group.id, participantId: memberId })}
                                  className="p-1 hover:bg-slate-600 rounded transition-colors text-slate-500 hover:text-red-400"
                                  data-testid={`button-remove-member-${group.id}-${memberId}`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {nonMembers.length > 0 ? (
                          <div className="pt-2 border-t border-slate-700/30">
                            <p className="text-xs text-slate-500 mb-2">Add members</p>
                            <div className="flex flex-wrap gap-1.5">
                              {nonMembers.map((user) => (
                                <button
                                  key={user.id}
                                  onClick={() => addMemberMutation.mutate({ groupId: group.id, participantId: user.id })}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-700/50 hover:bg-emerald-500/20 text-xs text-slate-300 hover:text-emerald-400 transition-colors"
                                  data-testid={`button-add-member-${group.id}-${user.id}`}
                                >
                                  <UserPlus className="w-3 h-3" />
                                  {user.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : group.memberIds.length === 0 ? (
                          <p className="text-xs text-slate-500 text-center py-2">No users available to add. Create users first.</p>
                        ) : (
                          <p className="text-xs text-slate-500 text-center py-1">All users are in this group</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Beta Requests Section */}
        <div>
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Beta Access Requests ({betaRequests.length})
          </h2>
          
          {loadingBeta ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-slate-800/50 rounded-xl p-4 animate-pulse">
                  <div className="h-4 bg-slate-700 rounded w-48" />
                </div>
              ))}
            </div>
          ) : betaRequests.length === 0 ? (
            <div className="bg-slate-800/30 rounded-xl p-6 text-center">
              <Mail className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No beta requests yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {betaRequests.map((request) => (
                <div 
                  key={request.id}
                  className="bg-slate-800/50 rounded-xl p-4 flex items-center justify-between"
                  data-testid={`beta-request-${request.id}`}
                >
                  <div>
                    <p className="font-medium">{request.email}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(request.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
