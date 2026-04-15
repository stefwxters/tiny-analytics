export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cookieHeader = request.headers.get('Cookie') || '';
    const origin = request.headers.get('Origin');

    // --- ROUTE 1: DATA OPSLAAN (POST) ---
    if (request.method === 'POST') {
      const isAllowed = origin && origin.includes(env.ALLOWED_DOMAIN);
      if (!isAllowed) { return new Response('Niet toegestaan', { status: 403 }); }
      try {
        const data = await request.json();
        const ip = request.headers.get('cf-connecting-ip') || 'Unknown';
        const country = request.cf?.country || 'Unknown';
        const userAgent = request.headers.get('user-agent') || 'Unknown';
        let browser = 'Anders';
        if (userAgent.includes('Chrome')) browser = 'Chrome';
        else if (userAgent.includes('Firefox')) browser = 'Firefox';
        else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
        await env.DB.prepare('INSERT INTO visits (url, referrer, width, country, ip, browser) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(data.url, data.ref, data.width, country, ip, browser).run();
        return new Response('OK', { status: 201, headers: { 'Access-Control-Allow-Origin': origin } });
      } catch (e) { return new Response('Error', { status: 500 }); }
    }

    // --- ROUTE 2: AUTHENTICATIE ---
    const expectedPwd = String(env.ADMIN_PASSWORD).trim();
    const inputPwd = (url.searchParams.get('login_pwd') || '').trim();
    const hasValidCookie = cookieHeader.includes('auth=' + expectedPwd);
    const isLoggingIn = inputPwd === expectedPwd || decodeURIComponent(inputPwd) === expectedPwd;

    if (!hasValidCookie && !isLoggingIn) {
      return new Response('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#000;color:#fff;font-family:sans-serif;margin:0;"><form action="/" method="GET" style="background:#111;padding:2rem;border-radius:15px;border:1px solid #333;width:300px;text-align:center;"><h2 style="color:#3b82f6;">📊 Analytics Login</h2><input type="password" name="login_pwd" placeholder="Wachtwoord" style="padding:12px;border-radius:8px;border:1px solid #444;background:#222;color:#fff;margin-bottom:15px;width:100%;box-sizing:border-box;"><button type="submit" style="padding:12px;width:100%;background:#3b82f6;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">Login</button></form></body></html>', { headers: { 'Content-Type': 'text/html' } });
    }

    // --- ROUTE 3: DATA OPHALEN ---
    // Statistieken (Net als kaarten in Image 1)
    const { totalViews } = await env.DB.prepare('SELECT COUNT(*) as totalViews FROM visits').first();
    const { uniqueUsers } = await env.DB.prepare('SELECT COUNT(DISTINCT ip) as uniqueUsers FROM visits').first();
    const topPage = await env.DB.prepare('SELECT url, COUNT(*) as count FROM visits GROUP BY url ORDER BY count DESC LIMIT 1').first() || { url: 'N/A', count: 0 };
    const topCountry = await env.DB.prepare('SELECT country, COUNT(*) as count FROM visits GROUP BY country ORDER BY count DESC LIMIT 1').first() || { country: 'N/A', count: 0 };

    // Tijdlijn (Grafiek)
    const timeline = await env.DB.prepare('SELECT DATE(ts) as day, COUNT(*) as counts FROM visits GROUP BY day ORDER BY day ASC LIMIT 30').all();
    
    // Landen (Wereldkaart)
    const countries = await env.DB.prepare('SELECT country, COUNT(*) as count FROM visits GROUP BY country ORDER BY count DESC').all();

    // Browsers (Visualisatie)
    const browsers = await env.DB.prepare('SELECT browser, COUNT(*) as count FROM visits GROUP BY browser ORDER BY count DESC').all();

    // Laatste bezoekers
    const recent = await env.DB.prepare('SELECT url, ip, ts FROM visits ORDER BY ts DESC LIMIT 10').all();

    // Headers voor cookie
    const headers = { 'Content-Type': 'text/html' };
    if (isLoggingIn) { headers['Set-Cookie'] = 'auth=' + expectedPwd + '; Path=/; HttpOnly; Max-Age=604800; SameSite=Lax'; }

    // --- ROUTE 4: DASHBOARD HTML/CSS (Met Dark Mode) ---
    // Browser rij-generatie
    const browserRows = browsers.results.map(b => {
      const percentage = (b.count / totalViews * 100).toFixed(0);
      return `<div class="mb-3 text-sm">
        <div class="flex justify-between items-center mb-1">
          <span class="flex items-center gap-2 font-medium">${b.browser}</span>
          <span class="font-mono text-gray-500">${b.count} (${percentage}%)</span>
        </div>
        <div class="h-2 bg-gray-200 dark:bg-gray-800 rounded-full"><div class="h-2 bg-blue-500 rounded-full" style="width:${percentage}%"></div></div>
      </div>`;
    }).join('');

    const dashboardHtml = `
    <!DOCTYPE html>
    <html lang="nl">
    <head>
      <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <title>Pro Analytics</title>
      <script>
        tailwind.config = { darkMode: 'media' } // Automatische Dark Mode switch!
      </script>
    </head>
    <body class="bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 p-4 md:p-8 font-sans">
      <div class="max-w-6xl mx-auto">
        <header class="flex justify-between items-center mb-10 pb-4 border-b border-gray-200 dark:border-gray-800">
          <h1 class="text-xl font-bold">PRO ANALYTICS</h1>
          <button onclick="document.cookie='auth=; Max-Age=0; path=/;'; location.href='/';" class="text-xs text-red-500">Logout</button>
        </header>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div class="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800">
            <h3 class="text-gray-500 dark:text-gray-400 text-xs mb-2">Totaal Bezoeken</h3>
            <p class="text-3xl font-bold font-mono text-blue-500">${totalViews}</p>
          </div>
          <div class="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800">
            <h3 class="text-gray-500 dark:text-gray-400 text-xs mb-2">Unieke Bezoekers</h3>
            <p class="text-3xl font-bold font-mono">${uniqueUsers}</p>
          </div>
          <div class="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800">
            <h3 class="text-gray-500 dark:text-gray-400 text-xs mb-2">Top Pagina</h3>
            <p class="text-sm font-semibold truncate text-blue-500">${topPage.url}</p>
          </div>
          <div class="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800">
            <h3 class="text-gray-500 dark:text-gray-400 text-xs mb-2">Top Land</h3>
            <p class="text-xl font-bold truncate">${topCountry.country}</p>
          </div>
        </div>

        <div class="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 mb-8"><canvas id="mainChart"></canvas></div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div class="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800">
            <h3 class="text-gray-400 text-xs font-bold uppercase mb-4 tracking-widest">Landen (Top 10)</h3>
            ${countries.results.slice(0, 10).map(c => '<div class="flex justify-between py-1 border-b dark:border-gray-800"><span>'+c.country+'</span><span class="font-mono text-blue-500">'+c.count+'</span></div>').join('')}
          </div>
          <div class="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800">
            <h3 class="text-gray-400 text-xs font-bold uppercase mb-4 tracking-widest">Browsers</h3>
            ${browserRows}
          </div>
        </div>

        <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden text-sm">
          <table class="w-full text-left">
            <thead class="bg-gray-100 dark:bg-gray-800 text-gray-400 text-[10px] uppercase tracking-widest">
              <tr><th class="p-3">Paginapad</th><th class="p-3">IP-adres</th></tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              ${recent.results.map(r => `<tr><td class="p-3 text-blue-300 font-mono text-xs">${r.url}</td><td class="p-3 font-mono">${r.ip}</td></tr>`).join('')}
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
              label: 'Bezoeken', 
              data: ${JSON.stringify(timeline.results.map(r => r.counts))}, 
              borderColor: '#3b82f6', 
              backgroundColor: 'rgba(59, 130, 246, 0.1)', 
              fill: true, 
              tension: 0.4 
            }]
          },
          options: {
            plugins: { legend: { display: false } },
            scales: {
              y: { grid: { color: (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#1f2937' : '#e5e7eb' }, beginAtZero: true },
              x: { grid: { display: false } }
            }
          }
        });
      </script>
    </body>
    </html>`;

    return new Response(dashboardHtml, { headers: headers });
  }
};
