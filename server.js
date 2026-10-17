const express = require("express");

const app = express();
app.use(express.json({ limit: "32kb" }));

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({
    name: "C.H.U.C.K.",
    status: "online",
    message: "C.H.U.C.K. Core is running."
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/ask", async (req, res) => {
  try {
    const message = req.body?.message;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Please provide a message."
      });
    }

    if (message.length > 4000) {
      return res.status(413).json({
        error: "Message is too long."
      });
    }

    return res.status(503).json({
      error: "AI model is not connected yet.",
      nextStep: "Connect a local Android model."
    });

  } catch (error) {
    console.error("Request failed:", error.message);

    return res.status(500).json({
      error: "C.H.U.C.K. could not process the request."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`C.H.U.C.K. Core listening on port ${PORT}`);
});
