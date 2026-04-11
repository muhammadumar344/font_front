// ============================================================================
// FILE: src/middleware/subscriptionMiddleware.js
// ============================================================================

// const Subscription = require('../models/Subscription');

const subscriptionMiddleware = async (req, res, next) => {
  try {
    if (req.user && req.user.role === 'admin') {
      return next();
    }

    const classId = req.params.classId || req.body.classId;

    if (!classId) {
      return res.status(400).json({ error: 'classId majburiy' });
    }

    const subscription = await Subscription.findOne({ class: classId });

    if (!subscription) {
      return res.status(403).json({
        error: 'subscription_not_found',
        message: 'Subscription topilmadi',
      });
    }

    if (subscription.selfDeactivated) {
      return res.status(403).json({
        error: 'self_deactivated',
        message: 'Sinf o\'chirib tashlangan',
      });
    }

    if (subscription.isExpired() || !subscription.isActive) {
      return res.status(403).json({
        error: 'subscription_expired',
        message: 'Saytdan foydalanish vaqtingiz tugadi. Iltimos to\'lov qiling',
        expiryDate: subscription.expiryDate,
      });
    }

    const daysLeft = subscription.daysLeft();
    if (daysLeft <= 3) {
      req.subscriptionWarning = {
        daysLeft,
        message: `Obunangiz ${daysLeft} kundan so'ng tugaydi`,
      };
    }

    req.subscription = subscription;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = subscriptionMiddleware;