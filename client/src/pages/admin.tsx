import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail, Calendar, Shield } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect } from "react";

interface BetaRequest {
  id: string;
  email: string;
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

export default function Admin() {
  const [adminPin, setAdminPin] = useState(() => localStorage.getItem('banter_admin_pin') || '');
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: betaRequests = [], isLoading, refetch } = useQuery<BetaRequest[]>({
    queryKey: ["/api/beta-requests", adminPin],
    queryFn: async () => {
      if (!adminPin) return [];
      const res = await fetch("/api/beta-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: adminPin }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('banter_admin_pin');
          setAdminPin('');
          throw new Error("Invalid admin PIN");
        }
        throw new Error("Failed to fetch beta requests");
      }
      return res.json();
    },
    enabled: !!adminPin,
    retry: false,
  });

  const handlePinSubmit = () => {
    if (pinInput.length === 4) {
      localStorage.setItem('banter_admin_pin', pinInput);
      setAdminPin(pinInput);
      setError(null);
    }
  };

  useEffect(() => {
    if (pinInput.length === 4) {
      handlePinSubmit();
    }
  }, [pinInput]);

  if (!adminPin) {
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
          <Shield className="w-16 h-16 text-slate-600 mb-4" />
          <h2 className="text-lg font-medium mb-6">Enter Admin PIN</h2>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
            placeholder="****"
            className="w-32 text-center text-2xl tracking-widest px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none"
            data-testid="input-admin-pin"
          />
          {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
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
        <h1 className="text-xl font-bold" data-testid="text-title">Admin</h1>
        <div className="flex-1" />
        <button
          onClick={() => {
            localStorage.removeItem('banter_admin_pin');
            setAdminPin('');
            setPinInput('');
          }}
          className="text-sm text-slate-400 hover:text-white transition-colors"
          data-testid="button-logout"
        >
          Sign out
        </button>
      </header>

      <div className="flex-1 overflow-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Beta Access Requests ({betaRequests.length})
          </h2>
          
          {isLoading ? (
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
