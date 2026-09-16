const https = require('https');

function fetchChunk(path) {
  return new Promise((resolve) => {
    https.get('https://amberontime.com' + path, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

async function run() {
  const chunks = [
    '/_next/static/chunks/app/kiosk/page-09ddebddbc5b04dc.js',
    '/_next/static/chunks/9276-ff21e7ce8993c46b.js',
    '/_next/static/chunks/5810-c10886ed9dcf1e96.js',
    '/_next/static/chunks/5210-85546a8e6c59e062.js',
    '/_next/static/chunks/5793-3d0bda234978bf0c.js',
    '/_next/static/chunks/8172-4c781a91df06ca4a.js'
  ];

  for (const c of chunks) {
    const data = await fetchChunk(c);
    if (data.includes('maps.google') || data.includes('google.maps') || data.includes('maps/api')) {
      console.log('Found maps in:', c);
      const matches = data.match(/.{0,100}(?:maps\.google|google\.maps|maps\/api).{0,100}/g);
      console.log('Matches:', matches ? matches.slice(0, 5) : 'none');
    }
  }
}

run();
