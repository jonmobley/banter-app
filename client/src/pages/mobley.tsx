import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone, Users, User, Plus, Volume2, VolumeX, Settings, MoreVertical, MessageSquare, Trash2, X, Pencil, PhoneOutgoing, Calendar, PhoneCall, Mic, MicOff, Globe, Wifi, Radio } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import { Room, RoomEvent, Track, LocalParticipant, RemoteParticipant, ConnectionState } from "livekit-client";
import { useToast } from "@/hooks/use-toast";

type TalkMode = 'ptt' | 'auto';

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

export default function Mobley() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(true);
  const [adminPin, setAdminPin] = useState(() => {
    return localStorage.getItem('banter_admin_pin') || '';
  });
  const [showPinModal, setShowPinModal] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [pinDigits, setPinDigits] = useState(["", "", "", ""]);
  const [callDuration, setCallDuration] = useState(0);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [speakingState, setSpeakingState] = useState<Record<string, boolean>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // LiveKit room and connection state
  const [room, setRoom] = useState<Room | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [isMuted, setIsMuted] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [localIdentity, setLocalIdentity] = useState<string | null>(null);
  
  // Track attached audio elements for cleanup
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Audio device selection
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
  const [showAudioSettings, setShowAudioSettings] = useState(false);

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

  // Talk mode: PTT (push-to-talk) or Auto
  const [talkMode, setTalkMode] = useState<TalkMode>(() => {
    const saved = localStorage.getItem('banter_talk_mode');
    return (saved === 'auto' || saved === 'ptt') ? saved : 'ptt';
  });

  // Phone verification state
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(() => {
    return localStorage.getItem('banter_verified_phone');
  });
  const [authToken, setAuthToken] = useState<string | null>(() => {
    return localStorage.getItem('banter_auth_token');
  });

  // User display name (editable before joining)
  const [userName, setUserName] = useState<string>(() => {
    return localStorage.getItem('banter_user_name') || '';
  });

  // Login modal state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMyProfile, setShowMyProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState(() => {
    return localStorage.getItem('banter_user_email') || '';
  });
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [loginStep, setLoginStep] = useState<'phone' | 'code'>('phone');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

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
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'speaking') {
            setSpeakingState(msg.data);
          } else if (msg.type === 'participant-event') {
            queryClient.invalidateQueries({ queryKey: ["/api/participants"] });
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
    queryKey: ["/api/participants"],
    queryFn: async () => {
      const res = await fetch("/api/participants");
      if (!res.ok) throw new Error("Failed to fetch participants");
      return res.json();
    },
    refetchInterval: 3000,
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

  const { data: contactsData } = useQuery<{ id: string; name: string; phone: string }[]>({
    queryKey: ["/api/contacts"],
    queryFn: async () => {
      const res = await fetch("/api/contacts");
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json();
    },
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
    // Refresh on page load to auto-select default mic
    refreshAudioDevices();
  }, []);

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

  // Track if we've already auto-connected this session
  const hasAutoConnected = useRef(false);

  // Connect to LiveKit room
  const connectToRoom = useCallback(async () => {
    try {
      setConnectionError(null);
      setConnectionState(ConnectionState.Connecting);

      let identity = 'WebUser';
      let displayName = userName.trim();
      
      // If user entered a name, use it
      if (displayName) {
        identity = displayName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
        // Save to localStorage for next time
        localStorage.setItem('banter_user_name', displayName);
      } else if (verifiedPhone) {
        const normalizedVerified = verifiedPhone.replace(/\D/g, '');
        let found = false;
        
        // Try to match by verified phone in expected participants
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
        
        // Try to match in contacts if not found
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
          // Generate random identity if no match found
          const randomDigits = Array.from({ length: 8 }, () => Math.floor(Math.random() * 8) + 2).join('');
          identity = `WebUser_${randomDigits}`;
          displayName = identity;
        }
      } else {
        // Generate random numbers 2-9 only (no 0 or 1 to avoid confusion)
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
          authToken: authToken || undefined
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get connection token');
      }

      const { token, url, identity: serverIdentity } = await res.json();
      
      // Use the server-returned identity for consistency
      const actualIdentity = serverIdentity || identity;

      // Create and connect to the room
      const newRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation,
          noiseSuppression,
          autoGainControl,
          deviceId: selectedAudioDevice || undefined
        }
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
        queryClient.invalidateQueries({ queryKey: ["/api/participants"] });
      });

      newRoom.on(RoomEvent.ParticipantDisconnected, () => {
        queryClient.invalidateQueries({ queryKey: ["/api/participants"] });
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

      newRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const newSpeakingState: Record<string, boolean> = {};
        speakers.forEach(speaker => {
          newSpeakingState[speaker.identity] = true;
        });
        setSpeakingState(prev => ({ ...prev, ...newSpeakingState }));
        
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
        // Small delay to ensure track is created
        await new Promise(resolve => setTimeout(resolve, 100));
        await newRoom.localParticipant.setMicrophoneEnabled(false);
        setIsMuted(true);
      } catch (micError) {
        console.error('Failed to initialize microphone:', micError);
        // Still allow connection even if mic fails
        setIsMuted(true);
      }

      queryClient.invalidateQueries({ queryKey: ["/api/participants"] });
      
    } catch (error: any) {
      console.error('Failed to connect to room:', error);
      setConnectionError(error.message || 'Connection failed');
      setConnectionState(ConnectionState.Disconnected);
    }
  }, [userName, verifiedPhone, expectedData, contactsData, echoCancellation, noiseSuppression, autoGainControl, selectedAudioDevice, queryClient, authToken]);

  // Auto-connect when authenticated and name is known
  useEffect(() => {
    if (
      verifiedPhone && 
      authToken && 
      userName && 
      connectionState === ConnectionState.Disconnected && 
      !hasAutoConnected.current &&
      !connectionError
    ) {
      hasAutoConnected.current = true;
      // Small delay to ensure everything is ready
      const timer = setTimeout(() => {
        connectToRoom();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [verifiedPhone, authToken, userName, connectionState, connectionError, connectToRoom]);

  // Disconnect from room
  const disconnectFromRoom = useCallback(async () => {
    if (room) {
      await room.disconnect();
      setRoom(null);
      setLocalIdentity(null);
      setConnectionState(ConnectionState.Disconnected);
      queryClient.invalidateQueries({ queryKey: ["/api/participants"] });
    }
  }, [room, queryClient]);

  // Toggle mute
  const toggleMute = useCallback(async () => {
    if (room?.localParticipant) {
      const newMuted = !isMuted;
      await room.localParticipant.setMicrophoneEnabled(!newMuted);
      setIsMuted(newMuted);
    }
  }, [room, isMuted]);

  // PTT handlers
  const startTalking = useCallback(async () => {
    if (room?.localParticipant && isMuted) {
      await room.localParticipant.setMicrophoneEnabled(true);
      setIsMuted(false);
    }
  }, [room, isMuted]);

  const stopTalking = useCallback(async () => {
    if (room?.localParticipant && !isMuted && talkMode === 'ptt') {
      await room.localParticipant.setMicrophoneEnabled(false);
      setIsMuted(true);
    }
  }, [room, isMuted, talkMode]);

  // Change talk mode
  const changeTalkMode = useCallback(async (mode: TalkMode) => {
    setTalkMode(mode);
    localStorage.setItem('banter_talk_mode', mode);
    
    if (mode === 'auto' && room?.localParticipant) {
      await room.localParticipant.setMicrophoneEnabled(true);
      setIsMuted(false);
    }
  }, [room]);

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

  // Update audio processing
  const updateAudioProcessing = useCallback(async (settings: {
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
  }) => {
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
  }, []);

  // Admin mutations
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

  const toggleParticipantMute = useMutation({
    mutationFn: async ({ identity, muted }: { identity: string; muted: boolean }) => {
      const res = await fetch("/api/admin/mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: adminPin, identity, muted }),
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

  const kickParticipant = useMutation({
    mutationFn: async (identity: string) => {
      const res = await fetch("/api/admin/kick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: adminPin, identity }),
      });
      if (!res.ok) throw new Error("Failed to kick");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/participants"] });
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
      toast({ title: "Participant added" });
    },
    onError: () => {
      toast({ title: "Failed to add participant", variant: "destructive" });
    },
  });

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
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone })
      });
      if (!res.ok) throw new Error('Failed to send code');
      setLoginStep('code');
    } catch {
      setLoginError('Failed to send verification code');
    } finally {
      setLoginLoading(false);
    }
  };

  const verifyLoginCode = async () => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone, code: loginCode })
      });
      if (!res.ok) throw new Error('Invalid code');
      const data = await res.json();
      setVerifiedPhone(data.phone);
      setAuthToken(data.authToken);
      localStorage.setItem('banter_verified_phone', data.phone);
      localStorage.setItem('banter_auth_token', data.authToken);
      setShowLoginModal(false);
      resetLoginModal();
    } catch {
      setLoginError('Invalid verification code');
    } finally {
      setLoginLoading(false);
    }
  };

  const resetLoginModal = () => {
    setLoginStep('phone');
    setLoginPhone('');
    setLoginCode('');
    setLoginError(null);
  };

  const handleLogout = () => {
    setVerifiedPhone(null);
    setAuthToken(null);
    localStorage.removeItem('banter_verified_phone');
    localStorage.removeItem('banter_auth_token');
    toast({ title: "Signed out" });
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
  const roleOrder = { host: 0, participant: 1, listener: 2 };

  const realParticipants = participantsData?.participants || [];
  const conferenceActive = participantsData?.conferenceActive || false;
  const expectedParticipants = [...(expectedData || [])].sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

  const participants = [...realParticipants].sort((a, b) => {
    const roleA = getParticipantRole(a.identity) || 'participant';
    const roleB = getParticipantRole(b.identity) || 'participant';
    return roleOrder[roleA] - roleOrder[roleB];
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

  const isConnected = connectionState === ConnectionState.Connected;
  const isConnecting = connectionState === ConnectionState.Connecting;

  // Require authentication to access /mobley
  if (!verifiedPhone || !authToken) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <Radio className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Banter</h1>
            <p className="text-slate-400">Enter your phone number to join</p>
          </div>

          {loginStep === 'phone' ? (
            <div className="space-y-4">
              <input
                type="tel"
                value={loginPhone}
                onChange={(e) => setLoginPhone(e.target.value)}
                placeholder="Phone number"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
                data-testid="input-login-phone"
              />
              {loginError && <p className="text-red-400 text-sm">{loginError}</p>}
              <button
                onClick={sendVerificationCode}
                disabled={loginLoading || !loginPhone}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 rounded-lg font-medium transition-colors"
                data-testid="button-send-code"
              >
                {loginLoading ? 'Sending...' : 'Send Code'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-400 text-center">
                Enter the 6-digit code sent to {loginPhone}
              </p>
              <input
                type="text"
                value={loginCode}
                onChange={(e) => {
                  const code = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setLoginCode(code);
                  if (code.length === 6) {
                    setTimeout(() => {
                      setLoginLoading(true);
                      setLoginError(null);
                      fetch('/api/auth/verify-code', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: loginPhone, code })
                      })
                        .then(res => {
                          if (!res.ok) throw new Error('Invalid code');
                          return res.json();
                        })
                        .then(data => {
                          setVerifiedPhone(data.phone);
                          setAuthToken(data.authToken);
                          localStorage.setItem('banter_verified_phone', data.phone);
                          localStorage.setItem('banter_auth_token', data.authToken);
                        })
                        .catch(() => setLoginError('Invalid verification code'))
                        .finally(() => setLoginLoading(false));
                    }, 100);
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
                onClick={() => { setLoginStep('phone'); setLoginCode(''); setLoginError(null); }}
                className="w-full py-2 text-slate-400 hover:text-white text-sm transition-colors"
                data-testid="button-back-to-phone"
              >
                Use different number
              </button>
            </div>
          )}

          <p className="text-xs text-slate-500 text-center">
            By continuing, you agree to receive SMS messages for verification.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="font-semibold">Banter</h1>
            <p className="text-xs text-slate-400">
              {isConnected ? `Connected • ${formatDuration(callDuration)}` : 
               conferenceActive ? `${participantsData?.count || 0} online` : 'Ready to connect'}
            </p>
          </div>
        </div>
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
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => verifiedPhone ? setShowProfileMenu(!showProfileMenu) : setShowLoginModal(true)}
              className={`p-3 rounded-full transition-colors ${
                verifiedPhone 
                  ? 'bg-blue-500/20 hover:bg-blue-500/30' 
                  : 'bg-slate-800/50 hover:bg-slate-700'
              }`}
              data-testid="button-profile"
            >
              <User className={`w-5 h-5 ${verifiedPhone ? 'text-blue-400' : 'text-slate-400'}`} />
            </button>
            {showProfileMenu && verifiedPhone && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-slate-700">
                  <p className="text-xs text-slate-400">Signed in as</p>
                  <p className="text-sm text-white truncate">{userName || verifiedPhone}</p>
                </div>
                <button
                  onClick={() => { 
                    setProfileName(userName);
                    setProfileEmail(localStorage.getItem('banter_user_email') || '');
                    setShowMyProfile(true); 
                    setShowProfileMenu(false); 
                  }}
                  className="w-full px-4 py-3 text-left text-sm text-white hover:bg-slate-700 transition-colors"
                  data-testid="button-my-profile"
                >
                  My Profile
                </button>
                <button
                  onClick={() => { handleLogout(); setShowProfileMenu(false); }}
                  className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-slate-700 transition-colors border-t border-slate-700"
                  data-testid="button-signout"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-4 pb-48">
        <div className="space-y-2 mt-4">
          {participants.map((p, i) => {
            const isSpeaking = speakingState[p.identity] || false;
            const role = getParticipantRole(p.identity);
            
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
              if (role === 'host') return isSpeaking ? 'bg-amber-400/40' : 'bg-amber-500/30';
              if (role === 'participant') return isSpeaking ? 'bg-blue-400/40' : 'bg-blue-500/30';
              return isSpeaking ? 'bg-emerald-400/40' : 'bg-emerald-500/20';
            };
            
            const getTextColor = () => {
              if (role === 'host') return 'text-amber-400';
              if (role === 'participant') return 'text-blue-400';
              return 'text-emerald-400';
            };
            
            return (
              <div 
                key={p.identity} 
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
                    <p className="font-medium truncate">{p.name || p.identity}</p>
                    {isMyParticipant(p.identity) && (
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">You</span>
                    )}
                    {role === 'host' && (
                      <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">Host</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => canShowControls && toggleParticipantMute.mutate({ identity: p.identity, muted: !p.muted })}
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
                  {canShowControls && !isMyParticipant(p.identity) && (
                    <button
                      onClick={() => kickParticipant.mutate(p.identity)}
                      className="p-2 rounded-lg bg-slate-700/50 hover:bg-red-500/30 transition-colors"
                      title="Remove from call"
                      data-testid={`button-kick-${i}`}
                    >
                      <X className="w-5 h-5 text-slate-400 hover:text-red-400" />
                    </button>
                  )}
                </div>
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
                      <p className={`font-medium truncate ${getExpectedTextColor()}`}>{ep.name}</p>
                      {ep.role === 'host' && (
                        <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">Host</span>
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
                          style={dropdownStyle}
                          className="fixed bg-slate-800 rounded-lg shadow-xl py-1 z-[100] min-w-[160px] overflow-y-auto"
                        >
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
                          <div className="border-t border-slate-700 my-1" />
                          <button
                            onClick={() => {
                              updateRole.mutate({ id: ep.id, role: 'host' });
                              setOpenDropdown(null);
                            }}
                            className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 ${ep.role === 'host' ? 'text-amber-400' : 'text-slate-300'}`}
                          >
                            Host
                          </button>
                          <button
                            onClick={() => {
                              updateRole.mutate({ id: ep.id, role: 'participant' });
                              setOpenDropdown(null);
                            }}
                            className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 ${ep.role === 'participant' ? 'text-blue-400' : 'text-slate-300'}`}
                          >
                            Participant
                          </button>
                          <button
                            onClick={() => {
                              updateRole.mutate({ id: ep.id, role: 'listener' });
                              setOpenDropdown(null);
                            }}
                            className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 ${ep.role === 'listener' ? 'text-emerald-400' : 'text-slate-300'}`}
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

      {/* Bottom controls */}
      <div className={`fixed left-0 right-0 px-6 ${
        isConnected || isConnecting 
          ? 'bottom-0 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent pt-8 pb-8' 
          : 'bottom-0 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 pb-8 sm:pb-0'
      }`}>
        <div className="flex flex-col gap-3 max-w-xs mx-auto">
          {isConnected ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAudioSettings(true)}
                className="p-4 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-full transition-all active:scale-95"
                data-testid="button-audio-settings"
              >
                <Settings className="w-5 h-5" />
              </button>
              {talkMode === 'ptt' ? (
                <button
                  onMouseDown={startTalking}
                  onMouseUp={stopTalking}
                  onMouseLeave={stopTalking}
                  onTouchStart={startTalking}
                  onTouchEnd={stopTalking}
                  onTouchCancel={stopTalking}
                  className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-full font-semibold transition-all select-none ${
                    isMuted 
                      ? 'bg-slate-700 hover:bg-slate-600 text-slate-300 border-2 border-slate-600' 
                      : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 animate-pulse'
                  }`}
                  data-testid="button-ptt"
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  {isMuted ? 'Hold to Talk' : 'Live'}
                </button>
              ) : (
                <button
                  onClick={toggleMute}
                  className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-full font-semibold transition-all ${
                    isMuted 
                      ? 'bg-slate-700 hover:bg-slate-600 text-slate-300 border-2 border-slate-600' 
                      : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 animate-pulse'
                  }`}
                  data-testid="button-toggle-mute"
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  {isMuted ? 'Tap to Unmute' : 'Live'}
                </button>
              )}
              <button
                onClick={() => setShowDisconnectConfirm(true)}
                className="p-4 bg-slate-800 hover:bg-red-500 text-slate-400 hover:text-white rounded-full transition-all active:scale-95"
                data-testid="button-hangup"
              >
                <X className="w-5 h-5" />
              </button>
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
              <div className="text-center">
                <label className="text-xs text-slate-400 mb-1 block">Your name</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full bg-transparent border-b border-slate-600 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors text-center text-lg"
                  data-testid="input-user-name"
                />
              </div>
              <button
                onClick={connectToRoom}
                className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-4 px-6 rounded-full transition-colors"
                data-testid="button-connect"
              >
                Connect
              </button>
              <button
                onClick={() => setShowAudioSettings(true)}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 px-6 rounded-full transition-colors"
                data-testid="button-audio-settings-prejoin"
              >
                <Mic className="w-4 h-4 text-slate-400" />
                <span className="truncate text-sm">
                  {audioDevices.find(d => d.deviceId === selectedAudioDevice)?.label || 'Select microphone'}
                </span>
              </button>
            </div>
          )}
          {connectionError && (
            <p className="text-red-400 text-sm text-center">{connectionError}</p>
          )}
        </div>
      </div>

      {/* Modals */}
      {showPinModal && (
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
            {pinError && <p className="text-red-400 text-sm text-center mb-4">Invalid PIN. Try again.</p>}
            <button
              onClick={() => { setShowPinModal(false); setPinDigits(["", "", "", ""]); setPinError(false); }}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showDisconnectConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <h2 className="text-xl font-bold text-center mb-6">Disconnect?</h2>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowDisconnectConfirm(false); disconnectFromRoom(); }}
                className="flex-1 bg-red-500 hover:bg-red-400 text-white font-medium py-3 rounded-full transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {showAudioSettings && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-center mb-6">Audio Settings</h2>
            
            <div className="mb-6">
              <p className="text-sm text-slate-400 mb-3">Talk Mode</p>
              <div className="flex gap-2">
                <button
                  onClick={() => changeTalkMode('ptt')}
                  className={`flex-1 flex flex-col items-center gap-1 px-4 py-3 rounded-xl transition-colors ${
                    talkMode === 'ptt'
                      ? 'bg-emerald-500/20 border-2 border-emerald-500'
                      : 'bg-slate-800 border-2 border-transparent hover:bg-slate-700'
                  }`}
                >
                  <Mic className={`w-5 h-5 ${talkMode === 'ptt' ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className={`text-sm font-medium ${talkMode === 'ptt' ? 'text-emerald-400' : 'text-white'}`}>Hold to Talk</span>
                </button>
                <button
                  onClick={() => changeTalkMode('auto')}
                  className={`flex-1 flex flex-col items-center gap-1 px-4 py-3 rounded-xl transition-colors ${
                    talkMode === 'auto'
                      ? 'bg-emerald-500/20 border-2 border-emerald-500'
                      : 'bg-slate-800 border-2 border-transparent hover:bg-slate-700'
                  }`}
                >
                  <Volume2 className={`w-5 h-5 ${talkMode === 'auto' ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className={`text-sm font-medium ${talkMode === 'auto' ? 'text-emerald-400' : 'text-white'}`}>Toggle</span>
                </button>
              </div>
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-slate-400 mb-3">Microphone</p>
              <div className="space-y-2">
                {audioDevices.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-4">No microphones found</p>
                ) : (
                  audioDevices.map((device) => (
                    <button
                      key={device.deviceId}
                      onClick={() => changeAudioDevice(device.deviceId)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                        selectedAudioDevice === device.deviceId
                          ? 'bg-emerald-500/20 border-2 border-emerald-500'
                          : 'bg-slate-800 border-2 border-transparent hover:bg-slate-700'
                      }`}
                    >
                      <Mic className={`w-5 h-5 ${selectedAudioDevice === device.deviceId ? 'text-emerald-400' : 'text-slate-400'}`} />
                      <span className={`text-sm truncate ${selectedAudioDevice === device.deviceId ? 'text-emerald-400' : 'text-white'}`}>
                        {device.label || `Microphone ${audioDevices.indexOf(device) + 1}`}
                      </span>
                    </button>
                  ))
                )}
              </div>
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
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${
                      value ? 'bg-emerald-500/20 border-2 border-emerald-500' : 'bg-slate-800 border-2 border-transparent'
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <span className={`text-sm font-medium ${value ? 'text-emerald-400' : 'text-white'}`}>{label}</span>
                      <span className="text-xs text-slate-500">{desc}</span>
                    </div>
                    <div className={`w-10 h-6 rounded-full transition-colors ${value ? 'bg-emerald-500' : 'bg-slate-600'} relative`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${value ? 'right-1' : 'left-1'}`} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            <button
              onClick={() => refreshAudioDevices()}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors mb-3"
            >
              Refresh Devices
            </button>
            
            <button
              onClick={() => setShowAudioSettings(false)}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-3 rounded-full transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {showLoginModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <h2 className="text-xl font-bold text-center mb-2">Sign In</h2>
            <p className="text-sm text-slate-400 text-center mb-6">
              {loginStep === 'phone' ? 'Enter your phone number' : 'Enter the code we texted you'}
            </p>
            
            {loginStep === 'phone' ? (
              <input
                type="tel"
                placeholder="(555) 555-5555"
                value={loginPhone}
                onChange={(e) => setLoginPhone(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none mb-6 text-center"
                style={{ fontSize: '16px' }}
              />
            ) : (
              <input
                type="tel"
                placeholder="000000"
                value={loginCode}
                onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none mb-6 text-center text-2xl tracking-widest"
              />
            )}
            
            {loginError && <p className="text-red-400 text-sm text-center mb-4">{loginError}</p>}
            
            <div className="space-y-3">
              <button
                onClick={loginStep === 'phone' ? sendVerificationCode : verifyLoginCode}
                disabled={loginLoading || (loginStep === 'phone' ? !isPhoneValid : loginCode.length !== 6)}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 text-white font-medium py-3 rounded-full transition-colors"
              >
                {loginLoading ? 'Loading...' : loginStep === 'phone' ? 'Send Code' : 'Verify'}
              </button>
              
              {loginStep === 'code' && (
                <button onClick={() => setLoginStep('phone')} className="w-full text-slate-400 hover:text-white text-sm transition-colors">
                  Use a different number
                </button>
              )}
              
              <button
                onClick={() => { setShowLoginModal(false); resetLoginModal(); }}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showMyProfile && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
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
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Phone</label>
                <input
                  type="tel"
                  value={verifiedPhone || ''}
                  disabled
                  className="w-full px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700 text-slate-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Email (optional)</label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none"
                  data-testid="input-profile-email"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowMyProfile(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setUserName(profileName);
                  localStorage.setItem('banter_user_name', profileName);
                  if (profileEmail) {
                    localStorage.setItem('banter_user_email', profileEmail);
                  } else {
                    localStorage.removeItem('banter_user_email');
                  }
                  setShowMyProfile(false);
                  toast({ title: "Profile updated" });
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
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <h2 className="text-xl font-bold text-center mb-6">Add Participant</h2>
            <div className="space-y-4 mb-6">
              <input
                type="text"
                placeholder="Name"
                value={newExpectedName}
                onChange={(e) => setNewExpectedName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none"
              />
              <input
                type="tel"
                placeholder="Phone number"
                value={newExpectedPhone}
                onChange={(e) => setNewExpectedPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowAddExpectedModal(false); setNewExpectedName(""); setNewExpectedPhone(""); }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => addExpected.mutate()}
                disabled={!newExpectedName || !newExpectedPhone}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 text-white font-medium py-3 rounded-full transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfileDrawer && editingParticipant && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <h2 className="text-xl font-bold text-center mb-6">Edit Profile</h2>
            <div className="space-y-4 mb-6">
              <input
                type="text"
                placeholder="Name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none"
              />
              <input
                type="tel"
                placeholder="Phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none"
              />
              <input
                type="email"
                placeholder="Email (optional)"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowProfileDrawer(false); setEditingParticipant(null); }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => updateExpected.mutate()}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-3 rounded-full transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-0 sm:px-6">
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 pb-safe w-full sm:max-w-xs">
            <h2 className="text-xl font-bold text-center mb-6">Remove Participant?</h2>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-full transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 bg-red-500 hover:bg-red-400 text-white font-medium py-3 rounded-full transition-colors"
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
