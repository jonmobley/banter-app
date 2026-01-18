import { ArrowLeft, Users, Phone, Share } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface Contact {
  id: string;
  name: string;
  phone: string;
}

export default function Account() {
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    queryFn: async () => {
      const res = await fetch("/api/contacts");
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json();
    },
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="flex-1 flex flex-col items-center px-6 py-8">
        <div className="w-full max-w-xs">
          <Link href="/mobley" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back</span>
          </Link>

          <h1 className="text-2xl font-bold mb-8 text-center" data-testid="text-title">Account</h1>

          <a
            href="tel:+12202423245"
            className="flex items-center justify-center gap-2 w-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-4 px-6 rounded-full transition-colors mb-3"
            data-testid="button-join"
          >
            <Phone className="w-5 h-5" />
            Banter
          </a>

          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: 'Join the Banter',
                  text: 'Call (220) 242-3245 to join the group call!',
                  url: 'tel:+12202423245'
                });
              }
            }}
            className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-4 px-6 rounded-full transition-colors mb-6"
            data-testid="button-share"
          >
            <Share className="w-5 h-5" />
            Share Number
          </button>

          <div className="flex flex-col gap-3">
            <Link
              href="/contacts"
              className="flex items-center w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-4 px-5 rounded-xl transition-colors"
              data-testid="button-contacts"
            >
              <Users className="w-5 h-5 text-emerald-400" />
              <span className="ml-3">Contacts</span>
              <span className="ml-auto text-slate-400">{contacts.length}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
