'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface Transcript {
  id: string;
  type: 'user' | 'ai' | 'system';
  text: string;
  timestamp: string;
}

export default function CombinedPage() {
  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string>('');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const userLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const [locationName, setLocationName] = useState<string>('');

  // Voice state
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transcriberRef = useRef<any>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptIdCounter = useRef<number>(0);
  const wakeWordDetectedRef = useRef<boolean>(false);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Combined state
  const [capturedImage, setCapturedImage] = useState<Blob | null>(null);
  const capturedImageRef = useRef<Blob | null>(null);
  const [capturedTranscript, setCapturedTranscript] = useState<string>('');
  const [isProcessingEnhanced, setIsProcessingEnhanced] = useState(false);
  const [transcriptionPaused, setTranscriptionPaused] = useState(false);
  const [identifiedItem, setIdentifiedItem] = useState<string>('');
  const [enhancedQuery, setEnhancedQuery] = useState<string>('');
  const [finalAnswer, setFinalAnswer] = useState<string>('');

  // Auto-scroll disabled - user can scroll freely
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  // useEffect(() => {
  //   transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  // }, [transcripts, currentTranscript]);

  // Auto-start camera and audio on mount (wait for location first)
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const initialize = async () => {
      console.log('[Init] Starting initialization...');
      await getUserLocation();
      console.log('[Init] Location obtained, starting camera and audio...');
      startCamera();
      startListening();
    };

    initialize();

    return () => {
      stopCamera();
      stopListening();
    };
  }, []);

  // Helper function to generate unique transcript IDs
  const generateTranscriptId = () => {
    transcriptIdCounter.current += 1;
    return `transcript_${Date.now()}_${transcriptIdCounter.current}`;
  };

  // Helper function to log to server terminal
  const logToServer = async (level: string, message: string, data?: any) => {
    try {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, message, data }),
      });
    } catch (err) {
      // Silently fail
    }
  };

  const addSystemMessage = (text: string) => {
    const systemTranscript: Transcript = {
      id: generateTranscriptId(),
      type: 'system',
      text,
      timestamp: new Date().toISOString(),
    };
    setTranscripts((prev) => [...prev, systemTranscript]);
  };

  // ==================== Camera Functions ====================

  const getUserLocation = (): Promise<void> => {
    return new Promise((resolve) => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const location = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            setUserLocation(location);
            userLocationRef.current = location; // Store in ref immediately
            console.log('[Location] User location obtained:', position.coords.latitude, position.coords.longitude);
            resolve();
          },
          (error) => {
            console.error('[Location] Error getting location:', error);
            resolve(); // Resolve anyway so app continues
          }
        );
      } else {
        console.warn('[Location] Geolocation not available in browser');
        resolve();
      }
    });
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
        setIsCameraActive(true);
        setCameraError('');
      }
    } catch (err) {
      setCameraError('Failed to access camera. Please grant camera permissions.');
      console.error('Error accessing camera:', err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      setIsCameraActive(false);
    }
  };

  const captureSnapshot = async (): Promise<Blob | null> => {
    if (!videoRef.current || !canvasRef.current) {
      console.error('[Screenshot] Video or canvas ref not available');
      return null;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) {
      console.error('[Screenshot] Could not get canvas context');
      return null;
    }

    // Check if video is ready
    if (video.readyState < 2) {
      console.error('[Screenshot] Video not ready, readyState:', video.readyState);
      return null;
    }

    // Check if video has valid dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.error('[Screenshot] Video has invalid dimensions:', video.videoWidth, video.videoHeight);
      return null;
    }

    try {
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw the current video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert canvas to blob
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });

      if (blob) {
        console.log('[Screenshot] Image captured successfully, size:', blob.size, 'bytes');
      } else {
        console.error('[Screenshot] Failed to create blob from canvas');
      }

      return blob;
    } catch (err) {
      console.error('[Screenshot] Error capturing snapshot:', err);
      return null;
    }
  };

  // ==================== Voice Functions ====================

  const synthesizeAndPlaySpeech = async (text: string) => {
    try {
      setIsPlayingAudio(true);

      console.log('[TTS] Synthesizing speech for:', text);
      logToServer('INFO', '[TTS] Synthesizing speech', { text });

      const response = await fetch('/api/synthesize-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to synthesize speech');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        console.log('[TTS] Audio playback completed');
        logToServer('INFO', '[TTS] Audio playback completed');
        setIsPlayingAudio(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;

        if (isListening) {
          console.log('[TTS] Returning to listening state');
          addSystemMessage('Listening for "Ollie"...');
        }
      };

      audio.onerror = (error) => {
        console.error('[TTS] Audio playback error:', error);
        logToServer('ERROR', '[TTS] Audio playback error', error);
        setIsPlayingAudio(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      await audio.play();
      console.log('[TTS] Audio playback started');
      logToServer('INFO', '[TTS] Audio playback started');

    } catch (error) {
      console.error('[TTS] Error synthesizing speech:', error);
      logToServer('ERROR', '[TTS] Error synthesizing speech', error);
      setIsPlayingAudio(false);
    }
  };

  const processEnhancedQuery = async (imageBlob: Blob, transcript: string) => {
    try {
      console.log('[Enhanced Query] Starting processing with image size:', imageBlob.size, 'and transcript:', transcript);

      // Use ref instead of state for more reliable location access
      const location = userLocationRef.current;
      console.log('[Enhanced Query] User location from ref:', location);

      const formData = new FormData();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      formData.append('image', imageBlob, `combined-${timestamp}.png`);
      formData.append('transcript', transcript);

      if (location) {
        formData.append('latitude', location.latitude.toString());
        formData.append('longitude', location.longitude.toString());
        console.log('[Enhanced Query] Including location in request:', location);
      } else {
        console.warn('[Enhanced Query] User location not available - query will not be location-specific');
      }

      const response = await fetch('/api/enhanced-query', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = 'Failed to process enhanced query';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.success && data.answer) {
        setIdentifiedItem(data.identifiedItem || '');
        setEnhancedQuery(data.enhancedQuery || '');
        setFinalAnswer(data.answer);
        setLocationName(data.location?.name || '');

        // Add AI response to transcripts
        const aiTranscript: Transcript = {
          id: generateTranscriptId(),
          type: 'ai',
          text: data.answer,
          timestamp: data.timestamp || new Date().toISOString(),
        };
        setTranscripts((prev) => [...prev, aiTranscript]);

        // Synthesize and play the response
        await synthesizeAndPlaySpeech(data.answer);
      } else {
        const errorMessage = data.error || 'Failed to get response';
        addSystemMessage(`Error: ${errorMessage}`);
      }
      
      setIsProcessingEnhanced(false);
    } catch (err) {
      console.error('Error processing enhanced query:', err);
      addSystemMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsProcessingEnhanced(false);
    }
  };

  const startListening = async () => {
    try {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const startResponse = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', sessionId }),
      });

      if (!startResponse.ok) {
        const errorData = await startResponse.json();
        addSystemMessage(`Error: ${errorData.error || 'Failed to start transcription'}`);
        logToServer('ERROR', errorData.error || 'Failed to start transcription');
        return;
      }

      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = audioStream;

      const transcriber = {
        sessionId,
        isReady: true,
        audioBuffer: [] as string[],
        pollingInterval: null as NodeJS.Timeout | null,
        sendAudio: async function(audioData: ArrayBuffer) {
          const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioData)));

          try {
            const response = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'audio',
                sessionId: this.sessionId,
                audioData: base64Audio
              }),
            });

            if (response.ok) {
              const data = await response.json();

              if (data.transcripts && data.transcripts.length > 0) {
                data.transcripts.forEach((transcript: any) => {
                  if (transcript.type === 'PartialTranscript' || transcript.type === 'FinalTranscript') {
                    console.log(`[Transcription] ${transcript.type}: "${transcript.text}"`);
                    logToServer('INFO', `[Transcription] ${transcript.type}: "${transcript.text}"`, transcript);
                    this.onTranscript?.({
                      message_type: transcript.type,
                      text: transcript.text,
                      confidence: transcript.confidence
                    });
                  } else if (transcript.type === 'error') {
                    this.onError?.(new Error(transcript.message));
                  }
                });
              }
            } else {
              const data = await response.json().catch(() => ({}));
              if (data.sessionExpired || response.status === 410) {
                console.log('[Transcription] Session expired, will need to restart');
                this.onError?.(new Error('Session expired. Please restart listening.'));
                this.isReady = false;
              }
            }
          } catch (error) {
            console.error('[Transcription] Error sending audio:', error);
          }
        },
        startPolling: function() {
          this.pollingInterval = setInterval(async () => {
            try {
              const response = await fetch(`/api/transcribe?sessionId=${this.sessionId}`);
              if (response.ok) {
                const data = await response.json();

                if (data.transcripts && data.transcripts.length > 0) {
                  data.transcripts.forEach((transcript: any) => {
                    if (transcript.type === 'PartialTranscript' || transcript.type === 'FinalTranscript') {
                      console.log(`[Transcript] ${transcript.type === 'FinalTranscript' ? 'Final' : 'Partial'}: "${transcript.text}"`);
                      this.onTranscript?.({
                        message_type: transcript.type,
                        text: transcript.text,
                        confidence: transcript.confidence
                      });
                    } else if (transcript.type === 'error') {
                      console.error(`[Transcription] Error: ${transcript.message}`);
                      this.onError?.(new Error(transcript.message));
                    }
                  });
                }
              }
            } catch (error) {
              console.error('[Transcription] Polling error:', error);
            }
          }, 500);
        },
        close: async function() {
          this.isReady = false;

          if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
          }

          try {
            await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'stop',
                sessionId: this.sessionId
              }),
            });
          } catch (error) {
            console.error('[Transcription] Error stopping session:', error);
          }
        },
        onTranscript: null as ((transcript: any) => void) | null,
        onError: null as ((error: any) => void) | null,
        on: function(event: string, callback: (data: any) => void) {
          if (event === 'transcript') {
            this.onTranscript = callback;
          } else if (event === 'error') {
            this.onError = callback;
          }
        }
      };

      transcriberRef.current = transcriber;

      const wakeWord = 'olly';
      let wakeWordBuffer = '';

      transcriber.on('transcript', (transcript) => {
        if (transcript.text && !transcriptionPaused) {
          const text = transcript.text.toLowerCase();

          // Check for wake word only if not already detected
          if (!wakeWordDetectedRef.current && text.includes(wakeWord)) {
            console.log('[Wake Word] "Olly" detected! Capturing screenshot...');
            wakeWordDetectedRef.current = true;
            setWakeWordDetected(true);
            setIsRecording(true);
            setCurrentTranscript('');
            addSystemMessage('Wake word detected! Capturing image and listening...');

            // Capture screenshot immediately and store in both state and ref
            captureSnapshot().then((blob) => {
              if (blob) {
                setCapturedImage(blob);
                capturedImageRef.current = blob;
                console.log('[Screenshot] Image captured successfully, stored in ref');
              } else {
                console.error('[Screenshot] Failed to capture image');
                addSystemMessage('Error: Failed to capture image. Make sure camera is active.');
                // Reset wake word detection if capture failed
                wakeWordDetectedRef.current = false;
                setWakeWordDetected(false);
                setIsRecording(false);
              }
            });

            return;
          }

          // If we haven't detected wake word yet, keep buffering for detection
          if (!wakeWordDetectedRef.current) {
            wakeWordBuffer += ' ' + text;

            if (wakeWordBuffer.length > 50) {
              wakeWordBuffer = wakeWordBuffer.slice(-50);
            }

            if (wakeWordBuffer.includes(wakeWord)) {
              console.log('[Wake Word] "Olly" detected! Capturing screenshot...');
              wakeWordDetectedRef.current = true;
              setWakeWordDetected(true);
              setIsRecording(true);
              setCurrentTranscript('');
              addSystemMessage('Wake word detected! Capturing image and listening...');

              // Capture screenshot immediately and store in both state and ref
              captureSnapshot().then((blob) => {
                if (blob) {
                  setCapturedImage(blob);
                  capturedImageRef.current = blob;
                  console.log('[Screenshot] Image captured successfully, stored in ref');
                } else {
                  console.error('[Screenshot] Failed to capture image');
                  addSystemMessage('Error: Failed to capture image. Make sure camera is active.');
                  // Reset wake word detection if capture failed
                  wakeWordDetectedRef.current = false;
                  setWakeWordDetected(false);
                  setIsRecording(false);
                }
              });

              wakeWordBuffer = '';
              return;
            }
            return;
          }

          // If recording, update current transcript (exclude wake word)
          if (wakeWordDetectedRef.current) {
            let transcriptText = transcript.text;

            const lowerText = transcriptText.toLowerCase();
            if (lowerText.includes(wakeWord)) {
              transcriptText = transcriptText.replace(new RegExp(wakeWord, 'gi'), '').trim();
            }

            if (transcriptText.trim()) {
              // Replace current transcript instead of appending (transcription service sends full text)
              setCurrentTranscript(transcriptText);

              // Reset silence timer
              if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
              }

              silenceTimerRef.current = setTimeout(() => {
                if (transcriptText.trim()) {
                  finalizeTranscript(transcriptText.trim());
                }
              }, 2000);
            }
          }
        }
      });

      transcriber.on('error', (error: any) => {
        const errorMessage = error?.message || String(error) || 'Unknown error';
        console.error('[Transcription] Error:', error);
        logToServer('ERROR', `[Transcription] Error: ${errorMessage}`, error);
        addSystemMessage(`Transcription error: ${errorMessage}`);
        stopListening();
      });

      transcriber.startPolling();

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(audioStream);
      audioSourceRef.current = source;

      const targetSampleRate = 16000;
      const sourceSampleRate = audioContext.sampleRate;
      const resampleRatio = sourceSampleRate / targetSampleRate;

      const minSamples = 800;
      const maxSamples = 16000;
      let audioBuffer = new Int16Array(0);

      const sendBufferedAudio = () => {
        if (audioBuffer.length >= minSamples && transcriber.isReady) {
          const samplesToSend = Math.min(audioBuffer.length, maxSamples);
          const chunkToSend = audioBuffer.slice(0, samplesToSend);
          audioBuffer = audioBuffer.slice(samplesToSend);

          transcriber.sendAudio(chunkToSend.buffer);
        }
      };

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!transcriber.isReady || isPlayingAudio) {
          return;
        }

        const audioData = e.inputBuffer.getChannelData(0);

        let resampled: Float32Array;
        if (sourceSampleRate !== targetSampleRate) {
          const resampledLength = Math.floor(audioData.length / resampleRatio);
          resampled = new Float32Array(resampledLength);

          for (let i = 0; i < resampledLength; i++) {
            const srcIndex = i * resampleRatio;
            const srcIndexFloor = Math.floor(srcIndex);
            const srcIndexCeil = Math.min(srcIndexFloor + 1, audioData.length - 1);
            const fraction = srcIndex - srcIndexFloor;

            resampled[i] = audioData[srcIndexFloor] * (1 - fraction) + audioData[srcIndexCeil] * fraction;
          }
        } else {
          resampled = audioData;
        }

        const pcm16 = new Int16Array(resampled.length);
        for (let i = 0; i < resampled.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, Math.floor(resampled[i] * 32768)));
        }

        const newBuffer = new Int16Array(audioBuffer.length + pcm16.length);
        newBuffer.set(audioBuffer, 0);
        newBuffer.set(pcm16, audioBuffer.length);
        audioBuffer = newBuffer;

        sendBufferedAudio();
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsListening(true);
      addSystemMessage('Listening for "Ollie"...');
      console.log('[Voice] Voice recognition started, listening for wake word...');

    } catch (err: any) {
      console.error('Error starting voice recognition:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        addSystemMessage('Microphone permission denied. Please allow microphone access.');
      } else if (err.name === 'NotFoundError') {
        addSystemMessage('No microphone found. Please connect a microphone.');
      } else {
        addSystemMessage(`Failed to start voice recognition: ${err.message || 'Unknown error'}`);
      }
      stopListening();
    }
  };

  const finalizeTranscript = async (text?: string) => {
    const finalText = (text || currentTranscript.trim()).replace(/\s+/g, ' ').trim();
    if (!finalText) {
      return;
    }

    const cleanedText = finalText.replace(/olly/gi, '').trim();

    if (!cleanedText) {
      setCurrentTranscript('');
      setIsRecording(false);
      setWakeWordDetected(false);
      wakeWordDetectedRef.current = false;
      capturedImageRef.current = null;
      setCapturedImage(null);
      return;
    }

    setCurrentTranscript('');
    setIsRecording(false);
    setWakeWordDetected(false);
    wakeWordDetectedRef.current = false;
    setTranscriptionPaused(true);
    setCapturedTranscript(cleanedText);

    // Log user transcript
    const userTranscript: Transcript = {
      id: generateTranscriptId(),
      type: 'user',
      text: cleanedText,
      timestamp: new Date().toISOString(),
    };
    setTranscripts((prev) => [...prev, userTranscript]);

    // Get image from ref (more reliable than state)
    const imageBlob = capturedImageRef.current || capturedImage;

    // Process enhanced query with image and transcript
    if (imageBlob) {
      console.log('[Finalize] Processing with image, size:', imageBlob.size);
      setTranscriptionPaused(false);
      setIsProcessingEnhanced(true);
      await processEnhancedQuery(imageBlob, cleanedText);
      setCapturedImage(null);
      capturedImageRef.current = null;
    } else {
      console.error('[Finalize] No image available in ref or state');
        addSystemMessage('Error: No image captured. Please say "Olly" again to capture the image.');
      setTranscriptionPaused(false);
    }
  };

  const stopListening = () => {
    if (transcriberRef.current) {
      transcriberRef.current.close();
      transcriberRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioProcessorRef.current) {
      try {
        audioProcessorRef.current.disconnect();
      } catch (error) {
        // Ignore
      }
      audioProcessorRef.current = null;
    }
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.disconnect();
      } catch (error) {
        // Ignore
      }
      audioSourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsListening(false);
    setIsRecording(false);
    setWakeWordDetected(false);
    wakeWordDetectedRef.current = false;
    setCurrentTranscript('');
  };

  const clearTranscripts = () => {
    setTranscripts([]);
    setCurrentTranscript('');
    setIdentifiedItem('');
    setEnhancedQuery('');
    setFinalAnswer('');
    capturedImageRef.current = null;
    setCapturedImage(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-lg bg-slate-900/50 border-b border-lime-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-white">Camera + Voice Assistant</h1>
            <Link
              href="/"
              className="btn btn-sm btn-outline"
            >
              ← Back Home
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Camera Section - Centered */}
          <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/10">
              <h2 className="text-xl font-semibold text-white mb-2">
                Camera Feed
              </h2>
              <p className="text-gray-400 text-sm">
                Camera auto-starts. Say "Olly" to capture and query.
              </p>
            </div>

            {cameraError && (
              <div className="mx-6 mt-6 bg-red-500/10 border border-red-500/20 text-red-300 p-4 rounded-xl">
                <p className="text-sm font-medium">{cameraError}</p>
              </div>
            )}

            <div className="relative bg-black aspect-video">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              {!isCameraActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
                  <div className="text-center">
                    <div className="text-6xl mb-4">📷</div>
                    <p className="text-gray-400">Camera not active</p>
                  </div>
                </div>
              )}
              {isProcessingEnhanced && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm z-10">
                  <div className="text-center">
                    <div className="animate-spin text-6xl mb-4">⚙️</div>
                    <p className="text-white font-medium text-lg">Processing query...</p>
                    <p className="text-gray-300 text-sm mt-2">Analyzing image and transcript</p>
                  </div>
                </div>
              )}
              {wakeWordDetected && (
                <div className="absolute top-4 left-4 bg-green-500/90 text-white px-4 py-2 rounded-lg font-medium">
                  🎤 Recording...
                </div>
              )}
            </div>

            <div className="p-6 space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={isCameraActive ? stopCamera : startCamera}
                  disabled={isProcessingEnhanced}
                  className="btn btn-md btn-outline flex-1"
                >
                  {isCameraActive ? '⏹ Stop Camera' : '▶ Start Camera'}
                </button>
                <button
                  onClick={isListening ? stopListening : startListening}
                  disabled={isProcessingEnhanced}
                  className={`btn btn-md flex-1 ${isListening ? 'btn-danger' : 'btn-success'} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isListening ? '⏹ Stop Listening' : '🎤 Start Listening'}
                </button>
              </div>

              {/* Status indicators */}
              <div className="flex gap-2 flex-wrap">
                {isPlayingAudio && (
                  <div className="px-3 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    🔊 Playing response
                  </div>
                )}
                {isListening && !isPlayingAudio && !wakeWordDetected && (
                  <div className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    👂 Listening for "Olly"
                  </div>
                )}
                {locationName && (
                  <div className="px-3 py-1 rounded-full text-xs font-medium bg-lime-500/20 text-lime-300 border border-lime-500/30">
                    📍 {locationName}
                  </div>
                )}
              </div>

              {/* Location Debug Display */}
              {userLocation && (
                <div className="mt-3 p-3 bg-slate-800/50 border border-slate-600/50 rounded-lg">
                  <p className="text-xs font-semibold text-gray-400 mb-2">📍 Location Debug Info:</p>
                  <div className="space-y-1 text-xs text-gray-300 font-mono">
                    <p>Lat: {userLocation.latitude.toFixed(6)}</p>
                    <p>Lng: {userLocation.longitude.toFixed(6)}</p>
                    {locationName && <p className="text-lime-400">Matched: {locationName}</p>}
                    {!locationName && <p className="text-yellow-400">Location name not yet matched</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Results Display */}
          {(identifiedItem || finalAnswer) && (
            <div className="bg-gradient-to-br from-green-500/10 to-lime-500/10 backdrop-blur-xl rounded-3xl border border-green-500/20 overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-green-500/20">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <span>✓</span> Results
                </h2>
              </div>
              <div className="p-6 space-y-4">
                {identifiedItem && (
                  <div>
                    <p className="text-sm text-lime-400 font-medium mb-1">Identified Item:</p>
                    <p className="text-white text-lg">{identifiedItem}</p>
                  </div>
                )}
                {enhancedQuery && (
                  <div>
                    <p className="text-sm text-lime-400 font-medium mb-1">Enhanced Query:</p>
                    <p className="text-gray-300 text-sm italic">{enhancedQuery}</p>
                  </div>
                )}
                {finalAnswer && (
                  <div>
                    <p className="text-sm text-lime-400 font-medium mb-1">Answer:</p>
                    <p className="text-white leading-relaxed whitespace-pre-wrap">{finalAnswer}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transcripts Section - Below Camera */}
          <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">
                  Voice Transcripts
                </h2>
                <p className="text-gray-400 text-sm">
                  Say "Olly" followed by your question
                </p>
              </div>
              <button
                onClick={clearTranscripts}
                className="btn btn-sm btn-outline"
              >
                Clear
              </button>
            </div>

            <div ref={transcriptContainerRef} className="h-[40vh] overflow-y-auto p-6">
              {transcripts.length === 0 && !currentTranscript ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🎤</div>
                    <p className="text-lg">Say "Olly" to begin</p>
                    <p className="text-sm mt-2">Camera and audio auto-start on page load</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {transcripts.map((transcript) => (
                    <div
                      key={transcript.id}
                      className={`flex ${
                        transcript.type === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                          transcript.type === 'user'
                            ? 'bg-lime-500 text-slate-900'
                            : transcript.type === 'system'
                            ? 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/30'
                            : 'bg-slate-700 text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium opacity-70">
                            {transcript.type === 'user' ? 'You' : transcript.type === 'system' ? 'System' : 'AI'}
                          </span>
                          <span className="text-xs opacity-50">
                            {new Date(transcript.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {transcript.text}
                        </p>
                      </div>
                    </div>
                  ))}
                  {currentTranscript && (
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-lime-500/70 text-slate-900">
                        <p className="text-sm leading-relaxed">{currentTranscript}</p>
                      </div>
                    </div>
                  )}
                  {isProcessingEnhanced && (
                    <div className="flex justify-start">
                      <div className="bg-gradient-to-r from-lime-500/20 to-emerald-500/20 border border-lime-500/30 rounded-2xl px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 bg-lime-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-lime-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-lime-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                          <span className="text-sm text-lime-300 font-medium">Processing query...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden canvas for snapshot processing */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
