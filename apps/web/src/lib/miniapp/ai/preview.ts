/**
 * Server-side preview renderer for generated mini apps.
 *
 * A full in-browser Next.js build is out of scope. Instead, we render the
 * PRIMARY generated screen (app/page.tsx, with any local component files it
 * imports) to static HTML on the server, wrap it in a self-contained document
 * that carries the generated design tokens + Mona Sans + a MOCK Netizen host
 * bridge, and hand that HTML to the builder's sandboxed preview iframe.
 *
 * The mock bridge (injected inline) answers ready()/getContext()/
 * getMuenzenBalance()/grantReward()/track()/wallet.* against mock data, so the
 * reviewer can SEE the app working before publishing.
 *
 * Server-only (uses the TypeScript transpiler + react-dom/server + node vm).
 */
import * as React from "react";
// NOTE: `react-dom/server` is imported DYNAMICALLY inside renderPreview() below.
// Next.js bans a static `react-dom/server` import anywhere in the app/ module
// graph (even server-only lib files) — a top-level import fails the build.
import * as ts from "typescript";
import vm from "node:vm";
import type { MiniAppFilePlan } from "./filePlan";

export interface PreviewResult {
  ok: boolean;
  html: string;
  error?: string;
}

/** Files we know how to render from; everything else (config) is ignored for preview. */
function findFile(plan: Pick<MiniAppFilePlan, "files">, relPath: string): string | undefined {
  const norm = relPath.replace(/^\.?\//, "");
  const match = plan.files.find((f) => f.path.replace(/^\.?\//, "") === norm);
  return match?.content;
}

/** Transpile a TSX/TS source string to CommonJS the vm sandbox can run. */
function transpile(source: string): string {
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React, // classic runtime → React.createElement (React is in scope)
      esModuleInterop: true,
      isolatedModules: true,
    },
    reportDiagnostics: false,
  });
  return out.outputText;
}

/**
 * A minimal module resolver for the sandbox. Generated apps only legitimately
 * import: react, the SDK (mocked to a no-op on the server — the real bridge runs
 * client-side in the iframe), and next/* stubs. Local relative imports are
 * resolved against the file plan.
 */
function makeRequire(
  plan: Pick<MiniAppFilePlan, "files">,
  cache: Map<string, unknown>,
  fromPath: string,
) {
  return function req(spec: string): unknown {
    if (spec === "react") return React;
    if (spec === "react/jsx-runtime" || spec === "react/jsx-dev-runtime")
      // classic jsx emit doesn't use these, but guard anyway
      return React;
    if (spec === "react-dom" || spec === "react-dom/client") return {};

    // The SDK: on the SERVER preview render we stub it. The interactive bridge
    // (ready/getContext/rewards) runs in the iframe via the injected mock below.
    if (spec === "@netizen-labs/miniapp-sdk") return serverSdkStub();

    // next/* stubs — enough to render a static screen.
    if (spec === "next/font/local") return () => ({ variable: "", className: "" });
    if (spec === "next/link")
      return {
        default: (props: Record<string, unknown>) =>
          React.createElement("a", { href: (props.href as string) ?? "#", ...props }, props.children as React.ReactNode),
      };
    if (spec === "next/image")
      return {
        default: (props: Record<string, unknown>) =>
          React.createElement("img", { ...props, alt: (props.alt as string) ?? "" }),
      };
    if (spec.startsWith("next/")) return {};

    // Relative import → resolve against the plan.
    if (spec.startsWith(".") || spec.startsWith("/")) {
      const resolved = resolveRelative(fromPath, spec);
      const source = findSource(plan, resolved);
      if (source == null) {
        throw new Error(`preview: cannot resolve import "${spec}" from "${fromPath}"`);
      }
      return evalModule(plan, cache, resolved.path, source);
    }

    // Unknown bare import — return an empty module so a stray util import doesn't crash.
    return {};
  };
}

/**
 * Server-side SDK stub used during the static render. Returns rich MOCK data
 * (a citizen user, a 48 RÖ balance) so the first paint of the generated screen
 * already looks populated — the reviewer sees a working app, not empty slots.
 * The identical mock is also served client-side by the injected iframe bridge
 * (below), so an app that re-fetches on mount stays consistent.
 */
