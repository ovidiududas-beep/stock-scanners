import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type YahooAuth = { cookie: string; crumb: string; at: number };
let yahooAuth: YahooAuth | null = null;

async function getYahooAuth(force = false): Promise<YahooAuth> {
  if (!force && yahooAuth && Date.now() - yahooAuth.at < 25 * 60 * 1000) {
    return yahooAuth;
  }
  const fc = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    redirect: "manual",
  });
  const cookie = (fc.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  const crumbRes = await fetch(
    "https://query1.finance.yahoo.com/v1/test/getcrumb",
    { headers: { "User-Agent": UA, Cookie: cookie } },
  );
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.startsWith("{") || crumb.includes(" ")) {
    throw new Error("Yahoo crumb unavailable");
  }
  yahooAuth = { cookie, crumb, at: Date.now() };
  return yahooAuth;
}

function yahooTarget(incomingPath: string): URL | null {
  const incoming = new URL(incomingPath, "http://localhost");
  const path = incoming.pathname;
  let target: URL;
  if (path === "/yahoo/v7/finance/quote") {
    target = new URL("https://query1.finance.yahoo.com/v7/finance/quote");
  } else {
    const m = path.match(
      /^\/yahoo\/(v10|v11)\/finance\/quoteSummary\/([^/]+)$/,
    );
    if (!m) return null;
    target = new URL(
      `https://query1.finance.yahoo.com/${m[1]}/finance/quoteSummary/${m[2]}`,
    );
  }
  incoming.searchParams.forEach((value, key) => {
    if (key !== "crumb") target.searchParams.set(key, value);
  });
  return target;
}

async function yahooAuthedFetch(incomingPath: string): Promise<Response> {
  const target = yahooTarget(incomingPath);
  if (!target) throw new Error("Yahoo path invalid");
  const run = async (auth: YahooAuth) => {
    target.searchParams.set("crumb", auth.crumb);
    return fetch(target, {
      headers: { "User-Agent": UA, Cookie: auth.cookie },
    });
  };
  let res = await run(await getYahooAuth());
  if (res.status === 401) res = await run(await getYahooAuth(true));
  return res;
}

function attachYahooQuote(server: ViteDevServer) {
  server.middlewares.use(
    async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const url = req.url ?? "";
      if (!yahooTarget(url.split("?")[0] ?? url)) {
        next();
        return;
      }
      try {
        const y = await yahooAuthedFetch(url);
        const body = await y.text();
        res.statusCode = y.status;
        res.setHeader("Content-Type", "application/json");
        res.end(body);
      } catch (err) {
        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : "Yahoo quote failed",
          }),
        );
      }
    },
  );
}

function yahooQuotePlugin(): Plugin {
  return {
    name: "yahoo-quote-crumb",
    configureServer(server) {
      attachYahooQuote(server);
    },
    configurePreviewServer(server) {
      attachYahooQuote(server);
    },
  };
}

export default defineConfig({
  plugins: [react(), yahooQuotePlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/yahoo": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yahoo/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("User-Agent", UA);
          });
        },
      },
    },
  },
});
