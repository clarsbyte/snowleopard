import { NextRequest, NextResponse } from 'next/server';

// Store active WebSocket connections
// Note: In serverless environments, this will reset between invocations
// Consider using a database or Redis for production
const activeConnections = new Map<string, any>();

// Lazy load WebSocket to avoid issues with Next.js compilation
function getWebSocket() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ws = require('ws');
  return ws.default || ws;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, sessionId, audioData } = body;

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    switch (action) {
      case 'start':
        if (!sessionId) {
          return NextResponse.json({ error: 'Session ID is required for start action' }, { status: 400 });
        }
        return startTranscription(sessionId);
      case 'audio':
        if (!sessionId || !audioData) {
          return NextResponse.json({ error: 'Session ID and audio data are required for audio action' }, { status: 400 });
        }
        return sendAudio(sessionId, audioData);
      case 'stop':
        if (!sessionId) {
          return NextResponse.json({ error: 'Session ID is required for stop action' }, { status: 400 });
        }
        return stopTranscription(sessionId);
      default:
        return NextResponse.json({ error: 'Invalid action. Must be: start, audio, or stop' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Transcribe API] Error parsing request:', error);
    return NextResponse.json(
      { error: 'Invalid request body', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    );
  }
}

async function startTranscription(sessionId: string) {
  try {
    const apiKey = process.env.ASSEMBLY_API_KEY;
    
    if (!apiKey) {
      console.error('[AssemblyAI] ❌ ASSEMBLY_API_KEY environment variable is not set');
      return NextResponse.json(
        { error: 'AssemblyAI API key not configured. Please set ASSEMBLY_API_KEY in your .env.local file.' },
        { status: 500 }
      );
    }

    // Check if session already exists
    if (activeConnections.has(sessionId)) {
      return NextResponse.json({ error: 'Session already active' }, { status: 400 });
    }

    console.log(`[AssemblyAI] 🚀 Starting transcription session: ${sessionId}`);
    
    // Create WebSocket connection to AssemblyAI v3 API
    const WebSocket = getWebSocket();
    const ws = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&format_turns=true`, {
      headers: {
        Authorization: apiKey,
      },
    });
    
    const connection = {
      ws,
      isReady: false,
      transcripts: [] as any[],
      lastActivity: Date.now(),
      expiresAt: null as number | null, // Unix timestamp in seconds
    };

    ws.onopen = () => {
      console.log(`[AssemblyAI] ✅ Connected for session: ${sessionId}`);
      connection.isReady = true;
    };

    ws.onmessage = (event: any) => {
      // Handle Buffer or string data from WebSocket
      const messageData = event.data instanceof Buffer 
        ? event.data.toString('utf-8') 
        : typeof event.data === 'string' 
        ? event.data 
        : String(event.data);
      
      try {
        const data = JSON.parse(messageData);
        const msgType = data.type;

        console.log(`[AssemblyAI] 📨 Message for session ${sessionId}:`, {
          type: msgType,
          data: data
        });

        if (msgType === 'Begin') {
          const sessionIdFromAPI = data.id;
          const expiresAt = data.expires_at;
          connection.expiresAt = expiresAt;
          const expiresAtDate = new Date(expiresAt * 1000);
          const timeUntilExpiry = Math.floor((expiresAt - Math.floor(Date.now() / 1000)));
          console.log(`[AssemblyAI] 🎬 Session began: ID=${sessionIdFromAPI}, ExpiresAt=${expiresAtDate.toISOString()} (in ${timeUntilExpiry} seconds)`);
          connection.isReady = true;
        } else if (msgType === 'Turn') {
          const transcript = data.transcript || '';
          const formatted = data.turn_is_formatted;
          
          if (transcript) {
            connection.transcripts.push({
              type: formatted ? 'FinalTranscript' : 'PartialTranscript',
              text: transcript,
              timestamp: new Date().toISOString()
            });
          }
        } else if (msgType === 'Termination') {
          const audioDuration = data.audio_duration_seconds;
          const sessionDuration = data.session_duration_seconds;
          console.log(`[AssemblyAI] 🏁 Session terminated: Audio Duration=${audioDuration}s, Session Duration=${sessionDuration}s`);
          activeConnections.delete(sessionId);
        } else if (data.error) {
          console.error(`[AssemblyAI] ❌ Error for session ${sessionId}:`, data.error);
          connection.transcripts.push({
            type: 'error',
            message: data.error,
            timestamp: new Date().toISOString()
          });
          // If there's an error, mark connection as not ready
          connection.isReady = false;
        } else if (msgType === 'error') {
          console.error(`[AssemblyAI] ❌ Error message type for session ${sessionId}:`, data);
          connection.transcripts.push({
            type: 'error',
            message: data.message || JSON.stringify(data),
            timestamp: new Date().toISOString()
          });
          connection.isReady = false;
        }
      } catch (error) {
        console.error(`[AssemblyAI] ❌ Error parsing message for session ${sessionId}:`, error);
        console.error(`[AssemblyAI] Raw message:`, messageData);
      }
    };

    ws.onerror = (error: any) => {
      console.error(`[AssemblyAI] ❌ WebSocket error for session ${sessionId}:`, error);
      connection.transcripts.push({
        type: 'error',
        message: 'WebSocket connection error',
        timestamp: new Date().toISOString()
      });
    };

    ws.onclose = (code: number | any, reason?: Buffer | any) => {
      // Handle different close event signatures
      let closeCode: number;
      let closeReason: string;
      
      if (typeof code === 'number') {
        closeCode = code;
        closeReason = reason instanceof Buffer ? reason.toString() : String(reason || 'No reason provided');
      } else if (code && typeof code === 'object') {
        // Some WebSocket libraries pass an event object
        closeCode = code.code || code.closeCode || 0;
        closeReason = code.reason ? String(code.reason) : 'No reason provided';
      } else {
        closeCode = 0;
        closeReason = 'Unknown';
      }
      
      console.log(`[AssemblyAI] 🔌 Connection closed for session: ${sessionId}, code: ${closeCode}, reason: ${closeReason}`);
      console.log(`[AssemblyAI] 🔌 Close details - code type: ${typeof code}, reason type: ${typeof reason}`);
      
      // Don't immediately delete - let the client handle it gracefully
      // The session will be cleaned up on next request or timeout
      connection.isReady = false;
      if (connection.ws) {
        connection.ws = null as any;
      }
    };

    activeConnections.set(sessionId, connection);

    // Wait for connection to be ready
    await new Promise((resolve) => {
      const checkReady = setInterval(() => {
        if (connection.isReady) {
          clearInterval(checkReady);
          resolve(true);
        }
      }, 100);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkReady);
        resolve(false);
      }, 5000);
    });

    if (!connection.isReady) {
      activeConnections.delete(sessionId);
      return NextResponse.json(
        { error: 'Failed to connect to AssemblyAI' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sessionId,
      message: 'Transcription session started'
    });
    
  } catch (error) {
    console.error(`[AssemblyAI] ❌ Error starting transcription for session ${sessionId}:`, error);
    return NextResponse.json(
      {
        error: 'Failed to start transcription',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

async function sendAudio(sessionId: string, audioData: string) {
  try {
    const connection = activeConnections.get(sessionId);
    
    if (!connection) {
      return NextResponse.json(
        { 
          error: 'Session not found. The connection may have closed. Please start a new session.',
          sessionExpired: true
        },
        { status: 404 }
      );
    }

    // Check if WebSocket is still valid
    if (!connection.ws) {
      console.log(`[AssemblyAI] ⚠️ WebSocket is null for session ${sessionId}`);
      activeConnections.delete(sessionId);
      return NextResponse.json(
        { 
          error: 'WebSocket connection closed. Please start a new session.',
          sessionExpired: true
        },
        { status: 410 } // 410 Gone - resource no longer available
      );
    }

    // Check if session has expired
    if (connection.expiresAt) {
      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime >= connection.expiresAt) {
        console.log(`[AssemblyAI] ⏰ Session expired for ${sessionId}. Current: ${currentTime}, Expires: ${connection.expiresAt}`);
        activeConnections.delete(sessionId);
        if (connection.ws) {
          connection.ws.close();
        }
        return NextResponse.json(
          { 
            error: 'Session expired. Please start a new session.',
            sessionExpired: true
          },
          { status: 410 }
        );
      }
    }

    // WebSocket.OPEN = 1
    const readyState = connection.ws.readyState;
    if (!connection.isReady || readyState !== 1) {
      console.log(`[AssemblyAI] ⚠️ WebSocket not ready for session ${sessionId}. isReady: ${connection.isReady}, readyState: ${readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`);
      
      // If WebSocket is closing or closed, clean up
      if (readyState === 2 || readyState === 3) {
        console.log(`[AssemblyAI] 🗑️ Cleaning up closed WebSocket for session ${sessionId}`);
        activeConnections.delete(sessionId);
        return NextResponse.json(
          { 
            error: 'WebSocket connection closed. Please start a new session.',
            sessionExpired: true
          },
          { status: 410 }
        );
      }
      
      return NextResponse.json(
        { error: 'WebSocket not ready. Please wait a moment and try again.' },
        { status: 503 }
      );
    }

    // Convert base64 audio data to buffer
    const audioBuffer = Buffer.from(audioData, 'base64');
    
    try {
      console.log(`[AssemblyAI] 🎤 Sending audio for session ${sessionId}: ${audioBuffer.length} bytes`);
      connection.ws.send(audioBuffer);
      connection.lastActivity = Date.now();
    } catch (sendError) {
      console.error(`[AssemblyAI] ❌ Error sending audio for session ${sessionId}:`, sendError);
      if (connection.ws.readyState !== 1) {
        activeConnections.delete(sessionId);
        return NextResponse.json(
          { 
            error: 'WebSocket connection lost. Please start a new session.',
            sessionExpired: true
          },
          { status: 410 }
        );
      }
      throw sendError; // Re-throw if it's a different error
    }

    // Return any pending transcripts
    const transcripts = [...connection.transcripts];
    connection.transcripts = []; // Clear after sending

    return NextResponse.json({
      success: true,
      transcripts
    });
    
  } catch (error) {
    console.error(`[AssemblyAI] ❌ Error sending audio for session ${sessionId}:`, error);
    return NextResponse.json(
      {
        error: 'Failed to send audio',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

async function stopTranscription(sessionId: string) {
  try {
    const connection = activeConnections.get(sessionId);
    
    if (!connection) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    console.log(`[AssemblyAI] 🛑 Stopping transcription for session: ${sessionId}`);
    
    // Get any remaining transcripts
    const finalTranscripts = [...connection.transcripts];
    
    // Send termination message before closing (following AssemblyAI docs)
    if (connection.ws && connection.ws.readyState === 1) { // WebSocket.OPEN = 1
      try {
        const terminateMessage = { type: "Terminate" };
        console.log(`[AssemblyAI] 📤 Sending termination message: ${JSON.stringify(terminateMessage)}`);
        connection.ws.send(JSON.stringify(terminateMessage));
        
        // Give a brief moment for the message to be sent before closing
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (terminateError) {
        console.error(`[AssemblyAI] ❌ Error sending termination message:`, terminateError);
        // Continue with cleanup even if termination message fails
      }
    }
    
    // Close WebSocket
    if (connection.ws) {
      connection.ws.close();
    }
    
    // Remove from active connections
    activeConnections.delete(sessionId);

    return NextResponse.json({
      success: true,
      message: 'Transcription session stopped',
      finalTranscripts
    });
    
  } catch (error) {
    console.error(`[AssemblyAI] ❌ Error stopping transcription for session ${sessionId}:`, error);
    return NextResponse.json(
      {
        error: 'Failed to stop transcription',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Get transcripts without sending audio (for polling)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  
  if (!sessionId) {
    return NextResponse.json(
      { error: 'Session ID required' },
      { status: 400 }
    );
  }

  const connection = activeConnections.get(sessionId);
  
  if (!connection) {
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 404 }
    );
  }

  // Return pending transcripts
  const transcripts = [...connection.transcripts];
  connection.transcripts = []; // Clear after sending

  return NextResponse.json({
    success: true,
    isReady: connection.isReady,
    transcripts
  });
}
