export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cookieHeader = request.headers.get('Cookie') || '';
    
    if (request.method === 'POST') {
      try {
        const data = await request.json();
        const ip = request.headers.get('cf-connecting-ip') || 'Unknown';
        const country = request.cf?.country || 'Unknown';
        const browser = request.headers.get('user-agent') || 'Unknown';
        await env.DB.prepare(
          'INSERT INTO visits (url, referrer, width, country, ip, browser) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(data.url, data.ref, data.width, country, ip, browser).run();
        return new Response('OK', { status: 201, headers: { 'Access-Control-Allow-Origin': '*' } });
      } catch (e) { return new Response('Error', { status: 500 }); }
    }

    const expectedPwd = String(env.ADMIN_PASSWORD).trim();
    const inputPwd = (url.searchParams.get('login_pwd') || '').trim();
    const hasValidCookie = cookieHeader.includes('auth=' + expectedPwd);
    const isLoggingIn = inputPwd === expectedPwd || decodeURIComponent(inputPwd) === expectedPwd;

    if (!hasValidCookie && !isLoggingIn) {
      return new Response('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#000;color:#fff;font-family:sans-serif;margin:0;"><form action="/" method="GET" style="background:#111;padding:2rem;border-radius:15px;border:1px solid #333;width:300px;text-align:center;"><h2 style="color:#3b82f6;">📊 Analytics Login</h2><input type="password" name="login_pwd" placeholder="Wachtwoord" style="padding:12px;border-radius:8px;border:1px solid #444;background:#222;color:#fff;margin-bottom:15px;width:100%;box-sizing:border-box;"><button type="submit" style="padding:12px;width:100%;background:#3b82f6;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">Login</button></form></body></html>', { headers: { 'Content-Type': 'text/html' } });
    }

    const stats = await env.DB.prepare('SELECT url, COUNT(*) as views FROM visits GROUP BY url ORDER BY views DESC').all();
    const timeline = await env.DB.prepare('SELECT DATE(ts) as day, COUNT(*) as counts FROM visits GROUP BY day ORDER BY day ASC LIMIT 30').all();
    const countries = await env.DB.prepare('SELECT country, COUNT(*) as count FROM visits GROUP BY country ORDER BY count DESC LIMIT 10').all();

    const headers = { 'Content-Type': 'text/html' };
    if (isLoggingIn) {
      headers['Set-Cookie'] = 'auth=' + expectedPwd + '; Path=/; HttpOnly; Max-Age=604800; SameSite=Lax';
    }

    // Gebruik gewone strings voor de tabel-rijen om backtick-errors te voorkomen
    const countryRows = countries.results.map(c => 
      '<div class="flex justify-between border-b border-gray-800 py-1"><span>' + c.country + '</span><span class="text-blue-400 font-mono">' + c.count + '</span></div>'
    ).join('');

    const pageRows = stats.results.map(r => 
      '<tr class="border-t border-gray-800"><td class="p-4 text-blue-300 font-mono">' + r.url + '</td><td class="p-4 text-right font-bold">' + r.views + '</td></tr>'
    ).join('');

    const dashboardHtml = `
    <!DOCTYPE html>
    <html lang="nl">
    <head>
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <title>Pro Analytics</title>
    </head>
    <body class="bg-gray-950 text-gray-100 p-4 md:p-10">
      <div class="max-w-6xl mx-auto">
        <header class="flex justify-between items-center mb-10">
          <h1 class="text-3xl font-bold text-blue-500 italic">PRO ANALYTICS</h1>
          <button onclick="document.cookie='auth=; Max-Age=0; path=/;'; location.href='/';" class="text-xs text-red-500 underline">Logout</button>
        </header>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div class="lg:col-span-2 bg-gray-900 p-6 rounded-2xl border border-gray-800"><canvas id="mainChart"></canvas></div>
          <div class="bg-gray-900 p-6 rounded-2xl border border-gray-800 text-sm">
            <h3 class="text-gray-400 text-xs font-bold uppercase mb-4 tracking-widest">Top Landen</h3>
            ${countryRows}
          </div>
        </div>
        <div class="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden text-sm">
          <table class="w-full text-left">
            <thead class="bg-gray-800 text-gray-400 uppercase text-[10px] tracking-widest">
              <tr><th class="p-4 text-left">Pagina</th><th class="p-4 text-right">Views</th></tr>
            </thead>
            <tbody>${pageRows}</tbody>
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
          options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#222' }, beginAtZero: true }, x: { grid: { display: false } } } }
        });
      </script>
    </body>
    </html>`;

    return new Response(dashboardHtml, { headers: headers });
  }
};
