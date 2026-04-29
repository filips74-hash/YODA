// /api/generate-post.js
// Regenerate single-post copy from the dashboard ↺ button.
// Pulls artist Type/Copy/Members/Hashtags from Artist Link for Social Media,
// pulls capacity + tix sold + show details from SOCIAL MEDIA, then asks Claude
// for body copy that's specific to the act (genre, tribute target, era).
//
// Footer (date / time / venue / city / tickets / hashtags) is built deterministically
// in code and appended to Claude's body. Claude only writes the body.

const AIRTABLE_BASE = "app1gWDHklIHiq6yu";
const SOCIAL_MEDIA_TABLE = "tblMkZoY6s1QiEBZP";
const ARTIST_LINK_TABLE = "tblMpJkxnF5ysbDfR";
const POSTS_TABLE = "tblU0C9ueSixKn7Cv";

const F = {
  POST_COPY: "fld7Z2psB9gGg51kh",
  ARTISTS_LINK: "fldXyFXUSTxCSF4p9",
  CAPACITY: "fldWAVPF5TYg4rwIC",
  TIX_SOLD_CURRENT: "fldLGNb9dvqIeQf7F",
  START_DATE: "fldYOYoazpSSb1xKr",
  SHOWTIME: "fldYN07daGYEPZPQC",
  VENUE: "fldOOZOvy8q8Y3GRO",
  CITY: "fld6qHu6mqrIMysVe",
  STATE: "fldtElpYlAswVSSeL",
  SHORT_URL: "fld4eRMVKpUnBiSPv",
  TICKET_LINK: "fld2Cd127I4CZD5i6",
  AL_TYPE: "fldLTTiDBCcIgItBu",
  AL_COPY: "fldWlm7nmTPTo2gql",
  AL_MEMBERS: "flduxk8TYFtTRuldy",
  AL_RUNTIME: "fldGxn372FYuytym7",
  AL_HASHTAGS: "fld5ZqWDQvo8k2emn",
};

const airtableHeaders = () => ({
  Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
  "Content-Type": "application/json",
});

async function airtableGet(table, recordId) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${table}/${recordId}?returnFieldsByFieldId=true`;
  const res = await fetch(url, { headers: airtableHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable GET ${table}/${recordId} ${res.status}: ${body}`);
  }
  return res.json();
}

