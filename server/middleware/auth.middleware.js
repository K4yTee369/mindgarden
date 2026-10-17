const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key_tam_thoi');
    
    req.user = decoded; // { userId, email }
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Unauthorized: Invalid or expired token' });
  }
};

module.exports = { authenticate };