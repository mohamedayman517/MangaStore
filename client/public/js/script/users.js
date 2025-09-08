// Users page client script
(function(){
  function ready(fn){ if(document.readyState!='loading'){ fn(); } else { document.addEventListener('DOMContentLoaded', fn); } }
  ready(function(){
    // Initialize DataTable if available
    if (window.jQuery && jQuery.fn && typeof jQuery.fn.DataTable === 'function') {
      jQuery('#usersTable').DataTable();
    }

    // Optional: bind basic handlers if SweetAlert2 exists
    const on = (sel, evt, handler) => document.addEventListener(evt, function(e){ const t=e.target.closest(sel); if(t){ handler(e, t); } });

    on('.deleteUserBtn','click', function(e, btn){
      const uid = btn.getAttribute('data-userID');
      if (window.Swal) {
        Swal.fire({title:'Delete user?', text: uid, icon:'warning', showCancelButton:true}).then(res=>{
          if(res.isConfirmed){
            // TODO: implement delete call
          }
        });
      }
    });

    on('.disableUserBtn','click', function(e, btn){
      const uid = btn.getAttribute('data-userID');
      if (window.Swal) Swal.fire({title:'Toggle disable', text: uid, icon:'info'});
    });

    on('.detailsUserBtn','click', function(e, btn){
      const uid = btn.getAttribute('data-userID');
      if (window.Swal) Swal.fire({title:'User details', text: uid, icon:'question'});
    });

    // Create coupon for a specific user
    on('.createCouponBtn','click', async function(e, btn){
      const uid = btn.getAttribute('data-userID');
      const email = btn.getAttribute('data-email') || uid;
      if (!window.Swal) return alert('Missing SweetAlert2');

      const { value: formValues } = await Swal.fire({
        title: `Create Coupon for\n${email}`,
        html: `
          <input id="cc-name" class="swal2-input" placeholder="Coupon Code (e.g. USER10)" />
          <select id="cc-type" class="swal2-input">
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed</option>
          </select>
          <input id="cc-amount" type="number" step="0.01" min="0" class="swal2-input" placeholder="Amount" />
          <input id="cc-exp" type="date" class="swal2-input" />
        `,
        focusConfirm: false,
        preConfirm: () => {
          const name = document.getElementById('cc-name').value.trim();
          const type = document.getElementById('cc-type').value;
          const amount = document.getElementById('cc-amount').value;
          const exp = document.getElementById('cc-exp').value;
          if (!name || !amount || !exp) {
            Swal.showValidationMessage('Please fill all fields');
            return false;
          }
          return { name, type, amount, expiryDate: exp };
        },
        confirmButtonText: 'Create',
        showCancelButton: true
      });

      if (!formValues) return;

      try {
        const res = await fetch('/admin/add/user-coupon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ ...formValues, userId: uid })
        });
        const data = await res.json();
        if (!res.ok || data.status !== 'success') throw new Error(data.error || 'Failed');
        Swal.fire({ icon: 'success', title: 'Created', text: 'User coupon created successfully' });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'Failed to create user coupon' });
      }
    });
  });
})();
