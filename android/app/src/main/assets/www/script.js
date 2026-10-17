const chat = document.getElementById("chat");
const form = document.getElementById("messageForm");
const input = document.getElementById("message");
const statusLabel = document.getElementById("status");
const sendButton = document.getElementById("sendButton");

let nextId = 0;
const pending = new Map();

function addMessage(text, type) {
    const message = document.createElement("div");
    message.className = "message " + type;
    message.textContent = text;
    chat.appendChild(message);
    chat.scrollTop = chat.scrollHeight;
    return message;
}

function speakReply(text) {
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-ZA";
    utterance.rate = 1;
    utterance.pitch = 0.95;

    window.speechSynthesis.speak(utterance);
}

window.onNativeReply = function(id, reply, error) {
    const request = pending.get(id);
    if (!request) return;

    pending.delete(id);

    request.waiting.textContent = error || reply;
    request.waiting.className = "message " + (error ? "bot" : "bot");

    statusLabel.textContent = error ? "OFFLINE" : "ONLINE";
    statusLabel.classList.toggle("offline", Boolean(error));
    sendButton.disabled = false;

    if (!error) speakReply(reply);
};

function sendMessage() {
    const message = input.value.trim();
    if (!message || sendButton.disabled) return;

    addMessage(message, "user");
    input.value = "";

    const waiting = addMessage("Thinking...", "bot");
    const id = String(++nextId);

    statusLabel.textContent = "THINKING";
    statusLabel.classList.remove("offline");
    sendButton.disabled = true;

    if (!window.ChuckBridge) {
        waiting.textContent = "Open C.H.U.C.K. in the Android app.";
        statusLabel.textContent = "OFFLINE";
        statusLabel.classList.add("offline");
        sendButton.disabled = false;
        return;
    }

    pending.set(id, { waiting });

    try {
        window.ChuckBridge.sendMessage(message, id);
    } catch (error) {
        pending.delete(id);
        waiting.textContent = "Unable to send your message.";
        statusLabel.textContent = "OFFLINE";
        statusLabel.classList.add("offline");
        sendButton.disabled = false;
        console.error(error);
    }
};

form.addEventListener("submit", function(event) {
    event.preventDefault();
    sendMessage();
});
