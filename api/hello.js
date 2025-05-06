module.exports = (req, res) => {
  res.json({
    message: "API is working!",
    time: new Date().toISOString(),
    env: process.env.NODE_ENV,
    url: req.url
  });
}; 