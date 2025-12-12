import { NextRequest, NextResponse } from 'next/server';
import { SnowLeopardPlaygroundClient } from '@snowleopard-ai/client';

export async function POST(request: NextRequest) {
  let client: SnowLeopardPlaygroundClient | null = null;

  try {
    const body = await request.json();
    const { item, query } = body;

    // We accept `query` always for voice/text input, and keep `item` for backward compatibility.
    const effectiveItem =
      typeof query === 'string' && query.trim()
        ? query.trim()
        : item;

    if (!effectiveItem || effectiveItem === 'No matching items found') {
      return NextResponse.json(
        { success: false, error: 'No valid query/item provided', answer: 'No valid query/item provided' },
        { status: 400 }
      );
    }

    if (!process.env.SNOWLEOPARD_API_KEY) {
      return NextResponse.json(
        { error: 'SnowLeopard API key not configured' },
        { status: 500 }
      );
    }

    if (!process.env.SNOWLEOPARD_DATAFILE_ID) {
      return NextResponse.json(
        { error: 'SnowLeopard datafile ID not configured' },
        { status: 500 }
      );
    }

    // Initialize SnowLeopard client
    client = new SnowLeopardPlaygroundClient({
      apiKey: process.env.SNOWLEOPARD_API_KEY,
    });

    // Query for stock availability (canonical question format for SnowLeopard)
    const question = `How many of ${effectiveItem} is currently available in stock?`;

    const response = await client.retrieve(
      process.env.SNOWLEOPARD_DATAFILE_ID,
      question
    );

    console.log('SnowLeopard response:', response);

    // Check if response is an error
    if ('error' in response) {
      return NextResponse.json(
        {
          error: 'Failed to retrieve stock information',
          details: (response as any).error || 'Unknown error from SnowLeopard API'
        },
        { status: 500 }
      );
    }

    // Format the response data for display
    let formattedStockInfo = '';
    const responseData = response as any;

    // Extract data from response, but guard against null/undefined data
    // If responseData.data is null/undefined, treat as no data (don't fall back to envelope)
    const data = responseData.data !== undefined && responseData.data !== null
      ? responseData.data
      : null;

    // Only process if we have valid data (not null/undefined)
    if (data !== null && data !== undefined && typeof data === 'object') {
      // Extract query summary if available
      if (data.querySummary) {
        formattedStockInfo += `${data.querySummary}\n\n`;
      }

      // Format rows if available
      if (data.rows && Array.isArray(data.rows)) {
        if (data.rows.length > 0) {
          formattedStockInfo += 'Details:\n';
          data.rows.forEach((row: any, index: number) => {
            formattedStockInfo += `${index + 1}. ${JSON.stringify(row)}\n`;
          });
        } else {
          formattedStockInfo += 'No stock data found.\n';
        }
      }

      // Add trimmed notice if data was limited
      if (data.isTrimmed) {
        formattedStockInfo += '\n(Some results may have been trimmed)';
      }
    } else {
      // Handle null/undefined data or non-object data
      formattedStockInfo = 'No stock information available';
    }

    return NextResponse.json({
      success: true,
      item: effectiveItem,
      question: question,
      stockInfo: formattedStockInfo.trim(),
      // Voice UI expects `answer`; use the same formatted response.
      answer: formattedStockInfo.trim(),
      rawData: data,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error querying SnowLeopard:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to query stock information',
        answer: 'Failed to query stock information',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  } finally {
    // Always close the client connection
    if (client) {
      await client.close();
    }
  }
}