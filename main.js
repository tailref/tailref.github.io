/* TailRef Studio — site behaviour
   Keeps download buttons pointing at the newest release, and highlights the
   build that matches the visitor's operating system. */

(() => {
  "use strict";

  const REPO = "Roxsmb/tailref";
  const FALLBACK_VERSION = "1.4.4";

  const PRIMARY = {
    windows: { label: "Download for Windows", asset: "Windows-TailRef-{v}-Setup.exe", size: "121 MB" },
    macos: { label: "Download for macOS", asset: "macOS-TailRef-{v}-arm64.dmg", size: "122 MB" },
    linux: { label: "Download for Linux", asset: "Linux-TailRef-{v}-x86_64.AppImage", size: "126 MB" },
  };

  const OS_NAME = { windows: "Windows", macos: "macOS", linux: "Linux" };

  function detectOS() {
    const ua = navigator.userAgent || "";
    const platform = navigator.userAgentData && navigator.userAgentData.platform;
    const p = (platform || navigator.platform || "").toLowerCase();

    if (/iphone|ipad|ipod|android/i.test(ua)) return null;
    if (p.includes("mac") || /macintosh/i.test(ua)) return "macos";
    if (p.includes("win") || /windows/i.test(ua)) return "windows";
    if (p.includes("linux") || /linux|x11/i.test(ua)) return "linux";
    return null;
  }

  function formatSize(bytes) {
    if (!bytes || typeof bytes !== "number") return null;
    const mb = bytes / (1024 * 1024);
    return `${Math.round(mb)} MB`;
  }

  function assetURL(version, asset) {
    return `https://github.com/${REPO}/releases/download/v${version}/${asset.replace("{v}", version)}`;
  }

  function applyOS(os) {
    if (!os) return;
    const config = PRIMARY[os];
    if (!config) return;

    document.querySelectorAll("[data-os-label]").forEach((el) => {
      el.textContent = config.label;
    });

    const card = document.querySelector(`.os-card[data-os="${os}"]`);
    if (card) card.classList.add("is-current");

    const hint = document.querySelector("[data-os-hint]");
    if (hint) {
      hint.textContent = `Your system: ${OS_NAME[os]}`;
      hint.hidden = false;
    }
  }

  function setPrimaryHref(version) {
    const os = detectOS();
    if (!os) return;
    const config = PRIMARY[os];
    const url = assetURL(version, config.asset);
    document.querySelectorAll("[data-os-label]").forEach((el) => {
      el.setAttribute("href", url);
    });
  }

  function setSizes(assetsByName, version) {
    const os = detectOS();
    if (!os) return;
    const asset = assetsByName.get(PRIMARY[os].asset.replace("{v}", version));
    const size = asset ? formatSize(asset.size) : null;
    if (!size) return;
    document.querySelectorAll("[data-os-size]").forEach((el) => {
      el.textContent = size;
    });
  }

  async function refreshFromLatestRelease() {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) return;

    const release = await res.json();
    const version = String(release.tag_name || "").replace(/^v/, "");
    if (!version) return;

    const assetsByName = new Map();
    (release.assets || []).forEach((asset) => assetsByName.set(asset.name, asset));

    document.querySelectorAll("[data-asset]").forEach((link) => {
      const name = link.dataset.asset.replace("{v}", version);
      const asset = assetsByName.get(name);
      if (asset) link.setAttribute("href", asset.browser_download_url);
    });

    document.querySelectorAll("[data-version]").forEach((el) => {
      el.textContent = version;
    });

    setPrimaryHref(version);
    setSizes(assetsByName, version);
  }

  function init() {
    const os = detectOS();
    applyOS(os);
    setPrimaryHref(FALLBACK_VERSION);

    const year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());

    refreshFromLatestRelease().catch(() => {
      /* offline or rate-limited: the static links already point at the current release */
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
