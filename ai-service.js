const mammoth = require('mammoth');
const officeParser = require('officeparser');
const pdfParse = require('pdf-parse');

/**
 * Helper to extract text from a PDF file buffer
 */
async function extractPdfText(buffer) {
    try {
        const data = await pdfParse(buffer);
        return data.text || '';
    } catch (err) {
        console.error('[AI Service] PDF parse error:', err);
        return '';
    }
}

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
 * Extract raw text from any supported document buffer
 */
async function extractTextFromFile(fileBuffer, mimeType) {
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

    // PDF → extract text via pdf-parse
    if (mimeType === 'application/pdf') {
        const text = await extractPdfText(fileBuffer);
        return text.trim();
    }

    // DOCX → extract raw text via mammoth
    if (mimeType.includes('wordprocessingml') || mimeType === 'application/msword') {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        return (result.value || '').trim();
    }

    // PPTX → extract text via officeparser
    if (mimeType.includes('presentationml') || mimeType.includes('ms-powerpoint')) {
        try {
            const ast = await officeParser.parseOffice(fileBuffer);
            return (ast && typeof ast.toText === 'function') ? ast.toText().trim() : '';
        } catch (err) {
            console.error('[AI Service] PowerPoint parse error:', err);
            throw new Error('Failed to parse PowerPoint presentation.');
        }
    }

    // Fallback: plain text
    return fileBuffer.toString('utf-8').trim();
}

/**
 * Core query helper to call OpenRouter or Google Gemini API depending on configuration
 */
async function queryOpenRouter(messages, jsonMode = false) {
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    const useOpenRouter = openrouterApiKey && !openrouterApiKey.includes('placeholder');

    if (useOpenRouter) {
        const model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3-8b-instruct:free';
        const payload = {
            model: model,
            messages: messages,
            temperature: 0.25
        };

        if (jsonMode) {
            payload.response_format = { type: "json_object" };
        }

        try {
            console.log(`[AI Service] Querying OpenRouter (${model})...`);
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openrouterApiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/Sarveshsivasankaran/Students-Notes-Manager---Notezilla',
                    'X-Title': 'Notezilla Student Academic Repository'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const data = await response.json();
                return data.choices?.[0]?.message?.content || '';
            } else {
                const errText = await response.text();
                console.warn(`[AI Service] OpenRouter responded with ${response.status}: ${errText}. Trying Gemini fallback...`);
            }
        } catch (error) {
            console.warn('[AI Service] OpenRouter call failed. Trying Gemini fallback...', error);
        }
    }

    // Fallback or Primary: Google Gemini API
    if (geminiApiKey && !geminiApiKey.includes('placeholder')) {
        const candidateModels = [
            'gemini-2.5-flash-lite',
            'gemini-2.0-flash-lite',
            'gemini-flash-lite-latest',
            'gemini-2.0-flash',
            'gemini-flash-latest',
            'gemini-2.5-flash',
            'gemini-3.5-flash',
            'gemini-3-flash-preview'
        ];
        let lastError = null;

        for (const modelName of candidateModels) {
            console.log(`[AI Service] Querying Google Gemini (${modelName})...`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

            let systemInstruction = undefined;
            const contents = [];

            for (const msg of messages) {
                if (msg.role === 'system') {
                    systemInstruction = {
                        parts: [{ text: msg.content }]
                    };
                } else {
                    contents.push({
                        role: msg.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: msg.content }]
                    });
                }
            }

            const payload = {
                contents: contents
            };

            if (systemInstruction) {
                payload.systemInstruction = systemInstruction;
            }

            const generationConfig = {
                temperature: 0.25
            };

            if (jsonMode) {
                generationConfig.responseMimeType = 'application/json';
            }

            payload.generationConfig = generationConfig;

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errText = await response.text();
                    console.warn(`[AI Service] Gemini model ${modelName} failed with status ${response.status}. Trying next candidate model...`);
                    lastError = new Error(`Gemini API responded with status ${response.status}: ${errText}`);
                    continue;
                }

                const data = await response.json();
                return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            } catch (error) {
                console.warn(`[AI Service] Gemini model ${modelName} fetch failed:`, error.message);
                lastError = error;
                continue;
            }
        }
        throw lastError || new Error('All Google Gemini candidate models failed.');
    }

    throw new Error('No valid AI provider API key found. Please check GEMINI_API_KEY or OPENROUTER_API_KEY in your .env file.');
}

