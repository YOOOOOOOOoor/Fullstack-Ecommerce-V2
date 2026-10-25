import express from "express";
import pool from "./config/db.js";
import auth from "./routes/authRoute.js";
import category from "./routes/categoryRoutes.js";
import product from "./routes/productRoutes.js";
import cart from "./routes/cartRoutes.js";
import checkout from "./routes/checkoutRoute.js";
import wishlist from "./routes/wishlistRoute.js";
import order from "./routes/orderRoutes.js";
import reviews from "./routes/reviewRoutes.js";
import analytics from "./routes/analyticsRoute.js";
import settings from "./routes/settingsRoute.js";
import trueanalyticsRoutes from "./routes/Trueanalytics.js";
import adminCustomerRoutes from "./routes/adminCustomer.js";
import seedAdmin from "./routes/seedAdmin.js";
import driverRoutes from "./routes/driverRoutes.js";
import adminDeliveryRoutes from "./routes/adminDeliveryRoutes.js";
import refundRoutes from "./routes/refundRoutes.js";
import staffRoutes from "./routes/staffRoutes.js";
import shippingRoutes from "./routes/shippingRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import supportRoutes from "./routes/supportRoutes.js";
import { startOrderExpiryWorker } from "./services/orderExpiry.js";
import { startDriverPushWorker } from "./services/driverPushWorker.js";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import rateLimit from "express-rate-limit";
import csrfGuard from "./middleware/csrf.js";

dotenv.config();

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

// Security headers
app.use(helmet());

// CORS
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    exposedHeaders: ["Content-Disposition"],
  }),
);

// Logging
app.use(morgan("dev"));

// Cookies
app.use(cookieParser());

// Body parser
app.use(express.json({ limit: "1mb" }));

// =========================
// RATE LIMITING
// =========================

// General API limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: {
    message: "Too many requests. Try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use(csrfGuard);

// Auth limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: {
    message: "Too many login attempts. Try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Register and login protection only
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// =========================
// ROUTES
// =========================

app.use("/api/auth", auth);

app.use("/api/category", category);

app.use("/api/products", product);

app.use("/api/cart", cart);

app.use("/api/checkout", checkout);

app.use("/api/orders", order);

app.use("/api/wishlist", wishlist);

app.use("/api/reviews", reviews);

app.use("/api/admin/analytics", analytics);

app.use("/api/settings", settings);

app.use("/api/admin/customers", adminCustomerRoutes);
app.use("/api/admin/staff", staffRoutes);
app.use("/api/admin/shipping", shippingRoutes);
app.use("/api/admin/notifications", notificationRoutes);
app.use("/api/admin/delivery", adminDeliveryRoutes);
app.use("/api/driver", driverRoutes);
app.use("/api/refunds", refundRoutes);
app.use("/api/support", supportRoutes);

app.use("/api/trueanalytics", trueanalyticsRoutes);

// TEMPORARY database connectivity diagnostic; remove after troubleshooting.
app.get("/api/health/db", async (_req, res) => {
  let client;
  const databaseUrl = process.env.DATABASE_URL;
  const databaseUrlPresent = Boolean(databaseUrl);
  const connectionMethod = databaseUrlPresent ? "DATABASE_URL" : "DB_*";
  let databaseHostname = null;
  let databasePort = null;

  if (databaseUrlPresent) {
    try {
      const parsedUrl = new URL(databaseUrl);
      databaseHostname = parsedUrl.hostname || null;
      databasePort = parsedUrl.port || "5432";
    } catch {
      // Leave endpoint fields null when the configured URL is malformed.
    }
  } else {
    const configuredHost = process.env.DB_HOST || "localhost";
    databaseHostname = /^[A-Za-z0-9.-]+$/.test(configuredHost) || /^[0-9A-Fa-f:]+$/.test(configuredHost)
      ? configuredHost
      : null;
    const configuredPort = process.env.DB_PORT || "5432";
    databasePort = /^\d{1,5}$/.test(configuredPort) && Number(configuredPort) <= 65535
      ? configuredPort
      : null;
  }

  try {
    client = await pool.connect();
    await client.query({ text: "SELECT 1 AS database_connected", query_timeout: 5000 });
    return res.status(200).json({ databaseConnected: true });
  } catch (error) {
    let errorMessage = typeof error?.message === "string" ? error.message : null;
    if (errorMessage && databaseUrl) {
      errorMessage = errorMessage.split(databaseUrl).join("[redacted database connection string]");
    }
    if (errorMessage) {
      errorMessage = errorMessage.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[redacted database connection string]");
    }

    const errorDetails = {};
    for (const key of ["code", "message", "syscall", "address", "port"]) {
      const value = key === "message" ? errorMessage : error?.[key];
      if (value !== undefined && value !== null) errorDetails[key] = value;
    }

    console.error("DATABASE_HEALTH_DIAGNOSTIC", {
      databaseUrlPresent,
      connectionMethod,
      databaseHostname,
      databasePort,
      error: errorDetails,
    });
    return res.status(503).json({ error: "Database unavailable" });
  } finally {
    if (client) client.release();
  }
});
// =========================
// 404 HANDLER
// =========================

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

// =========================
// ERROR HANDLER
// =========================

app.use((err, req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    console.error("Request failed", { status: err.status || 500, path: req.path });
  } else {
    console.error(err);
  }

  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
    ? err.status
    : 500;
  const exposeMessage = err.expose === true || status < 500 || process.env.NODE_ENV !== "production";
  res.status(status).json({
    message: exposeMessage
      ? err.message || "Something went wrong"
      : "Something went wrong",
  });
});

// =========================
// SERVER
// =========================

const PORT = process.env.PORT || 8000;

if (allowedOrigins.length === 0) {
  throw new Error("CLIENT_URL must contain the allowed frontend origin");
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters");
}

seedAdmin()
  .then(() => {
    startOrderExpiryWorker();
    startDriverPushWorker();
    app.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Server startup failed", error.message);
    process.exitCode = 1;
  });
