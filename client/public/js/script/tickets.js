// Tickets page client script
(function(){
  function onReady(fn){ if(document.readyState!=='loading'){ fn(); } else { document.addEventListener('DOMContentLoaded', fn); } }
  onReady(function(){
    if (!window.jQuery) return; // safety if CDN fails
    const $ = window.jQuery;

    // Initialize DataTable if available
    if ($.fn && typeof $.fn.DataTable === 'function') {
      $('#ticketsTable').DataTable();
    }

    // View button handler (stub)
    $(document).on('click', '.btn-view', function(){
      const id = $(this).data('id');
      // If a details route exists, navigate to it. Otherwise just log.
      const maybeHref = `/admin/tickets/${id}`;
      // Try a HEAD request to avoid 404 navigation; fallback to console
      try {
        fetch(maybeHref, { method: 'HEAD' }).then(res => {
          if (res.ok) {
            window.location.href = maybeHref;
          } else {
            console.log('Ticket details route not available for id:', id);
          }
        }).catch(() => console.log('Ticket details route not available for id:', id));
      } catch(e){ console.log('Ticket details route not available for id:', id); }
    });
  });
})();
