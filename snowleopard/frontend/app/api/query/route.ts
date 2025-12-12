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

    // Query for stock availability using the response method
    const question = `Check the stock of ${item}. Query ${item}. `;

    const responseStream = await client.response(
      process.env.SNOWLEOPARD_DATAFILE_ID,
      question
    );

    console.log('SnowLeopard response stream:', responseStream);

    // Consume the async generator stream
    let formattedStockInfo = '';
    let finalChunk: any = null;

    for await (const chunk of responseStream) {
      console.log('Chunk received:', chunk);

      // Store the final result chunk
      if (chunk.__type__ === 'responseResult') {
        finalChunk = chunk;
      }
    }

    console.log('Final chunk:', finalChunk);

    // Extract the complete answer from the LLM response
    if (finalChunk && finalChunk.llmResponse && finalChunk.llmResponse.complete_answer) {
      formattedStockInfo = finalChunk.llmResponse.complete_answer;
    } else if (finalChunk && finalChunk.llmResponse && finalChunk.llmResponse.data && finalChunk.llmResponse.data.summary) {
      formattedStockInfo = finalChunk.llmResponse.data.summary;
    } else {
      formattedStockInfo = 'No stock information available';
    }

    console.log('Final formatted info:', formattedStockInfo);

    return NextResponse.json({
      success: true,
      item: item,
      question: question,
      stockInfo: formattedStockInfo.trim(),
      rawData: finalChunk,
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
