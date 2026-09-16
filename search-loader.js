const https = require('https');

https.get('https://amberontime.com/_next/static/chunks/app/kiosk/page-09ddebddbc5b04dc.js', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    // Find where script loader or Loader or @googlemaps is used
    const regex = /.{0,150}(?:libraries=|key=|Loader|loadScript|maps\.googleapis\.com).{0,150}/g;
    const matches = data.match(regex);
    console.log('Loader matches:', matches);
  });
});
