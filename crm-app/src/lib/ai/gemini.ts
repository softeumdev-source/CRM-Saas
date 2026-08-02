import { GoogleGenAI } from "@google/genai";

export function temGeminiConfigurado(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY nao configurada no servidor.");
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export async function gerarJson<T>(prompt: string): Promise<T> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { responseMimeType: "application/json" },
  });
  const texto = response.text || "{}";
  return JSON.parse(texto) as T;
}
