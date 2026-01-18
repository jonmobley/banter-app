import { Radio, Phone } from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-8">
          <Radio className="w-10 h-10 text-emerald-400" />
        </div>
        
        <h1 className="text-5xl font-bold mb-3 text-center" data-testid="text-title">Banter</h1>
        <p className="text-xl text-slate-400 text-center mb-8 max-w-sm">
          Instant walkie-talkie for your team. Just call and talk.
        </p>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <Link
            href="/mobley"
            className="flex items-center justify-center gap-2 w-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-4 px-6 rounded-full transition-colors"
            data-testid="button-join"
          >
            <Phone className="w-5 h-5" />
            Join the Call
          </Link>
          
          <Link
            href="/account"
            className="flex items-center justify-center w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 px-6 rounded-full transition-colors"
            data-testid="button-account"
          >
            Manage Account
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-3 gap-8 text-center max-w-sm">
          <div>
            <p className="text-2xl font-bold text-emerald-400">No</p>
            <p className="text-xs text-slate-500">PINs</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-400">No</p>
            <p className="text-xs text-slate-500">Apps</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-400">No</p>
            <p className="text-xs text-slate-500">Waiting</p>
          </div>
        </div>
      </div>
    </div>
  );
}
