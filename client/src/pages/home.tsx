import { useQuery } from "@tanstack/react-query";
import { Radio, Phone } from "lucide-react";

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
        <p className="text-slate-400 text-center mb-6">Call to talk</p>

        <a
          href="tel:+12202423245"
          className="flex items-center justify-center gap-3 w-full max-w-xs bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-4 px-6 rounded-full mb-8 transition-colors"
          data-testid="button-connect"
        >
          <Phone className="w-5 h-5" />
          Connect
        </a>

        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="text-sm text-slate-400" data-testid="text-status">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
    </div>
  );
}
