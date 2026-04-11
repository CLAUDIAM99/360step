module.exports = (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.GOOGLE_MAPS_API_KEY || "";
  res.status(200).send(
    `window.__ROAMY_CONFIG__ = { googleMapsApiKey: ${JSON.stringify(key)} };`
  );
};
