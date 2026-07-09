import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import WebSocket from "ws";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const port = Number(portArg?.split("=")[1] || process.env.ANTIGRAVITY_RTL_PORT || 9230);

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("ANTIGRAVITY_RTL_PORT must be an integer between 1024 and 65535.");
}

const css = readFileSync(resolve(root, "src", "rtl-style.css"), "utf8");
const injected = readFileSync(resolve(root, "src", "injected.js"), "utf8");

if (dryRun) {
  if (!css.includes("unicode-bidi") || !injected.includes("MutationObserver")) {
    throw new Error("RTL assets look incomplete.");
  }
  console.log("OK: RTL assets are present.");
  process.exit(0);
}

const endpoint = `http://127.0.0.1:${port}/json`;

async function getTargets() {
  let response;
  try {
    response = await fetch(endpoint);
  } catch (error) {
    throw new Error(`Cannot reach ${endpoint}. Start Antigravity with desktop/Launch-AntigravityRTL.ps1 first.`);
  }
  if (!response.ok) {
    throw new Error(`DevTools endpoint returned HTTP ${response.status}.`);
  }
  return response.json();
}

function isLikelyAntigravityTarget(target) {
  const url = target.url || "";
  const title = target.title || "";
  const haystack = `${title} ${url}`.toLowerCase();
  
  return target.webSocketDebuggerUrl && (
    url.startsWith("https://127.0.0.1:") ||
    url.startsWith("http://127.0.0.1:") ||
    url.startsWith("https://localhost:") ||
    url.startsWith("http://localhost:") ||
    url.includes("app://") ||
    haystack.includes("antigravity") ||
    haystack.includes("codex") ||
    haystack.includes("chatgpt.com")
  ) && !title.includes("Loading Antigravity");
}

function assertLocalDevToolsUrl(wsUrl) {
  const url = new URL(wsUrl);
  if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname)) {
    throw new Error(`Refusing non-local DevTools target: ${url.hostname}`);
  }
}

function evaluate(wsUrl, expression) {
  assertLocalDevToolsUrl(wsUrl);
  return new Promise((resolvePromise, rejectPromise) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    const timeout = setTimeout(() => {
      ws.close();
      rejectPromise(new Error("Timed out while injecting CSS."));
    }, 8000);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: {
          expression,
          awaitPromise: false,
          returnByValue: true
        }
      }));
    });

    ws.on("message", (data) => {
      const message = JSON.parse(String(data));
      if (message.id !== id) return;
      clearTimeout(timeout);
      ws.close();
      if (message.error || message.result?.exceptionDetails) {
        rejectPromise(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
      } else {
        resolvePromise(message.result);
      }
    });

    ws.on("error", (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
  });
}

const expression = `
(() => {
  window.__ANTIGRAVITY_RTL_STYLE__ = ${JSON.stringify(css)};
  const source = ${JSON.stringify(injected)};
  (0, eval)(source);
  return Boolean(window.__ANTIGRAVITY_RTL_ACTIVE__);
})()
`;

async function run() {
  const maxAttempts = 30;
  const delayMs = 1000;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const targets = await getTargets();
      const candidates = targets.filter(isLikelyAntigravityTarget);
      
      if (candidates.length > 0) {
        for (const target of candidates) {
          await evaluate(target.webSocketDebuggerUrl, expression);
          console.log(`Injected RTL fix into: ${target.title || target.url} (Attempt ${attempt})`);
        }
        return;
      }
    } catch (e) {
      // Ignore network errors during app startup
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw new Error("No Antigravity renderer target found after 30 seconds. Ensure Antigravity is open and loaded.");
}

await run();
