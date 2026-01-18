import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone, Ban, Users, User, Plus, Volume2, VolumeX, Settings, MoreVertical, MessageSquare, Trash2, X, Pencil, PhoneOutgoing, Calendar, PhoneCall, PhoneOff, Mic, MicOff, Globe } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import { Device, Call } from "@twilio/voice-sdk";

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
  email?: string | null;
  role: 'host' | 'participant' | 'listener';
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
  const [isAdmin, setIsAdmin] = useState(true); // Admin enabled by default for now
  const [adminPin, setAdminPin] = useState("");
  const [showPinModal, setShowPinModal] = useState(false);
  const [showDemoPreview, setShowDemoPreview] = useState(false); // Toggle for demo preview
  const [pinError, setPinError] = useState(false);
  const [pinDigits, setPinDigits] = useState(["", "", "", ""]);
  const [callDuration, setCallDuration] = useState(0);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [speakingState, setSpeakingState] = useState<Record<string, boolean>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return;
      }
      
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'speaking') {
            setSpeakingState(msg.data);
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      };
      
      ws.onerror = () => {
        ws.close();
      };
    };
    
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

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
    onSuccess: (_, pin) => {
      setIsAdmin(true);
      setShowPinModal(false);
      setPinError(false);
      localStorage.setItem('banter_admin_pin', pin);
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

  const callExpected = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/expected/${id}/call`, { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: adminPin }),
      });
      if (!res.ok) throw new Error("Failed to call");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/participants"] });
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
  
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  
  // Browser calling state
  const [twilioDevice, setTwilioDevice] = useState<Device | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [browserCallStatus, setBrowserCallStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [isBrowserMuted, setIsBrowserMuted] = useState(false);
  const [browserCallError, setBrowserCallError] = useState<string | null>(null);
  
  // Initialize Twilio Device
  const initTwilioDevice = useCallback(async (identity: string) => {
    try {
      setBrowserCallError(null);
      setBrowserCallStatus('connecting');
      
      // Get access token from server
      const res = await fetch('/api/voice/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity })
      });
      
      if (!res.ok) {
        throw new Error('Failed to get voice token');
      }
      
      const { token, voiceUrl } = await res.json();
      
      // Create new Device
      const device = new Device(token, {
        logLevel: 1,
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
      });
      
      device.on('registered', () => {
        console.log('Twilio Device registered');
      });
      
      device.on('error', (error) => {
        console.error('Twilio Device error:', error);
        setBrowserCallError(error.message || 'Device error');
        setBrowserCallStatus('disconnected');
      });
      
      device.on('tokenWillExpire', async () => {
        // Refresh the token
        const refreshRes = await fetch('/api/voice/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identity })
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          device.updateToken(data.token);
        }
      });
      
      await device.register();
      setTwilioDevice(device);
      
      // Make the outbound call to join conference
      const call = await device.connect({
        params: {
          To: 'banter-main',
          userName: identity
        }
      });
      
      call.on('accept', () => {
        console.log('Browser call connected');
        setBrowserCallStatus('connected');
      });
      
      call.on('disconnect', () => {
        console.log('Browser call ended');
        setBrowserCallStatus('disconnected');
        setActiveCall(null);
        setIsBrowserMuted(false);
        queryClient.invalidateQueries({ queryKey: ["/api/participants"] });
      });
      
      call.on('cancel', () => {
        console.log('Browser call canceled');
        setBrowserCallStatus('disconnected');
        setActiveCall(null);
        setIsBrowserMuted(false);
      });
      
      call.on('reject', () => {
        console.log('Browser call rejected');
        setBrowserCallStatus('disconnected');
        setActiveCall(null);
        setIsBrowserMuted(false);
      });
      
      call.on('error', (error) => {
        console.error('Browser call error:', error);
        setBrowserCallError(error.message || 'Call error');
        setBrowserCallStatus('disconnected');
        setActiveCall(null);
        setIsBrowserMuted(false);
      });
      
      setActiveCall(call);
      
    } catch (error: any) {
      console.error('Failed to initialize Twilio device:', error);
      setBrowserCallError(error.message || 'Failed to connect');
      setBrowserCallStatus('disconnected');
    }
  }, [queryClient]);
  
  const hangupBrowserCall = useCallback(() => {
    if (activeCall) {
      activeCall.disconnect();
    }
    if (twilioDevice) {
      twilioDevice.disconnectAll();
      twilioDevice.unregister();
      setTwilioDevice(null);
    }
    setActiveCall(null);
    setBrowserCallStatus('disconnected');
    setIsBrowserMuted(false); // Reset mute state on hangup
  }, [activeCall, twilioDevice]);
  
  const toggleBrowserMute = useCallback(() => {
    if (activeCall) {
      const newMuted = !isBrowserMuted;
      activeCall.mute(newMuted);
      setIsBrowserMuted(newMuted);
    }
  }, [activeCall, isBrowserMuted]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (twilioDevice) {
        twilioDevice.disconnectAll();
        twilioDevice.unregister();
      }
    };
  }, [twilioDevice]);
  
  // Auth state
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(() => {
    return localStorage.getItem('banter_verified_phone');
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginPhone, setLoginPhone] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginStep, setLoginStep] = useState<'phone' | 'code'>('phone');
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const sendVerificationCode = async () => {
    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: loginPhone }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send code");
      }
      setLoginStep('code');
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const verifyLoginCode = async () => {
    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: loginPhone, code: loginCode }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Invalid code");
      }
      const data = await res.json();
      setVerifiedPhone(data.phone);
      localStorage.setItem('banter_verified_phone', data.phone);
      setShowLoginModal(false);
      resetLoginModal();
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const resetLoginModal = () => {
    setLoginPhone("");
    setLoginCode("");
    setLoginStep('phone');
    setLoginError("");
  };

  const handleLogout = () => {
    setVerifiedPhone(null);
    localStorage.removeItem('banter_verified_phone');
  };

  // Normalize phone to E.164 format (same as server-side)
  const normalizePhone = (phone: string): string => {
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      digits = '1' + digits;
    }
    return '+' + digits;
  };

  const isMyParticipant = (phone: string): boolean => {
    if (!verifiedPhone) return false;
    // Use exact E.164 comparison
    return normalizePhone(verifiedPhone) === normalizePhone(phone);
  };
  const [editingParticipant, setEditingParticipant] = useState<ExpectedParticipant | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");

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

  const updateExpected = useMutation({
    mutationFn: async () => {
      if (!editingParticipant) return;
      const res = await fetch(`/api/expected/${editingParticipant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: adminPin, name: editName, phone: editPhone, email: editEmail || null }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expected"] });
      setShowProfileDrawer(false);
      setEditingParticipant(null);
    },
  });

  const openProfileDrawer = (participant: ExpectedParticipant) => {
    setEditingParticipant(participant);
    setEditName(participant.name);
    setEditPhone(participant.phone);
    setEditEmail(participant.email || "");
    setShowProfileDrawer(true);
  };

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
    { callSid: "sample-2", phone: "+13105559876", name: "Jake", muted: false, hold: false },
    { callSid: "sample-3", phone: "+12025558888", name: "Sue", muted: true, hold: false },
  ];

  const sampleExpected: ExpectedParticipant[] = [
    { id: "sample-exp-1", name: "Mom", phone: "+12025551234", role: 'host' },
    { id: "sample-exp-2", name: "Jake", phone: "+13105559876", role: 'participant' },
    { id: "sample-exp-3", name: "Sue", phone: "+12025558888", role: 'listener' },
    { id: "sample-exp-4", name: "Dad", phone: "+12025559999", role: 'participant' },
  ];
  
  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const res = await fetch(`/api/expected/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: adminPin, role }),
      });
      if (!res.ok) throw new Error("Failed to update role");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expected"] });
    },
  });
  
  const getParticipantRole = (phone: string): ExpectedParticipant['role'] | null => {
    const normalizedPhone = phone.replace(/\D/g, '');
    const ep = expectedParticipants.find(e => {
      const normalizedExpected = e.phone.replace(/\D/g, '');
      return normalizedPhone === normalizedExpected || 
             normalizedPhone.endsWith(normalizedExpected) ||
             normalizedExpected.endsWith(normalizedPhone);
    });
    return ep?.role || null;
  };
  
  const isUserHost = (): boolean => {
    if (!verifiedPhone) return false;
    const role = getParticipantRole(verifiedPhone);
    return role === 'host';
  };
  
  const canShowControls = isAdmin || isUserHost();
  
  const roleOrder = { host: 0, participant: 1, listener: 2 };

  const realParticipants = participantsData?.participants || [];
  const realCount = participantsData?.count || 0;
  const conferenceActive = participantsData?.conferenceActive || false;
  
  const isPreviewMode = showDemoPreview;
  const unsortedParticipants = showDemoPreview ? sampleParticipants : realParticipants;
  const participantCount = showDemoPreview ? sampleParticipants.length : realCount;
  const unsortedExpected = showDemoPreview ? sampleExpected : (expectedData || []);
  
  const expectedParticipants = [...unsortedExpected].sort((a, b) => {
    return roleOrder[a.role] - roleOrder[b.role];
  });
  
  const participants = [...unsortedParticipants].sort((a, b) => {
    const roleA = getParticipantRole(a.phone) || 'participant';
    const roleB = getParticipantRole(b.phone) || 'participant';
    return roleOrder[roleA] - roleOrder[roleB];
  });
  
  // Browser call join function (defined after verifiedPhone and expectedData)
  const joinFromBrowser = useCallback(() => {
    // Get user identity - use verified phone name or guest
    let identity = 'Web User';
    if (verifiedPhone) {
      const matchingParticipant = expectedData?.find(p => {
        const normalizedExpected = p.phone.replace(/\D/g, '');
        const normalizedVerified = verifiedPhone.replace(/\D/g, '');
        return normalizedExpected === normalizedVerified || 
               normalizedExpected.endsWith(normalizedVerified) ||
               normalizedVerified.endsWith(normalizedExpected);
      });
      if (matchingParticipant) {
        identity = matchingParticipant.name;
      }
    }
    initTwilioDevice(identity);
  }, [verifiedPhone, expectedData, initTwilioDevice]);
  
  const hasActiveCall = conferenceActive || showDemoPreview;

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

  const loginModal = (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6">
      <div className="bg-slate-900 rounded-2xl p-6 w-full max-w-xs">
        <h2 className="text-xl font-bold text-center mb-2">Sign In</h2>
        <p className="text-sm text-slate-400 text-center mb-6">
          {loginStep === 'phone' ? 'Enter your phone number' : 'Enter the code we texted you'}
        </p>
        
        {loginStep === 'phone' ? (
          <div className="space-y-4 mb-6">
            <input
              type="tel"
              placeholder="(555) 555-5555"
              value={loginPhone}
              onChange={(e) => setLoginPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none transition-colors text-center text-lg"
              data-testid="input-login-phone"
            />
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            <input
              type="tel"
              placeholder="000000"
              value={loginCode}
              onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none transition-colors text-center text-2xl tracking-widest"
              data-testid="input-login-code"
            />
          </div>
        )}
        
        {loginError && (
          <p className="text-red-400 text-sm text-center mb-4">{loginError}</p>
        )}
        
        <div className="space-y-3">
          <button
            onClick={loginStep === 'phone' ? sendVerificationCode : verifyLoginCode}
            disabled={loginLoading || (loginStep === 'phone' ? !loginPhone : loginCode.length !== 6)}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium py-3 rounded-full transition-colors"
            data-testid="button-login-submit"
          >
            {loginLoading ? 'Loading...' : loginStep === 'phone' ? 'Send Code' : 'Verify'}
          </button>
          
          {loginStep === 'code' && (
            <button
              onClick={() => setLoginStep('phone')}
              className="w-full text-slate-400 hover:text-white text-sm transition-colors"
              data-testid="button-login-back"
            >
              Use a different number
            </button>
          )}
          
          <button
            onClick={() => {
              setShowLoginModal(false);
              resetLoginModal();
            }}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
            data-testid="button-login-cancel"
          >
            Cancel
          </button>
        </div>
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

  const profileDrawer = (
    <div className="fixed inset-0 z-50">
      <div 
        className="absolute inset-0 bg-black/50"
        onClick={() => setShowProfileDrawer(false)}
      />
      <div className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-3xl animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-slate-600 rounded-full" />
        </div>
        
        <div className="px-6 pb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Edit Profile</h2>
            <button
              onClick={() => setShowProfileDrawer(false)}
              className="p-2 rounded-full hover:bg-slate-800 transition-colors"
              data-testid="button-close-drawer"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
          
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center">
              <span className="text-3xl font-bold text-slate-300">
                {editName ? editName.charAt(0).toUpperCase() : '?'}
              </span>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none transition-colors"
                data-testid="input-edit-name"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Phone</label>
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none transition-colors"
                data-testid="input-edit-phone"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Email</label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="Optional"
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none transition-colors"
                data-testid="input-edit-email"
              />
            </div>
          </div>
          
          <button
            onClick={() => updateExpected.mutate()}
            disabled={!editName || !editPhone}
            className="w-full mt-6 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium py-4 rounded-full transition-colors"
            data-testid="button-save-profile"
          >
            Save
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
          
          <button 
            onClick={() => setShowDemoPreview(!showDemoPreview)}
            className="absolute left-1/2 -translate-x-1/2 text-xl font-bold hover:text-emerald-400 transition-colors" 
            data-testid="text-title"
          >
            Banter
          </button>
          
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setShowAddExpectedModal(true)}
                className="p-3 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors"
                data-testid="button-add-expected"
              >
                <Plus className="w-5 h-5 text-emerald-400" />
              </button>
            )}
            {isAdmin ? (
              <Link
                href="/account"
                className={`p-3 rounded-full transition-colors ${
                  verifiedPhone 
                    ? 'bg-blue-500/20 hover:bg-blue-500/30' 
                    : 'bg-slate-800/50 hover:bg-slate-700'
                }`}
                data-testid="button-profile"
              >
                <User className={`w-5 h-5 ${verifiedPhone ? 'text-blue-400' : 'text-slate-400'}`} />
              </Link>
            ) : (
              <button
                onClick={() => verifiedPhone ? handleLogout() : setShowLoginModal(true)}
                className={`p-3 rounded-full transition-colors ${
                  verifiedPhone 
                    ? 'bg-blue-500/20 hover:bg-blue-500/30' 
                    : 'bg-slate-800/50 hover:bg-slate-700'
                }`}
                data-testid="button-profile"
              >
                <User className={`w-5 h-5 ${verifiedPhone ? 'text-blue-400' : 'text-slate-400'}`} />
              </button>
            )}
          </div>
        </header>


        <div className="flex-1 overflow-auto px-4 pb-48">
          <div className="space-y-2">
            {participants.map((p, i) => {
              const isSpeaking = speakingState[p.callSid] || false;
              const role = getParticipantRole(p.phone);
              const matchingExpected = expectedParticipants.find(ep => {
                const normalizedExpected = ep.phone.replace(/\D/g, '');
                const normalizedActive = p.phone.replace(/\D/g, '');
                return normalizedActive === normalizedExpected || 
                       normalizedActive.endsWith(normalizedExpected) ||
                       normalizedExpected.endsWith(normalizedActive);
              });
              
              const getCardStyle = () => {
                if (role === 'host') {
                  return isSpeaking 
                    ? 'bg-amber-500/30 ring-2 ring-amber-400/50' 
                    : 'bg-amber-500/20';
                }
                if (role === 'listener') {
                  return 'bg-blue-500/20';
                }
                return isSpeaking 
                  ? 'bg-emerald-500/30 ring-2 ring-emerald-400/50' 
                  : 'bg-slate-800/50';
              };
              
              const getAvatarStyle = () => {
                if (role === 'host') {
                  return isSpeaking ? 'bg-amber-400/40' : 'bg-amber-500/30';
                }
                if (role === 'listener') {
                  return 'bg-blue-500/30';
                }
                return isSpeaking ? 'bg-emerald-400/40' : 'bg-emerald-500/20';
              };
              
              const getTextColor = () => {
                if (role === 'host') return 'text-amber-400';
                if (role === 'listener') return 'text-blue-400';
                return 'text-emerald-400';
              };
              
              return (
              <div 
                key={p.callSid} 
                className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-colors duration-200 ${getCardStyle()}`}
                data-testid={`participant-${i}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-200 ${getAvatarStyle()}`}>
                  <span className={`text-base font-medium ${getTextColor()}`}>
                    {p.name ? p.name.charAt(0).toUpperCase() : '?'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">
                      {p.name || formatPhone(p.phone)}
                    </p>
                    {isMyParticipant(p.phone) && (
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">You</span>
                    )}
                    {role === 'host' && (
                      <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">Host</span>
                    )}
                    {role === 'listener' && (
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">Listener</span>
                    )}
                  </div>
                  {p.name && (
                    <p className="text-xs text-slate-500 truncate">{formatPhone(p.phone)}</p>
                  )}
                </div>
                <button
                  onClick={() => canShowControls && toggleMute.mutate({ callSid: p.callSid, muted: !p.muted })}
                  className={`p-2 rounded-lg transition-colors ${
                    p.muted 
                      ? 'bg-red-500/20 hover:bg-red-500/30' 
                      : 'bg-emerald-500/20 hover:bg-emerald-500/30'
                  } ${!canShowControls ? 'cursor-default opacity-50' : ''}`}
                  data-testid={`button-mute-${i}`}
                >
                  {p.muted ? (
                    <VolumeX className="w-5 h-5 text-red-400" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-emerald-400" />
                  )}
                </button>
                {canShowControls && (
                <div className="relative" ref={openDropdown === `active-${p.callSid}` ? dropdownRef : undefined}>
                  <button
                    onClick={() => setOpenDropdown(openDropdown === `active-${p.callSid}` ? null : `active-${p.callSid}`)}
                    className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors"
                    data-testid={`button-menu-active-${i}`}
                  >
                    <MoreVertical className="w-5 h-5 text-slate-400" />
                  </button>
                  {openDropdown === `active-${p.callSid}` && (
                    <div className="absolute right-0 top-full mt-1 bg-slate-800 rounded-lg shadow-xl py-1 z-50 min-w-[160px]">
                      {matchingExpected && (
                        <>
                          <button
                            onClick={() => {
                              openProfileDrawer(matchingExpected);
                              setOpenDropdown(null);
                            }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
                            data-testid={`button-edit-active-${i}`}
                          >
                            <Pencil className="w-4 h-4" />
                            Edit
                          </button>
                          <div className="border-t border-slate-700 my-1" />
                          <div className="px-4 py-1 text-xs text-slate-500 uppercase">Change Role</div>
                          <button
                            onClick={() => {
                              updateRole.mutate({ id: matchingExpected.id, role: 'host' });
                              setOpenDropdown(null);
                            }}
                            className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 ${role === 'host' ? 'text-amber-400' : 'text-slate-300'}`}
                            data-testid={`button-role-host-${i}`}
                          >
                            Host
                          </button>
                          <button
                            onClick={() => {
                              updateRole.mutate({ id: matchingExpected.id, role: 'participant' });
                              setOpenDropdown(null);
                            }}
                            className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 ${role === 'participant' ? 'text-emerald-400' : 'text-slate-300'}`}
                            data-testid={`button-role-participant-${i}`}
                          >
                            Participant
                          </button>
                          <button
                            onClick={() => {
                              updateRole.mutate({ id: matchingExpected.id, role: 'listener' });
                              setOpenDropdown(null);
                            }}
                            className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 ${role === 'listener' ? 'text-blue-400' : 'text-slate-300'}`}
                            data-testid={`button-role-listener-${i}`}
                          >
                            Listener
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                )}
              </div>
            );
            })}
            
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
              .map((ep, i) => {
                const getExpectedCardStyle = () => {
                  if (ep.role === 'host') return 'bg-amber-500/10 border border-amber-500/30';
                  if (ep.role === 'listener') return 'bg-blue-500/10 border border-blue-500/30';
                  return 'bg-slate-700/30';
                };
                const getExpectedAvatarStyle = () => {
                  if (ep.role === 'host') return 'bg-amber-500/20';
                  if (ep.role === 'listener') return 'bg-blue-500/20';
                  return 'bg-slate-600/30';
                };
                const getExpectedTextColor = () => {
                  if (ep.role === 'host') return 'text-amber-400';
                  if (ep.role === 'listener') return 'text-blue-400';
                  return 'text-slate-400';
                };
                
                return (
                <div 
                  key={ep.id} 
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 ${getExpectedCardStyle()}`}
                  data-testid={`expected-${i}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getExpectedAvatarStyle()}`}>
                    <span className={`text-base font-medium ${getExpectedTextColor()}`}>
                      {ep.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-medium truncate ${getExpectedTextColor()}`}>
                        {ep.name}
                      </p>
                      {ep.role === 'host' && (
                        <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">Host</span>
                      )}
                      {ep.role === 'listener' && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">Listener</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{formatPhone(ep.phone)}</p>
                  </div>
                  {canShowControls && (
                  <div className="relative" ref={openDropdown === ep.id ? dropdownRef : undefined}>
                    <button
                      onClick={() => setOpenDropdown(openDropdown === ep.id ? null : ep.id)}
                      className="p-2 rounded-lg bg-slate-600/30 hover:bg-slate-600/50 transition-colors"
                      data-testid={`button-menu-${i}`}
                    >
                      <MoreVertical className="w-5 h-5 text-slate-400" />
                    </button>
                    {openDropdown === ep.id && (
                      <div className="absolute right-0 top-full mt-1 bg-slate-800 rounded-lg shadow-xl py-1 z-50 min-w-[160px]">
                        <button
                          onClick={() => {
                            callExpected.mutate(ep.id);
                            setOpenDropdown(null);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-emerald-400 hover:bg-slate-700"
                          data-testid={`button-call-${i}`}
                        >
                          <PhoneOutgoing className="w-4 h-4" />
                          Call
                        </button>
                        <button
                          onClick={() => {
                            openProfileDrawer(ep);
                            setOpenDropdown(null);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
                          data-testid={`button-edit-${i}`}
                        >
                          <Pencil className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            remindExpected.mutate(ep.id);
                            setOpenDropdown(null);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
                          data-testid={`button-remind-${i}`}
                        >
                          <MessageSquare className="w-4 h-4" />
                          Remind
                        </button>
                        <div className="border-t border-slate-700 my-1" />
                        <div className="px-4 py-1 text-xs text-slate-500 uppercase">Change Role</div>
                        <button
                          onClick={() => {
                            updateRole.mutate({ id: ep.id, role: 'host' });
                            setOpenDropdown(null);
                          }}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 ${ep.role === 'host' ? 'text-amber-400' : 'text-slate-300'}`}
                          data-testid={`button-role-host-exp-${i}`}
                        >
                          Host
                        </button>
                        <button
                          onClick={() => {
                            updateRole.mutate({ id: ep.id, role: 'participant' });
                            setOpenDropdown(null);
                          }}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 ${ep.role === 'participant' ? 'text-emerald-400' : 'text-slate-300'}`}
                          data-testid={`button-role-participant-exp-${i}`}
                        >
                          Participant
                        </button>
                        <button
                          onClick={() => {
                            updateRole.mutate({ id: ep.id, role: 'listener' });
                            setOpenDropdown(null);
                          }}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 ${ep.role === 'listener' ? 'text-blue-400' : 'text-slate-300'}`}
                          data-testid={`button-role-listener-exp-${i}`}
                        >
                          Listener
                        </button>
                        <div className="border-t border-slate-700 my-1" />
                        <button
                          onClick={() => {
                            removeExpected.mutate(ep.id);
                            setOpenDropdown(null);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-slate-700"
                          data-testid={`button-remove-${i}`}
                        >
                          <Trash2 className="w-4 h-4" />
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              );
              })}
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent pt-8 pb-8 px-6">
          <div className="flex flex-col gap-3 max-w-xs mx-auto">
            {browserCallStatus === 'connected' ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleBrowserMute}
                  className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-full transition-colors ${
                    isBrowserMuted 
                      ? 'bg-red-500 hover:bg-red-400 text-white' 
                      : 'bg-slate-700 hover:bg-slate-600 text-white'
                  }`}
                  data-testid="button-browser-mute"
                >
                  {isBrowserMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  {isBrowserMuted ? 'Unmute' : 'Mute'}
                </button>
                <button
                  onClick={hangupBrowserCall}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 text-white font-semibold py-4 px-6 rounded-full transition-colors"
                  data-testid="button-browser-hangup"
                >
                  <PhoneOff className="w-5 h-5" />
                  Leave
                </button>
              </div>
            ) : browserCallStatus === 'connecting' ? (
              <button
                disabled
                className="flex items-center justify-center gap-2 w-full bg-slate-600 text-white font-semibold py-4 px-6 rounded-full"
                data-testid="button-browser-connecting"
              >
                <Globe className="w-5 h-5 animate-pulse" />
                Connecting...
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <a
                  href="tel:+12202423245"
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-4 px-6 rounded-full transition-colors"
                  data-testid="button-join-phone"
                >
                  <Phone className="w-5 h-5" />
                  Call
                </a>
                <button
                  onClick={joinFromBrowser}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-semibold py-4 px-6 rounded-full transition-colors"
                  data-testid="button-join-browser"
                >
                  <Globe className="w-5 h-5" />
                  Browser
                </button>
              </div>
            )}
            {browserCallError && (
              <p className="text-red-400 text-sm text-center">{browserCallError}</p>
            )}
          </div>
        </div>

        {showPinModal && pinModal}
        {showAddExpectedModal && addExpectedModal}
        {showProfileDrawer && profileDrawer}
        {showLoginModal && loginModal}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col relative">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {isAdmin ? (
          <Link
            href="/account"
            className={`p-3 rounded-full transition-colors ${
              verifiedPhone 
                ? 'bg-blue-500/20 hover:bg-blue-500/30' 
                : 'bg-slate-800/50 hover:bg-slate-700'
            }`}
            data-testid="button-profile"
          >
            <User className={`w-5 h-5 ${verifiedPhone ? 'text-blue-400' : 'text-slate-400'}`} />
          </Link>
        ) : (
          <button
            onClick={() => verifiedPhone ? handleLogout() : setShowLoginModal(true)}
            className={`p-3 rounded-full transition-colors ${
              verifiedPhone 
                ? 'bg-blue-500/20 hover:bg-blue-500/30' 
                : 'bg-slate-800/50 hover:bg-slate-700'
            }`}
            data-testid="button-profile"
          >
            <User className={`w-5 h-5 ${verifiedPhone ? 'text-blue-400' : 'text-slate-400'}`} />
          </button>
        )}
      </div>

      {showPinModal && pinModal}
      {showLoginModal && loginModal}

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-8">
          <Phone className="w-10 h-10 text-emerald-400" />
        </div>
        
        <button 
          onClick={() => setShowDemoPreview(true)}
          className="text-5xl font-bold mb-8 text-center hover:text-emerald-400 transition-colors" 
          data-testid="text-title"
        >
          Banter
        </button>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          {browserCallStatus === 'connected' ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleBrowserMute}
                  className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-full transition-colors ${
                    isBrowserMuted 
                      ? 'bg-red-500 hover:bg-red-400 text-white' 
                      : 'bg-slate-700 hover:bg-slate-600 text-white'
                  }`}
                  data-testid="button-browser-mute-home"
                >
                  {isBrowserMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  {isBrowserMuted ? 'Unmute' : 'Mute'}
                </button>
                <button
                  onClick={hangupBrowserCall}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 text-white font-semibold py-4 px-6 rounded-full transition-colors"
                  data-testid="button-browser-hangup-home"
                >
                  <PhoneOff className="w-5 h-5" />
                  Leave
                </button>
              </div>
            </div>
          ) : browserCallStatus === 'connecting' ? (
            <button
              disabled
              className="flex items-center justify-center gap-2 w-full bg-slate-600 text-white font-semibold py-4 px-6 rounded-full"
              data-testid="button-browser-connecting-home"
            >
              <Globe className="w-5 h-5 animate-pulse" />
              Connecting...
            </button>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <a
                  href="tel:+12202423245"
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-4 px-6 rounded-full transition-colors"
                  data-testid="button-join-phone-home"
                >
                  <Phone className="w-5 h-5" />
                  Call
                </a>
                <button
                  onClick={joinFromBrowser}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-semibold py-4 px-6 rounded-full transition-colors"
                  data-testid="button-join-browser-home"
                >
                  <Globe className="w-5 h-5" />
                  Browser
                </button>
              </div>
              
              {isAdmin && (
                <Link
                  href="/account"
                  className="flex items-center justify-center w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 px-6 rounded-full transition-colors"
                  data-testid="button-account"
                >
                  Manage Account
                </Link>
              )}
            </>
          )}
          {browserCallError && (
            <p className="text-red-400 text-sm text-center">{browserCallError}</p>
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
