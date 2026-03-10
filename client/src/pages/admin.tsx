import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Mail, Calendar, LogOut, Users, Plus, Trash2, Phone, X } from "lucide-react";
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

  const handleLogout = () => {
    localStorage.removeItem('banter_verified_phone');
    localStorage.removeItem('banter_verified_email');
    localStorage.removeItem('banter_auth_token');
    toast({ title: "Signed out" });
    navigate("/mobley");
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
      <div className="min-h-screen bg-slate-950 text-white flex flex-col">
        <header className="flex items-center gap-4 px-4 py-4 border-b border-slate-800">
          <Link 
            href="/mobley"
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
              href="/mobley"
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
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="flex items-center gap-4 px-4 py-4 border-b border-slate-800">
        <Link 
          href="/mobley"
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
