const https = require('https');

https.get('https://amberontime.com/_next/static/chunks/webpack-411438da007a4c7b.js', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Webpack chunk map for 8367:');
    const m = data.match(/.{0,100}8367.{0,100}/g);
    console.log(m);
  });
});