function serverSdkStub() {
  const noop = async () => undefined;
  const mockUser = { id: "vorschau", displayName: "Test-Bürger:in", isCitizen: true };
  const mockBalance = { balance: "48.00", decimals: 2, symbol: "RÖ" as const };
  const sdk = {
    isReady: Promise.resolve(),
    actions: { ready: noop, close: noop, openUrl: noop, share: noop, addMiniApp: async () => ({ added: true }) },
    getContext: async () => ({
      user: mockUser,
      host: { name: "Röbel (Vorschau)", platform: "web" as const, version: "0" },
      safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
      launch: { entry: "preview" },
    }),
    wallet: {
      getEthereumProvider: async () => ({ request: noop, on: noop, removeListener: noop }),
      getAccount: async () => ({ address: "0x0000000000000000000000000000000000000000", chainId: 100 }),
    },
    auth: { getToken: async () => ({ token: "preview.mock.token" }), signIn: async () => ({ token: "preview.mock.token" }) },
    haptics: { impact: noop, notification: noop, selection: noop },
    roebel: {
      getMuenzenBalance: async () => mockBalance,
      grantReward: async () => ({ granted: true, txRef: "preview-tx", remainingBudget: 0 }),
      pay: async () => ({ txHash: "0xpreview" }),
    },
    notifications: { send: async () => ({ sent: true }) },
    track: () => {},
    on: () => () => {},
  };
  return { sdk, createClient: () => sdk };
}

interface ResolvedRef {
  path: string;
  candidates: string[];
}

