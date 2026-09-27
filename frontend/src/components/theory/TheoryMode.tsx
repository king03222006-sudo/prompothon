import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  BookOpen,
  ExternalLink,
  ChevronRight,
  Loader2,
  AlertCircle,
  ImageOff,
  X,
  Clock,
  Globe,
} from "lucide-react";

/* ─── Wikipedia API helpers ────────────────────────────────────────────── */

const WIKI_API = "https://en.wikipedia.org/api/rest_v1";
const WIKI_SEARCH = "https://en.wikipedia.org/w/api.php";

export interface WikiSection {
  title: string;
  content: string;
  level: number;
}

export interface WikiImage {
  src: string;
  caption: string;
  alt: string;
  credit?: string;
}

export interface WikiArticle {
  title: string;
  description: string;
  extract: string;
  sections: WikiSection[];
  images: WikiImage[];
  pageUrl: string;
  lastModified: string;
  thumbnail?: string;
}

export interface WikiSearchResult {
  title: string;
  description: string;
  pageUrl: string;
  thumbnail?: string;
}

const cache = new Map<string, WikiArticle>();
const searchCache = new Map<string, WikiSearchResult[]>();

async function fetchWikiArticle(topic: string): Promise<WikiArticle | null> {
  const key = topic.toLowerCase().trim();
  if (cache.has(key)) return cache.get(key)!;

  try {
    // 1) REST summary
    const summaryRes = await fetch(
      `${WIKI_API}/page/summary/${encodeURIComponent(topic)}`,
      { headers: { Accept: "application/json" } }
    );
    if (!summaryRes.ok) return null;
    const summary = await summaryRes.json();

    // 2) Full parse with sections (MediaWiki API)
    const parseRes = await fetch(
      `${WIKI_SEARCH}?action=parse&page=${encodeURIComponent(summary.title)}&prop=sections&format=json&origin=*`
    );
    const parseData = await parseRes.json();
    const rawSections: any[] = parseData?.parse?.sections ?? [];

    // 3) Fetch section content for top 10 sections
    const topSections = rawSections.slice(0, 10);
    const sectionContents = await Promise.all(
      topSections.map(async (sec: any) => {
        try {
          const r = await fetch(
            `${WIKI_API}/page/mobile-sections-remaining/${encodeURIComponent(summary.title)}`,
            { headers: { Accept: "application/json" } }
          );
          return null; // avoid over-fetching; we use the extract approach below
        } catch {
          return null;
        }
      })
    );

    // Simpler: fetch mobile-sections which contains all sections with HTML content
    let sections: WikiSection[] = [];
    try {
      const mobileRes = await fetch(
        `${WIKI_API}/page/mobile-sections/${encodeURIComponent(summary.title)}`,
        { headers: { Accept: "application/json" } }
      );
      if (mobileRes.ok) {
        const mobile = await mobileRes.json();
        const allSections: any[] = mobile?.remaining?.sections ?? [];
        sections = allSections.slice(0, 12).map((s: any) => ({
          title: s.line ?? s.anchor ?? "",
          content: stripHtml(s.text ?? ""),
          level: s.toclevel ?? 2,
        })).filter(s => s.title && s.content.length > 30);
      }
    } catch { /* silent */ }

    // 4) Images — Wikimedia Commons via page images API
    let images: WikiImage[] = [];
    try {
      const imgRes = await fetch(
        `${WIKI_SEARCH}?action=query&titles=${encodeURIComponent(summary.title)}&prop=images&imlimit=10&format=json&origin=*`
      );
      const imgData = await imgRes.json();
      const pages = Object.values(imgData?.query?.pages ?? {}) as any[];
      const rawImgs: string[] = pages[0]?.images?.map((i: any) => i.title) ?? [];

      // Filter to real images
      const imgFiles = rawImgs.filter(
        (t) => /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(t) && !t.toLowerCase().includes("icon") && !t.toLowerCase().includes("logo")
      ).slice(0, 5);

      // Resolve each to a URL
      images = await Promise.all(
        imgFiles.map(async (file): Promise<WikiImage | null> => {
          try {
            const infoRes = await fetch(
              `${WIKI_SEARCH}?action=query&titles=${encodeURIComponent(file)}&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*`
            );
            const info = await infoRes.json();
            const pg = Object.values(info?.query?.pages ?? {})[0] as any;
            const ii = pg?.imageinfo?.[0];
            if (!ii?.url) return null;
            return {
              src: ii.url,
              alt: file.replace("File:", "").replace(/\.\w+$/, ""),
              caption: ii.extmetadata?.ImageDescription?.value
                ? stripHtml(ii.extmetadata.ImageDescription.value).slice(0, 120)
                : file.replace("File:", "").replace(/\.\w+$/, ""),
              credit: ii.extmetadata?.Artist?.value
                ? stripHtml(ii.extmetadata.Artist.value)
                : "Wikimedia Commons",
            };
          } catch {
            return null;
          }
        })
      ).then((arr) => arr.filter(Boolean) as WikiImage[]);
    } catch { /* silent */ }

    const article: WikiArticle = {
      title: summary.title,
      description: summary.description ?? "",
      extract: summary.extract ?? "",
      sections,
      images,
      pageUrl: summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(summary.title)}`,
      lastModified: summary.timestamp ?? "",
      thumbnail: summary.thumbnail?.source,
    };

    cache.set(key, article);
    return article;
  } catch (err) {
    console.error("Wiki fetch error:", err);
    return null;
  }
}

async function searchWiki(query: string): Promise<WikiSearchResult[]> {
  const key = query.toLowerCase().trim();
  if (searchCache.has(key)) return searchCache.get(key)!;

  try {
    const res = await fetch(
      `${WIKI_SEARCH}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8&format=json&origin=*`
    );
    const data = await res.json();
    const raw: any[] = data?.query?.search ?? [];

    const results: WikiSearchResult[] = raw.map((r) => ({
      title: r.title,
      description: stripHtml(r.snippet ?? "").slice(0, 120) + "…",
      pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title)}`,
    }));

    searchCache.set(key, results);
    return results;
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
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

