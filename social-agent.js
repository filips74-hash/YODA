const AIRTABLE_BASE_ID = 'app1gWDHklIHiq6yu';
const SOURCE_TABLE     = 'tblMkZoY6s1QiEBZP';
const DEST_TABLE       = 'tblU0C9ueSixKn7Cv';

const F = {
  ARTIST_SINGLESEL:  'fldSgq6BJiegtmGGx',
  TITLE:             'fldnBWwXqol7XKmPh',
  VENUE:             'fldOOZOvy8q8Y3GRO',
  CITY:              'fld6qHu6mqrIMysVe',
  STATE:             'fldtElpYlAswVSSeL',
  START_DATE:        'fldYOYoazpSSb1xKr',
  SHOWTIME:          'fldYN07daGYEPZPQC',
  SHORT_URL:         'fld4eRMVKpUnBiSPv',
  TICKET_LINK:       'fld2Cd127I4CZD5i6',
  SOCIAL_HANDLES:    'fldv5V0EkZb5Alx0I',
  VENUE_HANDLES:     'fldXUTQXg4Roa6xv2',
  DIVISION:          'fldG9dCwmTGX6Ut1x',
  SM_NOTES:          'fldpzn6YUsmFDbzLe',
};

const D = {
  POST_COPY:    'fld7Z2psB9gGg51kh',
  POST_CONTENT: 'flduCMmhUYPCCp7B5',
  POST_TYPE:    'fld0xOuuoV9eCDAga',
  STATUS:       'fldZXdXPuF2EkrmWY',
  PLATFORMS:    'fldJyU1eS53pRyMwX',
  POST_DATE:    'fld3nskHsRUiyrLI5',
  ARTIST_NAME:  'fldZeA36gfc8raDTq',
  EVENT_DATE:   'fldFmvgJFPcPjeZo8',
};

function airtableHeaders() {
  return {
    'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const show = new Date(dateStr);
  const now  = new Date();
  return Math.ceil((show - now) / (1000 * 60 * 60 * 24));
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function extractLookup(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val.map(v => (typeof v === 'object' ? v.name || v : v)).join(', ') || null;
  return String(val);
}

function getPostSchedule(showDate, daysOut) {
  const schedule = [];

  if (daysOut >= 30) {
    // Full campaign: announce at 30 days, hype at 14, second hype at 7, day of
    schedule.push({ type: 'announce', date: addDays(showDate, -30) });
    schedule.push({ type: 'hype',     date: addDays(showDate, -14) });
    schedule.push({ type: 'hype2',    date: addDays(showDate, -7)  });
    schedule.push({ type: 'dayof',    date: showDate               });
  } else if (daysOut >= 14) {
    // Missed announce window: hype now, second hype at 7, day of
    schedule.push({ type: 'hype',  date: today()                });
    schedule.push({ type: 'hype2', date: addDays(showDate, -7)  });
    schedule.push({ type: 'dayof', date: showDate               });
  } else if (daysOut >= 7) {
    // Close in: hype now, day of
    schedule.push({ type: 'hype',  date: today()   });
    schedule.push({ type: 'dayof', date: showDate  });
  } else if (daysOut >= 2) {
    // Very close: hype now, day of
    schedule.push({ type: 'hype',  date: today()   });
    schedule.push({ type: 'dayof', date: showDate  });
  } else {
    // Day of or tomorrow only
    schedule.push({ type: 'dayof', date: showDate  });
  }

  return schedule;
}

async function fetchShowRecord(recordId) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SOURCE_TABLE}/${recordId}?returnFieldsByFieldId=true`;
  const res  = await fetch(url, { headers: airtableHeaders() });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Airtable fetch failed: ${res.status} — ${err}`);
  }
  return res.json();
}

