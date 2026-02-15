const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'public');
fs.mkdirSync(outDir, { recursive: true });

// Copy openapi.json to public
fs.copyFileSync(
  path.join(__dirname, 'openapi.json'),
  path.join(outDir, 'openapi.json')
);

// Generate index.html with Scalar API Reference
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unju API Documentation</title>
  <meta name="description" content="API documentation for unju.ai — Multi-Modal AI Gateway">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
  <style>
    body { margin: 0; }
  </style>
</head>
<body>
  <script id="api-reference" data-url="./openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;

fs.writeFileSync(path.join(outDir, 'index.html'), html);

console.log('✅ Docs built to public/');
