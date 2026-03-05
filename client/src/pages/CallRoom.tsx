import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute, Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff,
  Phone, ArrowLeft, Wifi, WifiOff, Clock
} from 'lucide-react';
import type { Astrologer } from '@shared/schema';

/**
 * Agora RTC Call Room
 *
 * Handles both voice and video calls via Agora SDK.
 * SDK is loaded dynamically from CDN to keep bundle size lean.
 * Requires AGORA_APP_ID to be configured on the server.
 */

declare global {
  interface Window {
    AgoraRTC: any;
  }
}

function loadAgoraSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.AgoraRTC) return resolve();
    const script = document.createElement('script');
    script.src = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.20.0.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Agora SDK'));
    document.body.appendChild(script);
  });
}

export default function CallRoom() {
  const [, params] = useRoute('/call/:astrologerId');
  const astrologerId = params?.astrologerId;
  const [location, navigate] = useLocation();

  // Parse call type from query string
  const callType = new URLSearchParams(location.split('?')[1] || '').get('type') || 'voice';
  const isVideo = callType === 'video';

  const [callState, setCallState] = useState<'connecting' | 'active' | 'ended' | 'error'>('connecting');
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(!isVideo);
  const [sessionTime, setSessionTime] = useState(0);
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<any>(null);
  const localTracksRef = useRef<any[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();

  const { data: astrologer } = useQuery<Astrologer>({
    queryKey: ['/api/astrologers', astrologerId],
    enabled: !!astrologerId,
  });

  const { data: config } = useQuery<{ agoraAppId: string; razorpayKeyId: string }>({
    queryKey: ['/api/config'],
  });

  // ─── Start Consultation & Get Agora Token ──────────────────
  const startCall = useCallback(async () => {
    if (!astrologerId || !config?.agoraAppId) {
      setError('Voice/video calls require Agora configuration. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE.');
      setCallState('error');
      return;
    }

    try {
      // Start consultation session
      const consResponse = await apiRequest('POST', '/api/consultations/start', {
        astrologerId,
        type: callType,
      });
      const consultation = await consResponse.json();
      if (consultation.message) {
        setError(consultation.message);
        setCallState('error');
        return;
      }
      setConsultationId(consultation.id);

      // Get Agora token
      const tokenResponse = await apiRequest('GET',
        `/api/agora/token?channel=${encodeURIComponent(consultation.agoraChannel || consultation.id)}&uid=0&role=publisher`
      );
      const tokenData = await tokenResponse.json();
      if (tokenData.message) {
        setError(tokenData.message);
        setCallState('error');
        return;
      }

      // Load Agora SDK
      await loadAgoraSDK();
      const AgoraRTC = window.AgoraRTC;

      // Create client
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;

      // Join channel
      await client.join(
        tokenData.appId || config.agoraAppId,
        consultation.agoraChannel || consultation.id,
        tokenData.token,
        null
      );

      // Create and publish local tracks
      const tracks: any[] = [];
      const [micTrack] = await AgoraRTC.createMicrophoneAudioTrack();
      tracks.push(micTrack);

      if (isVideo) {
        const [camTrack] = await AgoraRTC.createCameraVideoTrack();
        tracks.push(camTrack);
        // Play local video in local-video element
        camTrack.play('local-video');
      }

      localTracksRef.current = tracks;
      await client.publish(tracks);

      // Handle remote user joining
      client.on('user-published', async (user: any, mediaType: string) => {
        await client.subscribe(user, mediaType);
        if (mediaType === 'video') user.videoTrack?.play('remote-video');
        if (mediaType === 'audio') user.audioTrack?.play();
      });

      client.on('user-unpublished', (user: any) => {
        // Remote user stopped sharing
      });

      client.on('user-left', () => {
        toast({ title: 'Call Ended', description: 'The astrologer has left the call.' });
        endCall();
      });

      setCallState('active');

      // Start session timer
      timerRef.current = setInterval(() => setSessionTime(s => s + 1), 1000);

    } catch (err: any) {
      console.error('Call error:', err);
      setError(err.message || 'Failed to start call. Please check your microphone/camera permissions.');
      setCallState('error');
    }
  }, [astrologerId, callType, config, isVideo, toast]);

  useEffect(() => {
    startCall();
    return () => {
      // Cleanup on unmount
      endCall(false);
    };
  }, []);

  const endCall = async (notify = true) => {
    // Stop timer
    if (timerRef.current) clearInterval(timerRef.current);

    // Stop local tracks
    localTracksRef.current.forEach(track => {
      track.stop();
      track.close();
    });
    localTracksRef.current = [];

    // Leave channel
    if (clientRef.current) {
      await clientRef.current.leave().catch(() => {});
      clientRef.current = null;
    }

    // End consultation in DB
    if (consultationId && notify) {
      try {
        await apiRequest('POST', `/api/consultations/${consultationId}/end`, {});
      } catch {}
    }

    setCallState('ended');
    if (notify) {
      const mins = Math.floor(sessionTime / 60);
      const secs = sessionTime % 60;
      toast({ title: 'Call Ended', description: `Duration: ${mins}m ${secs}s` });
      navigate(`/chat/${astrologerId}`);
    }
  };

  const toggleMic = () => {
    const micTrack = localTracksRef.current.find(t => t.trackMediaType === 'audio');
    if (micTrack) {
      if (micMuted) { micTrack.setEnabled(true); setMicMuted(false); }
      else { micTrack.setEnabled(false); setMicMuted(true); }
    }
  };

  const toggleCamera = () => {
    const camTrack = localTracksRef.current.find(t => t.trackMediaType === 'video');
    if (camTrack) {
      if (camOff) { camTrack.setEnabled(true); setCamOff(false); }
      else { camTrack.setEnabled(false); setCamOff(true); }
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  if (callState === 'error') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <PhoneOff className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-white text-2xl font-bold mb-3">Call Failed</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          {error?.includes('Agora') && (
            <p className="text-xs text-gray-500 mb-6">
              Voice/video calls require an Agora account. Sign up free at{' '}
              <a href="https://www.agora.io" target="_blank" rel="noreferrer" className="text-amber-400 underline">agora.io</a>
              {' '}— 10,000 free minutes/month.
            </p>
          )}
          <Link href={`/chat/${astrologerId}`}>
            <Button>Switch to Chat Instead</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Video area */}
      <div className="flex-1 relative">
        {isVideo ? (
          <>
            {/* Remote video (full screen) */}
            <div id="remote-video" className="w-full h-full min-h-[400px] bg-gray-800 flex items-center justify-center">
              {callState === 'connecting' && (
                <div className="text-center">
                  <LoadingSpinner />
                  <p className="text-gray-400 mt-4">Connecting to {astrologer?.name}...</p>
                </div>
              )}
            </div>
            {/* Local video (picture-in-picture) */}
            <div id="local-video" className="absolute top-4 right-4 w-32 h-44 bg-gray-700 rounded-lg overflow-hidden" />
          </>
        ) : (
          // Voice call UI
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <Avatar className="w-32 h-32 mb-6">
              <AvatarImage src={astrologer?.profileImageUrl || undefined} />
              <AvatarFallback className="text-4xl bg-amber-100 text-amber-800">
                {astrologer?.name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-white text-3xl font-bold mb-2">{astrologer?.name}</h2>
            <p className="text-gray-400 mb-4">
              {callState === 'connecting' ? 'Connecting...' : 'Voice Call Active'}
            </p>
            {callState === 'active' && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(sessionTime)}
              </Badge>
            )}
            {callState === 'connecting' && <LoadingSpinner />}
          </div>
        )}
      </div>

      {/* Status bar */}
      {callState === 'active' && (
        <div className="bg-gray-800/80 text-center py-2">
          <span className="text-gray-300 text-sm">
            ₹{astrologer?.pricePerMinute || '25'}/min •
            <Clock className="w-3 h-3 inline mx-1" />
            {formatTime(sessionTime)}
          </span>
        </div>
      )}

      {/* Controls */}
      <div className="bg-gray-900 px-8 py-8 flex items-center justify-center gap-6">
        {/* Mic */}
        <button
          onClick={toggleMic}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
            micMuted ? 'bg-red-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
        >
          {micMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        {/* End Call */}
        <button
          onClick={() => endCall()}
          className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-lg"
        >
          <PhoneOff className="w-8 h-8" />
        </button>

        {/* Camera (video only) */}
        {isVideo && (
          <button
            onClick={toggleCamera}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              camOff ? 'bg-red-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            {camOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          </button>
        )}
      </div>

      {/* Back to chat */}
      <div className="bg-gray-900 pb-4 text-center">
        <Link href={`/chat/${astrologerId}`}>
          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Chat
          </Button>
        </Link>
      </div>
    </div>
  );
}
