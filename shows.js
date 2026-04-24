const BASE       = "app1gWDHklIHiq6yu";
const SHOWS_TBL  = "tblMkZoY6s1QiEBZP";
const POSTS_TBL  = "tblU0C9ueSixKn7Cv";

const SHOW_FIELDS = [
  "fldYOYoazpSSb1xKr", // Start Date
  "fldSgq6BJiegtmGGx", // ARTIST (singleSelect)
  "fldoQfwVAdMJho74O", // TAD BANDS (text)
  "fldLY6PCaKe4oCIbm", // VENUES (singleSelect)
  "fld6qHu6mqrIMysVe", // City (text)
  "fldtElpYlAswVSSeL", // State
  "fldYN07daGYEPZPQC", // Showtime
  "fldN0KOM6Gz4A8CeZ", // TAD REP
  "fldJCGL1mJLVuqT5H", // Artist Photo
  "fldYHYmVLTSOXlyg2", // Key Art
  "fldlDfPfMGY7q4U35", // Venue Photo
  "fldKmj5eEA4ja2R0s", // Photo (general)
  "fldhXrWGRF7FkjVrV", // Social Marketing Requests (linked IDs)
  "fldNJF2rYXfs5deQw", // STATUS
  "fldnBWwXqol7XKmPh", // Title (formula: "Date-Artist-Venue")
  "fld2Cd127I4CZD5i6", // Ticket Link
  "fldLGNb9dvqIeQf7F", // Tix Sold Current
  "fldWAVPF5TYg4rwIC", // Capacity
];

const POST_FIELDS = [
  "fld0xOuuoV9eCDAga", // Type of Post
  "fldmnE7BES9IgKpDM", // Post Status
  "fldZXdXPuF2EkrmWY", // Status
  "flduCMmhUYPCCp7B5", // POST CONTENT
  "fld7Z2psB9gGg51kh", // Post Copy
  "fld3nskHsRUiyrLI5", // Post Date
  "fldZeA36gfc8raDTq", // Artist Name (text written by pipeline)
  "fldhrVxDR5byWeybC", // Artist (lookup)
  "fldunO2ry1ggObR3E", // Venue (lookup)
  "fldomQPuS7wsmozv3", // Artist Name (Text) formula
  "fldWRo3CEOzxclVA8", // Requester Name formula
];

