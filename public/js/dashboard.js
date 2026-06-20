'use strict';
/* dashboard.js – Sidebar toggle + dashboard interactions */

// ── Sidebar Mobile Toggle ─────────────────────────────────────
(function () {
  const sidebar   = document.getElementById('dashSidebar');
  const overlay   = document.getElementById('sidebarOverlay');
  const sidebarToggleBtn = document.getElementById('sidebarToggle');

  if (!sidebar) return;

  // Show toggle on mobile
  if (window.innerWidth <= 1024 && sidebarToggleBtn) {
    sidebarToggleBtn.style.display = 'inline-flex';
  }

  function openSidebar() {
    sidebar.classList.add('open');
    if (overlay) overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', () => {
      sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    });
  }

  if (overlay) overlay.addEventListener('click', closeSidebar);

  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) {
      closeSidebar();
      if (sidebarToggleBtn) sidebarToggleBtn.style.display = 'none';
    } else {
      if (sidebarToggleBtn) sidebarToggleBtn.style.display = 'inline-flex';
    }
  });
})();

// ── Auto-refresh notification count on dashboard ──────────────
(function () {
  if (!document.querySelector('.dashboard-layout')) return;
  // Already handled in app.js via polling
})();
