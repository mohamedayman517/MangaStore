(function () {
  const btn = document.getElementById("faq-chat-toggle");
  const panel = document.getElementById("faq-chat-panel");
  const closeBtn = document.getElementById("faq-chat-close");
  const content = document.getElementById("faq-chat-content");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const chatMessages = document.getElementById("chat-messages");

  if (!btn || !panel || !content) return;

  let loaded = false;
  let history = [];

  function toggle(open) {
    const shouldOpen = typeof open === "boolean" ? open : panel.classList.contains("hidden");
    if (shouldOpen) {
      panel.classList.remove("hidden");
      if (!loaded) {
        loadData();
      }
    } else {
      panel.classList.add("hidden");
    }
  }

  async function loadData() {
    loaded = true;
    try {
      content.innerHTML = '<div class="text-xs text-text-light/60 dark:text-text-dark/60">جاري التحميل...</div>';
      const res = await fetch("/api/qna", { headers: { "Accept": "application/json" } });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length === 0) {
        content.innerHTML = '<div class="text-xs text-text-light/60 dark:text-text-dark/60">لا توجد أسئلة متاحة الآن.</div>';
        return;
      }
      content.innerHTML = items
        .map((it, idx) => renderItem(it, idx))
        .join("");
      attachAccordions();
    } catch (e) {
      console.error(e);
      content.innerHTML = '<div class="text-xs text-red-500">تعذر تحميل الأسئلة، حاول لاحقًا.</div>';
    }
  }

  function renderItem(it, idx) {
    const q = escapeHtml(it.Q || "سؤال");
    const a = escapeHtml(it.A || "-");
    const id = `faq-item-${idx}`;
    return `
      <div class="border border-primary-light/20 dark:border-primary-dark/20 rounded-lg overflow-hidden">
        <button class="w-full flex justify-between items-center gap-2 px-3 py-2 text-right hover:bg-primary-light/5 dark:hover:bg-primary-dark/5" aria-expanded="false" aria-controls="${id}">
          <span class="text-sm font-semibold text-text-light dark:text-text-dark">${q}</span>
          <span class="text-lg text-primary-light dark:text-primary-dark">+</span>
        </button>
        <div id="${id}" class="hidden px-3 py-2 text-xs text-text-light/80 dark:text-text-dark/80 bg-background-light dark:bg-background-dark">
          ${a.replace(/\n/g, "<br>")}
        </div>
      </div>`;
  }

  function attachAccordions() {
    const items = content.querySelectorAll("button[aria-controls]");
    items.forEach((btn) => {
      btn.addEventListener("click", () => {
        const controls = btn.getAttribute("aria-controls");
        const panel = document.getElementById(controls);
        const expanded = btn.getAttribute("aria-expanded") === "true";
        // collapse others
        content.querySelectorAll("[id^='faq-item-']").forEach((el) => {
          if (el !== panel) el.classList.add("hidden");
        });
        content.querySelectorAll("button[aria-controls]").forEach((b) => {
          if (b !== btn) b.setAttribute("aria-expanded", "false");
          const icon = b.querySelector("span:last-child");
          if (icon) icon.textContent = "+";
        });
        if (expanded) {
          btn.setAttribute("aria-expanded", "false");
          const icon = btn.querySelector("span:last-child");
          if (icon) icon.textContent = "+";
          panel.classList.add("hidden");
        } else {
          btn.setAttribute("aria-expanded", "true");
          const icon = btn.querySelector("span:last-child");
          if (icon) icon.textContent = "−";
          panel.classList.remove("hidden");
        }
      });
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  btn.addEventListener("click", () => toggle());
  if (closeBtn) closeBtn.addEventListener("click", () => toggle(false));

  // Chat helpers
  function appendMessage(role, text) {
    if (!chatMessages) return;
    const bubble = document.createElement("div");
    const isUser = role === "user";
    bubble.className = `max-w-[85%] text-sm px-3 py-2 rounded-lg ${isUser ? 'bg-primary-light/10 text-text-light self-end ml-auto' : 'bg-primary-dark/10 text-text-light dark:text-text-dark self-start mr-auto'}`;
    bubble.dir = 'auto';
    bubble.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function setComposerDisabled(disabled) {
    if (chatInput) chatInput.disabled = disabled;
    const btn = chatForm ? chatForm.querySelector('button[type="submit"]') : null;
    if (btn) btn.disabled = disabled;
  }

  async function sendChat(message) {
    try {
      setComposerDisabled(true);
      appendMessage('user', message);
      // optimistic typing indicator
      const typing = document.createElement('div');
      typing.className = 'text-xs text-text-light/60 dark:text-text-dark/60';
      typing.textContent = '... جارٍ التفكير';
      chatMessages.appendChild(typing);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      const payload = { message, history, language: 'ar' };
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      typing.remove();
      if (!res.ok || !data?.success) {
        appendMessage('assistant', 'تعذر الحصول على رد الآن. حاول لاحقًا.');
        return;
      }
      const answer = String(data.data?.answer || '').trim() || '—';
      appendMessage('assistant', answer);

      // Update short rolling history (keep last 8 messages)
      history.push({ role: 'user', content: message });
      history.push({ role: 'assistant', content: answer });
      if (history.length > 10) history = history.slice(-10);
    } catch (e) {
      appendMessage('assistant', 'حدث خطأ غير متوقع.');
    } finally {
      setComposerDisabled(false);
    }
  }

  if (chatForm && chatInput) {
    chatForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      const msg = (chatInput.value || '').trim();
      if (!msg) return;
      chatInput.value = '';
      sendChat(msg);
    });
  }
})();
