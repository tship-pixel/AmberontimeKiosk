const https = require('https');

https.get('https://amberontimekiosk-1.onrender.com/proxy-kiosk', (res) => {
  console.log('Status on Render for /proxy-kiosk:', res.statusCode);
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Contains mapsInterceptorScript:', data.includes('/proxy-maps'));
    console.log('Contains bridgeScript:', data.includes('kiosk_user_activity'));
    console.log('HTML preview:\n', data.substring(0, 400));
  });
}).on('error', console.error);
