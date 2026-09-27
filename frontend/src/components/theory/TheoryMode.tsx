import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  BookOpen,
  ChevronRight,
  Loader2,
  AlertCircle,
  X,
  Clock,
  Globe,
  List,
  FileText,
} from "lucide-react";
import { AgentChatBox } from "../dashboard/AgentChatBox";

/* ─── API helpers ───────────────────────────────────────────────────────── */

const API_BASE_REST = "https://en.wikipedia.org/api/rest_v1";
const API_BASE_QUERY = "https://en.wikipedia.org/w/api.php";

export interface TheorySection {
  id: string;
  title: string;
  content: string;
  level: number;
}

export interface TheoryImage {
  src: string;
  caption: string;
  alt: string;
  credit?: string;
}

export interface TheoryArticle {
  title: string;
  description: string;
  extract: string;
  sections: TheorySection[];
  images: TheoryImage[];
  lastModified: string;
  thumbnail?: string;
}

export interface TheorySearchResult {
  title: string;
  description: string;
}

const articleCache = new Map<string, TheoryArticle>();
const searchCache = new Map<string, TheorySearchResult[]>();

/**
 * Cleans HTML into formatted, readable text with paragraph breaks and bullet points.
 */
function cleanContentHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<sup class="reference"[\s\S]*?<\/sup>/gi, "")
    .replace(/<span class="mw-editsection"[\s\S]*?<\/span>/gi, "")
    .replace(/<table[\s\S]*?<\/table>/gi, "")
    .replace(/<div class="hatnote"[\s\S]*?<\/div>/gi, "")
    .replace(/<div class="reflist"[\s\S]*?<\/div>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/li>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/\[\d+\]/g, "")
    .replace(/\[citation needed\]/gi, "")
    .replace(/\[edit\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Filter out metadata / non-content sections
 */
function isContentSectionTitle(title: string): boolean {
  const t = title.toLowerCase().trim();
  const excluded = [
    "see also",
    "references",
    "external links",
    "further reading",
    "notes",
    "explanatory notes",
    "sources",
    "citations",
    "bibliography",
    "gallery",
  ];
  return !excluded.some((ex) => t === ex || t.startsWith(ex));
}

async function fetchTheoryArticle(topic: string): Promise<TheoryArticle | null> {
  const key = topic.toLowerCase().trim();
  if (articleCache.has(key)) return articleCache.get(key)!;

  try {
    // 1) Summary API
    const summaryRes = await fetch(
      `${API_BASE_REST}/page/summary/${encodeURIComponent(topic)}`,
      { headers: { Accept: "application/json" } }
    );
    if (!summaryRes.ok) return null;
    const summary = await summaryRes.json();

    // 2) Fetch full section breakdown from mobile-sections API
    let sections: TheorySection[] = [];
    try {
      const mobileRes = await fetch(
        `${API_BASE_REST}/page/mobile-sections/${encodeURIComponent(summary.title)}`,
        { headers: { Accept: "application/json" } }
      );
      if (mobileRes.ok) {
        const mobile = await mobileRes.json();

        // Lead section paragraphs (if available)
        const leadSections: any[] = mobile?.lead?.sections ?? [];
        const leadText = leadSections
          .map((s) => cleanContentHtml(s.text ?? ""))
          .filter(Boolean)
          .join("\n\n");

        // Remaining sections
        const remaining: any[] = mobile?.remaining?.sections ?? [];
        sections = remaining
          .filter((s: any) => isContentSectionTitle(s.line ?? s.anchor ?? ""))
          .map((s: any, idx: number) => {
            const rawTitle = s.line ?? s.anchor ?? `Section ${idx + 1}`;
            const cleanTitle = rawTitle.replace(/<[^>]*>/g, "").trim();
            const textContent = cleanContentHtml(s.text ?? "");
            return {
              id: `sec-${idx + 1}`,
              title: cleanTitle,
              content: textContent,
              level: s.toclevel ?? 2,
            };
          })
          .filter((s) => s.title && s.content.length > 25);

        // Append extra lead content to summary extract if available
        if (leadText && leadText.length > summary.extract?.length) {
          summary.extract = leadText;
        }
      }
    } catch {
      /* fallback silently to summary extract */
    }

    // 3) Fetch relevant images
    let images: TheoryImage[] = [];
    try {
      const imgRes = await fetch(
        `${API_BASE_QUERY}?action=query&titles=${encodeURIComponent(summary.title)}&prop=images&imlimit=12&format=json&origin=*`
      );
      const imgData = await imgRes.json();
      const pages = Object.values(imgData?.query?.pages ?? {}) as any[];
      const rawImgs: string[] = pages[0]?.images?.map((i: any) => i.title) ?? [];

      const imgFiles = rawImgs
        .filter(
          (t) =>
            /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(t) &&
            !t.toLowerCase().includes("icon") &&
            !t.toLowerCase().includes("logo") &&
            !t.toLowerCase().includes("flag") &&
            !t.toLowerCase().includes("commons")
        )
        .slice(0, 6);

      images = await Promise.all(
        imgFiles.map(async (file): Promise<TheoryImage | null> => {
          try {
            const infoRes = await fetch(
              `${API_BASE_QUERY}?action=query&titles=${encodeURIComponent(file)}&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*`
            );
            const info = await infoRes.json();
            const pg = Object.values(info?.query?.pages ?? {})[0] as any;
            const ii = pg?.imageinfo?.[0];
            if (!ii?.url) return null;

            const rawCap = ii.extmetadata?.ImageDescription?.value
              ? cleanContentHtml(ii.extmetadata.ImageDescription.value)
              : file.replace("File:", "").replace(/\.\w+$/, "");

            return {
              src: ii.url,
              alt: file.replace("File:", "").replace(/\.\w+$/, ""),
              caption: rawCap.slice(0, 140),
              credit: "Educational Archive",
            };
          } catch {
            return null;
          }
        })
      ).then((arr) => arr.filter(Boolean) as TheoryImage[]);
    } catch {
      /* silent */
    }

    const article: TheoryArticle = {
      title: summary.title,
      description: summary.description ?? "",
      extract: summary.extract ?? "",
      sections,
      images,
      lastModified: summary.timestamp ?? "",
      thumbnail: summary.thumbnail?.source,
    };

    articleCache.set(key, article);
    return article;
  } catch (err) {
    console.error("Theory fetch error:", err);
    return null;
  }
}

async function searchTheory(query: string): Promise<TheorySearchResult[]> {
  const key = query.toLowerCase().trim();
  if (searchCache.has(key)) return searchCache.get(key)!;

  try {
    const res = await fetch(
      `${API_BASE_QUERY}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8&format=json&origin=*`
    );
    const data = await res.json();
    const raw: any[] = data?.query?.search ?? [];

    const results: TheorySearchResult[] = raw.map((r) => ({
      title: r.title,
      description: cleanContentHtml(r.snippet ?? "").slice(0, 130) + "…",
    }));

    searchCache.set(key, results);
    return results;
  } catch {
    return [];
  }
}

/* ─── Topic presets ─────────────────────────────────────────────────────── */

const TOPIC_PRESETS = [
  { emoji: "🌍", label: "Earthquake" },
  { emoji: "🌋", label: "Volcano" },
  { emoji: "🌊", label: "Tsunami" },
  { emoji: "🔥", label: "Wildfire" },
  { emoji: "🌀", label: "Hurricane" },
  { emoji: "💧", label: "Flood" },
  { emoji: "⛰️", label: "Landslide" },
  { emoji: "☀️", label: "Drought" },
  { emoji: "🌪️", label: "Tornado" },
  { emoji: "❄️", label: "Blizzard" },
];

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function ImageCard({ img }: { img: TheoryImage }) {
  const [error, setError] = useState(false);
  if (error) return null;
  return (
    <figure className="theory-image-card">
      <img
        src={img.src}
        alt={img.alt}
        onError={() => setError(true)}
        className="theory-image"
        loading="lazy"
      />
      {img.caption && (
        <figcaption className="theory-image-caption">
          {img.caption}
          {img.credit && <span className="theory-image-credit"> · {img.credit}</span>}
        </figcaption>
      )}
    </figure>
  );
}

function SectionBlock({
  section,
  index,
}: {
  section: TheorySection;
  index: number;
}) {
  // Expanded by default for a rich, continuous reading experience
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="theory-section" id={section.id}>
      <button
        className="theory-section-header"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <span className="theory-section-num">{String(index + 1).padStart(2, "0")}</span>
          <span className="theory-section-title">{section.title}</span>
        </div>
        <ChevronRight
          className="theory-section-chevron"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)" }}
        />
      </button>
      {expanded && (
        <div className="theory-section-body">
          {section.content
            .split("\n\n")
            .filter(Boolean)
            .map((para, i) => (
              <p key={i} className="theory-paragraph">
                {para}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main TheoryMode Component ─────────────────────────────────────────── */

export function TheoryMode() {
  const [query, setQuery] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [article, setArticle] = useState<TheoryArticle | null>(null);
  const [searchResults, setSearchResults] = useState<TheorySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"home" | "results" | "article">("home");
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (topic: string) => {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setArticle(null);
    setSearchResults([]);
    setPhase("results");

    // Try direct article first
    const art = await fetchTheoryArticle(topic);
    if (art) {
      setArticle(art);
      setPhase("article");
      setLoading(false);
      return;
    }

    // Fall back to search
    const results = await searchTheory(topic);
    if (results.length > 0) {
      setSearchResults(results);
      setPhase("results");
    } else {
      setError(`No details found for "${topic}". Try a different search term.`);
    }
    setLoading(false);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) {
      setQuery(inputVal.trim());
      doSearch(inputVal.trim());
    }
  };

  const openResult = async (title: string) => {
    setInputVal(title);
    setQuery(title);
    doSearch(title);
  };

  const clearSearch = () => {
    setInputVal("");
    setQuery("");
    setArticle(null);
    setSearchResults([]);
    setPhase("home");
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const scrollToSection = (secId: string) => {
    const el = document.getElementById(secId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Scroll to top on article load
  useEffect(() => {
    if (phase === "article") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [phase, article]);

  const lastModDate = article?.lastModified
    ? new Date(article.lastModified).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  // Estimate total word count & reading time for detailed article
  const totalWordCount = article
    ? article.extract.split(/\s+/).length +
      article.sections.reduce((acc, s) => acc + s.content.split(/\s+/).length, 0)
    : 0;
  const estimatedReadTime = Math.max(2, Math.ceil(totalWordCount / 200));

  return (
    <div className="theory-root">
      {/* ── Header search bar ── */}
      <header className="theory-header">
        <div className="theory-header-inner">
          <div className="theory-brand">
            <BookOpen className="theory-brand-icon" />
            <div>
              <div className="theory-brand-title">Theory Mode</div>
              <div className="theory-brand-sub">Natural Disaster Knowledge Base</div>
            </div>
          </div>

          <form className="theory-search-form" onSubmit={handleSubmit} role="search">
            <div className="theory-search-box">
              <Search className="theory-search-icon" />
              <input
                ref={inputRef}
                type="search"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Search: Earthquake, Volcano, Tsunami…"
                className="theory-search-input"
                aria-label="Search disaster topics"
                autoFocus
              />
              {inputVal && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="theory-search-clear"
                  aria-label="Clear"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="submit"
                className="theory-search-btn"
                disabled={!inputVal.trim() || loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
              </button>
            </div>
          </form>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="theory-main">
        {/* HOME — topic grid */}
        {phase === "home" && (
          <div className="theory-home">
            <div className="theory-home-hero">
              <h1 className="theory-home-title">Understand Natural Disasters</h1>
              <p className="theory-home-sub">
                Explore comprehensive theoretical knowledge on natural hazards, causes,
                impacts, and preparedness.
              </p>
            </div>
            <div className="theory-preset-grid">
              {TOPIC_PRESETS.map((t) => (
                <button
                  key={t.label}
                  className="theory-preset-card"
                  onClick={() => {
                    setInputVal(t.label);
                    doSearch(t.label);
                  }}
                >
                  <span className="theory-preset-emoji">{t.emoji}</span>
                  <span className="theory-preset-label">{t.label}</span>
                </button>
              ))}
            </div>
            <p className="theory-attribution-note">
              <Globe className="inline h-3.5 w-3.5 mr-1 opacity-50" />
              Interactive Theoretical & Educational Knowledge Base
            </p>
          </div>
        )}

        {/* LOADING STATE */}
        {loading && (
          <div className="theory-loading">
            <Loader2 className="theory-loading-icon animate-spin" />
            <p className="font-mono text-sm tracking-wide text-cyan-400">Detailing...</p>
          </div>
        )}

        {/* ERROR STATE */}
        {!loading && error && (
          <div className="theory-error">
            <AlertCircle className="h-6 w-6 text-rose-400 mb-2" />
            <p>{error}</p>
            <button className="theory-btn-outline mt-4" onClick={clearSearch}>
              Go back
            </button>
          </div>
        )}

        {/* SEARCH RESULTS */}
        {!loading && !error && phase === "results" && searchResults.length > 0 && (
          <div className="theory-results">
            <h2 className="theory-results-title">Search results for "{query}"</h2>
            <div className="theory-results-list">
              {searchResults.map((r) => (
                <button
                  key={r.title}
                  className="theory-result-card"
                  onClick={() => openResult(r.title)}
                >
                  <div className="theory-result-title">{r.title}</div>
                  <div className="theory-result-desc">{r.description}</div>
                  <span className="theory-result-link">
                    View detail module <ChevronRight className="inline h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* FULL LENGTHY ARTICLE VIEW */}
        {!loading && !error && phase === "article" && article && (
          <article className="theory-article">
            {/* Title & Metadata Hero */}
            <div className="theory-article-hero">
              {article.thumbnail && (
                <div className="theory-article-thumbnail-wrap">
                  <img
                    src={article.thumbnail}
                    alt={article.title}
                    className="theory-article-thumbnail"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                </div>
              )}
              <div className="theory-article-title-block">
                <h1 className="theory-article-title">{article.title}</h1>
                {article.description && (
                  <p className="theory-article-desc">{article.description}</p>
                )}
                <div className="theory-article-meta">
                  <span className="theory-meta-pill">
                    <FileText className="h-3 w-3 text-cyan-400" />{" "}
                    {article.sections.length + 1} Detailed Sections
                  </span>
                  <span className="theory-meta-pill">
                    <Clock className="h-3 w-3 text-cyan-400" /> ~{estimatedReadTime} min
                    read
                  </span>
                  {lastModDate && (
                    <span className="theory-meta-pill">Updated {lastModDate}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Overview / Introduction */}
            {article.extract && (
              <div className="theory-extract">
                <h2 className="theory-section-heading">Overview & Introduction</h2>
                {article.extract
                  .split("\n\n")
                  .filter(Boolean)
                  .map((para, i) => (
                    <p key={i} className="theory-paragraph">
                      {para}
                    </p>
                  ))}
              </div>
            )}

            {/* Table of Contents Quick Navigation */}
            {article.sections.length > 0 && (
              <div className="theory-toc-container">
                <div className="theory-toc-header">
                  <List className="h-4 w-4" /> Table of Contents ({article.sections.length}{" "}
                  Sections)
                </div>
                <div className="theory-toc-grid">
                  {article.sections.map((sec, idx) => (
                    <button
                      key={sec.id}
                      className="theory-toc-item"
                      onClick={() => scrollToSection(sec.id)}
                    >
                      <span className="theory-toc-num">{String(idx + 1).padStart(2, "0")}</span>
                      <span className="theory-toc-title">{sec.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Image Gallery */}
            {article.images.length > 0 && (
              <div className="theory-images-section">
                <h2 className="theory-section-heading">Visual Evidence & Diagrams</h2>
                <div className="theory-images-grid">
                  {article.images.map((img, i) => (
                    <ImageCard key={i} img={img} />
                  ))}
                </div>
              </div>
            )}

            {/* Exhaustive Section Breakdown */}
            {article.sections.length > 0 && (
              <div className="theory-sections-block">
                <h2 className="theory-section-heading">Comprehensive Theoretical Modules</h2>
                {article.sections.map((sec, i) => (
                  <SectionBlock key={sec.id || i} section={sec} index={i} />
                ))}
              </div>
            )}

            {/* Topic Completion Footer */}
            <div className="theory-source-block">
              <BookOpen className="h-4 w-4 opacity-50 shrink-0 text-cyan-400 mt-0.5" />
              <div>
                <div className="theory-source-title">Module Summary</div>
                <div className="theory-source-body">
                  You have reviewed the complete detailed theoretical material for{" "}
                  <strong className="text-slate-200">{article.title}</strong>. Use the search
                  bar above or the preset topics to study other natural disaster topics.
                </div>
              </div>
            </div>
          </article>
        )}
      </main>

      {/* ── AI Chat Bot in Theory Mode ── */}
      <AgentChatBox />
    </div>
  );
}
