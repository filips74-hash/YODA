const BASE    = "app1gWDHklIHiq6yu";
const TABLE   = "tblU0C9ueSixKn7Cv";

// Existing fields
const F_COPY      = "fld7Z2psB9gGg51kh";
const F_STATUS    = "fldZXdXPuF2EkrmWY";
const F_TYPE      = "fld0xOuuoV9eCDAga";
const F_PLATFORMS = "fldJyU1eS53pRyMwX";
const F_DUE       = "fld3nskHsRUiyrLI5";

// New attachment fields
const F_ARTIST_PHOTO = "fldB5GD09PckzbfpS";
const F_KEY_ART      = "fldNqudSaYc5rAetC";
const F_VENUE_PHOTO  = "fldjCIFCybkLdJKhq";

/** Pull the first attachment URL from an Airtable attachment array, or null */
function firstAttachmentUrl(field) {
  if (!Array.isArray(field) || field.length === 0) return null;
  return field[0].url || null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")    return res.status(405).json({ error: "Method not allowed" });

  const ALL_FIELDS = [
    F_COPY, F_STATUS, F_TYPE, F_PLATFORMS, F_DUE,
    F_ARTIST_PHOTO, F_KEY_ART, F_VENUE_PHOTO,
  ];

  const params = new URLSearchParams();
  ALL_FIELDS.forEach(f => params.append("fields[]", f));
  params.set("filterByFormula", "NOT({Post Copy}='')");
  params.set("sort[0][field]",      F_DUE);
  params.set("sort[0][direction]",  "asc");
  params.set("maxRecords",          "100");
  params.set("returnFieldsByFieldId", "true");

  try {
    const url = `https://api.airtable.com/v0/${BASE}/${TABLE}?${params.toString()}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);

    const posts = (data.records || []).map(r => {
      const f = r.fields || {};
      const copy = f[F_COPY] || "";
      const labelMatch = copy.match(/^[^\.\!\?]{8,45}/);
      const label = labelMatch ? labelMatch[0].trim() : copy.slice(0, 40);

      return {
        id:          r.id,
        copy,
        label,
        status:      f[F_STATUS]?.name    || f[F_STATUS]    || "To Do",
        type:        f[F_TYPE]?.name      || "",
        platforms:   (f[F_PLATFORMS] || []).map(p => p.name || p),
        due:         f[F_DUE]             || "",
        // Attachment CDN URLs — no auth required, safe to use in img/canvas
        artistPhoto: firstAttachmentUrl(f[F_ARTIST_PHOTO]),
        keyArt:      firstAttachmentUrl(f[F_KEY_ART]),
        venuePhoto:  firstAttachmentUrl(f[F_VENUE_PHOTO]),
      };
    });

    res.status(200).json({ posts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