function ImageCard({ img }: { img: WikiImage }) {
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

function SectionBlock({ section, index }: { section: WikiSection; index: number }) {
  const [expanded, setExpanded] = useState(index < 3);
  return (
    <div className="theory-section">
      <button
        className="theory-section-header"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className="theory-section-title">{section.title}</span>
        <ChevronRight
          className="theory-section-chevron"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)" }}
        />
      </button>
      {expanded && (
        <div className="theory-section-body">
          {section.content.split("\n").filter(Boolean).map((para, i) => (
            <p key={i} className="theory-paragraph">{para}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main TheoryMode component ─────────────────────────────────────────── */

export function TheoryMode() {
  const [query, setQuery] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [article, setArticle] = useState<WikiArticle | null>(null);
  const [searchResults, setSearchResults] = useState<WikiSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"home" | "results" | "article">("home");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (topic: string) => {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setArticle(null);
    setSearchResults([]);
    setPhase("results");

    // Try direct article first
    const art = await fetchWikiArticle(topic);
    if (art) {
      setArticle(art);
      setPhase("article");
      setLoading(false);
      return;
    }

    // Fall back to search
    const results = await searchWiki(topic);
    if (results.length > 0) {
      setSearchResults(results);
      setPhase("results");
    } else {
      setError(`No Wikipedia results found for "${topic}". Try a different term.`);
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

  // Scroll to top on article load
  useEffect(() => {
    if (phase === "article") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [phase, article]);

  const lastModDate = article?.lastModified
    ? new Date(article.lastModified).toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
      })
    : null;

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
                <button type="button" onClick={clearSearch} className="theory-search-clear" aria-label="Clear">
                  <X className="h-4 w-4" />
                </button>
              )}
              <button type="submit" className="theory-search-btn" disabled={!inputVal.trim() || loading}>
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
                Explore Wikipedia's knowledge base on natural hazards, causes, impacts, and preparedness.
              </p>
            </div>
            <div className="theory-preset-grid">
              {TOPIC_PRESETS.map((t) => (
                <button
                  key={t.label}
                  className="theory-preset-card"
                  onClick={() => { setInputVal(t.label); doSearch(t.label); }}
                >
                  <span className="theory-preset-emoji">{t.emoji}</span>
                  <span className="theory-preset-label">{t.label}</span>
                </button>
              ))}
            </div>
            <p className="theory-attribution-note">
              <Globe className="inline h-3.5 w-3.5 mr-1 opacity-50" />
              Content sourced from{" "}
              <a href="https://wikipedia.org" target="_blank" rel="noopener noreferrer" className="theory-link">
                Wikipedia
              </a>{" "}
              under{" "}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className="theory-link">
                CC BY-SA 4.0
              </a>
            </p>
          </div>
        )}

        {/* LOADING */}
        {loading && (
          <div className="theory-loading">
            <Loader2 className="theory-loading-icon animate-spin" />
            <p>Fetching from Wikipedia…</p>
          </div>
        )}

        {/* ERROR */}
        {!loading && error && (
          <div className="theory-error">
            <AlertCircle className="h-6 w-6 text-rose-400 mb-2" />
            <p>{error}</p>
            <button className="theory-btn-outline mt-4" onClick={clearSearch}>Go back</button>
          </div>
        )}

        {/* SEARCH RESULTS */}
        {!loading && !error && phase === "results" && searchResults.length > 0 && (
          <div className="theory-results">
            <h2 className="theory-results-title">Search results for "{query}"</h2>
            <div className="theory-results-list">
              {searchResults.map((r) => (
                <button key={r.title} className="theory-result-card" onClick={() => openResult(r.title)}>
                  <div className="theory-result-title">{r.title}</div>
                  <div className="theory-result-desc">{r.description}</div>
                  <span className="theory-result-link">
                    View article <ChevronRight className="inline h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ARTICLE */}
        {!loading && !error && phase === "article" && article && (
          <article className="theory-article">
            {/* Title */}
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
                  {lastModDate && (
                    <span className="theory-meta-pill">
                      <Clock className="h-3 w-3" /> Last updated {lastModDate}
                    </span>
                  )}
                  <a
                    href={article.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="theory-meta-pill theory-meta-link"
                  >
                    <ExternalLink className="h-3 w-3" /> Wikipedia
                  </a>
                </div>
              </div>
            </div>

            {/* Extract / Introduction */}
            {article.extract && (
              <div className="theory-extract">
                <h2 className="theory-section-heading">Introduction</h2>
                {article.extract.split("\n").filter(Boolean).map((para, i) => (
                  <p key={i} className="theory-paragraph">{para}</p>
                ))}
              </div>
            )}

            {/* Images grid */}
            {article.images.length > 0 && (
              <div className="theory-images-section">
                <h2 className="theory-section-heading">Images</h2>
                <div className="theory-images-grid">
                  {article.images.slice(0, 6).map((img, i) => (
                    <ImageCard key={i} img={img} />
                  ))}
                </div>
              </div>
            )}

            {/* Sections */}
            {article.sections.length > 0 && (
              <div className="theory-sections-block">
                <h2 className="theory-section-heading">Article Sections</h2>
                {article.sections.map((sec, i) => (
                  <SectionBlock key={i} section={sec} index={i} />
                ))}
              </div>
            )}

            {/* Source attribution */}
            <div className="theory-source-block">
              <Globe className="h-4 w-4 opacity-40 shrink-0" />
              <div>
                <div className="theory-source-title">Source</div>
                <div className="theory-source-body">
                  This content is retrieved from{" "}
                  <a href={article.pageUrl} target="_blank" rel="noopener noreferrer" className="theory-link">
                    {article.title} — Wikipedia
                  </a>
                  {" "}and is available under the{" "}
                  <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className="theory-link">
                    Creative Commons Attribution-ShareAlike 4.0 International License
                  </a>.
                </div>
              </div>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
