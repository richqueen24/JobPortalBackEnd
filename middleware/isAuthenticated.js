import jwt from "jsonwebtoken";
  import { User } from "../models/user.model.js";
const authenticateToken = (req, res, next) => {
  try {
    // Accept token from cookie or Authorization header
    let token = req.cookies?.token;
    if (!token) {
      const auth = req.headers?.authorization || req.headers?.Authorization;
      if (auth && auth.startsWith('Bearer ')) token = auth.split(' ')[1];
    }
    if (!token) {
      return res.status(401).json({ message: "No token provided", success: false });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded) {
      return (
        res.status(401).json({ message: "Invalid token" }), (success = false)
      );
    }
    // If token carries a userId, attach it. Admin tokens may not include userId.
    if (decoded?.userId) req.id = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};


export { authenticateToken};
export default authenticateToken;