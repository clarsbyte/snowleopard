import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get('image') as File;
    const latitude = formData.get('latitude') as string;
    const longitude = formData.get('longitude') as string;

    if (!image) {
      return NextResponse.json(
        { error: 'No image provided' },
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

    // Initialize Gemini model (using gemini-2.5-flash for Gemini 2.5)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Prepare the image part for Gemini
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: image.type,
      },
    };

    // Analyze the image with Gemini
    const prompt = `You are an inventory classification system. Analyze the image and identify which item(s) from our inventory list are present.

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

INSTRUCTIONS:
1. Carefully examine the image to identify the item(s)
2. Match the item to the closest entry in the inventory list above
3. If multiple items match, list all of them
4. If no items match, respond with "No matching items found"
5. Return ONLY the exact item name(s) from the list, nothing else

RESPONSE FORMAT:
- For single item: "Canned Black Beans"
- For multiple items: "Canned Black Beans, Chicken Noodle Soup"
- For no match: "No matching items found"`;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    // Get location name from coordinates if available
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

        console.log('Matched coordinates to nearest donation center:', locationName);
      } catch (err) {
        console.error('Error matching location:', err);
        locationName = null;
      }
    }

    return NextResponse.json({
      success: true,
      analysis: text,
      location: latitude && longitude ? {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        name: locationName
      } : null,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error processing image:', error);
    return NextResponse.json(
      {
        error: 'Failed to process image',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}