import { ArrowLeft, Users, Phone, Share, Calendar, LogOut, Shield } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface Contact {
  id: string;
  name: string;
  phone: string;
}

export default function Account() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    queryFn: async () => {
      const authToken = localStorage.getItem('banter_auth_token') || '';
      const res = await fetch("/api/contacts", {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  useEffect(() => {
    const authToken = localStorage.getItem('banter_auth_token');
    if (!authToken) {
      setIsAdmin(false);
      return;
    }
    fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authToken }),
    })
      .then(res => res.json())
      .then(data => setIsAdmin(data.isAdmin === true))
      .catch(() => setIsAdmin(false));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('banter_verified_phone');
    localStorage.removeItem('banter_verified_email');
    localStorage.removeItem('banter_auth_token');
    toast({ title: "Signed out" });
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col safe-top safe-bottom">
      <div className="flex-1 flex flex-col items-center px-6 py-8">
        <div className="w-full max-w-xs">
          <Link href="/login" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8" data-testid="link-back">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back</span>
          </Link>

          <h1 className="text-2xl font-bold mb-8 text-center" data-testid="text-title">Account</h1>

          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-4 px-6 rounded-full transition-colors mb-3"
            data-testid="button-join"
          >
            <Phone className="w-5 h-5" />
            Banter
          </Link>

          <button
            onClick={async () => {
              const shareUrl = `${window.location.origin}/login`;
              if (navigator.share) {
                try {
                  await navigator.share({
                    title: 'Join the Banter',
                    text: 'Join our voice conference!',
                    url: shareUrl
                  });
                } catch (e) {
                  await navigator.clipboard.writeText(shareUrl);
                }
              } else {
                await navigator.clipboard.writeText(shareUrl);
                alert('Link copied to clipboard!');
              }
            }}
            className="flex items-center w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-4 px-6 rounded-full transition-colors mb-6"
            data-testid="button-share"
          >
            <Share className="w-5 h-5 text-emerald-400" />
            <span className="ml-3">Share</span>
            <span className="ml-auto text-slate-400 text-xs truncate max-w-32">{window.location.host}/login</span>
          </button>

          <div className="flex flex-col gap-3">
            <Link
              href="/contacts"
              className="flex items-center w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-4 px-6 rounded-full transition-colors"
              data-testid="button-contacts"
            >
              <Users className="w-5 h-5 text-emerald-400" />
              <span className="ml-3">Contacts</span>
              <span className="ml-auto text-slate-400">{contacts.length}</span>
            </Link>
            <Link
              href="/schedule"
              className="flex items-center w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-4 px-6 rounded-full transition-colors"
              data-testid="button-schedule"
            >
              <Calendar className="w-5 h-5 text-emerald-400" />
              <span className="ml-3">Scheduled Banters</span>
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                className="flex items-center w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-4 px-6 rounded-full transition-colors"
                data-testid="button-admin"
              >
                <Shield className="w-5 h-5 text-emerald-400" />
                <span className="ml-3">Admin</span>
              </Link>
            )}
          </div>

          <div className="mt-8">
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-red-400 font-medium py-4 px-6 rounded-full transition-colors"
              data-testid="button-logout"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