async function airtableFetch(url, key) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchAllPages(baseUrl, key) {
  let records = [], offset = null;
  do {
    const url = offset ? `${baseUrl}&offset=${offset}` : baseUrl;
    const data = await airtableFetch(url, key);
    records = records.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);
  return records;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const key  = process.env.AIRTABLE_API_KEY;
  const days = parseInt(req.query.days || "60", 10);
  const rep  = (req.query.rep || "").trim();

  try {
    const skipStatuses = ["Canceled","Cancelled","Complete","Cancelled with Expenses"];
    const statusFilter = skipStatuses.map(s => `{STATUS} != "${s}"`).join(", ");
    const formula = `AND(IS_AFTER({Start Date}, DATEADD(TODAY(), -1, 'days')), IS_BEFORE({Start Date}, DATEADD(TODAY(), ${days}, 'days')), ${statusFilter}${rep ? `, {TAD REP} = "${rep}"` : ""})`;

    const fieldParams = SHOW_FIELDS.map(f => `fields[]=${f}`).join("&");
    const showsUrl = `https://api.airtable.com/v0/${BASE}/${SHOWS_TBL}?returnFieldsByFieldId=true&${fieldParams}&filterByFormula=${encodeURIComponent(formula)}&sort[0][field]=fldYOYoazpSSb1xKr&sort[0][direction]=asc&pageSize=100`;
    const showRecords = await fetchAllPages(showsUrl, key);

    // Collect all linked post IDs
    const allPostIds = [];
    showRecords.forEach(show => {
      const linked = show.fields["fldhXrWGRF7FkjVrV"];
      if (Array.isArray(linked)) allPostIds.push(...linked);
    });

    // Batch fetch posts
    const postMap = {};
    const CHUNK = 50;
    for (let i = 0; i < allPostIds.length; i += CHUNK) {
      const chunk = allPostIds.slice(i, i + CHUNK);
      const orClauses = chunk.map(id => `RECORD_ID() = "${id}"`).join(", ");
      const postFieldParams = POST_FIELDS.map(f => `fields[]=${f}`).join("&");
      const postsUrl = `https://api.airtable.com/v0/${BASE}/${POSTS_TBL}?returnFieldsByFieldId=true&${postFieldParams}&filterByFormula=${encodeURIComponent(`OR(${orClauses})`)}&pageSize=100`;
      const postRecords = await fetchAllPages(postsUrl, key);
      postRecords.forEach(pr => { postMap[pr.id] = pr; });
    }

    function firstAttachment(field) {
      if (!field) return null;
      if (Array.isArray(field) && field.length) return field[0].url;
      if (field.valuesByLinkedRecordId) {
        const vals = Object.values(field.valuesByLinkedRecordId).flat();
        return vals[0]?.url || null;
      }
      return null;
    }

    function selectName(field) {
      if (!field) return null;
      if (typeof field === "object" && !Array.isArray(field)) return field.name || null;
      return String(field);
    }

    function lookupName(field) {
      if (!field) return "";
      if (field.valuesByLinkedRecordId) {
        const all = Object.values(field.valuesByLinkedRecordId).flat();
        return all.map(v => v?.name || "").filter(Boolean).join(", ");
      }
      if (Array.isArray(field)) return field.map(v => v?.name || v || "").filter(Boolean).join(", ");
      return "";
    }

    // Parse "Month Day, Year-Artist-Venue" from Title formula
    function parseTitle(title) {
      if (!title || typeof title !== "string") return { artist: "", venue: "" };
      const parts = title.split("-");
      if (parts.length >= 3) {
        return { artist: parts[1].trim(), venue: parts.slice(2).join("-").trim() };
      }
      if (parts.length === 2) return { artist: parts[1].trim(), venue: "" };
      return { artist: title.trim(), venue: "" };
    }

    const shows = showRecords.map(show => {
      const f = show.fields;
      const linkedIds = f["fldhXrWGRF7FkjVrV"] || [];

      const posts = linkedIds
        .map(id => postMap[id])
        .filter(Boolean)
        .map(pr => {
          const pf = pr.fields;
          const rawContent = pf["flduCMmhUYPCCp7B5"] || pf["fld7Z2psB9gGg51kh"] || "";
          const rawStatus = selectName(pf["fldZXdXPuF2EkrmWY"]) || selectName(pf["fldmnE7BES9IgKpDM"]) || "";
          // Derive post type label from Type of Post or content signals
          const typeRaw = selectName(pf["fld0xOuuoV9eCDAga"]) || "";
          return {
            id: pr.id,
            type: typeRaw || "Event Promotion",
            status: rawStatus,
            content: rawContent,
            postDate: pf["fld3nskHsRUiyrLI5"] || null,
            // keep for artist resolution
            _artistText: pf["fldZeA36gfc8raDTq"] || "",
            _artistLookup: lookupName(pf["fldhrVxDR5byWeybC"]),
            _artistFormula: pf["fldomQPuS7wsmozv3"] || "",
            _requesterName: pf["fldWRo3CEOzxclVA8"] || "",
            _venueLookup: lookupName(pf["fldunO2ry1ggObR3E"]),
          };
        })
        .sort((a, b) => (a.postDate || "").localeCompare(b.postDate || ""));

      // Resolve artist name — priority order
      const fp = posts[0];
      let artist = "", venue = "";

      // 1. ARTIST single select on show record
      const artistSelect = selectName(f["fldSgq6BJiegtmGGx"]);
      if (artistSelect) { artist = artistSelect; }

      // 2. TAD BANDS text field
      if (!artist) { artist = f["fldoQfwVAdMJho74O"] || ""; }

      // 3. Title formula (most reliable for new pipeline records)
      if (!artist) {
        const parsed = parseTitle(f["fldnBWwXqol7XKmPh"]);
        artist = parsed.artist;
        venue = parsed.venue;
      }

      // 4. From post's artist text field (written by Make pipeline)
      if (!artist && fp?._artistText) {
        const parsed = parseTitle(fp._artistText);
        artist = parsed.artist || fp._artistText;
      }

      // 5. Lookup/formula from post record
      if (!artist && fp?._artistLookup) artist = fp._artistLookup;
      if (!artist && fp?._artistFormula) artist = fp._artistFormula;

      // Venue fallbacks
      if (!venue) venue = selectName(f["fldLY6PCaKe4oCIbm"]) || fp?._venueLookup || "";

      const cleanPosts = posts.map(({ _artistText, _artistLookup, _venueLookup, _artistFormula, _requesterName, ...rest }) => rest);

      return {
        id: show.id,
        artist: artist || "Unknown Artist",
        venue,
        city: f["fld6qHu6mqrIMysVe"] || "",
        state: selectName(f["fldtElpYlAswVSSeL"]?.[0]) || (Array.isArray(f["fldtElpYlAswVSSeL"]) ? f["fldtElpYlAswVSSeL"][0]?.name : "") || "",
        showtime: f["fldYN07daGYEPZPQC"] || "",
        ticketLink: f["fld2Cd127I4CZD5i6"] || "",
        tixSold: f["fldLGNb9dvqIeQf7F"] || 0,
        capacity: f["fldWAVPF5TYg4rwIC"] || 0,
        rep: selectName(f["fldN0KOM6Gz4A8CeZ"]) || "",
        startDate: f["fldYOYoazpSSb1xKr"] || null,
        status: selectName(f["fldNJF2rYXfs5deQw"]) || "",
        artistPhoto: firstAttachment(f["fldJCGL1mJLVuqT5H"]),
        keyArt: firstAttachment(f["fldYHYmVLTSOXlyg2"]),
        venuePhoto: firstAttachment(f["fldlDfPfMGY7q4U35"]) || firstAttachment(f["fldKmj5eEA4ja2R0s"]),
        posts: cleanPosts,
      };
    });

    return res.status(200).json({ shows });
  } catch (err) {
    console.error("shows.js error:", err);
    return res.status(500).json({ error: err.message, shows: [] });
  }
}