function cleanRich(s, maxChars = 600) {
  if (!s) return "";
  return String(s)
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*|\*|__|_/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function pickFirst(val) {
  if (Array.isArray(val)) return val[0];
  return val;
}

function extractLookup(val) {
  if (!val) return null;
  if (Array.isArray(val)) {
    return val.map((v) => (typeof v === "object" ? v.name || v : v)).join(", ") || null;
  }
  return String(val);
}

function scarcityReplacement(tier) {
  switch (tier) {
    case "almost_sold_out": return "almost sold out";
    case "selling_well": return "selling fast";
    case "steady": return "still available";
    case "early": return "tickets on sale now";
    default: return "selling fast";
  }
}

function deriveOutlet(url) {
  if (!url) return null;
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch (e) {
    return null;
  }
  const map = [
    [/(^|\.)fangenie\./, "Fangenie"],
    [/(^|\.)yourconcerttix\./, "Your Concert Tix"],
    [/(^|\.)yourconcerttickets\./, "Your Concert Tix"],
    [/(^|\.)seetickets\./, "See Tickets"],
    [/(^|\.)eventbrite\./, "Eventbrite"],
    [/(^|\.)ticketmaster\./, "Ticketmaster"],
    [/(^|\.)etix\./, "Etix"],
    [/(^|\.)showclix\./, "ShowClix"],
    [/(^|\.)showare\./, "Showare"],
    [/(^|\.)tixr\./, "Tixr"],
    [/(^|\.)universe\./, "Universe"],
    [/(^|\.)brownpapertickets\./, "Brown Paper Tickets"],
    [/(^|\.)holdmyticket\./, "HoldMyTicket"],
    [/(^|\.)vendini\./, "Vendini"],
    [/(^|\.)ovationtix\./, "OvationTix"],
    [/(^|\.)audienceview\./, "AudienceView"],
    [/(^|\.)spektrix\./, "Spektrix"],
    [/(^|\.)patronmanager\./, "Patron Manager"],
    [/(^|\.)tadbookings\./, "TAD Bookings"],
    [/(^|\.)tadent\./, "TAD Bookings"],
    [/(^|\.)tadentertainment\./, "TAD Bookings"],
  ];
  for (const [pattern, name] of map) {
    if (pattern.test(host)) return name;
  }
  const parts = host.split(".");
  const sld = parts.length >= 2 ? parts[parts.length - 2] : host;
  if (!sld) return null;
  return sld.charAt(0).toUpperCase() + sld.slice(1);
}

function formatShowDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function buildFooter({ showDate, showtime, venue, city, state, ticketUrl, hashtags }) {
  const lines = [];
  const formattedDate = formatShowDate(showDate);
  if (formattedDate) lines.push(`📅 ${formattedDate}`);
  if (showtime) lines.push(`🕐 ${showtime}`);

  const loc = [city, state].filter(Boolean).join(", ");
  const venueLine = [venue, loc].filter(Boolean).join(" – ");
  if (venueLine) lines.push(`📍 ${venueLine}`);

  if (ticketUrl) {
    const outlet = deriveOutlet(ticketUrl);
    const outletStr = outlet ? ` [Sold at: ${outlet}]` : "";
    lines.push(`🎫 Tickets → ${ticketUrl}${outletStr}`);
  }

  if (hashtags && hashtags.trim()) {
    lines.push("");
    lines.push(hashtags.trim());
  }

  return lines.join("\n");
}

function stripFooterArtifacts(body) {
  if (!body) return body;
  let out = body;
  out = out.replace(/https?:\/\/\S+/gi, "");
  out = out.replace(/(?:click\s+the\s+)?(?:get\s+(?:your\s+)?tickets?\s+(?:here|now)\s*)?link\s+in\s+bio[^.!?\n]*/gi, "");
  out = out.replace(/(?:#[\w]+\s*){2,}\s*$/g, "");
  out = out.replace(/[👉👆☝️➡️]+\s*$/g, "");
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}

// Belt-and-suspenders: scrub banned words/phrases that occasionally slip past the prompt.
// Catches: don't/won't/will not (want to) miss/forget; you'll never forget; you'll be
// talking about; a/one night to remember / you'll never forget; "It's Showtime" /
// "Showtime is here" / "Tonight's the night" / "The wait is over"; "unforgettable".
function stripBannedPhrases(text) {
  if (!text) return text;
  let out = text;

  out = out.replace(/\bunforgettable\b/gi, (m) => {
    const repl = "incredible";
    return m[0] === m[0].toUpperCase() ? repl.charAt(0).toUpperCase() + repl.slice(1) : repl;
  });

  const bannedSentenceRe = new RegExp(
    [
      /\b(?:do(?:n['’]?t| not)|won['’]?t|will not)\s+(?:want\s+to\s+|wanna\s+)?(?:miss|forget)\b/.source,
      /\byou['’]?ll\s+(?:never\s+forget|be\s+talking\s+about)\b/.source,
      /\b(?:a|one)\s+night\s+(?:to\s+remember|you['’]?ll?\s+(?:never\s+)?forget)\b/.source,
      /\bit'?s\s+showtime\b/.source,
      /\bshowtime\s+is\s+here\b/.source,
      /\btonight'?s\s+the\s+night\b/.source,
      /\bthe\s+wait\s+is\s+over\b/.source,
    ].join("|"),
    "i"
  );

  const parts = out.split(/([.!?]+\s*)/);
  const kept = [];
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] || "";
    const punct = parts[i + 1] || "";
    if (sentence.trim() && bannedSentenceRe.test(sentence)) continue;
    kept.push(sentence + punct);
  }
  out = kept.join("");

  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}

function stripTicketNumbers(text, tier) {
  if (!text) return text;
  const replacement = scarcityReplacement(tier);
  let out = text;
  const patterns = [
    /(?:only\s+)?\b\d+\s*(?:tickets?|seats?|tix)\s*(?:still\s+)?(?:sold|left|remaining|gone|away|to\s*go|available|out)\b/gi,
    /\b\d+\s*(?:of|\/)\s*\d+\s*(?:tickets?|seats?|sold)?\b/gi,
    /\b\d+\s*%\s*(?:sold|full|capacity|gone)\b/gi,
    /\b(?:fewer|less)\s+than\s+\d+\s*(?:tickets?|seats?|tix)\b/gi,
    /\bonly\s+\d+\s*(?:left|remain(?:ing)?)\b/gi,
  ];
  for (const p of patterns) out = out.replace(p, replacement);
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}

function sanitizeShowInfoForLLM(showInfo) {
  if (!showInfo) return showInfo;
  const lines = String(showInfo).split(/\r?\n/);
  const dropPatterns = [
    /\b(?:tickets?\s+sold|tix\s+sold|sold\s+(?:tickets?|tix|count)|seats?\s+sold|capacity\s+sold|sold\s*\/\s*capacity|tickets?\s*\/\s*capacity)\b/i,
    /\b(?:sold|sales|attendance)\s*[:=]/i,
  ];
  return lines.filter((ln) => !dropPatterns.some((p) => p.test(ln))).join("\n");
}

function calcUrgency(soldRaw, capacityRaw) {
  const sold = Number(soldRaw);
  const capacity = Number(String(capacityRaw || "").replace(/[^\d]/g, ""));
  if (!sold || !capacity || capacity <= 0) {
    return { tier: "unknown", instruction: "Use natural urgency based on the post type alone — no scarcity language unless the post type itself implies it (e.g. dayof)." };
  }
  const ratio = sold / capacity;
  if (ratio >= 0.85) {
    return { tier: "almost_sold_out", instruction: "ALMOST SOLD OUT. Lean hard into scarcity — 'almost sold out', 'final tickets', 'seats going fast'. NEVER cite specific numbers, percentages, or seat counts." };
  }
  if (ratio >= 0.6) {
    return { tier: "selling_well", instruction: "Selling well. Mild scarcity — 'tickets are moving', 'great seats still available'. NEVER cite specific numbers or percentages." };
  }
  if (ratio >= 0.3) {
    return { tier: "steady", instruction: "Steady pace. Lead with the act and the experience, not urgency. No scarcity language." };
  }
  return { tier: "early", instruction: "Plenty of availability. Focus entirely on the artist and the experience. No scarcity, no urgency about tickets." };
}

async function fetchContext(socialMediaRecordId) {
  const smRecord = await airtableGet(SOCIAL_MEDIA_TABLE, socialMediaRecordId).catch(() => null);

  let artistContext = null;
  let urgency = calcUrgency(null, null);
  let footerData = null;

  if (smRecord) {
    const f = smRecord.fields || {};
    const capacity = f[F.CAPACITY];
    const sold = f[F.TIX_SOLD_CURRENT];
    urgency = calcUrgency(sold, capacity);

    footerData = {
      showDate: f[F.START_DATE] || null,
      showtime: f[F.SHOWTIME] || null,
      venue: f[F.VENUE] || null,
      city: f[F.CITY] || null,
      state: extractLookup(f[F.STATE]),
      ticketUrl: f[F.SHORT_URL] || f[F.TICKET_LINK] || null,
    };

    const artistIds = f[F.ARTISTS_LINK];
    const firstArtistId = pickFirst(artistIds);
    if (firstArtistId) {
      const artistRec = await airtableGet(ARTIST_LINK_TABLE, firstArtistId).catch(() => null);
      if (artistRec) {
        const af = artistRec.fields || {};
        const types = af[F.AL_TYPE];
        const typesStr = Array.isArray(types) ? types.join(", ") : (types || "");
        const rawHashtags = (af[F.AL_HASHTAGS] || "").toString().trim();
        artistContext = {
          type: typesStr,
          about: cleanRich(af[F.AL_COPY]),
          members: af[F.AL_MEMBERS] || "",
          runtime: af[F.AL_RUNTIME] || "",
          hashtags: rawHashtags || null,
        };
      }
    }
  }

  return { artistContext, urgency, footerData };
}

const typeInstructions = {
  "Event Promotion": "Write an engaging event promotion post.",
  "Announce": "Announcement post — show just confirmed, ~30 days out. Lead with WHO is playing and what makes them special. Build curiosity, not urgency about tickets.",
  "Momentum": "Momentum post — ~15 days out. Build excitement about the upcoming experience. Reference specific things fans of this act will recognize (era, songs, signature style).",
  "Urgency": "Urgency post — ~1 week out. Combine specifics about the act with appropriate urgency based on ticket data provided.",
  "Push": "Final push post — ~3 days out. Specific to who's playing AND why this exact show matters now.",
  "Day Of": "Day-of post — TONIGHT energy, doors open soon, last call.",
};

function buildPrompt({ instruction, postType, showInfo, artistContext, urgency }) {
  const safeShowInfo = sanitizeShowInfoForLLM(showInfo);

  const artistBlock = artistContext
    ? `
ARTIST DETAILS:
- Type/Genre: ${artistContext.type || "(not specified)"}
- About: ${artistContext.about || "(not specified)"}
${artistContext.members ? `- Members: ${artistContext.members}\n` : ""}${artistContext.runtime ? `- Runtime: ${artistContext.runtime}\n` : ""}`
    : "\nARTIST DETAILS: (not available — use only what's in SHOW INFO)";

  const urgencyBlock = `\nURGENCY GUIDANCE (internal only — do NOT mention numbers or percentages in the post):\n${urgency.instruction}`;

  return `${instruction}

Return ONLY the post BODY copy text. No JSON, no labels, no preamble.

The system automatically appends a structured footer to every post containing the show date, showtime, venue, city/state, ticket link, and hashtags. You write the BODY only.

SHOW INFO (for tone — do NOT recap literally; the footer covers these):
${safeShowInfo}
${artistBlock}
${urgencyBlock}

CRITICAL RULES:
- Body ONLY. DO NOT write a hashtag block. DO NOT write the ticket URL. DO NOT include date/time/venue/city/state lines. DO NOT write "link in bio". DO NOT write "Get your tickets at...".
- MUST reference what makes THIS act specific — the tribute target, era, genre, or signature style. Never write generic "great live music" copy.
- If the act is a tribute (e.g. "Tribute Band - 70's"), name what they're tributing or the era in the first 1-2 sentences.
- ABSOLUTELY NO NUMBERS describing ticket sales, capacity, or availability. Use ONLY descriptive language: "selling fast", "almost sold out", "great seats still available", "tickets on sale now". Numbers describing showtime, date, or runtime are fine.
- BANNED OPENERS: "It's Showtime", "Showtime is here", "Tonight's the night", "The wait is over", or any close variation.
- BANNED WORDS/PHRASES: "unforgettable", "Don't miss this", "you don't want to miss", "you won't forget", "a night you'll never forget", "a night to remember", "memories you'll be talking about". These are tired clichés — write something specific instead.
- Energetic, conversational. 250–400 characters of body copy preferred (the footer is appended separately).
- Vary opening lines.`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { recordId, postType, showInfo, sourceRecordId } = req.body || {};
  if (!recordId || !showInfo) {
    return res.status(400).json({ error: "Missing recordId or showInfo" });
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY;

  try {
    const { artistContext, urgency, footerData } = sourceRecordId
      ? await fetchContext(sourceRecordId)
      : { artistContext: null, urgency: calcUrgency(null, null), footerData: null };

    const instruction = typeInstructions[postType] || typeInstructions["Event Promotion"];
    const prompt = buildPrompt({ instruction, postType, showInfo, artistContext, urgency });

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API ${claudeRes.status}: ${errText}`);
    }

    const claudeData = await claudeRes.json();
    const rawCopy = claudeData.content?.[0]?.text?.trim() || "";
    if (!rawCopy) throw new Error("No copy generated");

    const bodyClean1 = stripFooterArtifacts(rawCopy);
    const bodyClean2 = stripBannedPhrases(bodyClean1);
    const body = stripTicketNumbers(bodyClean2, urgency.tier);

    const footer = footerData
      ? buildFooter({
          ...footerData,
          hashtags: artistContext?.hashtags || "#livemusic #liveshow #TADshows #TADventure",
        })
      : "";
    const copy = footer ? `${body}\n\n${footer}` : body;

    const updateRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/${POSTS_TABLE}/${recordId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: { [F.POST_COPY]: copy } }),
      }
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`Airtable update ${updateRes.status}: ${errText}`);
    }

    return res.status(200).json({
      copy,
      urgencyTier: urgency.tier,
      hadArtistContext: Boolean(artistContext),
      hadFooter: Boolean(footer),
      outlet: footerData?.ticketUrl ? deriveOutlet(footerData.ticketUrl) : null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
