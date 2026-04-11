const path = require("path");
const express = require("express");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/config.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.GOOGLE_MAPS_API_KEY || "";
  res.send(`window.__ROAMY_CONFIG__ = { googleMapsApiKey: ${JSON.stringify(key)} };`);
});

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`[roamy] running on http://localhost:${PORT}`);
});

