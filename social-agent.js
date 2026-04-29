// /api/social-agent.js
// Bulk-generate the campaign for a show (announce / hype / hype2 / dayof).
// Pulls Artist Type/Copy/Members/Runtime/Hashtags AND ticket urgency from Airtable,
// passes both to Claude. Ticket numbers drive TONE, never appear as numbers.
//
// Footer (date / time / venue / city / tickets / hashtags) is built deterministically
// in code and appended to every post body. Claude only writes the body.

const AIRTABLE_BASE_ID = "app1gWDHklIHiq6yu";
const SOURCE_TABLE = "tblMkZoY6s1QiEBZP"; // SOCIAL MEDIA
const ARTIST_LINK_TABLE = "tblMpJkxnF5ysbDfR"; // Artist Link for Social Media
const DEST_TABLE = "tblU0C9ueSixKn7Cv"; // Social Marketing Requests

const F = {
  ARTIST_SINGLESEL: "fldSgq6BJiegtmGGx",
  TITLE: "fldnBWwXqol7XKmPh",
  VENUE: "fldOOZOvy8q8Y3GRO",
  CITY: "fld6qHu6mqrIMysVe",
  STATE: "fldtElpYlAswVSSeL",
  START_DATE: "fldYOYoazpSSb1xKr",
  SHOWTIME: "fldYN07daGYEPZPQC",
  SHORT_URL: "fld4eRMVKpUnBiSPv",
  TICKET_LINK: "fld2Cd127I4CZD5i6",
  SOCIAL_HANDLES: "fldv5V0EkZb5Alx0I",
  VENUE_HANDLES: "fldXUTQXg4Roa6xv2",
  DIVISION: "fldG9dCwmTGX6Ut1x",
  SM_NOTES: "fldpzn6YUsmFDbzLe",
  ARTISTS_LINK: "fldXyFXUSTxCSF4p9",
  CAPACITY: "fldWAVPF5TYg4rwIC",
  TIX_SOLD_CURRENT: "fldLGNb9dvqIeQf7F",
  INDOORS_OUTDOORS: "fldxhrbD4Q8pdkLqS",
};

const AL = {
  TYPE: "fldLTTiDBCcIgItBu",
  COPY: "fldWlm7nmTPTo2gql",
  MEMBERS: "flduxk8TYFtTRuldy",
  RUNTIME: "fldGxn372FYuytym7",
  HASHTAGS: "fld5ZqWDQvo8k2emn",
};

const D = {
  POST_COPY: "fld7Z2psB9gGg51kh",
  POST_CONTENT: "flduCMmhUYPCCp7B5",
  POST_TYPE: "fld0xOuuoV9eCDAga",
  STATUS: "fldZXdXPuF2EkrmWY",
  PLATFORMS: "fldJyU1eS53pRyMwX",
  POST_DATE: "fld3nskHsRUiyrLI5",
  ARTIST_NAME: "fldZeA36gfc8raDTq",
  EVENT_DATE: "fldFmvgJFPcPjeZo8",
};

