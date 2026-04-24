export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { recordId, postType, showInfo } = req.body || {};
  if (!recordId || !showInfo) return res.status(400).json({ error: "Missing recordId or showInfo" });

  const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  const typeInstructions = {
    "Event Promotion": "Write an engaging event promotion post",
    "Announce": "This is an announcement post — show just confirmed, get it on your calendar, 30 days out",
    "Momentum": "This is a momentum/hype post — building excitement, 15 days out, what to expect",
    "Urgency": "This is an urgency post — one week out, tickets moving, dont wait",
    "Push": "This is a final push post — 3 days out, limited seats remaining",
    "Day Of": "This is a day-of post — TONIGHT energy, doors open, last call",
  };

  const instruction = typeInstructions[postType] || typeInstructions["Event Promotion"];

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `${instruction} for this live show. Return ONLY the post copy text, no JSON, no labels.\n\nSHOW:\n${showInfo}\n\nRules:\n- Include ticket link if provided\n- Max 3 hashtags\n- Engaging and energetic tone\n- Under 280 characters preferred`,
        }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API ${claudeRes.status}: ${errText}`);
    }
    const claudeData = await claudeRes.json();
    const copy = claudeData.content?.[0]?.text?.trim() || "";

    if (!copy) throw new Error("No copy generated");

    const updateRes = await fetch(`https://api.airtable.com/v0/app1gWDHklIHiq6yu/tblU0C9ueSixKn7Cv/${recordId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${AIRTABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: { "fld7Z2psB9gGg51kh": copy },
      }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`Airtable update ${updateRes.status}: ${errText}`);
    }

    return res.status(200).json({ copy });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}