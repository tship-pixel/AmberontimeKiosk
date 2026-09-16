/**
 * Automated Test Suite for Amber OnTime Kiosk Ad Server
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

// 1. Start server internally on a test port or 3000
const PORT = 3001;
process.env.PORT = PORT;

// Start server on 3001
const server = require('./server.js');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n🔍 --- STARTING AD SERVER DIAGNOSTIC TESTS ---\n');
  let passed = 0;
  let failed = 0;

  // Test 1: Static Files (index.html)
  try {
    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/',
      method: 'GET'
    });
    if (res.statusCode === 200 && res.body.includes('Amber OnTime')) {
      console.log('✅ TEST 1: GET / (Web Kiosk UI) -> OK (200)');
      passed++;
    } else {
      console.log(`❌ TEST 1: GET / -> FAILED (${res.statusCode})`);
      failed++;
    }
  } catch (err) {
    console.log(`❌ TEST 1: GET / -> ERROR: ${err.message}`);
    failed++;
  }

  // Test 2: GET /api/ads
  try {
    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/ads',
      method: 'GET'
    });
    const json = JSON.parse(res.body);
    if (res.statusCode === 200 && Array.isArray(json)) {
      console.log(`✅ TEST 2: GET /api/ads -> OK (200), returned ${json.length} active slides`);
      passed++;
    } else {
      console.log(`❌ TEST 2: GET /api/ads -> FAILED (${res.statusCode})`);
      failed++;
    }
  } catch (err) {
    console.log(`❌ TEST 2: GET /api/ads -> ERROR: ${err.message}`);
    failed++;
  }

  // Test 3: POST /api/ads/upload (PNG Image Upload)
  let createdPngAdId = null;
  try {
    // 1x1 transparent PNG in base64
    const samplePngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const payload = JSON.stringify({
      title: 'Server Test PNG Ad',
      tagline: 'Automated diagnostic test slide',
      badge: 'Test Pass',
      features: ['⚡ Fast Test', '🔒 Verified'],
      type: 'image',
      mediaBase64: samplePngBase64
    });

    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/ads/upload',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, payload);

    const json = JSON.parse(res.body);
    if (res.statusCode === 200 && json.success && json.ad.mediaUrl.endsWith('.png')) {
      console.log(`✅ TEST 3: POST /api/ads/upload (PNG Image) -> OK (200), saved as ${json.ad.mediaUrl}`);
      createdPngAdId = json.ad.id;
      passed++;
    } else {
      console.log(`❌ TEST 3: POST /api/ads/upload (PNG Image) -> FAILED`, json);
      failed++;
    }
  } catch (err) {
    console.log(`❌ TEST 3: POST /api/ads/upload -> ERROR: ${err.message}`);
    failed++;
  }

  // Test 4: POST /api/ads/upload (MP4 Video Upload)
  let createdMp4AdId = null;
  try {
    const sampleMp4Base64 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAtsZGF0';
    const payload = JSON.stringify({
      title: 'Server Test MP4 Video Ad',
      tagline: 'Automated video test slide',
      badge: 'Video Test',
      features: ['🎬 HD Video', '🔁 Loop'],
      type: 'video',
      mediaBase64: sampleMp4Base64
    });

    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/ads/upload',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, payload);

    const json = JSON.parse(res.body);
    if (res.statusCode === 200 && json.success && json.ad.mediaUrl.endsWith('.mp4') && json.ad.type === 'video') {
      console.log(`✅ TEST 4: POST /api/ads/upload (MP4 Video) -> OK (200), saved as ${json.ad.mediaUrl}`);
      createdMp4AdId = json.ad.id;
      passed++;
    } else {
      console.log(`❌ TEST 4: POST /api/ads/upload (MP4 Video) -> FAILED`, json);
      failed++;
    }
  } catch (err) {
    console.log(`❌ TEST 4: POST /api/ads/upload (MP4 Video) -> ERROR: ${err.message}`);
    failed++;
  }

  // Test 5: POST /api/ads/log (Log Ad Display & Duration)
  try {
    const logPayload = JSON.stringify({
      adId: 'taxi-ad-1',
      title: 'Book Your Taxi in Seconds',
      type: 'image',
      durationSec: 6.5,
      timestamp: new Date().toISOString()
    });

    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/ads/log',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(logPayload)
      }
    }, logPayload);

    const json = JSON.parse(res.body);
    if (res.statusCode === 200 && json.success && json.stats.impressions >= 1) {
      console.log(`✅ TEST 5: POST /api/ads/log -> OK (200), recorded ${json.stats.impressions} views, ${json.stats.totalAirTimeSec}s airtime`);
      passed++;
    } else {
      console.log(`❌ TEST 5: POST /api/ads/log -> FAILED`, json);
      failed++;
    }
  } catch (err) {
    console.log(`❌ TEST 5: POST /api/ads/log -> ERROR: ${err.message}`);
    failed++;
  }

  // Test 6: GET /api/ads/logs (Check log text file)
  try {
    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/ads/logs',
      method: 'GET'
    });
    if (res.statusCode === 200 && res.body.includes('AMBER ONTIME KIOSK - ADVERTISEMENT DISPLAY & PLAYTIME LOG')) {
      console.log('✅ TEST 6: GET /api/ads/logs (ad_analytics_log.txt) -> OK (200), formatted log text verified');
      passed++;
    } else {
      console.log(`❌ TEST 6: GET /api/ads/logs -> FAILED (${res.statusCode})`);
      failed++;
    }
  } catch (err) {
    console.log(`❌ TEST 6: GET /api/ads/logs -> ERROR: ${err.message}`);
    failed++;
  }

  // Test 7: DELETE /api/ads/:id (Cleanup)
  if (createdPngAdId) {
    try {
      const res = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: `/api/ads/${createdPngAdId}`,
        method: 'DELETE'
      });
      const json = JSON.parse(res.body);
      if (res.statusCode === 200 && json.success) {
        console.log(`✅ TEST 5: DELETE /api/ads/${createdPngAdId} -> OK (200) cleaned up`);
        passed++;
      } else {
        console.log(`❌ TEST 5: DELETE -> FAILED (${res.statusCode})`);
        failed++;
      }
    } catch (err) {
      console.log(`❌ TEST 5: DELETE -> ERROR: ${err.message}`);
      failed++;
    }
  }

  if (createdMp4AdId) {
    try {
      await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: `/api/ads/${createdMp4AdId}`,
        method: 'DELETE'
      });
    } catch (_) {}
  }

  console.log('\n----------------------------------------');
  console.log(`📊 SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('----------------------------------------\n');
  process.exit(failed > 0 ? 1 : 0);
}

// Give server 500ms to start
setTimeout(runTests, 500);
