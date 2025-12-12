'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
// Note: Using browser-compatible approach for AssemblyAI

interface Transcript {
  id: string;
  type: 'user' | 'ai' | 'system';
  text: string;
  timestamp: string;
}

export default function VoicePage() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transcriberRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptIdCounter = useRef<number>(0);
  const wakeWordDetectedRef = useRef<boolean>(false);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Auto-scroll to bottom when new transcripts are added
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts, currentTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (transcriberRef.current) {
        transcriberRef.current.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
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
    }
  };

  const preprocessTranscript = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return '';
    }

    try {
      const response = await fetch('/api/transcript-preprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: trimmed }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Transcript preprocessing failed');
      }

      const data = await response.json();
      const cleaned = typeof data.cleanedTranscript === 'string' ? data.cleanedTranscript.trim() : '';
      return cleaned || trimmed;

    } catch (error) {
      console.error('[Transcript] Error cleaning transcript with Gemini:', error);
      logToServer('ERROR', '[Transcript] Error cleaning transcript with Gemini', error);
      return trimmed;
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

  // Note: Microphone muting is handled by checking isPlayingAudio state
  // in the processor.onaudioprocess callback, so no need to disconnect/reconnect

  const synthesizeAndPlaySpeech = async (text: string) => {
    try {
      setIsPlayingAudio(true); // This automatically mutes microphone via processor check
      
      console.log('[TTS] Synthesizing speech for:', text);
      logToServer('INFO', '[TTS] Synthesizing speech', { text });

      // Call the text-to-speech API
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

      // Get audio blob from response
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create and play audio
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // Return to listening state after audio finishes
      audio.onended = () => {
        console.log('[TTS] Audio playback completed');
        logToServer('INFO', '[TTS] Audio playback completed');
        setIsPlayingAudio(false); // This automatically unmutes microphone
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;

        // Resume listening if we were listening before
        if (isListening) {
          console.log('[TTS] Returning to listening state');
          addSystemMessage('Listening for "Ollie"...');
        }
      };

      audio.onerror = (error) => {
        console.error('[TTS] Audio playback error:', error);
        logToServer('ERROR', '[TTS] Audio playback error', error);
        setIsPlayingAudio(false); // This automatically unmutes microphone
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      await audio.play();
      console.log('[TTS] Audio playback started');
      logToServer('INFO', '[TTS] Audio playback started');

    } catch (error) {
      console.error('[TTS] Error synthesizing speech:', error);
      logToServer('ERROR', '[TTS] Error synthesizing speech', error);
      setIsPlayingAudio(false); // This automatically unmutes microphone
      setError(`Failed to synthesize speech: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const processQuery = async (query: string) => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      // Use transcript-preprocess which handles Gemini matching + SnowLeopard query
      const response = await fetch('/api/transcript-preprocess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript: query.trim() }),
      });

      const data = await response.json();

      if (data.success && data.answer) {
        // Log AI response from SnowLeopard
        const aiTranscript: Transcript = {
          id: generateTranscriptId(),
          type: 'ai',
          text: data.answer,
          timestamp: data.timestamp || new Date().toISOString(),
        };
        setTranscripts((prev) => [...prev, aiTranscript]);

        // Synthesize and play the AI response
        await synthesizeAndPlaySpeech(data.answer);
      } else {
        const errorMessage = data.answer || data.error || 'Failed to get response';
        setError(errorMessage);
        // Also log error as AI message for visibility
        const errorTranscript: Transcript = {
          id: generateTranscriptId(),
          type: 'ai',
          text: `Error: ${errorMessage}`,
          timestamp: new Date().toISOString(),
        };
        setTranscripts((prev) => [...prev, errorTranscript]);
      }
    } catch (err) {
      console.error('Error calling transcript-preprocess API:', err);
      const errorMessage = 'Failed to connect to the API. Please try again.';
      setError(errorMessage);
      // Log error as AI message
      const errorTranscript: Transcript = {
        id: generateTranscriptId(),
        type: 'ai',
        text: `Error: ${errorMessage}`,
        timestamp: new Date().toISOString(),
      };
      setTranscripts((prev) => [...prev, errorTranscript]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputText.trim()) return;

    const userQuery = inputText.trim();

    // Add user transcript
    const userTranscript: Transcript = {
      id: generateTranscriptId(),
      type: 'user',
      text: userQuery,
      timestamp: new Date().toISOString(),
    };

    setTranscripts((prev) => [...prev, userTranscript]);
    setInputText('');

    await processQuery(userQuery);
  };

  const startListening = async () => {
    try {
      // Generate a unique session ID
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Start transcription session on backend
      const startResponse = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', sessionId }),
      });

      if (!startResponse.ok) {
        const errorData = await startResponse.json();
        setError(errorData.error || 'Failed to start transcription session');
        logToServer('ERROR', errorData.error || 'Failed to start transcription');
        return;
      }

      const startData = await startResponse.json();

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Create a transcriber that communicates with our backend
      const transcriber = {
        sessionId,
        isReady: true,
        audioBuffer: [] as string[],
        pollingInterval: null as NodeJS.Timeout | null,
        sendAudio: async function(audioData: ArrayBuffer) {
          // Convert ArrayBuffer to base64 string for transmission
          const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioData)));
          
          // Send audio to backend
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
              
              // Process any transcripts received
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
              // Handle session expiration
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
          // Poll for transcripts every 500ms
          this.pollingInterval = setInterval(async () => {
            try {
              const response = await fetch(`/api/transcribe?sessionId=${this.sessionId}`);
              if (response.ok) {
                const data = await response.json();
                
                if (data.transcripts && data.transcripts.length > 0) {
                  data.transcripts.forEach((transcript: any) => {
                    if (transcript.type === 'PartialTranscript' || transcript.type === 'FinalTranscript') {
                      // Only log the transcript text
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
          
          // Stop polling
          if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
          }
          
          // Stop transcription session on backend
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

      // Wake word detection
      const wakeWord = 'ollie';
      let wakeWordBuffer = '';

      transcriber.on('transcript', (transcript) => {
        if (transcript.text) {
          const text = transcript.text.toLowerCase();
          
          // Check for wake word only if not already detected
          if (!wakeWordDetectedRef.current && text.includes(wakeWord)) {
            console.log('[Wake Word] "Ollie" detected!');
            wakeWordDetectedRef.current = true; // Set ref immediately to prevent duplicate detections
            setWakeWordDetected(true);
            setIsRecording(true);
            setCurrentTranscript('');
            addSystemMessage('Wake word detected! Listening...');
            return; // Don't process this transcript as it contains the wake word
          }

          // If we haven't detected wake word yet, keep buffering for detection
          if (!wakeWordDetectedRef.current) {
            wakeWordBuffer += ' ' + text;
            
            // Keep buffer to last 50 characters for wake word detection
            if (wakeWordBuffer.length > 50) {
              wakeWordBuffer = wakeWordBuffer.slice(-50);
            }
            
            // Check buffer for wake word
            if (wakeWordBuffer.includes(wakeWord)) {
              console.log('[Wake Word] "Ollie" detected!');
              wakeWordDetectedRef.current = true; // Set ref immediately
              setWakeWordDetected(true);
              setIsRecording(true);
              setCurrentTranscript('');
              addSystemMessage('Wake word detected! Listening...');
              wakeWordBuffer = ''; // Reset buffer after detection
              return; // Don't process this transcript as it contains the wake word
            }
            return; // Still listening for wake word
          }

          // If recording, update current transcript (exclude wake word)
          if (wakeWordDetectedRef.current) {
            let transcriptText = transcript.text;
            
            // Remove wake word from transcript if it appears
            const lowerText = transcriptText.toLowerCase();
            if (lowerText.includes(wakeWord)) {
              transcriptText = transcriptText.replace(new RegExp(wakeWord, 'gi'), '').trim();
            }
            
            // Only add non-empty text
            if (transcriptText.trim()) {
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
        console.error('[Transcription] ❌ Error:', error);
        logToServer('ERROR', `[Transcription] Error: ${errorMessage}`, error);
        setError(`Transcription error: ${errorMessage}`);
        stopListening();
      });

      // Start polling for transcripts
      transcriber.startPolling();

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      audioSourceRef.current = source;
      
      const targetSampleRate = 16000;
      const sourceSampleRate = audioContext.sampleRate;
      const resampleRatio = sourceSampleRate / targetSampleRate;
      
      // Audio buffering to meet AssemblyAI requirements: 50-1000ms chunks
      // At 16kHz: 50ms = 800 samples, 1000ms = 16000 samples
      const minSamples = 800;  // 50ms minimum
      const maxSamples = 16000; // 1000ms maximum
      let audioBuffer = new Int16Array(0);
      let audioChunkCount = 0;
      
      const sendBufferedAudio = () => {
        if (audioBuffer.length >= minSamples && transcriber.isReady) {
          const samplesToSend = Math.min(audioBuffer.length, maxSamples);
          const chunkToSend = audioBuffer.slice(0, samplesToSend);
          audioBuffer = audioBuffer.slice(samplesToSend);
          
          transcriber.sendAudio(chunkToSend.buffer);
          audioChunkCount++;
        }
      };
      
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        // Only process audio if transcriber is ready and not playing audio
        if (!transcriber.isReady || isPlayingAudio) {
          return; // Skip audio processing until ready or when audio is playing
        }

        const audioData = e.inputBuffer.getChannelData(0);
        
        // Resample to 16kHz if needed
        let resampled: Float32Array;
        if (sourceSampleRate !== targetSampleRate) {
          // Simple linear resampling
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
        
        // Convert to PCM16
        const pcm16 = new Int16Array(resampled.length);
        for (let i = 0; i < resampled.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, Math.floor(resampled[i] * 32768)));
        }
        
        // Append to buffer
        const newBuffer = new Int16Array(audioBuffer.length + pcm16.length);
        newBuffer.set(audioBuffer, 0);
        newBuffer.set(pcm16, audioBuffer.length);
        audioBuffer = newBuffer;
        
        // Send if we have enough samples (at least 50ms worth)
        sendBufferedAudio();
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsListening(true);
      addSystemMessage('Listening for "Ollie"...');
      console.log('[Voice] 🎤 Voice recognition started, listening for wake word...');

    } catch (err: any) {
      console.error('Error starting voice recognition:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone permission denied. Please allow microphone access and try again.');
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone and try again.');
      } else {
        setError(`Failed to start voice recognition: ${err.message || 'Unknown error'}`);
      }
      stopListening();
    }
  };

  const finalizeTranscript = (text?: string) => {
    const runFinalization = async () => {
      const finalText = (text || currentTranscript.trim()).replace(/\s+/g, ' ').trim();
      if (!finalText) {
        return;
      }

      // Remove any remaining wake word mentions
      const cleanedText = finalText.replace(/ollie/gi, '').trim();

      if (!cleanedText) {
        setCurrentTranscript('');
        setIsRecording(false);
        setWakeWordDetected(false);
        wakeWordDetectedRef.current = false; // Reset ref
        return;
      }

      setCurrentTranscript('');
      setIsRecording(false);
      setWakeWordDetected(false);
      wakeWordDetectedRef.current = false; // Reset ref

      // Log the cleaned transcript (before preprocessing)
      const userTranscript: Transcript = {
        id: generateTranscriptId(),
        type: 'user',
        text: cleanedText,
        timestamp: new Date().toISOString(),
      };
      setTranscripts((prev) => [...prev, userTranscript]);

      // processQuery now uses transcript-preprocess which handles Gemini matching + SnowLeopard
      await processQuery(cleanedText);
    };

    void runFinalization();
  };

  const stopListening = () => {
    if (transcriberRef.current) {
      transcriberRef.current.close();
      transcriberRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    // Clean up audio processor and source
    if (audioProcessorRef.current) {
      try {
        audioProcessorRef.current.disconnect();
      } catch (error) {
        // Ignore disconnect errors
      }
      audioProcessorRef.current = null;
    }
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.disconnect();
      } catch (error) {
        // Ignore disconnect errors
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
    wakeWordDetectedRef.current = false; // Reset ref
    setCurrentTranscript('');
  };

  const clearTranscripts = () => {
    setTranscripts([]);
    setError(null);
    setCurrentTranscript('');
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="px-6 py-6 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="btn btn-sm btn-outline"
          >
            ← Back to Home
          </Link>
          <h1 className="text-2xl font-light text-slate-900">Voice Query</h1>
          <button
            onClick={clearTranscripts}
            className="btn btn-sm btn-outline text-slate-700 hover:text-slate-900 border-slate-300"
          >
            Clear
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Status Indicators */}
        <div className="mb-6 flex gap-3 items-center justify-center">
          {isPlayingAudio && (
            <div className="px-4 py-2 rounded-full text-sm font-medium bg-purple-100 text-purple-800 border border-purple-300">
              🔊 Playing response...
            </div>
          )}
          {isListening && !isPlayingAudio && (
            <div className={`px-4 py-2 rounded-full text-sm font-medium ${
              wakeWordDetected
                ? 'bg-green-100 text-green-800 border border-green-300'
                : 'bg-blue-100 text-blue-800 border border-blue-300'
            }`}>
              {wakeWordDetected ? '🎤 Recording...' : '👂 Listening for "Ollie"...'}
            </div>
          )}
        </div>

        {/* Transcript Display Area */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mb-6 h-[60vh] overflow-y-auto p-6">
          {transcripts.length === 0 && !currentTranscript ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center">
                <div className="text-4xl mb-4">🎤</div>
                <p className="text-lg">Click "Start Listening" to begin</p>
                <p className="text-sm mt-2">Say "Ollie" followed by your question</p>
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
                        ? 'bg-slate-900 text-white'
                        : transcript.type === 'system'
                        ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                        : 'bg-slate-100 text-slate-900'
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
                  <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-slate-900 text-white opacity-70">
                    <p className="text-sm leading-relaxed">{currentTranscript}</p>
                  </div>
                </div>
              )}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                      <span className="text-sm text-slate-600">AI is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Voice Controls */}
        <div className="mb-4 flex gap-3 justify-center">
          {!isListening ? (
            <button
              onClick={startListening}
              className="btn btn-md btn-success"
            >
              <span>🎤</span>
              Start Listening
            </button>
          ) : (
            <button
              onClick={stopListening}
              className="btn btn-md btn-danger"
            >
              <span>⏹️</span>
              Stop Listening
            </button>
          )}
        </div>

        {/* Text Input (Fallback) */}
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Or type your query here... (e.g., 'How many cans of beans do we have?')"
            className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !inputText.trim()}
            className="btn btn-md btn-outline bg-slate-900/90 hover:bg-slate-900 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </form>

        {/* Info Box */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>How to use:</strong>
          </p>
        </div>
      </main>
    </div>
  );
}
