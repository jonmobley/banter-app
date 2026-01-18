import { useQuery } from "@tanstack/react-query";
import { Radio } from "lucide-react";

export default function Home() {
  const { data: health } = useQuery({
    queryKey: ["/api/health"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error("Health check failed");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const isOnline = health?.status === "ok";

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6">
          <Radio className="w-8 h-8 text-emerald-400" />
        </div>
        
        <h1 className="text-4xl font-bold mb-2" data-testid="text-title">Banter</h1>
        <p className="text-slate-400 text-center mb-8">Call to talk</p>

        <div className="flex items-center gap-2 mb-12">
          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="text-sm text-slate-400" data-testid="text-status">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        <div className="w-full max-w-xs space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm font-medium text-slate-300">1</div>
            <div>
              <p className="font-medium">Call the number</p>
              <p className="text-sm text-slate-500">Dial your Twilio phone</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm font-medium text-slate-300">2</div>
            <div>
              <p className="font-medium">Auto-connect</p>
              <p className="text-sm text-slate-500">Join instantly, no codes</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm font-medium text-slate-300">3</div>
            <div>
              <p className="font-medium">Talk</p>
              <p className="text-sm text-slate-500">Everyone on the call hears you</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
