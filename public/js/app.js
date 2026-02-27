/*
 * ─────────────────────────────────────────────────────────────
 *  GLOBAL BOOKING ENGINE – FRONTEND SPA
 * ─────────────────────────────────────────────────────────────
 *  This is a vanilla JavaScript Single Page Application (SPA)
 *  that communicates with the Express backend via REST APIs.
 *
 *  ARCHITECTURE:
 *    - No build tools, no framework – pure ES6
 *    - Hash-based routing (#search, #bookings, #login, etc.)
 *    - Token management in localStorage
 *    - All DOM rendering via template literal functions
 *
 *  CONNECTED TO:
 *    - public/index.html       → #app container, #navbar, #toast
 *    - public/css/style.css    → all class names used here
 *    - Server API at /api/*    → all fetch calls
 *
 *  PAGES:
 *    #search       → Public search with filters
 *    #login        → Login form
 *    #register     → Registration form
 *    #bookings     → User's bookings list
 *    #tasks        → Tasks linked to bookings
 *    #all-bookings → All bookings across users (admin only)
 *    #admin        → Admin inventory management (admin only)
 * ─────────────────────────────────────────────────────────────
 */

/* ═══════════════════════════════════════════════════════════
   STATE MANAGEMENT
   Centralised app state. All rendering reads from here.
   ═══════════════════════════════════════════════════════════ */
const state = {
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  currentPage: 'search',
  searchPage: 1, // tracks current pagination page for search results
};

