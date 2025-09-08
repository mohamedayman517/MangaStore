document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("customRequestForm");
  const fileInput = document.getElementById("file");
  const fileList = document.getElementById("fileList");
  const submitBtn = document.getElementById("submitButton");
  const btnWord = submitBtn?.querySelector(".btnWord");
  const loader = submitBtn?.querySelector(".loaderBtn");

  function setLoading(on) {
    if (!submitBtn) return;
    submitBtn.disabled = on;
    if (loader) loader.classList.toggle("active", on);
    if (btnWord) btnWord.textContent = on ? "Submitting..." : "Submit Request";
  }

  function humanFileSize(bytes) {
    const thresh = 1024;
    if (Math.abs(bytes) < thresh) return bytes + " B";
    const units = ["KB", "MB", "GB", "TB"]; let u = -1; do { bytes /= thresh; ++u; } while (Math.abs(bytes) >= thresh && u < units.length - 1);
    return bytes.toFixed(1) + " " + units[u];
  }

  if (fileInput && fileList) {
    fileInput.addEventListener("change", () => {
      fileList.innerHTML = "";
      Array.from(fileInput.files || []).forEach((f) => {
        const row = document.createElement("div");
        row.className = "flex items-center justify-between p-2 rounded border border-secondary-light/20 dark:border-secondary-dark/20";
        row.innerHTML = `<span class="truncate">${f.name}</span><span class="text-sm text-secondary-light dark:text-secondary-dark">${humanFileSize(f.size)}</span>`;
        fileList.appendChild(row);
      });
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        setLoading(true);
        const fd = new FormData();
        fd.append("name", document.getElementById("name").value.trim());
        fd.append("phone", document.getElementById("phone").value.trim());
        fd.append("subject", document.getElementById("subject").value.trim());
        fd.append("offeredPrice", document.getElementById("offeredPrice").value.trim());
        fd.append("description", document.getElementById("description").value.trim());
        (fileInput?.files ? Array.from(fileInput.files) : []).forEach((f) => fd.append("attachments", f));

        const res = await fetch("/support/custom-request/open", {
          method: "POST",
          body: fd,
        });
        const data = await res.json().catch(() => ({ success: false, message: "Unexpected response" }));
        if (!res.ok || !data.success) {
          throw new Error(data.message || "Failed to submit request");
        }
        alert("Submitted successfully. Ticket ID: " + data.ticketId);
        window.location.href = "/support/tickets";
      } catch (err) {
        alert(err.message || "Error submitting request");
      } finally {
        setLoading(false);
      }
    });
  }
});