/**
 * Analyze a document buffer and return structured JSON
 */
async function analyzeBuffer(fileBuffer, mimeType) {
    const text = await extractTextFromFile(fileBuffer, mimeType);
    const truncatedText = text.substring(0, 25000);

    const prompt = `You are a professional academic AI analyst. Analyze the provided study material and generate a structured, comprehensive summary suitable for engineering students.
Your explanation must be simple, structured, and helpful.

Provided Study Material Text:
"""
${truncatedText}
"""

Format the output EXACTLY as a JSON object with these keys:
  "summary"            (string - a detailed markdown document covering EXACTLY these 10 sections in this order with clear headings:
                          1. **Overall Summary** (a clear, high-level summary of the entire study material)
                          2. **Key Concepts Covered** (a structured bulleted list explaining the primary concepts in the text)
                          3. **Important Definitions** (definitions of critical terms and jargon found in the text)
                          4. **Formulas with Explanation** (any formulas, equations, or mathematical models present. Explain the variables. Use LaTeX format: $ for inline, $$ for centered blocks. If no formulas exist, state "No formulas present in this material.")
                          5. **Important Questions for Exams** (5-6 likely exam questions, including both descriptive and analytical queries based on the material)
                          6. **Viva Questions and Answers** (5-6 short, direct questions and answers ideal for oral exams/vivas)
                          7. **Quick Revision Notes** (concise, bulleted points summarizing the key takeaways for last-minute cramming)
                          8. **Real-World Applications** (how the concepts taught in this material are applied in actual engineering, software development, or industry)
                          9. **Frequently Asked Questions** (answers to common questions students ask about this topic)
                          10. **Top 10 Key Takeaways** (a numbered list of the ten most important points to remember)
                       ),
  "keyConcepts"        (array of strings - 5-8 core academic concepts),
  "contextExplanation" (string - explaining how this material fits into the subject curriculum).

STRICT RULES:
1. Output ONLY a valid JSON object. Do not include markdown code fences (like \`\`\`json).
2. The "summary" value must be a valid JSON string (double quotes escaped, newlines as \\n).
3. If the material involves math or formulas, use LaTeX delimiters ($ for inline, $$ for block).`;

    const responseText = await queryOpenRouter([
        { role: 'user', content: prompt }
    ], true);

    const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            const jsonPart = cleanText.substring(firstBrace, lastBrace + 1);
            return JSON.parse(jsonPart);
        }
        return JSON.parse(cleanText);
    } catch (error) {
        console.warn('[AI Service] JSON parse failed, returning fallback:', error.message);
        return {
            summary: responseText,
            keyConcepts: [],
            contextExplanation: 'Analysis completed but format was not strictly JSON.'
        };
    }
}

/**
 * Chat with a document buffer using OpenRouter
 */
async function chatWithBuffer(fileBuffer, mimeType, userQuestion) {
    const text = await extractTextFromFile(fileBuffer, mimeType);
    const truncatedText = text.substring(0, 25000);

    const systemPrompt = `You are "Aadhi", a brilliant and empathetic academic tutor. You are helping a student understand the provided document text.
Your goal is to explain concepts clearly, provide step-by-step solutions for mathematical problems, and ensure the student feels supported.

RESPONSE GUIDELINES:
1. **Academic Excellence**: Provide precise, high-quality explanations.
2. **Step-by-Step Logic**: For any calculation, formula, or complex derivation, break it down into numbered steps.
3. **LaTeX Formatting**: You MUST use LaTeX for ALL mathematical expressions:
   - Inline math: $formula$
   - Block math (centered): $$formula$$
4. **Rich Formatting**: Use ### for subheadings, bold text for emphasis, and bullet points for lists.
5. **Tone**: Be encouraging, professional, and clear. Avoid generic filler.`;

    const userPrompt = `Document Reference Text:
"""
${truncatedText}
"""

Student Question: ${userQuestion}`;

    return await queryOpenRouter([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ]);
}

