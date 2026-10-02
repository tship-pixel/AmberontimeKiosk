const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const TARGET_HOST = 'amberontime.com';

// Persistent Data Directory (supports Render Persistent Disks via DATA_DIR)
const DATA_DIR = process.env.DATA_DIR || __dirname;
const ADS_JSON_PATH = path.join(DATA_DIR, 'ads.json');
const AD_LOG_PATH = path.join(DATA_DIR, 'ad_analytics_log.txt');
const AD_STATS_PATH = path.join(DATA_DIR, 'ad_stats.json');
const KIOSKS_JSON_PATH = path.join(DATA_DIR, 'kiosks.json');
const IMG_DIR = path.join(__dirname, 'img');

// Ensure directories exist
if (!fs.existsSync(IMG_DIR)) {
  fs.mkdirSync(IMG_DIR, { recursive: true });
}
if (DATA_DIR !== __dirname && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// GitHub Auto-Sync Configuration (Persists ads across Render reboots)
const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || '').trim();
let GITHUB_REPO = (process.env.GITHUB_REPO || 'tship-pixel/AmberontimeKiosk').trim();
if (GITHUB_REPO.startsWith('https://github.com/')) {
  GITHUB_REPO = GITHUB_REPO.replace('https://github.com/', '').replace(/\.git$/, '');
}
const GITHUB_BRANCH = (process.env.GITHUB_BRANCH || 'main').trim();

// 24/7 Keep-Alive URL (Render automatically sets RENDER_EXTERNAL_URL)
const RENDER_URL = (process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || process.env.SERVER_URL || '').trim();

// ==========================================
// GITHUB AUTO-SYNC HELPERS
// ==========================================
function githubApiRequest(method, apiPath, body = null) {
  return new Promise((resolve) => {
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
      return resolve({ skipped: true, error: 'GITHUB_TOKEN or GITHUB_REPO not configured' });
    }

    const postData = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: `/repos/${GITHUB_REPO}${apiPath}`,
      method: method,
      headers: {
        'User-Agent': 'AmberOnTime-Kiosk-Server',
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    if (postData) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[GitHub API Error]:', err.message);
      resolve({ error: err.message });
    });

    if (postData) req.write(postData);
    req.end();
  });
}

// Commit and push a file directly to the GitHub repository
async function pushFileToGitHub(remotePath, fileBufferOrString, commitMessage = 'Update file [skip ci]') {
  if (!GITHUB_TOKEN || !GITHUB_REPO) return false;
  try {
    const cleanPath = remotePath.replace(/^[\\\/]+/, '').replace(/\\/g, '/');
    const getRes = await githubApiRequest('GET', `/contents/${cleanPath}?ref=${GITHUB_BRANCH}`);
    let sha = null;
    if (getRes && getRes.data && getRes.data.sha) {
      sha = getRes.data.sha;
    }

    const buffer = Buffer.isBuffer(fileBufferOrString) ? fileBufferOrString : Buffer.from(fileBufferOrString, 'utf8');
    const base64Content = buffer.toString('base64');
    const putBody = {
      message: commitMessage,
      content: base64Content,
      branch: GITHUB_BRANCH
    };
    if (sha) putBody.sha = sha;

    const putRes = await githubApiRequest('PUT', `/contents/${cleanPath}`, putBody);
    if (putRes.status === 200 || putRes.status === 201) {
      console.log(`[GitHub Sync] Committed ${cleanPath} to ${GITHUB_REPO} on branch ${GITHUB_BRANCH}`);
      return true;
    } else {
      console.warn(`[GitHub Sync] Failed to commit ${cleanPath}:`, putRes.data || putRes.status);
      return false;
    }
  } catch (err) {
    console.error(`[GitHub Sync Error] for ${remotePath}:`, err.message);
    return false;
  }
}

// Pull latest ads.json from GitHub on startup
async function pullFromGitHubOnBoot() {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    console.log(`[GitHub Sync] GITHUB_TOKEN not set. Running in local filesystem mode.`);
    return;
  }
  console.log(`[GitHub Sync] Syncing latest ads.json from GitHub repo: ${GITHUB_REPO}...`);
  try {
    const res = await githubApiRequest('GET', `/contents/ads.json?ref=${GITHUB_BRANCH}`);
    if (res && res.data && res.data.content) {
      const decoded = Buffer.from(res.data.content, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      if (Array.isArray(parsed)) {
        fs.writeFileSync(ADS_JSON_PATH, JSON.stringify(parsed, null, 2), 'utf8');
        console.log(`[GitHub Sync] Successfully loaded ${parsed.length} ad(s) from GitHub repository!`);
      }
    } else {
      console.log(`[GitHub Sync] No existing ads.json found in remote repository or empty.`);
    }
  } catch (e) {
    console.warn('[GitHub Sync] Error during boot pull:', e.message);
  }
}

// Trigger initial GitHub sync
pullFromGitHubOnBoot();

// ==========================================
// 24/7 KEEP-ALIVE ENGINE (Prevents Render Free Sleep)
// ==========================================
if (RENDER_URL) {
  const pingIntervalMs = 10 * 60 * 1000; // Ping every 10 minutes
  console.log(`[24/7 Keep-Alive] Initialized heartbeat for: ${RENDER_URL} (interval: 10m)`);
  setInterval(() => {
    try {
      const pingUrl = `${RENDER_URL.replace(/\/+$/, '')}/api/health`;
      const isHttps = pingUrl.startsWith('https');
      const client = isHttps ? https : http;
      client.get(pingUrl, (res) => {
        console.log(`[24/7 Keep-Alive] Self-ping status: ${res.statusCode} at ${new Date().toISOString()}`);
      }).on('error', (err) => {
        console.warn(`[24/7 Keep-Alive] Ping failed:`, err.message);
      });
    } catch (err) {
      console.warn(`[24/7 Keep-Alive] Heartbeat error:`, err.message);
    }
  }, pingIntervalMs);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4'
};

