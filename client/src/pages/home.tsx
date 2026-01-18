import { useQuery } from "@tanstack/react-query";
import { Radio, Phone, Users } from "lucide-react";

interface Participant {
  callSid: string;
  phone: string;
  muted: boolean;
  hold: boolean;
}

interface ParticipantsData {
  count: number;
  participants: Participant[];
  conferenceActive: boolean;
}

function formatPhone(phone: string): string {
  if (!phone || phone === 'Unknown') return 'Unknown';
  // Format as (XXX) XXX-XXXX if it's a US number
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    const number = cleaned.slice(1);
    return `(${number.slice(0, 3)}) ${number.slice(3, 6)}-${number.slice(6)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

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

  const { data: participantsData } = useQuery<ParticipantsData>({
    queryKey: ["/api/participants"],
    queryFn: async () => {
      const res = await fetch("/api/participants");
      if (!res.ok) throw new Error("Failed to fetch participants");
      return res.json();
    },
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const isOnline = health?.status === "ok";
  const participantCount = participantsData?.count || 0;
  const participants = participantsData?.participants || [];

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

        <div className="flex items-center gap-2 mb-8">
          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="text-sm text-slate-400" data-testid="text-status">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* Participants Section */}
        <div className="w-full max-w-xs">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-400" data-testid="text-participant-count">
              {participantCount === 0 
                ? 'No one on the call' 
                : participantCount === 1 
                  ? '1 person on the call'
                  : `${participantCount} people on the call`
              }
            </span>
          </div>

          {participants.length > 0 && (
            <div className="space-y-2">
              {participants.map((p, i) => (
                <div 
                  key={p.callSid} 
                  className="flex items-center gap-3 bg-slate-800/50 rounded-lg px-4 py-3"
                  data-testid={`participant-${i}`}
                >
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                    <Phone className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{formatPhone(p.phone)}</p>
                    <p className="text-xs text-slate-500">
                      {p.muted ? 'Muted' : 'Speaking'}
                    </p>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${p.muted ? 'bg-slate-500' : 'bg-emerald-400'}`} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
