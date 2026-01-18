import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone, Ban, Users, User, Plus, Volume2, VolumeX, Settings, MoreVertical } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect, useRef } from "react";

interface Participant {
  callSid: string;
  phone: string;
  name: string | null;
  muted: boolean;
  hold: boolean;
}

interface ExpectedParticipant {
  id: string;
  name: string;
  phone: string;
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

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function Mobley() {
  const queryClient = useQueryClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [pinDigits, setPinDigits] = useState(["", "", "", ""]);
  const [callDuration, setCallDuration] = useState(0);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);

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

  const { data: expectedData } = useQuery<ExpectedParticipant[]>({
    queryKey: ["/api/expected"],
    queryFn: async () => {
      const res = await fetch("/api/expected");
      if (!res.ok) throw new Error("Failed to fetch expected");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const removeExpected = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/expected/${id}`, { 
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: adminPin }),
      });
      if (!res.ok) throw new Error("Failed to remove");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expected"] });
    },
  });

  const remindExpected = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/expected/${id}/remind`, { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: adminPin }),
      });
      if (!res.ok) throw new Error("Failed to remind");
      return res.json();
    },
  });

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdown && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdown]);

  const [showAddExpectedModal, setShowAddExpectedModal] = useState(false);
  const [newExpectedName, setNewExpectedName] = useState("");
  const [newExpectedPhone, setNewExpectedPhone] = useState("");

  const addExpected = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/expected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: adminPin, name: newExpectedName, phone: newExpectedPhone }),
      });
      if (!res.ok) throw new Error("Failed to add");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expected"] });
      setShowAddExpectedModal(false);
      setNewExpectedName("");
      setNewExpectedPhone("");
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

  const sampleExpected: ExpectedParticipant[] = [
    { id: "sample-exp-1", name: "Dad", phone: "+12025559999" },
  ];

  const realParticipants = participantsData?.participants || [];
  const realCount = participantsData?.count || 0;
  const conferenceActive = participantsData?.conferenceActive || false;
  
  const isPreviewMode = realCount === 0;
  const participants = isPreviewMode ? sampleParticipants : realParticipants;
  const participantCount = isPreviewMode ? sampleParticipants.length : realCount;
  const expectedParticipants = isPreviewMode ? sampleExpected : (expectedData || []);
  
  const hasActiveCall = conferenceActive || isPreviewMode;

  useEffect(() => {
    if (hasActiveCall && !callStartTime) {
      setCallStartTime(Date.now());
    } else if (!hasActiveCall) {
      setCallStartTime(null);
      setCallDuration(0);
    }
  }, [hasActiveCall]);

  useEffect(() => {
    if (!callStartTime) return;
    
    const interval = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - callStartTime) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [callStartTime]);

  const pinModal = (
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
  );

  const addExpectedModal = (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6">
      <div className="bg-slate-900 rounded-2xl p-6 w-full max-w-xs">
        <h2 className="text-xl font-bold text-center mb-2">Add Expected</h2>
        <p className="text-sm text-slate-400 text-center mb-6">Who should join the call?</p>
        
        <div className="space-y-4 mb-6">
          <input
            type="text"
            placeholder="Name"
            value={newExpectedName}
            onChange={(e) => setNewExpectedName(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 outline-none transition-colors"
            data-testid="input-expected-name"
          />
          <input
            type="tel"
            placeholder="Phone number"
            value={newExpectedPhone}
            onChange={(e) => setNewExpectedPhone(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 outline-none transition-colors"
            data-testid="input-expected-phone"
          />
        </div>
        
        <div className="space-y-3">
          <button
            onClick={() => addExpected.mutate()}
            disabled={!newExpectedName || !newExpectedPhone}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium py-3 rounded-full transition-colors"
            data-testid="button-add-expected-confirm"
          >
            Add
          </button>
          <button
            onClick={() => {
              setShowAddExpectedModal(false);
              setNewExpectedName("");
              setNewExpectedPhone("");
            }}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
            data-testid="button-add-expected-cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  if (hasActiveCall) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col relative">
        <header className="relative flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-emerald-500/20 rounded-full px-3 py-2">
              <div className="w-6 h-6 rounded-full bg-emerald-400/30 flex items-center justify-center">
                <span className="text-sm font-medium text-emerald-400">
                  {participantCount}
                </span>
              </div>
              <span className="text-lg font-medium text-emerald-400" data-testid="text-duration">
                {formatDuration(callDuration)}
              </span>
            </div>
          </div>
          
          <h1 className="absolute left-1/2 -translate-x-1/2 text-xl font-bold" data-testid="text-title">Banter</h1>
          
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link
                href="/account"
                className="p-3 rounded-full bg-slate-800/50 hover:bg-slate-700 transition-colors"
                data-testid="button-settings"
              >
                <Settings className="w-5 h-5 text-slate-400" />
              </Link>
            )}
            {isAdmin ? (
              <button
                onClick={() => setShowAddExpectedModal(true)}
                className="p-3 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors"
                data-testid="button-add-expected"
              >
                <Plus className="w-5 h-5 text-emerald-400" />
              </button>
            ) : (
              <button
                onClick={() => setShowPinModal(true)}
                className="p-3 rounded-full bg-slate-800/50 hover:bg-slate-700 transition-colors"
                data-testid="button-admin"
              >
                <User className="w-5 h-5 text-slate-400" />
              </button>
            )}
          </div>
        </header>

        {isPreviewMode && (
          <div className="flex justify-center py-2">
            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
              Preview
            </span>
          </div>
        )}

        <div className="flex-1 overflow-auto px-6 pb-48">
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
                <button
                  onClick={() => isAdmin && toggleMute.mutate({ callSid: p.callSid, muted: !p.muted })}
                  className={`p-2 rounded-lg transition-colors ${
                    p.muted 
                      ? 'bg-red-500/20 hover:bg-red-500/30' 
                      : 'bg-emerald-500/20 hover:bg-emerald-500/30'
                  } ${!isAdmin ? 'cursor-default' : ''}`}
                  data-testid={`button-mute-${i}`}
                >
                  {p.muted ? (
                    <VolumeX className="w-5 h-5 text-red-400" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-emerald-400" />
                  )}
                </button>
              </div>
            ))}
            
            {expectedParticipants
              .filter(ep => {
                const normalizedExpected = ep.phone.replace(/\D/g, '');
                return !participants.some(p => {
                  const normalizedActive = p.phone.replace(/\D/g, '');
                  return normalizedActive === normalizedExpected || 
                         normalizedActive.endsWith(normalizedExpected) ||
                         normalizedExpected.endsWith(normalizedActive);
                });
              })
              .map((ep, i) => (
                <div 
                  key={ep.id} 
                  className="flex items-center gap-3 bg-slate-700/30 rounded-lg px-4 py-3"
                  data-testid={`expected-${i}`}
                >
                  <div className="w-10 h-10 rounded-full bg-slate-600/30 flex items-center justify-center">
                    <span className="text-base font-medium text-slate-400">
                      {ep.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-400 truncate">
                      {ep.name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{formatPhone(ep.phone)}</p>
                  </div>
                  <div className="relative" ref={openDropdown === ep.id ? dropdownRef : undefined}>
                    <button
                      onClick={() => setOpenDropdown(openDropdown === ep.id ? null : ep.id)}
                      className="p-2 rounded-lg bg-slate-600/30 hover:bg-slate-600/50 transition-colors"
                      data-testid={`button-menu-${i}`}
                    >
                      <MoreVertical className="w-5 h-5 text-slate-400" />
                    </button>
                    {openDropdown === ep.id && (
                      <div className="absolute right-0 top-full mt-1 bg-slate-800 rounded-lg shadow-lg py-1 z-10 min-w-[120px]">
                        <button
                          onClick={() => {
                            remindExpected.mutate(ep.id);
                            setOpenDropdown(null);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
                          data-testid={`button-remind-${i}`}
                        >
                          Remind
                        </button>
                        <button
                          onClick={() => {
                            removeExpected.mutate(ep.id);
                            setOpenDropdown(null);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700"
                          data-testid={`button-remove-${i}`}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent pt-8 pb-8 px-6">
          <p className="text-slate-400 text-center mb-4">
            Instant group call, anytime.
          </p>
          <div className="flex flex-col gap-3 max-w-xs mx-auto">
            <a
              href="tel:+12202423245"
              className="flex items-center justify-center gap-2 w-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-4 px-6 rounded-full transition-colors"
              data-testid="button-join"
            >
              <Phone className="w-5 h-5" />
              Banter
            </a>
          </div>
        </div>

        {showPinModal && pinModal}
        {showAddExpectedModal && addExpectedModal}
      </div>
    );
  }

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
          <User className="w-5 h-5 text-emerald-400" />
        ) : (
          <User className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {showPinModal && pinModal}

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
      </div>
    </div>
  );
}
