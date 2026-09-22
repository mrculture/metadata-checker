const sampleHtml = `<!doctype html>
<html lang="en">
  <head>
    <title>Metadata Checker Launch Page</title>
    <meta name="description" content="Fast metadata audit for search snippets, Open Graph cards, Twitter Cards, and launch QA." />
    <link rel="canonical" href="https://example.com/metadata-checker" />
    <meta name="robots" content="index,follow" />
    <meta property="og:title" content="Metadata Checker Launch Page" />
    <meta property="og:description" content="Fast metadata audit for search snippets, Open Graph cards, Twitter Cards, and launch QA." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://example.com/metadata-checker" />
    <meta property="og:image" content="/share-card.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Metadata Checker Launch Page" />
  </head>
  <body>
    <h1>Metadata Checker</h1>
  </body>
</html>`;

const state = {
  filter: "all",
  result: null,
  tourStep: 0,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const checks = [
  {
    key: "title",
    label: "Title tag",
    severity: "critical",
    test: (data) => Boolean(data.title),
    pass: (data) => `${data.title.length} characters.`,
    fail: "Add one unique title tag.",
    warn: (data) => data.title && (data.title.length < 30 || data.title.length > 60),
    warning: (data) => `Title is ${data.title.length} characters; 30 to 60 is a useful working range.`,
  },
  {
    key: "description",
    label: "Meta description",
    severity: "critical",
    test: (data) => Boolean(data.description),
    pass: (data) => `${data.description.length} characters.`,
    fail: "Add a concise meta description.",
    warn: (data) => data.description && (data.description.length < 70 || data.description.length > 160),
    warning: (data) => `Description is ${data.description.length} characters; 70 to 160 is a useful working range.`,
  },
  {
    key: "canonical",
    label: "Canonical URL",
    severity: "warning",
    test: (data) => Boolean(data.canonical && absoluteUrl(data.canonical, data.sourceUrl || undefined)),
    pass: (data) => data.canonical,
    fail: "Add a valid HTTP(S) canonical link to reduce duplicate URL ambiguity.",
  },
  {
    key: "robots",
    label: "Indexability",
    severity: "critical",
    test: (data) => !/(?:^|[\s,])(?:noindex|none)(?:$|[\s,])/i.test(data.robots || ""),
    pass: (data) => data.robots || "No blocking robots tag found.",
    fail: "Robots metadata contains noindex or none. Keep this if the page should stay out of search.",
  },
  {
    key: "ogTitle",
    label: "Open Graph title",
    severity: "warning",
    test: (data) => Boolean(data.ogTitle),
    pass: (data) => data.ogTitle,
    fail: "Add og:title for social previews.",
  },
  {
    key: "ogDescription",
    label: "Open Graph description",
    severity: "warning",
    test: (data) => Boolean(data.ogDescription),
    pass: (data) => data.ogDescription,
    fail: "Add og:description for social previews.",
  },
  {
    key: "ogImage",
    label: "Open Graph image",
    severity: "critical",
    test: (data) => Boolean(data.ogImage && data.displayImage),
    pass: (data) => data.ogImage,
    fail: "Add og:image with an absolute, crawlable image URL.",
    warn: (data) => data.ogImage && !/^https?:\/\//i.test(data.ogImage),
    warning: "og:image is relative. Absolute URLs are safer for social crawlers.",
  },
  {
    key: "twitterCard",
    label: "Twitter Card",
    severity: "warning",
    test: (data) => Boolean(data.twitterCard),
    pass: (data) => data.twitterCard,
    fail: "Add twitter:card, usually summary_large_image.",
  },
  {
    key: "viewport",
    label: "Viewport",
    severity: "warning",
    test: (data) => Boolean(data.viewport),
    pass: (data) => data.viewport,
    fail: "Add a responsive viewport meta tag.",
  },
  {
    key: "language",
    label: "HTML language",
    severity: "warning",
    test: (data) => Boolean(data.language),
    pass: (data) => data.language,
    fail: "Add lang to the html element.",
  },
];

const tourSteps = [
  {
    selector: ".input-panel",
    title: "Start with a source",
    copy: "Paste raw HTML or fetch a URL, then the audit updates from the current page metadata.",
  },
  {
    selector: ".score-panel",
    title: "Read the health score",
    copy: "The score separates critical launch blockers from smaller metadata warnings.",
  },
  {
    selector: "#findings",
    title: "Work through findings",
    copy: "Filter the list to focus on critical gaps, warnings, or passing checks.",
  },
  {
    selector: "#previews",
    title: "Check previews",
    copy: "Search and social cards show how the current tags may appear when shared or indexed.",
  },
  {
    selector: ".detected-panel",
    title: "Review detected tags",
    copy: "The inventory keeps every detected title, meta, and link tag visible for quick QA.",
  },
  {
    selector: "#snippet",
    title: "Export clean tags",
    copy: "Copy the recommended snippet or download a concise Markdown report.",
  },
];

function getMeta(doc, selector) {
  return doc.querySelector(selector)?.getAttribute("content")?.trim() || "";
}

function absoluteUrl(value, base) {
  if (!value) return "";
  try {
    const url = new URL(value, base || "https://example.com/");
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function parseHtml(html, sourceUrl = "") {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const base = sourceUrl || getMeta(doc, 'meta[property="og:url"]') || doc.querySelector("link[rel='canonical']")?.href || "";
  const data = {
    sourceUrl,
    title: doc.querySelector("title")?.textContent?.trim() || "",
    description: getMeta(doc, 'meta[name="description"]'),
    canonical: doc.querySelector("link[rel='canonical']")?.getAttribute("href")?.trim() || "",
    robots: Array.from(doc.querySelectorAll('meta[name="robots" i], meta[name="googlebot" i]')).map(node => node.getAttribute("content") || "").join(", "),
    viewport: getMeta(doc, 'meta[name="viewport"]'),
    language: doc.documentElement.getAttribute("lang") || "",
    ogTitle: getMeta(doc, 'meta[property="og:title"]'),
    ogDescription: getMeta(doc, 'meta[property="og:description"]'),
    ogType: getMeta(doc, 'meta[property="og:type"]'),
    ogUrl: getMeta(doc, 'meta[property="og:url"]'),
    ogImage: getMeta(doc, 'meta[property="og:image"]'),
    twitterCard: getMeta(doc, 'meta[name="twitter:card"]'),
    twitterTitle: getMeta(doc, 'meta[name="twitter:title"]'),
    twitterDescription: getMeta(doc, 'meta[name="twitter:description"]'),
    twitterImage: getMeta(doc, 'meta[name="twitter:image"]'),
  };

  data.displayUrl = data.ogUrl || data.canonical || sourceUrl || "https://example.com/page";
  data.displayTitle = data.ogTitle || data.twitterTitle || data.title || "Untitled page";
  data.displayDescription = data.ogDescription || data.twitterDescription || data.description || "No description found.";
  data.displayImage = absoluteUrl(data.ogImage || data.twitterImage, base || sourceUrl);
  data.allTags = collectTags(doc);
  return data;
}

function collectTags(doc) {
  const tags = [];
  const title = doc.querySelector("title")?.textContent?.trim();
  if (title) tags.push(["title", title]);
  doc.querySelectorAll("meta").forEach((node) => {
    const name = node.getAttribute("name") || node.getAttribute("property") || node.getAttribute("http-equiv");
    const content = node.getAttribute("content");
    if (name && content) tags.push([name, content]);
  });
  doc.querySelectorAll("link[rel]").forEach((node) => {
    const rel = node.getAttribute("rel");
    const href = node.getAttribute("href");
    if (rel && href) tags.push([`link:${rel}`, href]);
  });
  return tags;
}

function evaluate(data) {
  const findings = [];
  checks.forEach((check) => {
    if (!check.test(data)) {
      findings.push({
        severity: check.severity,
        label: check.label,
        detail: check.fail,
      });
      return;
    }
    if (check.warn?.(data)) {
      findings.push({
        severity: "warning",
        label: check.label,
        detail: typeof check.warning === "function" ? check.warning(data) : check.warning,
      });
      return;
    }
    findings.push({
      severity: "pass",
      label: check.label,
      detail: check.pass(data),
    });
  });

  const critical = findings.filter((item) => item.severity === "critical").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;
  const score = Math.max(0, 100 - critical * 18 - warnings * 7);
  return { ...data, findings, score, critical, warnings };
}

function runAudit(sourceLabel = "HTML parsed") {
  const html = $("#html-input").value.trim();
  if (!html) {
    clearResults();
    setSourceState("No HTML", "warning");
    return;
  }
  const result = evaluate(parseHtml(html, $("#page-url").value.trim()));
  state.result = result;
  setSourceState(sourceLabel, "pass");
  render();
}

async function fetchUrl() {
  const url = $("#page-url").value.trim();
  clearResults();
  let parsed;
  try { parsed = new URL(url); } catch { /* Show a helpful validation error below. */ }
  if (!parsed || !/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    setSourceState("Enter a valid HTTP or HTTPS URL without credentials", "warning");
    return;
  }
  $("#fetch-url").disabled = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const originalHtml = $("#html-input").value;
  setSourceState("Fetching", "neutral");
  try {
    const response = await fetch(parsed.href, { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error(`Fetch failed (HTTP ${response.status}). Paste page HTML instead.`);
    if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") || "")) throw new Error("URL did not return HTML. Paste page HTML instead.");
    const html = await response.text();
    if ($("#page-url").value.trim() !== url || $("#html-input").value !== originalHtml) return;
    $("#html-input").value = html;
    runAudit("URL fetched");
  } catch (error) {
    if ($("#page-url").value.trim() === url && $("#html-input").value === originalHtml) {
      setSourceState(error.message?.startsWith("Fetch failed") || error.message?.startsWith("URL did") ? error.message : "Fetch failed or blocked by browser access rules. Paste page HTML instead.", "warning");
    }
  } finally {
    clearTimeout(timeout);
    $("#fetch-url").disabled = false;
  }
}

function setSourceState(label, tone) {
  const pill = $("#source-state");
  pill.textContent = label;
  pill.style.color = tone === "warning" ? "var(--amber)" : tone === "neutral" ? "var(--blue)" : "var(--green)";
}

function render() {
  const result = state.result;
  if (!result) return;
  $("#copy-snippet").disabled = false;
  $("#download-report").disabled = false;
  renderScore(result);
  renderFindings(result);
  renderPreviews(result);
  renderTags(result);
  renderSnippet(result);
}

function renderScore(result) {
  const color = result.score < 65 ? "var(--coral)" : result.score < 85 ? "var(--amber)" : "var(--teal)";
  $(".score-ring").style.background =
    `radial-gradient(circle at center, var(--panel) 0 53%, transparent 54%), conic-gradient(${color} 0 ${result.score}%, rgba(135, 159, 151, 0.18) ${result.score}% 100%)`;
  $("#score-value").textContent = result.score;
  $("#score-label").textContent = result.score < 65 ? "Fix first" : result.score < 85 ? "Review" : "Ready";
  $("#score-state").textContent = result.score < 65 ? "Needs work" : result.score < 85 ? "Review" : "Good";
  $("#score-state").style.color = color;
  $("#critical-count").textContent = result.critical;
  $("#warning-count").textContent = result.warnings;
  $("#tag-count").textContent = result.allTags.length;
  $("#canonical-state").textContent = result.canonical ? "Found" : "Missing";
  $("#summary-box").textContent = summaryText(result);
}

function summaryText(result) {
  if (result.critical) return `${result.critical} critical item${result.critical === 1 ? "" : "s"} should be fixed before publishing.`;
  if (result.warnings) return `${result.warnings} warning${result.warnings === 1 ? "" : "s"} remain, but the core metadata is in place.`;
  return "Core search, social, indexability, and responsive metadata checks passed.";
}

function renderFindings(result) {
  const filtered = state.filter === "all" ? result.findings : result.findings.filter((item) => item.severity === state.filter);
  $("#finding-list").innerHTML = filtered
    .map((item) => `
      <article class="finding-item" data-severity="${item.severity}">
        <span class="finding-badge">${item.severity}</span>
        <div>
          <h3>${escapeHtml(item.label)}</h3>
          <p>${escapeHtml(item.detail)}</p>
        </div>
      </article>
    `)
    .join("");
}

function renderPreviews(result) {
  const url = new URL(absoluteUrl(result.displayUrl) || "https://example.com/");
  $("#serp-url").textContent = url.hostname + url.pathname;
  $("#serp-title").textContent = result.title || result.displayTitle;
  $("#serp-description").textContent = result.description || result.displayDescription;
  $("#social-domain").textContent = url.hostname;
  $("#social-title").textContent = result.displayTitle;
  $("#social-description").textContent = result.displayDescription;
  $("#social-image").textContent = result.displayImage
    ? "Image URL detected. External images are not loaded automatically for privacy."
    : "No valid image URL";
}

function renderTags(result) {
  $("#tag-table").innerHTML = result.allTags.length
    ? result.allTags.map(([key, value]) => `
        <div class="tag-row">
          <span>${escapeHtml(key)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `).join("")
    : '<div class="tag-row"><span>None</span><strong>No metadata tags detected.</strong></div>';
}

function renderSnippet(result) {
  const title = result.title || result.displayTitle;
  const description = result.description || result.displayDescription;
  const canonical = absoluteUrl(result.canonical, result.sourceUrl || undefined) || absoluteUrl(result.displayUrl) || "https://example.com/page";
  const image = result.displayImage || "https://example.com/share-card.png";
  const lines = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeAttribute(description)}" />`,
    `<link rel="canonical" href="${escapeAttribute(canonical)}" />`,
    `<meta name="robots" content="${escapeAttribute(result.robots || "index,follow")}" />`,
    `<meta property="og:title" content="${escapeAttribute(result.ogTitle || title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(result.ogDescription || description)}" />`,
    `<meta property="og:type" content="${escapeAttribute(result.ogType || "website")}" />`,
    `<meta property="og:url" content="${escapeAttribute(absoluteUrl(result.ogUrl, canonical) || canonical)}" />`,
    `<meta property="og:image" content="${escapeAttribute(image)}" />`,
    `<meta name="twitter:card" content="${escapeAttribute(result.twitterCard || "summary_large_image")}" />`,
    `<meta name="twitter:title" content="${escapeAttribute(result.twitterTitle || title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(result.twitterDescription || description)}" />`,
    `<meta name="twitter:image" content="${escapeAttribute(absoluteUrl(result.twitterImage, canonical) || image)}" />`,
  ];
  $("#snippet-code").textContent = lines.join("\n");
}

async function copySnippet() {
  if (!state.result) return;
  try {
    await navigator.clipboard.writeText($("#snippet-code").textContent);
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents($("#snippet-code"));
    selection.removeAllRanges();
    selection.addRange(range);
    setSourceState("Clipboard blocked. Snippet selected; copy it manually.", "warning");
    return;
  }
  $("#copy-snippet").textContent = "Copied";
  setTimeout(() => {
    $("#copy-snippet").textContent = "Copy";
  }, 1400);
}

function downloadReport() {
  const result = state.result;
  if (!result) return;
  const body = [
    "# Metadata Checker Report",
    "",
    `Score: ${result.score}`,
    `Critical gaps: ${result.critical}`,
    `Warnings: ${result.warnings}`,
    "",
    "## Findings",
    ...result.findings.map((item) => `- ${item.severity.toUpperCase()}: ${item.label} - ${item.detail}`),
    "",
    "## Recommended Snippet",
    "```html",
    $("#snippet-code").textContent,
    "```",
  ].join("\n");
  downloadTextFile("metadata-checker-report.md", body);
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function loadSample() {
  $("#page-url").value = "https://example.com/metadata-checker";
  $("#html-input").value = sampleHtml;
  runAudit("Sample loaded");
}

function clearInput() {
  $("#page-url").value = "";
  $("#html-input").value = "";
  clearResults();
  setSourceState("Cleared", "neutral");
}

function clearResults() {
  state.result = null;
  ["#finding-list", "#tag-table", "#snippet-code", "#serp-url", "#serp-title", "#serp-description", "#social-domain", "#social-title", "#social-description", "#social-image"].forEach(selector => $(selector).textContent = "");
  ["#score-value", "#critical-count", "#warning-count", "#tag-count", "#canonical-state"].forEach(selector => $(selector).textContent = "—");
  $("#score-label").textContent = "No audit";
  $("#score-state").textContent = "No audit";
  $(".score-ring").style.background = "none";
  $("#summary-box").textContent = "Paste HTML or fetch a page to start an audit.";
  $("#copy-snippet").disabled = true;
  $("#download-report").disabled = true;
}

function updateBackToTop() {
  $("#back-to-top").classList.toggle("is-visible", window.scrollY > 420);
}

function updateActiveNav() {
  const sections = [
    ["#check", document.querySelector("#check")],
    ["#findings", document.querySelector("#findings")],
    ["#previews", document.querySelector("#previews")],
    ["#snippet", document.querySelector("#snippet")],
  ];
  const current = sections.reduce((active, [id, section]) => {
    if (!section) return active;
    return section.getBoundingClientRect().top <= 180 ? id : active;
  }, "#check");
  $$(".nav-icon").forEach((link) => {
    link.classList.toggle("is-active", link.getAttribute("href") === current);
  });
}

function showTourStep(index) {
  state.tourStep = Math.max(0, Math.min(index, tourSteps.length - 1));
  const step = tourSteps[state.tourStep];
  const target = document.querySelector(step.selector);

  $$(".tour-target").forEach((element) => element.classList.remove("tour-target"));
  if (target) {
    target.classList.add("tour-target");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  $("#tour-step-count").textContent = `Step ${state.tourStep + 1} of ${tourSteps.length}`;
  $("#tour-title").textContent = step.title;
  $("#tour-copy").textContent = step.copy;
  $("#tour-prev").disabled = state.tourStep === 0;
  $("#tour-next").textContent = state.tourStep === tourSteps.length - 1 ? "Finish" : "Next";
}

function openTour() {
  $("#tour-overlay").hidden = false;
  showTourStep(0);
}

function closeTour() {
  $("#tour-overlay").hidden = true;
  $$(".tour-target").forEach((element) => element.classList.remove("tour-target"));
}

function nextTourStep() {
  if (state.tourStep >= tourSteps.length - 1) {
    closeTour();
    return;
  }
  showTourStep(state.tourStep + 1);
}

function previousTourStep() {
  showTourStep(state.tourStep - 1);
}

function handleScrollState() {
  updateBackToTop();
  updateActiveNav();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

$("#fetch-url").addEventListener("click", fetchUrl);
$("#load-sample").addEventListener("click", loadSample);
$("#clear-input").addEventListener("click", clearInput);
$("#html-input").addEventListener("input", () => runAudit("HTML parsed"));
$("#copy-snippet").addEventListener("click", copySnippet);
$("#download-report").addEventListener("click", downloadReport);
$("#start-tour").addEventListener("click", openTour);
$("#tour-next").addEventListener("click", nextTourStep);
$("#tour-prev").addEventListener("click", previousTourStep);
$("#tour-close").addEventListener("click", closeTour);
$("#back-to-top").addEventListener("click", () => closeTour());
window.addEventListener("scroll", handleScrollState, { passive: true });
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#tour-overlay").hidden) closeTour();
});
$$(".segment").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    $$(".segment").forEach((item) => item.classList.toggle("is-active", item === button));
    render();
  });
});

loadSample();
handleScrollState();
