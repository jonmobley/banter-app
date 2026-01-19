import { Phone } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-8">
          <Phone className="w-10 h-10 text-emerald-400" />
        </div>
        
        <h1 className="text-5xl font-bold mb-3 text-center" data-testid="text-title">Banter</h1>
        <p className="text-xl text-slate-400 text-center mb-8 max-w-sm">
          Instant group call, anytime.
        </p>

        <div className="flex flex-col gap-2 w-full max-w-xs mb-8">
          <div
            className="flex items-center justify-center gap-2 w-full bg-emerald-500/50 text-white/70 font-semibold py-4 px-6 rounded-full cursor-not-allowed"
            data-testid="button-coming-soon"
          >
            <Phone className="w-5 h-5" />
            Banter
          </div>
          <p className="text-center text-sm text-slate-500">Coming Soon</p>
        </div>

      </div>
    </div>
  );
}