function airtableHeaders() {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function extractLookup(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val.map((v) => (typeof v === "object" ? v.name || v : v)).join(", ") || null;
  return String(val);
}

function pickFirst(val) {
  if (Array.isArray(val)) return val[0];
  return val;
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

// Strip URLs, "link in bio" phrases, and trailing hashtag clusters from Claude's body.
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

  // Swap "unforgettable" for a less worn alternative, preserving capitalization.
  out = out.replace(/\bunforgettable\b/gi, (m) => {
    const repl = "incredible";
    return m[0] === m[0].toUpperCase() ? repl.charAt(0).toUpperCase() + repl.slice(1) : repl;
  });

  // Drop whole sentences that contain forbidden cliché phrases.
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

function getPostSchedule(showDate, daysOut) {
  const schedule = [];
  if (daysOut >= 30) {
    schedule.push({ type: "announce", date: addDays(showDate, -30) });
    schedule.push({ type: "hype", date: addDays(showDate, -14) });
    schedule.push({ type: "hype2", date: addDays(showDate, -7) });
    schedule.push({ type: "dayof", date: showDate });
  } else if (daysOut >= 14) {
    schedule.push({ type: "hype", date: today() });
    schedule.push({ type: "hype2", date: addDays(showDate, -7) });
    schedule.push({ type: "dayof", date: showDate });
  } else if (daysOut >= 7) {
    schedule.push({ type: "hype", date: today() });
    schedule.push({ type: "dayof", date: showDate });
  } else if (daysOut >= 2) {
    schedule.push({ type: "hype", date: today() });
    schedule.push({ type: "dayof", date: showDate });
  } else {
    schedule.push({ type: "dayof", date: showDate });
  }
  return schedule;
}

async function fetchShowRecord(recordId) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SOURCE_TABLE}/${recordId}?returnFieldsByFieldId=true`;
  const res = await fetch(url, { headers: airtableHeaders() });
  if (!res.ok) throw new Error(`Airtable fetch failed: ${res.status} — ${await res.text()}`);
  return res.json();
}

async function fetchArtistLinkRecord(artistRecordId) {
  if (!artistRecordId) return null;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${ARTIST_LINK_TABLE}/${artistRecordId}?returnFieldsByFieldId=true`;
  const res = await fetch(url, { headers: airtableHeaders() });
  if (!res.ok) return null;
  return res.json();
}

