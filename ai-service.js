const mammoth = require('mammoth');
const officeParser = require('officeparser');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL = 'gemini-2.5-flash';

/**
 * Map file extension to MIME type
 */
function getMimeType(extension) {
    const map = {
        pdf:  'application/pdf',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ppt:  'application/vnd.ms-powerpoint',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        doc:  'application/msword',
        png:  'image/png',
        jpg:  'image/jpeg',
        jpeg: 'image/jpeg',
        gif:  'image/gif',
        webp: 'image/webp',
    };
    return map[(extension || '').toLowerCase()] || 'application/pdf';
}

/**
 * Build the Gemini inline-data part for a given buffer.
 * - PDF & images  → sent directly as base64 inline data (Gemini reads natively)
 * - DOCX / PPTX   → extract text first, then send as a text part
 */
async function buildFilePart(fileBuffer, mimeType) {
    if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error('File buffer is empty. The file could not be downloaded.');
    }

    // Reject HTML error pages from Google Drive
    const peek = fileBuffer.toString('utf-8', 0, 500);
    if (peek.trimStart().startsWith('<!DOCTYPE') || peek.trimStart().startsWith('<html')) {
        throw new Error(
            'Google Drive returned an HTML page instead of the file. ' +
            'The file may require authentication or the ID is invalid.'
        );
    }

    // PDFs and images go straight to Gemini as inline data (handles scanned PDFs too)
    if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
        console.log(`[AI Service] Sending ${mimeType} as inline data (${fileBuffer.length} bytes)`);
        return { inlineData: { mimeType, data: fileBuffer.toString('base64') } };
    }

    // DOCX → extract raw text via mammoth
    if (mimeType.includes('wordprocessingml') || mimeType === 'application/msword') {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        const text = (result.value || '').trim();
        console.log(`[AI Service] DOCX extracted ${text.length} chars`);
        if (!text) throw new Error('DOCX is empty or unreadable.');
        return { text: text.substring(0, 30000) };
    }

    // PPTX → extract text via officeparser
    if (mimeType.includes('presentationml') || mimeType.includes('ms-powerpoint')) {
        const text = await new Promise((resolve, reject) => {
            officeParser.parseOffice(fileBuffer, (data, err) => {
                if (err) reject(err);
                else resolve(data || '');
            });
        });
        const trimmed = text.trim();
        console.log(`[AI Service] PPTX extracted ${trimmed.length} chars`);
        if (!trimmed) throw new Error('PPTX is empty or unreadable.');
        return { text: trimmed.substring(0, 30000) };
    }

    // Fallback: plain text
    const text = fileBuffer.toString('utf-8').trim();
    return { text: text.substring(0, 30000) };
}

/**
 * Analyze a document buffer directly with Gemini (multimodal).
 * Works for scanned PDFs, image PDFs, and text PDFs.
 */
async function analyzeBuffer(fileBuffer, mimeType) {
    const filePart = await buildFilePart(fileBuffer, mimeType);

    const prompt = `You are a professional academic AI analyst. Analyze the provided study material and generate a structured summary.
Your analysis must be helpful for a university student.

Format the output EXACTLY as a JSON object with these keys:
  "summary"            (string - a comprehensive 3-4 paragraph summary),
  "keyConcepts"        (array of strings - 5-8 core academic concepts),
  "contextExplanation" (string - explaining how this material fits into the subject curriculum).

STRICT RULES:
1. Do NOT include markdown code fences (like \`\`\`json).
2. ONLY output the raw JSON object.
3. If the material involves math or formulas, use LaTeX delimiters ($ for inline, $$ for block).`;

    const model = genAI.getGenerativeModel({ model: MODEL });

    // Correct Gemini multimodal format: contents with role + parts array
    const result = await model.generateContent({
        contents: [{
            role: 'user',
            parts: [filePart, { text: prompt }]
        }]
    });

    const responseText = result.response.text();
    console.log('[AI Service] Raw response (first 300):', responseText.substring(0, 300));

    const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
        // Find the first { and last } to extract JSON even if there's conversational text
        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            const jsonPart = cleanText.substring(firstBrace, lastBrace + 1);
            return JSON.parse(jsonPart);
        }
        return JSON.parse(cleanText);
    } catch (error) {
        console.warn('[AI Service] JSON parse failed:', error.message);
        return {
            summary: responseText,
            keyConcepts: [],
            contextExplanation: 'Analysis completed but response was not valid JSON.',
        };
    }
}

/**
 * Chat with a document buffer directly with Gemini (multimodal).
 */
async function chatWithBuffer(fileBuffer, mimeType, userQuestion) {
    const filePart = await buildFilePart(fileBuffer, mimeType);

    const prompt = `You are "Aadhi", a brilliant and empathetic academic tutor. You are helping a student understand the provided document.
Your goal is to explain concepts clearly, provide step-by-step solutions for mathematical problems, and ensure the student feels supported.

RESPONSE GUIDELINES (Claude/Tutor Style):
1. **Academic Excellence**: Provide precise, high-quality explanations.
2. **Step-by-Step Logic**: For any calculation, formula, or complex derivation, break it down into numbered steps.
3. **LaTeX Formatting**: You MUST use LaTeX for ALL mathematical expressions:
   - Inline math: $formula$
   - Block math (centered): $$formula$$
4. **Rich Formatting**: Use ### for subheadings, bold text for emphasis, and bullet points for lists.
5. **Tone**: Be encouraging, professional, and clear. Avoid generic filler.

Student question: ${userQuestion}`;

    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent({
        contents: [{
            role: 'user',
            parts: [filePart, { text: prompt }]
        }]
    });

    return result.response.text();
}

/**
 * Legacy shims so existing callers don't break
 */
async function extractText(fileBuffer, mimeType) {
    const part = await buildFilePart(fileBuffer, mimeType);
    return part.text || '__INLINE_DATA__';
}

async function analyzeNote(text) {
    const model = genAI.getGenerativeModel({ model: MODEL });
    const prompt = `You are an academic AI assistant. Analyze the following study material:

${text.substring(0, 30000)}

Format the output EXACTLY as a JSON object with keys: "summary", "keyConcepts" (array of strings), and "contextExplanation". Do not include markdown code blocks.`;
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const jsonStr = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    try { return JSON.parse(jsonStr); }
    catch { return { summary: responseText, keyConcepts: [], contextExplanation: 'Could not format as JSON.' }; }
}

async function chatWithNote(noteText, userQuestion) {
    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent(
        `You are "Aadhi", a professional academic tutor. Answer based on this document text:
        
        ${noteText.substring(0, 30000)}
        
        STRICT RULES:
        1. Break down mathematical steps clearly.
        2. Use LaTeX: $inline$ and $$block$$ for all formulas.
        3. Use headings (###) and rich markdown.
        
        Question: ${userQuestion}`
    );
    return result.response.text();
}

module.exports = {
    getMimeType,
    extractText,
    analyzeNote,
    chatWithNote,
    analyzeBuffer,
    chatWithBuffer,
};
