const express = require('express');
const path = require('node:path');
const { getApp } = require('./server');

const app = express();

// Serve static assets from public
app.use(express.static(path.join(__dirname, 'public')));

// Delegate to the main application
let initializedApp = null;
app.use(async (req, res, next) => {
  try {
    if (!initializedApp) {
      initializedApp = await getApp();
    }
    return initializedApp(req, res, next);
  } catch (err) {
    next(err);
  }
});

// Fallback to index.html for non-API requests (Express 5 compatible)
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Export Express app for Vercel
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Incubation Center running at http://localhost:${PORT}`);
  });
}
