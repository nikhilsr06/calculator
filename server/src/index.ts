import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";

import authRoutes from "./routes/auth";
import calculatorRoutes from "./routes/calculators";
import adminRoutes from "./routes/admin";

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  // Packaged Tauri desktop apps use these origins, not localhost:1420.
  if (origin.startsWith("tauri://")) return true;
  if (origin.endsWith("tauri.localhost")) return true;
  return false;
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (allowedOrigins.length === 0 || isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api", calculatorRoutes); // /api/calculators, /api/calculate, /api/history
app.use("/api/admin", adminRoutes);

// Generic error handler - never leak stack traces or internals to clients.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`Formula Calculator API listening on port ${PORT}`);
});
