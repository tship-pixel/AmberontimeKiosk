const https = require('https');

https.get('https://amberontime.com/_next/static/chunks/webpack-411438da007a4c7b.js', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    // print functions defined on a or webpack
    const fns = data.match(/a\.[a-zA-Z0-9_$]+\s*=\s*function[^{]*\{[^}]*\}/g);
    console.log('Webpack functions:', fns);
  });
});
