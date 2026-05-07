// Tiny HTTP server so Fly can verify the machine is alive between manual
// finalize runs. Logs the most recent finalization status from /app/proofs/last-run.json.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8080);
const PROOF_DIR = process.env.PROOF_DIR || "/app/proofs";

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.url === "/status") {
    let body = { ready: true, lastRun: null };
    try {
      const lastFile = path.join(PROOF_DIR, "last-run.json");
      if (fs.existsSync(lastFile)) {
        body.lastRun = JSON.parse(fs.readFileSync(lastFile, "utf8"));
      }
    } catch (err) {
      body = { ready: false, error: String(err) };
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body, null, 2));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`coordinator healthcheck listening on :${PORT}`);
});
