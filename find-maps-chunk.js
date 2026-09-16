const https = require('https');

https.get('https://amberontime.com/kiosk', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const chunkPaths = data.match(/\/_next\/static\/chunks\/[a-zA-Z0-9\-_.]+\.js/g) || [];
    console.log('Found chunks:', chunkPaths.length);

    chunkPaths.forEach(cp => {
      https.get('https://amberontime.com' + cp, (cRes) => {
        let cData = '';
        cRes.on('data', d => cData += d);
        cRes.on('end', () => {
          if (cData.includes('maps.googleapis.com')) {
            console.log('=== Found maps.googleapis.com in:', cp);
            const m = cData.match(/.{0,100}maps\.googleapis\.com.{0,100}/g);
            console.log(m);
          }
        });
      });
    });
  });
});
