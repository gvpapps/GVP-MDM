/**
 * EzySchool - Universal Dynamic View-Only Mode Enforcer (केवळ वाचन मोड संरक्षक)
 * ॲडमिन पॅनेलद्वारे शाळेचा किंवा विशिष्ट ॲपचा ॲक्सेस बंद केला असल्यास सर्व एन्ट्री, बदल व डिलीट १००% लॉक करते.
 * डेटा पाहणे, शोधणे, फिल्टर करणे, विद्यार्थी बदलणे व प्रिंट/रिपोर्ट काढणे पूर्णपणे चालू ठेवते.
 */
(function() {
  'use strict';

  // 1. Detect current App ID
  function detectAppId() {
    if (window.EZYSCHOOL_APP_ID) return String(window.EZYSCHOOL_APP_ID).trim();
    const path = (window.location.pathname || '').toLowerCase();
    if (path.includes('pm-poshan') || path.includes('pm poshan') || path.includes('poshan') || path.includes('mdm')) return 'pm-poshan';
    if (path.includes('cashbook') || path.includes('cash-book') || path.includes('cash')) return 'cashbook';
    if (path.includes('hpc')) return 'hpc-card';
    if (path.includes('result') || path.includes('nikal')) return 'result';
    if (path.includes('gav-sarve') || path.includes('gav sarve') || path.includes('sarve')) return 'gav-sarve';
    return '';
  }

  // 2. Resolve active UDISE
  function resolveUdise() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const paramUdise = urlParams.get('udise');
      if (paramUdise && paramUdise.trim()) return paramUdise.trim();
    } catch(e) {}

    const directKeys = [
      'ezyschool_active_udise',
      'CASHBOOK_ACTIVE_UDISE',
      'MDM_CURRENT_UDISE',
      'MDM_ACTIVE_SCHOOL_KEY',
      'result_current_udise',
      'pm_poshan_udise'
    ];
    for (const k of directKeys) {
      try {
        const v = localStorage.getItem(k);
        if (v && typeof v === 'string' && v.trim().length >= 10) return v.trim();
      } catch(e) {}
    }

    const jsonProfileKeys = ['ezyschool_school_profile', 'CASHBOOK_AUTH_SESSION_V1', 'gav_sarve_config_v1'];
    for (const k of jsonProfileKeys) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const obj = JSON.parse(raw);
          if (obj && obj.udise && String(obj.udise).trim().length >= 10) return String(obj.udise).trim();
        }
      } catch(e) {}
    }

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const m = key.match(/(?:HPC_STUDENTS_DATA_|MDM_SCHOOL_DATA_|RESULT_APP_DATA_|CASHBOOK_LOCAL_REGISTERED_SCHOOLS_AUTH_)(\d{11})/);
          if (m && m[1]) return m[1];
        }
      }
    } catch(e) {}

    return '';
  }

  // 3. Dynamic View-Only Evaluation (Evaluated on every interaction & interval)
  function isViewOnlyActive() {
    // 1. URL parameter from Portal has supreme authority
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const vo = urlParams.get('viewOnly');
      if (vo === '0') return false; // Explicitly granted by Admin Portal!
      if (vo === '1') return true;  // Explicitly blocked by Admin Portal!
    } catch(e) {}

    const currentUdise = resolveUdise();
    const currentAppId = detectAppId();

    // 2. Master App Access Map (Explicit Admin App Setting)
    if (currentUdise && currentAppId) {
      try {
        const rawMaster = localStorage.getItem('ezyschool_app_access_master');
        if (rawMaster) {
          const master = JSON.parse(rawMaster);
          if (master && master[currentUdise] && master[currentUdise][currentAppId] !== undefined) {
            const val = parseInt(master[currentUdise][currentAppId], 10);
            if (val === 1) return false; // Explicitly enabled by Admin!
            if (val === 0) return true;  // Explicitly disabled by Admin!
          }
        }
      } catch(e) {}

      // 3. App-Specific Locks
      if (localStorage.getItem('EZYSCHOOL_VIEW_ONLY_' + currentUdise + '_' + currentAppId) === '1' ||
          localStorage.getItem('EZYSCHOOL_APP_DISABLED_' + currentUdise + '_' + currentAppId) === '1') {
        return true;
      }
    }

    // 4. Global School Lock
    if (currentUdise) {
      if (localStorage.getItem('EZYSCHOOL_VIEW_ONLY_' + currentUdise) === '1') return true;
    }

    // 5. MDM Access Mode Fallback
    if (currentUdise && currentAppId === 'pm-poshan') {
      const mode = localStorage.getItem('MDM_SCHOOL_ACCESS_MODE_' + currentUdise);
      if (mode === 'view_only') return true;
      if (mode === 'full') return false;
    }

    if (currentAppId) {
      try {
        const rawSession = localStorage.getItem('ezyschool_app_access');
        if (rawSession) {
          const sa = JSON.parse(rawSession);
          if (sa && sa[currentAppId] !== undefined) {
            const val = parseInt(sa[currentAppId], 10);
            if (val === 1) return false;
            if (val === 0) return true;
          }
        }
      } catch(e) {}
    }

    try {
      if (localStorage.getItem('EZYSCHOOL_VIEW_ONLY_GLOBAL') === '1') return true;
    } catch(e) {}

    return false;
  }

  // Expose check function globally
  window.checkEzySchoolViewOnly = isViewOnlyActive;
  window.isEzySchoolViewOnly = isViewOnlyActive;

  // 4. Inject Dynamic Styles
  function ensureStyles() {
    if (document.getElementById('ezyschool-view-only-styles')) return;
    const style = document.createElement('style');
    style.id = 'ezyschool-view-only-styles';
    style.textContent = `
      @media print {
        #ezyschoolViewOnlyBanner, .ezyschool-view-only-toast {
          display: none !important;
        }
      }
      .ezyschool-view-only-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: #0f172a;
        color: #f8fafc;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        border-left: 4px solid #f59e0b;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 10px;
        opacity: 0;
        transition: opacity 0.25s ease, transform 0.25s ease;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Devanagari", sans-serif;
        max-width: 90vw;
        text-align: center;
      }
      .ezyschool-view-only-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      .ezyschool-vo-locked {
        pointer-events: none !important;
        opacity: 0.45 !important;
        cursor: not-allowed !important;
        filter: grayscale(40%) !important;
      }
      .ezyschool-vo-locked-input {
        background-color: #f1f5f9 !important;
        cursor: not-allowed !important;
        color: #475569 !important;
      }
    `;
    if (document.head) document.head.appendChild(style);
  }

  // 5. Toast Function
  let toastTimeout = null;
  function showViewOnlyToast(customMsg) {
    let toast = document.getElementById('ezyschoolViewOnlyToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ezyschoolViewOnlyToast';
      toast.className = 'ezyschool-view-only-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = customMsg || '🔒 <strong>केवळ वाचन मोड (View-Only Mode):</strong> ॲडमिनने या ॲपचा ॲक्सेस बंद केला आहे. नवीन एन्ट्री व बदल करता येणार नाहीत.';
    toast.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }
  window.showViewOnlyToast = showViewOnlyToast;

  // 6. Whitelist Check: Safe Read/View/Print/Filter Actions
  function isAllowedElement(el) {
    if (!el) return true;
    
    const tag = (el.tagName || '').toUpperCase();
    const id = (el.id || '').toLowerCase();
    const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
    const text = (el.textContent || el.value || el.title || '').toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();

    // Modal dismiss / close buttons
    if (el.getAttribute('data-bs-dismiss') || el.getAttribute('data-dismiss') || cls.includes('btn-close') || text.includes('बंद करा') || text.includes('close')) {
      return true;
    }

    // Search and filter inputs
    if (type === 'search' || cls.includes('search') || id.includes('search') || id.includes('filter')) {
      return true;
    }

    // Print & Export & Download & View actions are strictly allowed
    const allowExactKeywords = [
      'print', 'प्रिंट', 'प्रिन्ट', 'pdf', 'excel', 'डाउनलोड', 'download',
      'अहवाल', 'report', 'दाखवा', 'पहा', 'view', 'बॅकअप', 'backup', 'पत्रक',
      'तपासा', 'ping'
    ];
    for (const kw of allowExactKeywords) {
      if (text.includes(kw) || id.includes(kw)) {
        return true;
      }
    }

    // Pure tab switchers (elements whose sole function is switching viewing tabs)
    if (el.getAttribute('data-bs-toggle') === 'tab' || el.getAttribute('data-tab') || cls.includes('tab-btn') || cls.includes('nav-link')) {
      // Must NOT contain submit or save words
      if (!text.includes('save') && !text.includes('सेव्ह') && !text.includes('जतन') && !text.includes('add') && !text.includes('जोडा')) {
        return true;
      }
    }

    // Dropdowns (students, classes, months) are allowed to view data unless inside an edit form
    if (tag === 'SELECT' || tag === 'OPTION') {
      if (!id.includes('entry') && !id.includes('add') && !cls.includes('mutating')) {
        return true;
      }
    }

    return false;
  }

  // 7. Mutating Actions Check (STRICT)
  function isMutatingElement(el) {
    if (!el) return false;

    const tag = (el.tagName || '').toUpperCase();
    const id = (el.id || '').toLowerCase();
    const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
    const text = (el.textContent || el.value || el.title || '').toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();

    // Submit buttons are ALWAYS mutating
    if (type === 'submit') return true;

    // Direct mutating keywords in text, id, or class
    const mutateKeywords = [
      'जतन', 'सेव्ह', 'save', 'जोडा', 'add', 'नवीन', 'new', 'तयार करा', 'create',
      'काढून टाका', 'हटवा', 'delete', 'remove', 'बदल', 'edit', 'update', 'अपडेट',
      'आयात', 'import', 'अपलोड', 'upload', 'clear', 'साफ करा', 'रीसेट', 'reset',
      'नोंद करा', 'नोंदवा', 'खर्च', 'जमा', 'पावती', 'voucher', 'नोंदणी', 'auth',
      'btn-hero-save', 'btnsavedaily', 'btnsave'
    ];

    for (const kw of mutateKeywords) {
      if (text.includes(kw) || id.includes(kw) || cls.includes(kw)) {
        // If it also contains print/export/report, keep it allowed
        if (text.includes('print') || text.includes('प्रिंट') || text.includes('pdf') || text.includes('excel') || text.includes('अहवाल')) {
          return false;
        }
        return true;
      }
    }

    // Form inputs and textareas that modify data
    if ((tag === 'INPUT' && type !== 'search' && type !== 'button') || tag === 'TEXTAREA') {
      if (!id.includes('search') && !cls.includes('search') && !id.includes('filter')) {
        return true;
      }
    }

    return false;
  }

  // 8. Refresh UI State (Lock / Unlock based on dynamic check)
  function refreshViewOnlyState() {
    const isVO = isViewOnlyActive();
    window.EZYSCHOOL_IS_VIEW_ONLY = isVO;

    if (!document.body) return;
    ensureStyles();

    let banner = document.getElementById('ezyschoolViewOnlyBanner');
    if (banner) banner.remove(); // Never block or push down the mobile app screen

    if (isVO) {
      // B. Mark mutating buttons with locked styling and tooltip
      const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn, [onclick], .btn');
      buttons.forEach(btn => {
        if (isMutatingElement(btn)) {
          btn.classList.add('ezyschool-vo-locked');
          btn.setAttribute('data-vo-locked', '1');
          btn.setAttribute('title', '🔒 केवळ वाचन मोड: ॲडमिनने या ॲपचा ॲक्सेस बंद केला आहे.');
        }
      });

      // C. Make edit form inputs read-only (skip search & selectors)
      const inputs = document.querySelectorAll('input:not([type="button"]):not([type="submit"]):not([type="search"]):not([type="hidden"]), textarea');
      inputs.forEach(inp => {
        const id = (inp.id || '').toLowerCase();
        const cls = (inp.className || '').toLowerCase();
        if (!id.includes('search') && !cls.includes('search') && !id.includes('filter')) {
          inp.readOnly = true;
          inp.classList.add('ezyschool-vo-locked-input');
          inp.setAttribute('data-vo-locked', '1');
        }
      });

      // D. Checkboxes & radio buttons that modify data
      const checks = document.querySelectorAll('input[type="checkbox"]:not([data-vo-allow]), input[type="radio"]:not([data-vo-allow])');
      checks.forEach(chk => {
        const id = (chk.id || '').toLowerCase();
        const cls = (chk.className || '').toLowerCase();
        if (!id.includes('filter') && !cls.includes('filter')) {
          chk.disabled = true;
          chk.setAttribute('data-vo-locked', '1');
        }
      });

    } else {
      // Remove locked styling if view-only was turned OFF
      document.querySelectorAll('[data-vo-locked="1"]').forEach(el => {
        el.classList.remove('ezyschool-vo-locked', 'ezyschool-vo-locked-input');
        el.removeAttribute('data-vo-locked');
        el.removeAttribute('title');
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.readOnly = false;
          el.disabled = false;
        }
      });
    }
  }

  // 9. Intercept Click Events (Capturing Phase - Highest Priority)
  document.addEventListener('click', function(e) {
    if (!isViewOnlyActive()) return;

    const target = e.target;
    // Check if target or any parent is a locked mutating element
    const clickable = target.closest('button, input[type="button"], input[type="submit"], a.btn, [onclick], .btn, [data-vo-locked="1"]');
    
    if (clickable && isMutatingElement(clickable)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showViewOnlyToast();
      return false;
    }

    // Check if click occurred inside a mutating form submit area
    const form = target.closest('form');
    if (form && (target.type === 'submit' || target.classList.contains('btn-hero-save') || isMutatingElement(target))) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showViewOnlyToast();
      return false;
    }
  }, true);

  // 10. Intercept Form Submissions (Capturing Phase)
  document.addEventListener('submit', function(e) {
    if (!isViewOnlyActive()) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    showViewOnlyToast();
    return false;
  }, true);

  // 11. Intercept Typing on Inputs (Capturing Phase)
  document.addEventListener('keydown', function(e) {
    if (!isViewOnlyActive()) return;

    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      const type = (target.getAttribute('type') || '').toLowerCase();
      const id = (target.id || '').toLowerCase();
      const cls = (target.className || '').toLowerCase();
      if (type === 'search' || id.includes('search') || cls.includes('search') || id.includes('filter')) {
        return; // Allow searching
      }
      if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        showViewOnlyToast();
      }
    }
  }, true);

  // 11b. Intercept Paste
  document.addEventListener('paste', function(e) {
    if (!isViewOnlyActive()) return;
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      const type = (target.getAttribute('type') || '').toLowerCase();
      const id = (target.id || '').toLowerCase();
      const cls = (target.className || '').toLowerCase();
      if (type === 'search' || id.includes('search') || cls.includes('search') || id.includes('filter')) {
        return;
      }
      e.preventDefault();
      showViewOnlyToast();
    }
  }, true);

  // 12. MutationObserver: Automatically lock dynamically injected forms and buttons
  let observer = null;
  function setupObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(() => {
      if (isViewOnlyActive()) {
        refreshViewOnlyState();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // 13. Cross-tab & Portal Communication Listeners
  window.addEventListener('storage', function(e) {
    if (e.key && (e.key.includes('EZYSCHOOL_') || e.key.includes('ezyschool_') || e.key.includes('app_access'))) {
      refreshViewOnlyState();
    }
  });

  window.addEventListener('message', function(e) {
    if (e.data && (e.data.type === 'EZYSCHOOL_APP_ACCESS_CHANGED' || e.data.type === 'EZYSCHOOL_VIEW_ONLY_REFRESH')) {
      refreshViewOnlyState();
    }
  });

  // 14. Auto Initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      refreshViewOnlyState();
      setupObserver();
    });
  } else {
    refreshViewOnlyState();
    setupObserver();
  }

  // Periodic safety check
  setInterval(refreshViewOnlyState, 1500);

})();
