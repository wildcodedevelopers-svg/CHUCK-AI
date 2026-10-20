"use strict";

/*
 * C.H.U.C.K. — ELHAM STUDIOS
 * Interface, voice controls and Android bridge.
 *
 * Note: the current MainActivity still uses its Render backend.
 * Local Gemma inference must be connected natively in a later step.
 */

const BACKEND_URL = "https://chuck-ai-backend.onrender.com/ask";

const $ = id => document.getElementById(id);

const messages = $("messages");
const input = $("userInput");
const micBtn = $("micBtn");
const wakeBtn = $("wakeBtn");
const voiceBtn = $("voiceBtn");
const orb = $("orbStage");

let busy = false;
let wakeMode = false;
let manualRecording = false;
let voiceEnabled = true;
let recognition = null;
let recognitionRunning = false;
let restartTimer = null;
let pendingRequests = new Map();

/* STARS */

(function createStars() {
  const container = $("stars");

  for (let i = 0; i < 65; i++) {
    const star = document.createElement("div");
    star.className = "star";
    star.style.left = Math.random() * 100 + "%";
    star.style.top = Math.random() * 100 + "%";
    star.style.animationDelay = Math.random() * 4 + "s";
    star.style.animationDuration = 2 + Math.random() * 4 + "s";
    container.appendChild(star);
  }
})();

/* STATUS */

function setStatus(mode, label) {
  $("statusText").textContent = label;

  $("coreStatus").textContent =
    mode === "listening" ? "LISTENING FOR COMMANDS" :
    mode === "thinking" ? "PROCESSING REQUEST" :
    mode === "error" ? "CONNECTION INTERRUPTED" :
    wakeMode ? "WAKE WORD ACTIVE" : "AWAITING COMMAND";

  $("statusDot").className =
    "dot" +
    (mode === "thinking" ? " busy" :
    mode === "error" ? " error" : "");

  orb.classList.toggle("listening", mode === "listening");
  orb.classList.toggle("thinking", mode === "thinking");

  $("aiStatus").textContent =
    mode === "thinking" ? "PROCESSING..." :
    mode === "error" ? "CHECK CONNECTION" :
    mode === "listening" ? "VOICE ACTIVE" : "AI STANDBY";
}

/* CHAT */

function addMessage(text, sender = "ai") {
  const bubble = document.createElement("div");
  bubble.className =
    "message" + (sender === "user" ? " user" : "");

  const label = document.createElement("span");
  label.className = "msg-label";
  label.textContent = sender === "user"
    ? "BOSS WAYNE / COMMAND"
    : "C.H.U.C.K. / CORE";

  const body = document.createElement("div");
  body.textContent = String(text);

  bubble.append(label, body);
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;

  return bubble;
}

function showTyping() {
  hideTyping();

  const el = document.createElement("div");
  el.className = "typing";
  el.id = "typing";

  el.append(
    document.createTextNode("Thinking"),
    document.createElement("span"),
    document.createElement("span"),
    document.createElement("span")
  );

  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

function hideTyping() {
  $("typing")?.remove();
}

/* SPEECH OUTPUT */

function speak(text) {
  if (!voiceEnabled || !("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(String(text));
  utterance.lang = "en-US";
  utterance.rate = 1;
  utterance.pitch = 0.85;

  const voices = window.speechSynthesis.getVoices();

  const selected = voices.find(v =>
    /david|mark|daniel|james|guy/i.test(v.name) &&
    /en/i.test(v.lang)
  ) || voices.find(v => /en/i.test(v.lang));

  if (selected) utterance.voice = selected;

  window.speechSynthesis.speak(utterance);
}

/* ANDROID CALLBACK COMPATIBILITY
 *
 * MainActivity currently calls:
 * window.onNativeReply(callbackId, reply, error)
 *
 * This handler resolves the matching JavaScript request.
 */

window.onNativeReply = function(callbackId, reply, error) {
  const request = pendingRequests.get(callbackId);
  if (!request) return;

  clearTimeout(request.timeout);
  pendingRequests.delete(callbackId);

  if (error) {
    request.reject(new Error(String(error)));
    return;
  }

  request.resolve(String(reply ?? ""));
};

/* ANDROID BRIDGE */

function sendThroughAndroidBridge(message) {
  return new Promise((resolve, reject) => {
    const callbackId =
      "chuck_callback_" + Date.now() + "_" +
      Math.random().toString(36).slice(2, 8);

    const timeout = setTimeout(() => {
      pendingRequests.delete(callbackId);
      reject(new Error("Android request timed out."));
    }, 90000);

    pendingRequests.set(callbackId, {
      resolve,
      reject,
      timeout
    });

    try {
      if (!window.ChuckBridge) {
        throw new Error("Android bridge is unavailable.");
      }

      window.ChuckBridge.sendMessage(message, callbackId);
    } catch (error) {
      clearTimeout(timeout);
      pendingRequests.delete(callbackId);
      reject(error);
    }
  });
}

/* WEBSITE BACKEND */

async function sendThroughWebsite(message) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ message }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.detail || data.message ||
        `Backend returned HTTP ${response.status}`
      );
    }

    const reply = data.reply ?? data.response ?? data.message;

    if (typeof reply !== "string" || !reply.trim()) {
      throw new Error("The backend returned no readable reply.");
    }

    return reply;
  } finally {
    clearTimeout(timeout);
  }
}

/* SEND COMMAND */

