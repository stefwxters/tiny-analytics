export default {
  async fetch(request, env) {
    // Staat alleen POST verzoeken toe vanaf je website
    if (request.method === "POST") {
      try {
        const data = await request.json();
        
        // Sla de gegevens op in de D1 Database
        await env.DB.prepare(
          "INSERT INTO visits (url, referrer, width) VALUES (?, ?, ?)"
        ).bind(data.url, data.ref, data.width).run();

        return new Response("Gelukt!", { status: 201, headers: { "Access-Control-Allow-Origin": "*" } });
      } catch (e) {
        return new Response("Foutje: " + e.message, { status: 500 });
      }
    }
    return new Response("Stuur een POST a.u.b.", { status: 405 });
  }
};