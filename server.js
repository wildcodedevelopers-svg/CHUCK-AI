const express = require("express");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({
    name: "C.H.U.C.K.",
    status: "online",
    message: "C.H.U.C.K. backend is running."
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

    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL;

    if (!apiKey || !model) {
      return res.status(503).json({
        error: "AI backend is not configured yet."
      });
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "C.H.U.C.K. AI"
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are C.H.U.C.K., a helpful personal AI assistant " +
                "created by WildCode. Address your user as Boss Wayne " +
                "when natural. Be intelligent, clear, practical, and " +
                "honest. Never claim to have performed an action you " +
                "have not actually performed."
            },
            {
              role: "user",
              content: message.trim()
            }
          ]
        }),
        signal: AbortSignal.timeout(60000)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("AI provider returned status:", response.status);

      return res.status(502).json({
        error: "The AI service could not complete your request."
      });
    }

    const reply = data.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({
        error: "The AI returned an empty response."
      });
    }

    return res.json({ reply: reply.trim() });

  } catch (error) {
    console.error("Request failed:", error.message);

    return res.status(500).json({
      error: "C.H.U.C.K. could not process that request."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`C.H.U.C.K. backend listening on port ${PORT}`);
});
