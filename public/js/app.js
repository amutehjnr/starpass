'use strict';
/* ============================================================
   StarPass – Main App JS
   app.js
   ============================================================ */

// ── Navbar Scroll Behaviour ───────────────────────────────────
(function () {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
})();

// ── Mobile Menu ───────────────────────────────────────────────
(function () {
  const toggle = document.getElementById('mobileToggle');
  const menu   = document.getElementById('mobileMenu');
  if (!toggle || !menu) return;
  toggle.addEventListener('click', () => {
    menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', menu.classList.contains('open'));
  });
  document.addEventListener('click', (e) => {
    if (!toggle.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove('open');
    }
  });
})();

// ── User Dropdown ─────────────────────────────────────────────
(function () {
  const dropdown = document.getElementById('userDropdown');
  const btn      = document.getElementById('userBtn');
  if (!dropdown || !btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  document.addEventListener('click', () => dropdown.classList.remove('open'));
})();

// ── Live Search ───────────────────────────────────────────────
(function () {
  const input   = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  if (!input || !results) return;

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { results.classList.remove('open'); return; }
    timer = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!data.success) return;
        renderSearchResults(data.results);
      } catch { /* ignore */ }
    }, 280);
  });

  function renderSearchResults({ celebrities = [], events = [] }) {
    if (!celebrities.length && !events.length) {
      results.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">No results found</div>';
      results.classList.add('open');
      return;
    }
    let html = '';
    if (celebrities.length) {
      html += '<div style="padding:8px 16px 4px;font-size:10px;font-weight:700;letter-spacing:0.1em;color:var(--text-muted);text-transform:uppercase;">Celebrities</div>';
      celebrities.forEach(c => {
        html += `<a href="/celebrities/${c.slug}" class="search-result-item">
          <img class="search-result-item__img" src="${c.image || '/images/defaults/avatar.png'}" alt="" onerror="this.src='/images/defaults/avatar.png'">
          <div>
            <div class="search-result-item__name">${escHtml(c.name)}</div>
            <div class="search-result-item__type">${escHtml(c.category)}</div>
          </div>
        </a>`;
      });
    }
    if (events.length) {
      html += '<div style="padding:8px 16px 4px;font-size:10px;font-weight:700;letter-spacing:0.1em;color:var(--text-muted);text-transform:uppercase;">Events</div>';
      events.forEach(e => {
        html += `<a href="/events/${e.slug}" class="search-result-item">
          <img class="search-result-item__img" src="${e.image || '/images/defaults/event-banner.jpg'}" alt="" onerror="this.src='/images/defaults/event-banner.jpg'">
          <div>
            <div class="search-result-item__name">${escHtml(e.name)}</div>
            <div class="search-result-item__type">${e.date ? new Date(e.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : 'Event'}</div>
          </div>
        </a>`;
      });
    }
    results.innerHTML = html;
    results.classList.add('open');
  }

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.classList.remove('open');
    }
  });
})();

// ── Notification Badge ─────────────────────────────────────────
(function () {
  const badge       = document.getElementById('notifBadge');
  const sidebarBadge = document.getElementById('sidebarNotifBadge');
  if (!badge && !sidebarBadge) return;

  const updateCount = async () => {
    try {
      const res  = await fetch('/api/v1/notifications/unread-count');
      const data = await res.json();
      const count = data.count || 0;
      [badge, sidebarBadge].forEach(el => {
        if (!el) return;
        el.textContent = count > 99 ? '99+' : count;
        el.classList.toggle('hidden', count === 0);
      });
    } catch { /* ignore */ }
  };

  updateCount();
  setInterval(updateCount, 60000); // poll every minute
})();

// ── Upload Zone Drag & Drop ────────────────────────────────────
document.querySelectorAll('.upload-zone').forEach(zone => {
  const input   = zone.querySelector('.upload-zone__input');
  const preview = zone.querySelector('.upload-zone__preview');

  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files?.[0] && input) {
      const dt = new DataTransfer();
      dt.items.add(e.dataTransfer.files[0]);
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    }
  });

  if (input && preview) {
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; };
      reader.readAsDataURL(file);
    });
  }
});

