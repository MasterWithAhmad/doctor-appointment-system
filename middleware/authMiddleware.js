// middleware/authMiddleware.js
function ensureAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        // User is authenticated, proceed to the next middleware or route handler
        return next();
    }
    // User is not authenticated, redirect to the login page
    res.redirect('/auth/login');
}

module.exports = ensureAuthenticated; 