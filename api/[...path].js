// Vercel Serverless Function — /api/check-status/[...path]
// Previously used for polling the old visadoctors.uz API.
// No longer needed — visamasters.uz returns results in a single POST.
// Kept as a safe stub to avoid 404s on any stale requests.

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.status(204).end(); return; }

    res.status(404).json({ error: 'Polling endpoint no longer used. POST to /api/check-status instead.' });
};