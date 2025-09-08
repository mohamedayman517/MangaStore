// Admin Q&A Management client script (vanilla JS)
(function(){
  function ready(fn){ if(document.readyState!=='loading'){ fn(); } else { document.addEventListener('DOMContentLoaded', fn); } }

  function showNotification(msg){
    const toast = document.getElementById('notification');
    const msgEl = document.getElementById('notificationMessage');
    if(!toast || !msgEl) return;
    msgEl.textContent = msg;
    toast.classList.remove('translate-y-20','opacity-0');
    setTimeout(()=>{
      toast.classList.add('translate-y-20','opacity-0');
    }, 2200);
  }

  function toggleHidden(el, hide){ if(!el) return; el.classList[hide?'add':'remove']('hidden'); }

  ready(function(){
    const addForm = document.getElementById('addQuestionForm');
    const editContainer = document.getElementById('editFormContainer');
    const editForm = document.getElementById('editQuestionForm');
    const editId = document.getElementById('editQuestionId');
    const editQuestion = document.getElementById('editQuestion');
    const editAnswer = document.getElementById('editAnswer');
    const cancelEdit = document.getElementById('cancelEdit');

    const loadingIndicator = document.getElementById('loadingIndicator');
    const noQuestionsMsg = document.getElementById('noQuestionsMessage');
    const list = document.getElementById('questionsList');

    const deleteModal = document.getElementById('deleteModal');
    const confirmDelete = document.getElementById('confirmDelete');
    const cancelDelete = document.getElementById('cancelDelete');
    let deleteTargetId = null;

    // Initial UI tweaks
    toggleHidden(loadingIndicator, true);

    // Helper to find question card element by id
    function findItemEl(id){
      return list ? list.querySelector(`.question-item[data-id="${CSS.escape(id)}"]`) : null;
    }

    // Add new question
    if (addForm){
      addForm.addEventListener('submit', function(e){
        e.preventDefault();
        const q = (document.getElementById('question')||{}).value?.trim();
        const a = (document.getElementById('answer')||{}).value?.trim();
        if(!q || !a){ showNotification('Please provide both question and answer.'); return; }
        fetch('/admin/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q, answer: a })
        }).then(async res => {
          if(!res.ok) throw new Error((await res.json()).error||'Failed');
          return res.json();
        }).then(data => {
          showNotification('Question added');
          // Simple approach: reload to re-render list
          window.location.reload();
        }).catch(err => {
          console.error(err);
          showNotification('Failed to add question');
        });
      });
    }

    // Delegate edit/delete clicks
    if (list){
      list.addEventListener('click', function(e){
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        if (editBtn){
          const item = editBtn.closest('.question-item');
          if(!item) return;
          const id = item.getAttribute('data-id');
          const qText = item.querySelector('h3')?.textContent || '';
          const aText = item.querySelector('p.text-gray-600')?.textContent || '';
          if (editContainer && editForm && editId && editQuestion && editAnswer){
            editId.value = id;
            editQuestion.value = qText;
            editAnswer.value = aText;
            toggleHidden(editContainer, false);
            // scroll to form
            editContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else if (deleteBtn){
          const item = deleteBtn.closest('.question-item');
          if(!item) return;
          deleteTargetId = item.getAttribute('data-id');
          toggleHidden(deleteModal, false);
        }
      });
    }

    // Cancel edit
    if (cancelEdit){
      cancelEdit.addEventListener('click', function(){
        toggleHidden(editContainer, true);
        if (editForm) editForm.reset();
      });
    }

    // Submit edit
    if (editForm){
      editForm.addEventListener('submit', function(e){
        e.preventDefault();
        const id = editId.value;
        const q = editQuestion.value.trim();
        const a = editAnswer.value.trim();
        if(!id || !q || !a){ showNotification('Please provide both question and answer.'); return; }
        fetch(`/admin/questions/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q, answer: a })
        }).then(async res => {
          if(!res.ok) throw new Error((await res.json()).error||'Failed');
          return res.json();
        }).then(data => {
          showNotification('Question updated');
          // Update DOM quickly
          const el = findItemEl(id);
          if (el){
            const h3 = el.querySelector('h3');
            const p = el.querySelector('p.text-gray-600');
            if (h3) h3.textContent = data.Q || q;
            if (p) p.textContent = data.A || a;
          }
          toggleHidden(editContainer, true);
          editForm.reset();
        }).catch(err => {
          console.error(err);
          showNotification('Failed to update question');
        });
      });
    }

    // Delete modal handlers
    if (cancelDelete){
      cancelDelete.addEventListener('click', function(){
        deleteTargetId = null;
        toggleHidden(deleteModal, true);
      });
    }
    if (confirmDelete){
      confirmDelete.addEventListener('click', function(){
        if(!deleteTargetId) return;
        const id = deleteTargetId;
        fetch(`/admin/questions/${encodeURIComponent(id)}`, {
          method: 'DELETE'
        }).then(async res => {
          if(!res.ok) throw new Error((await res.json()).error||'Failed');
          return res.json();
        }).then(() => {
          showNotification('Question deleted');
          const el = findItemEl(id);
          if (el) el.remove();
          // If no items left, reveal empty-state message
          if (list && list.querySelectorAll('.question-item').length === 0){
            toggleHidden(noQuestionsMsg, false);
          }
        }).catch(err => {
          console.error(err);
          showNotification('Failed to delete question');
        }).finally(() => {
          deleteTargetId = null;
          toggleHidden(deleteModal, true);
        });
      });
    }
  });
})();
