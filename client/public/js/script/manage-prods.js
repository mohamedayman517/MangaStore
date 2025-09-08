// Manage Products page script
(function(){
  function ready(fn){ if(document.readyState!=='loading'){ fn(); } else { document.addEventListener('DOMContentLoaded', fn); } }
  ready(function(){
    if (!window.jQuery) return; // safety
    const $ = window.jQuery;

    // Hide loading overlay if present
    $('#loadingContainer').html('').addClass('!hidden');

    // Initialize DataTable if available
    if ($.fn && typeof $.fn.DataTable === 'function') {
      $('#productTable').DataTable();
    }

    // View button (the template already has an <a> inside, so this is optional)
    $(document).on('click', '.view-btn', function(){
      const a = $(this).find('a[href]');
      if (a.length) window.location.href = a.attr('href');
    });

    // Delete confirm popup wiring
    $(document).on('click', '.delete-btn', function(){
      const id = $(this).data('id');
      $('#conf-popup').removeClass('!hidden');
      $('#conf-delte-btn-popup').data('id', id);
    });

    $(document).on('click', '#cancel-btn-popup', function(){
      $('#conf-popup').addClass('!hidden');
      $('#conf-delte-btn-popup').removeData('id');
    });

    $(document).on('click', '#conf-delte-btn-popup', async function(e){
      e.preventDefault();
      const id = $(this).data('id');
      if (!id) return;

      const $btn = $(this);
      $btn.prop('disabled', true);
      try {
        const res = await fetch(`/admin/product/delete/${id}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        });
        const data = await res.json().catch(()=>({ success:false, message:`Request failed (${res.status})` }));
        if (!res.ok || !data.success) {
          alert(data.message || `Failed to delete product (${res.status})`);
          return;
        }

        // Hide popup
        $('#conf-popup').addClass('!hidden');
        $('#conf-delte-btn-popup').removeData('id');

        // Remove row from table
        const table = $.fn && $.fn.DataTable ? $('#productTable').DataTable() : null;
        if (table) {
          // find row with this product id
          const row = $('#productTable tbody tr').filter(function(){
            return $(this).find('td:first').text().trim() === String(id);
          });
          if (row.length) {
            table.row(row).remove().draw(false);
          } else {
            table.draw(false);
          }
        } else {
          // fallback
          $('#productTable tbody tr').each(function(){
            if ($(this).find('td:first').text().trim() === String(id)) $(this).remove();
          });
        }
      } catch (err) {
        console.error('Delete error:', err);
        alert('An error occurred while deleting.');
      } finally {
        $btn.prop('disabled', false);
      }
    });

    // Create product coupon popup
    $(document).on('click', '.create-coupon-btn', function(){
      const productId = $(this).data('id');
      if (!window.popup || typeof window.popup.showForm !== 'function') {
        alert('Popup component not available');
        return;
      }

      window.popup.showForm({
        title: 'Create Product Coupon',
        fields: [
          { name: 'name', label: 'Coupon Code', type: 'text', required: true, placeholder: 'e.g. SAVE10' },
          { name: 'type', label: 'Type', type: 'select', options: [
            { value: 'percentage', label: 'Percentage (%)' },
            { value: 'fixed', label: 'Fixed Amount' },
          ], required: true },
          { name: 'amount', label: 'Amount', type: 'number', min: 0, step: '0.01', required: true },
          { name: 'expiryDate', label: 'Expiry Date', type: 'date', required: true },
        ],
        submitText: 'Create',
        onSubmit: async (values, ui) => {
          // Basic validation
          const { name, type, amount, expiryDate } = values || {};
          if (!name || !type || !amount || !expiryDate) {
            ui.setError && ui.setError('All fields are required');
            return;
          }
          const amt = parseFloat(amount);
          if (isNaN(amt) || amt <= 0) {
            ui.setError && ui.setError('Amount must be a positive number');
            return;
          }
          try {
            ui.setLoading && ui.setLoading(true);
            const res = await fetch('/admin/add/product-coupon', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ name, type, amount: amt, expiryDate, productId })
            });
            const data = await res.json().catch(()=>({ status: 'error', error: `Request failed (${res.status})` }));
            if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
            // Success
            ui.close && ui.close();
            alert('Product coupon created successfully');
          } catch (err) {
            console.error('Create coupon error:', err);
            ui.setError && ui.setError(err.message || 'Failed to create coupon');
          } finally {
            ui.setLoading && ui.setLoading(false);
          }
        },
      });

      // Force visibility of popup buttons (handle CSS conflicts)
      try {
        const $actions = $('.popup-actions button');
        $actions.each(function(){
          this.style.setProperty('background-color', '#16a34a', 'important');
          this.style.setProperty('color', '#fff', 'important');
          this.style.setProperty('border', 'none', 'important');
          this.style.setProperty('padding', '0.5rem 1rem', 'important');
          this.style.setProperty('borderRadius', '0.375rem', 'important');
        });
        const $close = $('.popup-close');
        $close.each(function(){
          this.style.setProperty('color', '#000', 'important');
          this.style.setProperty('background', '#fff', 'important');
          this.style.setProperty('border', '1px solid #ccc', 'important');
        });
      } catch (_) {}
    });
  });
})();
