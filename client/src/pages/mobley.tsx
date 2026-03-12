import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone, Users, User, Plus, Volume2, VolumeX, Settings, MoreVertical, MessageSquare, Trash2, X, Pencil, PhoneOutgoing, PhoneOff, Calendar, PhoneCall, Mic, MicOff, Globe, Wifi, Radio, Bell, Megaphone, Hand, Bluetooth, Loader2, LogOut, Shield, Search, UserPlus, RefreshCw, Clock, Send, Lock, Unlock } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Room, RoomEvent, Track, LocalParticipant, RemoteParticipant, ConnectionState, AudioPresets, VideoPresets, DataPacket_Kind } from "livekit-client";
import { useToast } from "@/hooks/use-toast";
import { formatPhone } from "@/lib/utils";

type TalkMode = 'ptt' | 'auto' | 'always';

interface ChatMessage {
  id: string;
  banterId: string | null;
  senderIdentity: string;
  senderName: string;
  content: string;
  createdAt: string;
}

interface Participant {
  identity: string;
  name: string;
  muted: boolean;
  joinedAt?: number;
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

interface Channel {
  id: string;
  number: number;
  name: string;
  participants: string[];
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  if (!cleaned.startsWith('+')) {
    return `+${cleaned}`;
  }
  return phone;
}

interface ScheduledBanterInfo {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export default function Mobley({ slug }: { slug?: string } = {}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [speakingState, setSpeakingState] = useState<Record<string, boolean>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [banterInfo, setBanterInfo] = useState<ScheduledBanterInfo | null>(null);
  const [banterLoading, setBanterLoading] = useState(!!slug);
  const [banterError, setBanterError] = useState<string | null>(null);
  const currentBanterId = banterInfo?.id || null;
  const banterIdRef = useRef<string | null>(currentBanterId);
  useEffect(() => {
    banterIdRef.current = currentBanterId;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'join-banter', banterId: currentBanterId || null }));
    }
  }, [currentBanterId]);

  useEffect(() => {
    if (!slug) return;
    setBanterLoading(true);
    setBanterError(null);
    fetch(`/api/banters/by-slug/${encodeURIComponent(slug)}`)
      .then(r => {
        if (!r.ok) throw new Error('Banter not found');
        return r.json();
      })
      .then(data => {
        setBanterInfo({ id: data.id, name: data.name, slug: data.slug, status: data.status });
        setBanterLoading(false);
      })
      .catch(err => {
        setBanterError(err.message);
        setBanterLoading(false);
      });
  }, [slug]);

  // LiveKit room and connection state
  const [room, setRoom] = useState<Room | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [isMuted, setIsMuted] = useState(true);
  const [isHoldMuted, setIsHoldMuted] = useState(false);
  const isHoldMutedRef = useRef(false);
  const alwaysOnLastTapRef = useRef<number>(0);
  const alwaysOnDoubleTapRef = useRef(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [localIdentity, setLocalIdentity] = useState<string | null>(null);
  
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  
  // Walkie-talkie mode state
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Get or create AudioContext for chirp sounds
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);
  
  // Preload chirp audio for instant playback
  const chirpAudioRef = useRef<HTMLAudioElement | null>(null);
  
  useEffect(() => {
    // Preload the chirp sound
    const audio = new Audio('/assets/audio/chirp.mp3');
    audio.preload = 'auto';
    audio.volume = 0.5;
    chirpAudioRef.current = audio;
    
    return () => {
      if (chirpAudioRef.current) {
        chirpAudioRef.current = null;
      }
    };
  }, []);
  
  // Play chirp sound using preloaded audio file
  const playChirp = useCallback((type: 'start' | 'end'): Promise<void> => {
    return new Promise((resolve) => {
      try {
        if (chirpAudioRef.current) {
          // Clone the audio for overlapping plays
          const audio = chirpAudioRef.current.cloneNode() as HTMLAudioElement;
          audio.volume = 0.5;
          audio.currentTime = 0;
          audio.play().catch(() => {});
          
          // Resolve after chirp with buffer time for network wake-up
          setTimeout(resolve, type === 'start' ? 200 : 100);
        } else {
          resolve();
        }
      } catch (err) {
        console.error('Failed to play chirp:', err);
        resolve();
      }
    });
  }, []);
  
  // Mute/unmute all remote audio elements (for half-duplex mode)
  const setRemoteAudioMuted = useCallback((muted: boolean) => {
    audioElementsRef.current.forEach((audioElement) => {
      audioElement.muted = muted;
    });
  }, []);
  
  // iOS Safari audio unlock - must be called on first user interaction
  const unlockAudio = useCallback(() => {
    if (isAudioUnlocked) return;
    
    try {
      const ctx = getAudioContext();
      // Resume context if suspended (required for iOS)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      // Play a silent buffer to unlock audio
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      
      setIsAudioUnlocked(true);
    } catch (err) {
      console.error('Failed to unlock audio:', err);
    }
  }, [isAudioUnlocked, getAudioContext]);

  // Audio device selection
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showFlicModal, setShowFlicModal] = useState(false);
  const [showMicPicker, setShowMicPicker] = useState(false);
  const micPickerRef = useRef<HTMLDivElement>(null);

  // Audio processing settings
  const [echoCancellation, setEchoCancellation] = useState<boolean>(() => {
    const saved = localStorage.getItem('banter_echo_cancellation');
    return saved !== null ? saved === 'true' : true;
  });
  const [noiseSuppression, setNoiseSuppression] = useState<boolean>(() => {
    const saved = localStorage.getItem('banter_noise_suppression');
    return saved !== null ? saved === 'true' : true;
  });
  const [autoGainControl, setAutoGainControl] = useState<boolean>(() => {
    const saved = localStorage.getItem('banter_auto_gain_control');
    return saved !== null ? saved === 'true' : true;
  });

  // Flic button state
  const [flicButtons, setFlicButtons] = useState<Array<{ uuid: string; name: string; connectionState?: string }>>([]);
  const [flicScanning, setFlicScanning] = useState(false);
  const [flicScanStatus, setFlicScanStatus] = useState<string | null>(null);
  const [flicScanError, setFlicScanError] = useState<string | null>(null);

  const [flicSupported, setFlicSupported] = useState<boolean | null>(null);

  const checkFlicSupport = useCallback(async () => {
    try {
      const { PushToTalk } = await import('capacitor-pushtotalk');
      const result = await PushToTalk.getFlicButtons();
      const supported = result !== undefined;
      console.log('[Flic] Support check:', supported, 'buttons:', result?.buttons?.length ?? 0);
      setFlicSupported(supported);
    } catch (e) {
      console.log('[Flic] Support check failed (not on native?):', e);
      setFlicSupported(false);
    }
  }, []);

  const flicScanCleanupRef = useRef<(() => void) | null>(null);

  const stopFlicScan = useCallback(async () => {
    console.log('[Flic] stopFlicScan called');
    if (flicScanCleanupRef.current) {
      flicScanCleanupRef.current();
      flicScanCleanupRef.current = null;
    }
    setFlicScanning(false);
    setFlicScanStatus(null);
    try {
      const { PushToTalk } = await import('capacitor-pushtotalk');
      await PushToTalk.stopScanForFlicButtons();
      console.log('[Flic] Native scan stopped');
    } catch (e) {
      console.log('[Flic] stopScanForFlicButtons error (may be expected):', e);
    }
  }, []);

  const refreshFlicButtons = useCallback(async () => {
    console.log('[Flic] Refreshing button list');
    try {
      const { PushToTalk } = await import('capacitor-pushtotalk');
      const result = await PushToTalk.getFlicButtons();
      console.log('[Flic] getFlicButtons result:', JSON.stringify(result));
      if (result.buttons && result.buttons.length > 0) {
        setFlicButtons(result.buttons.map(b => ({
          uuid: b.uuid,
          name: b.name,
          connectionState: b.connectionState || 'disconnected'
        })));
      } else {
        setFlicButtons([]);
      }
    } catch (e) {
      console.log('[Flic] refreshFlicButtons error:', e);
    }
  }, []);

  const scanForFlicButtons = useCallback(async () => {
    console.log('[Flic] scanForFlicButtons starting');
    try {
      setFlicScanning(true);
      setFlicScanStatus(null);
      setFlicScanError(null);
      const { PushToTalk } = await import('capacitor-pushtotalk');
      const handlers: Array<{ remove: () => void }> = [];
      let scanTimeout: ReturnType<typeof setTimeout> | null = null;
      let scanDone = false;

      const cleanupHandlers = () => {
        if (scanDone) return;
        scanDone = true;
        console.log('[Flic] Cleaning up scan handlers');
        if (scanTimeout) clearTimeout(scanTimeout);
        handlers.forEach(h => h.remove());
        handlers.length = 0;
        flicScanCleanupRef.current = null;
      };

      flicScanCleanupRef.current = cleanupHandlers;

      handlers.push(await PushToTalk.addListener('flicScanStatus', (data: { status: string }) => {
        console.log('[Flic] Scan status:', data.status);
        setFlicScanStatus(data.status);
      }));

      handlers.push(await PushToTalk.addListener('flicButtonFound', (data: { uuid: string; name: string }) => {
        console.log('[Flic] Button found:', data.name, data.uuid);
        setFlicButtons(prev => {
          if (prev.some(b => b.uuid === data.uuid)) return prev;
          return [...prev, { uuid: data.uuid, name: data.name, connectionState: 'connecting' }];
        });
      }));

      handlers.push(await PushToTalk.addListener('flicConnected', (data: { uuid: string; name: string }) => {
        console.log('[Flic] Connected:', data.name, data.uuid);
        setFlicButtons(prev => prev.map(b => b.uuid === data.uuid ? { ...b, connectionState: 'connected' } : b));
      }));

      handlers.push(await PushToTalk.addListener('flicDisconnected', (data: { uuid: string }) => {
        console.log('[Flic] Disconnected:', data.uuid);
        setFlicButtons(prev => prev.map(b => b.uuid === data.uuid ? { ...b, connectionState: 'disconnected' } : b));
      }));

      scanTimeout = setTimeout(async () => {
        if (scanDone) return;
        console.log('[Flic] Scan timed out after 30s');
        cleanupHandlers();
        setFlicScanning(false);
        setFlicScanStatus(null);
        setFlicScanError('No Flic button found. Make sure your Flic is in pairing mode.');
        try {
          await PushToTalk.stopScanForFlicButtons();
        } catch {}
      }, 30000);

      try {
        console.log('[Flic] Calling native scanForFlicButtons');
        const result = await PushToTalk.scanForFlicButtons();
        console.log('[Flic] Scan completed successfully:', result);
        cleanupHandlers();
        setFlicScanStatus('verified');
        await refreshFlicButtons();
        setTimeout(() => {
          setFlicScanning(false);
          setFlicScanStatus(null);
          setShowFlicModal(false);
        }, 1200);
      } catch (e: any) {
        console.log('[Flic] Scan failed:', e?.message || e);
        cleanupHandlers();
        setFlicScanning(false);
        setFlicScanError(e?.message || 'Scan failed');
        setFlicScanStatus(null);
      }
    } catch (e) {
      console.log('[Flic] scanForFlicButtons outer error:', e);
      setFlicScanning(false);
    }
  }, [refreshFlicButtons]);

  const forgetFlicButton = useCallback(async (uuid: string) => {
    console.log('[Flic] Forgetting button:', uuid);
    try {
      const { PushToTalk } = await import('capacitor-pushtotalk');
      await PushToTalk.forgetFlicButton({ uuid });
      console.log('[Flic] Button forgotten successfully:', uuid);
      setFlicButtons(prev => prev.filter(b => b.uuid !== uuid));
    } catch (e) {
      console.log('[Flic] forgetFlicButton error:', e);
    }
  }, []);

  useEffect(() => {
    if (showAudioSettings || showFlicModal) {
      checkFlicSupport();
      refreshFlicButtons();
    }
  }, [showAudioSettings, showFlicModal, checkFlicSupport, refreshFlicButtons]);

  // Talk mode: PTT (push-to-talk), Auto (toggle), or Always On
  const [talkMode, setTalkMode] = useState<TalkMode>(() => {
    const saved = localStorage.getItem('banter_talk_mode');
    return (saved === 'auto' || saved === 'ptt' || saved === 'always') ? saved : 'ptt';
  });

  const isTokenExpired = (() => {
    const token = localStorage.getItem('banter_auth_token');
    if (!token) return false;
    try {
      const decoded = atob(token);
      const parts = decoded.split(':');
      if (parts.length >= 2) {
        const expiry = parseInt(parts[1], 10);
        if (Date.now() > expiry) {
          localStorage.removeItem('banter_auth_token');
          localStorage.removeItem('banter_verified_phone');
          localStorage.removeItem('banter_verified_email');
          return true;
        }
      }
    } catch {}
    return false;
  })();

  // Phone verification state
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(() => {
    return isTokenExpired ? null : localStorage.getItem('banter_verified_phone');
  });
  const [authToken, setAuthToken] = useState<string | null>(() => {
    return isTokenExpired ? null : localStorage.getItem('banter_auth_token');
  });

  // User display name (editable before joining)
  const [userName, setUserName] = useState<string>(() => {
    return localStorage.getItem('banter_user_name') || '';
  });

  // Login modal state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);
  const [showMyProfile, setShowMyProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState(() => {
    return localStorage.getItem('banter_user_email') || '';
  });
  const [draftName, setDraftName] = useState('');
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [loginMethod, setLoginMethod] = useState<'phone' | 'email'>('phone');
  const [loginStep, setLoginStep] = useState<'input' | 'code'>('input');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(() => {
    return isTokenExpired ? null : localStorage.getItem('banter_verified_email');
  });

  // Channel management state
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [showChannelPicker, setShowChannelPicker] = useState(false);
  const [currentChannel, setCurrentChannel] = useState<{ id: string; number: number; name: string } | null>(null);
  const [newChannelNumber, setNewChannelNumber] = useState(1);
  const [newChannelName, setNewChannelName] = useState('');
  const [allCallActive, setAllCallActive] = useState(false);
  const [chirpEnabled, setChirpEnabled] = useState(true);
  const chirpEnabledRef = useRef(true);
  const [muteAllActive, setMuteAllActive] = useState(false);
  const [muteAllLoading, setMuteAllLoading] = useState(false);
  const [allCallLoading, setAllCallLoading] = useState(false);
  const [awayUsers, setAwayUsers] = useState<Set<string>>(new Set());

  const [talkLocked, setTalkLocked] = useState(false);

  const [activeTab, setActiveTab] = useState<'radio' | 'chat'>('radio');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const activeTabRef = useRef<'radio' | 'chat'>('radio');
  useEffect(() => {
    activeTabRef.current = activeTab;
    if (activeTab === 'chat') setUnreadCount(0);
  }, [activeTab]);

  // Broadcast state
  const [broadcastActive, setBroadcastActive] = useState(false);
  const [broadcastSpeakerId, setBroadcastSpeakerId] = useState<string | null>(null);
  const [broadcastGrantedSpeakers, setBroadcastGrantedSpeakers] = useState<string[]>([]);
  const [raisedHands, setRaisedHands] = useState<string[]>([]);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [handRaised, setHandRaised] = useState(false);

  // Alert crew state
  const [showAlertCrewConfirm, setShowAlertCrewConfirm] = useState(false);
  const [alertCrewLoading, setAlertCrewLoading] = useState(false);

  // WebSocket connection for real-time updates
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
        ws.send(JSON.stringify({ type: 'join-banter', banterId: banterIdRef.current || null }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const myBanterId = banterIdRef.current;
          if (msg.type === 'speaking') {
            setSpeakingState(msg.data);
          } else if (msg.type === 'participant-event') {
            queryClient.invalidateQueries({ queryKey: ["/api/participants", banterIdRef.current] });
            if (msg.data?.event === 'leave' && msg.data?.identity) {
              setAwayUsers(prev => {
                if (!prev.has(msg.data.identity)) return prev;
                const next = new Set(prev);
                next.delete(msg.data.identity);
                return next;
              });
            }
          } else if (msg.type === 'all-call') {
            const msgBanterId = msg.banterId || null;
            if (msgBanterId === myBanterId) {
              setAllCallActive(msg.active);
            }
          } else if (msg.type === 'channel-switch') {
            const msgBanterId = msg.banterId || null;
            if (msgBanterId === myBanterId) {
              queryClient.invalidateQueries({ queryKey: ["/api/channels", myBanterId] });
            }
          } else if (msg.type === 'chat-message') {
            const msgBanterId = msg.message?.banterId || msg.banterId || null;
            if (msgBanterId === myBanterId && msg.message?.id) {
              setChatMessages(prev => {
                if (prev.some(m => m.id === msg.message.id)) return prev;
                return [...prev, msg.message];
              });
              if (activeTabRef.current !== 'chat') {
                setUnreadCount(c => c + 1);
              }
              setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            }
          } else if (msg.type === 'user-status') {
            const msgBanterId = msg.banterId || null;
            if (msgBanterId === myBanterId) {
              setAwayUsers(prev => {
                const next = new Set(prev);
                if (msg.status === 'away') {
                  next.add(msg.identity);
                } else {
                  next.delete(msg.identity);
                }
                return next;
              });
            }
          } else if (msg.type === 'away-users') {
            const msgBanterId = msg.banterId || null;
            if (msgBanterId === myBanterId) {
              setAwayUsers(new Set(msg.identities || []));
            }
          } else if (msg.type === 'mute-all') {
            const msgBanterId = msg.banterId || null;
            if (msgBanterId === myBanterId) {
              setMuteAllActive(msg.active);
            }
          } else if (msg.type === 'chirp-setting') {
            const msgBanterId = msg.banterId || null;
            if (msgBanterId === myBanterId) {
              setChirpEnabled(msg.enabled);
              chirpEnabledRef.current = msg.enabled;
            }
          } else if (msg.type === 'broadcast') {
            const msgBanterId = msg.banterId || null;
            if (msgBanterId === myBanterId) {
              setBroadcastActive(msg.active);
              setBroadcastSpeakerId(msg.speakerId || null);
              setBroadcastGrantedSpeakers(msg.grantedSpeakers || []);
              setRaisedHands(msg.raisedHands || []);
              if (!msg.active) {
                setHandRaised(false);
              }
            }
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
  }, [queryClient]);

  const { data: participantsData, isLoading: participantsLoading } = useQuery<ParticipantsData>({
    queryKey: ["/api/participants", currentBanterId],
    queryFn: async () => {
      const token = localStorage.getItem('banter_auth_token') || '';
      const params = currentBanterId ? `?banterId=${currentBanterId}` : '';
      const res = await fetch(`/api/participants${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch participants");
      return res.json();
    },
    refetchInterval: 3000,
  });

  const { data: expectedData, isLoading: expectedLoading } = useQuery<ExpectedParticipant[]>({
    queryKey: ["/api/expected", currentBanterId],
    queryFn: async () => {
      const token = localStorage.getItem('banter_auth_token') || '';
      const params = currentBanterId ? `?banterId=${currentBanterId}` : '';
      const res = await fetch(`/api/expected${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch expected");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: contactsData } = useQuery<{ id: string; name: string; phone: string; email?: string | null }[]>({
    queryKey: ["/api/contacts"],
    queryFn: async () => {
      const res = await fetch("/api/contacts");
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json();
    },
  });

  const { data: channelsData } = useQuery<Channel[]>({
    queryKey: ["/api/channels", currentBanterId],
    queryFn: async () => {
      const token = localStorage.getItem('banter_auth_token') || '';
      const params = currentBanterId ? `?banterId=${currentBanterId}` : '';
      const res = await fetch(`/api/channels${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch channels");
      return res.json();
    },
    refetchInterval: 5000,
  });

  // Enumerate audio devices
  const refreshAudioDevices = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        stream.getTracks().forEach(track => track.stop());
      });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      setAudioDevices(audioInputs);
      if (!selectedAudioDevice && audioInputs.length > 0) {
        setSelectedAudioDevice(audioInputs[0].deviceId);
      }
    } catch (err) {
      console.error('Failed to enumerate audio devices:', err);
    }
  }, [selectedAudioDevice]);

  useEffect(() => {
    refreshAudioDevices();

    const handleDeviceChange = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        setAudioDevices(audioInputs);

        const currentStillExists = audioInputs.some(d => d.deviceId === selectedAudioDevice);
        if (!currentStillExists && audioInputs.length > 0) {
          const defaultDevice = audioInputs[0].deviceId;
          setSelectedAudioDevice(defaultDevice);

          if (room?.localParticipant) {
            const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
            if (micPub?.track) {
              await room.localParticipant.setMicrophoneEnabled(false);
              await room.localParticipant.setMicrophoneEnabled(true, {
                deviceId: defaultDevice,
              });
            }
          }
        }
      } catch (err) {
        console.error('Failed to handle device change:', err);
      }
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [selectedAudioDevice, room]);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    if (showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showProfileMenu]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsDropdownRef.current && !settingsDropdownRef.current.contains(e.target as Node)) {
        setShowSettingsDropdown(false);
      }
    };
    if (showSettingsDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSettingsDropdown]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (micPickerRef.current && !micPickerRef.current.contains(e.target as Node)) {
        setShowMicPicker(false);
      }
    };
    if (showMicPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMicPicker]);
  
  useEffect(() => {
    if (showAudioSettings) {
      refreshAudioDevices();
    }
  }, [showAudioSettings, refreshAudioDevices]);

  // Auto-fill name from expected participants or contacts when phone matches
  useEffect(() => {
    if (verifiedPhone && !userName) {
      const normalizedVerified = verifiedPhone.replace(/\D/g, '');
      
      // First check expected participants
      if (expectedData) {
        const matchingParticipant = expectedData.find(p => {
          const normalizedExpected = p.phone.replace(/\D/g, '');
          return normalizedExpected === normalizedVerified || 
                 normalizedExpected.endsWith(normalizedVerified) ||
                 normalizedVerified.endsWith(normalizedExpected);
        });
        if (matchingParticipant) {
          setUserName(matchingParticipant.name);
          localStorage.setItem('banter_user_name', matchingParticipant.name);
          return;
        }
      }
      
      // Then check contacts
      if (contactsData) {
        const matchingContact = contactsData.find(c => {
          const normalizedContact = c.phone.replace(/\D/g, '');
          return normalizedContact === normalizedVerified || 
                 normalizedContact.endsWith(normalizedVerified) ||
                 normalizedVerified.endsWith(normalizedContact);
        });
        if (matchingContact) {
          setUserName(matchingContact.name);
          localStorage.setItem('banter_user_name', matchingContact.name);
        }
      }
    }
  }, [verifiedPhone, expectedData, contactsData, userName]);

  useEffect(() => {
    if (verifiedEmail && !userName) {
      const normalizedVerifiedEmail = verifiedEmail.toLowerCase().trim();
      
      if (expectedData) {
        const matchingParticipant = expectedData.find(p =>
          p.email && p.email.toLowerCase().trim() === normalizedVerifiedEmail
        );
        if (matchingParticipant) {
          setUserName(matchingParticipant.name);
          localStorage.setItem('banter_user_name', matchingParticipant.name);
          return;
        }
      }
      
      if (contactsData) {
        const matchingContact = contactsData.find(c =>
          c.email && c.email.toLowerCase().trim() === normalizedVerifiedEmail
        );
        if (matchingContact) {
          setUserName(matchingContact.name);
          localStorage.setItem('banter_user_name', matchingContact.name);
        }
      }
    }
  }, [verifiedEmail, expectedData, contactsData, userName]);

  // Track if we've already auto-connected this session
  const hasAutoConnected = useRef(false);

  // Connect to LiveKit room
  const connectToRoom = useCallback(async (overrideName?: string) => {
    try {
      setConnectionError(null);
      setConnectionState(ConnectionState.Connecting);

      let identity = 'WebUser';
      let displayName = (overrideName ?? userName).trim();
      
      if (displayName) {
        identity = displayName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
        localStorage.setItem('banter_user_name', displayName);
        if (authToken) {
          fetch('/api/user/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ authToken, name: displayName })
          }).catch(() => {});
        }
      } else if (verifiedPhone) {
        const normalizedVerified = verifiedPhone.replace(/\D/g, '');
        let found = false;
        
        if (expectedData) {
          const matchingParticipant = expectedData.find(p => {
            const normalizedExpected = p.phone.replace(/\D/g, '');
            return normalizedExpected === normalizedVerified || 
                   normalizedExpected.endsWith(normalizedVerified) ||
                   normalizedVerified.endsWith(normalizedExpected);
          });
          if (matchingParticipant) {
            identity = matchingParticipant.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
            displayName = matchingParticipant.name;
            found = true;
          }
        }
        
        if (!found && contactsData) {
          const matchingContact = contactsData.find(c => {
            const normalizedContact = c.phone.replace(/\D/g, '');
            return normalizedContact === normalizedVerified || 
                   normalizedContact.endsWith(normalizedVerified) ||
                   normalizedVerified.endsWith(normalizedContact);
          });
          if (matchingContact) {
            identity = matchingContact.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
            displayName = matchingContact.name;
            found = true;
          }
        }
        
        if (!found) {
          const randomDigits = Array.from({ length: 8 }, () => Math.floor(Math.random() * 8) + 2).join('');
          identity = `WebUser_${randomDigits}`;
          displayName = identity;
        }
      } else if (verifiedEmail) {
        const normalizedVerifiedEmail = verifiedEmail.toLowerCase().trim();
        let found = false;
        
        if (expectedData) {
          const matchingParticipant = expectedData.find(p =>
            p.email && p.email.toLowerCase().trim() === normalizedVerifiedEmail
          );
          if (matchingParticipant) {
            identity = matchingParticipant.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
            displayName = matchingParticipant.name;
            found = true;
          }
        }
        
        if (!found && contactsData) {
          const matchingContact = contactsData.find(c =>
            c.email && c.email.toLowerCase().trim() === normalizedVerifiedEmail
          );
          if (matchingContact) {
            identity = matchingContact.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
            displayName = matchingContact.name;
            found = true;
          }
        }
        
        if (!found) {
          const randomDigits = Array.from({ length: 8 }, () => Math.floor(Math.random() * 8) + 2).join('');
          identity = `WebUser_${randomDigits}`;
          displayName = identity;
        }
      } else {
        const randomDigits = Array.from({ length: 8 }, () => Math.floor(Math.random() * 8) + 2).join('');
        identity = `WebUser_${randomDigits}`;
        displayName = identity;
      }

      // Get LiveKit token from server (include auth token if available)
      const res = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          identity, 
          name: displayName || identity,
          authToken: authToken || undefined,
          banterId: currentBanterId || undefined,
          slug: slug || undefined
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get connection token');
      }

      const { token, url, identity: serverIdentity, channelNumber, roomName } = await res.json();
      
      // Use the server-returned identity for consistency
      const actualIdentity = serverIdentity || identity;
      
      // Track current channel if assigned
      if (channelNumber) {
        const assignedChannel = channelsData?.find(c => c.number === channelNumber);
        setCurrentChannel(assignedChannel ? { id: assignedChannel.id, number: assignedChannel.number, name: assignedChannel.name } : null);
      } else {
        setCurrentChannel(null);
      }

      // Create and connect to the room with audio-optimized settings
      const newRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
        // Optimized audio capture settings for voice
        audioCaptureDefaults: {
          echoCancellation,
          noiseSuppression,
          autoGainControl,
          deviceId: selectedAudioDevice || undefined,
          // Mono channel is optimal for voice (reduces bandwidth, no benefit from stereo for speech)
          channelCount: 1,
          // 48kHz sample rate for best Opus codec quality
          sampleRate: 48000,
          // Optimize for speech rather than music
          sampleSize: 16,
        },
        // Audio publish defaults for optimal voice quality
        publishDefaults: {
          // Custom audio preset: 32 kbps - recommended for walkie-talkie apps (don't go lower than 24kbps)
          audioPreset: { maxBitrate: 32000 },
          // Disable video publishing
          videoCodec: undefined,
          simulcast: false,
          // DTX (Discontinuous Transmission) saves bandwidth during silence
          dtx: true,
          // RED (Redundant Encoding) for better packet loss recovery
          red: true,
        },
      });

      // Set up event listeners
      newRoom.on(RoomEvent.ConnectionStateChanged, (state) => {
        setConnectionState(state);
        if (state === ConnectionState.Disconnected) {
          setRoom(null);
          setLocalIdentity(null);
        }
      });

      newRoom.on(RoomEvent.ParticipantConnected, () => {
        queryClient.invalidateQueries({ queryKey: ["/api/participants", currentBanterId] });
      });

      newRoom.on(RoomEvent.ParticipantDisconnected, () => {
        queryClient.invalidateQueries({ queryKey: ["/api/participants", currentBanterId] });
      });

      // Helper to attach audio track
      const attachAudioTrack = (track: any, participant: any) => {
        if (track.kind === Track.Kind.Audio) {
          const key = `${participant.identity}-${track.sid}`;
          // Remove existing element if any
          const existing = audioElementsRef.current.get(key);
          if (existing) {
            existing.remove();
          }
          const audioElement = track.attach();
          audioElement.id = `audio-${key}`;
          document.body.appendChild(audioElement);
          audioElementsRef.current.set(key, audioElement);
        }
      };

      // Handle remote audio tracks - attach them for playback
      newRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        attachAudioTrack(track, participant);
      });

      // Clean up audio elements when tracks are unsubscribed
      newRoom.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const key = `${participant.identity}-${track.sid}`;
          const audioElement = audioElementsRef.current.get(key);
          if (audioElement) {
            track.detach(audioElement);
            audioElement.remove();
            audioElementsRef.current.delete(key);
          }
        }
      });
      
      // Clean up all audio elements on disconnect
      newRoom.on(RoomEvent.Disconnected, () => {
        audioElementsRef.current.forEach((el, key) => {
          el.remove();
        });
        audioElementsRef.current.clear();
      });

      newRoom.on(RoomEvent.DataReceived, (payload, participant) => {
        if (!participant) return;
        try {
          const decoder = new TextDecoder();
          const data = JSON.parse(decoder.decode(payload));
          if (data.type === 'chirp' && chirpAudioRef.current && chirpEnabledRef.current) {
            const audio = chirpAudioRef.current.cloneNode() as HTMLAudioElement;
            audio.volume = 0.5;
            audio.currentTime = 0;
            audio.play().catch(() => {});
          }
        } catch {}
      });

      newRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const activeSpeakers = new Set(speakers.map(s => s.identity));
        setSpeakingState(prev => {
          const next: Record<string, boolean> = {};
          for (const key of Object.keys(prev)) {
            next[key] = activeSpeakers.has(key);
          }
          activeSpeakers.forEach(id => { next[id] = true; });
          return next;
        });
        
        // Broadcast to server for other clients using actual LiveKit identity
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'speaking-update',
            identity: actualIdentity,
            speaking: speakers.some(s => s.identity === actualIdentity)
          }));
        }
      });

      await newRoom.connect(url, token);
      setRoom(newRoom);
      // Use the actual LiveKit identity (from room.localParticipant or server response)
      setLocalIdentity(newRoom.localParticipant?.identity || actualIdentity);

      // Attach any already-subscribed audio tracks from participants who joined before us
      newRoom.remoteParticipants.forEach((participant) => {
        participant.audioTrackPublications.forEach((publication) => {
          if (publication.track && publication.isSubscribed) {
            attachAudioTrack(publication.track, participant);
          }
        });
      });

      // First enable microphone to create the audio track and get permission
      // Then immediately mute it (this ensures the track exists for later unmuting)
      try {
        await newRoom.localParticipant.setMicrophoneEnabled(true);
        await new Promise(resolve => setTimeout(resolve, 100));
        const currentTalkMode = localStorage.getItem('banter_talk_mode') as TalkMode || 'ptt';
        if (currentTalkMode === 'always') {
          setIsMuted(false);
        } else {
          await newRoom.localParticipant.setMicrophoneEnabled(false);
          setIsMuted(true);
        }
      } catch (micError) {
        console.error('Failed to initialize microphone:', micError);
        setIsMuted(true);
      }

      queryClient.invalidateQueries({ queryKey: ["/api/participants", currentBanterId] });

      if ('wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          wakeLockRef.current?.addEventListener('release', () => {
            wakeLockRef.current = null;
          });
        } catch (e) {}
      }
      
    } catch (error: any) {
      console.error('Failed to connect to room:', error);
      setConnectionError(error.message || 'Connection failed');
      setConnectionState(ConnectionState.Disconnected);
    }
  }, [userName, verifiedPhone, verifiedEmail, expectedData, contactsData, channelsData, echoCancellation, noiseSuppression, autoGainControl, selectedAudioDevice, queryClient, authToken, currentBanterId, slug]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        if (room && connectionState === ConnectionState.Connected && !wakeLockRef.current && 'wakeLock' in navigator) {
          try {
            wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
            wakeLockRef.current?.addEventListener('release', () => {
              wakeLockRef.current = null;
            });
          } catch (e) {}
        }
        if (localIdentity && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'status-update', identity: localIdentity, status: 'active' }));
        }
      } else if (document.visibilityState === 'hidden') {
        if (localIdentity && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'status-update', identity: localIdentity, status: 'away' }));
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [room, connectionState, localIdentity]);

  // Auto-connect when authenticated and name is known
  useEffect(() => {
    if (
      (verifiedPhone || verifiedEmail) && 
      authToken && 
      userName && 
      connectionState === ConnectionState.Disconnected && 
      !hasAutoConnected.current &&
      !connectionError
    ) {
      hasAutoConnected.current = true;
      const timer = setTimeout(() => {
        connectToRoom();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [verifiedPhone, verifiedEmail, authToken, userName, connectionState, connectionError, connectToRoom]);

  // Disconnect from room
  const disconnectFromRoom = useCallback(async () => {
    if (room) {
      setRemoteAudioMuted(false);
      setIsTalking(false);
      isHoldMutedRef.current = false;
      setIsHoldMuted(false);
      await room.disconnect();
      setRoom(null);
      setLocalIdentity(null);
      setConnectionState(ConnectionState.Disconnected);
      queryClient.invalidateQueries({ queryKey: ["/api/participants", currentBanterId] });
      if (wakeLockRef.current) {
        try { await wakeLockRef.current.release(); } catch (e) {}
        wakeLockRef.current = null;
      }
    }
  }, [room, queryClient, setRemoteAudioMuted, currentBanterId]);

  // Toggle mute
  const toggleMute = useCallback(async () => {
    if (room?.localParticipant) {
      const newMuted = !isMuted;
      await room.localParticipant.setMicrophoneEnabled(!newMuted);
      setIsMuted(newMuted);
    }
  }, [room, isMuted]);

  // PTT handlers with half-duplex logic
  const broadcastChirp = useCallback((action: 'start' | 'end') => {
    if (!room?.localParticipant) return;
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({ type: 'chirp', action }));
      room.localParticipant.publishData(data, { reliable: false });
    } catch {}
  }, [room]);

  const startTalking = useCallback(async () => {
    if (isTalking || !room?.localParticipant) return;
    
    setIsTalking(true);
    setIsMuted(false);
    
    setRemoteAudioMuted(true);
    
    if (chirpEnabled) {
      broadcastChirp('start');
    }
    await room.localParticipant.setMicrophoneEnabled(true);
  }, [room, isTalking, setRemoteAudioMuted, broadcastChirp, chirpEnabled]);

  const stopTalking = useCallback(async () => {
    if (!isTalking || !room?.localParticipant || talkMode !== 'ptt') return;
    
    setIsTalking(false);
    
    await room.localParticipant.setMicrophoneEnabled(false);
    setIsMuted(true);
    
    if (chirpEnabled) {
      broadcastChirp('end');
    }
    
    setTimeout(() => {
      setRemoteAudioMuted(false);
    }, 150);
  }, [room, isTalking, talkMode, setRemoteAudioMuted, playChirp, broadcastChirp, chirpEnabled]);

  // Change talk mode
  const changeTalkMode = useCallback(async (mode: TalkMode) => {
    setTalkMode(mode);
    localStorage.setItem('banter_talk_mode', mode);
    isHoldMutedRef.current = false;
    setIsHoldMuted(false);
    alwaysOnLastTapRef.current = 0;
    alwaysOnDoubleTapRef.current = false;
    
    if (mode === 'always' && room?.localParticipant) {
      await room.localParticipant.setMicrophoneEnabled(true);
      setIsMuted(false);
    } else if ((mode === 'ptt' || mode === 'auto') && room?.localParticipant) {
      await room.localParticipant.setMicrophoneEnabled(false);
      setIsMuted(true);
      setIsTalking(false);
      setRemoteAudioMuted(false);
    }
  }, [room, setRemoteAudioMuted]);

  const startHoldMute = useCallback(async () => {
    if (talkMode !== 'always' || !room?.localParticipant) return;
    isHoldMutedRef.current = true;
    setIsHoldMuted(true);
    await room.localParticipant.setMicrophoneEnabled(false);
    setIsMuted(true);
  }, [room, talkMode]);

  const stopHoldMute = useCallback(async () => {
    if (!isHoldMutedRef.current || talkMode !== 'always' || !room?.localParticipant) return;
    isHoldMutedRef.current = false;
    setIsHoldMuted(false);
    await room.localParticipant.setMicrophoneEnabled(true);
    setIsMuted(false);
  }, [room, talkMode]);

  // Change audio device
  const changeAudioDevice = useCallback(async (deviceId: string) => {
    setSelectedAudioDevice(deviceId);
    if (room?.localParticipant) {
      try {
        await room.localParticipant.setMicrophoneEnabled(false);
        await room.switchActiveDevice('audioinput', deviceId);
        if (!isMuted) {
          await room.localParticipant.setMicrophoneEnabled(true);
        }
      } catch (err) {
        console.error('Failed to change audio device:', err);
      }
    }
  }, [room, isMuted]);

  const updateAudioProcessing = useCallback(async (settings: {
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
  }) => {
    const newEcho = settings.echoCancellation ?? echoCancellation;
    const newNoise = settings.noiseSuppression ?? noiseSuppression;
    const newGain = settings.autoGainControl ?? autoGainControl;

    if (settings.echoCancellation !== undefined) {
      setEchoCancellation(settings.echoCancellation);
      localStorage.setItem('banter_echo_cancellation', String(settings.echoCancellation));
    }
    if (settings.noiseSuppression !== undefined) {
      setNoiseSuppression(settings.noiseSuppression);
      localStorage.setItem('banter_noise_suppression', String(settings.noiseSuppression));
    }
    if (settings.autoGainControl !== undefined) {
      setAutoGainControl(settings.autoGainControl);
      localStorage.setItem('banter_auto_gain_control', String(settings.autoGainControl));
    }

    if (room && room.localParticipant) {
      try {
        const micPub = room.localParticipant.getTrackPublication('microphone' as any);
        if (micPub?.track) {
          const track = micPub.track as any;
          if (track.mediaStreamTrack) {
            await track.mediaStreamTrack.applyConstraints({
              echoCancellation: newEcho,
              noiseSuppression: newNoise,
              autoGainControl: newGain,
            });
          }
        }
      } catch (e) {
        console.warn('Could not apply audio constraints live, will take effect on next connect');
      }
    }
  }, [room, echoCancellation, noiseSuppression, autoGainControl]);

  // Check admin status when auth token changes
  useEffect(() => {
    if (!authToken) {
      setIsAdmin(false);
      return;
    }
    
    fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authToken }),
    })
      .then(res => res.json())
      .then(data => {
        setIsAdmin(data.isAdmin === true);
      })
      .catch(() => {
        setIsAdmin(false);
      });
  }, [authToken]);

  const toggleParticipantMute = useMutation({
    mutationFn: async ({ identity, muted }: { identity: string; muted: boolean }) => {
      const res = await fetch("/api/admin/mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, identity, muted, banterId: currentBanterId || undefined }),
      });
      if (!res.ok) throw new Error("Failed to mute");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/participants", currentBanterId] });
    },
    onError: () => {
      toast({ title: "Failed to change mute status", description: "Please try again.", variant: "destructive" });
    },
  });

  const kickParticipant = useMutation({
    mutationFn: async (identity: string) => {
      const res = await fetch("/api/admin/kick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, identity, banterId: currentBanterId || undefined }),
      });
      if (!res.ok) throw new Error("Failed to kick");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/participants", currentBanterId] });
      toast({ title: "Participant removed from call" });
    },
    onError: () => {
      toast({ title: "Failed to remove participant", description: "Please try again.", variant: "destructive" });
    },
  });

  const removeExpected = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/expected/${id}`, { 
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken }),
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

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const res = await fetch(`/api/expected/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, role }),
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

  // Channel mutations
  const createChannel = useMutation({
    mutationFn: async ({ number, name }: { number: number; name: string }) => {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, number, name, banterId: currentBanterId || undefined }),
      });
      if (!res.ok) throw new Error("Failed to create channel");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ title: "Channel created" });
      setNewChannelNumber(n => n + 1);
      setNewChannelName('');
    },
    onError: () => {
      toast({ title: "Failed to create channel", description: "Please try again.", variant: "destructive" });
    },
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/channels/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken }),
      });
      if (!res.ok) throw new Error("Failed to delete channel");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ title: "Channel deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete channel", description: "Please try again.", variant: "destructive" });
    },
  });

  const assignToChannel = useMutation({
    mutationFn: async ({ channelId, participantIdentity }: { channelId: string; participantIdentity: string }) => {
      const res = await fetch(`/api/channels/${channelId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, participantIdentity, banterId: currentBanterId || undefined }),
      });
      if (!res.ok) throw new Error("Failed to assign to channel");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ title: "Participant assigned to channel" });
    },
    onError: () => {
      toast({ title: "Failed to assign participant", description: "Please try again.", variant: "destructive" });
    },
  });

  const unassignFromChannel = useMutation({
    mutationFn: async (participantIdentity: string) => {
      const res = await fetch("/api/channels/unassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, participantIdentity, banterId: currentBanterId || undefined }),
      });
      if (!res.ok) throw new Error("Failed to unassign from channel");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ title: "Participant removed from channel" });
    },
    onError: () => {
      toast({ title: "Failed to remove from channel", description: "Please try again.", variant: "destructive" });
    },
  });

  const switchChannel = useCallback(async (channelId: string | null) => {
    if (!authToken || !room) return;
    const identity = room.localParticipant?.identity;
    if (!identity) return;

    try {
      const res = await fetch('/api/channels/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken, channelId, identity, banterId: currentBanterId || undefined }),
      });
      if (!res.ok) throw new Error('Failed to switch channel');
      const data = await res.json();
      setCurrentChannel(data.channel ? { id: data.channel.id, number: data.channel.number, name: data.channel.name } : null);
      setShowChannelPicker(false);
      
      room.disconnect();
      setConnectionState(ConnectionState.Disconnected);
      setTimeout(() => connectToRoom(), 500);
      toast({ title: data.channel ? `Switched to ${data.channel.name}` : 'Switched to Main' });
    } catch {
      toast({ title: 'Failed to switch channel', variant: 'destructive' });
    }
  }, [authToken, room, connectToRoom, toast, currentBanterId]);

  const toggleAllCall = useCallback(async () => {
    if (!authToken) return;
    setAllCallLoading(true);
    try {
      const newState = !allCallActive;
      const res = await fetch('/api/channels/all-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken, active: newState, banterId: currentBanterId || undefined }),
      });
      if (!res.ok) throw new Error('Failed to toggle all-call');
      toast({ title: newState ? 'All-Call ACTIVATED' : 'All-Call ended' });
    } catch {
      toast({ title: 'Failed to toggle all-call', variant: 'destructive' });
    } finally {
      setAllCallLoading(false);
    }
  }, [authToken, allCallActive, toast, currentBanterId]);


  const toggleTalkLock = useCallback(() => {
    if (talkLocked) {
      setTalkLocked(false);
      changeTalkMode('ptt');
      stopTalking();
      if (room?.localParticipant) {
        room.localParticipant.setMicrophoneEnabled(false);
      }
      setIsMuted(true);
      setIsTalking(false);
    } else {
      setTalkLocked(true);
      startTalking();
      changeTalkMode('always');
    }
  }, [talkLocked, changeTalkMode, startTalking, stopTalking, room]);

  const loadChatMessages = useCallback(async () => {
    if (!authToken) return;
    try {
      const params = new URLSearchParams({ authToken, limit: '50' });
      if (currentBanterId) params.set('banterId', currentBanterId);
      const res = await fetch(`/api/messages?${params}`);
      if (res.ok) {
        const msgs = await res.json();
        setChatMessages(msgs);
        setHasMoreMessages(msgs.length >= 50);
        setTimeout(() => chatEndRef.current?.scrollIntoView(), 100);
      }
    } catch {}
  }, [authToken, currentBanterId]);

  useEffect(() => {
    if (authToken) loadChatMessages();
  }, [authToken, currentBanterId, loadChatMessages]);

  const sendChatMessage = useCallback(async () => {
    if (!authToken || !chatInput.trim() || chatSending) return;
    setChatSending(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken, content: chatInput.trim(), banterId: currentBanterId || undefined }),
      });
      if (res.ok) {
        setChatInput('');
      }
    } catch {}
    setChatSending(false);
  }, [authToken, chatInput, chatSending, currentBanterId]);

  const loadMoreMessages = useCallback(async () => {
    if (!authToken || loadingMore || !hasMoreMessages || chatMessages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = chatMessages[0];
      const params = new URLSearchParams({ authToken, limit: '50', before: oldest.id });
      if (currentBanterId) params.set('banterId', currentBanterId);
      const res = await fetch(`/api/messages?${params}`);
      if (res.ok) {
        const older = await res.json();
        setHasMoreMessages(older.length >= 50);
        setChatMessages(prev => [...older, ...prev]);
      }
    } catch {}
    setLoadingMore(false);
  }, [authToken, loadingMore, hasMoreMessages, chatMessages, currentBanterId]);

  const toggleMuteAll = useCallback(async () => {
    if (muteAllLoading) return;
    setMuteAllLoading(true);
    try {
      const newState = !muteAllActive;
      const res = await fetch('/api/admin/mute-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken, muted: newState, banterId: currentBanterId || undefined }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      toast({ title: 'Failed to mute all', variant: 'destructive' });
    } finally {
      setMuteAllLoading(false);
    }
  }, [authToken, muteAllActive, muteAllLoading, toast, currentBanterId]);

  // When all-call changes from WS, reconnect to the correct room
  const prevAllCallRef = useRef(allCallActive);
  useEffect(() => {
    if (prevAllCallRef.current !== allCallActive && connectionState === ConnectionState.Connected && room) {
      prevAllCallRef.current = allCallActive;
      room.disconnect();
      setConnectionState(ConnectionState.Disconnected);
      setTimeout(() => connectToRoom(), 500);
    }
    prevAllCallRef.current = allCallActive;
  }, [allCallActive, connectionState, room, connectToRoom]);

  // When broadcast changes from WS, reconnect to the correct room
  const prevBroadcastRef = useRef(broadcastActive);
  const prevGrantedRef = useRef<string[]>([]);
  useEffect(() => {
    const wasGranted = localIdentity ? prevGrantedRef.current.includes(localIdentity) : false;
    const nowGranted = localIdentity ? broadcastGrantedSpeakers.includes(localIdentity) : false;
    const broadcastChanged = prevBroadcastRef.current !== broadcastActive;
    const grantChanged = wasGranted !== nowGranted;

    if ((broadcastChanged || grantChanged) && connectionState === ConnectionState.Connected && room) {
      prevBroadcastRef.current = broadcastActive;
      prevGrantedRef.current = broadcastGrantedSpeakers;
      room.disconnect();
      setConnectionState(ConnectionState.Disconnected);
      setTimeout(() => connectToRoom(), 500);
    }
    prevBroadcastRef.current = broadcastActive;
    prevGrantedRef.current = broadcastGrantedSpeakers;
  }, [broadcastActive, broadcastGrantedSpeakers, connectionState, room, connectToRoom, localIdentity]);

  const toggleBroadcast = useCallback(async () => {
    if (!authToken) return;
    setBroadcastLoading(true);
    try {
      const newState = !broadcastActive;
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken, active: newState, banterId: currentBanterId || undefined }),
      });
      if (!res.ok) throw new Error('Failed to toggle broadcast');
      toast({ title: newState ? 'Broadcast STARTED' : 'Broadcast ended' });
    } catch {
      toast({ title: 'Failed to toggle broadcast', variant: 'destructive' });
    } finally {
      setBroadcastLoading(false);
    }
  }, [authToken, broadcastActive, toast, currentBanterId]);

  const toggleRaiseHand = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!localIdentity) return;
    const newState = !handRaised;
    setHandRaised(newState);
    wsRef.current.send(JSON.stringify({
      type: newState ? 'raise-hand' : 'lower-hand',
      identity: localIdentity,
      banterId: currentBanterId || undefined,
    }));
  }, [localIdentity, handRaised, currentBanterId]);

  const grantSpeaker = useCallback(async (identity: string, grant: boolean) => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/broadcast/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken, identity, grant, banterId: currentBanterId || undefined }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: grant ? `Granted mic to ${identity}` : `Revoked mic from ${identity}` });
    } catch {
      toast({ title: 'Failed to update permission', variant: 'destructive' });
    }
  }, [authToken, toast, currentBanterId]);

  const isBroadcaster = useMemo(() => {
    return broadcastActive && localIdentity === broadcastSpeakerId;
  }, [broadcastActive, broadcastSpeakerId, localIdentity]);

  const canSpeakInBroadcast = useMemo(() => {
    return broadcastActive && localIdentity !== null && (localIdentity === broadcastSpeakerId || broadcastGrantedSpeakers.includes(localIdentity));
  }, [broadcastActive, broadcastSpeakerId, broadcastGrantedSpeakers, localIdentity]);

  // Dropdown handling
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  const calculateDropdownPosition = useCallback((buttonElement: HTMLElement) => {
    const rect = buttonElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const dropdownWidth = 180;
    
    let left = rect.right - dropdownWidth;
    if (left < 8) left = 8;
    if (left + dropdownWidth > viewportWidth - 8) left = viewportWidth - dropdownWidth - 8;
    
    const spaceBelow = viewportHeight - rect.bottom;
    const top = spaceBelow > 200 ? rect.bottom + 4 : rect.top - 200;
    
    setDropdownStyle({
      position: 'fixed',
      top: `${Math.max(8, top)}px`,
      left: `${left}px`,
      maxHeight: '280px',
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdown && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdown]);

  // Add expected participant
  const [showAddExpectedModal, setShowAddExpectedModal] = useState(false);
  const [newExpectedName, setNewExpectedName] = useState("");
  const [newExpectedPhone, setNewExpectedPhone] = useState("");
  const [newExpectedEmail, setNewExpectedEmail] = useState("");
  const [addParticipantSearch, setAddParticipantSearch] = useState("");
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: allUsersData } = useQuery<{ id: number; name: string; phone: string | null; email: string | null }[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const token = localStorage.getItem('banter_auth_token') || '';
      const res = await fetch("/api/users", {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showAddExpectedModal && isAdmin,
  });

  const { data: groupsData } = useQuery<{ id: string; name: string; memberIds: string[] }[]>({
    queryKey: ["/api/groups"],
    queryFn: async () => {
      const token = localStorage.getItem('banter_auth_token') || '';
      const res = await fetch("/api/groups", {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showAddExpectedModal && isAdmin,
  });

  const addGroupToBanter = useMutation({
    mutationFn: async (groupId: string) => {
      const res = await fetch("/api/expected/add-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, groupId, banterId: currentBanterId || undefined }),
      });
      if (!res.ok) throw new Error("Failed to add group");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/expected"] });
      toast({ title: `${data.added} participant${data.added !== 1 ? 's' : ''} added` });
    },
    onError: () => {
      toast({ title: "Failed to add group", variant: "destructive" });
    },
  });

  const addExpectedByUser = useMutation({
    mutationFn: async (user: { name: string; phone: string | null; email: string | null }) => {
      const res = await fetch("/api/expected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, name: user.name, phone: user.phone || '', email: user.email, banterId: currentBanterId || undefined }),
      });
      if (!res.ok) throw new Error("Failed to add");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expected"] });
      toast({ title: "Participant added" });
    },
    onError: () => {
      toast({ title: "Failed to add participant", variant: "destructive" });
    },
  });

  const addExpected = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/expected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, name: newExpectedName, phone: newExpectedPhone || undefined, email: newExpectedEmail || undefined, banterId: currentBanterId || undefined }),
      });
      if (!res.ok) throw new Error("Failed to add");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expected"] });
      setShowManualAdd(false);
      setNewExpectedName("");
      setNewExpectedPhone("");
      setNewExpectedEmail("");
      toast({ title: "Participant added" });
    },
    onError: () => {
      toast({ title: "Failed to add participant", variant: "destructive" });
    },
  });

  const handleAlertCrew = async () => {
    setAlertCrewLoading(true);
    try {
      const res = await fetch('/api/alert-crew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken, banterId: currentBanterId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || 'Failed to send alert', variant: 'destructive' });
      } else {
        toast({ title: `Alert sent to ${data.sent} of ${data.total} crew members` });
      }
    } catch {
      toast({ title: 'Failed to send crew alert', variant: 'destructive' });
    } finally {
      setAlertCrewLoading(false);
      setShowAlertCrewConfirm(false);
    }
  };

  const [actionDrawerParticipant, setActionDrawerParticipant] = useState<{
    identity?: string;
    name: string;
    muted?: boolean;
    isConnected: boolean;
    expectedId?: string;
    phone?: string;
    email?: string | null;
  } | null>(null);
  const [remindLoading, setRemindLoading] = useState(false);

  const handleRemindParticipant = async () => {
    if (!actionDrawerParticipant?.expectedId) return;
    setRemindLoading(true);
    try {
      const res = await fetch('/api/alert-crew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken, participantIds: [actionDrawerParticipant.expectedId], banterId: currentBanterId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || 'Failed to send reminder', variant: 'destructive' });
      } else {
        toast({ title: `Reminder sent to ${actionDrawerParticipant.name}` });
      }
    } catch {
      toast({ title: 'Failed to send reminder', variant: 'destructive' });
    } finally {
      setRemindLoading(false);
      setActionDrawerParticipant(null);
    }
  };

  // Profile drawer
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<ExpectedParticipant | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const updateExpected = useMutation({
    mutationFn: async () => {
      if (!editingParticipant) return;
      const res = await fetch(`/api/expected/${editingParticipant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, name: editName, phone: editPhone, email: editEmail || null }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expected"] });
      setShowProfileDrawer(false);
      setEditingParticipant(null);
    },
    onError: () => {
      toast({ title: "Failed to update profile", variant: "destructive" });
    },
  });

  const openProfileDrawer = (participant: ExpectedParticipant) => {
    setEditingParticipant(participant);
    setEditName(participant.name);
    setEditPhone(participant.phone);
    setEditEmail(participant.email || "");
    setShowProfileDrawer(true);
  };

  // Phone validation
  const phoneValidation = { valid: loginPhone.replace(/\D/g, '').length >= 10, error: null };
  const isPhoneValid = phoneValidation.valid;

  // Auth handlers
  const sendVerificationCode = async () => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      if (loginMethod === 'phone') {
        const res = await fetch('/api/auth/send-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: loginPhone })
        });
        if (!res.ok) throw new Error('Failed to send code');
      } else {
        const res = await fetch('/api/auth/send-email-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: loginEmail })
        });
        if (!res.ok) throw new Error('Failed to send code');
      }
      setLoginStep('code');
    } catch {
      setLoginError('Failed to send verification code');
    } finally {
      setLoginLoading(false);
    }
  };

  const verifyLoginCode = async (codeOverride?: string) => {
    const codeToVerify = codeOverride || loginCode;
    if (!codeToVerify || codeToVerify.length !== 6) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      if (loginMethod === 'phone') {
        if (!loginPhone) throw new Error('Phone number missing');
        const res = await fetch('/api/auth/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: loginPhone, code: codeToVerify })
        });
        if (!res.ok) throw new Error('Invalid code');
        const data = await res.json();
        setVerifiedPhone(data.phone);
        setAuthToken(data.authToken);
        localStorage.setItem('banter_verified_phone', data.phone);
        localStorage.setItem('banter_auth_token', data.authToken);
        setUserName(data.userName || '');
        if (data.userName) {
          localStorage.setItem('banter_user_name', data.userName);
        } else {
          localStorage.removeItem('banter_user_name');
        }
      } else {
        if (!loginEmail) throw new Error('Email missing');
        const res = await fetch('/api/auth/verify-email-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: loginEmail, code: codeToVerify })
        });
        if (!res.ok) throw new Error('Invalid code');
        const data = await res.json();
        setVerifiedEmail(data.email);
        setAuthToken(data.authToken);
        localStorage.setItem('banter_verified_email', data.email);
        localStorage.setItem('banter_auth_token', data.authToken);
        setUserName(data.userName || '');
        if (data.userName) {
          localStorage.setItem('banter_user_name', data.userName);
        } else {
          localStorage.removeItem('banter_user_name');
        }
      }
      setShowLoginModal(false);
      resetLoginModal();
    } catch {
      setLoginError('Invalid verification code');
    } finally {
      setLoginLoading(false);
    }
  };

  const resetLoginModal = () => {
    setLoginStep('input');
    setLoginPhone('');
    setLoginEmail('');
    setLoginCode('');
    setLoginError(null);
  };
  
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail);

  const handleLogout = () => {
    setVerifiedPhone(null);
    setVerifiedEmail(null);
    setAuthToken(null);
    localStorage.removeItem('banter_verified_phone');
    localStorage.removeItem('banter_verified_email');
    localStorage.removeItem('banter_auth_token');
    toast({ title: "Signed out" });
  };
  
  const isSignedIn = verifiedPhone || verifiedEmail;

  const handleConfirmDelete = () => {
    if (confirmDeleteId) {
      removeExpected.mutate(confirmDeleteId);
      setConfirmDeleteId(null);
    }
  };

  // Helpers
  const isMyParticipant = (identity: string): boolean => {
    return localIdentity === identity;
  };

  const roleOrder = { host: 0, participant: 1, listener: 2 };
  const realParticipants = participantsData?.participants || [];
  const conferenceActive = participantsData?.conferenceActive || false;
  const expectedParticipants = [...(expectedData || [])].sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

  const getParticipantRole = (identity: string): ExpectedParticipant['role'] | null => {
    const ep = expectedParticipants.find(e => {
      const normalizedName = e.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
      return normalizedName === identity || e.name === identity;
    });
    return ep?.role || null;
  };

  const isUserHost = (): boolean => {
    if (!localIdentity) return false;
    const role = getParticipantRole(localIdentity);
    return role === 'host';
  };

  const canShowControls = isAdmin || isUserHost();

  const formatMessageTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const isMyMessage = (msg: ChatMessage) => {
    return msg.senderIdentity === localIdentity;
  };

  const participants = [...realParticipants].sort((a, b) => {
    const roleA = getParticipantRole(a.identity) || 'participant';
    const roleB = getParticipantRole(b.identity) || 'participant';
    const roleDiff = roleOrder[roleA] - roleOrder[roleB];
    if (roleDiff !== 0) return roleDiff;
    return (a.joinedAt || 0) - (b.joinedAt || 0);
  });

  const hasActiveCall = conferenceActive || connectionState === ConnectionState.Connected;

  useEffect(() => {
    if (hasActiveCall && !callStartTime) {
      setCallStartTime(Date.now());
    } else if (!hasActiveCall) {
      setCallStartTime(null);
      setCallDuration(0);
    }
  }, [hasActiveCall, callStartTime]);

  useEffect(() => {
    if (!callStartTime) return;
    const interval = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - callStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [callStartTime]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (room) {
        room.disconnect();
      }
    };
  }, [room]);

  // Spacebar activates PTT (hold to talk) or toggles mute (auto mode)
  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      if (talkMode === 'ptt') {
        startTalking();
      } else if (talkMode === 'auto') {
        toggleMute();
      } else if (talkMode === 'always') {
        startHoldMute();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      if (talkMode === 'ptt') {
        stopTalking();
      } else if (talkMode === 'always') {
        stopHoldMute();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [connectionState, talkMode, startTalking, stopTalking, toggleMute, startHoldMute, stopHoldMute]);

  // Stable refs for hardware PTT callbacks (avoids effect re-runs on every render)
  const talkModeRef = useRef(talkMode);
  talkModeRef.current = talkMode;
  const startTalkingRef = useRef(startTalking);
  startTalkingRef.current = startTalking;
  const stopTalkingRef = useRef(stopTalking);
  stopTalkingRef.current = stopTalking;
  const toggleMuteRef = useRef(toggleMute);
  toggleMuteRef.current = toggleMute;
  const startHoldMuteRef = useRef(startHoldMute);
  startHoldMuteRef.current = startHoldMute;
  const stopHoldMuteRef = useRef(stopHoldMute);
  stopHoldMuteRef.current = stopHoldMute;
  const changeTalkModeRef = useRef(changeTalkMode);
  changeTalkModeRef.current = changeTalkMode;
  const refreshFlicButtonsRef = useRef(refreshFlicButtons);
  refreshFlicButtonsRef.current = refreshFlicButtons;

  // Hardware PTT via Capacitor plugin — only re-runs when connectionState changes
  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) return;
    let pttPressedHandle: any = null;
    let pttReleasedHandle: any = null;
    let flicDoubleClickHandle: any = null;
    let flicConnectionFailedHandle: any = null;
    let flicUnpairedHandle: any = null;
    let flicConnectedHandle: any = null;
    let flicDisconnectedHandle: any = null;
    let flicReadyHandle: any = null;
    let active = true;
    const setupHardwarePTT = async () => {
      try {
        const { PushToTalk } = await import('capacitor-pushtotalk');
        console.log('[Flic] Enabling hardware PTT');
        await PushToTalk.enableHardwarePTT();
        if (!active) return;
        pttPressedHandle = await PushToTalk.addListener('hardwarePTTPressed', () => {
          const mode = talkModeRef.current;
          console.log('[Flic] PTT PRESSED — talkMode:', mode);
          if (mode === 'ptt') startTalkingRef.current();
          else if (mode === 'auto') toggleMuteRef.current();
          else if (mode === 'always') startHoldMuteRef.current();
        });
        pttReleasedHandle = await PushToTalk.addListener('hardwarePTTReleased', () => {
          const mode = talkModeRef.current;
          console.log('[Flic] PTT RELEASED — talkMode:', mode);
          if (mode === 'ptt') stopTalkingRef.current();
          else if (mode === 'always') stopHoldMuteRef.current();
        });
        flicDoubleClickHandle = await PushToTalk.addListener('flicDoubleClick', () => {
          const mode = talkModeRef.current;
          console.log('[Flic] DOUBLE CLICK — talkMode:', mode, '→', mode === 'always' ? 'ptt' : 'always');
          if (mode === 'always') {
            changeTalkModeRef.current('ptt');
          } else {
            changeTalkModeRef.current('always');
          }
        });
        flicConnectionFailedHandle = await PushToTalk.addListener('flicConnectionFailed', (data: { uuid: string; error: string }) => {
          console.log('[Flic] CONNECTION FAILED:', data.uuid, data.error);
        });
        flicUnpairedHandle = await PushToTalk.addListener('flicUnpaired', (data: { uuid: string }) => {
          console.log('[Flic] UNPAIRED:', data.uuid);
          refreshFlicButtonsRef.current();
        });
        flicConnectedHandle = await PushToTalk.addListener('flicConnected', (data: { uuid: string; name: string }) => {
          console.log('[Flic] CONNECTED:', data.name, data.uuid);
          setFlicButtons(prev => prev.map(b => b.uuid === data.uuid ? { ...b, connectionState: 'connecting' } : b));
        });
        flicReadyHandle = await PushToTalk.addListener('flicReady', (data: { uuid: string; name: string }) => {
          console.log('[Flic] READY:', data.name, data.uuid);
          setFlicButtons(prev => prev.map(b => b.uuid === data.uuid ? { ...b, connectionState: 'connected' } : b));
        });
        flicDisconnectedHandle = await PushToTalk.addListener('flicDisconnected', (data: { uuid: string }) => {
          console.log('[Flic] DISCONNECTED:', data.uuid);
          setFlicButtons(prev => prev.map(b => b.uuid === data.uuid ? { ...b, connectionState: 'disconnected' } : b));
        });
        console.log('[Flic] Hardware PTT listeners registered');
      } catch (e) {
        console.log('[Flic] Hardware PTT setup failed (not on native?):', e);
      }
    };
    setupHardwarePTT();
    return () => {
      active = false;
      const cleanup = async () => {
        console.log('[Flic] Cleaning up hardware PTT listeners');
        try {
          if (pttPressedHandle) await pttPressedHandle.remove();
          if (pttReleasedHandle) await pttReleasedHandle.remove();
          if (flicDoubleClickHandle) await flicDoubleClickHandle.remove();
          if (flicConnectionFailedHandle) await flicConnectionFailedHandle.remove();
          if (flicUnpairedHandle) await flicUnpairedHandle.remove();
          if (flicConnectedHandle) await flicConnectedHandle.remove();
          if (flicDisconnectedHandle) await flicDisconnectedHandle.remove();
          if (flicReadyHandle) await flicReadyHandle.remove();
          const { PushToTalk } = await import('capacitor-pushtotalk');
          await PushToTalk.disableHardwarePTT();
        } catch {}
      };
      cleanup();
    };
  }, [connectionState]);

  // Audio interruption recovery (phone calls, Siri, alarms)
  useEffect(() => {
    if (connectionState !== ConnectionState.Connected || !room) return;
    let interruptedHandle: any = null;
    let resumedHandle: any = null;
    let active = true;

    const setupInterruptionHandling = async () => {
      try {
        const { PushToTalk } = await import('capacitor-pushtotalk');
        if (!active) return;

        interruptedHandle = await PushToTalk.addListener('audioInterrupted', () => {
          console.log('Banter: Audio interrupted — muting mic');
          if (room?.localParticipant) {
            room.localParticipant.setMicrophoneEnabled(false);
            setIsMuted(true);
          }
        });

        resumedHandle = await PushToTalk.addListener('audioResumed', async (data: { shouldResume: boolean }) => {
          console.log('Banter: Audio resumed, shouldResume:', data.shouldResume);
          if (!room) return;

          if (room.state === ConnectionState.Disconnected) {
            console.log('Banter: Reconnecting to room after interruption...');
            try {
              await room.connect(room.options?.url || '', '', { autoSubscribe: true });
            } catch (err) {
              console.error('Banter: Failed to reconnect after interruption:', err);
            }
          }

          if (talkMode === 'always' && room?.localParticipant && !isHoldMutedRef.current) {
            await room.localParticipant.setMicrophoneEnabled(true);
            setIsMuted(false);
          }
        });
      } catch {
        // Plugin not available
      }
    };

    setupInterruptionHandling();
    return () => {
      active = false;
      const cleanup = async () => {
        try {
          if (interruptedHandle) await interruptedHandle.remove();
          if (resumedHandle) await resumedHandle.remove();
        } catch {}
      };
      cleanup();
    };
  }, [connectionState, room, talkMode]);

  const isConnected = connectionState === ConnectionState.Connected;
  const isConnecting = connectionState === ConnectionState.Connecting;

  if (banterLoading) {
    return (
      <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-6 overflow-hidden">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
          <Radio className="w-8 h-8 text-emerald-400" />
        </div>
        <p className="text-slate-400" data-testid="text-loading">Loading banter...</p>
      </div>
    );
  }

  if (banterError) {
    return (
      <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-6 overflow-hidden">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
          <Radio className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-xl font-bold mb-2" data-testid="text-banter-error">Banter not found</h1>
        <p className="text-slate-400 mb-4">This link may be expired or invalid.</p>
        <Link href="/" className="text-emerald-400 underline" data-testid="link-home">Go to Home</Link>
      </div>
    );
  }

  // Require authentication to access /login
  if ((!verifiedPhone && !verifiedEmail) || !authToken) {
    return (
      <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-6 overflow-hidden">
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
              <Radio className="w-7 h-7 text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold mb-1">{banterInfo ? banterInfo.name : 'Banter'}</h1>
            <p className="text-slate-400 text-sm">{banterInfo ? 'Sign in to join this session' : 'Sign in to join'}</p>
          </div>

          {loginStep === 'input' ? (
            <div className="space-y-4">
              <div className="flex rounded-lg overflow-hidden mb-2">
                <button
                  onClick={() => setLoginMethod('phone')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${loginMethod === 'phone' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                >
                  Phone
                </button>
                <button
                  onClick={() => setLoginMethod('email')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${loginMethod === 'email' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                >
                  Email
                </button>
              </div>
              {loginMethod === 'phone' ? (
                <input
                  type="tel"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  placeholder="Phone number"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
                  data-testid="input-login-phone"
                />
              ) : (
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
                  data-testid="input-login-email"
                />
              )}
              {loginError && <p className="text-red-400 text-sm">{loginError}</p>}
              <button
                onClick={sendVerificationCode}
                disabled={loginLoading || (loginMethod === 'phone' ? !loginPhone : !isEmailValid)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 rounded-lg font-medium transition-colors"
                data-testid="button-send-code"
              >
                {loginLoading ? 'Sending...' : 'Send Code'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-400 text-center">
                Enter the 6-digit code sent to {loginMethod === 'phone' ? loginPhone : loginEmail}
              </p>
              <input
                type="text"
                value={loginCode}
                onChange={(e) => {
                  const code = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setLoginCode(code);
                  if (code.length === 6) {
                    setTimeout(() => verifyLoginCode(code), 100);
                  }
                }}
                placeholder="000000"
                maxLength={6}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500 text-center text-2xl tracking-widest"
                data-testid="input-login-code"
              />
              {loginError && <p className="text-red-400 text-sm text-center">{loginError}</p>}
              {loginLoading && <p className="text-emerald-400 text-sm text-center">Verifying...</p>}
              <button
                onClick={() => { setLoginStep('input'); setLoginCode(''); setLoginError(null); }}
                className="w-full py-2 text-slate-400 hover:text-white text-sm transition-colors"
                data-testid="button-back-to-input"
              >
                Use different {loginMethod === 'phone' ? 'number' : 'email'}
              </button>
            </div>
          )}

          <p className="text-xs text-slate-500 text-center">
            By continuing, you agree to receive verification {loginMethod === 'phone' ? 'SMS messages' : 'emails'}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-950 text-white flex flex-col overflow-hidden">
      <header className="relative flex items-end justify-between px-4 pb-3 pt-safe border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2">
        </div>
        <div className="absolute left-0 right-0 bottom-2 flex justify-center pointer-events-none">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <h1 className="font-semibold truncate" data-testid="text-banter-title">{banterInfo ? banterInfo.name : 'Banter'}</h1>
              {isConnected && currentChannel && (
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-medium rounded-full flex-shrink-0">
                  CH {currentChannel.number}
                </span>
              )}
            </div>
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-medium rounded-full mt-0.5">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                {broadcastActive
                  ? `BROADCAST • ${participantsData?.count || 0}`
                  : allCallActive 
                  ? `ALL CALL • ${participantsData?.count || 0}`
                  : participantsData?.count === 1
                  ? 'Just you'
                  : `${Math.max((participantsData?.count || 0) - 1, 0)} connected`}
              </span>
            ) : (
              <p className="text-xs text-slate-400">
                {conferenceActive ? `${participantsData?.count || 0} online` : 'Ready'}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {flicSupported !== false && (
            <button
              onClick={() => setShowFlicModal(true)}
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
                flicButtons.some(b => b.connectionState === 'connected')
                  ? 'bg-blue-500 text-white hover:bg-blue-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
              }`}
              data-testid="button-flic"
            >
              <Bluetooth className="w-5 h-5" />
            </button>
          )}
          <div className="relative" ref={settingsDropdownRef}>
            <button
              onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
              data-testid="button-settings-menu"
            >
              <Settings className="w-5 h-5" />
            </button>
            {showSettingsDropdown && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden z-50">
                {isSignedIn && (
                  <div className="px-4 py-3 border-b border-slate-700">
                    <p className="text-xs text-slate-400">Signed in as</p>
                    <p className="text-sm text-white truncate">{userName || verifiedPhone || verifiedEmail}</p>
                  </div>
                )}
                <button
                  onClick={() => { window.location.reload(); }}
                  className="w-full px-4 py-3 text-left text-sm text-white hover:bg-slate-700 transition-colors flex items-center gap-3"
                  data-testid="menu-refresh"
                >
                  <RefreshCw className="w-4 h-4 text-slate-400" />
                  Refresh
                </button>
                <button
                  onClick={() => { setShowAudioSettings(true); setShowSettingsDropdown(false); }}
                  className="w-full px-4 py-3 text-left text-sm text-white hover:bg-slate-700 transition-colors flex items-center gap-3"
                  data-testid="menu-audio-settings"
                >
                  <Mic className="w-4 h-4 text-slate-400" />
                  Audio Settings
                </button>
                {channelsData && channelsData.length > 0 && (canShowControls || currentChannel) && isConnected && (
                  <button
                    onClick={() => { canShowControls ? setShowChannelModal(true) : setShowChannelPicker(true); setShowSettingsDropdown(false); }}
                    className="w-full px-4 py-3 text-left text-sm text-white hover:bg-slate-700 transition-colors flex items-center gap-3"
                    data-testid="menu-channels"
                  >
                    <Radio className="w-4 h-4 text-amber-400" />
                    {canShowControls ? 'Manage Channels' : 'Switch Channel'}
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={async () => {
                      try {
                        await fetch('/api/chirp', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ authToken, enabled: !chirpEnabled, banterId: currentBanterId })
                        });
                      } catch {}
                    }}
                    className="w-full px-4 py-3 text-left text-sm text-white hover:bg-slate-700 transition-colors flex items-center gap-3"
                    data-testid="menu-toggle-chirp"
                  >
                    <Volume2 className="w-4 h-4 text-slate-400" />
                    PTT Chirp {chirpEnabled ? 'On' : 'Off'}
                  </button>
                )}
                {isAdmin && isConnected && (
                  <button
                    onClick={() => { setShowAlertCrewConfirm(true); setShowSettingsDropdown(false); }}
                    className="w-full px-4 py-3 text-left text-sm text-white hover:bg-slate-700 transition-colors flex items-center gap-3"
                    data-testid="menu-alert-crew"
                  >
                    <Bell className="w-4 h-4 text-amber-400" />
                    Notify Group
                  </button>
                )}
                {isSignedIn && (
                  <>
                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setShowSettingsDropdown(false)}
                        className="w-full px-4 py-3 text-left text-sm text-white hover:bg-slate-700 transition-colors flex items-center gap-3 border-t border-slate-700"
                        data-testid="menu-admin"
                      >
                        <Shield className="w-4 h-4 text-slate-400" />
                        Admin
                      </Link>
                    )}
                    <button
                      onClick={() => { 
                        setProfileName(userName);
                        setProfileEmail(localStorage.getItem('banter_user_email') || '');
                        setShowMyProfile(true); 
                        setShowSettingsDropdown(false); 
                      }}
                      className={`w-full px-4 py-3 text-left text-sm text-white hover:bg-slate-700 transition-colors flex items-center gap-3 ${!isAdmin ? 'border-t border-slate-700' : ''}`}
                      data-testid="button-my-profile"
                    >
                      <User className="w-4 h-4 text-slate-400" />
                      My Profile
                    </button>
                    <button
                      onClick={() => { handleLogout(); setShowSettingsDropdown(false); }}
                      className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-slate-700 transition-colors flex items-center gap-3 border-t border-slate-700"
                      data-testid="button-signout"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </>
                )}
                {!isSignedIn && (
                  <button
                    onClick={() => { setShowLoginModal(true); setShowSettingsDropdown(false); }}
                    className="w-full px-4 py-3 text-left text-sm text-emerald-400 hover:bg-slate-700 transition-colors flex items-center gap-3 border-t border-slate-700"
                    data-testid="menu-signin"
                  >
                    <User className="w-4 h-4" />
                    Sign in
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Radio tab / participant grid */}
        <div className={`${activeTab === 'radio' ? 'flex' : 'hidden'} sm:flex flex-col flex-1 overflow-auto px-4 pb-96`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-4">
          {isAdmin && (
            <button
              onClick={() => setShowAddExpectedModal(true)}
              className="flex flex-col items-center justify-center rounded-xl p-4 border-2 border-dashed border-slate-700 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-colors cursor-pointer min-h-[120px]"
              data-testid="button-add-participant-card"
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-emerald-500/20">
                <Plus className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="font-medium text-sm mt-2 text-emerald-400">Add</p>
            </button>
          )}
          {participants.map((p, i) => {
            const isSpeaking = speakingState[p.identity] || false;
            const role = getParticipantRole(p.identity);
            
            const getCardStyle = () => {
              if (isSpeaking) return 'bg-emerald-500/30 ring-2 ring-emerald-400/50';
              if (role === 'host') return 'bg-amber-500/20';
              if (role === 'participant') return 'bg-blue-500/20';
              return 'bg-slate-800/50';
            };
            
            const getAvatarStyle = () => {
              if (isSpeaking) return 'bg-emerald-400/40';
              if (role === 'host') return 'bg-amber-500/30';
              if (role === 'participant') return 'bg-blue-500/30';
              return 'bg-emerald-500/20';
            };
            
            const getTextColor = () => {
              if (isSpeaking) return 'text-emerald-400';
              if (role === 'host') return 'text-amber-400';
              if (role === 'participant') return 'text-blue-400';
              return 'text-emerald-400';
            };
            
            return (
              <div 
                key={p.identity} 
                className={`group relative flex flex-col items-center rounded-xl p-4 transition-colors duration-200 ${getCardStyle()} ${canShowControls && !isMyParticipant(p.identity) ? 'cursor-pointer active:scale-95' : ''}`}
                data-testid={`participant-${i}`}
                onClick={() => {
                  if (canShowControls && !isMyParticipant(p.identity)) {
                    const ep = expectedParticipants.find(e => {
                      const normalizedName = e.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
                      return normalizedName === p.identity || e.name === p.name;
                    });
                    setActionDrawerParticipant({
                      identity: p.identity,
                      name: p.name || p.identity,
                      muted: p.muted,
                      isConnected: true,
                      expectedId: ep?.id,
                      phone: ep?.phone,
                      email: ep?.email,
                    });
                  }
                }}
              >
                
                {/* Avatar */}
                <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-200 ${getAvatarStyle()} ${isSpeaking ? 'animate-pulse' : ''}`}>
                  <span className={`text-xl font-medium ${getTextColor()}`}>
                    {p.name ? p.name.charAt(0).toUpperCase() : '?'}
                  </span>
                </div>
                
                {/* Name */}
                <p className="font-medium text-sm mt-2 text-center truncate w-full">{p.name || p.identity}</p>
                
                {/* Badges */}
                <div className="flex items-center gap-1 mt-1 flex-wrap justify-center">
                  {isMyParticipant(p.identity) && (
                    <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">You</span>
                  )}
                  {role === 'host' && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">Host</span>
                  )}
                  {broadcastActive && p.identity === broadcastSpeakerId && (
                    <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">Broadcaster</span>
                  )}
                  {broadcastActive && broadcastGrantedSpeakers.includes(p.identity) && p.identity !== broadcastSpeakerId && (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">Mic Granted</span>
                  )}
                  {broadcastActive && raisedHands.includes(p.identity) && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <Hand className="w-2.5 h-2.5" /> Hand
                    </span>
                  )}
                </div>
                {/* Broadcast grant/revoke buttons for admin */}
                {broadcastActive && isAdmin && !isMyParticipant(p.identity) && p.identity !== broadcastSpeakerId && (
                  <div className="mt-1">
                    {broadcastGrantedSpeakers.includes(p.identity) ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); grantSpeaker(p.identity, false); }}
                        className="text-[10px] bg-red-500/20 text-red-400 hover:bg-red-500/30 px-2 py-0.5 rounded-full transition-colors"
                        data-testid={`button-revoke-mic-${i}`}
                      >
                        Revoke Mic
                      </button>
                    ) : raisedHands.includes(p.identity) ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); grantSpeaker(p.identity, true); }}
                        className="text-[10px] bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-2 py-0.5 rounded-full transition-colors animate-pulse"
                        data-testid={`button-grant-mic-${i}`}
                      >
                        Grant Mic
                      </button>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); grantSpeaker(p.identity, true); }}
                        className="text-[10px] bg-slate-600/50 text-slate-400 hover:bg-slate-600 px-2 py-0.5 rounded-full transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                        data-testid={`button-grant-mic-${i}`}
                      >
                        Grant Mic
                      </button>
                    )}
                  </div>
                )}
                
                {/* Status - only show for other participants */}
                {!isMyParticipant(p.identity) && (
                  <div className="mt-2">
                    {speakingState[p.identity] ? (
                      <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/20 rounded-full animate-pulse">
                        <Radio className="w-3 h-3 text-emerald-400" />
                        <span className="text-xs text-emerald-400">Speaking</span>
                      </div>
                    ) : !p.muted ? (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/20">
                        <Mic className="w-3 h-3 text-emerald-400" />
                        <span className="text-xs text-emerald-400">Live</span>
                      </div>
                    ) : awayUsers.has(p.identity) ? (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/20">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span className="text-xs text-amber-400">Away</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-600/50">
                        <MicOff className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-400">Standby</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          
          {expectedParticipants
            .filter(ep => {
              const normalizedName = ep.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
              return !participants.some(p => p.identity === normalizedName || p.name === ep.name);
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
                  className={`group relative flex flex-col items-center rounded-xl p-4 ${getExpectedCardStyle()} ${canShowControls ? 'cursor-pointer active:scale-95' : ''}`}
                  data-testid={`expected-${i}`}
                  onClick={() => {
                    if (canShowControls) {
                      setActionDrawerParticipant({
                        name: ep.name,
                        isConnected: false,
                        expectedId: ep.id,
                        phone: ep.phone,
                        email: ep.email,
                      });
                    }
                  }}
                >
                  {/* Avatar */}
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center ${getExpectedAvatarStyle()}`}>
                    <span className={`text-xl font-medium ${getExpectedTextColor()}`}>
                      {ep.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  
                  {/* Name */}
                  <p className={`font-medium text-sm mt-2 text-center truncate w-full ${getExpectedTextColor()}`}>{ep.name}</p>
                  
                  {/* Badges */}
                  <div className="flex items-center gap-1 mt-1">
                    {ep.role === 'host' && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">Host</span>
                    )}
                  </div>
                  
                  {/* Status */}
                  <div className="mt-2">
                    <div className="flex items-center gap-1 px-2 py-1 bg-slate-600/30 rounded-full">
                      <Bell className="w-3 h-3 text-slate-500" />
                      <span className="text-xs text-slate-500">Invited</span>
                    </div>
                  </div>
                </div>
              );
            })}
          
        </div>
        </div>

        {/* Chat panel - full screen on mobile, side panel on desktop */}
        <div className={`${activeTab === 'chat' ? 'flex' : 'hidden'} sm:flex flex-col sm:w-80 sm:border-l sm:border-slate-800 bg-slate-950 ${activeTab === 'chat' ? 'w-full' : ''}`}>
          <div className="hidden sm:flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <h3 className="font-semibold text-sm text-slate-300">Group Chat</h3>
            <span className="text-xs text-slate-500">{chatMessages.length} messages</span>
          </div>
          <div ref={chatContainerRef} className="flex-1 overflow-auto px-3 py-2 space-y-1" data-testid="chat-messages">
            {hasMoreMessages && chatMessages.length > 0 && (
              <button
                onClick={loadMoreMessages}
                disabled={loadingMore}
                className="w-full text-center py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                data-testid="button-load-more-messages"
              >
                {loadingMore ? 'Loading...' : 'Load earlier messages'}
              </button>
            )}
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <MessageSquare className="w-10 h-10 text-slate-700 mb-3" />
                <p className="text-slate-500 text-sm">No messages yet</p>
                <p className="text-slate-600 text-xs mt-1">Send a message to the group</p>
              </div>
            )}
            {chatMessages.map((msg, i) => {
              const mine = isMyMessage(msg);
              const showName = !mine && (i === 0 || chatMessages[i - 1].senderIdentity !== msg.senderIdentity);
              return (
                <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`} data-testid={`chat-message-${i}`}>
                  <div className={`max-w-[80%] ${mine ? 'items-end' : 'items-start'}`}>
                    {showName && (
                      <p className="text-[10px] text-slate-500 px-2 mb-0.5">{msg.senderName}</p>
                    )}
                    <div className={`px-3 py-1.5 rounded-2xl text-sm ${
                      mine 
                        ? 'bg-emerald-600 text-white rounded-br-md' 
                        : 'bg-slate-800 text-slate-200 rounded-bl-md'
                    }`}>
                      {msg.content}
                    </div>
                    <p className={`text-[10px] text-slate-600 px-2 mt-0.5 ${mine ? 'text-right' : ''}`}>
                      {formatMessageTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
          {authToken && (
            <div className={`px-3 pb-3 pt-2 border-t border-slate-800 ${activeTab === 'chat' ? 'pb-32' : ''} sm:pb-3`}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                  placeholder="Message..."
                  maxLength={1000}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-full px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  data-testid="input-chat-message"
                />
                <button
                  onClick={sendChatMessage}
                  disabled={chatSending || !chatInput.trim()}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white transition-colors flex-shrink-0"
                  data-testid="button-send-chat"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar - mobile only */}
      {authToken && (
        <div className="sm:hidden flex border-t border-slate-800 bg-slate-950">
          <button
            onClick={() => setActiveTab('radio')}
            className={`flex-1 flex flex-col items-center py-2 transition-colors ${
              activeTab === 'radio' ? 'text-emerald-400' : 'text-slate-500'
            }`}
            data-testid="tab-radio"
          >
            <Radio className="w-5 h-5" />
            <span className="text-[10px] mt-0.5 font-medium">Radio</span>
          </button>
          <button
            onClick={() => { setActiveTab('chat'); setUnreadCount(0); }}
            className={`flex-1 flex flex-col items-center py-2 transition-colors relative ${
              activeTab === 'chat' ? 'text-emerald-400' : 'text-slate-500'
            }`}
            data-testid="tab-chat"
          >
            <div className="relative">
              <MessageSquare className="w-5 h-5" />
              {unreadCount > 0 && activeTab !== 'chat' && (
                <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5 font-medium">Chat</span>
          </button>
        </div>
      )}

      {/* Bottom controls */}
      <div className={`fixed left-0 right-0 px-6 ${
        isConnected || isConnecting 
          ? 'bottom-0 bg-slate-950 pt-8 pb-safe' 
          : 'bottom-0 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 pb-safe sm:pb-0 bg-slate-950'
      }`}>
        <div className="flex flex-col gap-3 max-w-xs mx-auto">
          {isConnected ? (
            <div className="flex flex-col items-center gap-3">
              {isAdmin && (
                <div className="flex gap-3 w-full">
                  <button
                    onClick={toggleMuteAll}
                    disabled={muteAllLoading}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full font-medium transition-all text-sm ${
                      muteAllActive
                        ? 'bg-amber-500 hover:bg-amber-400 text-white animate-glow-pulse'
                        : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400'
                    }`}
                    data-testid="button-mute-all"
                  >
                    <VolumeX className={`w-4 h-4 ${muteAllActive ? 'text-white' : 'text-amber-400'}`} />
                    {muteAllActive ? 'Unmute All' : 'Mute All'}
                  </button>
                </div>
              )}
              <button
                onClick={() => setShowDisconnectConfirm(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-full font-medium transition-all text-sm bg-red-500/20 hover:bg-red-500/30 text-red-400"
                data-testid="button-end-call"
              >
                <LogOut className="w-4 h-4" />
                Leave
              </button>
              <div className="w-full">
                {broadcastActive && !canSpeakInBroadcast ? (
                  <button
                    onClick={toggleRaiseHand}
                    className={`w-full flex items-center justify-center gap-2 font-semibold py-4 px-6 rounded-full transition-all ${
                      handRaised
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                    data-testid="button-raise-hand"
                  >
                    <Hand className="w-5 h-5" />
                    {handRaised ? 'Hand Up' : 'Raise Hand'}
                  </button>
                ) : talkLocked ? (
                  <button
                    onClick={toggleTalkLock}
                    className="w-full flex items-center justify-center gap-2 font-semibold py-4 px-6 rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 relative"
                    data-testid="button-ptt-locked"
                  >
                    <Mic className="w-5 h-5" />
                    Live
                    <Lock className="w-3.5 h-3.5 absolute right-5 opacity-70" />
                  </button>
                ) : talkMode === 'ptt' ? (
                  <div className="w-full relative">
                    <button
                      onPointerDown={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('[data-testid="button-lock-talk"]')) return;
                        e.preventDefault();
                        unlockAudio();
                        startTalking();
                      }}
                      onPointerUp={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('[data-testid="button-lock-talk"]')) return;
                        stopTalking();
                      }}
                      onPointerLeave={stopTalking}
                      onPointerCancel={stopTalking}
                      className={`w-full flex items-center justify-center gap-2 font-semibold py-4 px-6 rounded-full transition-all select-none touch-none ${
                        isMuted 
                          ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' 
                          : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      }`}
                      data-testid="button-ptt"
                    >
                      {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      {isMuted ? ('ontouchstart' in window ? 'Hold to Talk' : 'Spacebar to Talk') : 'Live'}
                    </button>
                    <div
                      role="button"
                      tabIndex={0}
                      onTouchStart={(e) => { e.stopPropagation(); }}
                      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); toggleTalkLock(); }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors cursor-pointer z-10"
                      data-testid="button-lock-talk"
                      aria-label="Lock mic on"
                    >
                      <Unlock className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                ) : talkMode === 'always' ? (
                  <button
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const now = Date.now();
                      if (now - alwaysOnLastTapRef.current <= 300) {
                        alwaysOnDoubleTapRef.current = true;
                        alwaysOnLastTapRef.current = 0;
                        changeTalkMode('auto');
                        return;
                      }
                      alwaysOnLastTapRef.current = now;
                      alwaysOnDoubleTapRef.current = false;
                      startHoldMute();
                    }}
                    onPointerUp={() => {
                      if (alwaysOnDoubleTapRef.current) return;
                      stopHoldMute();
                    }}
                    onPointerLeave={() => {
                      if (alwaysOnDoubleTapRef.current) return;
                      stopHoldMute();
                    }}
                    onPointerCancel={() => {
                      if (alwaysOnDoubleTapRef.current) return;
                      stopHoldMute();
                    }}
                    className={`w-full flex items-center justify-center gap-2 font-semibold py-4 px-6 rounded-full relative select-none touch-none transition-all ${
                      isHoldMuted
                        ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                        : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                    }`}
                    data-testid="status-always-on"
                  >
                    {isHoldMuted ? <MicOff className="w-5 h-5" /> : <Radio className="w-5 h-5" />}
                    {isHoldMuted ? 'Muted' : 'Always On'}
                    <Lock className="w-3.5 h-3.5 absolute right-5 opacity-70" />
                  </button>
                ) : (
                  <button
                    onClick={toggleMute}
                    className={`w-full flex items-center justify-center gap-2 font-semibold py-4 px-6 rounded-full transition-all ${
                      isMuted 
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' 
                        : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                    }`}
                    data-testid="button-toggle-mute"
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    {isMuted ? ('ontouchstart' in window ? 'Tap to Talk' : 'Spacebar to Talk') : 'Live'}
                  </button>
                )}
              </div>
              {isAdmin && channelsData && channelsData.length > 0 && (
                <button
                  onClick={toggleAllCall}
                  disabled={allCallLoading}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-full font-medium transition-all ${
                    allCallActive
                      ? 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/30 animate-glow-pulse'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                  data-testid="button-all-call"
                >
                  <PhoneCall className={`w-4 h-4 ${allCallActive ? 'text-white' : 'text-slate-400'}`} />
                  {allCallActive ? 'End All-Call' : 'All-Call'}
                </button>
              )}
            </div>
          ) : isConnecting ? (
            <button
              disabled
              className="flex items-center justify-center gap-2 w-full bg-slate-600 text-white font-semibold py-4 px-6 rounded-full"
              data-testid="button-connecting"
            >
              <Globe className="w-5 h-5 animate-pulse" />
              Connecting...
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              {!userName && (
                <div className="text-center">
                  <label className="text-xs text-slate-400 mb-1 block">Your name</label>
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-transparent border-b border-slate-600 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors text-center text-lg"
                    data-testid="input-user-name"
                  />
                </div>
              )}
              <button
                onClick={() => {
                  const nameToUse = userName || draftName.trim();
                  if (!userName && draftName.trim()) {
                    setUserName(draftName.trim());
                    localStorage.setItem('banter_user_name', draftName.trim());
                    if (authToken) {
                      fetch('/api/user/profile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ authToken, name: draftName.trim() })
                      }).catch(() => {});
                    }
                  }
                  unlockAudio();
                  connectToRoom(nameToUse || undefined);
                }}
                disabled={!userName && !draftName.trim()}
                className={`w-full flex items-center justify-center gap-2 font-semibold py-4 px-6 rounded-full transition-colors ${
                  !userName && !draftName.trim()
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-white'
                }`}
                data-testid="button-connect"
              >
                Connect
              </button>
              {audioDevices.length > 1 && (
                <div className="relative" ref={micPickerRef}>
                  <button
                    onClick={() => setShowMicPicker(!showMicPicker)}
                    className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 px-6 rounded-full transition-colors"
                    data-testid="button-mic-picker"
                  >
                    <Mic className="w-4 h-4 text-slate-400" />
                    <span className="truncate text-sm">
                      {audioDevices.find(d => d.deviceId === selectedAudioDevice)?.label || 'Select microphone'}
                    </span>
                  </button>
                  {showMicPicker && (
                    <div className="absolute left-0 right-0 top-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-lg overflow-hidden z-50">
                      {audioDevices.map((device) => (
                        <button
                          key={device.deviceId}
                          onClick={() => { setSelectedAudioDevice(device.deviceId); setShowMicPicker(false); }}
                          className={`w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors ${
                            selectedAudioDevice === device.deviceId
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'text-white hover:bg-slate-700'
                          }`}
                          data-testid={`mic-option-${device.deviceId}`}
                        >
                          <Mic className={`w-4 h-4 flex-shrink-0 ${selectedAudioDevice === device.deviceId ? 'text-emerald-400' : 'text-slate-400'}`} />
                          <span className="truncate">{device.label || 'Microphone'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {connectionError && (
            <p className="text-red-400 text-sm text-center" data-testid="text-connection-error">{connectionError}</p>
          )}
        </div>
      </div>

      {/* Modals */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6" onClick={(e) => { if (e.target === e.currentTarget) setShowDisconnectConfirm(false); }}>
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <h2 className="text-xl font-bold text-center mb-6">Disconnect?</h2>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
                data-testid="button-cancel-disconnect"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowDisconnectConfirm(false); disconnectFromRoom(); }}
                className="flex-1 bg-red-500 hover:bg-red-400 text-white font-medium py-3 rounded-full transition-colors"
                data-testid="button-confirm-disconnect"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {showAudioSettings && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6" onClick={(e) => { if (e.target === e.currentTarget) setShowAudioSettings(false); }}>
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-center mb-6">Audio Settings</h2>
            
            <div className="mb-6">
              <p className="text-sm text-slate-400 mb-3">Talk Mode</p>
              <div className="flex gap-2">
                <button
                  onClick={() => changeTalkMode('ptt')}
                  className={`flex-1 flex flex-col items-center gap-1 px-3 py-3 rounded-xl transition-colors ${
                    talkMode === 'ptt'
                      ? 'bg-emerald-500/20 border-2 border-emerald-500'
                      : 'bg-slate-800 border-2 border-transparent hover:bg-slate-700'
                  }`}
                  data-testid="button-talk-mode-ptt"
                >
                  <Mic className={`w-5 h-5 ${talkMode === 'ptt' ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className={`text-xs font-medium ${talkMode === 'ptt' ? 'text-emerald-400' : 'text-white'}`}>Hold</span>
                </button>
                <button
                  onClick={() => changeTalkMode('auto')}
                  className={`flex-1 flex flex-col items-center gap-1 px-3 py-3 rounded-xl transition-colors ${
                    talkMode === 'auto'
                      ? 'bg-emerald-500/20 border-2 border-emerald-500'
                      : 'bg-slate-800 border-2 border-transparent hover:bg-slate-700'
                  }`}
                  data-testid="button-talk-mode-auto"
                >
                  <Volume2 className={`w-5 h-5 ${talkMode === 'auto' ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className={`text-xs font-medium ${talkMode === 'auto' ? 'text-emerald-400' : 'text-white'}`}>Tap</span>
                </button>
                <button
                  onClick={() => changeTalkMode('always')}
                  className={`flex-1 flex flex-col items-center gap-1 px-3 py-3 rounded-xl transition-colors ${
                    talkMode === 'always'
                      ? 'bg-emerald-500/20 border-2 border-emerald-500'
                      : 'bg-slate-800 border-2 border-transparent hover:bg-slate-700'
                  }`}
                  data-testid="button-talk-mode-always"
                >
                  <Radio className={`w-5 h-5 ${talkMode === 'always' ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className={`text-xs font-medium ${talkMode === 'always' ? 'text-emerald-400' : 'text-white'}`}>On</span>
                </button>
              </div>
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-slate-400 mb-3">Microphone</p>
              {audioDevices.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">No microphones found</p>
              ) : (
                <div className="relative">
                  <Mic className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <select
                    value={selectedAudioDevice}
                    onChange={(e) => changeAudioDevice(e.target.value)}
                    className="w-full appearance-none bg-slate-800 border-2 border-transparent hover:border-slate-600 focus:border-emerald-500 text-white text-sm rounded-xl pl-9 pr-8 py-3 outline-none transition-colors"
                    data-testid="select-microphone"
                  >
                    {audioDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${audioDevices.indexOf(device) + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-slate-400 mb-3">Audio Processing</p>
              <div className="space-y-2">
                {[
                  { key: 'echoCancellation', label: 'Echo Cancellation', value: echoCancellation, desc: 'Removes room echo' },
                  { key: 'noiseSuppression', label: 'Noise Suppression', value: noiseSuppression, desc: 'Filters background noise' },
                  { key: 'autoGainControl', label: 'Auto Gain Control', value: autoGainControl, desc: 'Normalizes volume levels' },
                ].map(({ key, label, value, desc }) => (
                  <button
                    key={key}
                    onClick={() => updateAudioProcessing({ [key]: !value })}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors bg-slate-800 border-2 border-transparent`}
                    data-testid={`toggle-${key}`}
                  >
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium text-white">{label}</span>
                      <span className="text-xs text-slate-500">{desc}</span>
                    </div>
                    <div className={`w-10 h-6 rounded-full transition-colors ${value ? 'bg-green-500' : 'bg-slate-600'} relative`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${value ? 'right-1' : 'left-1'}`} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            <button
              onClick={() => setShowAudioSettings(false)}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-3 rounded-full transition-colors"
              data-testid="button-close-audio-settings"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {showFlicModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6" onClick={(e) => { if (e.target === e.currentTarget) { stopFlicScan(); setShowFlicModal(false); } }}>
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <h2 className="text-xl font-bold text-center mb-6">Flic PTT Button</h2>
            <div className="space-y-2 mb-6">
              {flicButtons.length > 0 ? (
                flicButtons.map((button) => (
                  <div
                    key={button.uuid}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${
                      button.connectionState === 'connected'
                        ? 'bg-emerald-500/20 border-2 border-emerald-500'
                        : 'bg-slate-800 border-2 border-transparent'
                    }`}
                    data-testid={`flic-button-${button.uuid}`}
                  >
                    <Bluetooth className={`w-5 h-5 ${
                      button.connectionState === 'connected' ? 'text-emerald-400' : 
                      button.connectionState === 'connecting' ? 'text-amber-400 animate-pulse' : 'text-slate-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm truncate block ${
                        button.connectionState === 'connected' ? 'text-emerald-400' : 'text-white'
                      }`}>
                        {button.name}
                      </span>
                      <span className="text-xs text-slate-500 capitalize">{button.connectionState || 'unknown'}</span>
                    </div>
                    <button
                      onClick={() => forgetFlicButton(button.uuid)}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                      data-testid={`flic-forget-${button.uuid}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-slate-500 text-sm text-center py-4">No Flic buttons paired</p>
              )}
            </div>
            {flicScanError && (
              <p className="text-red-400 text-xs text-center mb-3">{flicScanError}</p>
            )}
            {flicScanning && flicScanStatus && (
              <p className="text-amber-400 text-xs text-center mb-3 capitalize">
                {flicScanStatus === 'discovered' ? 'Button found, connecting...' :
                 flicScanStatus === 'connected' ? 'Connected, verifying...' :
                 flicScanStatus === 'verified' ? 'Verified!' :
                 flicScanStatus === 'verificationFailed' ? 'Verification failed' :
                 flicScanStatus}
              </p>
            )}
            <button
              onClick={scanForFlicButtons}
              disabled={flicScanning}
              className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium py-3 rounded-full transition-colors mb-3"
              data-testid="button-scan-flic"
            >
              {flicScanning ? (
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
              ) : (
                <Bluetooth className="w-4 h-4" />
              )}
              {flicScanning ? 'Scanning...' : 'Scan for Flic Button'}
            </button>
            <button
              onClick={() => { stopFlicScan(); setShowFlicModal(false); setFlicScanError(null); }}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-3 rounded-full transition-colors"
              data-testid="button-close-flic"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {showChannelModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6" onClick={(e) => { if (e.target === e.currentTarget) setShowChannelModal(false); }}>
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-md max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-center mb-6">Channels</h2>
            
            {/* Create new channel */}
            <div className="mb-6 p-4 bg-slate-800/50 rounded-xl">
              <p className="text-sm text-slate-400 mb-3">Create New Channel</p>
              <div className="flex gap-2 mb-3">
                <input
                  type="number"
                  value={newChannelNumber}
                  onChange={(e) => setNewChannelNumber(parseInt(e.target.value) || 1)}
                  className="w-16 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-center"
                  min="1"
                  data-testid="input-channel-number"
                />
                <input
                  type="text"
                  placeholder="Channel name"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700"
                  data-testid="input-channel-name"
                />
              </div>
              <button
                onClick={() => {
                  if (newChannelName.trim()) {
                    createChannel.mutate({ number: newChannelNumber, name: newChannelName.trim() });
                  }
                }}
                disabled={!newChannelName.trim() || createChannel.isPending}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-600 text-white font-medium py-2 rounded-lg transition-colors"
                data-testid="button-create-channel"
              >
                {createChannel.isPending ? 'Creating...' : 'Create Channel'}
              </button>
            </div>

            {/* Existing channels */}
            <div className="space-y-4 mb-6">
              {channelsData?.map((channel) => (
                <div key={channel.id} className="p-4 bg-slate-800/50 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-lg font-bold text-amber-400">CH {channel.number}</span>
                      <span className="ml-2 text-slate-300">{channel.name}</span>
                    </div>
                    <button
                      onClick={() => deleteChannel.mutate(channel.id)}
                      disabled={deleteChannel.isPending}
                      className="p-1.5 rounded-md hover:bg-red-500/30 text-slate-400 hover:text-red-400"
                      data-testid={`button-delete-channel-${channel.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {/* Participants in this channel */}
                  <div className="mb-3">
                    <p className="text-xs text-slate-500 mb-2">
                      {channel.participants.length} participant{channel.participants.length !== 1 ? 's' : ''}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {channel.participants.map((identity) => {
                        const name = participantsData?.participants.find(p => p.identity === identity)?.name || identity;
                        return (
                          <span
                            key={identity}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 rounded-full text-xs"
                          >
                            {name}
                            <button
                              onClick={() => unassignFromChannel.mutate(identity)}
                              className="text-slate-400 hover:text-red-400"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Add participant dropdown */}
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        assignToChannel.mutate({ channelId: channel.id, participantIdentity: e.target.value });
                        e.target.value = '';
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-sm"
                    defaultValue=""
                    data-testid={`select-assign-channel-${channel.id}`}
                  >
                    <option value="">Add participant...</option>
                    {participantsData?.participants
                      .filter(p => !channel.participants.includes(p.identity))
                      .map(p => (
                        <option key={p.identity} value={p.identity}>{p.name || p.identity}</option>
                      ))}
                  </select>
                </div>
              ))}
              
              {(!channelsData || channelsData.length === 0) && (
                <p className="text-slate-400 text-center py-4">No channels created yet</p>
              )}
            </div>

            <button
              onClick={() => setShowChannelModal(false)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
              data-testid="button-close-channel-modal"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {showChannelPicker && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6" onClick={(e) => { if (e.target === e.currentTarget) setShowChannelPicker(false); }}>
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-sm">
            <h2 className="text-xl font-bold text-center mb-2" data-testid="text-channel-picker-title">Switch Channel</h2>
            <p className="text-sm text-slate-400 text-center mb-6">
              {currentChannel ? `Currently on CH ${currentChannel.number}` : 'Currently on Main'}
            </p>
            
            <div className="space-y-2 mb-6">
              {channelsData?.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => switchChannel(channel.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${
                    currentChannel?.id === channel.id ? 'bg-amber-500/20 border-2 border-amber-500' : 'bg-slate-800 border-2 border-transparent hover:bg-slate-700'
                  }`}
                  data-testid={`button-switch-channel-${channel.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Radio className="w-5 h-5 text-amber-400" />
                    <div className="text-left">
                      <span className="font-medium">CH {channel.number} — {channel.name}</span>
                      <span className="text-xs text-slate-400 ml-2">{channel.participants.length} in channel</span>
                    </div>
                  </div>
                  {currentChannel?.id === channel.id && <span className="text-xs text-amber-400">Current</span>}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowChannelPicker(false)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
              data-testid="button-close-channel-picker"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {muteAllActive && isConnected && !isAdmin && (
        <div className="fixed top-16 left-0 right-0 z-40 flex justify-center px-4">
          <div className="bg-red-500/90 backdrop-blur-sm text-white px-6 py-2 rounded-full flex items-center gap-2 shadow-lg" data-testid="banner-mute-all">
            <VolumeX className="w-4 h-4" />
            <span className="font-semibold text-sm">ALL MUTED BY ADMIN</span>
          </div>
        </div>
      )}

      {allCallActive && isConnected && (
        <div className="fixed top-16 left-0 right-0 z-40 flex justify-center px-4">
          <div className="bg-red-500/90 backdrop-blur-sm text-white px-6 py-2 rounded-full flex items-center gap-2 shadow-lg animate-glow-pulse" data-testid="banner-all-call">
            <PhoneCall className="w-4 h-4" />
            <span className="font-semibold text-sm">ALL CALL ACTIVE</span>
          </div>
        </div>
      )}

      {broadcastActive && isConnected && (
        <div className="fixed top-16 left-0 right-0 z-40 flex justify-center px-4">
          <div className="bg-purple-500/90 backdrop-blur-sm text-white px-6 py-2 rounded-full flex items-center gap-2 shadow-lg animate-glow-pulse" data-testid="banner-broadcast">
            <Megaphone className="w-4 h-4" />
            <span className="font-semibold text-sm">
              {isBroadcaster ? 'BROADCASTING' : canSpeakInBroadcast ? 'BROADCAST — MIC GRANTED' : 'BROADCAST — LISTEN ONLY'}
            </span>
            {raisedHands.length > 0 && isAdmin && (
              <span className="bg-amber-400 text-black text-xs font-bold px-2 py-0.5 rounded-full ml-1">
                {raisedHands.length} ✋
              </span>
            )}
          </div>
        </div>
      )}

      {showLoginModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6" onClick={(e) => { if (e.target === e.currentTarget) { setShowLoginModal(false); }}}>
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <h2 className="text-xl font-bold text-center mb-2">Sign In</h2>
            <p className="text-sm text-slate-400 text-center mb-6">
              {loginStep === 'input' 
                ? (loginMethod === 'phone' ? 'Enter your phone number' : 'Enter your email') 
                : `Enter the code we ${loginMethod === 'phone' ? 'texted' : 'emailed'} you`}
            </p>
            
            {loginStep === 'input' ? (
              <>
                <div className="flex rounded-lg overflow-hidden mb-4">
                  <button
                    onClick={() => setLoginMethod('phone')}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${loginMethod === 'phone' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                    data-testid="button-login-method-phone"
                  >
                    Phone
                  </button>
                  <button
                    onClick={() => setLoginMethod('email')}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${loginMethod === 'email' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                    data-testid="button-login-method-email"
                  >
                    Email
                  </button>
                </div>
                {loginMethod === 'phone' ? (
                  <input
                    type="tel"
                    placeholder="(555) 555-5555"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none mb-6 text-center"
                    style={{ fontSize: '16px' }}
                    data-testid="input-modal-login-phone"
                  />
                ) : (
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none mb-6 text-center"
                    style={{ fontSize: '16px' }}
                    data-testid="input-modal-login-email"
                  />
                )}
              </>
            ) : (
              <input
                type="tel"
                placeholder="000000"
                value={loginCode}
                onChange={(e) => {
                  const code = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setLoginCode(code);
                  if (code.length === 6) {
                    setTimeout(() => verifyLoginCode(code), 100);
                  }
                }}
                maxLength={6}
                className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none mb-6 text-center text-2xl tracking-widest"
                data-testid="input-modal-login-code"
              />
            )}
            
            {loginError && <p className="text-red-400 text-sm text-center mb-4">{loginError}</p>}
            
            <div className="space-y-3">
              <button
                onClick={loginStep === 'input' ? sendVerificationCode : () => verifyLoginCode()}
                disabled={loginLoading || (loginStep === 'input' ? (loginMethod === 'phone' ? !isPhoneValid : !isEmailValid) : loginCode.length !== 6)}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 text-white font-medium py-3 rounded-full transition-colors"
                data-testid="button-modal-send-code"
              >
                {loginLoading ? 'Loading...' : loginStep === 'input' ? 'Send Code' : 'Verify'}
              </button>
              
              {loginStep === 'code' && (
                <button onClick={() => setLoginStep('input')} className="w-full text-slate-400 hover:text-white text-sm transition-colors" data-testid="button-modal-back-to-input">
                  Use a different {loginMethod === 'phone' ? 'number' : 'email'}
                </button>
              )}
              
              <button
                onClick={() => { setShowLoginModal(false); resetLoginModal(); }}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
                data-testid="button-modal-cancel-login"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showMyProfile && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6" onClick={(e) => { if (e.target === e.currentTarget) setShowMyProfile(false); }}>
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <h2 className="text-xl font-bold text-center mb-6">My Profile</h2>
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Name</label>
                <input
                  type="text"
                  placeholder="Your name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none"
                  data-testid="input-profile-name"
                />
              </div>
              {verifiedPhone && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Phone</label>
                  <input
                    type="tel"
                    value={verifiedPhone}
                    disabled
                    className="w-full px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700 text-slate-500"
                    data-testid="input-profile-phone"
                  />
                </div>
              )}
              {verifiedEmail && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Email</label>
                  <input
                    type="email"
                    value={verifiedEmail}
                    disabled
                    className="w-full px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700 text-slate-500"
                    data-testid="input-profile-email"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowMyProfile(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
                data-testid="button-cancel-profile"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setUserName(profileName);
                  localStorage.setItem('banter_user_name', profileName);
                  if (authToken && profileName.trim()) {
                    fetch('/api/user/profile', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ authToken, name: profileName.trim() })
                    }).catch(() => {
                      toast({ title: "Could not save to server", variant: "destructive" });
                    });
                  }
                  setShowMyProfile(false);
                  
                }}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-3 rounded-full transition-colors"
                data-testid="button-save-profile"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddExpectedModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6" onClick={(e) => { if (e.target === e.currentTarget) { setShowAddExpectedModal(false); setAddParticipantSearch(""); setShowManualAdd(false); }}}>
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-sm max-h-[85vh] flex flex-col">
            <h2 className="text-xl font-bold text-center mb-4" data-testid="text-add-participant-title">Add Participant</h2>
            
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search people..."
                value={addParticipantSearch}
                onChange={(e) => setAddParticipantSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none text-sm"
                data-testid="input-search-participants"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 mb-4 -mx-1 px-1">
              {groupsData && groupsData.length > 0 && !addParticipantSearch && (
                <div className="mb-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2 px-1">Groups</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {groupsData.map(g => (
                      <button
                        key={g.id}
                        onClick={() => addGroupToBanter.mutate(g.id)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm transition-colors"
                        data-testid={`button-add-group-${g.id}`}
                      >
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-white">{g.name}</span>
                        <span className="text-slate-500">({g.memberIds.length})</span>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-slate-800 mb-3" />
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2 px-1">People</p>
                </div>
              )}
              {(() => {
                const alreadyAdded = new Set(
                  (expectedData || []).map(ep => ep.name.toLowerCase())
                );
                const filtered = (allUsersData || [])
                  .filter(u => !alreadyAdded.has(u.name.toLowerCase()))
                  .filter(u => {
                    if (!addParticipantSearch) return true;
                    const q = addParticipantSearch.toLowerCase();
                    return u.name.toLowerCase().includes(q) || 
                           (u.phone && u.phone.includes(q)) ||
                           (u.email && u.email.toLowerCase().includes(q));
                  });
                
                if (filtered.length === 0 && !addParticipantSearch) {
                  return <p className="text-slate-500 text-sm text-center py-6">No users available to add</p>;
                }
                if (filtered.length === 0) {
                  return <p className="text-slate-500 text-sm text-center py-6">No matching people found</p>;
                }
                return (
                  <div className="space-y-1">
                    {filtered.map(user => (
                      <button
                        key={user.id}
                        onClick={() => addExpectedByUser.mutate({ name: user.name, phone: user.phone, email: user.email })}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-800 transition-colors text-left"
                        data-testid={`button-add-user-${user.id}`}
                      >
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-medium text-emerald-400">{user.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{user.name}</p>
                          <p className="text-xs text-slate-500 truncate">{user.phone || user.email || ''}</p>
                        </div>
                        <Plus className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            {showManualAdd ? (
              <div className="space-y-3 mb-4 pt-3 border-t border-slate-800">
                <input
                  type="text"
                  placeholder="Name"
                  value={newExpectedName}
                  onChange={(e) => setNewExpectedName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none text-sm"
                  data-testid="input-expected-name"
                />
                <input
                  type="tel"
                  placeholder="Phone number"
                  value={newExpectedPhone}
                  onChange={(e) => setNewExpectedPhone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none text-sm"
                  data-testid="input-expected-phone"
                />
                <input
                  type="email"
                  placeholder="Email (optional if phone provided)"
                  value={newExpectedEmail}
                  onChange={(e) => setNewExpectedEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none text-sm"
                  data-testid="input-expected-email"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowManualAdd(false); setNewExpectedName(""); setNewExpectedPhone(""); setNewExpectedEmail(""); }}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors text-sm"
                    data-testid="button-cancel-manual-add"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => addExpected.mutate()}
                    disabled={!newExpectedName || (!newExpectedPhone && !newExpectedEmail)}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 text-white font-medium py-3 rounded-full transition-colors text-sm"
                    data-testid="button-save-expected"
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowManualAdd(true)}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-full transition-colors text-sm mb-4"
                data-testid="button-show-manual-add"
              >
                <UserPlus className="w-4 h-4" />
                Add New Person
              </button>
            )}

            <button
              onClick={() => { setShowAddExpectedModal(false); setAddParticipantSearch(""); setShowManualAdd(false); setNewExpectedName(""); setNewExpectedPhone(""); }}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-3 rounded-full transition-colors"
              data-testid="button-close-add-expected"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {showProfileDrawer && editingParticipant && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6" onClick={(e) => { if (e.target === e.currentTarget) setShowProfileDrawer(false); }}>
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <h2 className="text-xl font-bold text-center mb-6" data-testid="text-edit-profile-title">Edit Profile</h2>
            <div className="space-y-4 mb-6">
              <input
                type="text"
                placeholder="Name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none"
                data-testid="input-edit-name"
              />
              <input
                type="tel"
                placeholder="Phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none"
                data-testid="input-edit-phone"
              />
              <input
                type="email"
                placeholder="Email (optional)"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none"
                data-testid="input-edit-email"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowProfileDrawer(false); setEditingParticipant(null); }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
                data-testid="button-cancel-edit-profile"
              >
                Cancel
              </button>
              <button
                onClick={() => updateExpected.mutate()}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-3 rounded-full transition-colors"
                data-testid="button-save-edit-profile"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showAlertCrewConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6" onClick={(e) => { if (e.target === e.currentTarget) setShowAlertCrewConfirm(false); }}>
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Bell className="w-6 h-6 text-amber-400" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-center mb-2" data-testid="text-alert-crew-title">Notify Group</h2>
            <p className="text-sm text-slate-400 text-center mb-6" data-testid="text-alert-crew-desc">
              Send a "Join Now" SMS to {expectedData?.filter(p => p.phone).length || 0} participant{(expectedData?.filter(p => p.phone).length || 0) !== 1 ? 's' : ''}?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAlertCrewConfirm(false)}
                disabled={alertCrewLoading}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
                data-testid="button-alert-crew-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleAlertCrew}
                disabled={alertCrewLoading}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 text-white font-medium py-3 rounded-full transition-colors"
                data-testid="button-alert-crew-confirm"
              >
                {alertCrewLoading ? 'Sending...' : 'Notify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {actionDrawerParticipant && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-end z-50" 
          onClick={(e) => { if (e.target === e.currentTarget) setActionDrawerParticipant(null); }}
          data-testid="drawer-participant-actions"
        >
          <div className="bg-slate-900 rounded-t-2xl w-full pb-safe animate-in slide-in-from-bottom duration-200">
            <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto mt-3 mb-4" />
            <div className="flex items-center gap-3 px-6 mb-4">
              <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center">
                <span className="text-lg font-medium text-white">
                  {actionDrawerParticipant.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-semibold text-white">{actionDrawerParticipant.name}</p>
                <p className="text-xs text-slate-400">
                  {actionDrawerParticipant.isConnected ? 'Connected' : 'Invited'}
                </p>
              </div>
            </div>
            <div className="px-4 space-y-1 mb-2">
              {actionDrawerParticipant.isConnected && actionDrawerParticipant.identity && (
                <button
                  onClick={() => {
                    toggleParticipantMute.mutate({ 
                      identity: actionDrawerParticipant.identity!, 
                      muted: !actionDrawerParticipant.muted 
                    });
                    setActionDrawerParticipant(null);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-slate-800 transition-colors"
                  data-testid="drawer-action-mute"
                >
                  {actionDrawerParticipant.muted ? (
                    <Mic className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <MicOff className="w-5 h-5 text-slate-400" />
                  )}
                  <span className="text-white font-medium">
                    {actionDrawerParticipant.muted ? 'Unmute' : 'Mute'}
                  </span>
                </button>
              )}
              {(actionDrawerParticipant.phone || actionDrawerParticipant.email) && (
                <button
                  onClick={handleRemindParticipant}
                  disabled={remindLoading}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-slate-800 transition-colors disabled:opacity-50"
                  data-testid="drawer-action-remind"
                >
                  <Bell className="w-5 h-5 text-amber-400" />
                  <span className="text-white font-medium">
                    {remindLoading ? 'Sending...' : 'Remind'}
                  </span>
                </button>
              )}
              {actionDrawerParticipant.isConnected && actionDrawerParticipant.identity && (
                <button
                  onClick={() => {
                    kickParticipant.mutate(actionDrawerParticipant.identity!);
                    setActionDrawerParticipant(null);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-slate-800 transition-colors"
                  data-testid="drawer-action-kick"
                >
                  <PhoneOff className="w-5 h-5 text-red-400" />
                  <span className="text-red-400 font-medium">Remove from Call</span>
                </button>
              )}
              {!actionDrawerParticipant.isConnected && actionDrawerParticipant.expectedId && (
                <button
                  onClick={() => {
                    setConfirmDeleteId(actionDrawerParticipant.expectedId!);
                    setActionDrawerParticipant(null);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-slate-800 transition-colors"
                  data-testid="drawer-action-remove"
                >
                  <Trash2 className="w-5 h-5 text-red-400" />
                  <span className="text-red-400 font-medium">Remove</span>
                </button>
              )}
            </div>
            <div className="px-4 pb-4">
              <button
                onClick={() => setActionDrawerParticipant(null)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-3.5 rounded-xl transition-colors"
                data-testid="drawer-action-done"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDeleteId(null); }}>
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <h2 className="text-xl font-bold text-center mb-6" data-testid="text-remove-participant-title">Remove Participant?</h2>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
                data-testid="button-cancel-remove"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 bg-red-500 hover:bg-red-400 text-white font-medium py-3 rounded-full transition-colors"
                data-testid="button-confirm-remove"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
