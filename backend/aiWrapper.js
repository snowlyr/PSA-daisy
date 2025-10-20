// index.ts (or index.js)
import 'dotenv/config';
import OpenAI from "openai";

const { AZURE_OPENAI_API_KEY } = process.env;

const client = new OpenAI({
  apiKey: AZURE_OPENAI_API_KEY, // don't hardcode!
  baseURL: "https://psacodesprint2025.azure-api.net/openai/deployments/gpt-4.1-nano",
  defaultHeaders: {
    "api-key": AZURE_OPENAI_API_KEY, // required for Azure
  },
  defaultQuery: {
    "api-version": "2025-01-01-preview",
  },
});

async function run() {
  const inp = "Can I use PowerBI's REST API to help me with my data analysis with you?";

  const completion = await client.chat.completions.create({
    model: "gpt-4.1-nano",
    messages: [
      {
        role: "user",
        content: inp,
      },
    ],
  });

  const output = completion.choices[0].message.content;

  const n = `Input Text: ${inp}`.length;
  console.log("=".repeat(n));
  console.log(`Input Text: ${inp}`);
  console.log("=".repeat(n));
  console.log(`Output Text: ${output}`);
}

run().catch(console.error);

