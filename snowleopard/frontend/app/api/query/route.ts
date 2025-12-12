import { NextRequest, NextResponse } from 'next/server';
import { SnowLeopardPlaygroundClient } from '@snowleopard-ai/client';

export async function POST(request: NextRequest) {
  let client: SnowLeopardPlaygroundClient | null = null;

  try {
    const body = await request.json();
    const { item } = body;

    if (!item || item === 'No matching items found') {
      return NextResponse.json(
        { error: 'No valid item provided' },
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

    // Query for stock availability
    const question = `How many of ${item} is currently available in stock?`;

    const response = await client.retrieve(
      process.env.SNOWLEOPARD_DATAFILE_ID,
      question
    );

    console.log('SnowLeopard response:', response);

    // Format the response data for display
    let formattedStockInfo = '';

    if (response.data && typeof response.data === 'object') {
      const data = response.data as any;

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
      formattedStockInfo = String(response.data || 'No stock information available');
    }

    return NextResponse.json({
      success: true,
      item: item,
      question: question,
      stockInfo: formattedStockInfo.trim(),
      rawData: response.data,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error querying SnowLeopard:', error);
    return NextResponse.json(
      {
        error: 'Failed to query stock information',
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