/**
 * Generate personalized Daily DSA content
 */
async function generateDailyDSA(day, concept, language, learningGoal) {
    const prompt = `You are a world-class DSA (Data Structures and Algorithms) tutor.
Generate the daily DSA learning content for Day ${day} of a 14-day study plan.

Target Profile:
- Concept: ${concept}
- Language: ${language}
- Learning Goal: ${learningGoal}

Respond with a JSON object. Ensure that the JSON is valid and conforms to the following keys:
{
    "concept": "${concept}",
    "explanation": "A detailed explanation of the concept, structured specifically for the student's learning goal '${learningGoal}'. Keep it extremely clear and helpful.",
    "syntax": "Key syntax commands or structures for this concept in ${language}. Keep it code-only or highly focused.",
    "example_code": "A complete, correct, and executable code example in ${language} demonstrating this concept.",
    "logic_breakdown": ["Step 1 explanation", "Step 2 explanation", ...],
    "practice_problem": "A challenge problem description for the student to solve using ${concept} in ${language}.",
    "test_cases": [
        { "input": "input representation as a string, e.g. for standard input", "expected_output": "expected standard output representation" },
        { "input": "...", "expected_output": "..." },
        { "input": "...", "expected_output": "..." }
    ],
    "external_links": [
        { "platform": "LeetCode", "title": "Specific problem name", "url": "valid LeetCode search or problem URL" },
        { "platform": "HackerRank", "title": "Specific problem name", "url": "valid HackerRank challenge URL" }
    ],
    "youtube_url": "Search URL or educational video URL related to ${concept}"
}

Rules:
1. Return ONLY the raw JSON object. Do not include markdown code fences (like \`\`\`json).
2. The code in 'example_code' must compile and execute successfully.
3. Provide exactly 3 test cases. The test cases will be run by an automated system where the 'input' is sent via standard input (stdin) and 'expected_output' is matched against standard output (stdout).
4. Tailor the tone and problems to the goal: '${learningGoal}'.`;

    const responseText = await queryOpenRouter([
        { role: 'user', content: prompt }
    ], true);
    
    const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            const jsonPart = cleanText.substring(firstBrace, lastBrace + 1);
            return JSON.parse(jsonPart);
        }
        return JSON.parse(cleanText);
    } catch (error) {
        console.error('[AI Service] generateDailyDSA JSON parse failed:', error.message, cleanText);
        throw new Error('Failed to generate valid DSA content JSON');
    }
}

/**
 * Simulate compiling and running code in a sandbox compiler using OpenRouter
 */
async function simulateCodeExecution(code, language, testCases) {
    const prompt = `You are a secure, sandboxed code execution environment and compiler.
Evaluate the following user code written in ${language}:

\`\`\`${language}
${code}
\`\`\`

We need to check this code against these test cases. Each test case consists of a standard input string ('input') and a standard output string ('expected_output') that is expected when the program runs.
Test Cases:
${JSON.stringify(testCases, null, 2)}

Analyze and simulate the execution of this code. Return a JSON array representing the results for each test case, in the exact same order.
The output JSON array must conform to the following schema:
[
  {
    "passed": true, // true if code compiles, runs without exception, and the output exactly matches 'expected_output' (ignoring trailing whitespace)
    "status": "passed", // "passed", "failed" (output mismatch), "compile_error", or "runtime_error"
    "stdout": "actual standard output of the code",
    "stderr": "any compiler errors, warnings, or runtime exceptions (empty if code executed successfully)"
  },
  ...
]

STRICT RULES:
1. Return ONLY the raw JSON array. Do not include markdown code fences (like \`\`\`json).
2. Be extremely precise and strict in evaluating correctness, just like a real compiler and execution sandbox.`;

    const responseText = await queryOpenRouter([
        { role: 'user', content: prompt }
    ], true);
    
    const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
        const firstBracket = cleanText.indexOf('[');
        const lastBracket = cleanText.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1) {
            const jsonPart = cleanText.substring(firstBracket, lastBracket + 1);
            return JSON.parse(jsonPart);
        }
        return JSON.parse(cleanText);
    } catch (error) {
        console.error('[AI Service] simulateCodeExecution JSON parse failed:', error.message, cleanText);
        return testCases.map(() => ({
            passed: false,
            status: 'compile_error',
            stdout: '',
            stderr: 'AI Compiler Simulation parse error. Code details:\n' + responseText
        }));
    }
}

