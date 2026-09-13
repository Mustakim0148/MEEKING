import React, { useState, useEffect, useRef } from 'react';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Hand,
  Monitor,
  MonitorOff,
  ShieldAlert,
  PhoneOff,
  Copy,
  Plus,
  LogIn,
  Crown,
  Users,
  ArrowRight,
  Maximize2,
  UserCheck,
  MoreVertical,
  UserX,
  VolumeX,
  Volume2,
} from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'error' | 'success';
}

interface RemoteParticipant {
  peerId: string;
  userName: string;
  stream?: MediaStream;
  isMicMuted?: boolean;
  isCamOff?: boolean;
  isHandRaised?: boolean;
  isHostMuted?: boolean;
  isScreenSharing?: boolean;
  isScreenShareDisabled?: boolean;
  isHost?: boolean;
}

export default function App() {
  // Screen views: 'welcome' | 'create-name' | 'join' | 'meeting'
  const [currentScreen, setCurrentScreen] = useState<'welcome' | 'create-name' | 'join' | 'meeting'>('welcome');

  // Input states
  const [createName, setCreateName] = useState('');
  const [createMicChecked, setCreateMicChecked] = useState(true);
  const [createCamChecked, setCreateCamChecked] = useState(true);

  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinMicChecked, setJoinMicChecked] = useState(true);
  const [joinCamChecked, setJoinCamChecked] = useState(true);

  // In-meeting states
  const [isHost, setIsHost] = useState(false);
  const [currentRoomCode, setCurrentRoomCode] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isScreenShareDisabled, setIsScreenShareDisabled] = useState(false);
  const [isHostMuted, setIsHostMuted] = useState(false);
  const [locallyMutedPeers, setLocallyMutedPeers] = useState<Record<string, boolean>>({});
  const [activeMenuPeerId, setActiveMenuPeerId] = useState<string | null>(null);

  const [participants, setParticipants] = useState<RemoteParticipant[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  // Refs for WebRTC and streams
  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const activeConnectionsRef = useRef<Record<string, DataConnection>>({});
  const activeCallsRef = useRef<Record<string, MediaConnection>>({});
  const knownPeersRef = useRef<string[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const isHostRef = useRef<boolean>(false);
  const hostPeerIdRef = useRef<string | null>(null);

  // Synchronized refs to prevent stale closures in WebRTC callbacks
  const isMicMutedRef = useRef(false);
  const isCamOffRef = useRef(false);
  const isHandRaisedRef = useRef(false);
  const isScreenSharingRef = useRef(false);
  const isScreenShareDisabledRef = useRef(false);
  const isHostMutedRef = useRef(false);
  const currentUserNameRef = useRef('');
  const participantsRef = useRef<RemoteParticipant[]>([]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  useEffect(() => {
    isCamOffRef.current = isCamOff;
  }, [isCamOff]);

  useEffect(() => {
    isHandRaisedRef.current = isHandRaised;
  }, [isHandRaised]);

  useEffect(() => {
    isScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing]);

  useEffect(() => {
    isScreenShareDisabledRef.current = isScreenShareDisabled;
  }, [isScreenShareDisabled]);

  useEffect(() => {
    isHostMutedRef.current = isHostMuted;
  }, [isHostMuted]);

  useEffect(() => {
    currentUserNameRef.current = currentUserName;
  }, [currentUserName]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  // Audio effect for hand raise
  const playHandRaiseSound = () => {
    try {
      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15);

      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn('AudioContext warning', e);
    }
  };

  // Toast notifications
  const showToast = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'MEEK-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // Attach local stream to video element and ensure playback
  useEffect(() => {
    if (localVideoRef.current) {
      const activeStream =
        isScreenSharing && screenStreamRef.current ? screenStreamRef.current : (localStream || localStreamRef.current);
      if (activeStream) {
        if (localVideoRef.current.srcObject !== activeStream) {
          localVideoRef.current.srcObject = activeStream;
        }
        localVideoRef.current.muted = true;
        localVideoRef.current.defaultMuted = true;
        localVideoRef.current.playsInline = true;
        if (!isCamOff) {
          localVideoRef.current.play().catch((err) => {
            console.warn('Local video auto-play failed:', err);
          });
        }
      }
    }
  }, [currentScreen, isCamOff, localStream, isScreenSharing]);

  // Handle window close or refresh by host to notify participants
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isHostRef.current && peerRef.current) {
        broadcastToAll({
          type: 'host-ended-meeting',
          message: 'The host has ended the meeting. The call has ended for everyone.',
        });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const initLocalStream = async (wantMic: boolean, wantCam: boolean): Promise<boolean> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('Camera and microphone are not supported in this browser.', 'error');
      localStreamRef.current = new MediaStream();
      setLocalStream(localStreamRef.current);
      setIsMicMuted(true);
      setIsCamOff(true);
      return true;
    }

    let videoTrack: MediaStreamTrack | null = null;
    let audioTrack: MediaStreamTrack | null = null;

    // Try combined media request first if user wants both
    if (wantCam && wantMic) {
      try {
        const basicCombined = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        videoTrack = basicCombined.getVideoTracks()[0] || null;
        audioTrack = basicCombined.getAudioTracks()[0] || null;
      } catch (errBasic) {
        console.warn('Standard combined getUserMedia failed, trying with specific constraints:', errBasic);
        try {
          const combinedStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          videoTrack = combinedStream.getVideoTracks()[0] || null;
          audioTrack = combinedStream.getAudioTracks()[0] || null;
        } catch (errCombined) {
          console.warn('Combined request failed, trying camera and microphone independently:', errCombined);
        }
      }
    }

    // If camera is requested and we don't have a videoTrack yet, request camera independently
    if (wantCam && !videoTrack) {
      try {
        const vStreamBasic = await navigator.mediaDevices.getUserMedia({ video: true });
        videoTrack = vStreamBasic.getVideoTracks()[0] || null;
      } catch (vErr1) {
        console.warn('Basic video: true failed, trying with ideal resolution:', vErr1);
        try {
          const vStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          videoTrack = vStream.getVideoTracks()[0] || null;
        } catch (vErr2: any) {
          console.error('Camera access completely failed:', vErr2);
          if (vErr2.name === 'NotAllowedError' || vErr2.name === 'PermissionDeniedError') {
            showToast('Camera permission was blocked. Please allow camera access in browser.', 'error');
          } else if (vErr2.name === 'NotFoundError' || vErr2.name === 'DevicesNotFoundError') {
            showToast('No camera found on this device.', 'error');
          } else if (vErr2.name === 'NotReadableError' || vErr2.name === 'TrackStartError') {
            showToast('Camera is in use by another application.', 'error');
          } else {
            showToast('Could not open camera: ' + (vErr2.message || 'Check camera connection'), 'error');
          }
        }
      }
    }

    // If microphone is requested and we don't have an audioTrack yet, request microphone independently
    if (wantMic && !audioTrack) {
      try {
        const aStreamBasic = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioTrack = aStreamBasic.getAudioTracks()[0] || null;
      } catch (aErr1) {
        try {
          const aStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          audioTrack = aStream.getAudioTracks()[0] || null;
        } catch (aErr2) {
          console.warn('Microphone access failed:', aErr2);
        }
      }
    }

    // Assemble the local MediaStream
    const finalStream = new MediaStream();

    if (videoTrack) {
      videoTrack.enabled = wantCam;
      finalStream.addTrack(videoTrack);
      setIsCamOff(!wantCam);
    } else {
      setIsCamOff(true);
      if (wantCam) {
        showToast('Camera not available. You can try turning it on inside the call.', 'info');
      }
    }

    if (audioTrack) {
      audioTrack.enabled = wantMic;
      finalStream.addTrack(audioTrack);
      setIsMicMuted(!wantMic);
    } else {
      setIsMicMuted(true);
      if (wantMic) {
        showToast('Microphone not available.', 'info');
      }
    }

    localStreamRef.current = finalStream;
    setLocalStream(finalStream);

    // Attach to local video element if already rendered
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = finalStream;
      localVideoRef.current.muted = true;
      localVideoRef.current.defaultMuted = true;
      localVideoRef.current.playsInline = true;
      if (videoTrack && wantCam) {
        localVideoRef.current.play().catch(console.warn);
      }
    }

    return true;
  };

  const handleCreateMeeting = async () => {
    const trimmed = createName.trim();
    if (!trimmed) {
      showToast('Please enter your name before creating a meeting.', 'error');
      return;
    }
    setCurrentUserName(trimmed);
    setIsHost(true);

    const streamReady = await initLocalStream(createMicChecked, createCamChecked);
    if (!streamReady) return;

    const code = generateRoomCode();
    setCurrentRoomCode(code);
    setupPeer(code, true, trimmed);
  };

  const handleJoinMeeting = async () => {
    const trimmedName = joinName.trim();
    const trimmedCode = joinCode.trim().toUpperCase();

    if (!trimmedName) {
      showToast('Please enter your name.', 'error');
      return;
    }
    if (!trimmedCode) {
      showToast('Please enter a valid meeting code.', 'error');
      return;
    }

    setCurrentUserName(trimmedName);
    setIsHost(false);

    const streamReady = await initLocalStream(joinMicChecked, joinCamChecked);
    if (!streamReady) return;

    setCurrentRoomCode(trimmedCode);
    setupPeer(trimmedCode, false, trimmedName);
  };

  const leaveMeeting = () => {
    // If the host is leaving, end the meeting for all participants
    if (isHostRef.current) {
      broadcastToAll({
        type: 'host-ended-meeting',
        message: 'The host has ended the meeting. The call has ended for everyone.',
      });
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    activeConnectionsRef.current = {};
    activeCallsRef.current = {};
    setParticipants([]);
    setIsScreenSharing(false);
    setIsHandRaised(false);
    setIsHostMuted(false);
    setIsHost(false);
    isHostRef.current = false;
    hostPeerIdRef.current = null;
    setLocallyMutedPeers({});
    setActiveMenuPeerId(null);
    setShowConfirmModal(false);
    setCurrentScreen('welcome');
  };

  const setupPeer = (roomCode: string, isHostUser: boolean, userName: string) => {
    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch (e) {
        console.error(e);
      }
    }

    const cleanCode = roomCode.replace(/[^A-Z0-9]/g, '');
    const hostId = `meeking-room-${cleanCode}`;
    const myId = isHostUser
      ? hostId
      : `meeking-user-${cleanCode}-${Math.floor(Math.random() * 10000)}`.toLowerCase();

    isHostRef.current = isHostUser;
    hostPeerIdRef.current = hostId;

    const peer = new Peer(myId, { debug: 1 });
    peerRef.current = peer;

    peer.on('open', (id) => {
      setCurrentScreen('meeting');

      if (isHostUser) {
        showToast('Meeting created successfully!', 'success');
      } else {
        showToast('Joined meeting successfully!', 'success');
        const hostId = `meeking-room-${cleanCode}`;

        const conn = peer.connect(hostId, {
          metadata: { userName, peerId: id },
        });
        setupDataConnection(conn, userName, peer);

        const streamToSend = localStreamRef.current || new MediaStream();
        const call = peer.call(hostId, streamToSend, {
          metadata: { userName },
        });
        if (call) {
          activeCallsRef.current[call.peer] = call;
          handleCallStream(call);
        }
      }
    });

    peer.on('connection', (conn) => {
      setupDataConnection(conn, userName, peer);
    });

    peer.on('call', (call) => {
      const remoteName = (call.metadata && call.metadata.userName) || 'Participant';
      activeCallsRef.current[call.peer] = call;

      setParticipants((prev) => {
        const index = prev.findIndex((p) => p.peerId === call.peer);
        if (index >= 0) {
          const copy = [...prev];
          copy[index] = { ...copy[index], userName: copy[index].userName === 'Participant' ? remoteName : copy[index].userName };
          return copy;
        }
        return [...prev, { peerId: call.peer, userName: remoteName }];
      });

      const streamToSend = isScreenSharingRef.current && screenStreamRef.current
        ? screenStreamRef.current
        : (localStreamRef.current || new MediaStream());

      call.answer(streamToSend);
      handleCallStream(call);
    });

    peer.on('error', (err) => {
      console.error(err);
      if (err.type === 'unavailable-id') {
        if (isHostUser) {
          setupPeer(generateRoomCode(), true, userName);
        } else {
          showToast('Meeting code not found.', 'error');
          leaveMeeting();
        }
      } else if (err.type === 'peer-unavailable') {
        showToast('The host has ended or left the meeting.', 'error');
        leaveMeeting();
      }
    });
  };

  const broadcastRoomSync = () => {
    if (!isHostRef.current || !peerRef.current) return;

    const hostEntry = {
      peerId: peerRef.current.id,
      userName: currentUserNameRef.current || 'Host',
      isMicMuted: isMicMutedRef.current,
      isCamOff: isCamOffRef.current,
      isHandRaised: isHandRaisedRef.current,
      isHostMuted: isHostMutedRef.current,
      isScreenSharing: isScreenSharingRef.current,
      isHost: true,
    };

    const memberEntries = participantsRef.current.map((p) => ({
      peerId: p.peerId,
      userName: p.userName || 'Participant',
      isMicMuted: p.isMicMuted,
      isCamOff: p.isCamOff,
      isHandRaised: p.isHandRaised,
      isHostMuted: p.isHostMuted,
      isScreenSharing: p.isScreenSharing,
      isScreenShareDisabled: p.isScreenShareDisabled,
      isHost: false,
    }));

    const allMembers = [hostEntry, ...memberEntries];

    broadcastToAll({
      type: 'room-sync',
      members: allMembers,
    });
  };

  const setupDataConnection = (conn: DataConnection, myUserName: string, peer: Peer) => {
    activeConnectionsRef.current[conn.peer] = conn;

    conn.on('open', () => {
      conn.send({
        type: 'user-info',
        userName: currentUserNameRef.current || myUserName,
        peerId: peer.id,
        isMicMuted: isMicMutedRef.current,
        isCamOff: isCamOffRef.current,
        isHandRaised: isHandRaisedRef.current,
        isHostMuted: isHostMutedRef.current,
        isScreenSharing: isScreenSharingRef.current,
        isScreenShareDisabled: isScreenShareDisabledRef.current,
      });

      if (isHostRef.current) {
        if (!knownPeersRef.current.includes(conn.peer)) {
          knownPeersRef.current.push(conn.peer);
        }

        const peerList = participantsRef.current
          .map((p) => p.peerId)
          .filter((id) => id !== conn.peer && id !== peer.id);

        conn.send({
          type: 'peer-list',
          peers: peerList,
        });

        broadcastToAllExcluding(conn.peer, {
          type: 'new-peer',
          peerId: conn.peer,
          userName: (conn.metadata && conn.metadata.userName) || 'Participant',
        });

        setTimeout(broadcastRoomSync, 100);
      }
    });

    conn.on('data', (data) => {
      handlePeerData(conn.peer, data, myUserName, peer);
    });

    conn.on('close', () => {
      if (!isHostRef.current && hostPeerIdRef.current && conn.peer === hostPeerIdRef.current) {
        showToast('The host has left the meeting. The call has ended for everyone.', 'error');
        leaveMeeting();
      } else {
        if (activeConnectionsRef.current[conn.peer] === conn) {
          delete activeConnectionsRef.current[conn.peer];
          if (!activeCallsRef.current[conn.peer]) {
            removeParticipant(conn.peer);
          }
        }
      }
    });
  };

  const broadcastToAllExcluding = (excludePeerId: string, data: unknown) => {
    for (const peerId in activeConnectionsRef.current) {
      if (peerId !== excludePeerId) {
        try {
          activeConnectionsRef.current[peerId].send(data);
        } catch (e) {
          console.error(e);
        }
      }
    }
  };

  const broadcastToAll = (data: unknown) => {
    for (const peerId in activeConnectionsRef.current) {
      try {
        activeConnectionsRef.current[peerId].send(data);
      } catch (e) {
        console.error('Broadcast error:', e);
      }
    }
  };

  const handlePeerData = (peerId: string, data: any, myUserName: string, peer: Peer) => {
    if (!data || typeof data !== 'object') return;

    if (data.type === 'user-info') {
      setParticipants((prev) => {
        const index = prev.findIndex((p) => p.peerId === peerId);
        const updated: RemoteParticipant = {
          peerId,
          userName: data.userName || 'Participant',
          isMicMuted: data.isMicMuted,
          isCamOff: data.isCamOff,
          isHandRaised: data.isHandRaised,
          isHostMuted: data.isHostMuted || false,
          isScreenSharing: data.isScreenSharing || false,
          isScreenShareDisabled: data.isScreenShareDisabled || false,
        };
        if (index >= 0) {
          const copy = [...prev];
          copy[index] = { ...copy[index], ...updated };
          return copy;
        }
        return [...prev, updated];
      });

      if (isHostRef.current) {
        setTimeout(broadcastRoomSync, 50);
      }
    } else if (data.type === 'status-update') {
      setParticipants((prev) => {
        const index = prev.findIndex((p) => p.peerId === peerId);
        if (index < 0) return prev;
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          isMicMuted: data.isMicMuted !== undefined ? data.isMicMuted : copy[index].isMicMuted,
          isCamOff: data.isCamOff !== undefined ? data.isCamOff : copy[index].isCamOff,
          isHostMuted: data.isHostMuted !== undefined ? data.isHostMuted : copy[index].isHostMuted,
          isScreenSharing: data.isScreenSharing !== undefined ? data.isScreenSharing : copy[index].isScreenSharing,
          isScreenShareDisabled: data.isScreenShareDisabled !== undefined ? data.isScreenShareDisabled : copy[index].isScreenShareDisabled,
        };
        return copy;
      });

      if (isHostRef.current) {
        setTimeout(broadcastRoomSync, 50);
      }
    } else if (data.type === 'room-sync') {
      if (!Array.isArray(data.members)) return;
      const myId = peer.id;
      const remoteMembers = data.members.filter((m: any) => m.peerId !== myId);

      setParticipants((prev) => {
        return remoteMembers.map((rm: any) => {
          const existing = prev.find((p) => p.peerId === rm.peerId);
          return {
            peerId: rm.peerId,
            userName: rm.userName || existing?.userName || 'Participant',
            stream: existing?.stream,
            isMicMuted: rm.isMicMuted !== undefined ? rm.isMicMuted : existing?.isMicMuted,
            isCamOff: rm.isCamOff !== undefined ? rm.isCamOff : existing?.isCamOff,
            isHandRaised: rm.isHandRaised !== undefined ? rm.isHandRaised : existing?.isHandRaised,
            isHostMuted: rm.isHostMuted !== undefined ? rm.isHostMuted : existing?.isHostMuted,
            isScreenSharing: rm.isScreenSharing !== undefined ? rm.isScreenSharing : existing?.isScreenSharing,
            isScreenShareDisabled: rm.isScreenShareDisabled !== undefined ? rm.isScreenShareDisabled : existing?.isScreenShareDisabled,
            isHost: rm.isHost !== undefined ? rm.isHost : existing?.isHost,
          };
        });
      });

      if (!isHostRef.current) {
        remoteMembers.forEach((rm: any, index: number) => {
          if (rm.peerId !== hostPeerIdRef.current) {
            const hasCall = !!activeCallsRef.current[rm.peerId];
            const hasConn = !!activeConnectionsRef.current[rm.peerId];
            if (!hasCall || !hasConn) {
              if (myId < rm.peerId) {
                setTimeout(() => {
                  connectToPeer(rm.peerId, myUserName, peer);
                }, 100 + index * 150);
              } else {
                setTimeout(() => {
                  if (!activeCallsRef.current[rm.peerId]) {
                    connectToPeer(rm.peerId, myUserName, peer);
                  }
                }, 3500 + index * 150);
              }
            }
          }
        });
      }
    } else if (data.type === 'hand-raise') {
      setParticipants((prev) => {
        const index = prev.findIndex((p) => p.peerId === peerId);
        if (index < 0) return prev;
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          isHandRaised: !!data.isHandRaised,
        };
        return copy;
      });
      if (data.isHandRaised) {
        playHandRaiseSound();
        const p = participantsRef.current.find((item) => item.peerId === peerId);
        const pName = p?.userName || 'Someone';
        showToast(`${pName} raised their hand!`, 'info');
      }
    } else if (data.type === 'host-ended-meeting') {
      showToast(data.message || 'The host has ended the meeting. The call has ended for everyone.', 'error');
      leaveMeeting();
      return;
    } else if (data.type === 'host-kicked-you') {
      showToast(data.message || 'You have been removed from the meeting by the host.', 'error');
      leaveMeeting();
    } else if (data.type === 'peer-kicked') {
      if (data.peerId) {
        removeParticipant(data.peerId);
      }
    } else if (data.type === 'host-force-mute') {
      setIsHostMuted(true);
      if (localStreamRef.current) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = false;
        }
      }
      setIsMicMuted(true);
      broadcastToAll({
        type: 'status-update',
        isMicMuted: true,
        isHostMuted: true,
      });
      showToast('The host has muted your microphone. You cannot unmute until the host allows it.', 'error');
    } else if (data.type === 'host-allow-unmute') {
      setIsHostMuted(false);
      broadcastToAll({
        type: 'status-update',
        isHostMuted: false,
      });
      showToast('The host has unmuted you. You can now turn on your microphone.', 'success');
    } else if (data.type === 'host-force-cam-off') {
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = false;
        }
      }
      setIsCamOff(true);
      broadcastToAll({
        type: 'status-update',
        isCamOff: true,
      });
      showToast('The host turned off your camera.', 'info');
    } else if (data.type === 'host-force-stop-screenshare') {
      stopScreenShare();
      showToast('The host turned off your screen share.', 'info');
    } else if (data.type === 'host-disable-screenshare') {
      setIsScreenShareDisabled(true);
      if (isScreenSharingRef.current) {
        stopScreenShare();
      }
      broadcastToAll({
        type: 'status-update',
        isScreenShareDisabled: true,
      });
      showToast('The host has disabled screen sharing for you.', 'error');
    } else if (data.type === 'host-enable-screenshare') {
      setIsScreenShareDisabled(false);
      broadcastToAll({
        type: 'status-update',
        isScreenShareDisabled: false,
      });
      showToast('The host allowed you to share your screen.', 'success');
    } else if (data.type === 'participant-host-mute-update') {
      setParticipants((prev) =>
        prev.map((p) => (p.peerId === data.peerId ? { ...p, isHostMuted: data.isHostMuted } : p))
      );
    } else if (data.type === 'peer-list') {
      if (Array.isArray(data.peers)) {
        data.peers.forEach((targetPeerId: string, idx: number) => {
          if (targetPeerId !== peer.id) {
            setParticipants((prev) => {
              if (prev.some((p) => p.peerId === targetPeerId)) return prev;
              return [...prev, { peerId: targetPeerId, userName: 'Participant' }];
            });
            setTimeout(() => {
              connectToPeer(targetPeerId, myUserName, peer);
            }, idx * 250);
          }
        });
      }
    } else if (data.type === 'new-peer') {
      if (data.peerId && data.peerId !== peer.id) {
        setParticipants((prev) => {
          const index = prev.findIndex((p) => p.peerId === data.peerId);
          if (index >= 0) {
            const copy = [...prev];
            copy[index] = { ...copy[index], userName: data.userName || copy[index].userName };
            return copy;
          }
          return [...prev, { peerId: data.peerId, userName: data.userName || 'Participant' }];
        });
        if (peer.id < data.peerId) {
          setTimeout(() => {
            connectToPeer(data.peerId, myUserName, peer);
          }, 200);
        } else {
          setTimeout(() => {
            if (!activeCallsRef.current[data.peerId]) {
              connectToPeer(data.peerId, myUserName, peer);
            }
          }, 3500);
        }
      }
    }
  };

  const connectToPeer = (targetPeerId: string, myUserName: string, peer: Peer) => {
    if (!targetPeerId || targetPeerId === peer.id) return;

    if (!activeConnectionsRef.current[targetPeerId]) {
      const conn = peer.connect(targetPeerId, {
        metadata: { userName: myUserName, peerId: peer.id },
      });
      setupDataConnection(conn, myUserName, peer);
    }

    if (!activeCallsRef.current[targetPeerId]) {
      const streamToSend = isScreenSharingRef.current && screenStreamRef.current
        ? screenStreamRef.current
        : (localStreamRef.current || new MediaStream());

      const call = peer.call(targetPeerId, streamToSend, {
        metadata: { userName: myUserName },
      });
      if (call) {
        activeCallsRef.current[call.peer] = call;
        handleCallStream(call);
      }
    }
  };

  const handleCallStream = (call: MediaConnection) => {
    call.on('stream', (remoteStream) => {
      const remotePeerId = call.peer;
      const remoteName = (call.metadata && call.metadata.userName) || 'Participant';

      setParticipants((prev) => {
        const index = prev.findIndex((p) => p.peerId === remotePeerId);
        if (index >= 0) {
          const copy = [...prev];
          copy[index] = {
            ...copy[index],
            userName: copy[index].userName === 'Participant' ? remoteName : copy[index].userName,
            stream: remoteStream,
          };
          return copy;
        }
        return [
          ...prev,
          {
            peerId: remotePeerId,
            userName: remoteName,
            stream: remoteStream,
          },
        ];
      });
    });

    call.on('close', () => {
      if (!isHostRef.current && hostPeerIdRef.current && call.peer === hostPeerIdRef.current) {
        showToast('The host has left the meeting. The call has ended for everyone.', 'error');
        leaveMeeting();
      } else {
        if (activeCallsRef.current[call.peer] === call) {
          delete activeCallsRef.current[call.peer];
          if (!activeConnectionsRef.current[call.peer]) {
            removeParticipant(call.peer);
          } else {
            setParticipants((prev) =>
              prev.map((p) => (p.peerId === call.peer ? { ...p, stream: undefined } : p))
            );
          }
        }
      }
    });

    call.on('error', (err) => {
      console.warn('Call error with peer', call.peer, err);
    });
  };

  const removeParticipant = (peerId: string) => {
    setParticipants((prev) => prev.filter((p) => p.peerId !== peerId));

    if (activeConnectionsRef.current[peerId]) {
      try {
        activeConnectionsRef.current[peerId].close();
      } catch (e) {
        console.error(e);
      }
      delete activeConnectionsRef.current[peerId];
    }
    if (activeCallsRef.current[peerId]) {
      try {
        activeCallsRef.current[peerId].close();
      } catch (e) {
        console.error(e);
      }
      delete activeCallsRef.current[peerId];
    }

    if (isHostRef.current) {
      setTimeout(broadcastRoomSync, 100);
    }
  };

  const toggleLocalMute = (peerId: string) => {
    const isCurrentlyMuted = !locallyMutedPeers[peerId];
    const target = participantsRef.current.find((p) => p.peerId === peerId);
    const name = target?.userName || 'Participant';

    setLocallyMutedPeers((prev) => ({
      ...prev,
      [peerId]: isCurrentlyMuted,
    }));

    const videoEl = document.getElementById(`video-${peerId}`) as HTMLVideoElement | null;
    if (videoEl) {
      videoEl.muted = isCurrentlyMuted;
    }

    if (isCurrentlyMuted) {
      showToast(`Muted ${name} for you only.`, 'info');
    } else {
      showToast(`Unmuted ${name} for you.`, 'info');
    }
    setActiveMenuPeerId(null);
  };

  const hostKickParticipant = (peerId: string) => {
    if (!isHostRef.current) return;
    const target = participantsRef.current.find((p) => p.peerId === peerId);
    const name = target?.userName || 'Participant';

    const conn = activeConnectionsRef.current[peerId];
    if (conn && conn.open) {
      conn.send({
        type: 'host-kicked-you',
        message: 'You have been removed from the meeting by the host.',
      });
    }

    broadcastToAllExcluding(peerId, {
      type: 'peer-kicked',
      peerId,
    });

    removeParticipant(peerId);
    showToast(`Removed ${name} from the meeting.`, 'success');
    setActiveMenuPeerId(null);
  };

  const hostToggleMuteParticipant = (peerId: string) => {
    if (!isHostRef.current) return;
    const target = participantsRef.current.find((p) => p.peerId === peerId);
    if (!target) return;

    const nextHostMuted = !target.isHostMuted;

    setParticipants((prev) =>
      prev.map((p) => (p.peerId === peerId ? { ...p, isHostMuted: nextHostMuted } : p))
    );

    const conn = activeConnectionsRef.current[peerId];
    if (conn && conn.open) {
      conn.send({
        type: nextHostMuted ? 'host-force-mute' : 'host-allow-unmute',
      });
    }

    broadcastToAllExcluding(peerId, {
      type: 'participant-host-mute-update',
      peerId,
      isHostMuted: nextHostMuted,
    });

    if (nextHostMuted) {
      showToast(`Muted microphone for ${target.userName}.`, 'info');
    } else {
      showToast(`Allowed microphone for ${target.userName}.`, 'success');
    }
    setActiveMenuPeerId(null);
    setTimeout(broadcastRoomSync, 50);
  };

  const hostTurnOffCamera = (peerId: string) => {
    if (!isHostRef.current) return;
    const target = participantsRef.current.find((p) => p.peerId === peerId);
    if (!target) return;

    const conn = activeConnectionsRef.current[peerId];
    if (conn && conn.open) {
      conn.send({
        type: 'host-force-cam-off',
      });
    }

    showToast(`Turned off camera for ${target.userName}.`, 'info');
    setActiveMenuPeerId(null);
  };

  const hostStopMemberScreenShare = (peerId: string) => {
    if (!isHostRef.current) return;
    const target = participantsRef.current.find((p) => p.peerId === peerId);
    if (!target) return;

    const conn = activeConnectionsRef.current[peerId];
    if (conn && conn.open) {
      conn.send({
        type: 'host-force-stop-screenshare',
      });
    }

    setParticipants((prev) =>
      prev.map((p) => (p.peerId === peerId ? { ...p, isScreenSharing: false } : p))
    );
    showToast(`Stopped screen share for ${target.userName}.`, 'info');
    setActiveMenuPeerId(null);
    setTimeout(broadcastRoomSync, 50);
  };

  const hostToggleDisableMemberScreenShare = (peerId: string) => {
    if (!isHostRef.current) return;
    const target = participantsRef.current.find((p) => p.peerId === peerId);
    if (!target) return;

    const nextDisabled = !target.isScreenShareDisabled;

    setParticipants((prev) =>
      prev.map((p) => (p.peerId === peerId ? { ...p, isScreenShareDisabled: nextDisabled } : p))
    );

    const conn = activeConnectionsRef.current[peerId];
    if (conn && conn.open) {
      conn.send({
        type: nextDisabled ? 'host-disable-screenshare' : 'host-enable-screenshare',
      });
    }

    if (nextDisabled) {
      showToast(`Disabled screen sharing for ${target.userName}.`, 'info');
    } else {
      showToast(`Allowed screen sharing for ${target.userName}.`, 'success');
    }
    setActiveMenuPeerId(null);
    setTimeout(broadcastRoomSync, 50);
  };

  const toggleMic = async () => {
    if (isHostMuted) {
      showToast('The host has muted your microphone. You cannot unmute until the host unmutes you.', 'error');
      return;
    }

    let audioTrack = localStreamRef.current ? localStreamRef.current.getAudioTracks()[0] : null;

    if (isMicMuted) {
      // Unmute microphone
      if (audioTrack && audioTrack.readyState === 'live') {
        audioTrack.enabled = true;
        setIsMicMuted(false);
      } else {
        // No live audio track exists, acquire it
        try {
          const newAudioStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          const newTrack = newAudioStream.getAudioTracks()[0];
          if (!newTrack) {
            showToast('No microphone detected.', 'error');
            return;
          }

          if (!localStreamRef.current) {
            localStreamRef.current = new MediaStream();
          }
          if (audioTrack) {
            localStreamRef.current.removeTrack(audioTrack);
            try { audioTrack.stop(); } catch {}
          }
          localStreamRef.current.addTrack(newTrack);
          setIsMicMuted(false);

          for (const peerId in activeCallsRef.current) {
            const call = activeCallsRef.current[peerId];
            if (call && call.peerConnection) {
              const sender = call.peerConnection.getSenders().find((s) => s.track && s.track.kind === 'audio');
              if (sender) {
                sender.replaceTrack(newTrack);
              } else {
                try {
                  call.peerConnection.addTrack(newTrack, localStreamRef.current);
                } catch (e) {
                  console.warn('Could not add audio track to call:', e);
                }
              }
            }
          }
        } catch (micErr) {
          showToast('Could not access microphone.', 'error');
          return;
        }
      }

      broadcastToAll({
        type: 'status-update',
        isMicMuted: false,
      });
      showToast('Microphone unmuted.', 'info');
    } else {
      // Mute microphone
      if (audioTrack) {
        audioTrack.enabled = false;
      }
      setIsMicMuted(true);

      broadcastToAll({
        type: 'status-update',
        isMicMuted: true,
      });
      showToast('Microphone muted.', 'info');
    }
  };

  const toggleCam = async () => {
    let videoTrack = localStreamRef.current ? localStreamRef.current.getVideoTracks()[0] : null;

    if (isCamOff) {
      // Turn camera ON
      if (videoTrack && videoTrack.readyState === 'live') {
        videoTrack.enabled = true;
        setIsCamOff(false);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));

        if (localVideoRef.current) {
          localVideoRef.current.muted = true;
          localVideoRef.current.defaultMuted = true;
          localVideoRef.current.playsInline = true;
          localVideoRef.current.play().catch((err) => console.warn('Play error:', err));
        }

        broadcastToAll({
          type: 'status-update',
          isCamOff: false,
        });
        showToast('Camera turned on.', 'success');
      } else {
        // No live video track exists, request camera from browser
        try {
          let newVideoStream: MediaStream;
          try {
            newVideoStream = await navigator.mediaDevices.getUserMedia({ video: true });
          } catch {
            newVideoStream = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            });
          }

          const newTrack = newVideoStream.getVideoTracks()[0];
          if (!newTrack) {
            showToast('No camera found on this device.', 'error');
            return;
          }

          if (!localStreamRef.current) {
            localStreamRef.current = new MediaStream();
          }

          // Clean up old video tracks
          localStreamRef.current.getVideoTracks().forEach((t) => {
            localStreamRef.current?.removeTrack(t);
            try { t.stop(); } catch {}
          });

          localStreamRef.current.addTrack(newTrack);
          setIsCamOff(false);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));

          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
            localVideoRef.current.muted = true;
            localVideoRef.current.defaultMuted = true;
            localVideoRef.current.playsInline = true;
            localVideoRef.current.play().catch(console.warn);
          }

          // Update active WebRTC calls with new video track
          for (const peerId in activeCallsRef.current) {
            const call = activeCallsRef.current[peerId];
            if (call && call.peerConnection) {
              const sender = call.peerConnection.getSenders().find((s) => s.track && s.track.kind === 'video');
              if (sender) {
                sender.replaceTrack(newTrack);
              } else {
                try {
                  call.peerConnection.addTrack(newTrack, localStreamRef.current);
                } catch (e) {
                  console.warn('Could not add video track to call:', e);
                }
              }
            }
          }

          broadcastToAll({
            type: 'status-update',
            isCamOff: false,
          });
          showToast('Camera turned on.', 'success');
        } catch (camErr: any) {
          console.error('Camera toggle error:', camErr);
          if (camErr.name === 'NotAllowedError' || camErr.name === 'PermissionDeniedError') {
            showToast('Camera permission denied. Please allow camera in browser address bar.', 'error');
          } else if (camErr.name === 'NotFoundError' || camErr.name === 'DevicesNotFoundError') {
            showToast('No camera detected on this device.', 'error');
          } else if (camErr.name === 'NotReadableError' || camErr.name === 'TrackStartError') {
            showToast('Camera is currently used by another application.', 'error');
          } else {
            showToast('Could not start camera: ' + (camErr.message || 'Error'), 'error');
          }
        }
      }
    } else {
      // Turn camera OFF
      if (videoTrack) {
        videoTrack.enabled = false;
      }
      setIsCamOff(true);
      if (localStreamRef.current) {
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }

      broadcastToAll({
        type: 'status-update',
        isCamOff: true,
      });
      showToast('Camera turned off.', 'info');
    }
  };

  const toggleRaiseHand = () => {
    const nextState = !isHandRaised;
    setIsHandRaised(nextState);

    if (nextState) {
      playHandRaiseSound();
      showToast('You raised your hand.', 'info');
    }

    broadcastToAll({
      type: 'hand-raise',
      isHandRaised: nextState,
    });
  };

  const toggleScreenShare = async () => {
    if (isScreenShareDisabledRef.current) {
      showToast('Screen sharing has been disabled by the host.', 'error');
      return;
    }

    if (!isScreenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStreamRef.current = stream;
        const screenTrack = stream.getVideoTracks()[0];

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setIsScreenSharing(true);

        for (const peerId in activeCallsRef.current) {
          const call = activeCallsRef.current[peerId];
          if (call && call.peerConnection) {
            const sender = call.peerConnection.getSenders().find((s) => s.track && s.track.kind === 'video');
            if (sender) {
              sender.replaceTrack(screenTrack);
            }
          }
        }

        broadcastToAll({
          type: 'status-update',
          isScreenSharing: true,
        });

        if (isHostRef.current) {
          setTimeout(broadcastRoomSync, 50);
        }

        screenTrack.onended = () => {
          stopScreenShare();
        };

        showToast('Screen sharing started.', 'success');
      } catch (err) {
        console.warn('Screen share cancelled or failed', err);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    if (!isScreenSharingRef.current && !screenStreamRef.current) return;
    setIsScreenSharing(false);

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    const videoTrack = localStreamRef.current ? localStreamRef.current.getVideoTracks()[0] : null;
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }

    for (const peerId in activeCallsRef.current) {
      const call = activeCallsRef.current[peerId];
      if (call && call.peerConnection) {
        const sender = call.peerConnection.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender && videoTrack) {
          sender.replaceTrack(videoTrack);
        }
      }
    }

    broadcastToAll({
      type: 'status-update',
      isScreenSharing: false,
    });

    if (isHostRef.current) {
      setTimeout(broadcastRoomSync, 50);
    }

    showToast('Screen sharing stopped.', 'info');
  };

  const toggleFullscreen = (elementId: string) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {
        showToast('Error attempting to enable fullscreen.', 'error');
      });
    } else {
      document.exitFullscreen();
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(currentRoomCode);
    showToast('Room code copied to clipboard!', 'success');
  };

  const participantCount = participants.length + 1;

  return (
    <div className="h-full flex flex-col justify-between overflow-x-hidden bg-[#1a1b1e] text-[#e8eaed]">
      {/* Toast Notifications */}
      <div id="toast-container" className="fixed top-4 sm:top-6 right-4 sm:right-6 left-4 sm:left-auto z-50 flex flex-col space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border shadow-2xl text-xs font-medium flex items-center space-x-2 transition-all backdrop-blur-xl ${
              t.type === 'error'
                ? 'bg-rose-600/90 border-rose-500 text-white'
                : t.type === 'success'
                ? 'bg-emerald-600/90 border-emerald-500 text-white'
                : 'bg-[#292a2d] border-[#3c4043] text-white'
            }`}
          >
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Custom Confirmation Modal for Leaving */}
      {showConfirmModal && (
        <div
          id="confirm-modal"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#292a2d] border border-[#3c4043] rounded-2xl sm:rounded-3xl p-5 sm:p-6 max-w-sm w-full shadow-2xl text-center space-y-4 mx-3">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-rose-600/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto text-rose-400 text-xl sm:text-2xl">
              <PhoneOff className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <h3 className="text-lg sm:text-xl font-medium text-white">
              {isHost ? 'End Meeting for All?' : 'Leave Meeting?'}
            </h3>
            <p className="text-xs text-[#9aa0a6]">
              {isHost
                ? 'You are the host. Leaving will end the meeting and disconnect all participants.'
                : 'Are you sure you want to leave this meeting room?'}
            </p>
            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="w-1/2 bg-[#3c4043] hover:bg-[#4f5358] text-[#e8eaed] font-medium py-2.5 sm:py-3 rounded-xl sm:rounded-2xl transition-all border border-[#5f6368] text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  leaveMeeting();
                }}
                className="w-1/2 bg-rose-600 hover:bg-rose-500 text-white font-medium py-2.5 sm:py-3 rounded-xl sm:rounded-2xl transition-all shadow-lg shadow-rose-600/30 text-xs cursor-pointer"
              >
                {isHost ? 'End Call' : 'Leave'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-4 bg-[#1a1b1e]/80 backdrop-blur-md border-b border-[#3c4043]/60 z-20 shrink-0">
        <div
          className="flex items-center space-x-2 sm:space-x-3 cursor-pointer select-none"
          onClick={() => {
            if (currentScreen === 'meeting') {
              setShowConfirmModal(true);
            }
          }}
        >
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-lg sm:text-xl shadow-inner shrink-0">
            <Video className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-medium text-white tracking-tight leading-tight">Meeking</h1>
            <p className="text-[10px] sm:text-xs text-[#9aa0a6] hidden sm:block">An easy medium for completely free and great meetings.</p>
          </div>
        </div>

        {currentScreen === 'meeting' && (
          <div id="meeting-top-bar" className="flex items-center space-x-1.5 sm:space-x-3 shrink-0">
            {/* Room code visible ONLY to the host */}
            {isHost && (
              <div
                id="room-code-badge-container"
                className="bg-[#292a2d] border border-[#3c4043] px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-xl sm:rounded-2xl flex items-center space-x-1.5 sm:space-x-2 shadow-lg"
              >
                <span className="text-[10px] sm:text-xs text-[#9aa0a6] uppercase font-semibold hidden md:inline">Code:</span>
                <span id="display-room-code" className="text-xs sm:text-sm font-mono font-bold text-blue-400 tracking-wider">
                  {currentRoomCode}
                </span>
                <button
                  type="button"
                  onClick={copyRoomCode}
                  className="text-[#9aa0a6] hover:text-white transition-colors cursor-pointer p-0.5"
                  title="Copy code"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {isHost && (
              <div
                id="host-badge"
                className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] sm:text-xs font-semibold px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl sm:rounded-2xl flex items-center space-x-1 shadow-md"
              >
                <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden xs:inline">Host</span>
              </div>
            )}
            <div
              id="participant-count"
              className="bg-[#292a2d] border border-[#3c4043] text-[#e8eaed] text-[11px] sm:text-xs font-medium px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl sm:rounded-2xl flex items-center space-x-1.5 shadow-lg"
            >
              <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-400" />
              <span id="participant-count-text" className="hidden sm:inline">Participants: </span>
              <span>{participantCount}</span>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col bg-[#1a1b1e] overflow-hidden ${
        currentScreen === 'meeting' ? 'p-1.5 sm:p-3 md:p-4' : 'items-center justify-center p-4 md:p-6 overflow-y-auto'
      }`}>
        {/* Welcome Screen */}
        {currentScreen === 'welcome' && (
          <div
            id="welcome-screen"
            className="w-full max-w-md bg-[#292a2d] border border-[#3c4043] p-6 sm:p-8 rounded-2xl sm:rounded-3xl shadow-2xl text-center space-y-5 sm:space-y-6 mx-auto my-auto"
          >
            <div className="space-y-2">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-600/10 border border-blue-500/20 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto text-blue-400 text-2xl sm:text-3xl shadow-inner mb-3 sm:mb-4">
                <Video className="w-8 h-8 sm:w-10 sm:h-10" />
              </div>
              <h2 className="text-xl sm:text-2xl font-normal text-white">Video meetings for everyone</h2>
              <p className="text-xs sm:text-sm text-[#9aa0a6]">An easy medium for completely free and great meetings.</p>
            </div>

            <div className="space-y-3 pt-1 sm:pt-2">
              <button
                type="button"
                onClick={() => setCurrentScreen('create-name')}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 sm:py-3.5 px-4 rounded-xl sm:rounded-2xl shadow-lg shadow-blue-600/30 transition-all duration-200 flex items-center justify-center space-x-2 active:scale-95 cursor-pointer text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Create Meeting</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrentScreen('join')}
                className="w-full bg-[#3c4043] hover:bg-[#4f5358] text-[#e8eaed] font-medium py-3 sm:py-3.5 px-4 rounded-xl sm:rounded-2xl border border-[#5f6368] transition-all duration-200 flex items-center justify-center space-x-2 active:scale-95 cursor-pointer text-sm"
              >
                <LogIn className="w-4 h-4" />
                <span>Join Meeting</span>
              </button>
            </div>
          </div>
        )}

        {/* Create Meeting Name & Device Setup Screen */}
        {currentScreen === 'create-name' && (
          <div
            id="create-name-screen"
            className="w-full max-w-md bg-[#292a2d] border border-[#3c4043] p-6 sm:p-8 rounded-2xl sm:rounded-3xl shadow-2xl text-center space-y-4 sm:space-y-6 mx-auto my-auto"
          >
            <div className="space-y-1.5 sm:space-y-2">
              <div className="w-14 h-14 sm:w-16 sm:h-16 bg-blue-600/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto text-blue-400 text-xl sm:text-2xl mb-2 sm:mb-4">
                <UserCheck className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <h2 className="text-xl sm:text-2xl font-normal text-white">Enter Your Name & Devices</h2>
              <p className="text-xs sm:text-sm text-[#9aa0a6]">Configure your profile and setup before starting.</p>
            </div>

            <div className="space-y-3.5 sm:space-y-4 text-left pt-1 sm:pt-2">
              <div>
                <label className="block text-xs font-medium text-[#9aa0a6] mb-1.5 ml-1">Your Name</label>
                <input
                  type="text"
                  id="create-name-input"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Enter your name..."
                  className="w-full bg-[#202124] border border-[#5f6368] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white placeholder-[#9aa0a6] text-sm rounded-xl sm:rounded-2xl px-3.5 sm:px-4 py-3 sm:py-3.5 outline-none transition-all shadow-inner"
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="block text-xs font-medium text-[#9aa0a6] ml-1">Device Preferences</label>
                <div className="flex items-center justify-between bg-[#202124] px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-[#3c4043]">
                  <span className="text-xs sm:text-sm text-white">Start with Microphone ON</span>
                  <input
                    type="checkbox"
                    id="create-mic-check"
                    checked={createMicChecked}
                    onChange={(e) => setCreateMicChecked(e.target.checked)}
                    className="w-4 h-4 sm:w-5 sm:h-5 accent-blue-600 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between bg-[#202124] px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-[#3c4043]">
                  <span className="text-xs sm:text-sm text-white">Start with Camera ON</span>
                  <input
                    type="checkbox"
                    id="create-cam-check"
                    checked={createCamChecked}
                    onChange={(e) => setCreateCamChecked(e.target.checked)}
                    className="w-4 h-4 sm:w-5 sm:h-5 accent-blue-600 rounded cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-2 sm:pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentScreen('welcome')}
                  className="w-1/3 bg-[#3c4043] hover:bg-[#4f5358] text-[#e8eaed] font-medium py-3 sm:py-3.5 px-3 sm:px-4 rounded-xl sm:rounded-2xl transition-all duration-200 border border-[#5f6368] cursor-pointer text-xs sm:text-sm"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleCreateMeeting}
                  className="w-2/3 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 sm:py-3.5 px-3 sm:px-4 rounded-xl sm:rounded-2xl shadow-lg shadow-blue-600/30 transition-all duration-200 flex items-center justify-center space-x-2 active:scale-95 cursor-pointer text-xs sm:text-sm"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>Start Meeting</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Join Meeting Screen */}
        {currentScreen === 'join' && (
          <div
            id="join-screen"
            className="w-full max-w-md bg-[#292a2d] border border-[#3c4043] p-6 sm:p-8 rounded-2xl sm:rounded-3xl shadow-2xl text-center space-y-4 sm:space-y-6 mx-auto my-auto"
          >
            <div className="space-y-1.5 sm:space-y-2">
              <div className="w-14 h-14 sm:w-16 sm:h-16 bg-blue-600/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto text-blue-400 text-xl sm:text-2xl mb-2 sm:mb-4">
                <LogIn className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <h2 className="text-xl sm:text-2xl font-normal text-white">Join Meeting Room</h2>
              <p className="text-xs sm:text-sm text-[#9aa0a6]">Enter your name, code and setup devices.</p>
            </div>

            <div className="space-y-3.5 sm:space-y-4 text-left pt-1 sm:pt-2">
              <div>
                <label className="block text-xs font-medium text-[#9aa0a6] mb-1.5 ml-1">Your Name</label>
                <input
                  type="text"
                  id="join-name-input"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full bg-[#202124] border border-[#5f6368] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white placeholder-[#9aa0a6] text-sm rounded-xl sm:rounded-2xl px-3.5 sm:px-4 py-3 sm:py-3.5 outline-none transition-all shadow-inner"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#9aa0a6] mb-1.5 ml-1">Meeting Code</label>
                <input
                  type="text"
                  id="join-code-input"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="MEEK-XXXX"
                  className="w-full bg-[#202124] border border-[#5f6368] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white placeholder-[#9aa0a6] text-sm sm:text-base rounded-xl sm:rounded-2xl px-3.5 sm:px-4 py-3 sm:py-3.5 outline-none transition-all text-center font-mono tracking-widest uppercase shadow-inner"
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="block text-xs font-medium text-[#9aa0a6] ml-1">Device Preferences</label>
                <div className="flex items-center justify-between bg-[#202124] px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-[#3c4043]">
                  <span className="text-xs sm:text-sm text-white">Start with Microphone ON</span>
                  <input
                    type="checkbox"
                    id="join-mic-check"
                    checked={joinMicChecked}
                    onChange={(e) => setJoinMicChecked(e.target.checked)}
                    className="w-4 h-4 sm:w-5 sm:h-5 accent-blue-600 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between bg-[#202124] px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-[#3c4043]">
                  <span className="text-xs sm:text-sm text-white">Start with Camera ON</span>
                  <input
                    type="checkbox"
                    id="join-cam-check"
                    checked={joinCamChecked}
                    onChange={(e) => setJoinCamChecked(e.target.checked)}
                    className="w-4 h-4 sm:w-5 sm:h-5 accent-blue-600 rounded cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-2 sm:pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentScreen('welcome')}
                  className="w-1/3 bg-[#3c4043] hover:bg-[#4f5358] text-[#e8eaed] font-medium py-3 sm:py-3.5 px-3 sm:px-4 rounded-xl sm:rounded-2xl transition-all duration-200 border border-[#5f6368] cursor-pointer text-xs sm:text-sm"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleJoinMeeting}
                  className="w-2/3 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 sm:py-3.5 px-3 sm:px-4 rounded-xl sm:rounded-2xl shadow-lg shadow-blue-600/30 transition-all duration-200 flex items-center justify-center space-x-2 active:scale-95 cursor-pointer text-xs sm:text-sm"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Join Call</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Meeting Screen */}
        {currentScreen === 'meeting' && (
          <div
            id="meeting-screen"
            onClick={() => setActiveMenuPeerId(null)}
            className="w-full flex-1 flex flex-col justify-between overflow-hidden gap-2"
          >
            {/* Video Grid Container */}
            <div id="video-container">
              {/* Local Video */}
              <div id="local-video-wrapper" className="video-wrapper group">
                <video
                  ref={(el) => {
                    localVideoRef.current = el;
                    if (el) {
                      const streamToAttach =
                        isScreenSharing && screenStreamRef.current
                          ? screenStreamRef.current
                          : (localStream || localStreamRef.current);
                      if (streamToAttach && el.srcObject !== streamToAttach) {
                        el.srcObject = streamToAttach;
                      }
                      el.muted = true;
                      el.defaultMuted = true;
                      el.playsInline = true;
                      if (!isCamOff && streamToAttach) {
                        el.play().catch(() => {});
                      }
                    }
                  }}
                  onLoadedMetadata={(e) => {
                    if (!isCamOff) {
                      e.currentTarget.play().catch(() => {});
                    }
                  }}
                  id="local-video"
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-cover ${isScreenSharing ? '' : '-scale-x-100'}`}
                  style={{ display: isCamOff ? 'none' : 'block' }}
                />
                {isCamOff && (
                  <div id="local-avatar" className="participant-avatar">
                    <div className="avatar-letter" id="local-avatar-letter">
                      {(currentUserName.charAt(0) || 'U').toUpperCase()}
                    </div>
                  </div>
                )}

                {/* Mute badge overlay */}
                <div
                  id="local-mute-badge"
                  className={`absolute top-2.5 sm:top-4 right-10 sm:right-14 w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-[#202124]/80 backdrop-blur-md border border-white/10 text-rose-500 flex items-center justify-center shadow-lg ${
                    isMicMuted ? '' : 'hidden'
                  }`}
                >
                  <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>

                {/* Raise hand badge overlay */}
                <div
                  id="local-hand-badge"
                  className={`absolute top-2.5 sm:top-4 left-2.5 sm:left-4 bg-amber-500/90 text-white px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-semibold shadow-lg flex items-center space-x-1 sm:space-x-1.5 backdrop-blur-md animate-bounce ${
                    isHandRaised ? '' : 'hidden'
                  }`}
                >
                  <Hand className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>Hand Raised</span>
                </div>

                {/* Fullscreen Button */}
                <button
                  type="button"
                  onClick={() => toggleFullscreen('local-video-wrapper')}
                  className="absolute top-2.5 sm:top-4 right-2.5 sm:right-4 w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-[#202124]/80 backdrop-blur-md border border-white/10 text-white flex items-center justify-center shadow-lg hover:bg-black transition-all cursor-pointer opacity-70 sm:opacity-0 sm:group-hover:opacity-100"
                  title="Full Screen"
                >
                  <Maximize2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </button>

                <div className="absolute bottom-2.5 sm:bottom-4 left-2.5 sm:left-4 bg-[#202124]/80 backdrop-blur-md px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-white/10 flex items-center space-x-1.5 sm:space-x-2.5 shadow-md z-10 max-w-[calc(100%-4.5rem)]">
                  <div
                    id="local-mic-status"
                    className={`w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full shrink-0 ${isMicMuted ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  />
                  <span id="local-display-name" className="text-[11px] sm:text-xs font-medium text-white truncate">
                    {currentUserName} (You)
                  </span>
                  {isHostMuted && (
                    <span className="text-[9px] sm:text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/30 shrink-0">
                      Muted by Host
                    </span>
                  )}
                </div>
              </div>

              {/* Remote Participants */}
              {participants.map((p) => {
                const firstLetter = (p.userName.charAt(0) || 'P').toUpperCase();
                const isLocallyMuted = !!locallyMutedPeers[p.peerId];
                const showRemoteAvatar = p.isCamOff || !p.stream || p.stream.getVideoTracks().length === 0;

                return (
                  <div key={p.peerId} id={`wrapper-${p.peerId}`} className="video-wrapper group">
                    <video
                      autoPlay
                      playsInline
                      muted={isLocallyMuted}
                      ref={(el) => {
                        if (el) {
                          if (p.stream && el.srcObject !== p.stream) {
                            el.srcObject = p.stream;
                          }
                          el.muted = isLocallyMuted;
                          el.defaultMuted = isLocallyMuted;
                          el.playsInline = true;
                          if (p.stream && !showRemoteAvatar) {
                            el.play().catch(() => {});
                          }
                        }
                      }}
                      onLoadedMetadata={(e) => {
                        const v = e.currentTarget;
                        if (p.stream && !showRemoteAvatar) {
                          v.play().catch(() => {});
                        }
                      }}
                      id={`video-${p.peerId}`}
                      className="w-full h-full object-cover"
                      style={{ display: showRemoteAvatar ? 'none' : 'block' }}
                    />
                    {showRemoteAvatar && (
                      <div id={`avatar-${p.peerId}`} className="participant-avatar">
                        <div className="avatar-letter" id={`avatar-letter-${p.peerId}`}>
                          {firstLetter}
                        </div>
                      </div>
                    )}
                    <div
                      id={`mute-badge-${p.peerId}`}
                      className={`absolute top-2.5 sm:top-4 right-10 sm:right-14 w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-[#202124]/80 backdrop-blur-md border border-white/10 text-rose-500 flex items-center justify-center shadow-lg ${
                        p.isMicMuted ? '' : 'hidden'
                      }`}
                    >
                      <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <div
                      id={`hand-badge-${p.peerId}`}
                      className={`absolute top-2.5 sm:top-4 left-2.5 sm:left-4 bg-amber-500/90 text-white px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-semibold shadow-lg flex items-center space-x-1 sm:space-x-1.5 backdrop-blur-md animate-bounce ${
                        p.isHandRaised ? '' : 'hidden'
                      }`}
                    >
                      <Hand className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      <span>Hand Raised</span>
                    </div>

                    {/* Muted for me indicator */}
                    {isLocallyMuted && (
                      <div
                        id={`local-muted-badge-${p.peerId}`}
                        className="absolute top-2.5 sm:top-4 left-10 sm:left-14 bg-amber-500/90 text-white px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-medium flex items-center space-x-1 backdrop-blur-md shadow-md"
                        title="Muted for you only"
                      >
                        <VolumeX className="w-3 h-3" />
                        <span className="hidden xs:inline">Muted for you</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleFullscreen(`wrapper-${p.peerId}`)}
                      className="absolute top-2.5 sm:top-4 right-2.5 sm:right-4 w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-[#202124]/80 backdrop-blur-md border border-white/10 text-white flex items-center justify-center shadow-lg hover:bg-black transition-all cursor-pointer opacity-70 sm:opacity-0 sm:group-hover:opacity-100"
                      title="Full Screen"
                    >
                      <Maximize2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </button>

                    {/* Name tag on bottom left */}
                    <div className="absolute bottom-2.5 sm:bottom-4 left-2.5 sm:left-4 bg-[#202124]/80 backdrop-blur-md px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-white/10 flex items-center space-x-1.5 sm:space-x-2.5 shadow-md z-10 max-w-[calc(100%-4.5rem)]">
                      <div
                        id={`mic-status-${p.peerId}`}
                        className={`w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full shrink-0 ${p.isMicMuted ? 'bg-rose-500' : 'bg-emerald-500'}`}
                      />
                      <span id={`name-${p.peerId}`} className="text-[11px] sm:text-xs font-medium text-white truncate">
                        {p.userName}
                      </span>

                      {p.isHostMuted && (
                        <span className="text-[9px] sm:text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/30 shrink-0">
                          Host Muted
                        </span>
                      )}
                    </div>

                    {/* 3-Dot Menu Button in Right Down Corner */}
                    <button
                      type="button"
                      id={`btn-menu-${p.peerId}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuPeerId(activeMenuPeerId === p.peerId ? null : p.peerId);
                      }}
                      className={`absolute bottom-2.5 sm:bottom-4 right-2.5 sm:right-4 z-20 w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl backdrop-blur-md border border-white/10 flex items-center justify-center shadow-lg transition-all cursor-pointer ${
                        activeMenuPeerId === p.peerId
                          ? 'bg-blue-600 text-white'
                          : 'bg-[#202124]/80 text-[#9aa0a6] hover:text-white hover:bg-black/90'
                      }`}
                      title="Options"
                    >
                      <MoreVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>

                    {/* 3-Dot Dropdown Menu positioned from Right Down Corner */}
                    {activeMenuPeerId === p.peerId && (
                      <div
                        id={`menu-dropdown-${p.peerId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-11 sm:bottom-14 right-2 sm:right-4 z-30 w-44 sm:w-48 bg-[#292a2d] border border-[#3c4043] rounded-xl sm:rounded-2xl shadow-2xl p-1.5 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
                      >
                        {isHost ? (
                          /* Host controls: Kick, Mute/Unmute, Turn Camera Off, Screen Share Off (if sharing), Disable/Enable Screen Share */
                          <div className="space-y-1">
                            <button
                              type="button"
                              id={`host-mute-btn-${p.peerId}`}
                              onClick={() => hostToggleMuteParticipant(p.peerId)}
                              className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer text-left"
                            >
                              {p.isHostMuted ? (
                                <>
                                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Unmute (Allow mic)</span>
                                </>
                              ) : (
                                <>
                                  <MicOff className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Mute Microphone</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              id={`host-cam-btn-${p.peerId}`}
                              onClick={() => hostTurnOffCamera(p.peerId)}
                              className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer text-left"
                            >
                              <VideoOff className="w-3.5 h-3.5 text-blue-400" />
                              <span>Turn Camera Off</span>
                            </button>

                            {/* Turn Off Screen Share: Only appears when member is currently screen sharing */}
                            {p.isScreenSharing && (
                              <button
                                type="button"
                                id={`host-stop-screenshare-btn-${p.peerId}`}
                                onClick={() => hostStopMemberScreenShare(p.peerId)}
                                className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-white/10 rounded-xl transition-colors cursor-pointer text-left"
                              >
                                <MonitorOff className="w-3.5 h-3.5 text-amber-400" />
                                <span>Turn Off Screen Share</span>
                              </button>
                            )}

                            {/* Disable / Allow Screen Share: ALWAYS in 3-dot menu */}
                            <button
                              type="button"
                              id={`host-disable-screenshare-btn-${p.peerId}`}
                              onClick={() => hostToggleDisableMemberScreenShare(p.peerId)}
                              className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer text-left"
                            >
                              {p.isScreenShareDisabled ? (
                                <>
                                  <Monitor className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Allow Screen Share</span>
                                </>
                              ) : (
                                <>
                                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                                  <span>Disable Screen Share</span>
                                </>
                              )}
                            </button>

                            <div className="h-px bg-[#3c4043] my-1" />

                            <button
                              type="button"
                              id={`host-kick-btn-${p.peerId}`}
                              onClick={() => hostKickParticipant(p.peerId)}
                              className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/20 rounded-xl transition-colors cursor-pointer text-left"
                            >
                              <UserX className="w-3.5 h-3.5 text-rose-400" />
                              <span>Kick Member</span>
                            </button>
                          </div>
                        ) : (
                          /* Normal Member control: Local Mute / Unmute for me */
                          <div>
                            <button
                              type="button"
                              id={`local-mute-btn-${p.peerId}`}
                              onClick={() => toggleLocalMute(p.peerId)}
                              className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer text-left"
                            >
                              {isLocallyMuted ? (
                                <>
                                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Unmute for me</span>
                                </>
                              ) : (
                                <>
                                  <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Mute for me</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Floating Control Bar at Bottom Center */}
            <div className="flex items-center justify-center py-1 sm:py-2 z-10 w-full shrink-0 px-2">
              <div className="bg-[#292a2d] border border-[#3c4043] px-3 sm:px-6 py-2 sm:py-3 rounded-2xl sm:rounded-3xl shadow-2xl flex items-center space-x-2 sm:space-x-4 backdrop-blur-lg max-w-full overflow-x-auto">
                {/* Toggle Mic */}
                <button
                  type="button"
                  id="btn-toggle-mic"
                  onClick={toggleMic}
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all shadow-md group cursor-pointer relative shrink-0 ${
                    isMicMuted
                      ? isHostMuted
                        ? 'bg-rose-950/70 border border-rose-700/70 text-rose-300'
                        : 'bg-rose-600 border border-rose-500 text-white'
                      : 'bg-[#3c4043] hover:bg-[#4f5358] border border-[#5f6368] text-white'
                  }`}
                  title={isHostMuted ? 'Muted by Host (Cannot unmute)' : 'Toggle Microphone'}
                >
                  {isMicMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>

                {/* Toggle Camera */}
                <button
                  type="button"
                  id="btn-toggle-cam"
                  onClick={toggleCam}
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all shadow-md group cursor-pointer shrink-0 ${
                    isCamOff
                      ? 'bg-rose-600 border border-rose-500 text-white'
                      : 'bg-[#3c4043] hover:bg-[#4f5358] border border-[#5f6368] text-white'
                  }`}
                  title="Toggle Camera"
                >
                  {isCamOff ? <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Video className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>

                {/* Raise Hand */}
                <button
                  type="button"
                  id="btn-raise-hand"
                  onClick={toggleRaiseHand}
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all shadow-md group cursor-pointer shrink-0 ${
                    isHandRaised
                      ? 'bg-amber-500 border border-amber-400 text-white'
                      : 'bg-[#3c4043] hover:bg-[#4f5358] border border-[#5f6368] text-white'
                  }`}
                  title="Raise Hand"
                >
                  <Hand className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {/* Share Screen */}
                <button
                  type="button"
                  id="btn-share-screen"
                  onClick={toggleScreenShare}
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all shadow-md group cursor-pointer shrink-0 ${
                    isScreenShareDisabled
                      ? 'bg-[#2a2b2e] border border-[#3c4043] text-gray-500 cursor-not-allowed opacity-60'
                      : isScreenSharing
                      ? 'bg-blue-600 border border-blue-500 text-white'
                      : 'bg-[#3c4043] hover:bg-[#4f5358] border border-[#5f6368] text-white'
                  }`}
                  title={
                    isScreenShareDisabled
                      ? 'Screen sharing disabled by host'
                      : isScreenSharing
                      ? 'Stop Screen Share'
                      : 'Share Screen'
                  }
                >
                  <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {/* Leave Meeting */}
                <button
                  type="button"
                  id="btn-leave-meeting"
                  onClick={() => setShowConfirmModal(true)}
                  className="px-3.5 sm:px-5 h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-medium flex items-center space-x-1.5 sm:space-x-2 transition-all shadow-lg shadow-rose-600/30 cursor-pointer shrink-0"
                  title={isHost ? 'End Meeting for All' : 'Leave Call'}
                >
                  <PhoneOff className="w-4 h-4" />
                  <span className="text-xs whitespace-nowrap">{isHost ? 'End Call' : 'Leave'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className={`bg-[#1a1b1e]/50 border-t border-[#3c4043]/60 py-2.5 sm:py-4 px-4 text-center text-[10px] sm:text-xs text-[#9aa0a6] space-y-0.5 sm:space-y-1 shrink-0 ${currentScreen === 'meeting' ? 'hidden sm:block' : ''}`}>
        <p>Meeking &bull; An easy medium for completely free and great meetings.</p>
        <p className="text-[#e8eaed] font-medium">&copy; MUBIX. All rights reserved.</p>
      </footer>
    </div>
  );
}
