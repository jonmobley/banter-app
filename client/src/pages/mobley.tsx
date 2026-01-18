import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone, Ban, Users, Lock, Unlock, Volume2, VolumeX } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

interface Participant {
  callSid: string;
  phone: string;
  name: string | null;
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

export default function Mobley() {
  const queryClient = useQueryClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [pinDigits, setPinDigits] = useState(["", "", "", ""]);

  const { data: participantsData } = useQuery<ParticipantsData>({
    queryKey: ["/api/participants"],
    queryFn: async () => {
      const res = await fetch("/api/participants");
      if (!res.ok) throw new Error("Failed to fetch participants");
      return res.json();
    },
    refetchInterval: 2000,
  });

  const verifyPin = useMutation({
    mutationFn: async (pin: string) => {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) throw new Error("Invalid PIN");
      return res.json();
    },
    onSuccess: () => {
      setIsAdmin(true);
      setShowPinModal(false);
      setPinError(false);
      setPinDigits(["", "", "", ""]);
    },
    onError: () => {
      setPinError(true);
      setPinDigits(["", "", "", ""]);
    },
  });

  const toggleMute = useMutation({
    mutationFn: async ({ callSid, muted }: { callSid: string; muted: boolean }) => {
      const res = await fetch("/api/admin/mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: adminPin, callSid, muted }),
      });
      if (!res.ok) throw new Error("Failed to mute");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/participants"] });
    },
  });

  const handlePinDigit = (index: number, value: string) => {
    if (value.length > 1) return;
    const newDigits = [...pinDigits];
    newDigits[index] = value;
    setPinDigits(newDigits);
    setPinError(false);

    if (value && index < 3) {
      const nextInput = document.getElementById(`pin-${index + 1}`);
      nextInput?.focus();
    }

    if (newDigits.every(d => d !== "")) {
      const pin = newDigits.join("");
      setAdminPin(pin);
      verifyPin.mutate(pin);
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pinDigits[index] && index > 0) {
      const prevInput = document.getElementById(`pin-${index - 1}`);
      prevInput?.focus();
    }
  };

  const sampleParticipants: Participant[] = [
    { callSid: "sample-1", phone: "+12025551234", name: "Mom", muted: false, hold: false },
    { callSid: "sample-2", phone: "+13105559876", name: "Jake", muted: true, hold: false },
    { callSid: "sample-3", phone: "+14155550000", name: null, muted: false, hold: false },
  ];

  const realParticipants = participantsData?.participants || [];
  const realCount = participantsData?.count || 0;
  
  const isPreviewMode = realCount === 0;
  const participants = isPreviewMode ? sampleParticipants : realParticipants;
  const participantCount = isPreviewMode ? sampleParticipants.length : realCount;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col relative">
      <button
        onClick={() => {
          if (isAdmin) {
            setIsAdmin(false);
            setAdminPin("");
          } else {
            setShowPinModal(true);
          }
        }}
        className="absolute top-4 right-4 p-3 rounded-full bg-slate-800/50 hover:bg-slate-700 transition-colors"
        data-testid="button-admin"
      >
        {isAdmin ? (
          <Unlock className="w-5 h-5 text-emerald-400" />
        ) : (
          <Lock className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {showPinModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6">
          <div className="bg-slate-900 rounded-2xl p-6 w-full max-w-xs">
            <h2 className="text-xl font-bold text-center mb-2">Admin Access</h2>
            <p className="text-sm text-slate-400 text-center mb-6">Enter 4-digit PIN</p>
            
            <div className="flex justify-center gap-3 mb-6">
              {pinDigits.map((digit, i) => (
                <input
                  key={i}
                  id={`pin-${i}`}
                  type="tel"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handlePinDigit(i, e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => handlePinKeyDown(i, e)}
                  className={`w-14 h-14 text-center text-2xl font-bold rounded-lg bg-slate-800 border-2 outline-none transition-colors ${
                    pinError ? 'border-red-500' : 'border-slate-700 focus:border-emerald-500'
                  }`}
                  data-testid={`input-pin-${i}`}
                />
              ))}
            </div>
            
            {pinError && (
              <p className="text-red-400 text-sm text-center mb-4">Invalid PIN. Try again.</p>
            )}
            
            <button
              onClick={() => {
                setShowPinModal(false);
                setPinDigits(["", "", "", ""]);
                setPinError(false);
              }}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-8">
          <Phone className="w-10 h-10 text-emerald-400" />
        </div>
        
        <h1 className="text-5xl font-bold mb-3 text-center" data-testid="text-title">Banter</h1>
        <p className="text-xl text-slate-400 text-center mb-8 max-w-sm">
          Instant group call, anytime.
        </p>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <a
            href="tel:+12202423245"
            className="flex items-center justify-center gap-2 w-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-4 px-6 rounded-full transition-colors"
            data-testid="button-join"
          >
            <Phone className="w-5 h-5" />
            Banter
          </a>
          
          {isAdmin && (
            <Link
              href="/account"
              className="flex items-center justify-center w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 px-6 rounded-full transition-colors"
              data-testid="button-account"
            >
              Manage Account
            </Link>
          )}
        </div>

        <div className="mt-16 grid grid-cols-3 gap-8 text-center max-w-sm">
          <div className="flex flex-col items-center">
            <Ban className="w-6 h-6 text-emerald-400 mb-1" />
            <p className="text-xs text-slate-400 uppercase tracking-wide">PIN</p>
          </div>
          <div className="flex flex-col items-center">
            <Ban className="w-6 h-6 text-emerald-400 mb-1" />
            <p className="text-xs text-slate-400 uppercase tracking-wide">APP</p>
          </div>
          <div className="flex flex-col items-center">
            <Ban className="w-6 h-6 text-emerald-400 mb-1" />
            <p className="text-xs text-slate-400 uppercase tracking-wide">WAITING</p>
          </div>
        </div>

        {participantCount > 0 && (
          <div className="w-full max-w-xs mt-8">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-slate-300" data-testid="text-participant-count">
                {participantCount === 1 
                  ? '1 person on the call'
                  : `${participantCount} people on the call`
                }
              </span>
              {isPreviewMode && (
                <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
                  Preview
                </span>
              )}
            </div>

            <div className="space-y-2">
              {participants.map((p, i) => (
                <div 
                  key={p.callSid} 
                  className="flex items-center gap-3 bg-slate-800/50 rounded-lg px-4 py-3"
                  data-testid={`participant-${i}`}
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <span className="text-base font-medium text-emerald-400">
                      {p.name ? p.name.charAt(0).toUpperCase() : '?'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {p.name || formatPhone(p.phone)}
                    </p>
                    {p.name && (
                      <p className="text-xs text-slate-500 truncate">{formatPhone(p.phone)}</p>
                    )}
                  </div>
                  {isAdmin ? (
                    <button
                      onClick={() => toggleMute.mutate({ callSid: p.callSid, muted: !p.muted })}
                      className={`p-2 rounded-lg transition-colors ${
                        p.muted 
                          ? 'bg-red-500/20 hover:bg-red-500/30' 
                          : 'bg-emerald-500/20 hover:bg-emerald-500/30'
                      }`}
                      data-testid={`button-mute-${i}`}
                    >
                      {p.muted ? (
                        <VolumeX className="w-5 h-5 text-red-400" />
                      ) : (
                        <Volume2 className="w-5 h-5 text-emerald-400" />
                      )}
                    </button>
                  ) : (
                    <div className={`w-2 h-2 rounded-full ${p.muted ? 'bg-slate-500' : 'bg-emerald-400 animate-pulse'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