async function generatePosts(showContext) {
  const { artist, venue, city, state, showDate, showtime, ticketUrl,
          socialHandles, venueHandles, division, smNotes, daysOut, schedule } = showContext;

  const postTypes = schedule.map(s => s.type);

  const systemPrompt = `You are TAD Entertainment's social media strategist. TAD is a premier live entertainment company booking tribute acts and Broadway concerts across the United States.

Write social media posts for an upcoming show. Every post must feel completely different in structure, tone, and opening line.

POST TYPE GUIDELINES:

ANNOUNCE (2 weeks out) — This is the first time fans hear about this show. Build excitement and curiosity. Focus on the artist's legacy, what makes this act special, or why this venue is a great place to see a show. Do NOT create urgency about tickets yet.
  Example angles: "Did you know [artist] has been [doing X] for Y years?", "If you grew up loving [genre], this one's for you", "[City] — mark your calendars"

HYPE (2 weeks out) — Fans know about the show. Build excitement and start creating urgency. Focus on what makes the act special, the venue experience, or why this is a must-see.
  Example angles: "Two weeks away and we can't wait", "Here's what you're in for", "Get your group together"

HYPE2 (1 week out) — Final push before the show. Hard urgency now. Seats, timing, last chance messaging.
  Example angles: "Seats are going fast", "One week away — have you got yours?", "Still on the fence? Here's why you shouldn't be"

DAYOF — The show is TODAY. Create immediate, punchy energy. Be specific about time and location. Make it feel like something is happening RIGHT NOW that they could join.
  Example angles: Lead with the city name, lead with the time, lead with a question, lead with a bold statement about the music

STRICT RULES:
- NEVER open with "It's Showtime", "Showtime is here", "Tonight's the night", "The wait is over", or any variation of these
- NEVER use the word "unforgettable"
- NEVER use the phrase "Don't miss this"
- ALWAYS include the ticket URL when one is provided
- Use artist/venue social handles when available (tag with @)
- Vary your emoji usage — do not start every post with a music note or the same emoji
- Each post must have a completely unique opening line and structure
- Keep posts under 300 characters where possible
- Return ONLY valid JSON — no preamble, no markdown fences`;

  const jsonShape = postTypes.map(t => `  "${t}": { "copy": "${t} post text here" }`).join(',\n');

  const userPrompt = `Generate ${postTypes.length} social media post(s) for this show.

Posts needed: ${postTypes.join(', ')}
Days until show: ${daysOut}

Artist/Act: ${artist}
Venue: ${venue || 'TBD'}
City, State: ${city || ''}${state ? ', ' + state : ''}
Show Date: ${showDate}
Showtime: ${showtime || 'TBD'}
Ticket URL: ${ticketUrl || 'not provided'}
${socialHandles ? 'Artist handles: ' + socialHandles : ''}
${venueHandles  ? 'Venue handles: '  + venueHandles  : ''}
${division      ? 'TAD Division: '   + division      : ''}
${smNotes       ? 'Special notes: '  + smNotes       : ''}

IMPORTANT:
- Only write posts for the types listed above
- Each post must start with a completely different opening — no shared phrases between posts
- Think about what angle would make a local fan in ${city || 'this city'} stop scrolling

Return this exact JSON:
{
${jsonShape}
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API failed: ${res.status} — ${err}`);
  }

  const data  = await res.json();
  const raw   = data.content?.[0]?.text || '{}';
  const clean = raw.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${raw.slice(0, 200)}`);
  }
}

async function createPostRecords(posts, artist, recordId, schedule) {
  const records = schedule.map(({ type, date }) => ({
    fields: {
      [D.POST_COPY]:    posts[type]?.copy || '',
      [D.POST_CONTENT]: posts[type]?.copy || '',
      [D.POST_TYPE]:    'Event Promotion',
      [D.STATUS]:       'To Do',
      [D.PLATFORMS]:    ['TAD Facebook', 'TAD Instagram'],
      [D.POST_DATE]:    date,
      [D.ARTIST_NAME]:  artist || '',
      [D.EVENT_DATE]:   [recordId],
    },
  }));

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${DEST_TABLE}`;
  const res  = await fetch(url, {
    method:  'POST',
    headers: airtableHeaders(),
    body:    JSON.stringify({ records }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Airtable create failed: ${res.status} — ${err}`);
  }

  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = req.headers['x-agent-secret'];
  if (process.env.AGENT_SECRET && secret !== process.env.AGENT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { recordId } = req.body;
  if (!recordId || !recordId.startsWith('rec')) {
    return res.status(400).json({ error: 'Missing or invalid recordId' });
  }

  const log    = [];
  const addLog = (msg) => { log.push(`[${new Date().toISOString()}] ${msg}`); console.log(msg); };

  try {
    addLog(`Fetching show record: ${recordId}`);
    const record = await fetchShowRecord(recordId);
    const fields = record.fields || {};

    const titleParts = (fields[F.TITLE] || '').split('-');
    const artist     = titleParts[1]?.trim() || fields[F.ARTIST_SINGLESEL] || 'Unknown Artist';
    const venue      = fields[F.VENUE]     || null;
    const city       = fields[F.CITY]      || null;
    const state      = extractLookup(fields[F.STATE]);
    const showDate   = fields[F.START_DATE] || null;
    const showtime   = fields[F.SHOWTIME]   || null;
    const ticketUrl  = fields[F.SHORT_URL]  || fields[F.TICKET_LINK] || null;
    const socialHandles = extractLookup(fields[F.SOCIAL_HANDLES]);
    const venueHandles  = fields[F.VENUE_HANDLES] || null;
    const division      = fields[F.DIVISION] || null;
    const smNotes       = fields[F.SM_NOTES] || null;

    if (!showDate) return res.status(422).json({ error: 'Show record has no Start Date', log });

    const daysOut  = daysUntil(showDate);
    const schedule = getPostSchedule(showDate, daysOut);

    addLog(`Show context: ${artist} @ ${venue}, ${city} ${state} — ${daysOut} days out`);
    addLog(`Post schedule: ${schedule.map(s => s.type + ' on ' + s.date).join(', ')}`);

    const showContext = { artist, venue, city, state, showDate, showtime,
                         ticketUrl, socialHandles, venueHandles, division,
                         smNotes, daysOut, schedule };

    addLog('Calling Claude to generate posts...');
    const posts = await generatePosts(showContext);
    addLog(`Posts generated: ${Object.keys(posts).join(', ')}`);

    addLog('Creating records in Social Marketing Requests...');
    const created = await createPostRecords(posts, artist, recordId, schedule);
    addLog(`Created ${created.records?.length} records`);

    return res.status(200).json({
      success: true,
      show:    `${artist} @ ${venue}`,
      daysOut,
      schedule,
      recordsCreated: created.records?.length,
      posts: Object.fromEntries(
        Object.entries(posts).map(([k, v]) => [k, v?.copy?.slice(0, 100) + '...'])
      ),
      log,
    });

  } catch (err) {
    addLog(`ERROR: ${err.message}`);
    return res.status(500).json({ error: err.message, log });
  }
}
