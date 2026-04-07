import { useState, useEffect, useRef, useMemo } from "react";

const FIELD_IDS = {
  POST_COPY:    "fld7Z2psB9gGg51kh",
  STATUS:       "fldZXdXPuF2EkrmWY",
  PLATFORMS:    "fldJyU1eS53pRyMwX",
  ARTIST_PHOTO: "fldB5GD09PckzbfpS",
  KEY_ART:      "fldNqudSaYc5rAetC",
  VENUE_PHOTO:  "fldjCIFCybkLdJKhq",
  DUE:          "fld3nskHsRUiyrLI5",
};

const C = {
  navy: "#070F1E",
  navyCard: "#0D1929",
  navyLight: "#111F35",
  gold: "#C9A84C",
  goldDim: "rgba(201,168,76,0.18)",
  goldBorder: "rgba(201,168,76,0.22)",
  text: "#E4DBCA",
  muted: "#596880",
  mutedMid: "#8A9BB0",
};

const STATUS_META = {
  announce:     { label: "Announce",  color: "#C9A84C" },
  hype:         { label: "Hype",      color: "#9B7EDE" },
  dayof:        { label: "Day Of",    color: "#E8623A" },
  "day of":     { label: "Day Of",    color: "#E8623A" },
  "post ready": { label: "Post Ready",color: "#3DC96C" },
  "needs review":{ label: "Needs Review", color: "#F59E0B" },
  draft:        { label: "Draft",     color: "#596880" },
};

const PLATFORM_COLORS = {
  Instagram: "#E1306C", Facebook: "#1877F2",
  Twitter: "#1DA1F2", TikTok: "#00F2EA", X: "#E7E7E7",
};

// ─── helpers ───────────────────────────────────────────────────────────────

function getAttachment(fields, id) {
  const v = fields[id];
  return Array.isArray(v) && v.length ? v[0].url : null;
}

function findScheduledDate(fields) {
  for (const [k, v] of Object.entries(fields)) {
    if (!v) continue;
    if (/date|scheduled|post\s*#?\d|when/i.test(k)) {
      const d = new Date(v);
      if (!isNaN(d)) return d;
    }
  }
  for (const v of Object.values(fields)) {
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d)) return d;
    }
  }
  return null;
}

function getArtistName(fields) {
  for (const key of ["Artists","Artist","ARTIST","ARTISTS 2","Artist Name","Name"]) {
    const v = fields[key];
    if (!v) continue;
    if (Array.isArray(v)) return v[0]?.name || v[0]?.value || v[0] || "";
    return v;
  }
  return "Unknown Artist";
}

function processRecord(rec) {
  const f = rec.fields || {};

  // Date — read by field ID first, then fall back to name-based scan
  const scheduledDate = (() => {
    const v = f[FIELD_IDS.DUE] || f["Due Date"] || f["Scheduled Date"] || f["Post Date"] || f["due"];
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d) ? null : d;
  })();

  // Status — Airtable single-select comes as { name: "..." } or plain string
  const rawStatus = f[FIELD_IDS.STATUS] || f["Post Status"] || f["Status"] || "";
  const status = (typeof rawStatus === "object" ? (rawStatus?.name || "") : String(rawStatus)).toLowerCase().trim();

  // Platforms — Airtable multi-select comes as [{ name: "..." }] or ["..."]
  const rawPlatforms = f[FIELD_IDS.PLATFORMS] || f["Platforms"] || [];
  const platforms = Array.isArray(rawPlatforms)
    ? rawPlatforms.map(p => (typeof p === "object" ? p?.name : p)).filter(Boolean)
    : [];

  // Content
  const content = f[FIELD_IDS.POST_COPY] || f["POST CONTENT"] || f["Post Copy"] || f["Post Content"] || "";

  return {
    id: rec.id,
    scheduledDate,
    artistName: getArtistName(f),
    venue: f["Venue"] || f["venue"] || "",
    content,
    status,
    platforms,
    keyArt:      getAttachment(f, FIELD_IDS.KEY_ART),
    artistPhoto: getAttachment(f, FIELD_IDS.ARTIST_PHOTO),
    venuePhoto:  getAttachment(f, FIELD_IDS.VENUE_PHOTO),
  };
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// ─── micro components ───────────────────────────────────────────────────────

