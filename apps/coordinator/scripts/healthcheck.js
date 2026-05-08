// Tiny HTTP server for the coordinator machine.
//
// Routes:
//   GET  /healthz          — Fly liveness probe.
//   GET  /status           — last finalize run + last scan + pending pollIds.
//                            Read-only, no auth.
//   POST /finalize-pending — kicks scan-and-finalize.js as a child process.
//                            Auth via X-Finalize-Token (FINALIZE_TOKEN secret).
//                            Returns 202 immediately; result lands in
//                            /app/proofs/last-scan.json.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT || 8080);
const PROOF_DIR = process.env.PROOF_DIR || "/app/proofs";
const FINALIZE_TOKEN = process.env.FINALIZE_TOKEN || "";

let scanInFlight = false;

function readJsonSafe(filename) {
  const p = path.join(PROOF_DIR, filename);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function ok(res, body) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}

function deny(res, code, msg) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: msg }));
}

function startScan() {
  if (scanInFlight) return false;
  scanInFlight = true;
  const child = spawn("node", [path.join(__dirname, "scan-and-finalize.js")], {
    stdio: "inherit",
    env: process.env,
    detached: false,
  });
  child.on("exit", (code) => {
    console.log(`[finalize-pending] scan exited with ${code}`);
    scanInFlight = false;
  });
  return true;
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "GET" && req.url === "/status") {
    return ok(res, {
      ready: true,
      scanInFlight,
      lastRun: readJsonSafe("last-run.json"),
      lastScan: readJsonSafe("last-scan.json"),
    });
  }

  if (req.method === "POST" && req.url === "/finalize-pending") {
    const supplied = req.headers["x-finalize-token"];
    if (!FINALIZE_TOKEN) {
      return deny(res, 503, "FINALIZE_TOKEN not configured on server");
    }
    if (supplied !== FINALIZE_TOKEN) {
      return deny(res, 401, "invalid token");
    }
    if (scanInFlight) {
      res.writeHead(202, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ accepted: false, reason: "scan already running" }));
    }
    startScan();
    res.writeHead(202, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ accepted: true, startedAt: new Date().toISOString() }));
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`coordinator healthcheck listening on :${PORT}`);
  if (!FINALIZE_TOKEN) {
    console.warn("WARNING: FINALIZE_TOKEN unset — POST /finalize-pending will reject.");
  }
});