async function generatePosts(showContext) {
  const {
    artist, venue, city, state, showDate, showtime,
    socialHandles, venueHandles, division, smNotes, daysOut, schedule,
    artistType, artistAbout, artistMembers, artistRuntime,
    indoorsOutdoors, urgency,
  } = showContext;

  const postTypes = schedule.map((s) => s.type);

  const systemPrompt = `You are TAD Entertainment's social media strategist. TAD is a premier live entertainment company booking tribute acts and Broadway concerts across the United States.

Write social media posts for an upcoming show. Every post must feel completely different in structure, tone, and opening line.

POST TYPE GUIDELINES:

ANNOUNCE (~30 days out) — First time fans hear about this show. Build excitement and curiosity. Focus on the artist's legacy, what they're tributing, what makes this act special, or why this venue is great. Do NOT create urgency about tickets yet.

HYPE (~14 days out) — Fans know about the show. Build excitement, start mild urgency. Focus on what makes the act distinctive — songs, era, signature style. Reference specifics from the artist context.

HYPE2 (~7 days out) — Final push before the show. Urgency calibrated to the URGENCY TIER provided. Last chance messaging.

DAYOF — Show is TODAY. Immediate, punchy energy. Specific about time and location. Make it feel like something is happening RIGHT NOW.

CRITICAL RULES — apply to EVERY post:
- Write ONLY the body — the hook, artist specifics, urgency. The system automatically appends a structured footer to each post containing the show date, showtime, venue, city/state, ticket link, and hashtags. Do NOT write any of those.
- DO NOT include a hashtag block. DO NOT include the ticket URL. DO NOT write date, time, venue, city, or state lines. DO NOT write "link in bio". DO NOT write "Get your tickets at...".
- Reference what makes THIS act specific — tribute target, era, genre, signature songs/style. Never write generic "live music" copy.
- If the act is a tribute (Type field includes "Tribute Band - X" or "Tribute Act"), explicitly name what they're tributing or the era they cover.
- ABSOLUTELY NO NUMBERS describing ticket sales, capacity, or availability. Banned: "227 tickets sold", "65% sold", "only 50 left", "200 of 350 gone". Use ONLY descriptive language: "selling fast", "almost sold out", "great seats still available", "tickets on sale now". Numbers describing showtime, date, or runtime are fine.
- BANNED OPENERS: "It's Showtime", "Showtime is here", "Tonight's the night", "The wait is over", or any close variation.
- BANNED WORDS/PHRASES: "unforgettable", "Don't miss this", "you don't want to miss", "you won't forget", "a night you'll never forget", "a night to remember", "memories you'll be talking about". These are tired clichés — write something specific instead.
- Use artist/venue social handles (@) when available.
- Vary emoji usage — do not start every post with a music note or the same emoji. Some posts can have no emoji.
- Each post must have a completely unique opening line and structure.
- Aim for 250–400 characters of body copy per post (the footer is appended separately).

OUTPUT:
- Return ONLY valid JSON — no preamble, no markdown fences.
- Each post's "copy" field must contain ONLY the body — no footer, no hashtags, no URL.`;

  const jsonShape = postTypes.map((t) => `  "${t}": { "copy": "${t} post body — NO footer, NO hashtags, NO ticket URL" }`).join(",\n");

  const userPrompt = `Generate ${postTypes.length} social media post(s) for this show. Body copy only — the system appends a structured footer (date/time/venue/ticket URL/hashtags) to each post automatically.

Posts needed: ${postTypes.join(", ")}
Days until show: ${daysOut}

ARTIST CONTEXT:
- Name: ${artist}
- Type/Genre: ${artistType || "(not specified)"}
- About: ${artistAbout || "(not specified)"}
${artistMembers ? `- Members: ${artistMembers}\n` : ""}${artistRuntime ? `- Runtime: ${artistRuntime}\n` : ""}
SHOW CONTEXT (for tone — do NOT recap literally; the footer covers these):
- Venue: ${venue || "TBD"}${indoorsOutdoors ? ` (${indoorsOutdoors})` : ""}
- City, State: ${city || ""}${state ? ", " + state : ""}
- Show Date: ${showDate}
- Showtime: ${showtime || "TBD"}
${socialHandles ? `- Artist handles: ${socialHandles}\n` : ""}${venueHandles ? `- Venue handles: ${venueHandles}\n` : ""}${division ? `- TAD Division: ${division}\n` : ""}${smNotes ? `- Special notes: ${smNotes}\n` : ""}
URGENCY TIER (internal only — do NOT mention numbers or percentages in any post):
- Tier: ${urgency.tier}
- ${urgency.instruction}

REMINDERS:
- Each post must start with a completely different opening — no shared phrases between posts.
- Think about what would make a local fan in ${city || "this city"} stop scrolling.
- If the artist is a tribute act, the tribute target should appear naturally — it's the headline.
- Body copy ONLY. No hashtags. No ticket URL. No "link in bio". The footer is added by the system.

Return this exact JSON:
{
${jsonShape}
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API failed: ${res.status} — ${err}`);
  }

  const data = await res.json();
  const raw = data.content?.[0]?.text || "{}";
  const clean = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${raw.slice(0, 200)}`);
  }
}

async function createPostRecords(posts, artist, recordId, schedule, tier, footer) {
  const records = schedule.map(({ type, date }) => {
    const rawBody = posts[type]?.copy || "";
    const bodyClean1 = stripFooterArtifacts(rawBody);
    const bodyClean2 = stripBannedPhrases(bodyClean1);
    const body = stripTicketNumbers(bodyClean2, tier);
    const finalCopy = footer ? `${body}\n\n${footer}` : body;
    return {
      fields: {
        [D.POST_COPY]: finalCopy,
        [D.POST_CONTENT]: finalCopy,
        [D.POST_TYPE]: "Event Promotion",
        [D.STATUS]: "To Do",
        [D.PLATFORMS]: ["TAD Facebook", "TAD Instagram"],
        [D.POST_DATE]: date,
        [D.ARTIST_NAME]: artist || "",
        [D.EVENT_DATE]: [recordId],
      },
    };
  });

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${DEST_TABLE}`;
  const res = await fetch(url, {
    method: "POST",
    headers: airtableHeaders(),
    body: JSON.stringify({ records }),
  });

  if (!res.ok) throw new Error(`Airtable create failed: ${res.status} — ${await res.text()}`);
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const secret = req.headers["x-agent-secret"];
  if (process.env.AGENT_SECRET && secret !== process.env.AGENT_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { recordId } = req.body;
  if (!recordId || !recordId.startsWith("rec")) {
    return res.status(400).json({ error: "Missing or invalid recordId" });
  }

  const log = [];
  const addLog = (msg) => {
    log.push(`[${new Date().toISOString()}] ${msg}`);
    console.log(msg);
  };

  try {
    addLog(`Fetching show record: ${recordId}`);
    const record = await fetchShowRecord(recordId);
    const fields = record.fields || {};

    const titleParts = (fields[F.TITLE] || "").split("-");
    const artist = titleParts[1]?.trim() || fields[F.ARTIST_SINGLESEL] || "Unknown Artist";
    const venue = fields[F.VENUE] || null;
    const city = fields[F.CITY] || null;
    const state = extractLookup(fields[F.STATE]);
    const showDate = fields[F.START_DATE] || null;
    const showtime = fields[F.SHOWTIME] || null;
    const ticketUrl = fields[F.SHORT_URL] || fields[F.TICKET_LINK] || null;
    const socialHandles = extractLookup(fields[F.SOCIAL_HANDLES]);
    const venueHandles = fields[F.VENUE_HANDLES] || null;
    const division = fields[F.DIVISION] || null;
    const smNotes = fields[F.SM_NOTES] || null;
    const indoorsOutdoors = fields[F.INDOORS_OUTDOORS] || null;
    const capacity = fields[F.CAPACITY];
    const tixSold = fields[F.TIX_SOLD_CURRENT];

    if (!showDate) return res.status(422).json({ error: "Show record has no Start Date", log });

    let artistType = null;
    let artistAbout = null;
    let artistMembers = null;
    let artistRuntime = null;
    let artistHashtags = null;
    const artistLinkId = pickFirst(fields[F.ARTISTS_LINK]);
    if (artistLinkId) {
      addLog(`Fetching artist context: ${artistLinkId}`);
      const artistRec = await fetchArtistLinkRecord(artistLinkId);
      if (artistRec) {
        const af = artistRec.fields || {};
        const types = af[AL.TYPE];
        artistType = Array.isArray(types) ? types.join(", ") : types || null;
        artistAbout = cleanRich(af[AL.COPY]);
        artistMembers = af[AL.MEMBERS] || null;
        artistRuntime = af[AL.RUNTIME] || null;
        const rawHashtags = (af[AL.HASHTAGS] || "").toString().trim();
        artistHashtags = rawHashtags || null;
      }
    }

    const urgency = calcUrgency(tixSold, capacity);
    addLog(`Urgency tier: ${urgency.tier} (sold=${tixSold ?? "?"}, cap=${capacity ?? "?"})`);

    const daysOut = daysUntil(showDate);
    const schedule = getPostSchedule(showDate, daysOut);

    addLog(`Show context: ${artist} @ ${venue}, ${city} ${state} — ${daysOut} days out`);
    addLog(`Hashtag source: ${artistHashtags ? "Artist Link record" : "default fallback"}`);
    addLog(`Post schedule: ${schedule.map((s) => s.type + " on " + s.date).join(", ")}`);

    const showContext = {
      artist, venue, city, state, showDate, showtime,
      socialHandles, venueHandles, division, smNotes, daysOut, schedule,
      artistType, artistAbout, artistMembers, artistRuntime,
      indoorsOutdoors, urgency,
    };

    addLog("Calling Claude to generate posts...");
    const posts = await generatePosts(showContext);
    addLog(`Posts generated: ${Object.keys(posts).join(", ")}`);

    const footer = buildFooter({
      showDate,
      showtime,
      venue,
      city,
      state,
      ticketUrl,
      hashtags: artistHashtags || "#livemusic #liveshow #TADshows #TADventure",
    });
    addLog(`Footer built: ${footer.split("\n").length} line(s), outlet=${deriveOutlet(ticketUrl) || "n/a"}`);

    addLog("Creating records in Social Marketing Requests...");
    const created = await createPostRecords(posts, artist, recordId, schedule, urgency.tier, footer);
    addLog(`Created ${created.records?.length} records`);

    return res.status(200).json({
      success: true,
      show: `${artist} @ ${venue}`,
      daysOut,
      urgencyTier: urgency.tier,
      hadHashtags: Boolean(artistHashtags),
      schedule,
      recordsCreated: created.records?.length,
      posts: Object.fromEntries(
        Object.entries(posts).map(([k, v]) => [k, v?.copy?.slice(0, 100) + "..."])
      ),
      log,
    });
  } catch (err) {
    addLog(`ERROR: ${err.message}`);
    return res.status(500).json({ error: err.message, log });
  }
}