function StatusPill({ status }) {
  const m = STATUS_META[status] || { label: status || "—", color: C.muted };
  return (
    <span style={{
      background: m.color + "22", color: m.color, border: `1px solid ${m.color}44`,
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
      textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap",
    }}>{m.label}</span>
  );
}

function PlatformPills({ platforms }) {
  if (!platforms?.length) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
      {platforms.map(p => (
        <span key={p} style={{
          background: (PLATFORM_COLORS[p] || "#596880") + "22",
          color: PLATFORM_COLORS[p] || C.mutedMid,
          border: `1px solid ${(PLATFORM_COLORS[p] || "#596880")}44`,
          fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
        }}>{p}</span>
      ))}
    </div>
  );
}

// ─── PostCard ───────────────────────────────────────────────────────────────

function PostCard({ rec, onPoster, compact = false }) {
  const [hover, setHover] = useState(false);
  const bg = rec.keyArt || rec.venuePhoto;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: C.navyCard,
        border: `1px solid ${hover ? C.goldBorder : "rgba(201,168,76,0.1)"}`,
        borderRadius: 10, overflow: "hidden", transition: "border-color 0.15s",
        marginBottom: compact ? 8 : 0,
      }}
    >
      {!compact && bg && (
        <div style={{
          height: 72,
          background: `url(${bg}) center/cover no-repeat`,
          opacity: 0.45,
        }} />
      )}
      <div style={{ padding: compact ? "8px 12px" : "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {rec.artistPhoto && (
              <img src={rec.artistPhoto} alt=""
                style={{ width: compact ? 24 : 30, height: compact ? 24 : 30, borderRadius: "50%",
                         objectFit: "cover", border: `1.5px solid ${C.goldBorder}`, flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.text, fontWeight: 600, fontSize: compact ? 12 : 13,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {rec.artistName}
              </div>
              {rec.venue && (
                <div style={{ color: C.muted, fontSize: 10, overflow: "hidden",
                              textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rec.venue}</div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <StatusPill status={rec.status} />
            <button
              onClick={() => onPoster(rec)} title="Open poster"
              style={{
                background: "transparent", border: `1px solid ${C.goldBorder}`,
                color: C.gold, borderRadius: 5, padding: "2px 6px",
                cursor: "pointer", fontSize: 13, lineHeight: 1,
                transition: "background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.goldDim}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >◧</button>
          </div>
        </div>
        {rec.content && (
          <p style={{
            color: "#7A8FA8", fontSize: 11, margin: "5px 0 0",
            lineHeight: 1.55,
            display: "-webkit-box", WebkitLineClamp: compact ? 2 : 3,
            WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{rec.content}</p>
        )}
        <PlatformPills platforms={rec.platforms} />
      </div>
    </div>
  );
}

// ─── PosterModal ────────────────────────────────────────────────────────────

function PosterModal({ rec, onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!rec || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const W = 1080, H = 1080;
    canvas.width = W; canvas.height = H;

    async function loadImg(url) {
      return new Promise((res, rej) => {
        const img = new Image(); img.crossOrigin = "anonymous";
        img.onload = () => res(img); img.onerror = rej; img.src = url;
      });
    }

    async function draw() {
      ctx.fillStyle = "#070F1E"; ctx.fillRect(0, 0, W, H);

      const bgUrl = rec.keyArt || rec.venuePhoto;
      if (bgUrl) {
        try {
          const img = await loadImg(bgUrl);
          ctx.globalAlpha = 0.3; ctx.drawImage(img, 0, 0, W, H); ctx.globalAlpha = 1;
        } catch {}
      }

      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "rgba(7,15,30,0.5)");
      grad.addColorStop(0.55, "rgba(7,15,30,0.82)");
      grad.addColorStop(1, "rgba(7,15,30,1)");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

      // Gold border
      ctx.strokeStyle = "#C9A84C"; ctx.lineWidth = 5;
      ctx.strokeRect(28, 28, W - 56, H - 56);
      ctx.strokeStyle = "rgba(201,168,76,0.25)"; ctx.lineWidth = 1;
      ctx.strokeRect(38, 38, W - 76, H - 76);

      // Header
      ctx.fillStyle = "#C9A84C";
      ctx.font = "700 28px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("TAD ENTERTAINMENT", W / 2, 88);
      ctx.strokeStyle = "rgba(201,168,76,0.3)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(100, 108); ctx.lineTo(W - 100, 108); ctx.stroke();

      // Artist circle photo
      if (rec.artistPhoto) {
        try {
          const img = await loadImg(rec.artistPhoto);
          ctx.save();
          ctx.beginPath(); ctx.arc(W / 2, 370, 175, 0, Math.PI * 2); ctx.clip();
          ctx.drawImage(img, W / 2 - 175, 195, 350, 350);
          ctx.restore();
          ctx.beginPath(); ctx.arc(W / 2, 370, 177, 0, Math.PI * 2);
          ctx.strokeStyle = "#C9A84C"; ctx.lineWidth = 4; ctx.stroke();
        } catch {}
      }

      // Artist name
      ctx.fillStyle = "#EDE3D0";
      ctx.font = `700 ${rec.artistName.length > 20 ? 56 : 72}px Georgia, serif`;
      ctx.textAlign = "center";
      ctx.fillText(rec.artistName, W / 2, 630);

      // Divider
      ctx.strokeStyle = "rgba(201,168,76,0.4)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(200, 650); ctx.lineTo(W - 200, 650); ctx.stroke();

      // Venue
      if (rec.venue) {
        ctx.fillStyle = "#C9A84C"; ctx.font = "400 30px Georgia, serif";
        ctx.fillText(rec.venue, W / 2, 700);
      }

      // Date
      if (rec.scheduledDate) {
        ctx.fillStyle = "#8A9BB0"; ctx.font = "300 22px system-ui, sans-serif";
        ctx.fillText(
          rec.scheduledDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
          W / 2, 742
        );
      }

      // Status badge
      const sm = STATUS_META[rec.status] || { label: rec.status || "", color: "#C9A84C" };
      ctx.fillStyle = sm.color + "33";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(W / 2 - 90, 778, 180, 42, 7);
      else ctx.rect(W / 2 - 90, 778, 180, 42);
      ctx.fill();
      ctx.fillStyle = sm.color; ctx.font = "700 16px system-ui, sans-serif";
      ctx.fillText(sm.label.toUpperCase(), W / 2, 805);

      // Platforms
      if (rec.platforms?.length) {
        ctx.fillStyle = "#596880"; ctx.font = "400 20px system-ui, sans-serif";
        ctx.fillText(rec.platforms.join("  ·  "), W / 2, 870);
      }

      // Footer
      ctx.fillStyle = "rgba(201,168,76,0.5)"; ctx.font = "300 18px Georgia, serif";
      ctx.fillText("tadentertainment.com", W / 2, 1020);
    }

    draw();
  }, [rec]);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.download = `${(rec.artistName || "poster").replace(/\s+/g, "-")}-social.png`;
    a.href = canvasRef.current.toDataURL("image/png");
    a.click();
  };

  if (!rec) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: C.navyCard, border: `1px solid ${C.goldBorder}`,
        borderRadius: 14, padding: 24, width: "100%", maxWidth: 560,
        maxHeight: "92vh", overflow: "auto",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ color: C.gold, fontWeight: 700, fontSize: 14 }}>{rec.artistName}</div>
            <div style={{ color: C.muted, fontSize: 11 }}>1080 × 1080 — ready to download</div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: `1px solid ${C.goldBorder}`,
            color: C.muted, cursor: "pointer", borderRadius: 6, padding: "4px 10px", fontSize: 14,
          }}>✕</button>
        </div>
        <canvas ref={canvasRef} style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.goldBorder}`, display: "block" }} />
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button onClick={handleDownload} style={{
            flex: 1, background: C.gold, color: "#070F1E", border: "none",
            borderRadius: 8, padding: "11px 0", cursor: "pointer",
            fontWeight: 700, fontSize: 14, letterSpacing: "0.03em",
          }}>↓ Download PNG</button>
          <button
            onClick={() => { navigator.clipboard?.writeText(rec.content || ""); }}
            style={{
              background: "transparent", color: C.gold, border: `1px solid ${C.goldBorder}`,
              borderRadius: 8, padding: "11px 18px", cursor: "pointer", fontSize: 14,
            }}
            title="Copy caption"
          >Copy Caption</button>
        </div>
      </div>
    </div>
  );
}

// ─── TIMELINE VIEW ──────────────────────────────────────────────────────────

function TimelineView({ byDate, onPoster }) {
  if (!byDate.length) return <Empty />;
  return (
    <div>
      {byDate.map(([key, group]) => (
        <div key={key} style={{ marginBottom: 36 }}>
          <div style={{
            position: "sticky", top: 60, zIndex: 10,
            background: C.navy, paddingBottom: 10, paddingTop: 4,
            borderBottom: `1px solid ${C.goldBorder}`, marginBottom: 14,
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              {group.date ? (
                <>
                  <span style={{ color: C.gold, fontFamily: "Georgia, serif", fontSize: 21, fontWeight: 700 }}>
                    {group.date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                  </span>
                  <span style={{ color: C.muted, fontSize: 12 }}>
                    {group.date.toLocaleDateString("en-US", { weekday: "long", year: "numeric" })}
                  </span>
                </>
              ) : (
                <span style={{ color: C.muted, fontSize: 16 }}>Unscheduled</span>
              )}
              <span style={{
                marginLeft: "auto", background: C.goldDim, color: C.gold,
                fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 4,
              }}>{group.records.length} post{group.records.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 12 }}>
            {group.records.map(r => <PostCard key={r.id} rec={r} onPoster={onPoster} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── CALENDAR VIEW ──────────────────────────────────────────────────────────

function CalendarView({ records, onPoster }) {
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [activeDay, setActiveDay] = useState(null);

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const postsByDay = useMemo(() => {
    const map = {};
    records.forEach(r => {
      if (!r.scheduledDate) return;
      if (r.scheduledDate.getFullYear() !== year || r.scheduledDate.getMonth() !== month) return;
      const d = r.scheduledDate.getDate();
      (map[d] = map[d] || []).push(r);
    });
    return map;
  }, [records, year, month]);

  const activePosts = activeDay ? (postsByDay[activeDay] || []) : [];
  const DOWH = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button onClick={() => { setCalMonth(new Date(year, month - 1, 1)); setActiveDay(null); }}
          style={{ background: "transparent", border: `1px solid ${C.goldBorder}`, color: C.gold,
                   borderRadius: 7, padding: "7px 16px", cursor: "pointer", fontSize: 17 }}>‹</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: C.gold, fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700 }}>
            {calMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
            {Object.values(postsByDay).flat().length} posts this month
          </div>
        </div>
        <button onClick={() => { setCalMonth(new Date(year, month + 1, 1)); setActiveDay(null); }}
          style={{ background: "transparent", border: `1px solid ${C.goldBorder}`, color: C.gold,
                   borderRadius: 7, padding: "7px 16px", cursor: "pointer", fontSize: 17 }}>›</button>
      </div>

      {/* Day of week header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 4 }}>
        {DOWH.map(d => (
          <div key={d} style={{ textAlign: "center", color: C.muted, fontSize: 10,
                                fontWeight: 700, padding: "3px 0", letterSpacing: "0.06em" }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const posts = postsByDay[day] || [];
          const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
          const isActive = activeDay === day;
          const hasPosts = posts.length > 0;
          return (
            <div key={day}
              onClick={() => hasPosts && setActiveDay(isActive ? null : day)}
              style={{
                minHeight: 68, padding: "7px 8px",
                borderRadius: 7,
                border: `1px solid ${isActive ? C.gold : hasPosts ? "rgba(201,168,76,0.2)" : "rgba(201,168,76,0.07)"}`,
                background: isActive ? "rgba(201,168,76,0.1)" : isToday ? "#0D1F38" : C.navyCard,
                cursor: hasPosts ? "pointer" : "default",
                transition: "border-color 0.15s, background 0.15s",
              }}>
              <div style={{
                fontSize: 12, fontWeight: isToday ? 700 : 400,
                color: isToday ? C.gold : C.text, marginBottom: 5,
              }}>{day}</div>
              {hasPosts && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {posts.slice(0, 4).map(p => {
                    const m = STATUS_META[p.status] || { color: C.gold };
                    return <div key={p.id} style={{ width: 7, height: 7, borderRadius: "50%", background: m.color }} />;
                  })}
                  {posts.length > 4 && (
                    <span style={{ fontSize: 9, color: C.muted, lineHeight: "7px" }}>+{posts.length - 4}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Day detail panel */}
      {activeDay && activePosts.length > 0 && (
        <div style={{ marginTop: 24, padding: "16px 18px", background: C.navyLight,
                      borderRadius: 12, border: `1px solid ${C.goldBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ color: C.gold, fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700 }}>
              {new Date(year, month, activeDay).toLocaleDateString("en-US",
                { weekday: "long", month: "long", day: "numeric" })}
            </span>
            <span style={{ color: C.muted, fontSize: 11 }}>{activePosts.length} post{activePosts.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 8 }}>
            {activePosts.map(r => <PostCard key={r.id} rec={r} onPoster={onPoster} compact />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GRID VIEW ──────────────────────────────────────────────────────────────

function GridView({ records, onPoster }) {
  const groups = useMemo(() => {
    const seen = {};
    records.forEach(r => { seen[r.status || "unknown"] = true; });
    const statuses = Object.keys(seen);
    const map = {};
    statuses.forEach(s => { map[s] = []; });
    records.forEach(r => { map[r.status || "unknown"].push(r); });
    return statuses.map(s => ({ status: s, records: map[s] }));
  }, [records]);

  if (!groups.length) return <Empty />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 24 }}>
      {groups.map(({ status, records: recs }) => {
        const m = STATUS_META[status] || { label: status || "Unknown", color: C.muted };
        return (
          <div key={status}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
              paddingBottom: 10, borderBottom: `1px solid ${m.color}33`,
            }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
              <span style={{ color: m.color, fontWeight: 700, fontSize: 12,
                             textTransform: "uppercase", letterSpacing: "0.07em" }}>{m.label}</span>
              <span style={{ color: C.muted, fontSize: 11, marginLeft: "auto" }}>{recs.length}</span>
            </div>
            <div>
              {recs.map(r => <PostCard key={r.id} rec={r} onPoster={onPoster} compact />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function Empty() {
  return (
    <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>
      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>◉</div>
      <div style={{ fontSize: 14 }}>No posts to display</div>
    </div>
  );
}

// ─── ROOT ────────────────────────────────────────────────────────────────────

export default function TADSocialDashboard() {
  const [records, setRecords]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [view, setView]             = useState("timeline");
  const [posterRecord, setPosterRecord] = useState(null);
  const [search, setSearch]         = useState("");

  useEffect(() => {
    fetch("/api/posts")
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        const arr = Array.isArray(data) ? data : (data.posts || data.records || []);
        const processed = arr.map(processRecord).sort((a, b) => {
          if (!a.scheduledDate && !b.scheduledDate) return 0;
          if (!a.scheduledDate) return 1;
          if (!b.scheduledDate) return -1;
          return a.scheduledDate - b.scheduledDate;
        });
        setRecords(processed);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(r =>
      r.artistName.toLowerCase().includes(q) ||
      r.venue.toLowerCase().includes(q) ||
      r.content.toLowerCase().includes(q) ||
      r.status.includes(q)
    );
  }, [records, search]);

  const byDate = useMemo(() => {
    const map = {};
    filtered.forEach(r => {
      const key = r.scheduledDate ? dateKey(r.scheduledDate) : "_undated";
      if (!map[key]) map[key] = { date: r.scheduledDate, records: [] };
      map[key].records.push(r);
    });
    return Object.entries(map).sort(([a], [b]) => {
      if (a === "_undated") return 1;
      if (b === "_undated") return -1;
      return a.localeCompare(b);
    });
  }, [filtered]);

  const VIEWS = [
    { id: "timeline", label: "Timeline" },
    { id: "calendar", label: "Calendar" },
    { id: "grid",     label: "Grid" },
  ];

  const totalDates = byDate.filter(([k]) => k !== "_undated").length;

  return (
    <div style={{ minHeight: "100vh", background: C.navy, color: C.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Topbar ─────────────────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: C.navy, borderBottom: `1px solid ${C.goldBorder}`,
        padding: "0 24px",
        display: "flex", alignItems: "center", gap: 16, height: 60,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexShrink: 0 }}>
          <span style={{ color: C.gold, fontFamily: "Georgia, serif", fontWeight: 700,
                         fontSize: 17, letterSpacing: "0.08em" }}>TAD</span>
          <span style={{ color: C.mutedMid, fontSize: 11, letterSpacing: "0.12em",
                         textTransform: "uppercase" }}>Social</span>
        </div>

        {/* Stats strip */}
        <div style={{ display: "flex", gap: 14, marginLeft: 4 }}>
          {[
            { v: records.length, l: "posts" },
            { v: totalDates, l: "dates" },
          ].map(({ v, l }) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ color: C.gold, fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{v}</div>
              <div style={{ color: C.muted, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search artist, venue, copy…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, background: C.navyLight, border: `1px solid ${C.goldBorder}`,
            borderRadius: 7, padding: "7px 12px", color: C.text, fontSize: 12,
            outline: "none", maxWidth: 320,
          }}
        />

        {/* View toggle */}
        <div style={{
          display: "flex", background: C.navyCard, borderRadius: 8,
          border: `1px solid ${C.goldBorder}`, padding: 3, gap: 2, marginLeft: "auto",
        }}>
          {VIEWS.map(v => (
            <button key={v.id} onClick={() => setView(v.id)} style={{
              padding: "5px 15px", borderRadius: 6, border: "none",
              background: view === v.id ? C.gold : "transparent",
              color: view === v.id ? C.navy : C.mutedMid,
              fontWeight: view === v.id ? 700 : 400,
              cursor: "pointer", fontSize: 12,
              transition: "background 0.15s, color 0.15s",
            }}>{v.label}</button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      <div style={{ padding: "28px 24px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "80px 0", color: C.muted }}>
            <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.4, animation: "spin 2s linear infinite" }}>◉</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ fontSize: 13 }}>Loading posts from Airtable…</div>
          </div>
        )}
        {!loading && error && (
          <div style={{
            textAlign: "center", padding: "80px 0",
            color: "#E8623A",
          }}>
            <div style={{ fontSize: 24, marginBottom: 10 }}>⚠</div>
            <div style={{ fontSize: 14 }}>Could not fetch posts: {error}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
              Check that /api/posts is deployed and your Airtable PAT is set.
            </div>
          </div>
        )}
        {!loading && !error && (
          <>
            {view === "timeline" && <TimelineView byDate={byDate} onPoster={setPosterRecord} />}
            {view === "calendar" && <CalendarView records={filtered} onPoster={setPosterRecord} />}
            {view === "grid"     && <GridView records={filtered} onPoster={setPosterRecord} />}
          </>
        )}
      </div>

      {posterRecord && <PosterModal rec={posterRecord} onClose={() => setPosterRecord(null)} />}
    </div>
  );
}
