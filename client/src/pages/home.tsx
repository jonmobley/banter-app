import { useQuery } from "@tanstack/react-query";
import { Phone, Radio, Users, CheckCircle2, XCircle } from "lucide-react";

export default function Home() {
  const { data: health, isLoading } = useQuery({
    queryKey: ["/api/health"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error("Health check failed");
      return res.json();
    },
    refetchInterval: 30000,
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 mb-6">
            <Radio className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Phone Walkie-Talkie
          </h1>
          <p className="text-xl text-slate-400">
            Instant audio conference via phone call
          </p>
        </div>

        <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center gap-2">
              {isLoading ? (
                <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />
              ) : health?.status === "ok" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" data-testid="status-online" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400" data-testid="status-offline" />
              )}
              <span className="text-sm font-medium text-slate-300">
                {isLoading ? "Checking..." : health?.status === "ok" ? "Online" : "Offline"}
              </span>
            </div>
          </div>

          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Phone className="w-6 h-6 text-cyan-400" />
            How It Works
          </h2>
          
          <div className="space-y-4 text-slate-300">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
                1
              </div>
              <div>
                <h3 className="font-semibold text-white mb-1">Call the number</h3>
                <p className="text-sm text-slate-400">
                  Dial the configured Twilio phone number from any phone
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
                2
              </div>
              <div>
                <h3 className="font-semibold text-white mb-1">Auto-join conference</h3>
                <p className="text-sm text-slate-400">
                  You're instantly connected to the "team-main" conference room
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
                3
              </div>
              <div>
                <h3 className="font-semibold text-white mb-1">Start talking</h3>
                <p className="text-sm text-slate-400">
                  Communicate with anyone else in the conference in real-time
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 mb-8">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-400" />
            Features
          </h2>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
              <div>
                <h3 className="font-semibold text-white">No PINs</h3>
                <p className="text-sm text-slate-400">Instant access, no codes required</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
              <div>
                <h3 className="font-semibold text-white">No Beeps</h3>
                <p className="text-sm text-slate-400">Silent entry/exit for seamless conversation</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
              <div>
                <h3 className="font-semibold text-white">Always On</h3>
                <p className="text-sm text-slate-400">Conference stays active even when empty</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
              <div>
                <h3 className="font-semibold text-white">Phone Network</h3>
                <p className="text-sm text-slate-400">Works on any phone, no app needed</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-amber-300 mb-2">Setup Required</h3>
          <p className="text-sm text-slate-300">
            To activate this service, configure your Twilio phone number webhook to point to:
          </p>
          <code className="block mt-3 p-3 bg-slate-900/50 rounded-lg text-sm text-cyan-300 font-mono break-all">
            {window.location.origin}/voice/incoming
          </code>
          <p className="text-xs text-slate-400 mt-3">
            Visit Twilio Console → Phone Numbers → Configure Voice webhook → Set POST endpoint
          </p>
        </div>
      </div>
    </div>
  );
}
