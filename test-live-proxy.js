const https = require('https');

https.get('https://amberontimekiosk-1.onrender.com/proxy-maps/maps/api/js?libraries=places', (res) => {
  console.log('Status on Render for /proxy-maps:', res.statusCode);
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Body length:', data.length);
    console.log('Preview:', data.substring(0, 200));
  });
}).on('error', console.error);
