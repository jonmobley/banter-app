import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone, Users, User, Plus, Volume2, VolumeX, Settings, MoreVertical, MessageSquare, Trash2, X, Pencil, PhoneOutgoing, Calendar, PhoneCall, PhoneOff, Mic, MicOff, Globe, Headphones } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import { Device, Call } from "@twilio/voice-sdk";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(true); // Admin enabled by default for now
  const [adminPin, setAdminPin] = useState("");
  const [showPinModal, setShowPinModal] = useState(false);
  const [showDemoPreview, setShowDemoPreview] = useState(false); // Toggle for demo preview
  const [pinError, setPinError] = useState(false);
  const [pinDigits, setPinDigits] = useState(["", "", "", ""]);
  const [callDuration, setCallDuration] = useState(0);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [speakingState, setSpeakingState] = useState<Record<string, boolean>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return;
      }
      
      setWsConnected(false);
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;
      
      ws.onopen = () => {
        setWsConnected(true);
      };

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
        setWsConnected(false);
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

  const { data: participantsData, isLoading: participantsLoading } = useQuery<ParticipantsData>({
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
    onError: () => {
      toast({ title: "Failed to change mute status", description: "Please try again.", variant: "destructive" });
    },
  });

  const { data: expectedData, isLoading: expectedLoading } = useQuery<ExpectedParticipant[]>({
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
      toast({ title: "Participant removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove participant", description: "Please try again.", variant: "destructive" });
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
    onSuccess: () => {
      toast({ title: "Reminder sent", description: "Text message sent successfully." });
    },
    onError: () => {
      toast({ title: "Failed to send reminder", description: "Please try again.", variant: "destructive" });
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
      toast({ title: "Calling participant", description: "Phone call initiated." });
    },
    onError: () => {
      toast({ title: "Failed to call participant", description: "Please try again.", variant: "destructive" });
    },
  });

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);

  // Calculate optimal dropdown position with clamping to stay within safe bounds
  const calculateDropdownPosition = useCallback((buttonElement: HTMLElement) => {
    const rect = buttonElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const safeTop = 70; // Below header
    const safeBottom = viewportHeight - 130; // Above footer
    const minDropdownHeight = 120; // Minimum usable height
    const dropdownWidth = 180;
    
    // Calculate available safe zone
    const safeZoneHeight = safeBottom - safeTop;
    
    // If viewport is too small, use centered fallback
    if (safeZoneHeight < minDropdownHeight) {
      const centeredTop = Math.max(16, (viewportHeight - 280) / 2);
      setDropdownStyle({
        position: 'fixed',
        top: `${centeredTop}px`,
        left: `${Math.max(16, (viewportWidth - dropdownWidth) / 2)}px`,
        maxHeight: `${Math.min(280, viewportHeight - 32)}px`,
      });
      return;
    }
    
    const dropdownMaxHeight = Math.min(280, safeZoneHeight - 20);
    
    // Calculate horizontal position - align right edge with button, clamp to viewport
    let left = rect.right - dropdownWidth;
    if (left < 8) left = 8;
    if (left + dropdownWidth > viewportWidth - 8) left = viewportWidth - dropdownWidth - 8;
    
    // Calculate vertical position - prefer below, use above if needed
    const spaceBelow = Math.max(0, safeBottom - rect.bottom);
    const spaceAbove = Math.max(0, rect.top - safeTop);
    
    let top: number;
    let maxHeight: number;
    
    if (spaceBelow >= minDropdownHeight && (spaceBelow >= dropdownMaxHeight || spaceBelow >= spaceAbove)) {
      // Open below
      top = rect.bottom + 4;
      maxHeight = Math.min(dropdownMaxHeight, safeBottom - top - 8);
    } else if (spaceAbove >= minDropdownHeight) {
      // Open above
      maxHeight = Math.min(dropdownMaxHeight, spaceAbove - 8);
      top = rect.top - maxHeight - 4;
    } else {
      // Fallback: center in safe zone
      top = safeTop + 10;
      maxHeight = Math.min(dropdownMaxHeight, safeZoneHeight - 20);
    }
    
    // Final safety clamps
    maxHeight = Math.max(minDropdownHeight, maxHeight);
    top = Math.max(safeTop, Math.min(top, safeBottom - maxHeight));
    
    setDropdownStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      maxHeight: `${maxHeight}px`,
    });
  }, []);

  const handleOpenDropdown = useCallback((id: string, event: React.MouseEvent<HTMLButtonElement>) => {
    if (openDropdown === id) {
      setOpenDropdown(null);
    } else {
      calculateDropdownPosition(event.currentTarget);
      setOpenDropdown(id);
    }
  }, [openDropdown, calculateDropdownPosition]);
  
  // Close dropdown on scroll or resize to prevent stale positions
  useEffect(() => {
    if (!openDropdown) return;
    
    const handleScrollOrResize = () => setOpenDropdown(null);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [openDropdown]);

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
  const [newExpectedPhoneError, setNewExpectedPhoneError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  // Phone validation helper
  const validatePhone = (phone: string): { valid: boolean; error?: string } => {
    if (!phone) return { valid: false };
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      return { valid: false, error: "Phone number must be at least 10 digits" };
    }
    if (cleaned.length > 11) {
      return { valid: false, error: "Phone number is too long" };
    }
    if (cleaned.length === 11 && !cleaned.startsWith('1')) {
      return { valid: false, error: "11-digit numbers must start with 1" };
    }
    return { valid: true };
  };
  
  const handleExpectedPhoneChange = (value: string) => {
    setNewExpectedPhone(value);
    const validation = validatePhone(value);
    setNewExpectedPhoneError(value && !validation.valid ? (validation.error || null) : null);
  };
  
  const handleConfirmDelete = () => {
    if (confirmDeleteId) {
      removeExpected.mutate(confirmDeleteId);
      setConfirmDeleteId(null);
    }
  };
  
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
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Unable to connect. Please try again.');
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
        let userMessage = 'Connection issue. Please try again.';
        if (error.message?.includes('permission') || error.message?.includes('NotAllowedError')) {
          userMessage = 'Please allow microphone access to join the call.';
        } else if (error.message?.includes('NotFoundError')) {
          userMessage = 'No microphone found. Please check your audio settings.';
        } else if (error.message?.includes('network') || error.message?.includes('offline')) {
          userMessage = 'Network issue. Please check your internet connection.';
        }
        setBrowserCallError(userMessage);
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
        // Default to muted when joining to prevent accidental background noise
        call.mute(true);
        setIsBrowserMuted(true);
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
        let userMessage = 'Call failed. Please try again.';
        if (error.message?.includes('permission') || error.message?.includes('NotAllowedError')) {
          userMessage = 'Please allow microphone access to join the call.';
        } else if (error.message?.includes('busy')) {
          userMessage = 'The line is busy. Please try again in a moment.';
        }
        setBrowserCallError(userMessage);
        setBrowserCallStatus('disconnected');
        setActiveCall(null);
        setIsBrowserMuted(false);
      });
      
      setActiveCall(call);
      
    } catch (error: any) {
      console.error('Failed to initialize Twilio device:', error);
      let userMessage = 'Unable to connect. Please try again.';
      if (error.message?.includes('permission') || error.name === 'NotAllowedError') {
        userMessage = 'Please allow microphone access in your browser to join the call.';
      } else if (error.name === 'NotFoundError') {
        userMessage = 'No microphone found. Please connect a microphone and try again.';
      } else if (!navigator.onLine) {
        userMessage = 'You appear to be offline. Please check your internet connection.';
      }
      setBrowserCallError(userMessage);
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
      // Haptic feedback for tactile confirmation
      if (navigator.vibrate) {
        navigator.vibrate(newMuted ? 50 : [50, 30, 50]); // Short pulse for mute, double pulse for unmute
      }
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
  const [authToken, setAuthToken] = useState<string | null>(() => {
    return localStorage.getItem('banter_auth_token');
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginPhone, setLoginPhone] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginStep, setLoginStep] = useState<'phone' | 'code'>('phone');
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  
  // Duplicate join detection state
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateCallSid, setDuplicateCallSid] = useState<string | null>(null);
  const [duplicateCheckLoading, setDuplicateCheckLoading] = useState(false);

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
      setAuthToken(data.authToken);
      localStorage.setItem('banter_verified_phone', data.phone);
      localStorage.setItem('banter_auth_token', data.authToken);
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

  const validatePhoneNumber = (phone: string): { isValid: boolean; error: string | null } => {
    const digitsOnly = phone.replace(/\D/g, '');
    
    if (!digitsOnly) {
      return { isValid: false, error: null };
    }
    
    if (digitsOnly.length < 10) {
      return { isValid: false, error: `Missing ${10 - digitsOnly.length} digit${10 - digitsOnly.length > 1 ? 's' : ''}` };
    }
    
    if (digitsOnly.length > 11) {
      return { isValid: false, error: "Too many digits" };
    }
    
    if (digitsOnly.length === 11 && !digitsOnly.startsWith('1')) {
      return { isValid: false, error: "Invalid country code" };
    }
    
    return { isValid: true, error: null };
  };

  const phoneValidation = validatePhoneNumber(loginPhone);
  const isPhoneValid = phoneValidation.isValid;

  const handleLogout = () => {
    setVerifiedPhone(null);
    setAuthToken(null);
    localStorage.removeItem('banter_verified_phone');
    localStorage.removeItem('banter_auth_token');
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
      toast({ title: "Participant added", description: "New participant has been added to the list." });
    },
    onError: () => {
      toast({ title: "Failed to add participant", description: "Please try again.", variant: "destructive" });
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
      toast({ title: "Profile updated" });
    },
    onError: () => {
      toast({ title: "Failed to update profile", description: "Please try again.", variant: "destructive" });
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
      toast({ title: "Role updated" });
    },
    onError: () => {
      toast({ title: "Failed to update role", description: "Please try again.", variant: "destructive" });
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
  
  // Check for duplicate join before connecting
  const checkForDuplicateJoin = useCallback(async (): Promise<{ isDuplicate: boolean }> => {
    if (!authToken) {
      return { isDuplicate: false };
    }
    
    try {
      const res = await fetch('/api/participants/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken })
      });
      if (!res.ok) {
        return { isDuplicate: false };
      }
      const data = await res.json();
      return { isDuplicate: data.inConference };
    } catch {
      return { isDuplicate: false };
    }
  }, [authToken]);

  // The actual browser join logic
  const proceedWithBrowserJoin = useCallback(() => {
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

  // Disconnect phone call and connect via browser
  const switchToBrowser = useCallback(async () => {
    if (!authToken) return;
    
    try {
      await fetch('/api/participants/disconnect-self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken })
      });
    } catch {
      // Continue anyway - the phone will hang up
    }
    
    setShowDuplicateWarning(false);
    setDuplicateCallSid(null);
    
    // Wait a moment for the disconnect to process
    setTimeout(() => {
      proceedWithBrowserJoin();
    }, 1000);
  }, [authToken, proceedWithBrowserJoin]);

  // Browser call join function (defined after verifiedPhone and expectedData)
  const joinFromBrowser = useCallback(async () => {
    // Check if user is already in conference via phone
    setDuplicateCheckLoading(true);
    
    try {
      const { isDuplicate } = await checkForDuplicateJoin();
      
      if (isDuplicate) {
        setShowDuplicateWarning(true);
        return;
      }
    } finally {
      setDuplicateCheckLoading(false);
    }
    
    // No duplicate, proceed with join
    proceedWithBrowserJoin();
  }, [checkForDuplicateJoin, proceedWithBrowserJoin]);
  
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
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
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
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
        <h2 className="text-xl font-bold text-center mb-2">Sign In</h2>
        <p className="text-sm text-slate-400 text-center mb-6">
          {loginStep === 'phone' ? 'Enter your phone number' : 'Enter the code we texted you'}
        </p>
        
        {loginStep === 'phone' ? (
          <div className="space-y-2 mb-6">
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              autoCorrect="off"
              placeholder="(555) 555-5555"
              value={loginPhone}
              onChange={(e) => setLoginPhone(e.target.value)}
              className={`w-full px-4 py-3.5 rounded-xl bg-slate-800 border outline-none transition-colors text-center text-base ${
                phoneValidation.error 
                  ? 'border-amber-500' 
                  : isPhoneValid 
                    ? 'border-emerald-500' 
                    : 'border-slate-700 focus:border-emerald-500'
              }`}
              style={{ fontSize: '16px' }}
              data-testid="input-login-phone"
            />
            {phoneValidation.error && (
              <p className="text-amber-400 text-sm text-center" data-testid="text-phone-error">
                {phoneValidation.error}
              </p>
            )}
            {isPhoneValid && (
              <p className="text-emerald-400 text-sm text-center" data-testid="text-phone-valid">
                Valid phone number
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCorrect="off"
              placeholder="000000"
              value={loginCode}
              onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none transition-colors text-center text-2xl tracking-widest"
              style={{ fontSize: '24px' }}
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
            disabled={loginLoading || (loginStep === 'phone' ? !isPhoneValid : loginCode.length !== 6)}
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

  const duplicateWarningModal = (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
            <Phone className="w-8 h-8 text-amber-400" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-center mb-2">Already Connected</h2>
        <p className="text-sm text-slate-400 text-center mb-6">
          You're already in this call on your phone. Would you like to switch to your browser instead?
        </p>
        
        <div className="space-y-3">
          <button
            onClick={switchToBrowser}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-3 rounded-full transition-colors"
            data-testid="button-switch-to-browser"
          >
            Switch to Browser
          </button>
          <button
            onClick={() => {
              setShowDuplicateWarning(false);
              setDuplicateCallSid(null);
            }}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
            data-testid="button-stay-on-phone"
          >
            Stay on Phone
          </button>
        </div>
      </div>
    </div>
  );

  const addExpectedModal = (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
        <h2 className="text-xl font-bold text-center mb-2">Add Expected</h2>
        <p className="text-sm text-slate-400 text-center mb-6">Who should join the call?</p>
        
        <div className="space-y-4 mb-6">
          <input
            type="text"
            inputMode="text"
            autoComplete="name"
            autoCapitalize="words"
            autoCorrect="off"
            placeholder="Name"
            value={newExpectedName}
            onChange={(e) => setNewExpectedName(e.target.value)}
            className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none transition-colors"
            style={{ fontSize: '16px' }}
            data-testid="input-expected-name"
          />
          <div>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              autoCorrect="off"
              placeholder="Phone number"
              value={newExpectedPhone}
              onChange={(e) => handleExpectedPhoneChange(e.target.value)}
              className={`w-full px-4 py-3.5 rounded-xl bg-slate-800 border ${newExpectedPhoneError ? 'border-red-500' : 'border-slate-700 focus:border-emerald-500'} outline-none transition-colors`}
              style={{ fontSize: '16px' }}
              data-testid="input-expected-phone"
            />
            {newExpectedPhoneError && (
              <p className="text-red-400 text-xs mt-1">{newExpectedPhoneError}</p>
            )}
          </div>
        </div>
        
        <div className="space-y-3">
          <button
            onClick={() => addExpected.mutate()}
            disabled={!newExpectedName || !newExpectedPhone || !validatePhone(newExpectedPhone).valid}
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
      <div className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-3xl animate-in slide-in-from-bottom duration-300 max-h-[85vh] max-h-[85dvh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 z-10 flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-slate-600 rounded-full" />
        </div>
        
        <div className="px-6 pb-8 pb-safe">
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
              <label className="text-sm text-slate-400 mb-1.5 block">Name</label>
              <input
                type="text"
                inputMode="text"
                autoComplete="name"
                autoCapitalize="words"
                autoCorrect="off"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none transition-colors"
                style={{ fontSize: '16px' }}
                data-testid="input-edit-name"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-1.5 block">Phone</label>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                autoCorrect="off"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none transition-colors"
                style={{ fontSize: '16px' }}
                data-testid="input-edit-phone"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-1.5 block">Email</label>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCorrect="off"
                autoCapitalize="none"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="Optional"
                className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none transition-colors"
                style={{ fontSize: '16px' }}
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
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 text-xl font-bold hover:text-emerald-400 transition-colors" 
            data-testid="text-title"
          >
            Banter
            <span 
              className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-red-400 animate-pulse'}`}
              title={wsConnected ? 'Connected' : 'Reconnecting...'}
              data-testid="ws-status-indicator"
            />
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
                if (role === 'participant') {
                  return isSpeaking
                    ? 'bg-blue-500/30 ring-2 ring-blue-400/50'
                    : 'bg-blue-500/20';
                }
                return isSpeaking 
                  ? 'bg-emerald-500/30 ring-2 ring-emerald-400/50' 
                  : 'bg-slate-800/50';
              };
              
              const getAvatarStyle = () => {
                if (role === 'host') {
                  return isSpeaking ? 'bg-amber-400/40' : 'bg-amber-500/30';
                }
                if (role === 'participant') {
                  return isSpeaking ? 'bg-blue-400/40' : 'bg-blue-500/30';
                }
                return isSpeaking ? 'bg-emerald-400/40' : 'bg-emerald-500/20';
              };
              
              const getTextColor = () => {
                if (role === 'host') return 'text-amber-400';
                if (role === 'participant') return 'text-blue-400';
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
                    {role === 'participant' && (
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">Participant</span>
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
                    onClick={(e) => handleOpenDropdown(`active-${p.callSid}`, e)}
                    className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors"
                    data-testid={`button-menu-active-${i}`}
                  >
                    <MoreVertical className="w-5 h-5 text-slate-400" />
                  </button>
                  {openDropdown === `active-${p.callSid}` && (
                    <div 
                      ref={dropdownMenuRef}
                      style={dropdownStyle}
                      className="bg-slate-800 rounded-lg shadow-xl py-1 z-50 min-w-[160px] overflow-y-auto"
                    >
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
                            className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 ${role === 'participant' ? 'text-blue-400' : 'text-slate-300'}`}
                            data-testid={`button-role-participant-${i}`}
                          >
                            Participant
                          </button>
                          <button
                            onClick={() => {
                              updateRole.mutate({ id: matchingExpected.id, role: 'listener' });
                              setOpenDropdown(null);
                            }}
                            className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 ${role === 'listener' ? 'text-emerald-400' : 'text-slate-300'}`}
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
                  if (ep.role === 'participant') return 'bg-blue-500/10 border border-blue-500/30';
                  return 'bg-emerald-500/10 border border-emerald-500/30';
                };
                const getExpectedAvatarStyle = () => {
                  if (ep.role === 'host') return 'bg-amber-500/20';
                  if (ep.role === 'participant') return 'bg-blue-500/20';
                  return 'bg-emerald-500/20';
                };
                const getExpectedTextColor = () => {
                  if (ep.role === 'host') return 'text-amber-400';
                  if (ep.role === 'participant') return 'text-blue-400';
                  return 'text-emerald-400';
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
                      {ep.role === 'participant' && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">Participant</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{formatPhone(ep.phone)}</p>
                  </div>
                  {canShowControls && (
                  <div className="relative" ref={openDropdown === ep.id ? dropdownRef : undefined}>
                    <button
                      onClick={(e) => handleOpenDropdown(ep.id, e)}
                      className="p-2 rounded-lg bg-slate-600/30 hover:bg-slate-600/50 transition-colors"
                      data-testid={`button-menu-${i}`}
                    >
                      <MoreVertical className="w-5 h-5 text-slate-400" />
                    </button>
                    {openDropdown === ep.id && (
                      <div 
                        ref={dropdownMenuRef}
                        style={dropdownStyle}
                        className="bg-slate-800 rounded-lg shadow-xl py-1 z-50 min-w-[160px] overflow-y-auto"
                      >
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
                          className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 ${ep.role === 'participant' ? 'text-blue-400' : 'text-slate-300'}`}
                          data-testid={`button-role-participant-exp-${i}`}
                        >
                          Participant
                        </button>
                        <button
                          onClick={() => {
                            updateRole.mutate({ id: ep.id, role: 'listener' });
                            setOpenDropdown(null);
                          }}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 ${ep.role === 'listener' ? 'text-emerald-400' : 'text-slate-300'}`}
                          data-testid={`button-role-listener-exp-${i}`}
                        >
                          Listener
                        </button>
                        <div className="border-t border-slate-700 my-1" />
                        <button
                          onClick={() => {
                            setConfirmDeleteId(ep.id);
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
                  className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-full font-semibold transition-all active:scale-95 ${
                    isBrowserMuted 
                      ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border-2 border-red-500/50' 
                      : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/25'
                  }`}
                  data-testid="button-browser-mute"
                >
                  {isBrowserMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  {isBrowserMuted ? 'Tap to Unmute' : 'Live'}
                </button>
                <button
                  onClick={hangupBrowserCall}
                  className="p-4 bg-slate-800 hover:bg-red-500 text-slate-400 hover:text-white rounded-full transition-all active:scale-95"
                  data-testid="button-browser-hangup"
                >
                  <PhoneOff className="w-5 h-5" />
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
                  disabled={duplicateCheckLoading}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 disabled:bg-slate-700 disabled:text-slate-400 text-white font-semibold py-4 px-6 rounded-full transition-colors"
                  data-testid="button-join-browser"
                >
                  <Headphones className="w-5 h-5" />
                  {duplicateCheckLoading ? 'Checking...' : 'Connect'}
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
        {showDuplicateWarning && duplicateWarningModal}
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
      {showDuplicateWarning && duplicateWarningModal}

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-8">
          <Phone className="w-10 h-10 text-emerald-400" />
        </div>
        
        <button 
          onClick={() => setShowDemoPreview(true)}
          className="flex items-center gap-3 text-5xl font-bold mb-8 text-center hover:text-emerald-400 transition-colors" 
          data-testid="text-title"
        >
          Banter
          <span 
            className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-red-400 animate-pulse'}`}
            title={wsConnected ? 'Connected' : 'Reconnecting...'}
            data-testid="ws-status-indicator-home"
          />
        </button>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          {browserCallStatus === 'connected' ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleBrowserMute}
                  className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-full font-semibold transition-all active:scale-95 ${
                    isBrowserMuted 
                      ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border-2 border-red-500/50' 
                      : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/25'
                  }`}
                  data-testid="button-browser-mute-home"
                >
                  {isBrowserMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  {isBrowserMuted ? 'Tap to Unmute' : 'Live'}
                </button>
                <button
                  onClick={hangupBrowserCall}
                  className="p-4 bg-slate-800 hover:bg-red-500 text-slate-400 hover:text-white rounded-full transition-all active:scale-95"
                  data-testid="button-browser-hangup-home"
                >
                  <PhoneOff className="w-5 h-5" />
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
                  disabled={duplicateCheckLoading}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 disabled:bg-slate-700 disabled:text-slate-400 text-white font-semibold py-4 px-6 rounded-full transition-colors"
                  data-testid="button-join-browser-home"
                >
                  <Headphones className="w-5 h-5" />
                  {duplicateCheckLoading ? 'Checking...' : 'Connect'}
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

      </div>
      
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <h2 className="text-xl font-bold text-center mb-2">Remove Participant?</h2>
            <p className="text-sm text-slate-400 text-center mb-6">
              This person will be removed from the expected list.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleConfirmDelete}
                className="w-full bg-red-500 hover:bg-red-400 text-white font-medium py-3.5 rounded-full transition-colors"
                data-testid="button-confirm-delete"
              >
                Remove
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3.5 rounded-full transition-colors"
                data-testid="button-cancel-delete"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
