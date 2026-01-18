import { ArrowLeft, Users } from "lucide-react";
import { Link } from "wouter";

export default function Account() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="flex-1 flex flex-col items-center px-6 py-8">
        <div className="w-full max-w-xs">
          <Link href="/mobley" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back</span>
          </Link>

          <h1 className="text-2xl font-bold mb-8 text-center" data-testid="text-title">Account</h1>

          <div className="flex flex-col gap-3">
            <Link
              href="/contacts"
              className="flex items-center gap-3 w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-4 px-5 rounded-xl transition-colors"
              data-testid="button-contacts"
            >
              <Users className="w-5 h-5 text-emerald-400" />
              <span>Contacts</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
