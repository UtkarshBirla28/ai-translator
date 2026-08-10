
const express = require("express");
const OpenAI = require("openai");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const app = express();
const PORT = 5000;

app.use(
    cors({
        origin: "http://localhost:3000",
    })
);

app.use(express.json());
if (process.env.NODE_ENV === 'production') {
    app.use(helmet());
}
const client = new OpenAI({
    apiKey: process.env.AI_KEY,
    baseURL: process.env.AI_URL,
});

/*
|--------------------------------------------------------------------------
| CHAT / TRANSLATION / CORRECTION
|--------------------------------------------------------------------------
*/

app.post("/api/chat", async (req, res) => {
    try {
        const {
            message,
            mode = "translate",
            history = [],
        } = req.body;

        const {
            language = "English",
            web = "false",
        } = req.query;

        if (!message?.trim()) {
            return res.status(400).json({
                error: "Message is required",
            });
        }

        /*
        |--------------------------------------------------------------------------
        | SYSTEM PROMPT
        |--------------------------------------------------------------------------
        */

        let systemPrompt = `
You are an AI language assistant.

You support these target languages:
- English
- French
- Hindi
- Italian

General rules:
1. Be accurate and natural.
2. Preserve the original meaning.
3. Preserve the tone of the user's text.
4. Do not unnecessarily change the meaning.
5. Do not give language recommendations.
6. Do not add explanations unless explicitly requested.
`;

        /*
        |--------------------------------------------------------------------------
        | TRANSLATION MODE
        |--------------------------------------------------------------------------
        */

        if (mode === "translate") {
            systemPrompt += `
Your task is TRANSLATION.

Translate the user's text into ${language}.

Return ONLY the translated text.

If the user repeats words, phrases, punctuation, or expressions,
translate them as they appear instead of removing them.

Do not correct, summarize, rewrite, or improve the user's content
unless explicitly requested.
`;
        }

        /*
        |--------------------------------------------------------------------------
        | CORRECTION MODE
        |--------------------------------------------------------------------------
        */

        if (mode === "correct") {
            systemPrompt += `
Your task is TEXT CORRECTION.

Correct spelling, grammar, punctuation, and obvious language mistakes.

Rules:
1. Preserve the user's original meaning.
2. Do not add new information.
3. Do not make unnecessary stylistic changes.
4. Return ONLY the corrected text.
`;
        }

        /*
        |--------------------------------------------------------------------------
        | CORRECT + TRANSLATE
        |--------------------------------------------------------------------------
        */

        if (mode === "correct-translate") {
            systemPrompt += `
Your task is CORRECTION + TRANSLATION.

First understand the intended meaning of the user's text.
Correct obvious spelling and grammar mistakes internally.
Then translate the corrected meaning into ${language}.

Return ONLY the final translation.

Do not explain what was corrected.
Do not show the original text.
`;
        }

        const prompt = [
            {
                role: "system",
                content: systemPrompt,
            },

            /*
            |--------------------------------------------------------------------------
            | FEW SHOT EXAMPLES
            |--------------------------------------------------------------------------
            */

            {
                role: "user",
                content:
                    "Target language: Hindi\nText: Hi, how are you?",
            },
            {
                role: "assistant",
                content: "नमस्ते, आप कैसे हैं?",
            },

            {
                role: "user",
                content:
                    "Target language: French\nText: Hi, how are you?",
            },
            {
                role: "assistant",
                content: "Bonjour, comment allez-vous ?",
            },

            {
                role: "user",
                content:
                    "Target language: Italian\nText: Hi, how are you?",
            },
            {
                role: "assistant",
                content: "Ciao, come stai?",
            },

            /*
            |--------------------------------------------------------------------------
            | PREVIOUS CHAT HISTORY
            |--------------------------------------------------------------------------
            */

            ...history,

            /*
            |--------------------------------------------------------------------------
            | CURRENT MESSAGE
            |--------------------------------------------------------------------------
            */

            {
                role: "user",
                content:
                    mode === "correct"
                        ? `Correct this text:\n${message}`
                        : mode === "correct-translate"
                            ? `Target language: ${language}\nCorrect and translate:\n${message}`
                            : `Target language: ${language}\nText: ${message}`,
            },
        ];

        /*
        |--------------------------------------------------------------------------
        | STREAMING
        |--------------------------------------------------------------------------
        */

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");

        /*
        |--------------------------------------------------------------------------
        | OPENROUTER WEB SEARCH
        |--------------------------------------------------------------------------
        */

        const requestOptions = {
            model: process.env.AI_MODEL,
            messages: prompt,
            temperature: 0.5,
            stream: true,
            max_tokens: 500,
        };

        /*
        If Web is enabled, OpenRouter performs web search.
        */

        if (web === "true") {
            requestOptions.plugins = [
                {
                    id: "web",
                    max_results: 5,
                },
            ];
        }

        const stream = await client.chat.completions.create(
            requestOptions
        );

        /*
        |--------------------------------------------------------------------------
        | STREAM RESPONSE
        |--------------------------------------------------------------------------
        */

        for await (const chunk of stream) {
            const content =
                chunk.choices?.[0]?.delta?.content;

            if (content) {
                res.write(
                    `data: ${JSON.stringify({
                        type: "text",
                        content,
                    })}\n\n`
                );
            }
        }

        res.write(
            `data: ${JSON.stringify({
                type: "done",
            })}\n\n`
        );

        res.end();
    } catch (error) {
        console.error(error);

        if (!res.headersSent) {
            return res.status(500).json({
                error: error.message,
            });
        }

        res.write(
            `data: ${JSON.stringify({
                type: "error",
                error: error.message,
            })}\n\n`
        );

        res.end();
    }
});

/*
|--------------------------------------------------------------------------
| IMAGE GENERATION
|--------------------------------------------------------------------------
|
| OpenRouter has a dedicated /images API.
|
*/

app.post("/api/image", async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt?.trim()) {
            return res.status(400).json({
                error: "Image prompt is required",
            });
        }

        const response = await client.images.generate({
            model:
                process.env.AI_IMAGE_MODEL,

            prompt,

            n: 1,

            size: "1024x1024",

            quality: "auto",
        });

        const image = response.data?.[0];

        if (!image?.b64_json) {
            throw new Error(
                "Image was generated but no image data was returned."
            );
        }

        res.json({
            image: `data:${image.media_type || "image/png"};base64,${image.b64_json}`,
        });
    } catch (error) {
        console.error("IMAGE ERROR:", error);

        res.status(500).json({
            error: error.message,
        });
    }
});

/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "OK",
    });
});

/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {
    console.log(
        `Server running on http://localhost:${PORT}`
    );
});

