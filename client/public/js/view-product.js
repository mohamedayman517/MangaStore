const orderId = location.pathname.split("/")[2];
async function handleItemAction(itemId, action, index) {
  itemId = Number(itemId);
  index = Number(index);
  const response = await fetch(`/view-order-data/${orderId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ itemId, index }),
  });
  if (response.status === 200) {
    const data = await response.json();
    const proofData = JSON.stringify(data.data.proof);
    const downloadLink = data.downloadLink;
    action == "view" ? viewProof(proofData, downloadLink) : action == "download" ? downloadFile(downloadLink) : "";
  } else {
    const data = await response.json();
    console.log(data.error);
    const errorMessage = data.error;
    errorAlert(`Error: ${errorMessage}`);
    console.error("Error viewing product: ", errorMessage);
    viewProof(
      JSON.stringify([
        {
          key: "Error",
          value: "This product haven't arrived yet",
          createdAt: { seconds: Date.now() / 1000 },
        },
      ])
    );
  }
}

function viewProof(proofData, downloadLink) {
  const proof = JSON.parse(proofData);
  const modal = document.getElementById("proofModal");
  const content = document.getElementById("proofContent");

  content.innerHTML = `
                  <div class="flex flex-col gap-4 overflow-y-auto max-h-96 lg:max-h-[380px]">
                      ${proof
                        .map(
                          (item) => `
                          <div class="p-4 bg-[#fef9e2] dark:bg-gray-800 rounded-lg flex flex-col gap-2 justfiy-center items-start">
                              <div class="flex flex-row gap-2 justify-start items-center">
                               <p class="font-bold">${item.key}: </p>
                               <p class="text-sm font-medium">${item.value}</p>
                              </div>
                                <p class="text-xs text-gray-500">Updated At: ${new Date(
                                  item.createdAt.seconds * 1000
                                ).toLocaleString("en-GB", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                })}</p>
                          </div>
                      `
                        )
                        .join("")}
                        <div>
                          <button onclick="downloadFile('${downloadLink}')" class="${
    downloadLink ? "" : "hidden"
  } bg-primary-light dark:bg-primary-dark text-white px-4 py-2 rounded-lg inline-flex items-center">
                            <i class="fas fa-download md:mr-2"></i>
                            <span class="hidden md:block">Download Proof</span>
                            </button>
                          </div>
                  </div>
              `;

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeProofModal() {
  const modal = document.getElementById("proofModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function downloadFile(url) {
  const link = document.createElement("a");
  link.href = url;
  link.download = url.split("/").pop(); // Extracts the filename
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Close modal when clicking outside
document.getElementById("proofModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    closeProofModal();
  }
});
