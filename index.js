export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cookieHeader = request.headers.get("Cookie") || "";
    
    // 1. DATA OPSLAAN (Voor je website) - blijft hetzelfde
    if (request.method === "POST") {
      const data = await request.json();
      const ip = request.headers.get("cf-connecting-ip") || "Unknown";
      const country = request.cf?.country || "Unknown";
      const browser = request.headers.get("user-agent") || "Unknown";

      await env.DB.prepare(
        "INSERT INTO visits (url, referrer, width, country, ip, browser) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(data.url, data.ref, data.width, country, ip, browser).run();
      
      return new Response("OK", { status: 201, headers: { "Access-Control-Allow-Origin": "*" } });
    }

    // 2. AUTHENTICATIE CHECK
    // We kijken of het wachtwoord in de URL staat OF in de cookie
    const urlPwd = url.searchParams.get("login_pwd");
    const hasCookie = cookieHeader.includes(`auth=${env.ADMIN_PASSWORD}`);
    const isLoggingIn = urlPwd === env.ADMIN_PASSWORD;

    if (!hasCookie && !isLoggingIn) {
      return new Response(`
        <html>
          <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
          <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#000;color:#fff;font-family:sans-serif;margin:0;">
            <form action="/" method="GET" style="background:#111;padding:2rem;border-radius:15px;border:1px solid #333;text-align:center;">
              <h2 style="color:#3b82f6;">📈 Analytics Login</h2>
              <input type="password" name="login_pwd" placeholder="Wachtwoord" style="padding:12px;border-radius:8px;border:1px solid #444;background:#222;color:#fff;margin-bottom:15px;width:100%;box-sizing:border-box;">
              <button type="submit" style="padding:12px;width:100%;background:#3b82f6;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">Dashboard Openen</button>
            </form>
          </body>
        </html>`, { headers: { "Content-Type": "text/html" } });
    }

    // Als we hier komen, is de gebruiker ingelogd. 
    // We sturen de cookie mee voor de volgende keer.
    const headers = { "Content-Type": "text/html" };
    if (isLoggingIn) {
      headers["Set-Cookie"] = `auth=${env.ADMIN_PASSWORD}; Path=/; HttpOnly; Max-Age=604800; SameSite=Lax`;
    }

    // 3. DATA OPHALEN
    const stats = await env.DB.prepare("SELECT url, COUNT(*) as views FROM visits GROUP BY url ORDER BY views DESC").all();
    const countries = await env.DB.prepare("SELECT country, COUNT(*) as count FROM visits GROUP BY country ORDER BY count DESC LIMIT 5").all();
    const timeline = await env.DB.prepare("SELECT DATE(ts) as day, COUNT(*) as counts FROM visits GROUP BY day ORDER BY day ASC").all();

    // 4. HET DASHBOARD (Dashboard HTML code hieronder...)
    const html = `<!DOCTYPE html><html lang="nl"><head><script src="https://cdn.tailwindcss.com"></script><script src="https://cdn.jsdelivr.net/npm/chart.js"></script><title>Pro Analytics</title></head>
    <body class="bg-gray-950 text-gray-100 p-4 md:p-10"><div class="max-w-6xl mx-auto">
    <div class="flex justify-between items-center mb-10"><h1 class="text-3xl font-bold text-blue-500">📈 Pro Analytics</h1><a href="/" class="text-xs text-gray-500 italic">Vernieuwen</a></div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"><div class="bg-gray-900 p-6 rounded-2xl border border-gray-800 md:col-span-2"><canvas id="mainChart"></canvas></div>
    <div class="bg-gray-900 p-6 rounded-2xl border border-gray-800"><h3 class="text-gray-400 mb-4 uppercase text-xs font-bold">Top Landen</h3>
    ${countries.results.map(c => `<div class="flex justify-between mb-2"><span>\${c.country}</span><span class="font-mono text-blue-400">\${c.count}</span></div>`).join('')}</div></div>
    <div class="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden"><table class="w-full text-left"><thead class="bg-gray-800 text-gray-400 text-sm"><tr><th class="p-4">Pagina</th><th class="p-4 text-right">Views</th></tr></thead><tbody>
    ${stats.results.map(r => `<tr class="border-t border-gray-800"><td class="p-4 text-blue-300">\${r.url}</td><td class="p-4 text-right font-mono">\${r.views}</td></tr>`).join('')}
    </tbody></table></div></div>
    <script>
      new Chart(document.getElementById('mainChart'), {
        type: 'line',
        data: {
          labels: ${JSON.stringify(timeline.results.map(r => r.day))},
          datasets: [{ label: 'Bezoekers', data: ${JSON.stringify(timeline.results.map(r => r.counts))}, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.4 }]
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#222' } }, x: { grid: { display: false } } } }
      });
    </script></body></html>`;

    return new Response(html, { headers: headers });
  }
};
