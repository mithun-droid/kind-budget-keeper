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

    const systemPrompt = `You are an expert receipt/bill OCR engine. Read the image carefully, line by line, before answering.

Method (follow strictly):
1. Transcribe every legible line of the receipt mentally, including small print and faint thermal-printer text.
2. Locate the FINAL amount the customer actually paid. Look for labels like Total, Grand Total, Nett Total, Amount Paid, Net Payable, Balance Due, Amount Due, Card/UPI/Cash tendered.
   - Ignore Subtotal, Tax/GST/CGST/SGST/VAT lines, discounts, MRP, "you saved", per-item prices, change/return amounts and loyalty points.
   - If both a total and a rounded "Net Payable" exist, use the rounded final payable.
   - Indian receipts often print ₹, Rs., Rs or INR. Strip symbols, commas and spaces. "1,234.50" -> 1234.5.
   - Never invent a value. If no total is legible, use 0.
3. Merchant = the business name, usually the largest text at the top (not the address, GSTIN, phone, or "Tax Invoice"). Max 40 chars, title case.
4. Date = the transaction/invoice date. Convert DD/MM/YYYY or DD-MM-YY (common in India) to YYYY-MM-DD. If ambiguous or missing, use "".
5. Category — choose the single best fit from the merchant name and the purchased items:
   * fixed_bills: rent, electricity, water, gas cylinder, internet/broadband, mobile recharge, DTH, insurance, EMI/loan, school fees, subscriptions
   * daily_living: groceries, kirana, supermarket, vegetables, milk, food, restaurants, cafe, tea, fuel/petrol, auto/cab/metro/bus, medicines, pharmacy
   * shopping: clothing, footwear, electronics, gadgets, furniture, home goods, cosmetics, gifts
   * unplanned: movies, entertainment, bars, gaming, impulse treats, one-off surprises

Return ONLY this JSON object (no prose, no markdown fences):
{"amount": <number>, "merchant": "<string>", "category": "fixed_bills|daily_living|shopping|unplanned", "date": "YYYY-MM-DD or empty string", "confidence": <0-1 number>}

If the image is not a receipt or is unreadable, return {"amount":0,"merchant":"","category":"daily_living","date":"","confidence":0}.`;

    const callModel = async (model: string) =>
      fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Read this receipt end to end and extract the final paid total, merchant, date and category as JSON.",
                },
                { type: "image_url", image_url: { url: data.imageDataUrl, detail: "high" } },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      });

    // Fast, high-accuracy vision default; escalate only if it fails.
    let res = await callModel("google/gemini-3.6-flash");
    if (res.status === 400 || res.status === 404) {
      res = await callModel("google/gemini-2.5-flash");
    }


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

    const rawAmount = typeof parsed.amount === "string"
      ? parsed.amount.replace(/[^0-9.]/g, "")
      : parsed.amount;
    const amount = Math.round((Number(rawAmount) || 0) * 100) / 100;
    const merchant = String(parsed.merchant ?? "").trim().slice(0, 40);
    const category = CATS.includes(parsed.category) ? parsed.category : "daily_living";
    const date = typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : "";
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));

    return { amount, merchant, category, date, confidence };
  });
