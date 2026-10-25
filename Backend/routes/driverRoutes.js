import express from "express";
import protect from "../middleware/auth.js";
import driverOnly from "../middleware/driver.js";
import {
  completeDelivery,
  failDelivery,
  getDriverDashboard,
  getDriverDelivery,
  recordCodCollection,
  respondToAssignment,
  startDelivery,
} from "../controllers/driverController.js";
import {
  getDriverPushConfig,
  getDriverPushSubscriptionStatus,
  registerDriverPushSubscription,
  removeDriverPushSubscription,
} from "../controllers/driverPushController.js";

const router = express.Router();
router.use(protect, driverOnly);
router.get("/", getDriverDashboard);
router.get("/push/config", getDriverPushConfig);
router.post("/push/subscription/status", getDriverPushSubscriptionStatus);
router.post("/push/subscription", registerDriverPushSubscription);
router.delete("/push/subscription", removeDriverPushSubscription);
router.get("/deliveries/:id", getDriverDelivery);
router.post("/assignments/:assignmentId/respond", respondToAssignment);
router.post("/deliveries/:id/start", startDelivery);
router.post("/deliveries/:id/complete", completeDelivery);
router.post("/deliveries/:id/fail", failDelivery);
router.post("/deliveries/:id/cod-collection", recordCodCollection);

export default router;
