import { useState, useEffect, useMemo } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const C = {
  navy:       "#E8F0F9",               // page background
  navyCard:   "#FFFFFF",               // card / surface
  navyLight:  "#E2ECF5",               // input / subtle fill
  gold:       "#154273",               // primary accent — deep arctic blue
  goldDim:    "rgba(27,79,140,0.12)",
  goldBorder: "rgba(27,79,140,0.28)",
  text:       "#0D1B2E",               // primary text
  muted:      "#64748B",               // muted text
  mutedMid:   "#94A3B8",               // lighter muted
};

// Field IDs — SOCIAL MEDIA table
const FLD = {
  SHOW_INFO:    "fldalAfvaoQlkWjtF",
  START_DATE:   "fldYOYoazpSSb1xKr",
  STATUS:       "fldNJF2rYXfs5deQw",
  ARTIST:       "fldSgq6BJiegtmGGx",  // singleSelect
  TAD_BANDS:    "fldoQfwVAdMJho74O",  // text lookup
  VENUES:       "fldLY6PCaKe4oCIbm",  // singleSelect
  CITY:         "fld6qHu6mqrIMysVe",
  STATE:        "fldtElpYlAswVSSeL",  // multiSelect
  SHOWTIME:     "fldYN07daGYEPZPQC",
  TICKET_LINK:  "fld2Cd127I4CZD5i6",
  TITLE:        "fldnBWwXqol7XKmPh",  // formula
  ARTIST_PHOTO: "fldJCGL1mJLVuqT5H",
  KEY_ART:      "fldYHYmVLTSOXlyg2",
  VENUE_PHOTO:  "fldlDfPfMGY7q4U35",
  TIX_SOLD:     "fldLGNb9dvqIeQf7F",
  CAPACITY:     "fldWAVPF5TYg4rwIC",
  POST_16W:     "fldtEBEoEKB8DE3Va",  // Post -16w formula
  POST_7W:      "fldlw1YhTzBJSQEGo",  // Post -7w formula
  POST_3W:      "fldMS2Fh0NMYqhlMm",  // Post -3w formula
  COPY_16W:     "fldoVZb4Vd0Q6Y5Qv",  // Post 16w Copy (accepted text)
  COPY_7W:      "fldRxVZqKE0ClNMxw",  // Post 7w Copy (accepted text)
  COPY_3W:      "fldllD05QkVOKAZCV",  // Post 3w Copy (accepted text)
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function str(v) {
  if (v == null) return "";
  if (typeof v === "object") return v.name || v.text || "";
  return String(v);
}

function getAttachment(fields, id) {
  const v = fields[id];
  if (!v) return null;
  if (Array.isArray(v) && v.length) return v[0].url || null;
  if (typeof v === "object" && v.valuesByLinkedRecordId) {
    const vals = Object.values(v.valuesByLinkedRecordId);
    if (vals.length && Array.isArray(vals[0]) && vals[0].length) return vals[0][0].url || null;
  }
  return null;
}

function parseDate(v, noon = false) {
  if (!v) return null;
  const s = noon ? v + "T12:00:00" : v;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function fmtDate(d, opts) {
  if (!d) return "TBD";
  return d.toLocaleDateString("en-US", opts || { month: "short", day: "numeric", year: "numeric" });
}

function dateKey(d) {
  if (!d) return "_undated";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// ─── DATA PROCESSING ─────────────────────────────────────────────────────────

function processShow(rec) {
  const f = rec.fields || {};

  // Artist name resolution:
  // 1. ARTIST singleSelect — most reliable, returns string or {name}
  // 2. Parse from Title formula "Month DD, YYYY-ArtistName-Venue"
  // 3. TAD_BANDS is a checkbox lookup — skip if it looks like "X checked out of Y"
  const artistName = (() => {
    const artist = f[FLD.ARTIST];
    if (artist) {
      const v = typeof artist === "object" ? (artist.name || "") : String(artist);
      if (v && !v.includes("checked")) return v;
    }
    // Parse artist segment from Title formula e.g. "May 8, 2026-The Rolling Stones-State Theatre"
    const title = f[FLD.TITLE];
    if (title && typeof title === "string") {
      const parts = title.split("-");
      if (parts.length >= 2) {
        const candidate = parts[1].trim();
        if (candidate) return candidate;
      }
    }
    return "Unknown Artist";
  })();

  const startDate   = parseDate(f[FLD.START_DATE], true);
  const post16w     = parseDate(f[FLD.POST_16W]);
  const post7w      = parseDate(f[FLD.POST_7W]);
  const post3w      = parseDate(f[FLD.POST_3W]);

  const venue    = str(f[FLD.VENUES]);
  const city     = str(f[FLD.CITY]);
  const stateRaw = f[FLD.STATE];
  const state    = Array.isArray(stateRaw)
    ? stateRaw.map(s => typeof s === "object" ? s.name : s).join(", ")
    : str(stateRaw);

  const showtime   = str(f[FLD.SHOWTIME]);
  const ticketLink = str(f[FLD.TICKET_LINK]);
  const capacity   = f[FLD.CAPACITY] ? Number(f[FLD.CAPACITY]) : 0;
  const tixSold    = f[FLD.TIX_SOLD]  ? Number(f[FLD.TIX_SOLD])  : 0;

  // fldKmj5eEA4ja2R0s = Photo (general fallback field on SOCIAL MEDIA table)
  const generalPhoto = getAttachment(f, "fldKmj5eEA4ja2R0s");
  const artistPhoto  = getAttachment(f, FLD.ARTIST_PHOTO) || generalPhoto;
  const keyArt       = getAttachment(f, FLD.KEY_ART)      || generalPhoto;
  const venuePhoto   = getAttachment(f, FLD.VENUE_PHOTO)  || generalPhoto;

  // Previously accepted copy — loaded fresh from Airtable on each page load
  const copy16w = f[FLD.COPY_16W] || null;
  const copy7w  = f[FLD.COPY_7W]  || null;
  const copy3w  = f[FLD.COPY_3W]  || null;

  return {
    id: rec.id,
    artistName,
    startDate,
    post16w,
    post7w,
    post3w,
    copy16w,
    copy7w,
    copy3w,
    venue,
    city,
    state,
    showtime,
    ticketLink,
    capacity,
    tixSold,
    artistPhoto,
    keyArt,
    venuePhoto,
  };
}

// ─── POST SLOT ────────────────────────────────────────────────────────────────

const SLOT_META = {
  16: { label: "16 Weeks Out", sublabel: "Announce",   color: "#154273" },
   7: { label: "7 Weeks Out",  sublabel: "Momentum",   color: "#5B8FCC" },
   3: { label: "3 Weeks Out",  sublabel: "Final Push",  color: "#C0392B" },
};

function PostSlot({ weeksOut, date, show, copyFieldId, initialCopy }) {
  const [copy,       setCopy]       = useState(initialCopy || null);
  const [accepted,   setAccepted]   = useState(!!initialCopy);
  const [editing,    setEditing]    = useState(false);
  const [editDraft,  setEditDraft]  = useState(initialCopy || "");
  const [generating, setGenerating] = useState(false);
  const [accepting,  setAccepting]  = useState(false);
  const [expanded,   setExpanded]   = useState(!!initialCopy);
  const [copied,     setCopied]     = useState(false);
  const [saveErr,    setSaveErr]    = useState(null);

  const meta = SLOT_META[weeksOut];

  async function generateCopy() {
    setGenerating(true);
    setExpanded(true);
    setAccepted(false);
    setSaveErr(null);

    const postStyle =
      weeksOut === 16 ? "announcement — just confirmed, save the date energy" :
      weeksOut ===  7 ? "momentum/hype — building anticipation, what to expect" :
                        "final push urgency — last call, don't miss out";
    const timing =
      weeksOut === 16 ? "16 weeks before the show" :
      weeksOut ===  7 ? "7 weeks before the show"  :
                        "3 weeks before the show";

    const showInfo = [
      `Artist: ${show.artistName}`,
      show.venue      && `Venue: ${show.venue}`,
      show.city       && `City: ${show.city}${show.state ? `, ${show.state}` : ""}`,
      show.showtime   && `Showtime: ${show.showtime}`,
      show.startDate  && `Show Date: ${fmtDate(show.startDate)}`,
      show.ticketLink && `Ticket Link: ${show.ticketLink}`,
      show.tixSold && show.capacity && `Tickets Sold: ${show.tixSold} / ${show.capacity}`,
    ].filter(Boolean).join("\n");

    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `Write a social media post for a live show. Style: ${postStyle}. This post will be published ${timing}.\n\nKeep it punchy and energetic (2–4 sentences). Use relevant emojis. End with a call to action. For Facebook and Instagram. Return ONLY the post copy — no commentary, no labels, no quotes.\n\nShow info:\n${showInfo}`,
          }],
        }),
      });
      const data = await res.json();

      // Surface real API errors instead of swallowing them
      if (!res.ok || data.type === "error") {
        const msg = data?.error?.message || data?.error || `API error ${res.status}`;
        throw new Error(msg);
      }

      const text = (data.content || []).map(b => b.text || "").join("").trim();
      if (!text) throw new Error("Empty response from API");
      setCopy(text);
      setEditDraft(text);
    } catch (e) {
      const err = `Error: ${e.message}`;
      setCopy(err);
      setEditDraft(err);
    }
    setGenerating(false);
  }

  async function handleAccept() {
    const textToSave = editing ? editDraft : copy;
    if (!textToSave) return;
    setAccepting(true);
    setSaveErr(null);
    try {
      const res = await fetch("/api/update-show", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: show.id, fieldId: copyFieldId, value: textToSave }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCopy(textToSave);
      setEditDraft(textToSave);
      setAccepted(true);
      setEditing(false);
    } catch (e) {
      setSaveErr("Save failed — check that AIRTABLE_API_KEY is set in Vercel.");
    }
    setAccepting(false);
  }

  async function handleClearAccepted() {
    try {
      await fetch("/api/update-show", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: show.id, fieldId: copyFieldId, value: "" }),
      });
    } catch {}
    setCopy(null);
    setEditDraft("");
    setAccepted(false);
    setEditing(false);
    setExpanded(false);
  }

  const borderColor = accepted ? "#1A7F4B" : meta.color;

  return (
    <div style={{
      flex: "1 1 200px",
      border: `1px solid ${expanded ? borderColor + "66" : "rgba(27,79,140,0.12)"}`,
      borderRadius: 10,
      overflow: "hidden",
      transition: "border-color 0.2s",
      background: accepted ? "rgba(26,127,75,0.05)" : expanded ? meta.color + "08" : "transparent",
    }}>

      {/* Slot header */}
      <div style={{
        padding: "12px 14px",
        borderBottom: expanded ? `1px solid ${borderColor}22` : "none",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <div style={{
            width: 9, height: 9, borderRadius: "50%",
            background: accepted ? "#1A7F4B" : meta.color,
            flexShrink: 0, transition: "background 0.3s",
          }} />
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 700,
              color: accepted ? "#1A7F4B" : meta.color,
              textTransform: "uppercase", letterSpacing: "0.07em", transition: "color 0.3s",
            }}>
              {meta.label}{accepted ? " ✓" : ""}
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
              {meta.sublabel} · {fmtDate(date)}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          {copy && !generating && (
            <button onClick={() => setExpanded(e => !e)} style={{
              fontSize: 10, padding: "4px 9px", borderRadius: 5,
              border: `1px solid ${C.goldBorder}`,
              background: "transparent", color: C.mutedMid, cursor: "pointer",
            }}>{expanded ? "Hide" : "Show"}</button>
          )}
          <button
            onClick={generateCopy}
            disabled={generating || accepting}
            style={{
              background: !copy ? meta.color : "transparent",
              color:      !copy ? C.navy     : C.mutedMid,
              border: `1px solid ${!copy ? meta.color : C.goldBorder}`,
              borderRadius: 6, padding: "4px 10px",
              fontSize: 10, fontWeight: !copy ? 700 : 400,
              cursor: generating ? "wait" : "pointer",
              textTransform: !copy ? "uppercase" : "none",
              letterSpacing: !copy ? "0.05em" : 0,
              opacity: generating ? 0.6 : 1,
              whiteSpace: "nowrap", transition: "all 0.15s",
            }}
          >
            {generating ? "Writing…" : copy ? "↺ Redo" : "Generate"}
          </button>
        </div>
      </div>

      {/* Copy body */}
      {expanded && (
        <div style={{ padding: "14px 16px" }}>
          {generating ? (
            <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>Writing post copy…</div>
          ) : editing ? (
            <>
              <textarea
                value={editDraft}
                onChange={e => setEditDraft(e.target.value)}
                rows={5}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: C.navyLight, border: `1px solid ${meta.color}44`,
                  borderRadius: 7, padding: "10px 12px",
                  color: C.text, fontSize: 12, lineHeight: 1.7,
                  resize: "vertical", outline: "none", fontFamily: "inherit",
                }}
              />
              <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
                <button onClick={handleAccept} disabled={accepting || !editDraft.trim()} style={{
                  flex: 1, fontSize: 11, padding: "7px 0", borderRadius: 6,
                  border: "none", background: "#1A7F4B",
                  color: "#fff", fontWeight: 700, cursor: accepting ? "wait" : "pointer",
                  opacity: accepting ? 0.7 : 1,
                }}>
                  {accepting ? "Saving…" : "✓ Accept Changes"}
                </button>
                <button onClick={() => { setEditing(false); setEditDraft(copy); }} style={{
                  fontSize: 11, padding: "7px 12px", borderRadius: 6,
                  border: `1px solid ${C.goldBorder}`,
                  background: "transparent", color: C.muted, cursor: "pointer",
                }}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <p style={{
                fontSize: 13, color: C.text, lineHeight: 1.75,
                margin: "0 0 12px", whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>{copy}</p>

              {saveErr && (
                <div style={{ fontSize: 11, color: "#C0392B", marginBottom: 8 }}>{saveErr}</div>
              )}

              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                {!accepted && (
                  <button onClick={handleAccept} disabled={accepting} style={{
                    fontSize: 11, padding: "6px 14px", borderRadius: 6,
                    border: "none", background: "#1A7F4B",
                    color: "#fff", fontWeight: 700,
                    cursor: accepting ? "wait" : "pointer",
                    opacity: accepting ? 0.7 : 1,
                  }}>
                    {accepting ? "Saving…" : "✓ Accept"}
                  </button>
                )}
                <button onClick={() => { setEditing(true); setEditDraft(copy); }} style={{
                  fontSize: 11, padding: "6px 12px", borderRadius: 6,
                  border: `1px solid ${C.goldBorder}`,
                  background: "transparent", color: C.gold,
                  cursor: "pointer", fontWeight: 600,
                }}>Edit</button>
                <button onClick={() => {
                  navigator.clipboard?.writeText(copy);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }} style={{
                  fontSize: 11, padding: "6px 12px", borderRadius: 6,
                  border: `1px solid ${copied ? "#1A7F4B" : C.goldBorder}`,
                  background: copied ? "rgba(26,127,75,0.1)" : "transparent",
                  color: copied ? "#1A7F4B" : C.mutedMid,
                  cursor: "pointer", transition: "all 0.2s",
                }}>{copied ? "✓ Copied" : "Copy"}</button>
                {accepted && (
                  <button onClick={handleClearAccepted} style={{
                    fontSize: 11, padding: "6px 10px", borderRadius: 6,
                    border: `1px solid rgba(232,98,58,0.3)`,
                    background: "transparent", color: "rgba(232,98,58,0.5)",
                    cursor: "pointer", marginLeft: "auto",
                  }} title="Remove accepted copy from Airtable">Clear</button>
                )}
              </div>

              {accepted && (
                <div style={{
                  marginTop: 10, fontSize: 10, color: "#1A7F4B",
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  <span>✓</span>
                  <span>Accepted — stored in Airtable, schedules on {fmtDate(date)}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SHOW ROW ────────────────────────────────────────────────────────────────

function ShowRow({ show }) {
  const [open, setOpen] = useState(false);
  const heroImg  = show.keyArt || show.artistPhoto || show.venuePhoto;
  const fillRate = show.capacity && show.tixSold
    ? Math.round((show.tixSold / show.capacity) * 100)
    : null;
  const fillColor =
    fillRate === null ? null :
    fillRate > 75 ? "#1A7F4B" :
    fillRate > 40 ? C.gold    : "#E8623A";

  return (
    <div style={{
      background: C.navyCard,
      border: `1px solid ${open ? C.goldBorder : "rgba(27,79,140,0.18)"}`,
      borderRadius: 14, overflow: "hidden", marginBottom: 14,
      boxShadow: open ? "0 8px 24px rgba(27,79,140,0.14)" : "0 2px 8px rgba(27,79,140,0.09)",
      transition: "all 0.2s",
    }}>
      {/* ── Show header ── */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "18px 22px", cursor: "pointer",
          position: "relative",
          borderBottom: open ? `1px solid rgba(201,168,76,0.12)` : "none",
        }}
      >
        {/* Subtle hero image background */}
        {heroImg && (
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${heroImg})`,
            backgroundSize: "cover", backgroundPosition: "center",
            opacity: 0.06, borderRadius: 14,
          }} />
        )}

        {/* Artist photo */}
        {show.artistPhoto ? (
          <img
            src={show.artistPhoto} alt=""
            style={{
              width: 56, height: 56, borderRadius: "50%",
              objectFit: "cover", border: `2px solid ${C.gold}`,
              flexShrink: 0, position: "relative", zIndex: 1,
            }}
          />
        ) : (
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: C.goldDim, border: `2px solid ${C.goldBorder}`,
            flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", zIndex: 1,
          }}>
            <span style={{ fontSize: 22, color: C.gold, opacity: 0.5 }}>♪</span>
          </div>
        )}

        {/* Show info */}
        <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
          <div style={{
            fontSize: 22, fontWeight: 700, color: C.text,
            fontFamily: "Georgia, serif", letterSpacing: "-0.01em",
            marginBottom: 5, lineHeight: 1.2,
          }}>
            {show.artistName}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {show.venue && (
              <span style={{ fontSize: 13, color: C.gold, fontWeight: 500 }}>{show.venue}</span>
            )}
            {show.city && (
              <span style={{ fontSize: 12, color: C.muted }}>
                · {show.city}{show.state ? `, ${show.state}` : ""}
              </span>
            )}
            {show.showtime && (
              <span style={{ fontSize: 11, color: C.muted }}>· {show.showtime}</span>
            )}
            {fillRate !== null && (
              <span style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 4,
                background: fillColor + "18", color: fillColor,
                border: `1px solid ${fillColor}44`, fontWeight: 600,
              }}>
                {fillRate}% sold
              </span>
            )}
            {show.ticketLink && (
              <a
                href={show.ticketLink} target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 10, color: C.gold, textDecoration: "none" }}
              >🎟 Tickets ↗</a>
            )}
          </div>
        </div>

        {/* Chevron */}
        <div style={{
          fontSize: 20, color: C.mutedMid, flexShrink: 0,
          position: "relative", zIndex: 1,
          transform: open ? "rotate(180deg)" : "none",
          transition: "transform 0.2s",
        }}>⌄</div>
      </div>

      {/* ── Post slots ── */}
      {open && (
        <div style={{ padding: "18px 22px" }}>
          <div style={{
            fontSize: 10, color: C.muted, textTransform: "uppercase",
            letterSpacing: "0.08em", fontWeight: 700, marginBottom: 12,
          }}>
            Proposed Posts
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <PostSlot weeksOut={16} date={show.post16w} show={show} copyFieldId={FLD.COPY_16W} initialCopy={show.copy16w} />
            <PostSlot weeksOut={7}  date={show.post7w}  show={show} copyFieldId={FLD.COPY_7W}  initialCopy={show.copy7w} />
            <PostSlot weeksOut={3}  date={show.post3w}  show={show} copyFieldId={FLD.COPY_3W}  initialCopy={show.copy3w} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SLOT COLORS (shared) ────────────────────────────────────────────────────

const SLOT_COLORS = { 16: "#154273", 7: "#5B8FCC", 3: "#C0392B" };

// ─── SLATE COLOR SCHEME (Post Dates screen) ──────────────────────────────────

const CS = {
  card:   "#FFFFFF",
  border: "#E8E8EA",
  accent: "#0071E3",
  text:   "#1D1D1F",
  muted:  "#6E6E73",
  mutedMid:"#AEAEB2",
};

// ─── CALENDAR VIEW — Screen 1: Show Dates (Arctic) ───────────────────────────

const DOW_HEADERS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function CalendarView({ shows }) {
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [activeDay, setActiveDay] = useState(null);

  const year        = calMonth.getFullYear();
  const month       = calMonth.getMonth();
  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today       = new Date();

  const showsByDay = useMemo(() => {
    const map = {};
    shows.forEach(s => {
      if (!s.startDate) return;
      if (s.startDate.getFullYear() !== year || s.startDate.getMonth() !== month) return;
      const d = s.startDate.getDate();
      (map[d] = map[d] || []).push(s);
    });
    return map;
  }, [shows, year, month]);

  const activeShows = activeDay ? (showsByDay[activeDay] || []) : [];

  function navMonth(delta) {
    setCalMonth(new Date(year, month + delta, 1));
    setActiveDay(null);
  }

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <button onClick={() => navMonth(-1)} style={{
          background: "transparent", border: "1px solid " + C.goldBorder,
          color: C.gold, borderRadius: 8, padding: "9px 20px",
          cursor: "pointer", fontSize: 20, lineHeight: 1,
        }}>‹</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: C.gold, fontFamily: "Georgia, serif",
                        fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>
            {calMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
            {Object.values(showsByDay).flat().length} show{Object.values(showsByDay).flat().length !== 1 ? "s" : ""} this month
          </div>
        </div>
        <button onClick={() => navMonth(1)} style={{
          background: "transparent", border: "1px solid " + C.goldBorder,
          color: C.gold, borderRadius: 8, padding: "9px 20px",
          cursor: "pointer", fontSize: 20, lineHeight: 1,
        }}>›</button>
      </div>

      {/* DOW headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
        {DOW_HEADERS.map(d => (
          <div key={d} style={{ textAlign: "center", color: C.muted, fontSize: 10,
                                fontWeight: 700, padding: "4px 0", letterSpacing: "0.07em" }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {Array.from({ length: firstDow }).map((_,i) => <div key={"e"+i} />)}
        {Array.from({ length: daysInMonth }).map((_,i) => {
          const day      = i + 1;
          const dayShows = showsByDay[day] || [];
          const isToday  = today.getDate()===day && today.getMonth()===month && today.getFullYear()===year;
          const isActive = activeDay === day;
          const hasShows = dayShows.length > 0;
          return (
            <div key={day}
              onClick={() => hasShows && setActiveDay(isActive ? null : day)}
              style={{
                minHeight: 80, padding: "9px 10px", borderRadius: 9,
                border: "1px solid " + (isActive ? C.gold : hasShows ? "rgba(21,66,115,0.35)" : "rgba(21,66,115,0.13)"),
                background: isActive ? "rgba(21,66,115,0.12)" : isToday ? "#DBEAFE" : C.navyCard,
                boxShadow: isActive
                  ? "0 6px 18px rgba(27,79,140,0.22)"
                  : "0 2px 6px rgba(27,79,140,0.1), 0 1px 3px rgba(27,79,140,0.07)",
                cursor: hasShows ? "pointer" : "default",
                transition: "all 0.18s",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 400,
                            color: isToday ? C.gold : C.text, marginBottom: 6 }}>{day}</div>
              {hasShows && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {dayShows.slice(0,2).map(s => (
                    <div key={s.id} style={{
                      fontSize: 9, color: C.gold, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      background: "rgba(21,66,115,0.1)", borderRadius: 3, padding: "2px 5px",
                    }}>{s.artistName}</div>
                  ))}
                  {dayShows.length > 2 && <div style={{ fontSize: 9, color: C.muted }}>+{dayShows.length-2} more</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Active day panel */}
      {activeDay && activeShows.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
                        marginBottom: 20, paddingBottom: 14, borderBottom: "1px solid " + C.goldBorder }}>
            <div>
              <div style={{ color: C.gold, fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700 }}>
                {new Date(year, month, activeDay).toLocaleDateString("en-US",
                  { weekday: "long", month: "long", day: "numeric" })}
              </div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                {activeShows.length} show{activeShows.length!==1?"s":""} — click a show to expand post slots
              </div>
            </div>
            <button onClick={() => setActiveDay(null)} style={{
              background: "transparent", border: "1px solid " + C.goldBorder,
              color: C.muted, borderRadius: 7, padding: "6px 14px", cursor: "pointer", fontSize: 12,
            }}>Close ✕</button>
          </div>
          {activeShows.map(show => <ShowRow key={show.id} show={show} />)}
        </div>
      )}
    </div>
  );
}

// ─── POST DATES VIEW — Screen 2 (Slate) ──────────────────────────────────────

function PostDatesView({ shows }) {
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [activeDay, setActiveDay] = useState(null);

  const year        = calMonth.getFullYear();
  const month       = calMonth.getMonth();
  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today       = new Date();

  const postsByDay = useMemo(() => {
    const map = {};
    shows.forEach(s => {
      [{ date: s.post16w, weeks: 16, label: "16w" },
       { date: s.post7w,  weeks: 7,  label: "7w"  },
       { date: s.post3w,  weeks: 3,  label: "3w"  }].forEach(({ date, weeks, label }) => {
        if (!date) return;
        if (date.getFullYear() !== year || date.getMonth() !== month) return;
        const d = date.getDate();
        if (!map[d]) map[d] = [];
        map[d].push({ show: s, weeks, label });
      });
    });
    return map;
  }, [shows, year, month]);

  const activePosts = activeDay ? (postsByDay[activeDay] || []) : [];
  const totalPosts  = Object.values(postsByDay).flat().length;

  function navMonth(delta) {
    setCalMonth(new Date(year, month + delta, 1));
    setActiveDay(null);
  }

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <button onClick={() => navMonth(-1)} style={{
          background: "transparent", border: "1px solid " + CS.border,
          color: CS.accent, borderRadius: 8, padding: "9px 20px",
          cursor: "pointer", fontSize: 20, lineHeight: 1,
        }}>‹</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: CS.accent, fontFamily: "Georgia, serif",
                        fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>
            {calMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </div>
          <div style={{ color: CS.muted, fontSize: 11, marginTop: 4 }}>
            {totalPosts} post{totalPosts !== 1 ? "s" : ""} this month
          </div>
        </div>
        <button onClick={() => navMonth(1)} style={{
          background: "transparent", border: "1px solid " + CS.border,
          color: CS.accent, borderRadius: 8, padding: "9px 20px",
          cursor: "pointer", fontSize: 20, lineHeight: 1,
        }}>›</button>
      </div>

      {/* DOW headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
        {DOW_HEADERS.map(d => (
          <div key={d} style={{ textAlign: "center", color: CS.muted, fontSize: 10,
                                fontWeight: 700, padding: "4px 0", letterSpacing: "0.07em" }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {Array.from({ length: firstDow }).map((_,i) => <div key={"ep"+i} />)}
        {Array.from({ length: daysInMonth }).map((_,i) => {
          const day      = i + 1;
          const dayPosts = postsByDay[day] || [];
          const isToday  = today.getDate()===day && today.getMonth()===month && today.getFullYear()===year;
          const isActive = activeDay === day;
          const hasItems = dayPosts.length > 0;
          return (
            <div key={day}
              onClick={() => hasItems && setActiveDay(isActive ? null : day)}
              style={{
                minHeight: 80, padding: "9px 10px", borderRadius: 9,
                border: "1px solid " + (isActive ? CS.accent : hasItems ? "rgba(0,113,227,0.3)" : "rgba(0,113,227,0.1)"),
                background: isActive ? "rgba(0,113,227,0.08)" : isToday ? "#EEF5FF" : CS.card,
                boxShadow: isActive
                  ? "0 6px 18px rgba(0,113,227,0.18)"
                  : "0 2px 6px rgba(0,113,227,0.08), 0 1px 3px rgba(0,113,227,0.05)",
                cursor: hasItems ? "pointer" : "default",
                transition: "all 0.18s",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 400,
                            color: isToday ? CS.accent : CS.text, marginBottom: 6 }}>{day}</div>
              {hasItems && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 2 }}>
                  {dayPosts.slice(0,4).map((p,idx) => (
                    <div key={idx} style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: SLOT_COLORS[p.weeks], flexShrink: 0,
                    }} />
                  ))}
                  {dayPosts.length > 4 && (
                    <span style={{ fontSize: 8, color: CS.muted, lineHeight: "8px" }}>+{dayPosts.length-4}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
        {[{w:16,l:"16w — Announce"},{w:7,l:"7w — Momentum"},{w:3,l:"3w — Push"}].map(({w,l}) => (
          <div key={w} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: SLOT_COLORS[w] }} />
            <span style={{ fontSize: 10, color: CS.muted }}>{l}</span>
          </div>
        ))}
      </div>

      {/* Active day panel */}
      {activeDay && activePosts.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
                        marginBottom: 20, paddingBottom: 14, borderBottom: "1px solid " + CS.border }}>
            <div>
              <div style={{ color: CS.accent, fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700 }}>
                {new Date(year, month, activeDay).toLocaleDateString("en-US",
                  { weekday: "long", month: "long", day: "numeric" })}
              </div>
              <div style={{ color: CS.muted, fontSize: 12, marginTop: 4 }}>
                {activePosts.length} post{activePosts.length!==1?"s":""} scheduled
              </div>
            </div>
            <button onClick={() => setActiveDay(null)} style={{
              background: "transparent", border: "1px solid " + CS.border,
              color: CS.muted, borderRadius: 7, padding: "6px 14px", cursor: "pointer", fontSize: 12,
            }}>Close ✕</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activePosts.map((p,idx) => (
              <div key={idx} style={{
                background: CS.card, border: "1px solid " + CS.border,
                borderLeft: "3px solid " + SLOT_COLORS[p.weeks],
                borderRadius: 10, padding: "12px 16px",
                boxShadow: "0 2px 6px rgba(0,113,227,0.08)",
                display: "flex", alignItems: "center", gap: 14,
              }}>
                {p.show.artistPhoto && (
                  <img src={p.show.artistPhoto} alt="" style={{
                    width: 40, height: 40, borderRadius: "50%", objectFit: "cover",
                    border: "2px solid " + SLOT_COLORS[p.weeks], flexShrink: 0,
                  }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: CS.text,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.show.artistName}
                  </div>
                  {p.show.venue && (
                    <div style={{ fontSize: 11, color: CS.muted, marginTop: 2 }}>
                      {p.show.venue}{p.show.city ? " · " + p.show.city : ""}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: SLOT_COLORS[p.weeks],
                                textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {p.label} out
                  </div>
                  <div style={{ fontSize: 10, color: CS.muted, marginTop: 3 }}>
                    Show: {fmtDate(p.show.startDate)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────

const inputStyle = {
  background: C.navyLight,
  border: "1px solid " + C.goldBorder,
  borderRadius: 7, padding: "6px 12px",
  color: C.text, fontSize: 12, outline: "none", width: 130,
};

export default function TADSocialDashboard() {
  const [shows,        setShows]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [screen,       setScreen]       = useState("shows");  // "shows" | "posts"
  const [searchArtist, setSearchArtist] = useState("");
  const [searchVenue,  setSearchVenue]  = useState("");
  const [searchCity,   setSearchCity]   = useState("");

  useEffect(() => {
    fetch("/api/posts")
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(data => {
        const arr = Array.isArray(data) ? data : (data.records || []);
        setShows(arr.map(processShow).sort((a,b) => {
          if (!a.startDate && !b.startDate) return 0;
          if (!a.startDate) return 1;
          if (!b.startDate) return -1;
          return a.startDate - b.startDate;
        }));
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    const qa = searchArtist.trim().toLowerCase();
    const qv = searchVenue.trim().toLowerCase();
    const qc = searchCity.trim().toLowerCase();
    if (!qa && !qv && !qc) return shows;
    return shows.filter(s =>
      (!qa || s.artistName.toLowerCase().includes(qa)) &&
      (!qv || s.venue.toLowerCase().includes(qv)) &&
      (!qc || s.city.toLowerCase().includes(qc))
    );
  }, [shows, searchArtist, searchVenue, searchCity]);

  const upcomingCount = shows.filter(s => s.startDate && s.startDate >= new Date()).length;
  const hasSearch = searchArtist || searchVenue || searchCity;

  // Toggle button style
  const toggleBtn = (active) => ({
    padding: "6px 18px", borderRadius: 7, border: "none",
    background: active ? C.gold : "transparent",
    color: active ? "#FFFFFF" : C.muted,
    fontWeight: active ? 700 : 400,
    fontSize: 12, cursor: "pointer",
    transition: "all 0.15s",
    letterSpacing: active ? "0.02em" : 0,
  });

  return (
    <div style={{ minHeight: "100vh", background: screen === "posts" ? "#F5F5F7" : C.navy,
                  color: C.text, fontFamily: "system-ui, -apple-system, sans-serif",
                  transition: "background 0.3s" }}>

      {/* Topbar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20, background: "#FFFFFF",
        borderBottom: "1px solid rgba(27,79,140,0.22)",
        boxShadow: "0 2px 8px rgba(27,79,140,0.12)",
        padding: "0 28px", display: "flex", alignItems: "center", gap: 16, height: 62,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexShrink: 0 }}>
          <span style={{ color: C.gold, fontFamily: "Georgia, serif",
                         fontWeight: 700, fontSize: 18, letterSpacing: "0.08em" }}>TAD</span>
          <span style={{ color: C.mutedMid, fontSize: 11,
                         letterSpacing: "0.12em", textTransform: "uppercase" }}>Social</span>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 14, marginLeft: 4, flexShrink: 0 }}>
          {[{v:shows.length,l:"total"},{v:upcomingCount,l:"upcoming"}].map(({v,l}) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ color: C.gold, fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{v}</div>
              <div style={{ color: C.muted, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" }}>{l}</div>
            </div>
          ))}
        </div>

        <div style={{ width: 1, height: 28, background: "rgba(27,79,140,0.15)", flexShrink: 0 }} />

        {/* Screen toggle */}
        <div style={{ display: "flex", background: "#F0F5FA", borderRadius: 9,
                      border: "1px solid rgba(27,79,140,0.18)", padding: 3, gap: 2, flexShrink: 0 }}>
          <button onClick={() => setScreen("shows")} style={toggleBtn(screen === "shows")}>
            Show Dates
          </button>
          <button onClick={() => setScreen("posts")} style={toggleBtn(screen === "posts")}>
            Post Dates
          </button>
        </div>

        <div style={{ width: 1, height: 28, background: "rgba(27,79,140,0.15)", flexShrink: 0 }} />

        {/* 3 search inputs */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
          <input type="text" placeholder="Artist…" value={searchArtist}
            onChange={e => setSearchArtist(e.target.value)} style={inputStyle} />
          <input type="text" placeholder="Venue…" value={searchVenue}
            onChange={e => setSearchVenue(e.target.value)} style={inputStyle} />
          <input type="text" placeholder="City…" value={searchCity}
            onChange={e => setSearchCity(e.target.value)} style={inputStyle} />
          {hasSearch && (
            <button onClick={() => { setSearchArtist(""); setSearchVenue(""); setSearchCity(""); }}
              style={{
                background: "transparent", border: "1px solid " + C.goldBorder,
                borderRadius: 7, padding: "6px 10px", color: C.muted,
                fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
              }}>Clear ✕</button>
          )}
        </div>
      </div>

      {/* Page content */}
      <div style={{ padding: "32px 28px", maxWidth: 1080, margin: "0 auto" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "90px 0", color: C.muted }}>
            <div style={{ fontSize: 30, marginBottom: 14, opacity: 0.35 }}>◉</div>
            <div style={{ fontSize: 13 }}>Loading shows from Airtable…</div>
          </div>
        )}
        {!loading && error && (
          <div style={{ textAlign: "center", padding: "90px 0", color: "#C0392B" }}>
            <div style={{ fontSize: 26, marginBottom: 10 }}>⚠</div>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Could not load shows: {error}</div>
            <div style={{ fontSize: 11, color: C.muted }}>
              Check AIRTABLE_API_KEY is set in Vercel for both Production and Preview.
            </div>
          </div>
        )}
        {!loading && !error && shows.length === 0 && (
          <div style={{ textAlign: "center", padding: "90px 0", color: C.muted }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>◉</div>
            <div style={{ fontSize: 14 }}>No shows found in TAD SOCIAL (Christian) view.</div>
          </div>
        )}
        {!loading && !error && shows.length > 0 && (
          screen === "shows"
            ? <CalendarView shows={filtered} />
            : <PostDatesView shows={filtered} />
        )}
      </div>
    </div>
  );
}
