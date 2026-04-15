export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. DATA OPSLAAN (POST)
    if (request.method === "POST") {
      const data = await request.json();
      // We maken een simpele hash van het IP voor unieke bezoekers (zonder IP op te slaan!)
      const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
      const userHash = await b64(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(ip + new Date().toDateString())));

      await env.DB.prepare(
        "INSERT INTO visits (url, referrer, width) VALUES (?, ?, ?)"
      ).bind(data.url, data.ref, data.width).run();
      
      return new Response("OK", { status: 201, headers: { "Access-Control-Allow-Origin": "*" } });
    }

    // 2. BEVEILIGING: Check wachtwoord in de URL (?pwd=jouw_wachtwoord)
    const pwd = url.searchParams.get("pwd");
    if (pwd !== env.ADMIN_PASSWORD) {
      return new Response("Geen toegang. Gebruik ?pwd=wachtwoord", { status: 401 });
    }

    // 3. DATA OPHALEN VOOR DASHBOARD
    const stats = await env.DB.prepare("SELECT url, COUNT(*) as views FROM visits GROUP BY url ORDER BY views DESC").all();
    const timeline = await env.DB.prepare("SELECT DATE(ts) as day, COUNT(*) as counts FROM visits GROUP BY day ORDER BY day ASC").all();

    // 4. HET DASHBOARD (HTML/CSS)
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <title>Mini Analytics</title>
    </head>
    <body class="bg-gray-900 text-white p-8">
      <div class="max-w-4xl mx-auto">
        <h1 class="text-3xl font-bold mb-8 text-blue-400">📊 Stats Dashboard</h1>
        
        <div class="bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
          <canvas id="myChart"></canvas>
        </div>

        <div class="bg-gray-800 p-6 rounded-xl shadow-lg">
          <h2 class="text-xl font-semibold mb-4">Populaire Pagina's</h2>
          <table class="w-full text-left">
            <thead><tr class="border-b border-gray-700 text-gray-400"><th>Pagina</th><th class="text-right">Views</th></tr></thead>
            <tbody>
              ${stats.results.map(r => `<tr class="border-b border-gray-700 leading-10"><td>${r.url}</td><td class="text-right font-mono">${r.views}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <script>
        const ctx = document.getElementById('myChart');
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: ${JSON.stringify(timeline.results.map(r => r.day))},
            datasets: [{
              label: 'Bezoeken per dag',
              data: ${JSON.stringify(timeline.results.map(r => r.counts))},
              borderColor: '#60a5fa',
              backgroundColor: 'rgba(96, 165, 250, 0.2)',
              fill: true,
              tension: 0.3
            }]
          },
          options: { scales: { y: { beginAtZero: true, grid: { color: '#374151' } } } }
        });
      </script>
    </body>
    </html>`;

    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }
};

// Hulpmiddeltje voor de hash
async function b64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}
