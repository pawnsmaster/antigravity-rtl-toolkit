(function antigravityRtlToolkit() {
  const STYLE_ID = "antigravity-rtl-toolkit-style";
  const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const LATIN_RE = /[A-Za-z]/;
  const processed = new WeakMap();
  const pending = new Set();
  let scheduled = false;
  
  const BLOCK_SELECTOR = [
    ".whitespace-pre-wrap",
    ".leading-relaxed p",
    ".leading-relaxed li",
    ".leading-relaxed blockquote",
    ".leading-relaxed h1",
    ".leading-relaxed h2",
    ".leading-relaxed h3",
    ".leading-relaxed h4",
    "p",
    "li",
    "blockquote"
  ].join(",");
  
  const TEXT_LEAF_SELECTOR = [
    ".whitespace-pre-wrap",
    ".leading-relaxed p",
    ".leading-relaxed li"
  ].join(",");
  
  const INTERACTIVE_SELECTOR = [
    "textarea",
    "input",
    "[contenteditable='true']",
    "[role='textbox']",
    "[role='combobox']",
    "form"
  ].join(",");
  
  const CODE_BLOCK_SELECTOR = [
    "pre",
    "code",
    "kbd",
    "samp",
    "[class*='code-block' i]",
    "[class*='codeblock' i]",
    "[class*='highlight' i]",
    "[class*='shiki' i]",
    "[class*='terminal' i]",
    "[class*='monaco' i]"
  ].join(",");

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.documentElement.appendChild(style);
    }
    style.textContent = window.__ANTIGRAVITY_RTL_STYLE__ || "";
    document.documentElement.dataset.antigravityRtlRoot = "true";
  }

  function isCodeLike(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    return Boolean(node.closest(`${CODE_BLOCK_SELECTOR}, textarea, input, [role='textbox'], [role='combobox']`));
  }

  function isInteractive(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    return Boolean(node.closest(INTERACTIVE_SELECTOR));
  }

  function classifyText(text) {
    const hasArabic = ARABIC_RE.test(text);
    if (!hasArabic) return "auto";
    const arabicCount = (text.match(new RegExp(ARABIC_RE.source, "g")) || []).length;
    const latinCount = (text.match(/[A-Za-z]/g) || []).length;
    return arabicCount >= Math.max(2, latinCount * 0.25) ? "rtl" : "auto";
  }

  function applyDirection(el) {
    if (!el || isCodeLike(el) || isInteractive(el)) return;
    const text = (el.innerText || el.textContent || "").trim();
    if (!text) return;
    if (processed.get(el) === text) return;
    processed.set(el, text);

    const direction = classifyText(text);
    if (direction === "rtl") {
      el.dataset.antigravityRtl = "true";
      el.dir = "rtl";
    } else if (ARABIC_RE.test(text) && LATIN_RE.test(text)) {
      el.dataset.antigravityBidi = "auto";
      if (!el.getAttribute("dir")) el.dir = "auto";
    }
  }

  function hasDirectText(el) {
    return Array.from(el.childNodes).some((node) => (
      node.nodeType === Node.TEXT_NODE && ARABIC_RE.test(node.textContent || "")
    ));
  }

  function applyTextLeafDirection(el) {
    if (!el || isCodeLike(el) || isInteractive(el) || !hasDirectText(el)) return;
    applyDirection(el);
  }

  function isolateLatinRuns(el) {
    if (!el?.dataset.antigravityRtl || isCodeLike(el) || isInteractive(el)) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;

    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest(`${CODE_BLOCK_SELECTOR}, [data-antigravity-ltr-run], ${INTERACTIVE_SELECTOR}`)) continue;
      if (LATIN_RE.test(node.textContent || "")) textNodes.push(node);
    }

    const latinRun = /[A-Za-z][A-Za-z0-9._:/\\+@#-]*(?:\s+[A-Za-z][A-Za-z0-9._:/\\+@#-]*)*/g;
    for (const textNode of textNodes) {
      const text = textNode.textContent || "";
      const matches = Array.from(text.matchAll(latinRun));
      if (matches.length === 0) continue;

      const fragment = document.createDocumentFragment();
      let offset = 0;
      for (const match of matches) {
        const index = match.index || 0;
        fragment.append(text.slice(offset, index));
        const trailingPunctuation = match[0].match(/[.,;:!?]+$/)?.[0] || "";
        const latinText = trailingPunctuation
          ? match[0].slice(0, -trailingPunctuation.length)
          : match[0];
        const bdi = document.createElement("bdi");
        bdi.dir = "ltr";
        bdi.dataset.antigravityLtrRun = "true";
        bdi.textContent = latinText;
        fragment.append(bdi);
        fragment.append(trailingPunctuation);
        offset = index + match[0].length;
      }
      fragment.append(text.slice(offset));
      textNode.replaceWith(fragment);
    }
  }

  function applyMarkdownCodeDirection(code) {
    if (!code?.querySelector(".hljs-bullet, .hljs-section, .hljs-strong, .hljs-emphasis")) return;
    const lineContainer = code.firstElementChild;
    if (!lineContainer) return;
    code.dataset.antigravityMarkdown = "true";

    for (const line of lineContainer.children) {
      if (!ARABIC_RE.test(line.textContent || "")) continue;
      line.dir = "rtl";
      line.dataset.antigravityMarkdownRtl = "true";
    }
  }

  function scan(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
    
    if (root.matches && root.matches("textarea, input, [role='textbox'], [role='combobox']")) {
      if (!root.getAttribute("dir")) root.dir = "auto";
    }
    root.querySelectorAll?.("textarea, input, [role='textbox'], [role='combobox']").forEach((el) => {
      if (!el.getAttribute("dir")) el.dir = "auto";
    });

    if (isInteractive(root)) return;
    root.querySelectorAll?.(CODE_BLOCK_SELECTOR).forEach((el) => {
      el.dir = "ltr";
      el.dataset.antigravityCodeLtr = "true";
    });
    if (root.matches && root.matches("code")) applyMarkdownCodeDirection(root);
    root.querySelectorAll?.("code").forEach(applyMarkdownCodeDirection);
    if (root.matches && root.matches(BLOCK_SELECTOR)) applyDirection(root);
    root.querySelectorAll?.(BLOCK_SELECTOR).forEach(applyDirection);
    if (root.matches && root.matches(TEXT_LEAF_SELECTOR)) applyTextLeafDirection(root);
    root.querySelectorAll?.(TEXT_LEAF_SELECTOR).forEach(applyTextLeafDirection);
    if (root.matches && root.matches("[data-antigravity-rtl='true']")) isolateLatinRuns(root);
    root.querySelectorAll?.("[data-antigravity-rtl='true']").forEach(isolateLatinRuns);
  }

  function scheduleScan(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE || isInteractive(root)) return;
    pending.add(root);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const batch = Array.from(pending).slice(0, 25);
      pending.clear();
      batch.forEach(scan);
    });
  }

  ensureStyle();
  scan(document.body);

  if (window.__ANTIGRAVITY_RTL_OBSERVER__) {
    window.__ANTIGRAVITY_RTL_OBSERVER__.disconnect();
  }

  window.__ANTIGRAVITY_RTL_OBSERVER__ = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) scheduleScan(node);
    }
  });

  window.__ANTIGRAVITY_RTL_OBSERVER__.observe(document.body, {
    childList: true,
    subtree: true
  });

  window.__ANTIGRAVITY_RTL_ACTIVE__ = true;
})();
