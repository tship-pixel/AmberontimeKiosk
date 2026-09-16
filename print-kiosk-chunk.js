const https = require('https');

https.get('https://amberontime.com/_next/static/chunks/app/kiosk/page-09ddebddbc5b04dc.js', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const idx = data.indexOf('google.maps.Map');
    console.log('Index of google.maps.Map:', idx);
    if (idx !== -1) {
      console.log('Context before and after:\n', data.substring(Math.max(0, idx - 400), idx + 400));
    }
  });
});
