import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SnowLeopardPlaygroundClient } from '@snowleopard-ai/client';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  let client: SnowLeopardPlaygroundClient | null = null;

  try {
    const formData = await request.formData();
    const image = formData.get('image') as File;
    const transcript = formData.get('transcript') as string;
    const latitude = formData.get('latitude') as string;
    const longitude = formData.get('longitude') as string;

    console.log('[Enhanced Query] Received coordinates:', { latitude, longitude });

    if (!image) {
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      );
    }

    if (!transcript) {
      return NextResponse.json(
        { error: 'No transcript provided' },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Gemini API key not configured' },
        { status: 500 }
      );
    }

    // Convert image to base64
    const bytes = await image.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString('base64');

    // Initialize Gemini model (using gemini-2.5-flash for multimodal)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Prepare the image part for Gemini
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: image.type,
      },
    };

    // Get location name from coordinates if available (separate call for reliability)
    let locationName = null;
    if (latitude && longitude) {
      try {
        const locationPrompt = `You are a location matching system. Given GPS coordinates, select the CLOSEST address from this list of donation center locations:

DONATION CENTER LOCATIONS:
- 880 Mabury Rd, San Jose, CA 95133
- 1781 Union St, San Francisco, CA 94123
- 2508 Historic Decatur Rd, San Diego, CA 92106
- 320 E 43rd St, New York, NY 10017

USER COORDINATES: ${latitude}, ${longitude}

INSTRUCTIONS:
1. Determine which city/area these coordinates are closest to
2. Return ONLY the exact address from the list above that is nearest to these coordinates
3. Return the FULL address exactly as shown in the list
4. No explanations, no extra text, just the address

RESPONSE FORMAT: Just the address, nothing else.
Example: "880 Mabury Rd, San Jose, CA 95133"`;

        const locationResult = await model.generateContent(locationPrompt);
        const locationResponse = await locationResult.response;
        locationName = locationResponse.text().trim();

        console.log('[Enhanced Query] Matched coordinates to nearest donation center:', locationName);
      } catch (err) {
        console.error('[Enhanced Query] Error matching location:', err);
        locationName = null;
      }
    }

    // Prepare location context if we successfully matched a location
    let locationContext = '';
    if (locationName) {
      locationContext = `
USER LOCATION: ${locationName}

LOCATION INSTRUCTIONS:
- Include the location in the "enhancedQuery" (e.g., "Check stock of [Item] at ${locationName}")
- Return the address in the "matchedLocation" field
`;
    }

    // Use Gemini Vision API to process image, transcript, and location together
    const enhancedPrompt = `You are an intelligent inventory assistant that combines visual, voice, and location information.

INVENTORY LIST:
-Canned Black Beans
-Chicken Noodle Soup
-Boxes of Diapers
-Children's Multivitamins
-Winter Coats
-Shelf-Stable Milk
-Boxes of Cereal
-Toothbrush Kits
-Lays Chips
-Reusable Water Bottles
-Canned Tuna
-Bags of Rice
-First-Aid Kits
-Hand Sanitizer
-Blankets/Throws
-Peanut Butter Jars
-Pasta & Sauce Kits
-Feminine Hygiene Pads
-Reading Glasses
-Backpacks

IMAGE: See the attached image
VOICE QUERY: "${transcript}"
${locationContext}

TASK:
1. Analyze the image to identify which item(s) from the inventory list are visible
2. Analyze the voice query to understand what the user is asking
3. Consider the user's location (if provided) to make the query specific to that donation center
4. Combine all information to create a precise query

INSTRUCTIONS:
- If the image shows an item and the query asks about it, identify the item
- If the query mentions "this", "these", "that item", use the visual information
- Match items to the EXACT names in the inventory list above
- If a location is matched, explicitly include "at [Address]" in the enhancedQuery

RESPONSE FORMAT (JSON):
{
  "identifiedItem": "Exact item name from list or 'No matching items found'",
  "queryIntent": "Brief description of what user is asking",
  "enhancedQuery": "Natural language query combining visual, voice, and location context"
}

Return ONLY valid JSON, no other text.`;

    const result = await model.generateContent([enhancedPrompt, imagePart]);
    const response = await result.response;
    const text = response.text();
    console.log('[Enhanced Query] Gemini Vision response:', text);

    // Parse the JSON response
    let parsedResponse: {
      identifiedItem: string;
      queryIntent: string;
      enhancedQuery: string;
    };

    try {
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
      parsedResponse = JSON.parse(jsonText.trim());
    } catch (parseError) {
      console.error('[Enhanced Query] Failed to parse Gemini response as JSON:', text);
      throw new Error('Failed to parse enhanced query response');
    }

    const { identifiedItem, queryIntent, enhancedQuery } = parsedResponse;
    // Use the locationName we determined earlier (not from Gemini's response)


    // If no matching item found, return early
    if (!identifiedItem || identifiedItem === 'No matching items found') {
      return NextResponse.json({
        success: false,
        identifiedItem,
        queryIntent,
        enhancedQuery,
        location: latitude && longitude ? {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          name: locationName
        } : null,
        error: 'No matching items found',
        answer: 'I could not identify any items from the inventory in the image and query.',
        timestamp: new Date().toISOString(),
      });
    }

    // Query SnowLeopard with the enhanced query
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

    console.log('[Enhanced Query] Using datafile ID:', process.env.SNOWLEOPARD_DATAFILE_ID);

    // Construct the final question for SnowLeopard
    const question = enhancedQuery;
    console.log('[Enhanced Query] Final question for SnowLeopard:', question);

    console.log('[Enhanced Query] Sending query to SnowLeopard:', question);

    let responseStream;
    try {
      responseStream = await client.response(
        process.env.SNOWLEOPARD_DATAFILE_ID,
        question
      );
      console.log('[Enhanced Query] SnowLeopard response stream received');
    } catch (fetchError: any) {
      if (fetchError.cause && fetchError.cause.code === 'EAI_AGAIN') {
        throw new Error('Network error: Unable to reach SnowLeopard API. Please check your internet connection and try again.');
      }
      throw fetchError;
    }

    // Consume the async generator stream
    let formattedAnswer = '';
    let finalChunk: any = null;

    for await (const chunk of responseStream) {
      console.log('[Enhanced Query] Chunk received:', chunk);

      if (chunk.__type__ === 'responseResult') {
        finalChunk = chunk;
      }
    }

    console.log('[Enhanced Query] Final chunk:', finalChunk);

    // Extract the complete answer from the LLM response
    if (finalChunk && finalChunk.llmResponse && finalChunk.llmResponse.complete_answer) {
      formattedAnswer = finalChunk.llmResponse.complete_answer;
    } else if (finalChunk && finalChunk.llmResponse && finalChunk.llmResponse.data && finalChunk.llmResponse.data.summary) {
      formattedAnswer = finalChunk.llmResponse.data.summary;
    } else {
      formattedAnswer = 'No information available';
    }

    console.log('[Enhanced Query] Final answer:', formattedAnswer);

    return NextResponse.json({
      success: true,
      identifiedItem,
      queryIntent,
      enhancedQuery: question,
      location: latitude && longitude ? {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        name: locationName
      } : null,
      question,
      answer: formattedAnswer.trim(),
      rawData: finalChunk,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Enhanced Query] Error processing request:', error);
    return NextResponse.json(
      {
        error: 'Failed to process enhanced query',
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
