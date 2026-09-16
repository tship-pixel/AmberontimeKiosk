const https = require('https');

https.get('https://amberontime.com/kiosk', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('HTML Length:', data.length);
    // Find all script tags
    const scripts = [];
    const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(data)) !== null) {
      scripts.push({ attrs: match[1], content: match[2].trim() });
    }
    console.log('Total scripts found:', scripts.length);
    scripts.forEach((s, i) => {
      console.log(`\n--- Script ${i + 1} ---`);
      console.log('Attrs:', s.attrs);
      if (s.content) {
        console.log('Content preview:', s.content.substring(0, 150));
      }
    });
  });
}).on('error', console.error);
