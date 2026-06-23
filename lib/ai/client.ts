
import OpenAI from "openai";

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export const MODEL = "gpt-5.4-mini"; // single source of truth; update your analyze route to import this too if you like