function resolveRelative(fromPath: string, spec: string): ResolvedRef {
  const dir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  // POSIX-ish join + normalize (no node:path to keep it plan-relative).
  const parts = (dir ? dir.split("/") : []).concat(spec.split("/"));
  const stack: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  const base = stack.join("/");
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.jsx`,
    `${base}.js`,
    `${base}/index.tsx`,
    `${base}/index.ts`,
  ];
  return { path: base, candidates };
}

function findSource(plan: Pick<MiniAppFilePlan, "files">, ref: ResolvedRef): string | null {
  for (const c of ref.candidates) {
    const src = findFile(plan, c);
    if (src != null) return src;
  }
  return null;
}

/** Evaluate a transpiled module in a shared vm sandbox; memoized by path. */
function evalModule(
  plan: Pick<MiniAppFilePlan, "files">,
  cache: Map<string, unknown>,
  modulePath: string,
  source: string,
): unknown {
  if (cache.has(modulePath)) return cache.get(modulePath);

  const transpiled = transpile(stripDirectives(source));
  const module = { exports: {} as Record<string, unknown> };
  const sandbox: Record<string, unknown> = {
    module,
    exports: module.exports,
    require: makeRequire(plan, cache, modulePath),
    React,
    console,
    process: { env: {} },
  };
  cache.set(modulePath, module.exports); // set before running to tolerate cycles

  const context = vm.createContext(sandbox);
  const script = new vm.Script(transpiled, { filename: modulePath });
  script.runInContext(context, { timeout: 3000 });

  cache.set(modulePath, module.exports);
  return module.exports;
}

/** Remove "use client"/"use server" directives (meaningless in this render). */
function stripDirectives(src: string): string {
  return src.replace(/^\s*["']use (client|server)["'];?\s*/m, "");
}

/**
 * Render the generated app's primary screen to a self-contained HTML document.
 * Wraps it in the generated design tokens + Mona Sans (Google Fonts fallback so
 * the srcdoc iframe still reads on-brand without the woff2 assets) + the mock
 * host bridge.
 */
export async function renderPreview(plan: Pick<MiniAppFilePlan, "files">): Promise<PreviewResult> {
  // Dynamic import keeps `react-dom/server` out of the static app/ graph (Next ban).
  const { renderToStaticMarkup } = await import("react-dom/server");

  const pageSource = findFile(plan, "app/page.tsx") ?? findFile(plan, "app/page.jsx");
  if (!pageSource) {
    return { ok: false, html: fallbackDoc("Keine app/page.tsx gefunden."), error: "no_page" };
  }

  const globalsCss = findFile(plan, "app/globals.css") ?? "";

  let bodyHtml: string;
  try {
    const cache = new Map<string, unknown>();
    const mod = evalModule(plan, cache, "app/page.tsx", pageSource) as Record<string, unknown>;
    const Component =
      (mod.default as React.ComponentType | undefined) ??
      (Object.values(mod).find((v) => typeof v === "function") as React.ComponentType | undefined);
    if (!Component) {
      return { ok: false, html: fallbackDoc("app/page.tsx hat keinen Default-Export."), error: "no_default_export" };
    }
    bodyHtml = renderToStaticMarkup(React.createElement(Component));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, html: fallbackDoc(`Vorschau-Render-Fehler:\n${msg}`), error: msg };
  }

  return { ok: true, html: previewDoc(bodyHtml, globalsCss) };
}

/** Only design-token CSS from the generated globals.css survives (drop @import/@tailwind). */
function extractTokenCss(globalsCss: string): string {
  // Keep :root / @theme blocks and @media(prefers-color-scheme) so tokens resolve;
  // strip Tailwind's @import "tailwindcss" (we ship our own utility shim below).
  return globalsCss
    .replace(/@import\s+["']tailwindcss["'];?/g, "")
    .replace(/@tailwind[^;]*;/g, "");
}

/** A tiny Tailwind-shim so the common token utility classes render in the srcdoc. */
const UTILITY_SHIM = `
:root{--color-primary:#00498b;--color-primary-foreground:#fff;--color-background:#fff;--color-card:#f7f7f7;--color-foreground:#000;--color-muted:#f0f0f0;--color-muted-foreground:#6b7280;--color-border:#b4b8c1;--radius:10px}
@media (prefers-color-scheme:dark){:root{--color-primary:#7abbf2;--color-background:#202124;--color-card:#3c4043;--color-foreground:#e8eaed;--color-muted-foreground:#9aa0a6;--color-border:#3c4043}}
*{box-sizing:border-box}
body{margin:0;font-family:'Mona Sans',system-ui,-apple-system,sans-serif;background:var(--color-background);color:var(--color-foreground);-webkit-font-smoothing:antialiased}
img{max-width:100%}
.min-h-dvh{min-height:100dvh}.min-h-screen{min-height:100vh}
.bg-background{background:var(--color-background)}.bg-card{background:var(--color-card)}.bg-primary{background:var(--color-primary)}.bg-muted{background:var(--color-muted)}
.text-foreground{color:var(--color-foreground)}.text-muted-foreground{color:var(--color-muted-foreground)}.text-primary{color:var(--color-primary)}.text-primary-foreground{color:var(--color-primary-foreground)}.text-white{color:#fff}
.border{border-width:1px;border-style:solid}.border-border{border-color:var(--color-border)}
.rounded-\\[10px\\]{border-radius:10px}.rounded-\\[14px\\]{border-radius:14px}.rounded-lg{border-radius:10px}.rounded-full{border-radius:9999px}
.p-2{padding:.5rem}.p-3{padding:.75rem}.p-4{padding:1rem}.p-5{padding:1.25rem}.p-6{padding:1.5rem}.px-3{padding-left:.75rem;padding-right:.75rem}.px-4{padding-left:1rem;padding-right:1rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}.py-3{padding-top:.75rem;padding-bottom:.75rem}
.m-0{margin:0}.mt-1{margin-top:.25rem}.mt-2{margin-top:.5rem}.mt-4{margin-top:1rem}.mt-6{margin-top:1.5rem}.mb-2{margin-bottom:.5rem}.mb-4{margin-bottom:1rem}.mx-auto{margin-left:auto;margin-right:auto}
.flex{display:flex}.grid{display:grid}.hidden{display:none}.block{display:block}.inline-flex{display:inline-flex}
.flex-col{flex-direction:column}.items-center{align-items:center}.items-start{align-items:flex-start}.justify-between{justify-content:space-between}.justify-center{justify-content:center}
.gap-1{gap:.25rem}.gap-2{gap:.5rem}.gap-3{gap:.75rem}.gap-4{gap:1rem}
.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.w-full{width:100%}.h-full{height:100%}.max-w-md{max-width:28rem}.max-w-full{max-width:100%}
.text-xs{font-size:.75rem}.text-sm{font-size:.875rem}.text-base{font-size:1rem}.text-lg{font-size:1.125rem}.text-xl{font-size:1.25rem}.text-2xl{font-size:1.5rem}.text-3xl{font-size:1.875rem}
.font-medium{font-weight:500}.font-semibold{font-weight:600}.font-bold{font-weight:700}
.tabular-nums{font-variant-numeric:tabular-nums}
.text-center{text-align:center}
.gap-y-2>*+*{margin-top:.5rem}.space-y-2>*+*{margin-top:.5rem}.space-y-3>*+*{margin-top:.75rem}.space-y-4>*+*{margin-top:1rem}
h1,h2,h3,h4{font-family:'Mona Sans',system-ui,sans-serif;font-stretch:87.5%;margin:0 0 .5rem}
`;

function previewDoc(body: string, globalsCss: string): string {
  const tokenCss = extractTokenCss(globalsCss);
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<style>${UTILITY_SHIM}\n${tokenCss}</style>
</head>
<body>
<div id="__mini_root">${body}</div>
${mockBridgeScript()}
</body>
</html>`;
}

/**
 * The MOCK host bridge, injected into the preview iframe. It listens on the
 * netizen postMessage protocol and answers every method with mock data so the
 * generated app's SDK calls resolve. Interactive re-renders aren't wired (this
 * is a static-screen preview), but ready()/track()/rewards()/wallet() all
 * settle so the app's mount logic completes without errors.
 */
function mockBridgeScript(): string {
  return `<script>
(function(){
  var NETIZEN=1;
  var mockUser={id:"vorschau",displayName:"Test-Bürger:in",isCitizen:true};
  var balance={balance:"48.00",decimals:2,symbol:"RÖ"};
  function reply(id,result,error){
    var msg={netizen:NETIZEN,id:id};
    if(error){msg.error=error;}else{msg.result=result;}
    window.postMessage(msg,"*"); // loopback: the SDK listens on window 'message'
  }
  window.addEventListener("message",function(ev){
    var m=ev.data;
    if(!m||m.netizen!==NETIZEN||!m.method)return;
    switch(m.method){
      case "bridge.hello": return reply(m.id,{ok:true});
      case "actions.ready": return reply(m.id,undefined);
      case "actions.close": case "actions.openUrl": case "actions.share": return reply(m.id,undefined);
      case "actions.addMiniApp": return reply(m.id,{added:true});
      case "context.get": return reply(m.id,{user:mockUser,host:{name:"Röbel (Vorschau)",platform:"web",version:"0"},safeAreaInsets:{top:0,bottom:0,left:0,right:0},launch:{entry:"preview"}});
      case "wallet.getAccount": return reply(m.id,{address:"0x0000000000000000000000000000000000000000",chainId:100});
      case "wallet.request": return reply(m.id,null);
      case "auth.getToken": return reply(m.id,{token:"preview.mock.token"});
      case "auth.signIn": return reply(m.id,{token:"preview.mock.token"});
      case "haptics.impact": case "haptics.notification": case "haptics.selection": return reply(m.id,undefined);
      case "roebel.getMuenzenBalance": return reply(m.id,balance);
      case "roebel.grantReward": return reply(m.id,{granted:true,txRef:"preview-tx",remainingBudget:0});
      case "roebel.pay": return reply(m.id,{txHash:"0xpreview"});
      case "notifications.send": return reply(m.id,{sent:true});
      case "analytics.track": return; // fire-and-forget, no reply
      default: return reply(m.id,undefined,{code:"unsupported",message:"preview: "+m.method});
    }
  });
})();
</script>`;
}

function fallbackDoc(message: string): string {
  const safe = message.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#fff;color:#111;padding:16px}pre{white-space:pre-wrap;background:#f7f7f7;border:1px solid #b4b8c1;border-radius:10px;padding:12px;font-size:12px;color:#dc2626}</style></head>
<body><p style="color:#6b7280;font-size:13px">Vorschau noch nicht bereit</p><pre>${safe}</pre></body></html>`;
}