// ── Modal Helper ──────────────────────────────────────────────
window.openModal  = id => document.getElementById(id)?.classList.add('open');
window.closeModal = id => document.getElementById(id)?.classList.remove('open');

document.querySelectorAll('[data-modal-open]').forEach(btn => {
  btn.addEventListener('click', () => openModal(btn.dataset.modalOpen));
});
document.querySelectorAll('[data-modal-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modalClose));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ── Star Rating Interactive ───────────────────────────────────
document.querySelectorAll('.stars-interactive').forEach(container => {
  const stars = container.querySelectorAll('.star');
  const input = container.querySelector('input[type="hidden"]');

  stars.forEach((star, i) => {
    star.addEventListener('mouseenter', () => {
      stars.forEach((s, j) => s.classList.toggle('selected', j <= i));
    });
    star.addEventListener('click', () => {
      if (input) input.value = i + 1;
      stars.forEach((s, j) => {
        s.classList.toggle('filled', j <= i);
        s.classList.toggle('selected', j <= i);
      });
      container.dataset.rating = i + 1;
    });
  });
  container.addEventListener('mouseleave', () => {
    const current = parseInt(container.dataset.rating || '0');
    stars.forEach((s, j) => s.classList.toggle('selected', j < current));
  });
});

// ── Utility: Escape HTML ──────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Socket.IO Real-Time ───────────────────────────────────────
(function () {
  // Only load Socket.IO if we have a logged-in user (token in cookie)
  if (!document.querySelector('meta[name="csrf-token"]')) return;

  const script = document.createElement('script');
  script.src = '/socket.io/socket.io.js';
  script.onload = () => {
    try {
      const socket = io({ transports: ['websocket', 'polling'] });

      socket.on('notification:new', (data) => {
        showToast(data.title, data.message, 'info');
        // Update badge
        const badge = document.getElementById('notifBadge');
        const sidebarBadge = document.getElementById('sidebarNotifBadge');
        [badge, sidebarBadge].forEach(el => {
          if (!el) return;
          const count = parseInt(el.textContent || '0') + 1;
          el.textContent = count > 99 ? '99+' : count;
          el.classList.remove('hidden');
        });
      });

      socket.on('checkin:new', (data) => {
        const list = document.getElementById('checkinList');
        if (!list) return;
        const item = document.createElement('div');
        item.className = 'alert alert-success animate-fade-up';
        item.innerHTML = `<span class="alert__icon">✅</span><div><strong>${escHtml(data.fan)}</strong> – ${escHtml(data.category)} – ${new Date(data.checkedInAt).toLocaleTimeString()}</div>`;
        list.prepend(item);
      });
    } catch { /* Socket.IO not available */ }
  };
  document.head.appendChild(script);
})();

// ── Toast Notification ────────────────────────────────────────
window.showToast = function(title, message, type = 'info') {
  const container = document.getElementById('flashContainer') || (() => {
    const el = document.createElement('div');
    el.id = 'flashContainer';
    el.className = 'flash-container';
    document.body.appendChild(el);
    return el;
  })();

  const typeMap = { success: 'alert-success', error: 'alert-error', warning: 'alert-warning', info: 'alert-info' };
  const iconMap = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `alert ${typeMap[type] || typeMap.info} animate-fade-up`;
  toast.innerHTML = `
    <span class="alert__icon">${iconMap[type] || iconMap.info}</span>
    <div class="alert__content"><strong>${escHtml(title)}</strong>${message ? `<br><span style="font-size:0.9em;opacity:0.85">${escHtml(message)}</span>` : ''}</div>
    <button class="alert__close" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.4s ease';
    setTimeout(() => toast.remove(), 400);
  }, 5000);
};
