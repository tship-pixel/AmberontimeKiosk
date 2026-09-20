const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const TARGET_HOST = 'amberontime.com';
const ADS_JSON_PATH = path.join(__dirname, 'ads.json');
const AD_LOG_PATH = path.join(__dirname, 'ad_analytics_log.txt');
const AD_STATS_PATH = path.join(__dirname, 'ad_stats.json');
const KIOSKS_JSON_PATH = path.join(__dirname, 'kiosks.json');
const IMG_DIR = path.join(__dirname, 'img');

// Ensure img directory exists
if (!fs.existsSync(IMG_DIR)) {
  fs.mkdirSync(IMG_DIR, { recursive: true });
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
    fs.readFile(ADS_JSON_PATH, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
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

        let mediaPath = 'img/ad1.jpg'; // default
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
          } catch (e) {
            currentAds = [];
          }
        }
        currentAds.unshift(newAd);
        fs.writeFileSync(ADS_JSON_PATH, JSON.stringify(currentAds, null, 2));

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
  // ROUTE ALIASES: /main, /hub, /kiosks -> Main/main.html
  // ==========================================
  if (parsedUrl === '/main' || parsedUrl === '/Main' || parsedUrl === '/hub' || parsedUrl === '/kiosks') {
    const mainHtmlPath = path.join(__dirname, 'Main', 'main.html');
    if (fs.existsSync(mainHtmlPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(mainHtmlPath).pipe(res);
      return;
    }
  }

  // ==========================================
  // STATIC FILES & VIDEO STREAMING (index.html, img/*, css/*, js/*)
  // ==========================================
  const localFilePath = path.join(__dirname, parsedUrl === '/' ? 'index.html' : parsedUrl);

  if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).isFile() && !parsedUrl.startsWith('/_next') && parsedUrl !== '/kiosk') {
    const extname = String(path.extname(localFilePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';
    const stat = fs.statSync(localFilePath);
    const fileSize = stat.size;
    const range = req.headers.range;

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
      };
      res.writeHead(206, head);
      file.pipe(res);
      return;
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
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
    const mapsPath = req.url.replace(new RegExp('^' + matchedProxyPrefix), '') || '/';

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
        
        // Universally rewrite any non-amberontime client URLs in payload (localhost, onrender, custom domain) to amberontime.com/kiosk
        body = body.replace(/https?:\/\/(?!amberontime\.com)[^\s\"']+/g, 'https://amberontime.com/kiosk')
                   .replace(/file:\/\/[^\s\"']*/g, 'https://amberontime.com/kiosk');

        mapsOptions.headers['content-length'] = Buffer.byteLength(body);

        const mapsReq = https.request(mapsOptions, (mapsRes) => {
          const headers = { ...mapsRes.headers };
          delete headers['x-frame-options'];
          delete headers['content-security-policy'];
          headers['access-control-allow-origin'] = '*';
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
  const targetPath = parsedUrl === '/proxy-kiosk' ? '/kiosk' : req.url;
  
  const proxyOptions = {
    hostname: TARGET_HOST,
    port: 443,
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
    headers['access-control-allow-origin'] = '*';
    headers['permissions-policy'] = 'geolocation=*, camera=*, microphone=*';

    const contentType = (headers['content-type'] || '').toLowerCase();
    const isHtml = contentType.includes('text/html');

    if (isHtml) {
      delete headers['content-length'];
      res.writeHead(proxyRes.statusCode, headers);

      const mapsInterceptorScript = `
<style>
  .gm-err-container, .gm-err-autocomplete, [class*="gm-err"], .dismissButton {
    display: none !important;
  }
</style>
<script>
  (function() {
    function rewriteUrl(url) {
      if (typeof url !== 'string') return url;
      return url.replace(/^https?:\\/\\/maps\\.googleapis\\.com/, '/proxy-maps')
                .replace(/^https?:\\/\\/maps\\.gstatic\\.com/, '/proxy-gstatic')
                .replace(/^https?:\\/\\/places\\.googleapis\\.com/, '/proxy-places')
                .replace(/^https?:\\/\\/routes\\.googleapis\\.com/, '/proxy-routes')
                .replace(/^https?:\\/\\/geocode\\.googleapis\\.com/, '/proxy-geocode')
                .replace(/^https?:\\/\\/khms0\\.googleapis\\.com/, '/proxy-khms0')
                .replace(/^https?:\\/\\/khms1\\.googleapis\\.com/, '/proxy-khms1')
                .replace(/^https?:\\/\\/khms2\\.googleapis\\.com/, '/proxy-khms2')
                .replace(/^https?:\\/\\/khms3\\.googleapis\\.com/, '/proxy-khms3')
                .replace(/^https?:\\/\\/khms\\.googleapis\\.com/, '/proxy-khms')
                .replace(/^https?:\\/\\/khm0\\.googleapis\\.com/, '/proxy-khm0')
                .replace(/^https?:\\/\\/khm1\\.googleapis\\.com/, '/proxy-khm1')
                .replace(/^https?:\\/\\/khm\\.googleapis\\.com/, '/proxy-khm')
                .replace(/^https?:\\/\\/mts0\\.googleapis\\.com/, '/proxy-mts0')
                .replace(/^https?:\\/\\/mts1\\.googleapis\\.com/, '/proxy-mts1')
                .replace(/^https?:\\/\\/mts2\\.googleapis\\.com/, '/proxy-mts2')
                .replace(/^https?:\\/\\/mts3\\.googleapis\\.com/, '/proxy-mts3')
                .replace(/^https?:\\/\\/mts\\.googleapis\\.com/, '/proxy-mts')
                .replace(/^https?:\\/\\/geo0\\.ggpht\\.com/, '/proxy-geo0')
                .replace(/^https?:\\/\\/geo1\\.ggpht\\.com/, '/proxy-geo1')
                .replace(/^https?:\\/\\/geo2\\.ggpht\\.com/, '/proxy-geo2')
                .replace(/^https?:\\/\\/geo3\\.ggpht\\.com/, '/proxy-geo3')
                .replace(/^https?:\\/\\/lh3\\.googleusercontent\\.com/, '/proxy-lh3')
                .replace(/^https?:\\/\\/lh4\\.googleusercontent\\.com/, '/proxy-lh4')
                .replace(/^https?:\\/\\/lh5\\.googleusercontent\\.com/, '/proxy-lh5')
                .replace(/^https?:\\/\\/lh6\\.googleusercontent\\.com/, '/proxy-lh6')
                .replace(/^https?:\\/\\/cbks0\\.googleapis\\.com/, '/proxy-cbks0')
                .replace(/^https?:\\/\\/cbks1\\.googleapis\\.com/, '/proxy-cbks1')
                .replace(/^https?:\\/\\/streetviewpixels-pa\\.googleapis\\.com/, '/proxy-streetview');
    }

    var origCreateElement = document.createElement;
    document.createElement = function(tagName, options) {
      var el = origCreateElement.call(document, tagName, options);
      if (tagName && typeof tagName === 'string') {
        var tagLower = tagName.toLowerCase();
        if (tagLower === 'script' || tagLower === 'img' || tagLower === 'link') {
          var origSetAttribute = el.setAttribute;
          el.setAttribute = function(name, val) {
            if (name && (name.toLowerCase() === 'src' || name.toLowerCase() === 'href')) {
              val = rewriteUrl(val);
            }
            return origSetAttribute.call(el, name, val);
          };
          if (tagLower === 'script') {
            try {
              var origSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
              Object.defineProperty(el, 'src', {
                set: function(val) {
                  val = rewriteUrl(val);
                  if (origSrcDescriptor && origSrcDescriptor.set) {
                    origSrcDescriptor.set.call(el, val);
                  } else {
                    el.setAttribute('src', val);
                  }
                },
                get: function() {
                  return (origSrcDescriptor && origSrcDescriptor.get) ? origSrcDescriptor.get.call(el) : el.getAttribute('src');
                },
                configurable: true
              });
            } catch (_) {}
          }
        }
      }
      return el;
    };

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
  })();
</script>
</body>`;

      let bodyChunks = [];
      proxyRes.on('data', chunk => { bodyChunks.push(chunk); });
      proxyRes.on('end', () => {
        let html = Buffer.concat(bodyChunks).toString('utf8');
        
        // Inject maps interceptor in head
        if (html.includes('<head>')) {
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
