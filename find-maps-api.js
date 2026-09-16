const https = require('https');

https.get('https://amberontime.com/kiosk', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const chunkPaths = [...new Set(data.match(/\/_next\/static\/chunks\/[a-zA-Z0-9\-_.]+\.js/g) || [])];

    chunkPaths.forEach(cp => {
      https.get('https://amberontime.com' + cp, (cRes) => {
        let cData = '';
        cRes.on('data', d => cData += d);
        cRes.on('end', () => {
          if (cData.includes('google.maps.Map') || cData.includes('useJsApiLoader') || cData.includes('google-maps')) {
            console.log('=== Found in:', cp);
            const m = cData.match(/.{0,150}(?:google\.maps\.Map|useJsApiLoader|google-maps).{0,150}/g);
            console.log(m ? m.slice(0, 3) : 'none');
          }
        });
      });
    });
  });
});
