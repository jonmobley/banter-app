import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-white safe-top safe-bottom" data-testid="page-not-found">
      <div className="w-full max-w-md mx-4 text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2" data-testid="text-title">Page Not Found</h1>
        <p className="text-slate-400 mb-6" data-testid="text-description">
          Sorry, the page you're looking for doesn't exist.
        </p>
        <Link
          href="/login"
          className="inline-block text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
          data-testid="link-go-home"
        >
          ← Go Home
        </Link>
      </div>
    </div>
  );
}
