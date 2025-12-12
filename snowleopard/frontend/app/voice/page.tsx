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

  const addSystemMessage = (text: string) => {
    const systemTranscript: Transcript = {
      id: Date.now().toString(),
      type: 'system',
      text,
      timestamp: new Date().toISOString(),
    };
    setTranscripts((prev) => [...prev, systemTranscript]);
  };

  const processQuery = async (query: string) => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: query.trim() }),
      });

      const data = await response.json();

      if (data.success && data.answer) {
        // Always log AI response from Gemini
        const aiTranscript: Transcript = {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          text: data.answer, // Gemini's generated response
          timestamp: data.timestamp || new Date().toISOString(),
        };
        setTranscripts((prev) => [...prev, aiTranscript]);
      } else {
        const errorMessage = data.answer || 'Failed to get response';
        setError(errorMessage);
        // Also log error as AI message for visibility
        const errorTranscript: Transcript = {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          text: `Error: ${errorMessage}`,
          timestamp: new Date().toISOString(),
        };
        setTranscripts((prev) => [...prev, errorTranscript]);
      }
    } catch (err) {
      console.error('Error calling query API:', err);
      const errorMessage = 'Failed to connect to the API. Please try again.';
      setError(errorMessage);
      // Log error as AI message
      const errorTranscript: Transcript = {
        id: (Date.now() + 1).toString(),
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
      id: Date.now().toString(),
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
      console.log('[Transcription] ✅ Session started:', sessionId);
      logToServer('INFO', '[Transcription] Session started: ' + sessionId);

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
      const wakeWord = 'hey johnny';
      let wakeWordBuffer = '';

      transcriber.on('transcript', (transcript) => {
        if (transcript.text) {
          const logMsg = `[Transcript] Raw: "${transcript.text}" (type: ${transcript.message_type || 'unknown'})`;
          console.log(logMsg);
          logToServer('INFO', logMsg, transcript);
          
          const text = transcript.text.toLowerCase();
          wakeWordBuffer += ' ' + text;
          
          // Keep buffer to last 50 characters for wake word detection
          if (wakeWordBuffer.length > 50) {
            wakeWordBuffer = wakeWordBuffer.slice(-50);
          }

          // Check for wake word
          if (!wakeWordDetected && wakeWordBuffer.includes(wakeWord)) {
            console.log('[Wake Word] 🎯 "Hey Johnny" detected!');
            logToServer('INFO', '[Wake Word] "Hey Johnny" detected!');
            setWakeWordDetected(true);
            setIsRecording(true);
            setCurrentTranscript('');
            addSystemMessage('Wake word detected! Listening...');
            wakeWordBuffer = ''; // Reset buffer after detection
            return; // Don't process this transcript as it contains the wake word
          }

          // If recording, update current transcript (exclude wake word)
          if (isRecording && wakeWordDetected) {
            let transcriptText = transcript.text;
            
            // Remove wake word from transcript if it appears
            const lowerText = transcriptText.toLowerCase();
            if (lowerText.includes(wakeWord)) {
              console.log('[Transcript] 🧹 Removing wake word from transcript');
              logToServer('INFO', '[Transcript] Removing wake word from transcript');
              transcriptText = transcriptText.replace(new RegExp(wakeWord, 'gi'), '').trim();
            }
            
            // Only add non-empty text
            if (transcriptText.trim()) {
              console.log(`[Transcript] ✍️ Adding to current transcript: "${transcriptText}"`);
              logToServer('INFO', `[Transcript] Adding: "${transcriptText}"`);
              setCurrentTranscript((prev) => {
                const newText = prev ? prev + ' ' + transcriptText : transcriptText;
                console.log(`[Transcript] 📋 Current transcript: "${newText}"`);
                logToServer('INFO', `[Transcript] Current full transcript: "${newText}"`);
                
                // Reset silence timer
                if (silenceTimerRef.current) {
                  clearTimeout(silenceTimerRef.current);
                }

                silenceTimerRef.current = setTimeout(() => {
                  console.log('[Transcript] ⏱️ Silence detected, finalizing transcript');
                  logToServer('INFO', '[Transcript] Silence detected, finalizing');
                  if (newText.trim()) {
                    finalizeTranscript(newText.trim());
                  }
                }, 2000);
                
                return newText;
              });
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
      console.log('[Transcription] ✅ Ready for audio');

      const audioContext = new AudioContext();
      console.log(`[Audio] 🎚️ AudioContext created with sample rate: ${audioContext.sampleRate} Hz`);
      
      const source = audioContext.createMediaStreamSource(stream);
      console.log('[Audio] 🎙️ MediaStream source created');
      
      const targetSampleRate = 16000;
      const sourceSampleRate = audioContext.sampleRate;
      const resampleRatio = sourceSampleRate / targetSampleRate;
      
      console.log(`[Audio] 🔄 Resampling from ${sourceSampleRate} Hz to ${targetSampleRate} Hz (ratio: ${resampleRatio.toFixed(3)})`);
      
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
          
          const durationMs = (chunkToSend.length / targetSampleRate) * 1000;
          if (audioChunkCount % 20 === 0) {
            console.log(`[Audio] 📤 Sending buffered chunk: ${chunkToSend.length} samples (${durationMs.toFixed(1)}ms)`);
          }
          transcriber.sendAudio(chunkToSend.buffer);
          audioChunkCount++;
        }
      };
      
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        // Only process audio if transcriber is ready
        if (!transcriber.isReady) {
          return; // Skip audio processing until ready
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
      console.log('[Audio] 🎵 Audio processing pipeline connected and ready');

      setIsListening(true);
      addSystemMessage('Listening for "Hey Johnny"...');
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
    const finalText = (text || currentTranscript.trim()).replace(/\s+/g, ' ').trim();
    if (finalText) {
      // Remove any remaining wake word mentions
      const cleanedText = finalText.replace(/hey\s+johnny/gi, '').trim();
      
      if (cleanedText) {
        // Always log user transcript
        const userTranscript: Transcript = {
          id: Date.now().toString(),
          type: 'user',
          text: cleanedText,
          timestamp: new Date().toISOString(),
        };
        setTranscripts((prev) => [...prev, userTranscript]);
        setCurrentTranscript('');
        setIsRecording(false);
        setWakeWordDetected(false);
        
        // Process the query
        processQuery(cleanedText);
      } else {
        // If only wake word was detected, just reset
        setCurrentTranscript('');
        setIsRecording(false);
        setWakeWordDetected(false);
      }
    }
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
    setIsListening(false);
    setIsRecording(false);
    setWakeWordDetected(false);
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
            className="text-slate-600 hover:text-slate-900 transition-colors"
          >
            ← Back to Home
          </Link>
          <h1 className="text-2xl font-light text-slate-900">Voice Query</h1>
          <button
            onClick={clearTranscripts}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Clear
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Status Indicators */}
        <div className="mb-6 flex gap-3 items-center justify-center">
          {isListening && (
            <div className={`px-4 py-2 rounded-full text-sm font-medium ${
              wakeWordDetected 
                ? 'bg-green-100 text-green-800 border border-green-300' 
                : 'bg-blue-100 text-blue-800 border border-blue-300'
            }`}>
              {wakeWordDetected ? '🎤 Recording...' : '👂 Listening for "Hey Johnny"...'}
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
                <p className="text-sm mt-2">Say "Hey Johnny" followed by your question</p>
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
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
            >
              <span>🎤</span>
              Start Listening
            </button>
          ) : (
            <button
              onClick={stopListening}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2"
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
            className="px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </form>

        {/* Info Box */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>How to use:</strong> Click "Start Listening", then say "Hey Johnny" followed by your question. 
            The system will automatically detect when you finish speaking and process your query.
          </p>
        </div>
      </main>
    </div>
  );
}
