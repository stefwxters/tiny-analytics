export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ROUTE 1: Data bekijken (Dashboard)
    if (request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT url, COUNT(*) as views FROM visits GROUP BY url ORDER BY views DESC"
      ).all();

      // Maak een heel simpele HTML tabel
      const html = `
        <h1>Bezoekers Stats</h1>
        <table border="1">
          <tr><th>Pagina</th><th>Views</th></tr>
          ${results.map(r => `<tr><td>${r.url}</td><td>${r.views}</td></tr>`).join('')}
        </table>
      `;

      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    // ROUTE 2: Data opslaan (POST)
    if (request.method === "POST") {
      const data = await request.json();
      await env.DB.prepare(
        "INSERT INTO visits (url, referrer, width) VALUES (?, ?, ?)"
      ).bind(data.url, data.ref, data.width).run();
      return new Response("OK", { status: 201, headers: { "Access-Control-Allow-Origin": "*" } });
    }
  }
};
