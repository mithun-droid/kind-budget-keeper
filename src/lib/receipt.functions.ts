import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  imageDataUrl: z.string().min(20), // data:image/...;base64,...
});

const CATS = ["fixed_bills", "daily_living", "shopping", "unplanned"] as const;

export const scanReceipt = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const systemPrompt = `You are a receipt/bill OCR assistant. Extract structured data from the receipt image.

Return ONLY a JSON object with these exact fields:
- amount: number (the final total the customer paid, in local currency units; look for "Total", "Grand Total", "Amount Paid", "Net Payable"; prefer the largest total. No currency symbol.)
- merchant: string (store/vendor name, max 40 chars. If unknown, use "").
- category: one of "fixed_bills" | "daily_living" | "shopping" | "unplanned"
    * fixed_bills: rent, electricity, water, gas, internet, mobile, insurance, EMI, subscriptions
    * daily_living: groceries, food, restaurants, cafe, transport, fuel, milk, vegetables
    * shopping: clothing, electronics, gadgets, home goods, gifts
    * unplanned: entertainment, treats, one-off surprises
- date: ISO date string YYYY-MM-DD if visible on receipt, otherwise "".

If the image is not a receipt or unreadable, return {"amount":0,"merchant":"","category":"daily_living","date":""}.
Respond with ONLY the JSON object, no prose, no markdown.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the receipt data as JSON." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[scanReceipt] gateway error", res.status, body);
      if (res.status === 429) throw new Error("Rate limit — try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
      throw new Error(`Scan failed (${res.status})`);
    }

    const json: any = await res.json();
    const text = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = {}; } }
    }

    const amount = Number(parsed.amount) || 0;
    const merchant = String(parsed.merchant ?? "").slice(0, 40);
    const category = CATS.includes(parsed.category) ? parsed.category : "daily_living";
    const date = typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : "";

    return { amount, merchant, category, date };
  });
