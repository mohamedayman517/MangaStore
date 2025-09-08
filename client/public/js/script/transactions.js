// Transactions page client script
(function(){
  function ready(fn){ if(document.readyState!=='loading'){ fn(); } else { document.addEventListener('DOMContentLoaded', fn); } }

  ready(function(){
    if (!window.jQuery) return; // safety
    const $ = window.jQuery;

    // Initialize DataTables (if plugin is loaded)
    if ($.fn && typeof $.fn.DataTable === 'function') {
      ['#pendingTable', '#approvedTable', '#rejectedTable'].forEach(sel => {
        if ($(sel).length) { $(sel).DataTable(); }
      });
    }

    // Open status change popup
    let currentTxId = null;
    $(document).on('click', '.btn-change-state', function(e){
      e.preventDefault();
      // derive transaction id from data-id or first cell text
      const dataId = $(this).attr('data-id');
      if (dataId) {
        currentTxId = dataId;
      } else {
        currentTxId = $(this).closest('tr').find('td').first().text().trim();
      }
      // reset fields
      $('#statusSelect').val('ToPay');
      $('#keyValueInputs').empty();
      $('#statusPopup').removeClass('hidden');
    });

    // Close/cancel popup
    $(document).on('click', '#cancelPopup', function(e){
      e.preventDefault();
      $('#statusPopup').addClass('hidden');
    });

    // Dynamic key/value pairs
    const makeRow = (k = '', v = '') => (
      `<div class="flex gap-2 items-center">
         <input type="text" class="key-input border p-2 rounded w-1/2" placeholder="Key" value="${k}">
         <input type="text" class="value-input border p-2 rounded w-1/2" placeholder="Value" value="${v}">
         <button type="button" class="removeKV text-red-600">Remove</button>
       </div>`
    );

    $(document).on('click', '#addInput', function(e){
      e.preventDefault();
      $('#keyValueInputs').append(makeRow());
    });

    $(document).on('click', '.removeKV', function(){
      $(this).closest('div').remove();
    });

    // Submit popup - send to backend
    $(document).on('click', '#submitPopup', async function(e){
      e.preventDefault();
      if (!currentTxId) {
        if (window.Swal) Swal.fire({ title: 'Missing transaction', text: 'Could not determine transaction id.', icon: 'error' });
        return;
      }
      const state = $('#statusSelect').val();
      const kv = {};
      $('#keyValueInputs .key-input').each(function(i, el){
        const key = $(el).val();
        const val = $(el).siblings('.value-input').val();
        if (key) kv[key] = val;
      });
      const status = { state };
      const extraMsg = Object.entries(kv).map(([k,v]) => `${k}: ${v}`).join(', ');
      if (extraMsg) status.message = extraMsg;

      try {
        const res = await fetch('/admin/transaction/update-transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ transactionId: currentTxId, status })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success !== true) throw new Error(data.error || data.message || 'Failed to update');
        $('#statusPopup').addClass('hidden');
        if (window.Swal) {
          await Swal.fire({ title: 'Updated', text: 'Transaction updated successfully.', icon: 'success' });
        }
        // reload to reflect changes
        window.location.reload();
      } catch (err) {
        if (window.Swal) {
          Swal.fire({ title: 'Error', text: err.message || String(err), icon: 'error' });
        } else {
          console.error('Failed to update transaction:', err);
        }
      }
    });
  });
})();
