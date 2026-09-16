const https = require('https');

https.get('https://amberontime.com/_next/static/chunks/webpack-411438da007a4c7b.js', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    // Find u.u function which maps chunkId to filename
    const uMatch = data.match(/a\.u=function\([^)]*\)\{[^}]*\}/);
    console.log('Chunk path resolver:', uMatch ? uMatch[0] : 'not found');
    const pMatch = data.match(/\{[^}]*8367[^}]*\}/g);
    console.log('Object with 8367:', pMatch);
  });
});