/**
 * Helper to fetch web search results from Bing for Rajalakshmi Engineering College (REC) queries
 */
async function searchBing(query) {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    try {
        console.log(`[AI Service] Web search triggered for REC. Querying Bing: "${query}"...`);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: AbortSignal.timeout(3000)
        });
        if (!response.ok) {
            console.warn(`[AI Service] Bing search request failed with status: ${response.status}`);
            return [];
        }
        const html = await response.text();
        const regexAlgo = /<li[^>]*class="[^"]*\bb_algo\b[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
        const snippets = [];
        let match;
        while ((match = regexAlgo.exec(html)) !== null && snippets.length < 4) {
            const block = match[1];
            const titleMatch = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
            const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';
            
            const urlMatch = block.match(/href="([^"]+)"/);
            const link = urlMatch ? urlMatch[1] : '';
            
            const pMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
            const desc = pMatch ? pMatch[1].replace(/<[^>]*>/g, '').trim() : '';
            
            if (desc || title) {
                snippets.push({ title, link, snippet: desc });
            }
        }
        return snippets;
    } catch (err) {
        console.error('[AI Service] Bing web search error:', err.message);
        return [];
    }
}

/**
 * Centralized chatbot assistant chat generator for Aadhi Chatbot
 */
async function chatWithAadhi(message, userContext = {}) {
    const cleanMsg = (message || '').trim();
    const lowerMsg = cleanMsg.toLowerCase();
    
    // 1. Detect greetings to restrict creator mentions
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'yo', 'sup', 'greetings', 'hola', 'namaste'];
    const isGreeting = greetings.some(g => lowerMsg === g || lowerMsg.startsWith(g + ' ') || lowerMsg.startsWith(g + ',') || lowerMsg.startsWith(g + '!'));
    
    // 2. Detect queries related to Rajalakshmi Engineering College (REC)
    const isRecQuestion = /rajalakshmi|rec\b|autonomous college|thandalam/i.test(cleanMsg);
    
    let searchContext = '';
    if (isRecQuestion) {
        let searchQuery = cleanMsg;
        if (!/rajalakshmi/i.test(cleanMsg)) {
            searchQuery = `Rajalakshmi Engineering College ${cleanMsg}`;
        }
        const results = await searchBing(searchQuery);
        if (results && results.length > 0) {
            searchContext = '\n\n--- REAL-TIME WEB SEARCH RESULTS (RAJALAKSHMI ENGINEERING COLLEGE) ---\n';
            results.forEach((res, i) => {
                searchContext += `[Source ${i+1}] Title: ${res.title}\nURL: ${res.link}\nSnippet: ${res.snippet}\n\n`;
            });
            searchContext += 'INSTRUCTION: Use the above live web search context to answer the student\'s question about Rajalakshmi Engineering College accurately. Ground your response on this data. If the answer is not in the search results, answer using your general knowledge politely.';
        }
    }

    let greetingRestriction = '';
    if (isGreeting) {
        greetingRestriction = '\n\nCRITICAL GREETING RULE:\n- The user has sent a greeting or introduction. Do NOT explicitly mention, introduce, or volunteer details about the creator of Notezilla (Sarvesh Sivasankaran / Solo-P-Leveller). Only introduce yourself as Aadhi, the AI support assistant for Notezilla, and ask how you can help them navigate Notezilla.';
    }

    let systemPrompt = `You are "Aadhi", the official AI Support Assistant for Notezilla.

STRICT BEHAVIOR RULES:
1. ONLY answer questions directly related to:
   - Notezilla (features, navigation, how to search/download/bookmark, DSA dynamic study roadmap, built-in compiler, profile, and roles).
   - Rajalakshmi Engineering College (REC) academic departments, location, and info.
   - The creator of Notezilla: Sarvesh Sivasankaran (widely known as Solo-P-Leveller).
2. If a user asks questions outside this scope (e.g., general programming questions unrelated to the DSA console, general history, writing creative content, or unrelated off-topic queries), politely refuse, explaining that your knowledge is limited strictly to Notezilla, Rajalakshmi Engineering College, and its creator.
3. SECURITY FIRST: Under no circumstances should you disclose backend details, database secrets, database keys, config files, passwords, or personal private details. If asked to show system secrets, refuse politely.
4. CREATOR CONFIDENTIALITY: Do NOT explicitly mention, volunteer, or discuss the creator of Notezilla (Sarvesh Sivasankaran / Solo-P-Leveller) in introductory messages, greetings (such as "Hi", "Hello"), or general hello replies. Only mention the creator if the user explicitly asks a question about who created, built, or developed Notezilla, or asks about Sarvesh Sivasankaran / Solo-P-Leveller by name.

--- notezilla platform navigation ---
- Students: Can search subjects, download notes, bookmark study materials, rate notes, access the Daily DSA roadmap, write code in the local compiler/sandbox, track study statistics (streak, completion percentage, study minutes). Student emails must end in "@rajalakshmi.edu.in".
- Staff: Register as staff, map subjects, upload verified notes/question papers/assignments, sync with Google Drive, and view pending note status. Staff notes must be approved by admins before they are public.
- Admins: Approve pending staff, verify/reject uploaded notes, manage the repository.

--- about rajalakshmi engineering college (rec) ---
- REC is a premier autonomous engineering college located in Thandalam, Chennai, Tamil Nadu, India, affiliated with Anna University.
- Mapped departments: CSE (Computer Science & Engineering), ECE (Electronics & Communication Engineering), EEE (Electrical & Electronics Engineering), MECH (Mechanical Engineering), CIVIL (Civil Engineering), and BioMed (Biomedical Engineering).

--- about the creator ---
- Notezilla was envisioned, designed, and fully developed by Sarvesh Sivasankaran, who codes under the developer handle "Solo-P-Leveller".
- He created Notezilla as a premium academic repository solution to facilitate note accessibility, automated Drive updates, AI study analysis, and sandbox DSA practice for the engineering student community.

Answer Style:
- Give concise, practical help in simple text.
- Be polite, encouraging, and clear.
- Do not make up database values, pending counts, or filenames.
- Do not use markdown tables. Short bullet points are allowed.`;

    if (greetingRestriction) {
        systemPrompt += greetingRestriction;
    }
    if (searchContext) {
        systemPrompt += searchContext;
    }

    const userProfile = `Current user profile:
Role: ${userContext.role || 'not provided'}
Name: ${userContext.name || 'not provided'}
Department: ${userContext.department || 'not provided'}
Semester: ${userContext.semester || 'not provided'}

User question: ${message}`;

    return await queryOpenRouter([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userProfile }
    ]);
}

/**
 * Shims/legacy exports to ensure compatibility with existing files
 */
async function extractText(fileBuffer, mimeType) {
    return await extractTextFromFile(fileBuffer, mimeType);
}

async function analyzeNote(text) {
    return await analyzeBuffer(Buffer.from(text || ''), 'text/plain');
}

async function chatWithNote(noteText, userQuestion) {
    const prompt = `You are "Aadhi", a professional academic tutor. Answer based on this document text:
    
    ${noteText.substring(0, 25000)}
    
    STRICT RULES:
    1. Break down mathematical steps clearly.
    2. Use LaTeX: $inline$ and $$block$$ for all formulas.
    3. Use headings (###) and rich markdown.
    
    Question: ${userQuestion}`;

    return await queryOpenRouter([{ role: 'user', content: prompt }]);
}

module.exports = {
    getMimeType,
    extractText,
    analyzeNote,
    chatWithNote,
    analyzeBuffer,
    chatWithBuffer,
    generateDailyDSA,
    simulateCodeExecution,
    chatWithAadhi,
};
