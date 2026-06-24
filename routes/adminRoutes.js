const express = require("express");
const {
  verifyAdmin,
  verifyAdminOrServiceKey,
} = require("../middlewares/adminAuthMiddleware");
const {
  getUsers,
  updateUser,
  setUserBanState,
  toggleUserActive,
  getUsageOverview,
  broadcastNotification,
} = require("../controllers/adminController");

const router = express.Router();

router.get("/test", (req, res) => {
  res.json({ success: true, message: "Admin routes are working" });
});

// AllAppsAdmin uses X-Service-Key; existing dashboard JWTs remain supported.
router.get("/users", verifyAdminOrServiceKey, getUsers);
router.patch("/users/:id/ban", verifyAdminOrServiceKey, setUserBanState);
router.patch("/users/:id/toggle", verifyAdminOrServiceKey, toggleUserActive);
router.get("/usage", verifyAdminOrServiceKey, getUsageOverview);

router.put("/users/:id", verifyAdmin, updateUser);
router.post("/notifications/broadcast", verifyAdmin, broadcastNotification);

module.exports = router;