import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';

const isAdmin = async (req, res, next) => {
  try {
    // Accept token from cookie or Authorization header (Bearer)
    let token = req.cookies?.token;
    if (!token) {
      const auth = req.headers?.authorization || req.headers?.Authorization;
      if (auth && auth.startsWith('Bearer ')) token = auth.split(' ')[1];
    }
    if (!token) return res.status(401).json({ message: 'No token provided', success: false });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Special admin token (issued for fixed admin credentials) may include `isAdminToken` flag
    if (decoded && (decoded.isAdminToken || decoded.role === 'Administrator')) {
      req.isAdmin = true;
      // if a userId exists, attach it
      if (decoded.userId) req.id = decoded.userId;
      return next();
    }

    // Otherwise, fetch the user and verify role
    if (!decoded || !decoded.userId) return res.status(403).json({ message: 'Forbidden', success: false });
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: 'User not found', success: false });
    if (user.role !== 'Administrator') return res.status(403).json({ message: 'Forbidden', success: false });
    req.isAdmin = true;
    req.id = user._id;
    next();
  } catch (error) {
    console.error('isAdmin error', error);
    return res.status(401).json({ message: 'Invalid or expired token', success: false });
  }
};

export default isAdmin;
 