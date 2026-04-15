export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cookieHeader = request.headers.get('Cookie') || '';
    const origin = request.headers.get('Origin');

    // 1. DATA OPSLAAN (POST) + VERIFICATIE
    if (request.method === 'POST') {
      // Check of het verzoek van jouw domein komt
      const isAllowed = origin && origin.includes(env.ALLOWED_DOMAIN);
      
      if (!isAllowed) {
        return new Response('Niet toegestaan', { status: 403 });
      }

      try {
        const data = await request.json();
        const ip = request.headers.get('cf-connecting-ip') || 'Unknown';
        const country = request.cf?.country || 'Unknown';
        const userAgent = request.headers.get('user-agent') || 'Unknown';
        
        // Simpele browser detectie
        let browser = "Anders";
        if (userAgent.includes("Chrome")) browser = "Chrome";
        else if (userAgent.includes("Firefox")) browser = "Firefox";
        else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) browser = "Safari";

        await env.DB.prepare(
          'INSERT INTO visits (url, referrer, width, country, ip, browser) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(data.url, data.ref, data.width, country, ip, browser).run();

        return new Response('OK', { 
          status: 201, 
          headers: { 
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'POST'
          } 
        });
      } catch (e) { return new Response('Error', { status: 500 }); }
    }

    // 2. AUTHENTICATIE VOOR DASHBOARD
    const expectedPwd = String(env.ADMIN_PASSWORD).trim();
    const inputPwd = (url.searchParams.get('login_pwd') || '').trim();
    const hasValidCookie = cookieHeader.includes('auth=' + expectedPwd);
    const isLoggingIn = inputPwd === expectedPwd || decodeURIComponent(inputPwd) === expectedPwd;

    if (!hasValidCookie && !isLoggingIn) {
      return new Response('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#000;color:#fff;font-family:sans-serif;margin:0;"><form action="/" method="GET" style="background:#111;padding:2rem;border-radius:15px;border:1px solid #333;width:300px;text-align:center;"><h2 style="color:#3b82f6;">Analytics Login</h2><input type="password" name="login_pwd" placeholder="Wachtwoord" style="padding:12px;border-radius:8px;border:1px solid #444;background:#222;color:#fff;margin-bottom:15px;width:100%;box-sizing:border-box;"><button type="submit" style="padding:12px;width:100%;background:#3b82f6;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">Login</button></form></body></html>', { headers: { 'Content-Type': 'text/html' } });
    }

    // 3. DATA OPHALEN
    const stats = await env.DB.prepare('SELECT url, COUNT(*) as views FROM visits GROUP BY url ORDER BY views DESC').all();
    const timeline = await env.DB.prepare('SELECT DATE(ts) as day, COUNT(*) as counts FROM visits GROUP BY day ORDER BY day ASC LIMIT 30').all();
    const countries = await env.DB.prepare('SELECT country, COUNT(*) as count FROM visits GROUP BY country ORDER BY count DESC').all();
    const recent = await env.DB.prepare('SELECT url, ip, browser, country, ts FROM visits ORDER BY ts DESC LIMIT 10').all();

    const headers = { 'Content-Type': 'text/html' };
    if (isLoggingIn) {
      headers['Set-Cookie'] = 'auth=' + expectedPwd + '; Path=/; HttpOnly; Max-Age=604800; SameSite=Lax';
    }

    // Tabel rijen genereren
    const recentRows = recent.results.map(r => 
      '<tr class="border-t border-gray-800 text-[11px]"><td class="p-2 font-mono text-blue-300">' + r.url + '</td><td class="p-2">' + r.ip + '</td><td class="p-2">' + r.browser + '</td><td class="p-2 text-right">' + r.country + '</td></tr>'
    ).join('');

    const dashboardHtml = `
    <!DOCTYPE html>
    <html lang="nl">
    <head>
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <title>Pro Analytics</title>
    </head>
    <body class="bg-gray-950 text-gray-100 p-4 md:p-8">
      <div class="max-w-6xl mx-auto">
        <header class="flex justify-between items-center mb-8">
          <h1 class="text-2xl font-bold text-blue-500">PRO ANALYTICS</h1>
          <button onclick="document.cookie='auth=; Max-Age=0; path=/;'; location.href='/';" class="text-xs text-red-500 underline">Logout</button>
        </header>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div class="lg:col-span-2 bg-gray-900 p-6 rounded-2xl border border-gray-800"><canvas id="mainChart"></canvas></div>
          <div class="bg-gray-900 p-6 rounded-2xl border border-gray-800">
             <h3 class="text-gray-400 text-xs font-bold uppercase mb-4">Top Landen</h3>
             ${countries.results.slice(0, 5).map(c => '<div class="flex justify-between py-1 border-b border-gray-800"><span>'+c.country+'</span><span>'+c.count+'</span></div>').join('')}
          </div>
        </div>

        <div class="grid grid-cols-1 gap-6">
          <div class="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            <h3 class="p-4 bg-gray-800 text-xs font-bold uppercase">Laatste 10 Bezoekers</h3>
            <table class="w-full text-left border-collapse">
              <thead class="text-gray-500 text-[10px] uppercase bg-gray-900">
                <tr><th class="p-2">Pad</th><th class="p-2">IP</th><th class="p-2">Browser</th><th class="p-2 text-right">Land</th></tr>
              </thead>
              <tbody>${recentRows}</tbody>
            </table>
          </div>
        </div>
      </div>
      <script>
        new Chart(document.getElementById('mainChart'), {
          type: 'line',
          data: {
            labels: ${JSON.stringify(timeline.results.map(r => r.day))},
            datasets: [{ label: 'Bezoeken', data: ${JSON.stringify(timeline.results.map(r => r.counts))}, borderColor: '#3b82f6', tension: 0.4 }]
          }
        });
      </script>
      <script>
  (function() {
    fetch("https://tiny-analytics.wautersstef4.workers.dev", {
      method: "POST",
      mode: "cors", // Dit is nu belangrijk!
      body: JSON.stringify({
        url: window.location.pathname,
        ref: document.referrer,
        width: window.innerWidth
      })
    });
  })();
</script>
    </body>
    </html>`;

    return new Response(dashboardHtml, { headers: headers });
  }
};
