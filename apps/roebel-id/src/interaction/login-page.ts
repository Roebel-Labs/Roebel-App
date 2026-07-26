// Minimal German login page: connects a thirdweb in-app wallet in the browser, signs a SIWE
// message over the nonce this uid issued, and posts the result back to finish the interaction.
//
// IMPORTANT: the SIWE `statement` field must be plain ASCII — siwe v3 parses/serializes EIP-4361
// messages and rejects non-ASCII characters (confirmed in Task 2's verify-siwe work). The umlaut
// in "Röbel" breaks real signing, so the statement uses "Roebel" while all visible page copy is
// free to keep proper German spelling.
export function renderLoginPage(uid: string, thirdwebClientId: string, chainId: number): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Bei Röbel anmelden</title>
<style>body{font-family:system-ui;background:#fff;color:#00498B;display:grid;place-items:center;height:100vh;margin:0}
button{background:#00498B;color:#fff;border:0;border-radius:12px;padding:14px 22px;font-size:16px;cursor:pointer}</style>
</head><body>
<main style="text-align:center;max-width:360px">
  <h1>Röbel ID</h1>
  <p>Melde dich mit deiner Röbel-Identität an, um fortzufahren.</p>
  <button id="login">Mit Röbel anmelden</button>
  <p id="status" style="color:#6B7280;font-size:14px"></p>
</main>
<script type="module">
  import { createThirdwebClient } from 'https://esm.sh/thirdweb@5'
  import { inAppWallet } from 'https://esm.sh/thirdweb@5/wallets'
  import { SiweMessage } from 'https://esm.sh/siwe@3'
  const client = createThirdwebClient({ clientId: '${thirdwebClientId}' })
  const status = document.getElementById('status')
  document.getElementById('login').onclick = async () => {
    try {
      status.textContent = 'Verbinde…'
      const wallet = inAppWallet({ smartAccount: { chain: { id: ${chainId} }, sponsorGas: true } })
      const account = await wallet.connect({ client, strategy: 'iframe' })
      const nonce = await (await fetch('/interaction/${uid}/nonce')).then(r => r.text())
      const message = new SiweMessage({ domain: location.host, address: account.address, uri: location.origin,
        version: '1', chainId: ${chainId}, nonce, statement: 'Anmeldung bei Roebel ID',
        expirationTime: new Date(Date.now()+120000).toISOString() }).prepareMessage()
      const signature = await account.signMessage({ message })
      const res = await fetch('/interaction/${uid}/login', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, signature }) })
      if (res.redirected) location.href = res.url
      else { const j = await res.json(); location.href = j.redirectTo }
    } catch (e) { status.textContent = 'Anmeldung fehlgeschlagen: ' + e.message }
  }
</script>
</body></html>`
}
