import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail, Calendar } from "lucide-react";
import { Link } from "wouter";
import { useEffect } from "react";

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
  const authToken = localStorage.getItem('banter_auth_token');

  const { data: betaRequests = [], isLoading, refetch } = useQuery<BetaRequest[]>({
    queryKey: ["/api/beta-requests", authToken],
    queryFn: async () => {
      if (!authToken) return [];
      const res = await fetch("/api/beta-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Invalid auth token");
        }
        throw new Error("Failed to fetch beta requests");
      }
      return res.json();
    },
    enabled: !!authToken,
    retry: false,
  });

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
        <h1 className="text-xl font-bold" data-testid="text-title">Admin</h1>
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