/* ═══════════════════════════════════════════════════════════
   API HELPER
   Wraps fetch() with:
   - Automatic Authorization header injection
   - Automatic token refresh on 401 (TOKEN_EXPIRED)
   - JSON parsing with error extraction
   ═══════════════════════════════════════════════════════════ */
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };

  if (state.accessToken) {
    headers['Authorization'] = `Bearer ${state.accessToken}`;
  }

  let res = await fetch(`/api${path}`, { ...options, headers });

  /*
   * TOKEN REFRESH FLOW:
   * If the access token expired, try refreshing silently.
   * On success, retry the original request with the new token.
   * On failure, force logout.
   */
  if (res.status === 401 && state.refreshToken) {
    const body = await res.json();
    if (body.code === 'TOKEN_EXPIRED') {
      const refreshed = await refreshTokens();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${state.accessToken}`;
        res = await fetch(`/api${path}`, { ...options, headers });
      } else {
        logout();
        return { success: false, message: 'Session expired. Please log in again.' };
      }
    }
  }

  return res.json();
}

async function refreshTokens() {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: state.refreshToken }),
    });
    const data = await res.json();
    if (data.success) {
      setTokens(data.data.accessToken, data.data.refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════
   AUTH HELPERS
   ═══════════════════════════════════════════════════════════ */
function setTokens(access, refresh) {
  state.accessToken = access;
  state.refreshToken = refresh;
  localStorage.setItem('accessToken', access);
  localStorage.setItem('refreshToken', refresh);
}

function setUser(user) {
  state.user = user;
  localStorage.setItem('user', JSON.stringify(user));
}

function logout() {
  if (state.accessToken) {
    api('/auth/logout', { method: 'POST' }).catch(() => {});
  }
  state.accessToken = null;
  state.refreshToken = null;
  state.user = null;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  navigate('login');
}

function isLoggedIn() {
  return !!state.accessToken;
}

function isAdmin() {
  return state.user?.role === 'admin';
}

/* ═══════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ═══════════════════════════════════════════════════════════ */
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => { toast.className = 'toast hidden'; }, 4000);
}

/* ═══════════════════════════════════════════════════════════
   PRICE FORMATTER
   Prices are stored in cents – convert to dollars for display.
   ═══════════════════════════════════════════════════════════ */
function formatPrice(cents) {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ═══════════════════════════════════════════════════════════
   SPA ROUTER
   Hash-based navigation. Each hash maps to a render function.
   ═══════════════════════════════════════════════════════════ */
function navigate(page) {
  window.location.hash = page;
}

function handleRoute() {
  const hash = window.location.hash.slice(1) || 'search';

  /*
   * SHARED LINK HANDLER:
   * When someone opens a short URL like /s/Ab3xK9z, the server
   * redirects to /#item=<inventoryId>. We detect this pattern
   * here and render the item detail page instead of a normal route.
   */
  if (hash.startsWith('item=')) {
    const itemId = hash.split('=')[1];
    state.currentPage = 'search';
    renderNav();
    renderSharedItem(itemId);
    return;
  }

  state.currentPage = hash;
  renderNav();

  const routes = {
    search: renderSearchPage,
    login: renderLoginPage,
    register: renderRegisterPage,
    bookings: renderBookingsPage,
    'all-bookings': renderAllBookingsPage,
    tasks: renderTasksPage,
    admin: renderAdminPage,
  };

  const renderFn = Object.prototype.hasOwnProperty.call(routes, hash)
    ? routes[hash]
    : renderSearchPage;
  renderFn();
}

/*
 * ─── SHARED ITEM DETAIL PAGE ────────────────────────────────
 *  Renders a single inventory item when opened via share link.
 *  Shows full details + booking button + "back to search" link.
 * ────────────────────────────────────────────────────────────
 */
async function renderSharedItem(itemId) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="loading-center"><div class="spinner"></div></div>`;

  const res = await api(`/search?page=1&limit=100`);

  if (!res.success) {
    app.innerHTML = `<div class="empty-state"><h3>Item not found</h3><button class="btn btn-primary" onclick="navigate('search')">Browse All</button></div>`;
    return;
  }

  const item = res.data.results.find(r => r._id === itemId);

  if (!item) {
    app.innerHTML = `<div class="empty-state"><h3>Item not found or no longer available</h3><button class="btn btn-primary" onclick="navigate('search')">Browse All</button></div>`;
    return;
  }

  const avail = item.availableUnits;
  const statusClass = avail > 5 ? 'available' : avail > 0 ? 'limited' : 'sold-out';
  const statusText = avail > 5 ? `${avail} available` : avail > 0 ? `Only ${avail} left!` : 'Sold Out';

  const details = item.type === 'flight'
    ? `<p><strong>Route:</strong> ${item.origin} → ${item.destination}</p>
       <p><strong>Airline:</strong> ${item.airline || '—'} ${item.flightNumber || ''}</p>
       <p><strong>Departure:</strong> ${formatDate(item.departureDate)}</p>
       <p><strong>Arrival:</strong> ${formatDate(item.arrivalDate)}</p>`
    : `<p><strong>Location:</strong> ${item.location || '—'}</p>
       <p><strong>Check-in:</strong> ${formatDate(item.checkInDate)}</p>
       <p><strong>Check-out:</strong> ${formatDate(item.checkOutDate)}</p>
       ${item.amenities?.length ? `<p><strong>Amenities:</strong> ${item.amenities.join(', ')}</p>` : ''}`;

  app.innerHTML = `
    <div style="margin-bottom:1rem">
      <button class="btn btn-outline btn-sm" onclick="navigate('search')">← Back to Search</button>
    </div>
    <div class="card" style="max-width:600px">
      <div class="card-header">
        <div>
          <div class="card-title" style="font-size:1.4rem">${item.title}</div>
          <div class="card-subtitle">${item.description || ''}</div>
        </div>
        <div>
          <span class="badge badge-${item.type}">${item.type}</span>
          <span class="badge badge-${item.category}">${item.category}</span>
        </div>
      </div>
      <div class="card-body" style="font-size:0.95rem;line-height:2">
        ${details}
        <p><span class="status-dot ${statusClass}"></span>${statusText}</p>
      </div>
      <div class="card-footer">
        <div>
          <span class="price" style="font-size:2rem">${formatPrice(item.price)}</span>
          <span class="price-unit">/ ${item.type === 'flight' ? 'seat' : 'night'}</span>
        </div>
        <div style="display:flex;gap:0.5rem">
          <button class="btn btn-outline btn-sm" onclick="shareItem('${item._id}', '${escapeAttr(item.title)}')">Share</button>
          ${avail > 0 && isLoggedIn()
            ? `<button class="btn btn-primary" onclick="bookItem('${item._id}')">Book Now</button>`
            : avail > 0
              ? `<button class="btn btn-outline" onclick="navigate('login')">Login to Book</button>`
              : ''}
        </div>
      </div>
    </div>
  `;
}

window.addEventListener('hashchange', handleRoute);

/* ═══════════════════════════════════════════════════════════
   NAVIGATION BAR
   ═══════════════════════════════════════════════════════════ */
function renderNav() {
  const links = document.getElementById('nav-links');
  const p = state.currentPage;

  let html = `<button class="${p === 'search' ? 'active' : ''}" onclick="navigate('search')">Search</button>`;

  if (isLoggedIn()) {
    if (!isAdmin()) {
      html += `<button class="${p === 'bookings' ? 'active' : ''}" onclick="navigate('bookings')">My Bookings</button>`;
      html += `<button class="${p === 'tasks' ? 'active' : ''}" onclick="navigate('tasks')">Tasks</button>`;
    }

    if (isAdmin()) {
      html += `<button class="${p === 'all-bookings' ? 'active' : ''}" onclick="navigate('all-bookings')">All Bookings</button>`;
      html += `<button class="${p === 'admin' ? 'active' : ''}" onclick="navigate('admin')">Admin</button>`;
    }

    html += `<button onclick="logout()">Logout (${state.user?.name || ''})</button>`;
  } else {
    html += `<button class="${p === 'login' ? 'active' : ''}" onclick="navigate('login')">Login</button>`;
    html += `<button class="${p === 'register' ? 'active' : ''}" onclick="navigate('register')">Register</button>`;
  }

  links.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════
   SEARCH PAGE
   Public inventory search with filters and booking buttons.
   ═══════════════════════════════════════════════════════════ */
async function renderSearchPage() {
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="page-header">
      <h1>Find Your Next Trip</h1>
      <p>Search flights and hotels worldwide</p>
    </div>

    <div class="tabs" id="search-tabs">
      <button class="tab active" onclick="switchSearchTab('', this)">All</button>
      <button class="tab" onclick="switchSearchTab('flight', this)">Flights</button>
      <button class="tab" onclick="switchSearchTab('hotel', this)">Hotels</button>
    </div>

    <div class="search-bar" id="search-filters">
      <div class="form-group">
        <label>Category</label>
        <select class="form-control" id="f-category">
          <option value="">All</option>
          <option value="economy">Economy</option>
          <option value="business">Business</option>
          <option value="first">First Class</option>
          <option value="budget">Budget</option>
          <option value="standard">Standard</option>
          <option value="luxury">Luxury</option>
        </select>
      </div>
      <div class="form-group">
        <label>Min Price ($)</label>
        <input type="number" class="form-control" id="f-min" placeholder="0" />
      </div>
      <div class="form-group">
        <label>Max Price ($)</label>
        <input type="number" class="form-control" id="f-max" placeholder="Any" />
      </div>
      <div class="form-group">
        <label>Location / Route</label>
        <input type="text" class="form-control" id="f-location" placeholder="City or IATA code" />
      </div>
      <button class="btn btn-primary" onclick="doSearch()">Search</button>
    </div>

    <!-- Hidden input to track which tab is active -->
    <input type="hidden" id="f-type" value="" />

    <!-- Recommendations section (only shows if logged in and has bookings) -->
    <div id="recommendations-section"></div>

    <div id="search-results" class="card-grid">
      <div class="loading-center"><div class="spinner"></div></div>
    </div>
  `;

  /* Load recommendations if the user is logged in */
  if (isLoggedIn()) {
    loadRecommendations();
  }

  doSearch();
}

/*
 * ─── switchSearchTab ────────────────────────────────────────
 *  Switches between All / Flights / Hotels tabs.
 *  Updates the hidden type input and highlights the active tab,
 *  then re-runs the search with the new filter.
 * ────────────────────────────────────────────────────────────
 */
function switchSearchTab(type, btn) {
  state.searchPage = 1;
  document.getElementById('f-type').value = type;

  document.querySelectorAll('#search-tabs .tab').forEach(b => {
    b.classList.remove('active');
  });
  btn.classList.add('active');

  doSearch();
}

/*
 * ─── RECOMMENDATION SYSTEM ─────────────────────────────────
 *  HOW IT WORKS:
 *    1. Fetch the user's past bookings
 *    2. Extract the destinations they've booked (countries/cities)
 *    3. Search for other flights/hotels going to those same places
 *    4. Show up to 4 recommendations above the search results
 *
 *  EXAMPLE:
 *    User booked a flight to London (LHR)
 *    → We recommend hotels in London + other flights to LHR
 *
 *  This is a simple "content-based" recommendation approach:
 *    "You liked destination X, here are more options for X"
 * ────────────────────────────────────────────────────────────
 */
async function loadRecommendations() {
  const section = document.getElementById('recommendations-section');
  if (!section) return;

  /* Step 1: Fetch user's bookings to find their destinations */
  const bookingsRes = await api('/bookings');
  if (!bookingsRes.success || !bookingsRes.data.bookings.length) {
    section.innerHTML = '';
    return;
  }

  /*
   * Step 2: Extract unique destinations from past bookings.
   * For flights: use the destination IATA code (e.g. "LHR")
   * For hotels: use the location string (e.g. "London, UK")
   */
  const destinations = new Set();
  const locations = new Set();

  bookingsRes.data.bookings.forEach(b => {
    const inv = b.inventoryId;
    if (!inv) return;
    if (inv.destination) destinations.add(inv.destination);
    if (inv.location) locations.add(inv.location);
  });

  /* If user has no destinations yet, skip recommendations */
  if (destinations.size === 0 && locations.size === 0) {
    section.innerHTML = '';
    return;
  }

  /*
   * Step 3: Search for items matching those destinations.
   * We fetch all available inventory and filter client-side
   * to find matches. This is simple and works well for our
   * dataset size. For millions of items, you'd use a
   * server-side recommendation engine instead.
   */
  const searchRes = await api('/search?limit=100');
  if (!searchRes.success) return;

  const allItems = searchRes.data.results;

  /* Find items that match the user's past destinations */
  const recommended = allItems.filter(item => {
    /* Skip items the user already booked */
    const alreadyBooked = bookingsRes.data.bookings.some(
      b => b.inventoryId?._id === item._id
    );
    if (alreadyBooked) return false;

    /* Match flights by destination code */
    if (item.destination && destinations.has(item.destination)) return true;

    /* Match hotels by location (partial match) */
    if (item.location) {
      for (const loc of locations) {
        /* Check if the city name overlaps (e.g. "London" in "London, UK") */
        const city = loc.split(',')[0].trim().toLowerCase();
        if (item.location.toLowerCase().includes(city)) return true;
      }
    }

    return false;
  }).slice(0, 4); /* Show max 4 recommendations */

  /* Step 4: Render the recommendations section */
  if (recommended.length === 0) {
    section.innerHTML = '';
    return;
  }

  const destList = [...destinations, ...[...locations].map(l => l.split(',')[0])].join(', ');

  section.innerHTML = `
    <div style="margin: 1.5rem 0">
      <h3 style="margin-bottom:0.25rem">Recommended for You</h3>
      <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:1rem">
        Based on your trips to ${destList}
      </p>
      <div class="card-grid">
        ${recommended.map(item => {
          const avail = item.availableUnits;
          const statusClass = avail > 5 ? 'available' : avail > 0 ? 'limited' : 'sold-out';
          return `
          <div class="card" style="border-left:3px solid var(--primary)">
            <div class="card-header">
              <div>
                <div class="card-title">${item.title}</div>
                <div class="card-subtitle">${item.type === 'flight' ? (item.origin + ' → ' + item.destination) : (item.location || '')}</div>
              </div>
              <span class="badge badge-${item.type}">${item.type}</span>
            </div>
            <div class="card-footer">
              <span class="price">${formatPrice(item.price)}</span>
              <div style="display:flex;gap:0.5rem">
                <button class="btn btn-outline btn-sm" onclick="shareItem('${item._id}', '${escapeAttr(item.title)}')">Share</button>
                ${avail > 0
                  ? `<button class="btn btn-primary btn-sm" onclick="bookItem('${item._id}')">Book</button>`
                  : '<span class="badge badge-cancelled">Sold Out</span>'}
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
    <hr style="border:none;border-top:1px solid var(--border);margin:1.5rem 0">
  `;
}

async function doSearch() {
  const params = new URLSearchParams();
  const type = document.getElementById('f-type')?.value;
  const category = document.getElementById('f-category')?.value;
  const minPrice = document.getElementById('f-min')?.value;
  const maxPrice = document.getElementById('f-max')?.value;
  const location = document.getElementById('f-location')?.value;

  /* 20 results per page with pagination */
  params.set('limit', '20');
  params.set('page', state.searchPage);

  if (type) params.set('type', type);
  if (category) params.set('category', category);
  if (minPrice) params.set('minPrice', Number(minPrice) * 100);
  if (maxPrice) params.set('maxPrice', Number(maxPrice) * 100);
  if (location) {
    if (type === 'flight') {
      params.set('origin', location.toUpperCase());
    } else if (type === 'hotel') {
      params.set('location', location);
    } else {
      params.set('location', location);
    }
  }

  const res = await api(`/search?${params.toString()}`);
  const container = document.getElementById('search-results');

  /* Remove old pagination bar on every search */
  const staleBar = document.getElementById('pagination-bar');
  if (staleBar) staleBar.remove();

  if (!res.success || !res.data.results.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No results found</h3>
        <p>Try adjusting your filters.</p>
      </div>`;
    return;
  }

  container.innerHTML = res.data.results.map(item => {
    const avail = item.availableUnits;
    const statusClass = avail > 5 ? 'available' : avail > 0 ? 'limited' : 'sold-out';
    const statusText = avail > 5 ? `${avail} available` : avail > 0 ? `Only ${avail} left!` : 'Sold Out';

    const details = item.type === 'flight'
      ? `<p>${item.origin} → ${item.destination} · ${item.airline || ''} ${item.flightNumber || ''}</p>
         <p>${formatDate(item.departureDate)} → ${formatDate(item.arrivalDate)}</p>`
      : `<p>${item.location || ''}</p>
         <p>${formatDate(item.checkInDate)} → ${formatDate(item.checkOutDate)}</p>
         ${item.amenities?.length ? `<p>${item.amenities.join(' · ')}</p>` : ''}`;

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${item.title}</div>
            <div class="card-subtitle">${item.description || ''}</div>
          </div>
          <div>
            <span class="badge badge-${item.type}">${item.type}</span>
            <span class="badge badge-${item.category}">${item.category}</span>
          </div>
        </div>
        <div class="card-body">${details}</div>
        <div class="card-footer">
          <div>
            <span class="price">${formatPrice(item.price)}</span>
            <span class="price-unit">/ ${item.type === 'flight' ? 'seat' : 'night'}</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
            <span><span class="status-dot ${statusClass}"></span>${statusText}</span>
            <button class="btn btn-outline btn-sm" onclick="shareItem('${item._id}', '${escapeAttr(item.title)}')">Share</button>
            ${avail > 0 && isLoggedIn() && !isAdmin()
              ? `<button class="btn btn-primary btn-sm" onclick="bookItem('${item._id}')">Book Now</button>`
              : avail > 0 && !isLoggedIn()
                ? `<button class="btn btn-outline btn-sm" onclick="navigate('login')">Login to Book</button>`
                : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  /* ── Remove old pagination bar before rendering new one ── */
  const oldBar = document.getElementById('pagination-bar');
  if (oldBar) oldBar.remove();

  /* ── Render pagination bar below results ──────────────── */
  const { page, pages, total } = res.data;
  if (pages > 1) {
    container.insertAdjacentHTML('afterend', `
      <div class="pagination" id="pagination-bar">
        <button class="btn btn-outline btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="goToPage(${page - 1})">← Prev</button>
        <span class="pagination-info">Page ${page} of ${pages} (${total} results)</span>
        <button class="btn btn-outline btn-sm" ${page >= pages ? 'disabled' : ''} onclick="goToPage(${page + 1})">Next →</button>
      </div>
    `);
  }
}

/* Navigate to a specific search results page */
function goToPage(page) {
  state.searchPage = page;
  doSearch();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/*
 * ─── SHARE ITEM ─────────────────────────────────────────────
 *  Called when user clicks the "Share" button on a card.
 *  1. Calls POST /api/share to get (or create) a short URL
 *  2. Shows a modal with the short URL and a copy button
 *  3. Clicking "Copy" copies the URL to clipboard
 * ────────────────────────────────────────────────────────────
 */
async function shareItem(inventoryId, title) {
  const res = await api('/share', {
    method: 'POST',
    body: JSON.stringify({ inventoryId }),
  });

  if (!res.success) {
    showToast(res.message || 'Failed to generate share link', 'error');
    return;
  }

  const shortUrl = res.data.shortUrl;

  /* Show share modal overlay */
  const overlay = document.createElement('div');
  overlay.id = 'share-overlay';
  overlay.className = 'share-overlay';
  overlay.innerHTML = `
    <div class="share-modal">
      <div class="share-modal-header">
        <h3>Share This ${title ? 'Listing' : 'Item'}</h3>
        <button class="share-close" onclick="closeShareModal()">&times;</button>
      </div>
      <p class="share-title">${title || 'Inventory Item'}</p>
      <div class="share-url-box">
        <input type="text" id="share-url-input" class="form-control" value="${shortUrl}" readonly />
        <button class="btn btn-primary btn-sm" onclick="copyShareUrl()">Copy</button>
      </div>
      <p class="share-hint">Anyone with this link can view this listing</p>
      <div class="share-clicks">Link clicked ${res.data.clicks} time${res.data.clicks !== 1 ? 's' : ''}</div>
    </div>
  `;
  document.body.appendChild(overlay);

  /* Close when clicking outside the modal */
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeShareModal();
  });
}

function copyShareUrl() {
  const input = document.getElementById('share-url-input');
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Link copied to clipboard!', 'success');
  }).catch(() => {
    document.execCommand('copy');
    showToast('Link copied!', 'success');
  });
}

function closeShareModal() {
  const overlay = document.getElementById('share-overlay');
  if (overlay) overlay.remove();
}

async function bookItem(inventoryId) {
  const res = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({ inventoryId, quantity: 1 }),
  });

  if (res.success) {
    showToast('Booking created! You have 15 minutes to confirm payment.', 'success');
    navigate('bookings');
  } else {
    showToast(res.message || 'Booking failed', 'error');
  }
}

/* ═══════════════════════════════════════════════════════════
   LOGIN PAGE
   ═══════════════════════════════════════════════════════════ */
function renderLoginPage() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="card form-card">
      <h2 style="margin-bottom:1.5rem;text-align:center">Welcome Back</h2>
      <div class="form-group">
        <label>Email</label>
        <input type="email" class="form-control" id="login-email" placeholder="you@example.com" />
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" class="form-control" id="login-password" placeholder="••••••" />
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="doLogin()">Sign In</button>
      <p style="text-align:center;margin-top:1rem;font-size:0.85rem;color:var(--text-muted)">
        Don't have an account? <a href="#register" style="color:var(--primary)">Register</a>
      </p>
    </div>
  `;
}

async function doLogin() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  const res = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (res.success) {
    setTokens(res.data.accessToken, res.data.refreshToken);
    setUser(res.data.user);
    showToast(`Welcome back, ${res.data.user.name}!`, 'success');
    navigate('search');
  } else {
    showToast(res.message || 'Login failed', 'error');
  }
}

/* ═══════════════════════════════════════════════════════════
   REGISTER PAGE
   ═══════════════════════════════════════════════════════════ */
function renderRegisterPage() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="card form-card">
      <h2 style="margin-bottom:1.5rem;text-align:center">Create Account</h2>
      <div class="form-group">
        <label>Full Name</label>
        <input type="text" class="form-control" id="reg-name" placeholder="John Doe" />
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" class="form-control" id="reg-email" placeholder="you@example.com" />
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" class="form-control" id="reg-password" placeholder="Min 6 characters" />
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="doRegister()">Create Account</button>
      <p style="text-align:center;margin-top:1rem;font-size:0.85rem;color:var(--text-muted)">
        Already have an account? <a href="#login" style="color:var(--primary)">Sign In</a>
      </p>
    </div>
  `;
}

async function doRegister() {
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;

  const res = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });

  if (res.success) {
    setTokens(res.data.accessToken, res.data.refreshToken);
    setUser(res.data.user);
    showToast('Account created! Welcome aboard.', 'success');
    navigate('search');
  } else {
    showToast(res.message || 'Registration failed', 'error');
  }
}

/* ═══════════════════════════════════════════════════════════
   BOOKINGS PAGE
   Lists the user's bookings with state transition buttons.
   ═══════════════════════════════════════════════════════════ */
async function renderBookingsPage() {
  if (!isLoggedIn()) { navigate('login'); return; }

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="page-header">
      <h1>My Bookings</h1>
      <p>Manage your reservations</p>
    </div>
    <div id="bookings-list" class="card-grid">
      <div class="loading-center"><div class="spinner"></div></div>
    </div>
  `;

  const res = await api('/bookings');
  const container = document.getElementById('bookings-list');

  if (!res.success || !res.data.bookings.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No bookings yet</h3>
        <p>Search and book your first trip!</p>
        <button class="btn btn-primary" style="margin-top:1rem" onclick="navigate('search')">Browse Inventory</button>
      </div>`;
    return;
  }

  container.innerHTML = res.data.bookings.map(b => {
    const inv = b.inventoryId || {};
    const statusKey = b.status.toLowerCase().replace('_', '-');
    const statusLabel = b.status.replace('_', ' ');

    let actions = '';
    if (b.status === 'PENDING_PAYMENT') {
      actions = `
        <button class="btn btn-success btn-sm" onclick="confirmBooking('${b._id}')">Confirm Payment</button>
        <button class="btn btn-danger btn-sm" onclick="cancelBooking('${b._id}')">Cancel</button>`;
    } else if (b.status === 'CONFIRMED') {
      actions = `
        <button class="btn btn-primary btn-sm" onclick="completeBooking('${b._id}')">Mark Complete</button>
        <button class="btn btn-danger btn-sm" onclick="cancelBooking('${b._id}')">Cancel</button>`;
    }

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${inv.title || 'Unknown Item'}</div>
            <div class="card-subtitle">
              ${inv.type === 'flight' ? `${inv.origin} → ${inv.destination}` : inv.location || ''}
            </div>
          </div>
          <span class="badge badge-${statusKey}">${statusLabel}</span>
        </div>
        <div class="card-body">
          <p>Quantity: ${b.quantity} · Unit: ${formatPrice(b.unitPrice)}</p>
          <p>Total: <strong>${formatPrice(b.totalPrice)}</strong></p>
          <p>Booked: ${formatDate(b.createdAt)}</p>
          ${b.confirmedAt ? `<p>Confirmed: ${formatDate(b.confirmedAt)}</p>` : ''}
          ${b.cancelledAt ? `<p>Cancelled: ${formatDate(b.cancelledAt)} — ${b.cancellationReason || ''}</p>` : ''}
        </div>
        ${actions ? `<div class="card-footer">${actions}</div>` : ''}
      </div>`;
  }).join('');
}

async function confirmBooking(id) {
  const res = await api(`/bookings/${id}/confirm`, { method: 'PATCH' });
  if (res.success) {
    showToast('Booking confirmed!', 'success');
    renderBookingsPage();
  } else {
    showToast(res.message, 'error');
  }
}

async function cancelBooking(id) {
  const res = await api(`/bookings/${id}/cancel`, { method: 'PATCH' });
  if (res.success) {
    showToast('Booking cancelled. Inventory restored.', 'info');
    renderBookingsPage();
  } else {
    showToast(res.message, 'error');
  }
}

async function completeBooking(id) {
  const res = await api(`/bookings/${id}/complete`, { method: 'PATCH' });
  if (res.success) {
    showToast('Booking marked as completed.', 'success');
    renderBookingsPage();
  } else {
    showToast(res.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════
   ALL BOOKINGS PAGE (Admin only)
   Shows every booking from all users with pagination and
   status filter tabs.
   ═══════════════════════════════════════════════════════════ */
let allBookingsPage = 1;
let allBookingsStatus = '';

function filterAllBookings(status, btn) {
  allBookingsStatus = status;
  allBookingsPage = 1;
  document.querySelectorAll('#all-bookings-tabs .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  loadAllBookings();
}

function goToAllBookingsPage(page) {
  allBookingsPage = page;
  loadAllBookings();
  document.getElementById('all-bookings-list').scrollIntoView({ behavior: 'smooth' });
}

async function renderAllBookingsPage() {
  if (!isLoggedIn() || !isAdmin()) { navigate('search'); return; }

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="page-header">
      <h1>All Bookings</h1>
      <p>View and manage bookings from all users</p>
    </div>
    <div class="tabs" id="all-bookings-tabs">
      <button class="tab active" onclick="filterAllBookings('', this)">All</button>
      <button class="tab" onclick="filterAllBookings('COMPLETED', this)">Completed</button>
      <button class="tab" onclick="filterAllBookings('CANCELLED', this)">Cancelled</button>
    </div>
    <div id="all-bookings-list" class="card-grid">
      <div class="loading-center"><div class="spinner"></div></div>
    </div>
  `;

  allBookingsPage = 1;
  allBookingsStatus = '';
  loadAllBookings();
}

async function loadAllBookings() {
  const statusParam = allBookingsStatus ? `&status=${allBookingsStatus}` : '';
  const res = await api(`/bookings/all?page=${allBookingsPage}&limit=20${statusParam}`);
  const container = document.getElementById('all-bookings-list');

  const oldBar = document.getElementById('all-bookings-pagination');
  if (oldBar) oldBar.remove();

  if (!res.success || !res.data.bookings.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No bookings found</h3>
        <p>${allBookingsStatus ? 'No bookings with this status.' : 'No bookings have been made yet.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = res.data.bookings.map(b => {
    const inv = b.inventoryId || {};
    const user = b.userId || {};
    const statusKey = b.status.toLowerCase().replace('_', '-');
    const statusLabel = b.status.replace('_', ' ');

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${inv.title || 'Unknown Item'}</div>
            <div class="card-subtitle">
              ${inv.type === 'flight' ? `${inv.origin} → ${inv.destination}` : inv.location || ''}
            </div>
          </div>
          <span class="badge badge-${statusKey}">${statusLabel}</span>
        </div>
        <div class="card-body">
          <p><strong>Booked by:</strong> ${user.name || 'Unknown'} (${user.email || '—'})</p>
          <p>Quantity: ${b.quantity} · Unit: ${formatPrice(b.unitPrice)}</p>
          <p>Total: <strong>${formatPrice(b.totalPrice)}</strong></p>
          <p>Booked: ${formatDate(b.createdAt)}</p>
          ${b.confirmedAt ? `<p>Confirmed: ${formatDate(b.confirmedAt)}</p>` : ''}
          ${b.cancelledAt ? `<p>Cancelled: ${formatDate(b.cancelledAt)} — ${b.cancellationReason || ''}</p>` : ''}
        </div>
      </div>`;
  }).join('');

  const { page, pages, total } = res.data;
  if (pages > 1) {
    container.insertAdjacentHTML('afterend', `
      <div class="pagination" id="all-bookings-pagination">
        <button class="btn btn-outline btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="goToAllBookingsPage(${page - 1})">← Prev</button>
        <span class="pagination-info">Page ${page} of ${pages} (${total} bookings)</span>
        <button class="btn btn-outline btn-sm" ${page >= pages ? 'disabled' : ''} onclick="goToAllBookingsPage(${page + 1})">Next →</button>
      </div>
    `);
  }
}

/* ═══════════════════════════════════════════════════════════
   TASKS PAGE — Travel Itinerary Checklist
   Tasks are to-do items linked to your bookings.
   They help you prepare for your trip (e.g. "check-in",
   "download boarding pass", "pack luggage").
   Tasks are grouped by booking, with checkboxes, priority
   levels, and due dates.
   ═══════════════════════════════════════════════════════════ */
async function renderTasksPage() {
  if (!isLoggedIn()) { navigate('login'); return; }

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="page-header">
      <h1>Travel Tasks</h1>
      <p>Prepare for your trips — create checklists for each booking</p>
    </div>

    <div class="card" style="margin-bottom:2rem">
      <h3 style="margin-bottom:0.5rem">Add New Task</h3>
      <p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:1rem">
        Link a to-do item to one of your bookings (e.g. "Check-in online", "Pack luggage")
      </p>
      <div class="form-row">
        <div class="form-group">
          <label>Select Booking</label>
          <select class="form-control" id="task-booking">
            <option value="">-- Select a booking --</option>
          </select>
        </div>
        <div class="form-group">
          <label>Task Title</label>
          <input type="text" class="form-control" id="task-title" placeholder="e.g. Complete online check-in" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Priority</label>
          <select class="form-control" id="task-priority">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div class="form-group">
          <label>Due Date</label>
          <input type="date" class="form-control" id="task-due" />
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem">
        <span style="font-size:0.75rem;color:var(--text-muted);align-self:center">Quick add:</span>
        <button class="btn btn-outline btn-sm" onclick="quickAddTask('Complete online check-in')">Check-in</button>
        <button class="btn btn-outline btn-sm" onclick="quickAddTask('Download boarding pass')">Boarding Pass</button>
        <button class="btn btn-outline btn-sm" onclick="quickAddTask('Print hotel confirmation')">Print Voucher</button>
        <button class="btn btn-outline btn-sm" onclick="quickAddTask('Pack luggage')">Pack Luggage</button>
        <button class="btn btn-outline btn-sm" onclick="quickAddTask('Arrange airport transfer')">Airport Transfer</button>
        <button class="btn btn-outline btn-sm" onclick="quickAddTask('Buy travel insurance')">Insurance</button>
      </div>
      <button class="btn btn-primary" onclick="createTask()">Add Task</button>
    </div>

    <div id="tasks-list">
      <div class="loading-center"><div class="spinner"></div></div>
    </div>
  `;

  /* Load bookings for the dropdown — only show active (non-cancelled) ones */
  const bookingsRes = await api('/bookings');
  const select = document.getElementById('task-booking');
  if (bookingsRes.success && bookingsRes.data.bookings.length) {
    const activeBookings = bookingsRes.data.bookings.filter(b => b.status !== 'CANCELLED');
    if (activeBookings.length === 0) {
      select.innerHTML = '<option value="">No active bookings</option>';
    } else {
      select.innerHTML = '<option value="">-- Select a booking --</option>' +
        activeBookings.map(b => {
          const inv = b.inventoryId || {};
          const label = inv.title || 'Booking';
          const route = inv.type === 'flight'
            ? ` (${inv.origin} → ${inv.destination})`
            : inv.location ? ` (${inv.location})` : '';
          return `<option value="${b._id}">${label}${route}</option>`;
        }).join('');
    }
  } else {
    select.innerHTML = '<option value="">No bookings yet — book something first!</option>';
  }

  loadTasks(bookingsRes);
}

/* Quick-add buttons fill in the title field for common tasks */
function quickAddTask(title) {
  document.getElementById('task-title').value = title;
}

/*
 * ─── loadTasks ──────────────────────────────────────────────
 *  Fetches all tasks and groups them by booking.
 *  Each booking gets its own section with the booking title
 *  and all related tasks listed underneath.
 * ────────────────────────────────────────────────────────────
 */
async function loadTasks(bookingsRes) {
  const res = await api('/tasks');
  const container = document.getElementById('tasks-list');

  /* If no bookings at all, show a helpful empty state */
  if (!bookingsRes?.success || !bookingsRes.data.bookings.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No bookings yet</h3>
        <p>Book a flight or hotel first, then you can add preparation tasks here.</p>
        <button class="btn btn-primary" style="margin-top:1rem" onclick="navigate('search')">Browse Flights & Hotels</button>
      </div>`;
    return;
  }

  if (!res.success || !res.data.tasks.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No tasks yet</h3>
        <p>Use the form above to add preparation tasks for your upcoming trips.</p>
      </div>`;
    return;
  }

  /*
   * Group tasks by bookingId so they appear under their
   * parent booking as a checklist.
   */
  const tasksByBooking = {};
  res.data.tasks.forEach(t => {
    const bId = t.bookingId?._id || t.bookingId || 'unknown';
    if (!tasksByBooking[bId]) tasksByBooking[bId] = [];
    tasksByBooking[bId].push(t);
  });

  /* Build a lookup of booking details from the bookings API */
  const bookingMap = {};
  if (bookingsRes?.success) {
    bookingsRes.data.bookings.forEach(b => {
      bookingMap[b._id] = b;
    });
  }

  /* Render each booking group */
  let html = '';
  for (const [bookingId, tasks] of Object.entries(tasksByBooking)) {
    const booking = bookingMap[bookingId];
    const inv = booking?.inventoryId || {};
    const bookingTitle = inv.title || 'Unknown Booking';
    const bookingRoute = inv.type === 'flight'
      ? `${inv.origin} → ${inv.destination}`
      : inv.location || '';
    const doneCount = tasks.filter(t => t.status === 'done').length;

    html += `
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header">
          <div>
            <div class="card-title">${bookingTitle}</div>
            <div class="card-subtitle">${bookingRoute} · ${booking?.status || ''}</div>
          </div>
          <span style="font-size:0.8rem;color:var(--text-muted)">${doneCount}/${tasks.length} done</span>
        </div>
        ${tasks.map(t => `
          <div class="task-item">
            <input type="checkbox" class="task-checkbox"
              ${t.status === 'done' ? 'checked' : ''}
              onchange="toggleTask('${t._id}', this.checked)" />
            <div style="flex:1">
              <div class="task-title ${t.status === 'done' ? 'done' : ''}">${t.title}</div>
              <div class="task-meta">
                <span class="badge badge-${t.priority === 'high' ? 'cancelled' : t.priority === 'medium' ? 'pending' : 'confirmed'}">${t.priority}</span>
                ${t.dueDate ? ` · Due: ${formatDate(t.dueDate)}` : ''}
              </div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="deleteTask('${t._id}')">Delete</button>
          </div>
        `).join('')}
      </div>`;
  }

  container.innerHTML = html;
}

async function createTask() {
  const bookingId = document.getElementById('task-booking').value;
  const title = document.getElementById('task-title').value;
  const priority = document.getElementById('task-priority').value;
  const dueDate = document.getElementById('task-due').value || undefined;

  if (!bookingId) {
    showToast('Please select a booking first.', 'error');
    return;
  }
  if (!title) {
    showToast('Please enter a task title or use a quick-add button.', 'error');
    return;
  }

  const res = await api('/tasks', {
    method: 'POST',
    body: JSON.stringify({ bookingId, title, priority, dueDate }),
  });

  if (res.success) {
    showToast('Task added!', 'success');
    document.getElementById('task-title').value = '';
    renderTasksPage(); // full re-render to update grouping
  } else {
    showToast(res.message, 'error');
  }
}

async function toggleTask(id, done) {
  await api(`/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: done ? 'done' : 'pending' }),
  });
  renderTasksPage(); // re-render to update the done count
}

async function deleteTask(id) {
  const res = await api(`/tasks/${id}`, { method: 'DELETE' });
  if (res.success) {
    showToast('Task deleted.', 'info');
    renderTasksPage();
  }
}

/* ═══════════════════════════════════════════════════════════
   ADMIN PAGE
   Inventory management – only visible to admin role.
   ═══════════════════════════════════════════════════════════ */
async function renderAdminPage() {
  if (!isLoggedIn() || !isAdmin()) {
    showToast('Admin access required.', 'error');
    navigate('search');
    return;
  }

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="page-header">
      <h1>Admin – Inventory Management</h1>
      <p>Add, activate, deactivate, and delete flights & hotels. To book, use the <a href="#search" style="color:var(--primary)">Search</a> page.</p>
    </div>

    <div class="card" style="margin-bottom:2rem">
      <h3 style="margin-bottom:1rem">Add New Inventory</h3>
      <div class="form-row">
        <div class="form-group">
          <label>Type</label>
          <select class="form-control" id="inv-type" onchange="toggleAdminFields()">
            <option value="flight">Flight</option>
            <option value="hotel">Hotel</option>
          </select>
        </div>
        <div class="form-group">
          <label>Category</label>
          <select class="form-control" id="inv-category">
            <option value="economy">Economy</option>
            <option value="business">Business</option>
            <option value="first">First Class</option>
            <option value="budget">Budget</option>
            <option value="standard">Standard</option>
            <option value="luxury">Luxury</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Title</label>
        <input type="text" class="form-control" id="inv-title" placeholder="e.g. NYC → London Business Class" />
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" class="form-control" id="inv-desc" placeholder="Brief description" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Price (USD)</label>
          <input type="number" class="form-control" id="inv-price" placeholder="e.g. 250.00" step="0.01" />
        </div>
        <div class="form-group">
          <label>Total Units</label>
          <input type="number" class="form-control" id="inv-units" placeholder="e.g. 50" />
        </div>
      </div>

      <div id="flight-fields">
        <div class="form-row">
          <div class="form-group">
            <label>Origin (IATA)</label>
            <input type="text" class="form-control" id="inv-origin" placeholder="JFK" maxlength="3" />
          </div>
          <div class="form-group">
            <label>Destination (IATA)</label>
            <input type="text" class="form-control" id="inv-dest" placeholder="LHR" maxlength="3" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Airline</label>
            <input type="text" class="form-control" id="inv-airline" placeholder="Atlantic Airways" />
          </div>
          <div class="form-group">
            <label>Flight Number</label>
            <input type="text" class="form-control" id="inv-flightno" placeholder="AA2451" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Departure</label>
            <input type="datetime-local" class="form-control" id="inv-depart" />
          </div>
          <div class="form-group">
            <label>Arrival</label>
            <input type="datetime-local" class="form-control" id="inv-arrive" />
          </div>
        </div>
      </div>

      <div id="hotel-fields" style="display:none">
        <div class="form-group">
          <label>Location</label>
          <input type="text" class="form-control" id="inv-location" placeholder="Paris, France" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Check-in Available From</label>
            <input type="date" class="form-control" id="inv-checkin" />
          </div>
          <div class="form-group">
            <label>Check-out Available Until</label>
            <input type="date" class="form-control" id="inv-checkout" />
          </div>
        </div>
        <div class="form-group">
          <label>Amenities (comma-separated)</label>
          <input type="text" class="form-control" id="inv-amenities" placeholder="wifi, pool, spa, gym" />
        </div>
      </div>

      <button class="btn btn-primary" style="margin-top:1rem" onclick="createInventory()">Add Inventory</button>
    </div>

    <h3 style="margin-bottom:1rem">Current Inventory</h3>
    <div class="tabs" id="admin-tabs" style="margin-bottom:1rem">
      <button class="tab active" onclick="filterAdminInventory('', this)">All</button>
      <button class="tab" onclick="filterAdminInventory('flight', this)">Flights</button>
      <button class="tab" onclick="filterAdminInventory('hotel', this)">Hotels</button>
    </div>
    <div id="admin-inventory" class="card-grid">
      <div class="loading-center"><div class="spinner"></div></div>
    </div>
  `;

  loadAdminInventory();
}

function toggleAdminFields() {
  const type = document.getElementById('inv-type').value;
  document.getElementById('flight-fields').style.display = type === 'flight' ? 'block' : 'none';
  document.getElementById('hotel-fields').style.display = type === 'hotel' ? 'block' : 'none';
}

async function createInventory() {
  const type = document.getElementById('inv-type').value;
  const data = {
    type,
    title: document.getElementById('inv-title').value,
    description: document.getElementById('inv-desc').value,
    category: document.getElementById('inv-category').value,
    price: Math.round(parseFloat(document.getElementById('inv-price').value) * 100),
    totalUnits: parseInt(document.getElementById('inv-units').value),
  };

  if (type === 'flight') {
    data.origin = document.getElementById('inv-origin').value.toUpperCase();
    data.destination = document.getElementById('inv-dest').value.toUpperCase();
    data.airline = document.getElementById('inv-airline').value;
    data.flightNumber = document.getElementById('inv-flightno').value;
    data.departureDate = document.getElementById('inv-depart').value;
    data.arrivalDate = document.getElementById('inv-arrive').value;
  } else {
    data.location = document.getElementById('inv-location').value;
    data.checkInDate = document.getElementById('inv-checkin').value;
    data.checkOutDate = document.getElementById('inv-checkout').value;
    const amenities = document.getElementById('inv-amenities').value;
    data.amenities = amenities ? amenities.split(',').map(a => a.trim()) : [];
  }

  const res = await api('/inventory', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (res.success) {
    showToast('Inventory item created!', 'success');
    loadAdminInventory();
  } else {
    showToast(res.message, 'error');
  }
}

/* Track admin inventory filter and pagination state */
let adminTypeFilter = '';
let adminInvPage = 1;

function filterAdminInventory(type, btn) {
  adminTypeFilter = type;
  adminInvPage = 1;
  document.querySelectorAll('#admin-tabs .tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadAdminInventory();
}

function goToAdminPage(page) {
  adminInvPage = page;
  loadAdminInventory();
  document.getElementById('admin-inventory').scrollIntoView({ behavior: 'smooth' });
}

async function loadAdminInventory() {
  const typeParam = adminTypeFilter ? `&type=${adminTypeFilter}` : '';
  const res = await api(`/inventory?limit=20&page=${adminInvPage}${typeParam}`);
  const container = document.getElementById('admin-inventory');

  /* Remove old pagination */
  const oldBar = document.getElementById('admin-pagination');
  if (oldBar) oldBar.remove();

  if (!res.success || !res.data.items.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No inventory items</h3>
        <p>Add your first flight or hotel above.</p>
      </div>`;
    return;
  }

  container.innerHTML = res.data.items.map(item => `
    <div class="card" style="opacity: ${item.isActive ? 1 : 0.5}">
      <div class="card-header">
        <div>
          <div class="card-title">${item.title}</div>
          <div class="card-subtitle">${item.type} · ${item.category}</div>
        </div>
        <span class="badge badge-${item.isActive ? item.type : 'cancelled'}">${item.isActive ? 'Active' : 'Inactive'}</span>
      </div>
      <div class="card-body">
        <p>Price: ${formatPrice(item.price)} · Units: ${item.availableUnits}/${item.totalUnits}</p>
      </div>
      <div class="card-footer">
        <span class="price">${formatPrice(item.price)}</span>
        <div style="display:flex;gap:0.5rem">
          ${item.isActive
            ? `<button class="btn btn-danger btn-sm" onclick="deactivateItem('${item._id}')">Deactivate</button>`
            : `<button class="btn btn-success btn-sm" onclick="activateItem('${item._id}')">Activate</button>`}
          <button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger)" onclick="deleteItem('${item._id}', '${escapeAttr(item.title)}')">Delete</button>
        </div>
      </div>
    </div>
  `).join('');

  /* Render admin inventory pagination */
  const { page, pages, total } = res.data;
  if (pages > 1) {
    container.insertAdjacentHTML('afterend', `
      <div class="pagination" id="admin-pagination">
        <button class="btn btn-outline btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="goToAdminPage(${page - 1})">← Prev</button>
        <span class="pagination-info">Page ${page} of ${pages} (${total} items)</span>
        <button class="btn btn-outline btn-sm" ${page >= pages ? 'disabled' : ''} onclick="goToAdminPage(${page + 1})">Next →</button>
      </div>
    `);
  }
}

/* Deactivate = soft-delete (hide from users, keep in DB) */
async function deactivateItem(id) {
  const res = await api(`/inventory/${id}`, { method: 'DELETE' });
  if (res.success) {
    showToast('Item deactivated. Users can no longer see it.', 'info');
    loadAdminInventory();
  }
}

/* Activate = re-enable a deactivated item (users can see it again) */
async function activateItem(id) {
  const res = await api(`/inventory/${id}/activate`, { method: 'PATCH' });
  if (res.success) {
    showToast('Item activated! Now visible to users.', 'success');
    loadAdminInventory();
  }
}

/* Delete = permanently remove from database (cannot undo!) */
async function deleteItem(id, title) {
  if (!confirm(`Permanently delete "${title}"?\n\nThis cannot be undone.`)) return;
  const res = await api(`/inventory/${id}/permanent`, { method: 'DELETE' });
  if (res.success) {
    showToast('Item permanently deleted.', 'info');
    loadAdminInventory();
  } else {
    showToast(res.message || 'Delete failed', 'error');
  }
}

/* ═══════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════ */
handleRoute();
