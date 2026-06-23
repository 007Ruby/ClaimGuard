import { openai, MODEL } from "./client";

export async function askJSON(system: string, user: string) {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  });
  return JSON.parse(completion.choices[0].message.content ?? "{}");
}