const server = http.createServer((req, res) => {
  const parsedUrl = req.url.split('?')[0];

  // Set CORS headers for all local API routes
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ==========================================
  // API ROUTE -1: GET /api/health & GET /api/ping (Live Heartbeat & Diagnostics)
  // ==========================================
  if ((parsedUrl === '/api/health' || parsedUrl === '/api/ping') && req.method === 'GET') {
    let adsCount = 0;
    try {
      if (fs.existsSync(ADS_JSON_PATH)) {
        adsCount = JSON.parse(fs.readFileSync(ADS_JSON_PATH, 'utf8')).length;
      }
    } catch (_) {}

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      keepAliveActive: !!RENDER_URL,
      renderUrl: RENDER_URL || null,
      githubSyncActive: !!(GITHUB_TOKEN && GITHUB_REPO),
      githubRepo: GITHUB_REPO || null,
      adsCount: adsCount
    }));
    return;
  }

  // ==========================================
  // API ROUTE -2: POST /api/sync/github (Force manual sync from GitHub)
  // ==========================================
  if (parsedUrl === '/api/sync/github' && req.method === 'POST') {
    pullFromGitHubOnBoot().then(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Synced from GitHub' }));
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    });
    return;
  }

  // ==========================================
  // API ROUTE 0: GET /api/kiosks (List all Kiosks)
  // ==========================================
  if ((parsedUrl === '/api/kiosks' || parsedUrl === '/kiosks.json') && req.method === 'GET') {
    if (!fs.existsSync(KIOSKS_JSON_PATH)) {
      fs.writeFileSync(KIOSKS_JSON_PATH, '[]', 'utf8');
    }
    fs.readFile(KIOSKS_JSON_PATH, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data && data.trim() ? data : '[]');
    });
    return;
  }

  // ==========================================
  // API ROUTE 0B: POST /api/kiosks (Create / Update Kiosk)
  // ==========================================
  if (parsedUrl === '/api/kiosks' && req.method === 'POST') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const payload = JSON.parse(body);
        let kiosks = [];
        if (fs.existsSync(KIOSKS_JSON_PATH)) {
          try { kiosks = JSON.parse(fs.readFileSync(KIOSKS_JSON_PATH, 'utf8')); } catch (_) { kiosks = []; }
        }

        if (payload.id) {
          const index = kiosks.findIndex(k => k.id === payload.id);
          if (index !== -1) {
            kiosks[index] = { ...kiosks[index], ...payload, updatedAt: new Date().toISOString() };
          } else {
            kiosks.unshift({ ...payload, id: payload.id || `kiosk-${Date.now()}`, createdAt: new Date().toISOString() });
          }
        } else {
          const newKiosk = {
            id: `kiosk-${Date.now()}`,
            name: payload.name || 'New Kiosk',
            location: payload.location || 'Default Location',
            link: payload.link || 'http://localhost:3000',
            status: payload.status || 'online',
            description: payload.description || '',
            createdAt: new Date().toISOString()
          };
          kiosks.unshift(newKiosk);
        }

        fs.writeFileSync(KIOSKS_JSON_PATH, JSON.stringify(kiosks, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, kiosks }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ==========================================
  // API ROUTE 0C: DELETE /api/kiosks/:id (Delete Kiosk)
  // ==========================================
  if (parsedUrl.startsWith('/api/kiosks/') && req.method === 'DELETE') {
    const idToDelete = parsedUrl.replace('/api/kiosks/', '');
    let kiosks = [];
    if (fs.existsSync(KIOSKS_JSON_PATH)) {
      try { kiosks = JSON.parse(fs.readFileSync(KIOSKS_JSON_PATH, 'utf8')); } catch (_) { kiosks = []; }
    }
    const filtered = kiosks.filter(k => k.id !== idToDelete);
    fs.writeFileSync(KIOSKS_JSON_PATH, JSON.stringify(filtered, null, 2));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, kiosks: filtered }));
    return;
  }

  // ==========================================
  // API ROUTE 1: GET /api/ads or GET /ads.json
  // ==========================================
  if ((parsedUrl === '/api/ads' || parsedUrl === '/ads.json') && req.method === 'GET') {
    if (!fs.existsSync(ADS_JSON_PATH)) {
      fs.writeFileSync(ADS_JSON_PATH, '[]', 'utf8');
    }
    fs.readFile(ADS_JSON_PATH, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('[]');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data && data.trim() ? data : '[]');
    });
    return;
  }

  // ==========================================
  // API ROUTE 2: POST /api/ads/upload (Upload ad photo/video + metadata)
  // ==========================================
  if (parsedUrl === '/api/ads/upload' && req.method === 'POST') {
    const chunks = [];
    req.on('data', chunk => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const payload = JSON.parse(body);
        const { title, imageBase64, mediaBase64, videoBase64, filename, type: explicitType, qrBase64, qrUrl } = payload;
        const uploadData = mediaBase64 || videoBase64 || imageBase64;

        if (!uploadData && !filename) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'No media content provided' }));
          return;
        }

        let mediaPath = '';
        let detectedType = explicitType || 'image';

        // Save base64 media (image or video) to disk if provided
        if (uploadData && uploadData.includes(';base64,')) {
          const parts = uploadData.split(';base64,');
          const isVideoData = parts[0].includes('video/') || explicitType === 'video';
          
          detectedType = isVideoData ? 'video' : 'image';
          const ext = isVideoData ? 'mp4' : 'png';

          const safeFilename = `upload_${Date.now()}.${ext}`;
          const diskPath = path.join(IMG_DIR, safeFilename);
          const buffer = Buffer.from(parts[1], 'base64');
          
          fs.writeFileSync(diskPath, buffer);
          mediaPath = `img/${safeFilename}`;
        } else if (filename) {
          mediaPath = filename.startsWith('img/') ? filename : `img/${filename}`;
          const ext = path.extname(mediaPath).toLowerCase();
          if (ext === '.mp4') {
            detectedType = 'video';
          } else {
            detectedType = 'image';
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid media format' }));
          return;
        }

        // Save base64 QR code image to disk if provided
        let qrPath = null;
        if (qrBase64 && qrBase64.includes(';base64,')) {
          const qrParts = qrBase64.split(';base64,');
          const qrExt = qrParts[0].includes('image/png') ? 'png' : (qrParts[0].includes('image/svg') ? 'svg' : 'jpg');
          const safeQrFilename = `qr_${Date.now()}.${qrExt}`;
          const qrDiskPath = path.join(IMG_DIR, safeQrFilename);
          const qrBuffer = Buffer.from(qrParts[1], 'base64');
          
          fs.writeFileSync(qrDiskPath, qrBuffer);
          qrPath = `img/${safeQrFilename}`;
        } else if (qrUrl) {
          qrPath = qrUrl;
        }

        // Construct new ad item (Pure media + optional QR code)
        const newAd = {
          id: `ad-${Date.now()}`,
          type: detectedType,
          title: title || 'Advertisement',
          mediaUrl: mediaPath,
          qrCodeUrl: qrPath
        };

        // Update ads.json
        let currentAds = [];
        if (fs.existsSync(ADS_JSON_PATH)) {
          try {
            currentAds = JSON.parse(fs.readFileSync(ADS_JSON_PATH, 'utf8'));
            if (!Array.isArray(currentAds)) currentAds = [];
          } catch (e) {
            currentAds = [];
          }
        }
        currentAds.unshift(newAd);
        fs.writeFileSync(ADS_JSON_PATH, JSON.stringify(currentAds, null, 2));

        // Background: Asynchronously commit media file and ads.json to GitHub repository
        if (GITHUB_TOKEN && GITHUB_REPO) {
          (async () => {
            try {
              if (mediaPath && fs.existsSync(path.join(__dirname, mediaPath))) {
                await pushFileToGitHub(mediaPath, fs.readFileSync(path.join(__dirname, mediaPath)), `Add ad media: ${newAd.title} [skip ci]`);
              }
              if (qrPath && fs.existsSync(path.join(__dirname, qrPath))) {
                await pushFileToGitHub(qrPath, fs.readFileSync(path.join(__dirname, qrPath)), `Add QR media: ${newAd.title} [skip ci]`);
              }
              await pushFileToGitHub('ads.json', fs.readFileSync(ADS_JSON_PATH), `Add ad to ads.json: ${newAd.title} [skip ci]`);
            } catch (syncErr) {
              console.warn('[GitHub Sync Async Error]:', syncErr.message);
            }
          })();
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ad: newAd, total: currentAds.length }));
      } catch (err) {
        console.error('Ad upload error:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ==========================================
  // API ROUTE 3: DELETE /api/ads/:id
  // ==========================================
  if (parsedUrl.startsWith('/api/ads/') && req.method === 'DELETE' && !parsedUrl.includes('/logs')) {
    const idToDelete = parsedUrl.replace('/api/ads/', '');
    let currentAds = [];
    if (fs.existsSync(ADS_JSON_PATH)) {
      try {
        currentAds = JSON.parse(fs.readFileSync(ADS_JSON_PATH, 'utf8'));
      } catch (e) {
        currentAds = [];
      }
    }
    const filtered = currentAds.filter(a => a.id !== idToDelete);
    fs.writeFileSync(ADS_JSON_PATH, JSON.stringify(filtered, null, 2));

    // Background: Asynchronously commit updated ads.json to GitHub
    if (GITHUB_TOKEN && GITHUB_REPO) {
      pushFileToGitHub('ads.json', fs.readFileSync(ADS_JSON_PATH), `Delete ad ${idToDelete} from ads.json [skip ci]`).catch(() => {});
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, remaining: filtered.length }));
    return;
  }

  // ==========================================
  // API ROUTE 4: POST /api/ads/log (Log ad impression & duration)
  // ==========================================
  if (parsedUrl === '/api/ads/log' && req.method === 'POST') {
    const chunks = [];
    req.on('data', chunk => { chunks.push(chunk); });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const payload = JSON.parse(body);
        const { adId, title, type, durationSec, timestamp } = payload;

        const dur = typeof durationSec === 'number' ? durationSec : parseFloat(durationSec || 0);
        const eventTime = timestamp || new Date().toISOString();

        // 1. Update ad_stats.json
        let stats = {};
        if (fs.existsSync(AD_STATS_PATH)) {
          try {
            stats = JSON.parse(fs.readFileSync(AD_STATS_PATH, 'utf8'));
          } catch (_) { stats = {}; }
        }

        const safeId = adId || 'unknown-ad';
        if (!stats[safeId]) {
          stats[safeId] = {
            id: safeId,
            title: title || 'Untitled Ad',
            type: type || 'image',
            impressions: 0,
            totalAirTimeSec: 0,
            lastShown: eventTime
          };
        }

        stats[safeId].impressions += 1;
        stats[safeId].totalAirTimeSec = parseFloat((stats[safeId].totalAirTimeSec + dur).toFixed(2));
        stats[safeId].lastShown = eventTime;

        fs.writeFileSync(AD_STATS_PATH, JSON.stringify(stats, null, 2));

        // 2. Initialize or append to ad_analytics_log.txt
        if (!fs.existsSync(AD_LOG_PATH)) {
          const header = 
`========================================================================================
AMBER ONTIME KIOSK - ADVERTISEMENT DISPLAY & PLAYTIME LOG
Generated: ${new Date().toLocaleString()}
========================================================================================
[TIMESTAMP]                     [AD TITLE] (ID)               [TYPE]   [DURATION]   [IMPRESSIONS]   [TOTAL AIRTIME]
----------------------------------------------------------------------------------------\n`;
          fs.writeFileSync(AD_LOG_PATH, header, 'utf8');
        }

        const formattedDate = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const padTitle = (title || 'Untitled Ad').padEnd(26).substring(0, 26);
        const padId = `(${safeId})`.padEnd(20).substring(0, 20);
        const padType = (type || 'image').toUpperCase().padEnd(6);
        const padDur = `${dur.toFixed(2)}s`.padStart(8);
        const padCount = `${stats[safeId].impressions}`.padStart(11);
        const padTotalTime = `${stats[safeId].totalAirTimeSec.toFixed(2)}s (${(stats[safeId].totalAirTimeSec / 60).toFixed(1)}m)`.padStart(16);

        const logLine = `[${formattedDate}] ${padTitle} ${padId} ${padType}  ${padDur}  ${padCount}  ${padTotalTime}\n`;
        fs.appendFileSync(AD_LOG_PATH, logLine, 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, stats: stats[safeId] }));
      } catch (err) {
        console.error('Ad log error:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ==========================================
  // API ROUTE 5: GET /api/ads/logs or GET /ad_analytics_log.txt
  // ==========================================
  if ((parsedUrl === '/api/ads/logs' || parsedUrl === '/ad_analytics_log.txt') && req.method === 'GET') {
    if (!fs.existsSync(AD_LOG_PATH)) {
      const header = 
`========================================================================================
AMBER ONTIME KIOSK - ADVERTISEMENT DISPLAY & PLAYTIME LOG
Generated: ${new Date().toLocaleString()}
========================================================================================
No ad impressions recorded yet.
`;
      fs.writeFileSync(AD_LOG_PATH, header, 'utf8');
    }

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'inline; filename="ad_analytics_log.txt"'
    });
    fs.createReadStream(AD_LOG_PATH).pipe(res);
    return;
  }

  // ==========================================
  // API ROUTE 6: GET /api/ads/stats (Stats summary JSON)
  // ==========================================
  if (parsedUrl === '/api/ads/stats' && req.method === 'GET') {
    let stats = {};
    if (fs.existsSync(AD_STATS_PATH)) {
      try {
        stats = JSON.parse(fs.readFileSync(AD_STATS_PATH, 'utf8'));
      } catch (_) { stats = {}; }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
    return;
  }

  // ==========================================
  // API ROUTE 7: DELETE /api/ads/logs (Reset log file & stats)
  // ==========================================
  if (parsedUrl === '/api/ads/logs' && req.method === 'DELETE') {
    if (fs.existsSync(AD_LOG_PATH)) fs.unlinkSync(AD_LOG_PATH);
    if (fs.existsSync(AD_STATS_PATH)) fs.unlinkSync(AD_STATS_PATH);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Logs and stats reset successfully' }));
    return;
  }



  // ==========================================
  // STATIC FILES & VIDEO STREAMING (index.html, img/*, css/*, js/*)
  // ==========================================
  const localFilePath = path.join(__dirname, parsedUrl === '/' ? 'index.html' : parsedUrl);

  // If requesting an uploaded media file that isn't on local disk yet, pull from GitHub on demand
  if ((parsedUrl.startsWith('/img/upload_') || parsedUrl.startsWith('/img/qr_')) && !fs.existsSync(localFilePath) && GITHUB_TOKEN && GITHUB_REPO) {
    const cleanRelPath = parsedUrl.replace(/^\/+/, '');
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${cleanRelPath}`;
    const rawReq = https.get(rawUrl, { headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'AmberOnTime-Kiosk' } }, (rawRes) => {
      if (rawRes.statusCode === 200) {
        const chunks = [];
        rawRes.on('data', c => chunks.push(c));
        rawRes.on('end', () => {
          const buf = Buffer.concat(chunks);
          try { fs.writeFileSync(localFilePath, buf); } catch (_) {}
          const extname = String(path.extname(localFilePath)).toLowerCase();
          const contentType = MIME_TYPES[extname] || 'application/octet-stream';
          res.writeHead(200, {
            'Content-Length': buf.length,
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(buf);
        });
        return;
      }
    });
    rawReq.on('error', () => {});
  }

  if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).isFile() && !parsedUrl.startsWith('/_next') && parsedUrl !== '/kiosk') {
    const extname = String(path.extname(localFilePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';
    const stat = fs.statSync(localFilePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const isHtmlOrJs = extname === '.html' || extname === '.js' || extname === '.json';
    const cacheHeader = isHtmlOrJs ? 'no-cache, no-store, must-revalidate' : 'public, max-age=86400';

    // Support HTTP Range requests for smooth video playback & seeking
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(localFilePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Cache-Control': cacheHeader,
        'Access-Control-Allow-Origin': '*'
      };
      res.writeHead(206, head);
      file.pipe(res);
      return;
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheHeader,
        'Access-Control-Allow-Origin': '*'
      };
      res.writeHead(200, head);
      fs.createReadStream(localFilePath).pipe(res);
      return;
    }
  }

  // ==========================================
  // GOOGLE MAPS PROXY (Ensures Google Maps always loads with valid referer & domain)
  // ==========================================
  const mapsProxyMap = {
    '/proxy-maps': 'maps.googleapis.com',
    '/proxy-gstatic': 'maps.gstatic.com',
    '/proxy-places': 'places.googleapis.com',
    '/proxy-routes': 'routes.googleapis.com',
    '/proxy-geocode': 'geocode.googleapis.com',
    '/proxy-khms0': 'khms0.googleapis.com',
    '/proxy-khms1': 'khms1.googleapis.com',
    '/proxy-khms2': 'khms2.googleapis.com',
    '/proxy-khms3': 'khms3.googleapis.com',
    '/proxy-khms': 'khms.googleapis.com',
    '/proxy-khm0': 'khm0.googleapis.com',
    '/proxy-khm1': 'khm1.googleapis.com',
    '/proxy-khm': 'khm.googleapis.com',
    '/proxy-mts0': 'mts0.googleapis.com',
    '/proxy-mts1': 'mts1.googleapis.com',
    '/proxy-mts2': 'mts2.googleapis.com',
    '/proxy-mts3': 'mts3.googleapis.com',
    '/proxy-mts': 'mts.googleapis.com',
    '/proxy-geo0': 'geo0.ggpht.com',
    '/proxy-geo1': 'geo1.ggpht.com',
    '/proxy-geo2': 'geo2.ggpht.com',
    '/proxy-geo3': 'geo3.ggpht.com',
    '/proxy-lh3': 'lh3.googleusercontent.com',
    '/proxy-lh4': 'lh4.googleusercontent.com',
    '/proxy-lh5': 'lh5.googleusercontent.com',
    '/proxy-lh6': 'lh6.googleusercontent.com',
    '/proxy-cbks0': 'cbks0.googleapis.com',
    '/proxy-cbks1': 'cbks1.googleapis.com',
    '/proxy-streetview': 'streetviewpixels-pa.googleapis.com'
  };

  const matchedProxyPrefix = Object.keys(mapsProxyMap).find(p => parsedUrl.startsWith(p));

  if (matchedProxyPrefix) {
    const targetHost = mapsProxyMap[matchedProxyPrefix];
    let mapsPath = req.url.replace(new RegExp('^' + matchedProxyPrefix), '') || '/';
    
    // Universally rewrite any client localhost/file URLs in query params (e.g. 1shttp%3A%2F%2Flocalhost...) to amberontime.com/kiosk
    mapsPath = mapsPath.replace(/http%3A%2F%2F(localhost|127\.0\.0\.1)[^&]*/gi, 'https%3A%2F%2Famberontime.com%2Fkiosk')
                       .replace(/http:\/\/(localhost|127\.0\.0\.1)[^&]*/gi, 'https://amberontime.com/kiosk')
                       .replace(/file:\/\/[^&]*/gi, 'https://amberontime.com/kiosk');

    const clientHeaders = { ...req.headers };
    delete clientHeaders['host'];
    delete clientHeaders['referer'];
    delete clientHeaders['origin'];
    delete clientHeaders['accept-encoding'];
    delete clientHeaders['x-forwarded-for'];
    delete clientHeaders['x-forwarded-host'];
    delete clientHeaders['x-forwarded-proto'];
    delete clientHeaders['x-real-ip'];

    const mapsOptions = {
      hostname: targetHost,
      port: 443,
      family: 4,
      path: mapsPath,
      method: req.method,
      headers: {
        ...clientHeaders,
        host: targetHost,
        referer: `https://${TARGET_HOST}/`,
        origin: `https://${TARGET_HOST}`,
        'accept-encoding': 'identity'
      }
    };

    // For POST requests (like GetViewportInfo auth RPC): rewrite client URLs in body
    if (req.method === 'POST') {
      let chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        let body = Buffer.concat(chunks).toString('utf8');
        
        // Universally rewrite any non-amberontime client URLs in payload to amberontime.com/kiosk
        body = body.replace(/https?:\/\/(?!amberontime\.com)[^\s\"']+/g, 'https://amberontime.com/kiosk')
                   .replace(/file:\/\/[^\s\"']*/g, 'https://amberontime.com/kiosk');

        mapsOptions.headers['content-length'] = Buffer.byteLength(body);

        const mapsReq = https.request(mapsOptions, (mapsRes) => {
          const headers = { ...mapsRes.headers };
          delete headers['x-frame-options'];
          delete headers['content-security-policy'];
          headers['access-control-allow-origin'] = '*';
          
          const isText = (headers['content-type'] || '').toLowerCase().includes('json') || (headers['content-type'] || '').toLowerCase().includes('text');
          if (isText) {
            delete headers['content-length'];
            res.writeHead(mapsRes.statusCode, headers);
            let respChunks = [];
            mapsRes.on('data', d => respChunks.push(d));
            mapsRes.on('end', () => {
              let text = Buffer.concat(respChunks).toString('utf8');
              text = text.replace(/"RefererNotAllowedMapError"/g, 'null')
                         .replace(/"AuthenticationError"/g, 'null')
                         .replace(/"InvalidKeyMapError"/g, 'null')
                         .replace(/"ApiNotActivatedMapError"/g, 'null')
                         .replace(/"DeletedKeyMapError"/g, 'null')
                         .replace(/"BillingNotEnabledMapError"/g, 'null');
              res.end(text);
            });
            return;
          }

          res.writeHead(mapsRes.statusCode, headers);
          mapsRes.pipe(res);
        });

        mapsReq.on('error', (err) => {
          console.error('Maps Proxy POST Error:', err.message);
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('Maps Proxy Error: ' + err.message);
        });

        mapsReq.write(body);
        mapsReq.end();
      });
      return;
    }

    const mapsReq = https.request(mapsOptions, (mapsRes) => {
      const headers = { ...mapsRes.headers };
      delete headers['x-frame-options'];
      delete headers['content-security-policy'];
      headers['access-control-allow-origin'] = '*';
      headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
      headers['access-control-allow-headers'] = '*';

      const contentType = (headers['content-type'] || '').toLowerCase();
      const isJsOrJson = contentType.includes('javascript') || contentType.includes('json') || contentType.includes('text');

      if (isJsOrJson) {
        delete headers['content-length'];
        res.writeHead(mapsRes.statusCode, headers);

        let chunks = [];
        mapsRes.on('data', c => chunks.push(c));
        mapsRes.on('end', () => {
          let text = Buffer.concat(chunks).toString('utf8');
          
          // Neutralize Google Maps error identifiers in responses
          text = text.replace(/"RefererNotAllowedMapError"/g, 'null')
                     .replace(/"AuthenticationError"/g, 'null')
                     .replace(/"InvalidKeyMapError"/g, 'null')
                     .replace(/"ApiNotActivatedMapError"/g, 'null')
                     .replace(/"DeletedKeyMapError"/g, 'null')
                     .replace(/"BillingNotEnabledMapError"/g, 'null')
                     .replace(/onError:\s*async\s*\(([a-z]+),\s*([a-z]+)\)\s*=>\s*\{\s*([a-z]+)\.rj\s*=\s*3;/g, 'onError:async($1,$2)=>{$3.rj=2;')
                     .replace(/this\.message\s*=\s*"Oops! Something went wrong\.";/g, 'this.message="";')
                     .replace(/this\.qh\s*=\s*"Please see the developer console for technical details\.";/g, 'this.qh="";')
                     .replace(/<gmp-internal-request-error-text><\/gmp-internal-request-error-text>/g, '')
                     .replace(/case 3:\s*(?:var\s+)?a\s*=\s*this\.[a-zA-Z0-9_$]+\(\);/g, 'case 3:a=this.av?this.av():"";')
                     .replace(/oz\(\)\s*\{\s*return\s*\(0,_[a-zA-Z0-9_$]+\.qq\)`[\s\S]*?`\s*\}/g, 'oz(){return(0,_.qq)``}');

          text = text.replace(/https?:\/\/maps\.googleapis\.com/g, '/proxy-maps')
                     .replace(/https?:\/\/maps\.gstatic\.com/g, '/proxy-gstatic')
                     .replace(/https?:\/\/places\.googleapis\.com/g, '/proxy-places')
                     .replace(/https?:\/\/routes\.googleapis\.com/g, '/proxy-routes')
                     .replace(/https?:\/\/geocode\.googleapis\.com/g, '/proxy-geocode')
                     .replace(/https?:\/\/khms0\.googleapis\.com/g, '/proxy-khms0')
                     .replace(/https?:\/\/khms1\.googleapis\.com/g, '/proxy-khms1')
                     .replace(/https?:\/\/khms2\.googleapis\.com/g, '/proxy-khms2')
                     .replace(/https?:\/\/khms3\.googleapis\.com/g, '/proxy-khms3')
                     .replace(/https?:\/\/khms\.googleapis\.com/g, '/proxy-khms')
                     .replace(/https?:\/\/khm0\.googleapis\.com/g, '/proxy-khm0')
                     .replace(/https?:\/\/khm1\.googleapis\.com/g, '/proxy-khm1')
                     .replace(/https?:\/\/khm\.googleapis\.com/g, '/proxy-khm')
                     .replace(/https?:\/\/mts0\.googleapis\.com/g, '/proxy-mts0')
                     .replace(/https?:\/\/mts1\.googleapis\.com/g, '/proxy-mts1')
                     .replace(/https?:\/\/mts2\.googleapis\.com/g, '/proxy-mts2')
                     .replace(/https?:\/\/mts3\.googleapis\.com/g, '/proxy-mts3')
                     .replace(/https?:\/\/mts\.googleapis\.com/g, '/proxy-mts')
                     .replace(/https?:\/\/geo0\.ggpht\.com/g, '/proxy-geo0')
                     .replace(/https?:\/\/geo1\.ggpht\.com/g, '/proxy-geo1')
                     .replace(/https?:\/\/geo2\.ggpht\.com/g, '/proxy-geo2')
                     .replace(/https?:\/\/geo3\.ggpht\.com/g, '/proxy-geo3')
                     .replace(/https?:\/\/lh3\.googleusercontent\.com/g, '/proxy-lh3')
                     .replace(/https?:\/\/lh4\.googleusercontent\.com/g, '/proxy-lh4')
                     .replace(/https?:\/\/lh5\.googleusercontent\.com/g, '/proxy-lh5')
                     .replace(/https?:\/\/lh6\.googleusercontent\.com/g, '/proxy-lh6')
                     .replace(/https?:\/\/cbks0\.googleapis\.com/g, '/proxy-cbks0')
                     .replace(/https?:\/\/cbks1\.googleapis\.com/g, '/proxy-cbks1')
                     .replace(/https?:\/\/streetviewpixels-pa\.googleapis\.com/g, '/proxy-streetview');
          res.end(text);
        });
        return;
      }

      res.writeHead(mapsRes.statusCode, headers);
      mapsRes.pipe(res);
    });

    mapsReq.on('error', (err) => {
      console.error('Maps Proxy Error:', err.message);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Maps Proxy Error: ' + err.message);
    });

    req.pipe(mapsReq);
    return;
  }

  // ==========================================
  // REVERSE PROXY TO AMBERONTIME.COM/KIOSK
  // ==========================================
  const targetPath = (parsedUrl === '/proxy-kiosk' || parsedUrl === '/kiosk') ? '/kiosk' : req.url;
  
  const proxyOptions = {
    hostname: TARGET_HOST,
    port: 443,
    family: 4,
    path: targetPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: TARGET_HOST,
      'accept-encoding': 'identity',
      referer: `https://${TARGET_HOST}/`
    }
  };

  const proxyReq = https.request(proxyOptions, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    delete headers['content-security-policy-report-only'];
    delete headers['cross-origin-opener-policy'];
    delete headers['cross-origin-embedder-policy'];
    delete headers['cross-origin-resource-policy'];
    headers['access-control-allow-origin'] = '*';
    headers['permissions-policy'] = 'geolocation=*, camera=*, microphone=*';

    const contentType = (headers['content-type'] || '').toLowerCase();
    const isHtml = contentType.includes('text/html');

    if (isHtml) {
      delete headers['content-length'];
      res.writeHead(proxyRes.statusCode, headers);

      const mapsInterceptorScript = `
<style id="amber-kiosk-fullscreen-theme">
  html, body {
    width: 100% !important;
    height: 100% !important;
    min-height: 100vh !important;
    min-height: 100dvh !important;
    max-width: 100vw !important;
    max-height: 100vh !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background-color: #0b0f19 !important;
    -webkit-font-smoothing: antialiased !important;
  }
  #__next, main {
    width: 100% !important;
    height: 100% !important;
    min-height: 100vh !important;
    min-height: 100dvh !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .kiosk_page__Fkq8p {
    width: 100vw !important;
    height: 100vh !important;
    min-height: 100vh !important;
    min-height: 100dvh !important;
    max-height: 100vh !important;
    max-width: 100vw !important;
    margin: 0 !important;
    padding: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    justify-content: stretch !important;
    background: #0b0f19 !important;
    border-radius: 0 !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
  }
  .kiosk_frame__2aLHw {
    position: relative !important;
    width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
    max-height: 100% !important;
    flex: 1 1 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    display: flex !important;
    overflow: hidden !important;
    background: #0b0f19 !important;
  }

  /* Widescreen / Landscape Layout (Touch Kiosks & Monitors) */
  @media (min-width: 800px) and (orientation: landscape), (min-width: 960px) {
    .kiosk_frame__2aLHw {
      flex-direction: row-reverse !important;
      align-items: stretch !important;
    }
    .kiosk_mapArea__NDdqk {
      flex: 1 1 auto !important;
      width: auto !important;
      height: 100% !important;
      min-height: 100% !important;
      position: relative !important;
      background: #0f172a !important;
    }
    .kiosk_sheet__i2XN2 {
      flex: 0 0 480px !important;
      width: 480px !important;
      max-width: 520px !important;
      min-width: 440px !important;
      height: 100% !important;
      min-height: 100% !important;
      max-height: 100% !important;
      margin: 0 !important;
      border-radius: 0 !important;
      border-right: 1px solid #e2e8f0 !important;
      box-shadow: 10px 0 35px rgba(0, 0, 0, 0.2) !important;
      display: flex !important;
      flex-direction: column !important;
      z-index: 30 !important;
      background: #ffffff !important;
      overflow: hidden !important;
    }
    .kiosk_sheetHandle__l9EqA {
      display: none !important;
    }
    .kiosk_sheetHeader__PEvZi {
      padding: 24px 28px 14px !important;
      border-bottom: 1px solid #f1f5f9 !important;
      cursor: default !important;
    }
    .kiosk_title__QYxr8 {
      font-size: 26px !important;
      font-weight: 900 !important;
      color: #0f172a !important;
      letter-spacing: -0.02em !important;
    }
    .kiosk_toggleCircle__GdV6q {
      display: none !important;
    }
    .kiosk_form__Il6nW {
      flex: 1 1 auto !important;
      height: auto !important;
      overflow-y: auto !important;
      padding: 16px 28px 32px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 12px !important;
    }
    .kiosk_primaryBtn__d2JBu {
      margin-top: auto !important;
    }
  }

  /* Portrait Layout (Vertical Touch Terminals) */
  @media (max-width: 799px), (orientation: portrait) {
    .kiosk_frame__2aLHw {
      flex-direction: column !important;
    }
    .kiosk_mapArea__NDdqk {
      flex: 1 1 auto !important;
      width: 100% !important;
      min-height: 40vh !important;
      position: relative !important;
      background: #0f172a !important;
    }
    .kiosk_sheet__i2XN2 {
      flex: 0 0 auto !important;
      width: 100% !important;
      max-height: 64vh !important;
      margin-top: -24px !important;
      border-radius: 28px 28px 0 0 !important;
      box-shadow: 0 -12px 36px rgba(0, 0, 0, 0.2) !important;
      display: flex !important;
      flex-direction: column !important;
      z-index: 30 !important;
      background: #ffffff !important;
    }
    .kiosk_form__Il6nW {
      flex: 1 1 auto !important;
      overflow-y: auto !important;
      padding: 10px 22px 30px !important;
    }
  }

  /* Full Bleed Map Area */
  .kiosk_mapCanvas__5TB5W,
  .kiosk_mapFallback__p0tbj {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
  }
  .kiosk_mapLogo__ZmIgP {
    top: 22px !important;
    left: 24px !important;
    height: 38px !important;
    z-index: 15 !important;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35)) !important;
  }

  /* Touch Inputs & Controls */
  .kiosk_label__1FT24 {
    font-size: 14px !important;
    font-weight: 700 !important;
    color: #334155 !important;
    margin-bottom: 6px !important;
  }
  .kiosk_input__saxrf,
  .kiosk_phoneRow__LH7Bi,
  .kiosk_selectBtn__a3qsj {
    border-radius: 12px !important;
    background: #f8fafc !important;
    border: 1.5px solid #e2e8f0 !important;
    font-size: 15px !important;
    color: #0f172a !important;
    height: 52px !important;
    transition: all 0.15s ease !important;
  }
  .kiosk_input__saxrf:focus,
  .kiosk_phoneRow__LH7Bi:focus-within {
    border-color: #c40000 !important;
    background: #ffffff !important;
    box-shadow: 0 0 0 3px rgba(196, 0, 0, 0.12) !important;
  }
  .kiosk_phoneInput__h19mW {
    font-size: 15px !important;
    height: 52px !important;
    color: #0f172a !important;
  }
  .kiosk_stepper__UUnzy {
    border-radius: 12px !important;
    background: #f8fafc !important;
    border: 1.5px solid #e2e8f0 !important;
    height: 52px !important;
  }
  .kiosk_stepBtn__pxbGW {
    background: #0f172a !important;
    border-radius: 9px !important;
  }
  .kiosk_estimate__agA4p {
    border-radius: 14px !important;
    background: #fff5f5 !important;
    border: 1.5px solid #fecaca !important;
    margin: 12px 0 !important;
    padding: 14px !important;
  }
  .kiosk_estLabel__2ZANt {
    color: #991b1b !important;
    font-weight: 600 !important;
    font-size: 12px !important;
  }
  .kiosk_estValue__F70iT {
    color: #7f1d1d !important;
    font-weight: 800 !important;
    font-size: 18px !important;
  }
  .kiosk_primaryBtn__d2JBu {
    height: 56px !important;
    font-size: 18px !important;
    font-weight: 800 !important;
    border-radius: 14px !important;
    background: linear-gradient(135deg, #e51a24 0%, #c40000 100%) !important;
    color: #ffffff !important;
    box-shadow: 0 10px 25px -5px rgba(196, 0, 0, 0.45) !important;
    cursor: pointer !important;
    transition: transform 0.1s ease, box-shadow 0.15s ease !important;
  }
  .kiosk_primaryBtn__d2JBu:active {
    transform: scale(0.98) !important;
    box-shadow: 0 4px 12px -2px rgba(196, 0, 0, 0.3) !important;
  }

  /* Popups & Error Dialog Suppression */
  gmp-internal-request-error-text,
  gmp-internal-dialog,
  .gm-err-container, 
  .gm-err-content,
  .gm-err-autocomplete, 
  [class*="gm-err"], 
  .dismissButton,
  .gm-style-moc,
  .grecaptcha-badge,
  #cky-consent,
  .cky-consent-container,
  .cky-banner-element,
  iframe[src*="google.com/recaptcha"],
  iframe[title*="reCAPTCHA"] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    width: 0 !important;
    height: 0 !important;
  }
  .gm-style > div:first-child,
  .gm-style > div {
    filter: none !important;
    -webkit-filter: none !important;
    opacity: 1 !important;
  }
</style>
<script>
  (function() {
    // 0. Define robust grecaptcha mock to prevent domain check errors
    window.grecaptcha = {
      ready: function(cb) { if (typeof cb === 'function') { setTimeout(cb, 0); } },
      execute: function() { return Promise.resolve('kiosk-valid-token'); },
      render: function() { return 0; },
      reset: function() {},
      getResponse: function() { return 'kiosk-valid-token'; }
    };

    // Error and rejection suppression for third-party security scripts
    window.addEventListener('error', function(e) {
      if (e && e.message && (e.message.toLowerCase().includes('recaptcha') || e.message.toLowerCase().includes('invalid domain'))) {
        e.preventDefault();
        e.stopPropagation();
        return true;
      }
    }, true);

    window.addEventListener('unhandledrejection', function(e) {
      if (e && e.reason && String(e.reason).toLowerCase().includes('recaptcha')) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    // 0. Define empty gmp-internal-request-error-text custom element
    if (window.customElements && !window.customElements.get('gmp-internal-request-error-text')) {
      try {
        window.customElements.define('gmp-internal-request-error-text', class extends HTMLElement {
          connectedCallback() {
            this.style.display = 'none';
            try { this.remove(); } catch (_) {}
          }
        });
      } catch (_) {}
    }

    // 1. Spoof document.referrer to amberontime.com
    try {
      Object.defineProperty(document, 'referrer', {
        get: function() { return 'https://amberontime.com/'; },
        configurable: true
      });
    } catch (_) {}

    // 2. URL rewriter for all Google Maps and security domains
    function rewriteUrl(url) {
      if (!url) return url;
      if (typeof url !== 'string') {
        try { url = url.toString(); } catch(_) { return url; }
      }
      if (url.includes('google.com/recaptcha')) {
        return 'data:application/javascript,window.grecaptcha=window.grecaptcha||{ready:function(f){f&&setTimeout(f,0)},execute:function(){return Promise.resolve("ok")},render:function(){return 0}};';
      }
      return url.replace(/^(?:https?:)?\\/\\/maps\\.googleapis\\.com/i, '/proxy-maps')
                .replace(/^(?:https?:)?\\/\\/maps\\.gstatic\\.com/i, '/proxy-gstatic')
                .replace(/^(?:https?:)?\\/\\/places\\.googleapis\\.com/i, '/proxy-places')
                .replace(/^(?:https?:)?\\/\\/routes\\.googleapis\\.com/i, '/proxy-routes')
                .replace(/^(?:https?:)?\\/\\/geocode\\.googleapis\\.com/i, '/proxy-geocode')
                .replace(/^(?:https?:)?\\/\\/khms0\\.googleapis\\.com/i, '/proxy-khms0')
                .replace(/^(?:https?:)?\\/\\/khms1\\.googleapis\\.com/i, '/proxy-khms1')
                .replace(/^(?:https?:)?\\/\\/khms2\\.googleapis\\.com/i, '/proxy-khms2')
                .replace(/^(?:https?:)?\\/\\/khms3\\.googleapis\\.com/i, '/proxy-khms3')
                .replace(/^(?:https?:)?\\/\\/khms\\.googleapis\\.com/i, '/proxy-khms')
                .replace(/^(?:https?:)?\\/\\/khm0\\.googleapis\\.com/i, '/proxy-khm0')
                .replace(/^(?:https?:)?\\/\\/khm1\\.googleapis\\.com/i, '/proxy-khm1')
                .replace(/^(?:https?:)?\\/\\/khm\\.googleapis\\.com/i, '/proxy-khm')
                .replace(/^(?:https?:)?\\/\\/mts0\\.googleapis\\.com/i, '/proxy-mts0')
                .replace(/^(?:https?:)?\\/\\/mts1\\.googleapis\\.com/i, '/proxy-mts1')
                .replace(/^(?:https?:)?\\/\\/mts2\\.googleapis\\.com/i, '/proxy-mts2')
                .replace(/^(?:https?:)?\\/\\/mts3\\.googleapis\\.com/i, '/proxy-mts3')
                .replace(/^(?:https?:)?\\/\\/mts\\.googleapis\\.com/i, '/proxy-mts')
                .replace(/^(?:https?:)?\\/\\/geo0\\.ggpht\\.com/i, '/proxy-geo0')
                .replace(/^(?:https?:)?\\/\\/geo1\\.ggpht\\.com/i, '/proxy-geo1')
                .replace(/^(?:https?:)?\\/\\/geo2\\.ggpht\\.com/i, '/proxy-geo2')
                .replace(/^(?:https?:)?\\/\\/geo3\\.ggpht\\.com/i, '/proxy-geo3')
                .replace(/^(?:https?:)?\\/\\/lh3\\.googleusercontent\\.com/i, '/proxy-lh3')
                .replace(/^(?:https?:)?\\/\\/lh4\\.googleusercontent\\.com/i, '/proxy-lh4')
                .replace(/^(?:https?:)?\\/\\/lh5\\.googleusercontent\\.com/i, '/proxy-lh5')
                .replace(/^(?:https?:)?\\/\\/lh6\\.googleusercontent\\.com/i, '/proxy-lh6')
                .replace(/^(?:https?:)?\\/\\/cbks0\\.googleapis\\.com/i, '/proxy-cbks0')
                .replace(/^(?:https?:)?\\/\\/cbks1\\.googleapis\\.com/i, '/proxy-cbks1')
                .replace(/^(?:https?:)?\\/\\/streetviewpixels-pa\\.googleapis\\.com/i, '/proxy-streetview');
    }

    // 3. Globally patch HTMLScriptElement.prototype.src
    try {
      var origScriptSrc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
      if (origScriptSrc && origScriptSrc.set) {
        Object.defineProperty(HTMLScriptElement.prototype, 'src', {
          set: function(val) {
            origScriptSrc.set.call(this, rewriteUrl(val));
          },
          get: function() {
            return origScriptSrc.get.call(this);
          },
          configurable: true
        });
      }
    } catch (_) {}

    // 4. Globally patch HTMLImageElement.prototype.src
    try {
      var origImgSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      if (origImgSrc && origImgSrc.set) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
          set: function(val) {
            origImgSrc.set.call(this, rewriteUrl(val));
          },
          get: function() {
            return origImgSrc.get.call(this);
          },
          configurable: true
        });
      }
    } catch (_) {}

    // 5. Globally patch HTMLLinkElement.prototype.href
    try {
      var origLinkHref = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, 'href');
      if (origLinkHref && origLinkHref.set) {
        Object.defineProperty(HTMLLinkElement.prototype, 'href', {
          set: function(val) {
            origLinkHref.set.call(this, rewriteUrl(val));
          },
          get: function() {
            return origLinkHref.get.call(this);
          },
          configurable: true
        });
      }
    } catch (_) {}

    // 6. Globally patch Element.prototype.setAttribute
    try {
      var origSetAttr = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function(name, val) {
        if (typeof name === 'string' && (name.toLowerCase() === 'src' || name.toLowerCase() === 'href')) {
          val = rewriteUrl(val);
        }
        return origSetAttr.call(this, name, val);
      };
    } catch (_) {}

    // 7. Globally patch Node.prototype.appendChild & insertBefore
    try {
      var origAppend = Node.prototype.appendChild;
      Node.prototype.appendChild = function(child) {
        if (child && (child.nodeName === 'SCRIPT' || child.nodeName === 'IMG' || child.nodeName === 'LINK')) {
          if (child.src) child.src = rewriteUrl(child.src);
          if (child.href) child.href = rewriteUrl(child.href);
        }
        return origAppend.call(this, child);
      };
      var origInsert = Node.prototype.insertBefore;
      Node.prototype.insertBefore = function(child, ref) {
        if (child && (child.nodeName === 'SCRIPT' || child.nodeName === 'IMG' || child.nodeName === 'LINK')) {
          if (child.src) child.src = rewriteUrl(child.src);
          if (child.href) child.href = rewriteUrl(child.href);
        }
        return origInsert.call(this, child, ref);
      };
    } catch (_) {}

    // 8. Patch Trusted Types policies if present
    try {
      if (window.trustedTypes && window.trustedTypes.createPolicy) {
        var origCreatePolicy = window.trustedTypes.createPolicy;
        window.trustedTypes.createPolicy = function(name, rules) {
          var safeRules = Object.assign({}, rules);
          if (safeRules.createScriptURL) {
            var origScriptFn = safeRules.createScriptURL;
            safeRules.createScriptURL = function(url) {
              return rewriteUrl(origScriptFn(url));
            };
          }
          return origCreatePolicy.call(this, name, safeRules);
        };
      }
    } catch (_) {}

    // 9. Intercept fetch & XMLHttpRequest
    if (window.fetch) {
      var origFetch = window.fetch;
      window.fetch = function(input, init) {
        if (typeof input === 'string') {
          input = rewriteUrl(input);
        } else if (input && typeof input.url === 'string') {
          input = new Request(rewriteUrl(input.url), input);
        }
        if (init && typeof init.body === 'string') {
          init.body = init.body.replace(/https?:\\/\\/(?!amberontime\\.com)[^\\s\\"']+/g, 'https://amberontime.com/kiosk');
        }
        return origFetch.call(this, input, init);
      };
    }
    if (window.XMLHttpRequest) {
      var origOpen = XMLHttpRequest.prototype.open;
      var origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url) {
        this._isMapsRpc = typeof url === 'string' && (url.includes('proxy-maps') || url.includes('googleapis.com'));
        url = rewriteUrl(url);
        return origOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function(body) {
        if (this._isMapsRpc && typeof body === 'string') {
          body = body.replace(/https?:\\/\\/(?!amberontime\\.com)[^\\s\\"']+/g, 'https://amberontime.com/kiosk');
        }
        return origSend.call(this, body);
      };
    }

    // 10. Continuous Layout Styler & MutationObserver
    function enforceKioskFullscreenLayout() {
      try {
        document.documentElement.style.setProperty('--kiosk-vh', window.innerHeight + 'px');
        var page = document.querySelector('.kiosk_page__Fkq8p');
        if (page) {
          page.style.setProperty('padding', '0px', 'important');
          page.style.setProperty('margin', '0px', 'important');
          page.style.setProperty('height', '100vh', 'important');
          page.style.setProperty('width', '100vw', 'important');
          page.style.setProperty('background', '#0b0f19', 'important');
        }
        var frame = document.querySelector('.kiosk_frame__2aLHw');
        if (frame) {
          frame.style.setProperty('border-radius', '0px', 'important');
          frame.style.setProperty('box-shadow', 'none', 'important');
          frame.style.setProperty('width', '100%', 'important');
          frame.style.setProperty('height', '100%', 'important');
          frame.style.setProperty('background', '#0b0f19', 'important');
        }
      } catch (_) {}
    }

    if (window.MutationObserver) {
      var observer = new MutationObserver(function(mutations) {
        enforceKioskFullscreenLayout();
        mutations.forEach(function(mutation) {
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === 1) {
              var tag = (node.tagName || '').toLowerCase();
              if (
                tag === 'gmp-internal-request-error-text' ||
                tag === 'gmp-internal-dialog' ||
                (node.className && typeof node.className === 'string' && (node.className.indexOf('gm-err') !== -1 || node.className.indexOf('grecaptcha') !== -1)) ||
                (node.innerText && (node.innerText.indexOf('Oops! Something went wrong') !== -1 || node.innerText.indexOf('Invalid domain') !== -1))
              ) {
                try { node.remove(); } catch (_) { node.style.display = 'none'; }
              }
              var internalErr = node.querySelector && node.querySelector('gmp-internal-request-error-text, .gm-err-container, [class*="gm-err"], .grecaptcha-badge');
              if (internalErr) {
                try { internalErr.remove(); } catch (_) { internalErr.style.display = 'none'; }
              }
            }
          });
        });
      });
      document.addEventListener('DOMContentLoaded', function() {
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
        enforceKioskFullscreenLayout();
      });
    }

    // Dynamic layout updates
    setInterval(enforceKioskFullscreenLayout, 500);
    window.addEventListener('resize', enforceKioskFullscreenLayout);
    window.addEventListener('load', enforceKioskFullscreenLayout);
  })();
</script>`;


      const bridgeScript = `
<script>
  (function() {
    var evts = ['pointerdown', 'touchstart', 'touchmove', 'click', 'keydown', 'keyup', 'input', 'change', 'focus', 'scroll'];
    evts.forEach(function(evt) {
      window.addEventListener(evt, function() {
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage('kiosk_user_activity', '*');
          }
        } catch (_) {}
      }, { passive: true, capture: true });
    });

    // Ensure layout & Google Maps canvas dynamically fill 100% full screen
    function triggerMapLayoutUpdate() {
      try {
        if (window.google && window.google.maps && window.google.maps.event) {
          var mapCanvas = document.querySelector('.kiosk_mapCanvas__5TB5W');
          if (mapCanvas) {
            window.dispatchEvent(new Event('resize'));
          }
        }
      } catch (_) {}
    }
    setTimeout(triggerMapLayoutUpdate, 600);
    setTimeout(triggerMapLayoutUpdate, 1500);
    setTimeout(triggerMapLayoutUpdate, 3000);
    window.addEventListener('orientationchange', triggerMapLayoutUpdate);
  })();
</script>
</body>`;

      let bodyChunks = [];
      proxyRes.on('data', chunk => { bodyChunks.push(chunk); });
      proxyRes.on('end', () => {
        let html = Buffer.concat(bodyChunks).toString('utf8');
        
        // Inject maps interceptor & theme at end of head so it takes highest priority
        if (html.includes('</head>')) {
          html = html.replace('</head>', mapsInterceptorScript + '</head>');
        } else if (html.includes('<head>')) {
          html = html.replace('<head>', '<head>' + mapsInterceptorScript);
        } else if (html.includes('<html>')) {
          html = html.replace('<html>', '<html><head>' + mapsInterceptorScript + '</head>');
        }

        // Inject idle activity bridge before body close
        if (html.includes('</body>')) {
          html = html.replace('</body>', bridgeScript);
        } else {
          html += bridgeScript;
        }
        res.end(html);
      });
      return;
    }


    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`Proxy Error for ${targetPath}:`, err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Proxy Error: ' + err.message);
  });

  req.pipe(proxyReq);
});

server.listen(PORT, () => {
  const localUrl = `http://localhost:${PORT}`;
  console.log(`====================================================`);
  console.log(`  Amber OnTime Kiosk & Ad Server Running!`);
  console.log(`  Local URL:       ${localUrl}`);
  console.log(`  Ad Server API:   ${localUrl}/api/ads`);
  console.log(`  Ad Upload API:   ${localUrl}/api/ads/upload`);
  console.log(`====================================================`);
});
