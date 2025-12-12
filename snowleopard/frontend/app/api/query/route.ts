import { NextRequest, NextResponse } from 'next/server';
import { SnowLeopardPlaygroundClient } from '@snowleopard-ai/client';

export async function POST(request: NextRequest) {
  let client: SnowLeopardPlaygroundClient | null = null;

  try {
    const body = await request.json();
    const { item, location } = body;

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

    console.log('Using datafile ID:', process.env.SNOWLEOPARD_DATAFILE_ID);

    // Query for stock availability using the response method
    let question = '';

    if (location && location.name) {
      // Use the matched donation center address
      question = `Check the table for the stock of ${item} at ${location.name}. How many are available?`;
      console.log('Query with matched location:', question);
    } else {
      question = `Check the stock of ${item}. How many are in stock?`;
    }

    console.log('Sending query to SnowLeopard:', question);

    let responseStream;
    try {
      responseStream = await client.response(
        process.env.SNOWLEOPARD_DATAFILE_ID,
        question
      );
      console.log('SnowLeopard response stream received');
    } catch (fetchError: any) {
      if (fetchError.cause && fetchError.cause.code === 'EAI_AGAIN') {
        throw new Error('Network error: Unable to reach SnowLeopard API. Please check your internet connection and try again.');
      }
      throw fetchError;
    }

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

    // Check if it's a 404 error
    if (error instanceof Error && error.message.includes('404')) {
      return NextResponse.json(
        {
          error: 'SnowLeopard datafile not found',
          details: 'Please verify your SNOWLEOPARD_DATAFILE_ID in .env.local. The datafile may have been deleted or the ID is incorrect.',
          datafileId: process.env.SNOWLEOPARD_DATAFILE_ID
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to query stock information',
        details: error instanceof Error ? error.message : 'Unknown error',
        fullError: JSON.stringify(error, null, 2)
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