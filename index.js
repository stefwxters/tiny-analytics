export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cookieHeader = request.headers.get("Cookie") || "";

    // 1. DATA OPSLAAN (Voor je website)
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

    // 2. LOGIN LOGICA (Wachtwoord checken)
    if (url.searchParams.has("login_pwd")) {
      if (url.searchParams.get("login_pwd") === env.ADMIN_PASSWORD) {
        return new Response("Inloggen...", {
          status: 302,
          headers: { 
            "Set-Cookie": `auth=${env.ADMIN_PASSWORD}; Path=/; HttpOnly; Max-Age=604800`,
            "Location": url.origin
          }
        });
      }
    }

    // 3. AUTHENTICATIE CHECK (Heb je de cookie?)
    const isLoggedIn = cookieHeader.includes(`auth=${env.ADMIN_PASSWORD}`);
    if (!isLoggedIn) {
      return new Response(`
        <html>
          <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#111;color:#fff;font-family:sans-serif;">
            <form action="/" method="GET" style="background:#222;padding:2rem;border-radius:10px;">
              <h2>Inloggen</h2>
              <input type="password" name="login_pwd" placeholder="Wachtwoord" style="padding:10px;border-radius:5px;border:none;">
              <button type="submit" style="padding:10px;background:#3b82f6;color:white;border:none;border-radius:5px;cursor:pointer;">Enter</button>
            </form>
          </body>
        </html>`, { headers: { "Content-Type": "text/html" } });
    }

    // 4. DATA OPHALEN VOOR DASHBOARD
    const stats = await env.DB.prepare("SELECT url, COUNT(*) as views FROM visits GROUP BY url ORDER BY views DESC").all();
    const countries = await env.DB.prepare("SELECT country, COUNT(*) as count FROM visits GROUP BY country ORDER BY count DESC LIMIT 5").all();
    const timeline = await env.DB.prepare("SELECT DATE(ts) as day, COUNT(*) as counts FROM visits GROUP BY day ORDER BY day ASC").all();

    // 5. HET DASHBOARD
    const html = `
    <!DOCTYPE html>
    <html lang="nl">
    <head>
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <title>Pro Analytics</title>
    </head>
    <body class="bg-gray-950 text-gray-100 p-4 md:p-10">
      <div class="max-w-6xl mx-auto">
        <div class="flex justify-between items-center mb-10">
          <h1 class="text-3xl font-bold text-blue-500">📈 Pro Analytics</h1>
          <span class="bg-green-900 text-green-300 px-3 py-1 rounded-full text-sm">Live</span>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div class="bg-gray-900 p-6 rounded-2xl border border-gray-800 md:col-span-2">
            <canvas id="mainChart"></canvas>
          </div>
          <div class="bg-gray-900 p-6 rounded-2xl border border-gray-800">
            <h3 class="text-gray-400 mb-4 uppercase text-xs font-bold">Top Landen</h3>
            ${countries.results.map(c => `
              <div class="flex justify-between mb-2">
                <span>${c.country}</span>
                <span class="font-mono text-blue-400">${c.count}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <table class="w-full text-left">
            <thead class="bg-gray-800 text-gray-400 text-sm">
              <tr><th class="p-4">Pagina</th><th class="p-4 text-right">Views</th></tr>
            </thead>
            <tbody>
              ${stats.results.map(r => `
                <tr class="border-t border-gray-800">
                  <td class="p-4 text-blue-300">${r.url}</td>
                  <td class="p-4 text-right font-mono">${r.views}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <script>
        new Chart(document.getElementById('mainChart'), {
          type: 'line',
          data: {
            labels: ${JSON.stringify(timeline.results.map(r => r.day))},
            datasets: [{
              label: 'Bezoekers',
              data: ${JSON.stringify(timeline.results.map(r => r.counts))},
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              fill: true, tension: 0.4
            }]
          },
          options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#222' } }, x: { grid: { display: false } } } }
        });
      </script>
    </body>
    </html>`;

    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }
};
