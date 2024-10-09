const jwt = require("jsonwebtoken");

module.exports.requireAuth = (req, res, next) => {
  const token = req.headers["auth"];
  if (token) {
    jwt.verify(token, process.env.SECRET_TOKEN, (err, decodedToken) => {
      if (err) {
        const errors = {"msg": "Invalid Token"};
        res.status(400).json({ errors });
      } else {
        next();
      }
    });
  } else {
    const errors = {"msg": "Token Not Found"};
    res.status(400).json({ errors });
  }
};