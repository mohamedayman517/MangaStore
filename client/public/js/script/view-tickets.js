// View Ticket page client script (vanilla JS)
(function(){
  function ready(fn){ if(document.readyState!=='loading'){ fn(); } else { document.addEventListener('DOMContentLoaded', fn); } }

  function findTicketId(){
    // Try to read ticket id from the first h2 in the header section (as rendered in view-ticket.ejs)
    const headers = document.querySelectorAll('main h2');
    if (headers && headers.length) {
      const text = headers[0].textContent.trim();
      return text || null;
    }
    return null;
  }

  ready(function(){
    const ticketId = findTicketId();
    const form = document.getElementById('ticketForm');
    const statusEl = document.getElementById('changeStatus');
    const messageEl = document.getElementById('message');
    const fileInput = document.getElementById('fileInput');
    const fileAlert = document.getElementById('fileAlert');
    const fileUpload = document.getElementById('fileUpload');
    const submitBtn = document.getElementById('submitButton');
    const loader = submitBtn ? submitBtn.querySelector('.loaderBtn') : null;
    const btnWord = submitBtn ? submitBtn.querySelector('.btnWord') : null;
    const adminOfferPriceEl = document.getElementById('adminOfferPrice');

    if (fileUpload && fileInput) {
      fileUpload.addEventListener('click', function(){
        fileInput.click();
      });
    }

    if (fileInput && fileAlert) {
      fileInput.addEventListener('change', function(){
        fileAlert.innerHTML = '';
        if (!fileInput.files || fileInput.files.length === 0) return;
        const list = document.createElement('ul');
        list.className = 'list-disc ml-6 text-sm text-gray-700';
        Array.from(fileInput.files).forEach(f => {
          const li = document.createElement('li');
          li.textContent = `${f.name} (${(f.size/(1024*1024)).toFixed(2)} MB)`;
          list.appendChild(li);
        });
        fileAlert.appendChild(list);
      });
    }

    if (form) {
      form.addEventListener('submit', function(e){
        e.preventDefault();
        if (submitBtn) {
          submitBtn.disabled = true;
          if (loader) loader.classList.add('active');
          if (btnWord) btnWord.textContent = 'Sending...';
        }

        // Build payload
        const status = statusEl ? statusEl.value : '';
        const message = messageEl ? messageEl.value.trim() : '';
        const fd = new FormData();
        fd.append('status', status);
        fd.append('message', message);
        if (ticketId) fd.append('ticketId', ticketId);
        if (adminOfferPriceEl && adminOfferPriceEl.value !== '') {
          fd.append('adminOfferPrice', adminOfferPriceEl.value);
        }
        if (fileInput && fileInput.files) {
          Array.from(fileInput.files).forEach(f => fd.append('files', f));
        }

        const url = '/admin/reply/ticket';
        fetch(url, { method: 'POST', body: fd })
          .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to send reply');
            return data;
          })
          .then(() => {
            window.location.reload();
          })
          .catch(err => {
            console.error('Failed to send reply', err);
            alert(err.message || 'Failed to send reply');
          })
          .finally(() => {
            if (submitBtn){
              submitBtn.disabled = false;
              if (loader) loader.classList.remove('active');
              if (btnWord) btnWord.textContent = 'Send reply';
            }
          });
      });
    }
  });
})();
