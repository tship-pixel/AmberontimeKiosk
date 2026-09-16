const https = require('https');

https.get('https://amberontime.com/kiosk', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Starts with:\n', data.substring(0, 500));
  });
});
