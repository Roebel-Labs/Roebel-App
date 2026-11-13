// "In Ortis öffnen" from the assistant's mails. Mail clients drop custom URL
// schemes, so the link points here and this page hands over to the desktop app.
export const dynamic = "force-static";

const HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ortis öffnen</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#151613;color:#fafaf9;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:420px;padding:24px;text-align:center}img{width:72px;height:72px;border-radius:14px}
h1{font-size:20px;margin:16px 0 6px}p{color:#919086;margin:0 0 20px}
a.btn{display:inline-block;background:#3a8872;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600}
</style></head><body><main><img src="/mascot/mecky-mail.png" alt=""><h1>Ortis wird geöffnet …</h1>
<p>Wenn nichts passiert, ist Ortis Studio auf diesem Gerät noch nicht installiert.</p>
<a class="btn" href="ortis-studio://open">Ortis öffnen</a></main>
<script>setTimeout(function(){location.href="ortis-studio://open"},150)</script></body></html>`;

export function GET() {
  return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
