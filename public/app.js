const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const messagesEl = document.getElementById("messages");
const sendButton = document.getElementById("sendButton");
const resetButton = document.getElementById("resetButton");
const statusText = document.getElementById("statusText");
const scenarioButtons = document.querySelectorAll(".scenario-chip");
const coachModeButton = document.getElementById("coachModeButton");
const evaluatorModeButton = document.getElementById("evaluatorModeButton");
const coachScenarioPanel = document.getElementById("coachScenarioPanel");
const evaluatorPanel = document.getElementById("evaluatorPanel");
const loadEvaluatorTemplate = document.getElementById("loadEvaluatorTemplate");
const chatTitle = document.getElementById("chatTitle");

const conversation = [];
let mode = "coach";

messageInput.addEventListener("input", autoResize);

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  appendMessage("user", text);
  conversation.push({ role: "user", content: text });
  messageInput.value = "";
  autoResize();

  sendButton.disabled = true;
  statusText.textContent = "Thinking...";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversation, mode }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

    appendMessage("assistant", data.reply);
    conversation.push({ role: "assistant", content: data.reply });
    statusText.textContent =
      "No data is stored. Your current chat only lives in this browser tab.";
  } catch (error) {
    appendMessage(
      "assistant",
      `I couldn't reach the model yet.\n\n${error.message}\n\nCheck your .env settings and try again.`
    );
    statusText.textContent = "Request failed. Review API settings in .env.";
  } finally {
    sendButton.disabled = false;
    messageInput.focus();
  }
});

scenarioButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.id === "loadEvaluatorTemplate") return;
    messageInput.value = button.dataset.prompt || "";
    autoResize();
    messageInput.focus();
  });
});

coachModeButton.addEventListener("click", () => setMode("coach"));
evaluatorModeButton.addEventListener("click", () => setMode("evaluator"));

loadEvaluatorTemplate.addEventListener("click", () => {
  messageInput.value = `Please evaluate the following conversation transcript between a user and the SDE Career Negotiator & Communicator.\n\nTranscript:\n[User]: ...\n[Assistant Agent]: ...`;
  autoResize();
  messageInput.focus();
});

function appendMessage(role, content) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = content;

  article.appendChild(bubble);
  messagesEl.appendChild(article);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function autoResize() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 180)}px`;
}

function setMode(nextMode) {
  if (mode === nextMode) return;
  mode = nextMode;

  coachModeButton.classList.toggle("active", mode === "coach");
  evaluatorModeButton.classList.toggle("active", mode === "evaluator");
  coachScenarioPanel.classList.toggle("hidden", mode !== "coach");
  evaluatorPanel.classList.toggle("hidden", mode !== "evaluator");

  if (mode === "coach") {
    chatTitle.textContent = "Career Negotiator & Communicator";
    messageInput.placeholder = "Describe your situation...";
    resetConversation(
      "Tell me the situation, your goal, and any constraints. I can help with strategy, wording, and pushback handling."
    );
  } else {
    chatTitle.textContent = "Career Coach Evaluator";
    messageInput.placeholder = "Paste a full transcript for evaluation...";
    resetConversation(
      "Paste a full transcript, and I will score the assistant on competence, trustworthiness, goodwill, strategic usefulness, and role consistency."
    );
  }
}

function resetConversation(initialText) {
  conversation.length = 0;
  messagesEl.innerHTML = `
    <article class="message assistant">
      <div class="message-bubble">
        ${escapeHtml(initialText)}
      </div>
    </article>
  `;
  statusText.textContent =
    "No data is stored. Your current chat only lives in this browser tab.";
}

resetButton.addEventListener("click", () => {
  if (mode === "coach") {
    resetConversation(
      "Tell me the situation, your goal, and any constraints. I can help with strategy, wording, and pushback handling."
    );
  } else {
    resetConversation(
      "Paste a full transcript, and I will score the assistant on competence, trustworthiness, goodwill, strategic usefulness, and role consistency."
    );
  }
});

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
