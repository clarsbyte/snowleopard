import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { level, message, data } = body;

    // Log to terminal (server-side console)
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level || 'INFO'}] ${message}`;
    
    if (data) {
      console.log(logMessage, data);
    } else {
      console.log(logMessage);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to log' },
      { status: 500 }
    );
  }
}