async function sendMessage(raw) {
  const message = String(raw || "").trim();

  if (!message || busy) return;

  input.value = "";
  addMessage(message, "user");

  busy = true;
  setStatus("thinking", "THINKING");
  showTyping();

  try {
    let reply;

    if (
      window.ChuckBridge &&
      typeof window.ChuckBridge.sendMessage === "function"
    ) {
      reply = await sendThroughAndroidBridge(message);
    } else {
      reply = await sendThroughWebsite(message);
    }

    if (!String(reply).trim()) {
      throw new Error("C.H.U.C.K. returned an empty reply.");
    }

    addMessage(reply, "ai");
    speak(reply);
    setStatus("ready", "CORE ONLINE");

  } catch (error) {
    console.error("C.H.U.C.K. error:", error);

    let explanation;

    if (error.name === "AbortError") {
      explanation = "The request timed out. Check your connection and try again.";
    } else {
      explanation = "Connection error: " + error.message;
    }

    addMessage(explanation, "ai");
    setStatus("error", "CONNECTION ISSUE");

  } finally {
    hideTyping();
    busy = false;

    if (wakeMode || manualRecording) {
      setStatus("listening", "VOICE ACTIVE");
    }
  }
}

/* VOICE RECOGNITION */

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

function initializeVoice() {
  if (!SpeechRecognition) {
    $("aiStatus").textContent = "VOICE UNSUPPORTED";
    micBtn.disabled = true;
    micBtn.style.opacity = ".45";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onstart = () => {
    recognitionRunning = true;
    setStatus("listening", "LISTENING");
    micBtn.classList.add("active");
  };

  recognition.onresult = event => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (!event.results[i].isFinal) continue;

      const transcript =
        event.results[i][0].transcript.trim();

      if (!transcript) continue;

      if (manualRecording) {
        manualRecording = false;
        micBtn.classList.remove("active");
        sendMessage(transcript);
        stopRecognitionIfIdle();
        continue;
      }

      if (wakeMode) {
        const match = transcript.match(
          /\bchuck\b[\s,.:;-]*(.*)/i
        );

        if (!match) continue;

        const command = match[1].trim();

        if (command) {
          sendMessage(command);
        } else {
          addMessage(
            "I'm listening, Boss Wayne. What's your command?",
            "ai"
          );
          speak("Yes, Boss Wayne. I'm listening.");
        }
      }
    }
  };

  recognition.onerror = event => {
    console.warn("Voice recognition error:", event.error);

    if (
      event.error === "not-allowed" ||
      event.error === "service-not-allowed"
    ) {
      wakeMode = false;
      manualRecording = false;
      updateWakeButton();
      setStatus("error", "MIC PERMISSION");

      addMessage(
        "Microphone permission was denied. Allow microphone access in your app settings.",
        "ai"
      );
    }
  };

  recognition.onend = () => {
    recognitionRunning = false;

    if (wakeMode || manualRecording) {
      clearTimeout(restartTimer);
      restartTimer = setTimeout(startRecognition, 600);
    } else {
      micBtn.classList.remove("active");
      setStatus("ready", "CORE ONLINE");
    }
  };
}

function startRecognition() {
  if (!recognition || recognitionRunning) return;

  try {
    recognition.start();
  } catch (error) {
    console.warn("Could not start recognition:", error.message);
  }
}

function stopRecognitionIfIdle() {
  if (wakeMode || manualRecording) return;

  clearTimeout(restartTimer);

  if (recognition && recognitionRunning) {
    try {
      recognition.stop();
    } catch (error) {
      console.warn(error);
    }
  }

  micBtn.classList.remove("active");
}

function updateWakeButton() {
  $("wakeLabel").textContent =
    wakeMode ? "WAKE WORD ON" : "WAKE WORD OFF";

  wakeBtn.classList.toggle("active", wakeMode);
}

/* MICROPHONE BUTTON */

micBtn.addEventListener("click", () => {
  if (!recognition) {
    addMessage(
      "Voice recognition isn't supported here. Try Chrome and allow microphone access.",
      "ai"
    );
    return;
  }

  if (manualRecording) {
    manualRecording = false;
    stopRecognitionIfIdle();
    return;
  }

  manualRecording = true;
  micBtn.classList.add("active");

  if (!recognitionRunning) {
    startRecognition();
  } else {
    setStatus("listening", "LISTENING");
  }
});

/* WAKE WORD */

wakeBtn.addEventListener("click", () => {
  if (!recognition) {
    addMessage("Wake-word recognition isn't supported here.", "ai");
    return;
  }

  wakeMode = !wakeMode;
  manualRecording = false;

  updateWakeButton();
  micBtn.classList.toggle("active", wakeMode);

  if (wakeMode) {
    startRecognition();

    addMessage(
      'Wake-word mode enabled. Say "CHUCK" followed by your command while the app is active.',
      "ai"
    );
  } else {
    stopRecognitionIfIdle();
    addMessage("Wake-word mode disabled.", "ai");
    setStatus("ready", "CORE ONLINE");
  }
});

/* TEXT INPUT */

$("chatForm").addEventListener("submit", event => {
  event.preventDefault();
  sendMessage(input.value);
});

/* VOICE OUTPUT TOGGLE */

voiceBtn.addEventListener("click", () => {
  voiceEnabled = !voiceEnabled;

  $("voiceLabel").textContent =
    voiceEnabled ? "VOICE ON" : "VOICE OFF";

  voiceBtn.classList.toggle("active", voiceEnabled);

  if (!voiceEnabled && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
});

/* CLEAR CHAT */

$("clearBtn").addEventListener("click", () => {
  messages.replaceChildren();

  addMessage(
    "Channel cleared, Boss Wayne. Awaiting your next command.",
    "ai"
  );
});

/* STARTUP */

initializeVoice();
setStatus("ready", "CORE ONLINE");
updateWakeButton();
