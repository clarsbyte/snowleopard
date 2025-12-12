import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get('image') as File;

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

    return NextResponse.json({
      success: true,
      analysis: text,
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
