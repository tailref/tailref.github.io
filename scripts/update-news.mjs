// Rebuilds news.json from GitHub releases and, when reachable, the itch.io devlog.
// Runs in GitHub Actions (see .github/workflows/update-news.yml). Never throws:
// whatever cannot be fetched is simply left as it was.

import { readFile, writeFile } from "node:fs/promises";

const REPO = "Roxsmb/tailref";
const SITE = "https://tailref.github.io";
const ITCH_FEED = "https://roxsmb.itch.io/tailref/devlog.rss";
const LIMIT = 24;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function decodeEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

const stripHtml = (value) =>
  decodeEntities(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const excerpt = (value, max = 180) => {
  const text = stripHtml(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 80)).replace(/[.,;:]$/, "")}…`;
};

async function loadExisting() {
  try {
    const data = JSON.parse(await readFile(new URL("../news.json", import.meta.url), "utf8"));
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

async function fetchReleases() {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=12`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": UA,
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    });
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    const list = await response.json();
    return list
      .filter((release) => !release.draft)
      .map((release) => ({
        source: "release",
        tag: release.tag_name,
        title: release.name || release.tag_name,
        date: (release.published_at || release.created_at || "").slice(0, 10),
        excerpt: excerpt(release.body),
        url: `${SITE}/news/release.html?tag=${encodeURIComponent(release.tag_name)}`,
        body: release.body || "",
        assets: (release.assets || []).map((asset) => ({
          name: asset.name,
          size: asset.size,
          url: asset.browser_download_url,
        })),
      }));
  } catch (error) {
    console.warn(`releases unavailable: ${error.message}`);
    return [];
  }
}

async function fetchItch() {
  try {
    const response = await fetch(ITCH_FEED, {
      headers: {
        "User-Agent": UA,
        Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) throw new Error(`itch.io ${response.status}`);
    const xml = await response.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, body]) => {
      const pick = (tag) => {
        const match = body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
        return match ? decodeEntities(match[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim()) : "";
      };
      return {
        source: "itch",
        title: stripHtml(pick("title")),
        date: new Date(pick("pubDate")).toISOString().slice(0, 10),
        excerpt: excerpt(pick("description")),
        url: pick("link"),
      };
    });
    if (!items.length) throw new Error("itch.io feed had no items");
    return items.filter((item) => item.title && item.url);
  } catch (error) {
    console.warn(`itch.io feed unavailable (keeping the existing entries): ${error.message}`);
    return [];
  }
}

function merge(existing, releases, itch) {
  const byKey = new Map();
  const add = (item) => {
    if (!item || !item.title || !item.url) return;
    const key = item.tag ? `tag:${item.tag}` : `title:${normalize(item.title)}`;
    if (byKey.has(key)) return;
    byKey.set(key, item);
  };

  releases.forEach(add);
  itch.forEach(add);
  // Keep hand-written or previously fetched items when a source is unreachable.
  existing.forEach(add);

  return [...byKey.values()]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, LIMIT);
}

const existing = await loadExisting();
const [releases, itch] = await Promise.all([fetchReleases(), fetchItch()]);
const items = merge(existing, releases, itch);

const output = `${JSON.stringify({ generated: new Date().toISOString().slice(0, 10), items }, null, 2)}\n`;
const previous = await readFile(new URL("../news.json", import.meta.url), "utf8").catch(() => "");
if (output === previous) {
  console.log("news.json is already current");
} else {
  await writeFile(new URL("../news.json", import.meta.url), output);
  console.log(`news.json updated: ${items.length} items (${releases.length} releases, ${itch.length} itch posts)`);
}
