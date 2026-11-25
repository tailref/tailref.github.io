/* TailRef Studio — GitHub releases → site news
   Keeps the News section current without rebuilding the site: release notes are
   fetched from the GitHub API, rendered in place and cached for a short while. */

(() => {
  "use strict";

  const REPO = "Roxsmb/tailref";
  const API = `https://api.github.com/repos/${REPO}`;
  const CACHE_KEY = "tailref:releases:v1";
  const CACHE_TTL = 15 * 60 * 1000;
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  /* ---------------- helpers ---------------- */

  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  }

  function cleanTitle(release) {
    const raw = release.name || `TailRef Studio ${release.tag}`;
    return raw.replace(/\bv(?=\d)/, "").replace(/\s+/g, " ").trim();
  }

  function plainText(markdown) {
    return String(markdown || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^\s*\|.*\|\s*$/gm, " ")
      .replace(/^\s*[>#]+\s*/gm, "")
      .replace(/[*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function excerpt(markdown, max = 178) {
    const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    const paragraph = [];
    let started = false;

    for (const line of lines) {
      const text = line.trim();
      if (/^#{1,6}\s/.test(text)) {
        if (started) break;
        continue;
      }
      if (!text) {
        if (started) break;
        continue;
      }
      const isBlock = /^(\||>|```|([-*+]|\d+[.)])\s)/.test(text);
      if (isBlock) {
        if (started) break;
        continue;
      }
      started = true;
      paragraph.push(text);
    }

    let out = plainText(paragraph.join(" "));
    if (out.length > max) {
      out = out.slice(0, max);
      const cut = out.lastIndexOf(" ");
      out = `${out.slice(0, cut > 60 ? cut : max).replace(/[.,;:]$/, "")}…`;
    }
    return out;
  }

  /* ---------------- minimal GFM renderer ---------------- */

  function inline(text) {
    const codes = [];
    let html = escapeHtml(text);
    html = html.replace(/`([^`]+)`/g, (_, code) => {
      codes.push(code);
      return `\u0000${codes.length - 1}\u0000`;
    });
    html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, '<img src="$2" alt="$1" loading="lazy">');
    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, '<a href="$2" rel="noopener">$1</a>');
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    html = html.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    html = html.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");
    html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    html = html.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" rel="noopener">$2</a>');
    html = html.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codes[Number(index)]}</code>`);
    return html;
  }

  const isTableRow = (line) => line.includes("|") && line.trim().startsWith("|");
  const isTableRule = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
  const listItem = (line) => line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
  const isBlockStart = (line) =>
    /^\s*(#{1,6}\s|```|>|\||([-*+]|\d+[.)])\s|([-*_])\s*(\3\s*){2,}$)/.test(line);

  function renderTable(lines) {
    const split = (line) =>
      line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
    const head = split(lines[0]);
    const rows = lines.slice(2).map(split);
    const cells = (tag, list) => `<tr>${list.map((cell) => `<${tag}>${inline(cell)}</${tag}>`).join("")}</tr>`;
    return `<div class="table-wrap"><table><thead>${cells("th", head)}</thead><tbody>${rows
      .map((row) => cells("td", row))
      .join("")}</tbody></table></div>`;
  }

  function markdown(source) {
    const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (!line.trim()) {
        i += 1;
        continue;
      }

      const fence = line.match(/^\s*```([\w+-]*)\s*$/);
      if (fence) {
        const code = [];
        i += 1;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
        i += 1;
        out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        const level = Math.min(heading[1].length + 1, 6);
        out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
        i += 1;
        continue;
      }

      if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
        out.push("<hr>");
        i += 1;
        continue;
      }

      if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
        const block = [line, lines[i + 1]];
        i += 2;
        while (i < lines.length && isTableRow(lines[i])) block.push(lines[i++]);
        out.push(renderTable(block));
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        const quote = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
        out.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`);
        continue;
      }

      const item = listItem(line);
      if (item) {
        const ordered = /\d/.test(item[1]);
        const items = [];
        let current = null;
        while (i < lines.length) {
          const next = lines[i];
          const match = listItem(next);
          if (match) {
            current = { text: match[2] };
            items.push(current);
            i += 1;
            continue;
          }
          if (!next.trim()) break;
          if (isBlockStart(next)) break;
          if (current) current.text += ` ${next.trim()}`;
          i += 1;
        }
        const tag = ordered ? "ol" : "ul";
        out.push(`<${tag}>${items.map((entry) => `<li>${inline(entry.text)}</li>`).join("")}</${tag}>`);
        continue;
      }

      const paragraph = [];
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) paragraph.push(lines[i++]);
      out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    }

    return out.join("\n");
  }

  /* ---------------- data ---------------- */

  function simplify(release) {
    return {
      tag: release.tag_name,
      name: release.name || release.tag_name,
      date: release.published_at || release.created_at,
      body: release.body || "",
      url: release.html_url,
      prerelease: Boolean(release.prerelease),
      assets: (release.assets || []).map((asset) => ({
        name: asset.name,
        size: asset.size,
        url: asset.browser_download_url,
      })),
    };
  }

  function readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || Date.now() - parsed.time > CACHE_TTL) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  function writeCache(data) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), data }));
    } catch {
      /* private mode or a full quota: live data is still on screen */
    }
  }

  let inflight = null;

  function fetchReleases(limit = 8) {
    const cached = readCache();
    if (cached && cached.length) return Promise.resolve(cached);
    if (inflight) return inflight;

    inflight = fetch(`${API}/releases?per_page=${Math.max(limit, 8)}`, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((list) => {
        if (!Array.isArray(list) || !list.length) return null;
        const data = list.filter((item) => !item.draft).map(simplify);
        writeCache(data);
        return data;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });

    return inflight;
  }

  function fetchRelease(tag) {
    const cached = readCache();
    if (cached) {
      const hit = cached.find((item) => item.tag === tag);
      if (hit) return Promise.resolve(hit);
    }
    return fetch(`${API}/releases/tags/${encodeURIComponent(tag)}`, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((release) => (release ? simplify(release) : null))
      .catch(() => null);
  }

  /* ---------------- extra feed (itch.io devlog, hand-written posts) ---------------- */

  let feedPromise = null;

  function loadFeed(url) {
    if (!url) return Promise.resolve(null);
    if (!feedPromise) {
      feedPromise = fetch(url, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
    }
    return feedPromise;
  }

  const normalizeTitle = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");

  /* ---------------- news cards ---------------- */

  function makeCard({ href, title, date, excerpt: text, version, source, external, grid }) {
    const card = document.createElement("article");
    if (grid) card.className = "news-card";
    if (version) card.dataset.release = version;
    card.dataset.date = (date || "").slice(0, 10);
    const label = source === "itch" ? `${formatDate(date)} · itch.io` : formatDate(date);
    const rel = external ? ' rel="noopener"' : "";
    const safeTitle = escapeHtml(title);
    const heading = grid ? "h3" : "h2";
    card.innerHTML = `<${heading}><a href="${href}"${rel}>${safeTitle}</a></${heading}>
      <p class="news-date">${label}</p>
      <p class="news-excerpt">${escapeHtml(text)}</p>
      <a class="btn btn-outline btn-xs" href="${href}"${rel}>Read more<span class="sr-only">: ${safeTitle}</span></a>`;
    return card;
  }

  function releaseCard(release, base, grid) {
    const version = release.tag.replace(/^v/, "");
    return makeCard({
      href: `${base}release.html?tag=${encodeURIComponent(release.tag)}`,
      title: cleanTitle(release),
      date: release.date,
      excerpt: excerpt(release.body),
      version,
      source: "release",
      grid,
    });
  }

  function feedCard(item, grid) {
    const external = /^https?:/i.test(item.url || "");
    return makeCard({
      href: item.url,
      title: item.title,
      date: item.date,
      excerpt: item.excerpt || "",
      version: item.tag ? String(item.tag).replace(/^v/, "") : "",
      source: item.source,
      external,
      grid,
    });
  }

  async function upgradeList(container, base, limit) {
    const grid = container.classList.contains("news-grid");
    const [releases, feed] = await Promise.all([
      fetchReleases(limit + 4),
      loadFeed(container.dataset.newsFeed),
    ]);
    if (!releases && !feed) return;

    const knownVersions = new Set();
    const knownTitles = new Set();
    const knownHrefs = new Set();
    const items = [...container.querySelectorAll(":scope > article")].map((node) => {
      if (node.dataset.release) knownVersions.add(node.dataset.release);
      const heading = node.querySelector("h2, h3");
      if (heading) knownTitles.add(normalizeTitle(heading.textContent));
      const link = node.querySelector("h2 a, h3 a");
      if (link) knownHrefs.add(link.getAttribute("href"));
      return { date: node.dataset.date || "", node };
    });

    (feed && Array.isArray(feed.items) ? feed.items : []).forEach((item) => {
      if (!item || !item.url || !item.title) return;
      const version = item.tag ? String(item.tag).replace(/^v/, "") : "";
      if (version && knownVersions.has(version)) return;
      if (knownTitles.has(normalizeTitle(item.title))) return;
      if (knownHrefs.has(item.url)) return;
      knownTitles.add(normalizeTitle(item.title));
      knownHrefs.add(item.url);
      items.push({ date: (item.date || "").slice(0, 10), node: feedCard(item, grid) });
    });

    (releases || []).forEach((release) => {
      const version = release.tag.replace(/^v/, "");
      if (knownVersions.has(version)) return;
      if (knownTitles.has(normalizeTitle(cleanTitle(release)))) return;
      knownVersions.add(version);
      items.push({ date: (release.date || "").slice(0, 10), node: releaseCard(release, base, grid) });
    });

    items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    container.replaceChildren(...items.slice(0, limit).map((entry) => entry.node));
  }

  /* ---------------- release page ---------------- */

  const isAssetVisible = (name) => !/\.(yml|blockmap|json)$/i.test(name) && !/^latest/i.test(name);

  function formatSize(bytes) {
    if (!bytes) return "";
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${Math.round(mb)} MB` : `${Math.round(bytes / 1024)} KB`;
  }

  function downloadsHtml(release) {
    const assets = release.assets.filter((asset) => isAssetVisible(asset.name));
    if (!assets.length) return "";
    return `<section class="release-downloads">
      <h2>Downloads</h2>
      <ul>${assets
        .map(
          (asset) =>
            `<li><a href="${asset.url}" rel="noopener"><span>${escapeHtml(asset.name)}</span><span class="release-size">${formatSize(asset.size)}</span></a></li>`
        )
        .join("")}</ul>
      <p class="release-note">Checksums and all files: <a href="${release.url}" rel="noopener">github.com/${REPO}/releases</a></p>
    </section>`;
  }

  async function renderReleasePage() {
    const root = document.getElementById("release-post");
    if (!root) return;

    const tag = new URLSearchParams(location.search).get("tag");
    const [releases, feed] = await Promise.all([fetchReleases(10), loadFeed("../news.json")]);
    const feedItems = feed && Array.isArray(feed.items) ? feed.items : [];
    const feedItem = feedItems.find((item) => (tag ? item.tag === tag : item.source === "release" && item.body));

    let release = tag && releases ? releases.find((item) => item.tag === tag) || (await fetchRelease(tag)) : releases && releases[0];
    if (!release && feedItem && feedItem.body) {
      release = {
        tag: feedItem.tag || "",
        name: feedItem.title,
        date: feedItem.date,
        body: feedItem.body,
        url: feedItem.url,
        assets: feedItem.assets || [],
      };
    }

    const loading = root.querySelector("[data-release-loading]");
    if (loading) loading.hidden = true;

    const fallback = root.querySelector("[data-release-fallback]");
    const article = root.querySelector("[data-release-article]");

    if (!release) {
      if (fallback) fallback.hidden = false;
      if (article) article.hidden = true;
      return;
    }

    if (fallback) fallback.hidden = true;
    if (article) article.hidden = false;

    const title = cleanTitle(release);
    document.title = `${title} — TailRef Studio`;
    const description = excerpt(release.body, 150);
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription && description) metaDescription.setAttribute("content", description);

    const h1 = root.querySelector("h1");
    if (h1) h1.textContent = title;

    const date = root.querySelector("[data-release-date]");
    if (date) date.textContent = formatDate(release.date);

    const body = root.querySelector("[data-release-body]");
    if (body) body.innerHTML = markdown(release.body);

    const downloads = root.querySelector("[data-release-downloads]");
    if (downloads) downloads.innerHTML = downloadsHtml(release);

    const version = String(release.tag || "").replace(/^v/, "");
    if (version) {
      document.querySelectorAll("[data-version]").forEach((node) => {
        node.textContent = version;
      });
    }

    const index = releases ? releases.findIndex((item) => item.tag === release.tag) : -1;
    const newer = index > 0 ? releases[index - 1] : null;
    const older = index >= 0 && index + 1 < releases.length ? releases[index + 1] : null;

    const prev = root.querySelector("[data-release-newer]");
    if (prev) {
      if (newer) {
        prev.href = `release.html?tag=${encodeURIComponent(newer.tag)}`;
        prev.textContent = `← ${cleanTitle(newer)}`;
        prev.hidden = false;
      } else {
        prev.hidden = true;
      }
    }

    const next = root.querySelector("[data-release-older]");
    if (next) {
      if (older) {
        next.href = `release.html?tag=${encodeURIComponent(older.tag)}`;
        next.textContent = `${cleanTitle(older)} →`;
        next.hidden = false;
      } else {
        next.hidden = true;
      }
    }
  }

  /* ---------------- boot ---------------- */

  function boot() {
    document.querySelectorAll("[data-news-list]").forEach((container) => {
      const base = container.dataset.newsBase || "";
      const limit = Number(container.dataset.newsLimit || 4);
      upgradeList(container, base, limit);
    });
    renderReleasePage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  window.TailRefReleases = { fetch: fetchReleases, latest: () => fetchReleases(1).then((list) => (list ? list[0] : null)), markdown };
})();
