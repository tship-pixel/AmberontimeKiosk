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

    const contentType = (headers['content-type'] || '').toLowerCase();
    const isHtml = contentType.includes('text/html');

    if (isHtml) {
      delete headers['content-length'];
      res.writeHead(proxyRes.statusCode, headers);

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
