import CONFIG from "./config.js";
const STUDENTS_URL = CONFIG.API.STUDENTS_URL;
const AUTH_URL = CONFIG.API.AUTH_URL;

// ── Auth Token (set on login, used for all API requests) ──────────────────
let authToken = localStorage.getItem('authToken') || '';

/**
 * Fetch wrapper that automatically injects the Bearer token.
 * @param {string} url
 * @param {RequestInit} [options]
 */
async function authFetch(url, options = {}) {
    options.headers = options.headers || {};
    if (authToken) options.headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(url, options);
    if (res.status === 401) {
        // Token expired / invalid — force re-login
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        window.location.replace('auth.html');
    }
    return res;
}

/** Signs the user out and redirects to the login page. */
window.handleLogout = function() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    window.location.replace('auth.html');
};

// Visa Type selection helper for Segmented Selector buttons
function setVisaType(value) {
    const visaTypeInput = document.getElementById('visaType');
    if (!visaTypeInput) return;
    visaTypeInput.value = value;
    
    const btnEmbassy = document.getElementById('btnVisaTypeEmbassy');
    const btnEVisa = document.getElementById('btnVisaTypeEVisa');
    const appNoWrapper = document.getElementById('applicationNoWrapper');
    const appNoInput = document.getElementById('applicationNo');
    
    if (value === 'E-Visa') {
        if (btnEmbassy) btnEmbassy.classList.remove('active');
        if (btnEVisa) btnEVisa.classList.add('active');
        if (appNoWrapper) appNoWrapper.classList.remove('d-none');
    } else {
        if (btnEmbassy) btnEmbassy.classList.add('active');
        if (btnEVisa) btnEVisa.classList.remove('active');
        if (appNoWrapper) appNoWrapper.classList.add('d-none');
        if (appNoInput) appNoInput.value = ''; // Clear value when hidden
    }
}

// State
let studentsData = [];
// Default filter is now 'pending' (students without visa application yet)
let currentFilter = 'pending';
let searchQuery = '';
let tooltips = [];
let searchDebounceTimer = null;
let bulkDeleteMode = false;

// Cached DOM Elements (for performance)
let cachedDOM = {
    tableBody: null,
    emptyState: null,
    loadingState: null,
    filterLabel: null,
    form: null,
    modalElement: null,
    searchInput: null,
    darkModeToggle: null,
    checkSelectedBtn: null,
    deleteSelectedBtn: null,
};


let bootstrapModal = null; // Will be initialized on load

// Initialization
document.addEventListener('DOMContentLoaded', () => {

    // ── JWT Authentication ────────────────────────────────────────────────
    if (!authToken) {
        // No token — redirect to login page immediately
        window.location.replace('auth.html');
        return;
    }

    // Show user badge
    try {
        const userRaw = localStorage.getItem('authUser');
        const user = userRaw ? JSON.parse(userRaw) : null;
        if (user) {
            const avatar = document.getElementById('userAvatar');
            const nameEl = document.getElementById('userName');
            if (avatar) avatar.textContent = (user.username || user.email || 'U').charAt(0).toUpperCase();
            if (nameEl) nameEl.textContent = user.username || user.email || 'Account';
        }
    } catch (_) {}
    // ── End Auth ──────────────────────────────────────────────────────────

    // Cache DOM elements
    cachedDOM.tableBody = document.getElementById('studentsTableBody');
    cachedDOM.emptyState = document.getElementById('emptyState');
    cachedDOM.loadingState = document.getElementById('loadingState');
    cachedDOM.form = document.getElementById('studentForm');
    cachedDOM.modalElement = document.getElementById('addStudentModal');
    cachedDOM.searchInput = document.getElementById('searchInput');
    cachedDOM.darkModeToggle = document.getElementById('darkModeToggle');
    cachedDOM.checkSelectedBtn = document.getElementById('checkSelectedBtn');
    cachedDOM.deleteSelectedBtn = document.getElementById('deleteSelectedBtn');

    // Init Bootstrap Modal
    bootstrapModal = new bootstrap.Modal(cachedDOM.modalElement);

    // Setup Listeners
    setupEventListeners();

    // Setup Data Load
    loadStudents();

    // Init Dark Mode
    initDarkMode();

    // Start Server Load Notice Countdown
    startNoticeCountdown();
});

function setupEventListeners() {
    // Form Submit (Add/Edit)
    cachedDOM.form.addEventListener('submit', handleFormSubmit);

    // Visa Type Toggle Buttons Setup
    const btnEmbassy = document.getElementById('btnVisaTypeEmbassy');
    const btnEVisa = document.getElementById('btnVisaTypeEVisa');
    if (btnEmbassy && btnEVisa) {
        btnEmbassy.addEventListener('click', () => setVisaType('Embassy'));
        btnEVisa.addEventListener('click', () => setVisaType('E-Visa'));
    }

    // Select-column checkboxes: tie Check button visibility directly to the
    // live DOM checkbox state via native 'change' (delegated, since rows are
    // rebuilt on every render). This is independent of the toggle-batch
    // click handler / its network save, so the button reacts instantly and
    // correctly even if that save is slow, fails, or the click handler
    // doesn't fire for some reason (keyboard toggles, etc.).
    cachedDOM.tableBody.addEventListener('change', (e) => {
        if (e.target.classList && e.target.classList.contains('batch-select-toggle')) {
            updateCheckSelectedButton();
            updateDeleteSelectedButton();
        }
    });

    // Toggle checkboxes on row clicks during bulk delete operations
    cachedDOM.tableBody.addEventListener('click', (e) => {
        if (!bulkDeleteMode || (currentFilter !== 'cancelled' && currentFilter !== 'approved')) return;

        const isInteractive = e.target.closest('button, input, select, a, .btn-copy-inline, .action-btn');
        if (isInteractive) return;

        const row = e.target.closest('tr');
        if (!row) return;

        const actionBtn = row.querySelector('.action-btn[data-id]');
        if (!actionBtn) return;
        const passport = actionBtn.getAttribute('data-id');

        const checkbox = row.querySelector('.batch-select-toggle');
        if (checkbox && !checkbox.disabled) {
            checkbox.checked = !checkbox.checked;
            const enabled = checkbox.checked;
            const index = studentsData.findIndex(s => s.passport === passport);
            if (index !== -1) {
                studentsData[index].batchSelected = enabled;
            }
            updateCheckSelectedButton();
            updateDeleteSelectedButton();
        }
    });

    // Search Input with Debouncing
    cachedDOM.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            searchQuery = e.target.value.toLowerCase();
            renderTable();
        }, CONFIG.UI.SEARCH_DEBOUNCE_MS);
    });

    // Tab Filtering - using event delegation for better mobile compatibility
    const tabContainer = document.getElementById('statusTabs');
    if (tabContainer) {
        const handleTabChange = (e) => {
            // Find the clicked tab button
            const clickedTab = e.target.closest('[data-tab]');
            if (!clickedTab) return;

            e.preventDefault();
            e.stopPropagation();

            // Activate Tab UI
            tabContainer.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
            clickedTab.classList.add('active');

            // Apply Filter
            currentFilter = clickedTab.getAttribute('data-tab');
            bulkDeleteMode = false;
            studentsData.forEach(s => s.batchSelected = false);
            updateCheckSelectedButton();
            updateDeleteSelectedButton();
            renderTable();
        };

        // Use both click and touchend for maximum compatibility
        tabContainer.addEventListener('click', handleTabChange);
        tabContainer.addEventListener('touchend', (e) => {
            // Prevent double-firing with click
            const clickedTab = e.target.closest('[data-tab]');
            if (clickedTab) {
                e.preventDefault();
                handleTabChange(e);
            }
        }, {
            passive: false
        });
    }

    // Dark Mode Toggle
    if (cachedDOM.darkModeToggle) {
        cachedDOM.darkModeToggle.addEventListener('click', toggleDarkMode);
    }

    if (cachedDOM.checkSelectedBtn) {
        cachedDOM.checkSelectedBtn.addEventListener('click', handleBatchCheck);
    }

    if (cachedDOM.deleteSelectedBtn) {
        cachedDOM.deleteSelectedBtn.addEventListener('click', handleBatchDelete);
    }

    // Modal Events to reset form
    cachedDOM.modalElement.addEventListener('hidden.bs.modal', () => {
        cachedDOM.form.reset();
        document.getElementById('editMode').value = "false";
        document.getElementById('originalPassport').value = "";
        document.getElementById('modalTitle').textContent = "Add New Student";
        document.getElementById('submitBtnText').textContent = "Save Student";
        setVisaType('Embassy');
        clearTimeout(_addModalLookupTimer);
        _addModalLookupPassport = '';
        setPassportLookupStatus(null);
    });

    // Force uppercase as-you-type for Student ID and Full Name
    const uppercaseWhileTyping = (input) => {
        input.addEventListener('input', (e) => {
            const { selectionStart, selectionEnd } = e.target;
            e.target.value = e.target.value.toUpperCase();
            e.target.setSelectionRange(selectionStart, selectionEnd);
        });
    };
    const studentIdInputEl = document.getElementById('studentId');
    if (studentIdInputEl) uppercaseWhileTyping(studentIdInputEl);
    const fullNameInputEl = document.getElementById('fullName');
    if (fullNameInputEl) uppercaseWhileTyping(fullNameInputEl);
    const appNoInputEl = document.getElementById('applicationNo');
    if (appNoInputEl) uppercaseWhileTyping(appNoInputEl);

    // Auto-format Passport Number (SSDDDDDDD — 2 letters + 7 digits, matches
    // CONFIG.VALIDATION.PASSPORT_REGEX)
    const passportInputEl = document.getElementById('passport');
    if (passportInputEl) {
        passportInputEl.addEventListener('input', (e) => {
            const value = e.target.value.toUpperCase();
            const letters = value.slice(0, 2).replace(/[^A-Z]/g, '');
            const digits = value.slice(2).replace(/\D/g, '').slice(0, 7);
            e.target.value = letters + digits;
        });
        passportInputEl.addEventListener('input', handlePassportLookup);
    }

    // Auto-format Birthday Input (YYYY-MM-DD)
    const birthdayInput = document.getElementById('birthday');
    if (birthdayInput) {
        birthdayInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, ''); // Remove non-digits
            if (value.length > 8) value = value.slice(0, 8); // Max 8 digits

            if (value.length > 4) {
                value = value.slice(0, 4) + '-' + value.slice(4);
            }
            if (value.length > 7) {
                value = value.slice(0, 7) + '-' + value.slice(7);
            }
            e.target.value = value;
        });
    }

    // Auto-format Application Date Input
    const appDateInput = document.getElementById('applicationDate');
    if (appDateInput) {
        appDateInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 8) value = value.slice(0, 8);

            if (value.length > 4) {
                value = value.slice(0, 4) + '-' + value.slice(4);
            }
            if (value.length > 7) {
                value = value.slice(0, 7) + '-' + value.slice(7);
            }
            e.target.value = value;
        });
    }

    // ── Profile Settings Modal Init & Forms ───────────────────────────────
    const profileModalElement = document.getElementById('profileModal');
    if (profileModalElement) {
        profileModalElement.addEventListener('show.bs.modal', () => {
            // Fill current username
            try {
                const user = JSON.parse(localStorage.getItem('authUser') || '{}');
                const usernameInput = document.getElementById('profileUsername');
                if (usernameInput && user.username) {
                    usernameInput.value = user.username;
                }
            } catch (_) {}
            // Reset fields & alerts
            document.getElementById('profilePasswordForm')?.reset();
            document.getElementById('profileModalError')?.classList.add('d-none');
            document.getElementById('profileModalSuccess')?.classList.add('d-none');
        });
    }

    // General Profile Settings (Consulting Name) Submit
    const generalForm = document.getElementById('profileGeneralForm');
    if (generalForm) {
        generalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById('profileUsername');
            const submitBtn = document.getElementById('saveGeneralBtn');
            if (!usernameInput || !submitBtn) return;

            const username = usernameInput.value.trim();
            if (username.length < 2) {
                showProfileAlert('error', 'Consulting name must be at least 2 characters.');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
            showProfileAlert('error', ''); // Clear previous alerts

            try {
                const response = await authFetch(`${AUTH_URL}?action=update-profile`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username })
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Failed to update consulting name.');
                }

                // Update tokens
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('authUser', JSON.stringify(data.user));

                // Refresh UI badge immediately
                const avatar = document.getElementById('userAvatar');
                const nameEl = document.getElementById('userName');
                if (avatar) avatar.textContent = username.charAt(0).toUpperCase();
                if (nameEl) nameEl.textContent = username;

                showProfileAlert('success', 'Consulting name updated successfully!');
            } catch (err) {
                showProfileAlert('error', err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Changes';
            }
        });
    }

    // Password Settings Form Submit
    const passwordForm = document.getElementById('profilePasswordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPwInput = document.getElementById('profileNewPw');
            const confirmPwInput = document.getElementById('profileConfirmPw');
            const submitBtn = document.getElementById('changePasswordBtn');
            if (!newPwInput || !confirmPwInput || !submitBtn) return;

            const newPassword = newPwInput.value;
            const confirmPassword = confirmPwInput.value;

            if (newPassword.length < 6) {
                showProfileAlert('error', 'New password must be at least 6 characters.');
                return;
            }
            if (newPassword !== confirmPassword) {
                showProfileAlert('error', 'New passwords do not match.');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Changing...';
            showProfileAlert('error', '');

            try {
                const response = await authFetch(`${AUTH_URL}?action=change-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newPassword, confirmPassword })
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Failed to change password.');
                }

                passwordForm.reset();
                showProfileAlert('success', 'Password updated successfully!');
            } catch (err) {
                showProfileAlert('error', err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Change Password';
            }
        });
    }
}

// Helper to render success/error alerts in Profile Modal
function showProfileAlert(type, message) {
    const errorEl = document.getElementById('profileModalError');
    const successEl = document.getElementById('profileModalSuccess');
    if (!errorEl || !successEl) return;

    errorEl.classList.add('d-none');
    successEl.classList.add('d-none');

    if (type === 'error') {
        if (message) {
            errorEl.textContent = message;
            errorEl.classList.remove('d-none');
        }
    } else {
        if (message) {
            successEl.textContent = message;
            successEl.classList.remove('d-none');
        }
    }
}

async function loadStudents() {
    try {
        const response = await authFetch(STUDENTS_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        studentsData = await response.json();
        renderTable();
    } catch (error) {
        debug('Failed to load students:', error);
        showError('Failed to load students. Make sure the proxy server is running.');
    }
}

// Update a single row in the DOM without re-rendering entire table
function setCheckedCellLoading(passport, on) {
    const row = document.querySelector(`tr:has(button[data-id="${passport}"])`);
    const checkedCell = row && row.querySelector('.td-checked');
    if (!checkedCell) return;
    if (on) {
        checkedCell.dataset.prevText = checkedCell.textContent;
        checkedCell.innerHTML = '<span class="checked-skeleton" aria-label="Checking status"></span>';
    } else if (checkedCell.querySelector('.checked-skeleton')) {
        // Fallback in case the row wasn't updated via updateSingleRow (e.g. request failed)
        checkedCell.textContent = checkedCell.dataset.prevText || '';
    }
}

function updateSingleRow(student) {
    // Find the row by data-id attribute on action buttons
    const row = document.querySelector(`tr:has(button[data-id="${student.passport}"])`);
    if (!row) {
        // Row not currently visible (filtered out), ignore update
        return;
    }

    // Update status badge
    const statusCell = row.querySelector('.td-status');
    if (statusCell) {
        statusCell.innerHTML = getCopyFieldHtml(getStatusBadge(student.status), getDisplayStatusText(student.status), 'Copy status');
    }

    // Update PDF cell dynamically if student is approved or visa used
    const pdfCell = row.querySelector('.td-pdf');
    if (pdfCell) {
        const statusLower = (student.status || '').toLowerCase();
        const isApproved = statusLower.includes('approved') || statusLower.includes('visa used');
        if (isApproved) {
            const isEVisa = (student.visaType || '') === 'E-Visa';
            pdfCell.innerHTML = isEVisa
                ? `<button class="btn btn-sm btn-pdf-evisa action-btn" data-action="download-pdf" data-id="${student.passport}" title="E-Visa PDF: request from university" style="color:var(--bs-warning,#f59e0b);">
                    <i class="bi bi-info-circle-fill" style="font-size:1.2rem;"></i>
                   </button>`
                : `<button class="btn btn-sm btn-pdf-download action-btn" data-action="download-pdf" data-id="${student.passport}" title="Download Visa PDF">
                    <i class="bi bi-file-earmark-pdf-fill"></i>
                   </button>`;
            // Attach listener to newly created button
            const pdfBtn = pdfCell.querySelector('.action-btn');
            if (pdfBtn) {
                pdfBtn.addEventListener('click', (e) => {
                    handleAction('download-pdf', student.passport, e.currentTarget);
                });
            }
        } else {
            pdfCell.innerHTML = '';
        }
    }

    // Update student ID (and inline reason)
    const idCell = row.querySelector('.td-name .student-id');
    if (idCell) {
        const cancellationReason = getCancellationReason(student);
        idCell.innerHTML = `
            ${student.visaType === 'E-Visa' ? '<span class="badge bg-info-subtle text-info-emphasis me-1 py-0 px-1" style="font-size: 0.65rem; vertical-align: middle;">E-Visa</span>' : '<span class="badge bg-secondary-subtle text-secondary me-1 py-0 px-1" style="font-size: 0.65rem; vertical-align: middle;">Embassy</span>'}
            ${student.studentId ? getCopyFieldHtml('#' + escapeHtml(student.studentId), student.studentId, 'Copy student ID') : ''}
            ${student.applicationNo ? getCopyFieldHtml(escapeHtml(student.applicationNo), student.applicationNo, 'Copy application number') : ''}
            ${cancellationReason ? getCopyFieldHtml(`Rejected: ${escapeHtml(formatCancellationReason(cancellationReason))}`, cancellationReason, 'Copy cancellation reason', 'copy-field-reason') : ''}
        `;
    }

    // Update last checked timestamp
    const checkedCell = row.querySelector('.td-checked');
    if (checkedCell) {
        checkedCell.textContent = formatTimestampCompact(student.lastChecked);
    }

    // Update application date if it changed
    const appliedCell = row.querySelector('.td-applied .applied-date');
    if (appliedCell && student.applicationDate) {
        appliedCell.innerHTML = getCopyFieldHtml(escapeHtml(student.applicationDate), student.applicationDate, 'Copy applied date');
    }

    const selectInput = row.querySelector('.batch-select-toggle');
    if (selectInput) {
        selectInput.checked = Boolean(student.batchSelected);
    }

    // Update tab counts (status might have changed)
    updateTabCounts();

    // Dynamically toggle PDF column visibility if any PDF button exists
    const table = document.querySelector('.custom-table');
    if (table) {
        const hasPdfButton = document.querySelector('#studentsTableBody .btn-pdf-download') !== null;
        table.classList.toggle('show-pdf-column', currentFilter === 'approved' || hasPdfButton);
    }

    // Add a subtle flash animation to indicate update
    row.style.transition = 'background-color 0.3s ease';
    row.style.backgroundColor = 'var(--primary-light)';
    setTimeout(() => {
        row.style.backgroundColor = '';
    }, 600);
}

// Update tab counts based on current student data
function updateTabCounts() {
    // Calculate specific counts for tabs
    const counts = {
        pending: 0,
        application: 0,
        cancelled: 0,
        approved: 0
    };

    studentsData.forEach(student => {
        let matchesSearch = true;
        if (searchQuery) {
            const matchName = (student.fullName || '').toLowerCase().includes(searchQuery);
            const matchPassport = (student.passport || '').toLowerCase().includes(searchQuery);
            const matchId = (student.studentId || '').toLowerCase().includes(searchQuery);
            if (!matchName && !matchPassport && !matchId) matchesSearch = false;
        }

        if (matchesSearch) {
            const status = (student.status || '').toLowerCase();
            const isApproved = status.includes('approved') || status.includes('visa used');
            const isCancelled = status.includes('cancel') || status.includes('reject');
            // Pending: students with pending/unknown/error status or no application found
            const isPending = status === 'pending' || status === 'unknown' || status === '' || status.includes('error');

            if (isApproved) {
                counts.approved++;
            } else if (isCancelled) {
                counts.cancelled++;
            } else if (isPending) {
                counts.pending++;
            } else {
                // Application (everything else: Received, Under Review, etc.)
                counts.application++;
            }
        }
    });

    // Update Tab UI with Counts
    const updateTabCount = (tabName, count) => {
        const tabLink = document.querySelector(`[data-tab="${tabName}"]`);
        if (tabLink) {
            // Check if badge already exists
            let badge = tabLink.querySelector('.badge-count');
            if (!badge) {
                // Create stacked layout: title on top, count below
                const title = tabName.charAt(0).toUpperCase() + tabName.slice(1);

                // Create title span
                const titleSpan = document.createElement('span');
                titleSpan.className = 'tab-title';
                titleSpan.textContent = title;

                // Create count badge
                badge = document.createElement('span');
                badge.className = 'badge-count';

                // Clear and rebuild content with stacked layout
                tabLink.textContent = '';
                tabLink.appendChild(titleSpan);
                tabLink.appendChild(badge);
            }
            // Update count using textContent (safer than innerHTML)
            badge.textContent = count;
        }
    };


    updateTabCount('pending', counts.pending);
    updateTabCount('application', counts.application);
    updateTabCount('cancelled', counts.cancelled);
    updateTabCount('approved', counts.approved);
}

function renderTable() {

    // Hide loading state when data is ready
    if (cachedDOM.loadingState) {
        cachedDOM.loadingState.classList.add('d-none');
    }

    // Clear existing
    cachedDOM.tableBody.innerHTML = '';

    // Dispose tooltips
    tooltips.forEach(t => t.dispose());
    tooltips = [];

    // Update tab counts
    updateTabCounts();

    // Filter and Search Logic
    let filteredStudents = studentsData.filter(student => {
        // Tab Filter Logic
        let status = (student.status || '').toLowerCase();

        if (currentFilter === 'pending') {
            // Pending: students with pending/unknown/error status or no application found
            const isPending = status === 'pending' || status === 'unknown' || status === '' || status.includes('error');
            if (!isPending) return false;

        } else if (currentFilter === 'application') {
            // Application: students with actual application statuses (Received, Under Review, etc.)
            // Exclude: Pending, Unknown, Cancelled, Rejected, Approved
            const isCancelled = status.includes('cancel') || status.includes('reject');
            const isApproved = status.includes('approved') || status.includes('visa used');
            const isPending = status === 'pending' || status === 'unknown' || status === '' || status.includes('error');

            if (isCancelled || isApproved || isPending) return false;

        } else if (currentFilter === 'cancelled') {
            // Cancelled: Cancelled and rejected
            const isCancelled = status.includes('cancel') || status.includes('reject');
            if (!isCancelled) return false;

        } else if (currentFilter === 'approved') {
            // Approved: Approved or Visa Used
            if (!status.includes('approved') && !status.includes('visa used')) return false;
        }

        // Search Filter
        if (searchQuery) {
            const matchName = (student.fullName || '').toLowerCase().includes(searchQuery);
            const matchPassport = (student.passport || '').toLowerCase().includes(searchQuery);
            const matchId = (student.studentId || '').toLowerCase().includes(searchQuery);
            const matchVisaType = (student.visaType || '').toLowerCase().includes(searchQuery);
            const matchAppNo = (student.applicationNo || '').toLowerCase().includes(searchQuery);
            if (!matchName && !matchPassport && !matchId && !matchVisaType && !matchAppNo) return false;
        }

        return true;
    });

    // Sort: Application Date Ascending (Oldest Top, Newest Bottom)
    // Priority: Check oldest applications first as they are likely to change status.
    filteredStudents.sort((a, b) => {
        const dateA = a.applicationDate || '9999-99-99'; // Push empty to bottom
        const dateB = b.applicationDate || '9999-99-99';

        if (dateA > dateB) return 1;
        if (dateA < dateB) return -1;
        return 0;
    });

    updateSelectColumnVisibility(filteredStudents);

    // Empty State
    if (filteredStudents.length === 0) {
        cachedDOM.emptyState.classList.remove('d-none');
        return;
    } else {
        cachedDOM.emptyState.classList.add('d-none');
    }

    // Create Rows
    filteredStudents.forEach((student) => {
        const tr = document.createElement('tr');
        tr.style.animation = `fadeIn 0.15s ease forwards`;
        tr.style.opacity = '0'; // Start invisible for animation
        const cancellationReason = getCancellationReason(student);

        tr.innerHTML = `
            <td class="td-name">
                <div class="student-name">${getCopyFieldHtml(escapeHtml(student.fullName || ''), student.fullName, 'Copy full name')}</div>
                <div class="student-id">
                    ${student.visaType === 'E-Visa' ? '<span class="badge bg-info-subtle text-info-emphasis me-1 py-0 px-1" style="font-size: 0.65rem; vertical-align: middle;">E-Visa</span>' : '<span class="badge bg-secondary-subtle text-secondary me-1 py-0 px-1" style="font-size: 0.65rem; vertical-align: middle;">Embassy</span>'}
                    ${student.studentId ? getCopyFieldHtml('#' + escapeHtml(student.studentId), student.studentId, 'Copy student ID') : ''}
                    ${student.applicationNo ? getCopyFieldHtml(escapeHtml(student.applicationNo), student.applicationNo, 'Copy application number') : ''}
                    ${cancellationReason ? getCopyFieldHtml(`Rejected: ${escapeHtml(formatCancellationReason(cancellationReason))}`, cancellationReason, 'Copy cancellation reason', 'copy-field-reason') : ''}
                </div>
            </td>
            <td class="td-passport">
                <span class="passport-num">${getCopyFieldHtml(escapeHtml(student.passport || ''), student.passport, 'Copy passport number')}</span>
                <span class="passport-divider">|</span>
                <span class="birthday">${getCopyFieldHtml(escapeHtml(student.birthday || ''), student.birthday || '', 'Copy birthdate')}</span>
            </td>
            <td class="td-status">
                ${getCopyFieldHtml(getStatusBadge(student.status), getDisplayStatusText(student.status), 'Copy status')}
            </td>
            <td class="td-applied">
                <span class="applied-label">Applied:</span>
                <span class="applied-date">${getCopyFieldHtml(escapeHtml(student.applicationDate || '--'), student.applicationDate || '', 'Copy applied date')}</span>
            </td>
            <td class="td-checked">
                ${formatTimestampCompact(student.lastChecked)}
            </td>
            <td class="text-center td-select">
                <input
                    class="form-check-input batch-select-toggle action-btn"
                    type="checkbox"
                    data-action="toggle-batch"
                    data-id="${student.passport}"
                    title="${currentFilter === 'application' ? 'Select for batch check' : 'Select for batch delete'}"
                    ${(currentFilter === 'application' || ((currentFilter === 'cancelled' || currentFilter === 'approved') && bulkDeleteMode)) ? '' : 'disabled'}
                    ${student.batchSelected ? 'checked' : ''}
                >
            </td>
            <td class="text-center td-pdf">
                ${((student.status || '').toLowerCase().includes('approved') || (student.status || '').toLowerCase().includes('visa used')) ? (
                    (student.visaType === 'E-Visa')
                        ? `<button class="btn btn-sm btn-pdf-evisa action-btn" data-action="download-pdf" data-id="${student.passport}" title="E-Visa PDF: request from university" style="color:var(--bs-warning,#f59e0b);">
                               <i class="bi bi-info-circle-fill" style="font-size:1.2rem;"></i>
                           </button>`
                        : `<button class="btn btn-sm btn-pdf-download action-btn" data-action="download-pdf" data-id="${student.passport}" title="Download Visa PDF">
                               <i class="bi bi-file-earmark-pdf-fill"></i>
                           </button>`
                ) : ''}
            </td>
            <td class="td-actions">
                <div class="d-flex justify-content-end gap-1">
                    <button class="btn btn-sm btn-icon btn-ghost-primary action-btn" data-action="refresh" data-id="${student.passport}" title="Refresh">
                        <i class="bi bi-arrow-clockwise"></i>
                    </button>
                    <button class="btn btn-sm btn-icon btn-ghost-secondary action-btn" data-action="edit" data-id="${student.passport}" title="Edit">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-icon btn-ghost-danger action-btn" data-action="delete" data-id="${student.passport}" title="Delete">
                        <i class="bi bi-trash3"></i>
                    </button>
                </div>
            </td>
        `;

        cachedDOM.tableBody.appendChild(tr);
    });

    // Re-init Tooltips
    const triggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    tooltips = [...triggerList].map(el => new bootstrap.Tooltip(el));

    // Attach Action Listeners
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');
            handleAction(action, id, e.currentTarget);
        });
    });

    updateCheckSelectedButton();
}

function updateSelectColumnVisibility(filteredStudents = []) {
    const table = document.querySelector('.custom-table');
    if (!table) return;
    const showSelect = (currentFilter === 'application') || 
                        ((currentFilter === 'cancelled' || currentFilter === 'approved') && bulkDeleteMode);
    table.classList.toggle('show-select-column', showSelect);
    
    const hasApproved = filteredStudents.some(s => {
        const status = (s.status || '').toLowerCase();
        return status.includes('approved') || status.includes('visa used');
    });
    table.classList.toggle('show-pdf-column', currentFilter === 'approved' || hasApproved);
}

function getCopyFieldHtml(displayHtml, copyValue, title, extraClass = '') {
    const text = String(copyValue || '').trim();
    const copyButton = text && text !== '--'
        ? `<button class="btn-copy-inline action-btn" type="button" data-action="copy" data-copy="${escapeAttr(text)}" title="${title}" aria-label="${title}">
                <i class="bi bi-copy"></i>
           </button>`
        : '';

    return `<span class="copy-field ${extraClass}">
                <span class="copy-field-value">${displayHtml || '--'}</span>
                ${copyButton}
            </span>`;
}

function getDisplayStatusText(statusValue) {
    const status = (statusValue || '').toLowerCase();

    if (status.includes('visa used')) return 'Visa Used';
    if (status.includes('approved')) return 'Approved';
    if (status.includes('cancel') || status.includes('reject')) return 'Cancelled';
    if (status === 'pending' || status === 'unknown' || status === '' || status.includes('error')) return 'Pending';
    if (status.includes('received') || status.includes('app/')) return 'Received';

    return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatCancellationReason(reason) {
    return String(reason || '').replace(/\s+(?=\d+\.)/g, ' ');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
}

// ── Live passport lookup in the Add Student modal ──────────────────────────
// As the consultant types a passport number: (1) warn immediately if it's
// already in THEIR OWN database (duplicate), otherwise (2) look it up
// publicly (same endpoint visa-status.html uses) and autofill Full Name /
// Birthday if some other record already has this passport on file.
let _addModalLookupTimer = null;
let _addModalLookupPassport = '';

function setPassportLookupStatus(mode, html) {
    const el = document.getElementById('passportLookupStatus');
    if (!el) return;
    if (!mode) {
        el.className = 'passport-lookup-status d-none';
        el.innerHTML = '';
        return;
    }
    el.className = `passport-lookup-status ${mode}`;
    el.innerHTML = html;
}

function handlePassportLookup(e) {
    const input = e.target;
    // Lookup/autofill only makes sense when adding a brand-new student — during
    // Edit the consultant is correcting their own existing record, not looking
    // one up, so no duplicate warning and no autofill should ever appear.
    if (input.disabled || document.getElementById('editMode').value === 'true') return;

    clearTimeout(_addModalLookupTimer);
    const passport = input.value.trim().toUpperCase();

    // Clear any stale autofill flags so a fresh passport can autofill again
    const fullNameInput = document.getElementById('fullName');
    const birthdayInput = document.getElementById('birthday');

    if (!CONFIG.VALIDATION.PASSPORT_REGEX.test(passport)) {
        _addModalLookupPassport = '';
        setPassportLookupStatus(null);
        return;
    }
    if (passport === _addModalLookupPassport) return;

    setPassportLookupStatus('checking', `<span class="lookup-skeleton"></span>`);
    _addModalLookupTimer = setTimeout(() => runPassportLookup(passport, fullNameInput, birthdayInput), 500);
}

async function runPassportLookup(passport, fullNameInput, birthdayInput) {
    // Only ever called when adding a new student (handlePassportLookup skips
    // this entirely during Edit) — see handlePassportLookup for why.

    // 1) Duplicate check — scoped to the logged-in consultant's own students,
    // already loaded client-side, so this is instant and needs no request.
    const ownDuplicate = studentsData.find(s => s.passport === passport);
    if (ownDuplicate) {
        _addModalLookupPassport = passport;
        setPassportLookupStatus('duplicate', `<i class="bi bi-exclamation-triangle-fill"></i> This student is already in your database.`);
        return;
    }

    // 2) Helpful cross-consultant autofill — same public endpoint the
    // student-facing status checker uses. Only fills fields the user
    // hasn't already typed into themselves.
    try {
        const res = await fetch(`${STUDENTS_URL}?passport=${encodeURIComponent(passport)}&public=true`);
        if (!res.ok) { setPassportLookupStatus(null); return; }
        const rows = await res.json();
        _addModalLookupPassport = passport;

        if (!rows || rows.length === 0) {
            setPassportLookupStatus(null);
            return;
        }

        const s = rows[0];
        if (s.fullName && fullNameInput && !fullNameInput.value.trim()) {
            fullNameInput.value = s.fullName;
        }
        if (s.birthday && birthdayInput && !birthdayInput.value.trim()) {
            birthdayInput.value = s.birthday;
        }
        setPassportLookupStatus('found', `<i class="bi bi-info-circle-fill"></i> Found in our records — name & birthday autofilled.`);
    } catch (_) {
        setPassportLookupStatus(null);
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const submitBtn = cachedDOM.form.querySelector('button[type="submit"]');
    const originalContent = submitBtn.innerHTML;

    const isEdit = document.getElementById('editMode').value === 'true';
    const fullNameInput = document.getElementById('fullName');
    const passportInput = document.getElementById('passport');
    const birthdayInput = document.getElementById('birthday');
    const studentIdInput = document.getElementById('studentId');
    const visaTypeInput = document.getElementById('visaType');
    const applicationNoInput = document.getElementById('applicationNo');

    // Enforce formats
    const fullName = fullNameInput.value.toUpperCase().trim();
    const passport = passportInput.value.toUpperCase().trim();
    const birthday = birthdayInput.value.trim();
    const studentId = studentIdInput ? studentIdInput.value.trim() : '';
    const visaType = visaTypeInput ? visaTypeInput.value : 'Embassy';
    const applicationNo = applicationNoInput ? applicationNoInput.value.trim().toUpperCase() : '';

    // Validation: Passport Format
    if (!CONFIG.VALIDATION.PASSPORT_REGEX.test(passport)) {
        showError("Passport format must be 2 letters followed by 7 digits (e.g., AA1234567)");
        return;
    }

    // Validation: Birthday Format and Logic
    if (!CONFIG.VALIDATION.DATE_REGEX.test(birthday)) {
        showError("Birthday must be in YYYY-MM-DD format (e.g., 2005-01-30)");
        return;
    }

    const birthDate = new Date(birthday);
    const today = new Date();
    const minDate = new Date(CONFIG.VALIDATION.MIN_BIRTH_YEAR, 0, 1);

    if (birthDate > today) {
        showError("Birthday cannot be in the future");
        return;
    }
    if (birthDate < minDate) {
        showError(`Birthday cannot be before ${CONFIG.VALIDATION.MIN_BIRTH_YEAR}`);
        return;
    }

    const originalPassport = isEdit ? document.getElementById('originalPassport').value : '';

    // Check for duplicates — skip the student's own unchanged passport when editing
    const duplicate = studentsData.find(s => s.passport === passport && s.passport !== originalPassport);
    if (duplicate) {
        showError(`Student with passport ${passport} already exists`);
        return;
    }

    // Show Loading
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span><span id="submitBtnText">Saving...</span>`;

    const studentData = {
        fullName,
        passport,
        birthday,
        studentId,
        visaType,
        applicationNo,
        lastChecked: new Date().toISOString()
    };

    if (isEdit && originalPassport && originalPassport !== passport) {
        studentData.originalPassport = originalPassport;
    }

    if (!isEdit) {
        studentData.status = "Pending";
        // Application date will be set by API response
    }

    try {
        const response = await authFetch(STUDENTS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(studentData)
        });

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(errBody.error || `HTTP ${response.status}`);
        }

        // Reload data
        await loadStudents();

        // Stop Animation & Reset Button immediately
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalContent;

        bootstrapModal.hide();
    } catch (error) {
        debug("Error saving student:", error);
        showError(error.message && !error.message.startsWith('HTTP ') ? error.message : "Failed to save student. Please try again.");
        // Revert button on error
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalContent;
    }
}

// Helper function to show error messages
function showError(message) {
    // Use alert for now, can be improved with toast notifications
    alert(message);
}

async function copyValue(value, btnElement) {
    const text = String(value || '').trim();
    if (!text || text === '--') return;

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
        }

        if (btnElement) {
            const icon = btnElement.querySelector('i');
            const previousClass = icon?.className || 'bi bi-copy';
            btnElement.classList.add('copied');
            if (icon) icon.className = 'bi bi-check2';

            setTimeout(() => {
                btnElement.classList.remove('copied');
                if (icon) icon.className = previousClass;
            }, 900);
        }
    } catch (err) {
        debug('Copy failed:', err);
        showError('Could not copy this value.');
    }
}

async function handleAction(action, passport, btnElement) {
    if (action === 'copy') {
        await copyValue(btnElement?.getAttribute('data-copy') || '', btnElement);
        return;
    }

    const student = studentsData.find(s => s.passport === passport);
    if (!student) return;

    if (action === 'delete') {
        if (currentFilter === 'cancelled' || currentFilter === 'approved') {
            bulkDeleteMode = true;
            student.batchSelected = true;
            renderTable();
            updateDeleteSelectedButton();
            return;
        }

        if (confirm(`Are you sure you want to delete ${student.fullName}?`)) {
            try {
                const response = await authFetch(`${STUDENTS_URL}?passport=${encodeURIComponent(passport)}`, {
                    method: 'DELETE'
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                await loadStudents();
            } catch (err) {
                debug('Failed to delete student:', err);
                showError('Failed to delete student.');
            }
        }
    } else if (action === 'edit') {
        document.getElementById('editMode').value = "true";
        document.getElementById('modalTitle').textContent = "Edit Student";
        document.getElementById('submitBtnText').textContent = "Update Student";

        document.getElementById('fullName').value = student.fullName;
        document.getElementById('passport').value = student.passport;
        document.getElementById('originalPassport').value = student.passport;
        clearTimeout(_addModalLookupTimer);
        _addModalLookupPassport = '';
        setPassportLookupStatus(null);
        document.getElementById('birthday').value = student.birthday;
        if (document.getElementById('studentId')) {
            document.getElementById('studentId').value = student.studentId || '';
        }
        setVisaType(student.visaType || 'Embassy');
        if (document.getElementById('applicationNo')) {
            document.getElementById('applicationNo').value = student.applicationNo || '';
        }


        bootstrapModal.show();
    } else if (action === 'details') {
        document.getElementById('detailsName').textContent = student.fullName;
        // Show ID if exists, maybe append to name or passport
        const idDisplay = student.studentId ? `ID: ${student.studentId} | ` : '';
        document.getElementById('detailsPassport').textContent = `${idDisplay}${student.passport}`;

        document.getElementById('detailsStatus').innerHTML = getStatusBadge(student.status) + getRejectionReasonHtml(student);
        document.getElementById('detailsBirthday').textContent = formatDate(student.birthday);
        document.getElementById('detailsAppDate').textContent = student.applicationDate || '--';
        document.getElementById('detailsLastChecked').textContent = formatTimestamp(student.lastChecked);
        if (document.getElementById('detailsVisaType')) {
            document.getElementById('detailsVisaType').innerHTML = getVisaTypeBadge(student.visaType);
        }
        if (document.getElementById('detailsAppNo') && document.getElementById('detailsAppNoWrapper')) {
            if (student.visaType === 'E-Visa' && student.applicationNo) {
                document.getElementById('detailsAppNo').textContent = student.applicationNo;
                document.getElementById('detailsAppNoWrapper').classList.remove('d-none');
            } else {
                document.getElementById('detailsAppNo').textContent = '--';
                document.getElementById('detailsAppNoWrapper').classList.add('d-none');
            }
        }

        new bootstrap.Modal(document.getElementById('detailsModal')).show();
    } else if (action === 'refresh') {
        // Use passed element or fallback query
        const btn = btnElement || document.querySelector(`button[data-action="refresh"][data-id="${passport}"]`);
        if (!btn) return;

        const icon = btn.querySelector('i');

        // Add loading state - make sure icon exists and add animation
        btn.disabled = true;
        if (icon) {
            icon.classList.add('spin-animation');
            // Force reflow to ensure animation starts
            void icon.offsetWidth;
        }

        try {
            await checkVisaStatus(student);
        } catch (error) {
            debug('Error checking visa status:', error);
        } finally {
            // Remove loading state
            if (icon) {
                icon.classList.remove('spin-animation');
            }
            btn.disabled = false;
        }
    } else if (action === 'download-pdf') {
        await downloadVisaPdf(student, btnElement);
    } else if (action === 'toggle-batch') {
        const checkbox = btnElement;
        if (!checkbox || checkbox.disabled) return;
        const enabled = Boolean(checkbox.checked);
        const index = studentsData.findIndex(s => s.passport === passport);

        if (index !== -1) {
            studentsData[index].batchSelected = enabled;
        }

        // React to the checkbox state immediately — don't wait on the network
        // round-trip to show/hide the Check/Delete buttons.
        updateCheckSelectedButton();
        updateDeleteSelectedButton();

        if (currentFilter === 'cancelled' || currentFilter === 'approved') {
            return; // No need to persist batch selection in DB for temporary delete actions
        }

        try {
            const response = await authFetch(STUDENTS_URL, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    passport,
                    batchSelected: enabled,
                    batchSelectedUpdatedAt: true
                })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } catch (error) {
            debug('Failed to update batch selection:', error);
            if (checkbox) checkbox.checked = !enabled;
            if (index !== -1) {
                studentsData[index].batchSelected = !enabled;
            }
            updateCheckSelectedButton();
            updateDeleteSelectedButton();
            showError('Failed to save selection.');
        }
    }
}

function updateCheckSelectedButton() {
    if (!cachedDOM.checkSelectedBtn) return;
    const count = getSelectedApplicationPassports().length;
    const shouldShow = currentFilter === 'application' && count > 0;
    cachedDOM.checkSelectedBtn.classList.toggle('d-none', !shouldShow);
    
    const btnText = cachedDOM.checkSelectedBtn.querySelector('.btn-text');
    if (btnText) {
        btnText.textContent = count > 0 ? `Check (${count})` : 'Check';
    }
}

function getSelectedApplicationPassports() {
    if (currentFilter !== 'application') return [];

    return [...document.querySelectorAll('.batch-select-toggle:checked:not(:disabled)')]
        .map(checkbox => checkbox.getAttribute('data-id'))
        .filter(Boolean);
}

async function handleBatchCheck() {
    const selectedPassports = new Set(getSelectedApplicationPassports());
    const studentsToCheck = studentsData.filter(student =>
        selectedPassports.has(student.passport) && isApplicationStatus(student.status)
    );
    if (studentsToCheck.length === 0) return;

    const button = cachedDOM.checkSelectedBtn;
    const icon = button.querySelector('i');
    const textSpan = button.querySelector('.btn-text');
    
    // Save original layout
    const originalText = textSpan ? textSpan.textContent : 'Check';
    const originalIconClasses = icon ? icon.className : 'bi bi-arrow-clockwise';

    button.disabled = true;
    
    // Set loading state by converting icon to spinner and changing text
    if (icon) {
        icon.className = 'spinner-border spinner-border-sm';
    }
    if (textSpan) {
        textSpan.textContent = 'Checking...';
    }

    try {
        const concurrency = Math.max(1, Number(CONFIG.API.BATCH_CHECK_CONCURRENCY || 3));
        let currentIndex = 0;

        const runWorker = async () => {
            while (currentIndex < studentsToCheck.length) {
                const index = currentIndex;
                currentIndex += 1;
                const student = studentsToCheck[index];
                await checkVisaStatus(student);
            }
        };

        const workers = Array.from({
            length: Math.min(concurrency, studentsToCheck.length)
        }, () => runWorker());

        await Promise.all(workers);
        updateCheckSelectedButton();
        renderTable();
    } catch (error) {
        debug('Batch check failed:', error);
        showError('Batch check failed. Please try again.');
    } finally {
        button.disabled = false;
        // Restore original layout
        if (icon) {
            icon.className = originalIconClasses;
        }
        if (textSpan) {
            textSpan.textContent = originalText;
        }
        // Force refresh count
        updateCheckSelectedButton();
    }
}

function getSelectedDeletePassports() {
    if (currentFilter !== 'cancelled' && currentFilter !== 'approved') return [];

    return [...document.querySelectorAll('.batch-select-toggle:checked:not(:disabled)')]
        .map(checkbox => checkbox.getAttribute('data-id'))
        .filter(Boolean);
}

function updateDeleteSelectedButton() {
    if (!cachedDOM.deleteSelectedBtn) return;
    const count = getSelectedDeletePassports().length;
    const shouldShow = ((currentFilter === 'cancelled' || currentFilter === 'approved') && bulkDeleteMode && count > 0);
    cachedDOM.deleteSelectedBtn.classList.toggle('d-none', !shouldShow);
    
    const btnText = cachedDOM.deleteSelectedBtn.querySelector('.btn-text');
    if (btnText) {
        btnText.textContent = count > 0 ? `Delete (${count})` : 'Delete';
    }
}

async function handleBatchDelete() {
    const selectedPassports = getSelectedDeletePassports();
    if (selectedPassports.length === 0) return;

    if (!confirm("Are you sure?")) {
        return;
    }

    const button = cachedDOM.deleteSelectedBtn;
    const icon = button.querySelector('i');
    
    // Add loading state
    button.disabled = true;
    if (icon) icon.className = 'spinner-border spinner-border-sm me-1';

    try {
        const response = await authFetch(`${STUDENTS_URL}?passport=${encodeURIComponent(selectedPassports.join(','))}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        bulkDeleteMode = false;
        await loadStudents();
    } catch (error) {
        debug('Failed to batch delete students:', error);
        showError('Failed to delete selected students.');
    } finally {
        button.disabled = false;
        if (icon) icon.className = 'bi bi-trash';
        updateDeleteSelectedButton();
    }
}

function isApplicationStatus(statusValue) {
    const status = String(statusValue || '').toLowerCase();
    const isCancelled = status.includes('cancel') || status.includes('reject');
    const isApproved = status.includes('approved') || status.includes('visa used');
    const isPending = status === 'pending' || status === 'unknown' || status === '' || status.includes('error');
    return !isCancelled && !isApproved && !isPending;
}

// Helper function to extract visa status from API response
function extractVisaStatus(data) {
    let foundStatus = null;
    let applicationDate = '';

    // FIRST: Check for API error responses indicating no visa application found
    // These should NOT be treated as cancelled visas
    const errorIndicators = [
        data.error,
        (data.response_data && data.response_data.error) || null,
        (data.response_data && data.response_data.message) || null,
        data.message
    ];

    for (const errorMsg of errorIndicators) {
        if (errorMsg && typeof errorMsg === 'string') {
            const lowerMsg = errorMsg.toLowerCase();
            // Check for "not found", "no data", "no application" type messages
            if (lowerMsg.includes('not found') ||
                lowerMsg.includes('no data') ||
                lowerMsg.includes('topilmadi') || // Uzbek: not found
                lowerMsg.includes('mavjud emas') || // Uzbek: doesn't exist
                lowerMsg.includes('no application') ||
                lowerMsg.includes('no record')) {
                debug('API indicates no visa application found:', errorMsg);
                return {
                    status: 'Pending',
                    applicationDate: ''
                };
            }
        }
    }

    // Check if response_data is empty or null (indicates no application)
    if (data.response_data === null ||
        (data.response_data && Object.keys(data.response_data).length === 0) ||
        (data.response_data && data.response_data.visa_data === null)) {
        debug('Empty response_data - no visa application found');
        return {
            status: 'Pending',
            applicationDate: ''
        };
    }

    // Priority 1: Check response_data.visa_data (most reliable)
    if (data.response_data && data.response_data.visa_data) {
        const visaData = data.response_data.visa_data;
        foundStatus = visaData.status;
        applicationDate = visaData.application_date || '';
        debug('Found status in response_data.visa_data:', foundStatus);
    }

    // Priority 2: Check direct visa_data
    else if (data.visa_data && data.visa_data.status) {
        foundStatus = data.visa_data.status;
        applicationDate = data.visa_data.application_date || '';
        debug('Found status in visa_data:', foundStatus);
    }

    // Priority 3: Check response_data.visa_status
    else if (data.response_data && data.response_data.visa_status) {
        foundStatus = data.response_data.visa_status;
        debug('Found status in response_data.visa_status:', foundStatus);
    }

    // Priority 4: Check response_data.status (but filter technical statuses)
    else if (data.response_data && data.response_data.status) {
        const status = data.response_data.status;
        if (!CONFIG.TECHNICAL_STATUSES.includes(String(status).toUpperCase())) {
            foundStatus = status;
            debug('Found status in response_data.status:', foundStatus);
        }
    }

    // Priority 5: Check data.status (but filter technical statuses AND error statuses)
    else if (data.status) {
        const status = data.status;
        const upperStatus = String(status).toUpperCase();
        // Skip technical statuses AND error-like statuses that indicate API failure, not visa status
        if (!CONFIG.TECHNICAL_STATUSES.includes(upperStatus) &&
            upperStatus !== 'ERROR' &&
            upperStatus !== 'FAILED' &&
            upperStatus !== 'FAILURE') {
            foundStatus = status;
            debug('Found status in data.status:', foundStatus);
        }
    }

    // If nothing found, return Unknown (not applied or API issue)
    if (!foundStatus) {
        debug('No visa status found in API response');
        return {
            status: 'Unknown',
            applicationDate: ''
        };
    }

    // Translate Uzbek to English using CONFIG mapping
    let normalizedStatus = String(foundStatus).toUpperCase();
    for (const [uzbek, english] of Object.entries(CONFIG.STATUS_MAP)) {
        if (normalizedStatus.includes(uzbek.toUpperCase())) {
            debug(`Translated ${foundStatus} -> ${english}`);
            return {
                status: english,
                applicationDate
            };
        }
    }

    // Return as-is if no translation found
    return {
        status: foundStatus,
        applicationDate
    };
}

// ── PDF Download ─────────────────────────────────────────────────────────────
async function downloadVisaPdf(student, btnElement) {
    // E-Visa PDFs are issued by the university, not downloadable directly.
    if ((student.visaType || '') === 'E-Visa') {
        showEVisaPdfInfo(student, btnElement);
        return;
    }

    const btn = btnElement || document.querySelector(`button[data-action="download-pdf"][data-id="${student.passport}"]`);
    const icon = btn ? btn.querySelector('i') : null;

    if (btn) btn.disabled = true;
    if (icon) {
        icon.classList.remove('bi-file-earmark-pdf-fill');
        icon.classList.add('bi-arrow-clockwise', 'spin-animation');
    }

    try {
        const isLocal = window.location.hostname === 'localhost' ||
                        window.location.hostname === '127.0.0.1' ||
                        window.location.hostname === '' ||
                        window.location.protocol === 'file:';

        const storedPdfUrl = student.pdfUrl || '';
        const baseEndpoint = isLocal 
            ? 'http://localhost:3000/download-visa-pdf'
            : '/api/download-visa-pdf';

        const pdfUrl = `${baseEndpoint}?url=${encodeURIComponent(storedPdfUrl)}&passport=${encodeURIComponent(student.passport)}&full_name=${encodeURIComponent(student.fullName || '')}&birth_date=${encodeURIComponent(student.birthday || '')}`;

        const response = await fetch(pdfUrl);

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server error ${response.status}`);
        }

        const blob = await response.blob();
        const contentType = response.headers.get('Content-Type') || '';

        if (!blob.size) throw new Error('Received empty file from server');
        if (contentType.includes('application/json')) {
            const text = await blob.text();
            const parsed = JSON.parse(text);
            throw new Error(parsed.error || 'Failed to retrieve PDF');
        }

        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = `visa_${student.passport}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);

        debug(`PDF downloaded for ${student.passport}`);
    } catch (error) {
        debug('PDF download error:', error);
        showError(`Could not download PDF: ${error.message}`);
    } finally {
        if (btn) btn.disabled = false;
        if (icon) {
            icon.classList.remove('bi-arrow-clockwise', 'spin-animation');
            icon.classList.add('bi-file-earmark-pdf-fill');
        }
    }
}

// Show an informational toast for E-Visa students explaining PDF must come from university
function showEVisaPdfInfo(student) {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        toastContainer.style.zIndex = '11000';
        document.body.appendChild(toastContainer);
    }

    const toastId = 'toast-' + Date.now();
    const html = `
        <div id="${toastId}" class="toast align-items-center border-0" role="alert" aria-live="assertive" aria-atomic="true"
             style="background:var(--card-bg,#1e293b);color:var(--text-main,#fff);">
            <div class="d-flex">
                <div class="toast-body d-flex align-items-start gap-2">
                    <i class="bi bi-info-circle-fill text-warning mt-1" style="font-size:1.1rem;flex-shrink:0;"></i>
                    <div>
                        <div class="fw-semibold mb-1">E-Visa PDF</div>
                        <div class="small opacity-90">
                            E-Visa certificates are issued directly by the university.<br>
                            Please ask the university for the PDF.
                        </div>
                    </div>
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;

    toastContainer.insertAdjacentHTML('beforeend', html);
    const toastEl = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastEl, { delay: 6000 });
    toast.show();
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

// API Integration — uses visamasters.uz via local proxy
async function checkVisaStatus(student) {
    setCheckedCellLoading(student.passport, true);
    try {
        debug("Checking status for:", student.passport);

        const API_BASE = CONFIG.API.PROXY_URL;

        // Single POST — proxy handles CSRF + multipart and returns JSON
        const response = await fetch(API_BASE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                passport_number: student.passport,
                english_name: student.fullName,
                birth_date: student.birthday,
                visa_type: student.visaType || 'Embassy',
                application_no: student.applicationNo || ''
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}. Is the proxy server running? Run 'node proxy.js' in terminal.`);
        }

        const data = await response.json();
        debug(`API Result for ${student.passport}:`, data);

        // Proxy returns { status, detail, applicationDate, rejectionReason, rawHtml, pdfUrl, previousRejectionReason, invitingCompany }
        const newStatus = data.status || 'Unknown';
        const applicationDate = data.applicationDate || '';
        const rejectionReason = data.rejectionReason || '';
        const pdfUrl = data.pdfUrl || '';
        const previousRejectionReason = data.previousRejectionReason || '';
        const invitingCompany = data.invitingCompany || '';
        const oldStatus = student.status || 'Unknown';

        // NOTIFICATION LOGIC
        if (oldStatus !== 'Unknown' && oldStatus.toLowerCase() !== newStatus.toLowerCase()) {
            showNotification(student.fullName, oldStatus, newStatus);
            await sendTelegramNotification(student, oldStatus, newStatus, applicationDate, rejectionReason, pdfUrl, previousRejectionReason, invitingCompany);
        }

        // Update local object
        student.status = newStatus;
        student.lastChecked = new Date().toISOString(); // Local approximate lastChecked
        student.applicationDate = applicationDate;
        student.pdfUrl = pdfUrl;
        student.rejectReason = rejectionReason;
        
        // Construct the apiResponse field for UI reason parsing
        student.apiResponse = { status: newStatus, detail: data.detail || '' };

        // Update DOM row
        updateSingleRow(student);

        return newStatus;

    } catch (error) {
        debug(`Error checking visa for ${student.passport}:`, error);

        // Show user-friendly error if proxy is not running
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            showError('Cannot connect to proxy server. Please make sure proxy.js is running (node proxy.js).');
        }
        setCheckedCellLoading(student.passport, false);
        return null;
    }
}

async function sendTelegramNotification(student, oldStatus, newStatus, applicationDate, rejectionReason = '', pdfUrl = '', previousRejectionReason = '', invitingCompany = '') {
    try {
        const payload = {
            fullName: student.fullName || '',
            passport: student.passport || '',
            studentId: student.studentId || '',
            visaType: student.visaType || 'Embassy',
            applicationNo: student.applicationNo || '',
            birthday: student.birthday || '',
            oldStatus,
            newStatus,
            applicationDate: applicationDate || '',
            rejectionReason,
            pdfUrl,
            previousRejectionReason,
            invitingCompany,
            changedAt: new Date().toISOString()
        };

        const response = await authFetch(CONFIG.API.TELEGRAM_NOTIFY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            debug('Telegram notify failed:', response.status);
        }
    } catch (error) {
        debug('Telegram notify error:', error);
    }
}

// Helpers
function getVisaTypeBadge(visaType) {
    visaType = visaType || 'Embassy';
    if (visaType === 'E-Visa') {
        return `<span class="badge bg-info-subtle text-info-emphasis">
                    <i class="bi bi-globe me-1"></i>E-Visa
                </span>`;
    } else {
        return `<span class="badge bg-secondary-subtle text-secondary">
                    <i class="bi bi-building me-1"></i>Embassy
                </span>`;
    }
}

function getStatusBadge(status) {
    status = (status || 'Pending').toLowerCase();

    if (status.includes('approved') || status.includes('visa used')) {
        const label = status.includes('visa used') ? 'Visa Used' : 'Approved';
        return `<span class="badge bg-success-subtle text-success">
                    <i class="bi bi-check-circle-fill me-1"></i>${label}
                </span>`;
    } else if (status.includes('cancel') || status.includes('reject')) {
        return `<span class="badge bg-danger-subtle text-danger">
                    <i class="bi bi-x-circle-fill me-1"></i>Cancelled
                </span>`;
    } else if (status === 'pending' || status === 'unknown' || status === '' || status.includes('error')) {
        // Pending: students whose visa application hasn't been found yet (includes API errors)
        return `<span class="badge bg-secondary-subtle text-secondary">
                    <i class="bi bi-clock-history me-1"></i>Pending
                </span>`;
    } else if (status.includes('received') || status.includes('app/')) {
        return `<span class="badge bg-warning-subtle text-warning-emphasis">
                    <i class="bi bi-hourglass-split me-1"></i>Received
                </span>`;
    } else {
        return `<span class="badge bg-info-subtle text-info-emphasis">
                    <i class="bi bi-clock me-1"></i>${status.charAt(0).toUpperCase() + status.slice(1)}
                </span>`;
    }
}

function getRejectionReasonHtml(student) {
    const reason = getCancellationReason(student);
    if (!reason) return '';

    // ghost text in red
    return `<div class="text-danger opacity-75 mt-1 rejection-reason" style="font-size: 0.75rem; max-width: 250px; white-space: normal; line-height: 1.3;">
                ${escapeHtml(reason)}
            </div>`;
}

// Inline version for table ID row
function getInlineRejectionReasonHtml(student) {
    const reason = getCancellationReason(student);
    if (!reason) return '';

    const formattedReason = escapeHtml(reason).replace(/\s+(?=\d+\.)/g, '<br>');

    return `<div class="text-danger mt-1 fw-medium" style="font-size: 0.85rem; white-space: normal; line-height: 1.5;">
                Rejected: ${formattedReason}
            </div>`;
}

function getCancellationReason(student) {
    const status = (student.status || '').toLowerCase();
    const isCancelled = status.includes('cancel') || status.includes('reject');
    if (!isCancelled) return '';

    let reason = '';
    if (student.apiResponse) {
        const data = student.apiResponse;
        reason =
            (data.response_data?.visa_data?.rejection_reason) ||
            (data.response_data?.visa_data?.reject_reason) ||
            (data.response_data?.visa_data?.reason) ||
            (data.response_data?.rejection_reason) ||
            (data.response_data?.reject_reason) ||
            (data.visa_data?.rejection_reason) ||
            (data.visa_data?.reject_reason) ||
            (data.visa_data?.reason) ||
            (data.rejection_reason) ||
            (data.reject_reason) ||
            (data.reason) ||
            '';
    }

    if (!reason && student.rejectReason) {
        reason = student.rejectReason;
    }

    return String(reason || '').trim();
}

// Notification Helper
function showNotification(name, oldStatus, newStatus) {
    // Create toast container if not exists
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        toastContainer.style.zIndex = '11000'; // Above modals
        document.body.appendChild(toastContainer);
    }

    const toastId = 'toast-' + Date.now();
    const html = `
        <div id="${toastId}" class="toast align-items-center text-bg-dark border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body">
                    <div class="fw-bold mb-1">${name}</div>
                    <div class="small">
                        <span class="opacity-75">${oldStatus}</span> 
                        <i class="bi bi-arrow-right mx-1"></i> 
                        <span class="text-warning fw-bold">${newStatus}</span>
                    </div>
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;

    toastContainer.insertAdjacentHTML('beforeend', html);
    const toastEl = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastEl, {
        delay: CONFIG.UI.TOAST_DURATION_MS
    });
    toast.show();

    // Auto remove from DOM after hidden
    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}

function formatDate(dateString) {
    if (!dateString) return '--';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatTimestamp(timestamp) {
    if (!timestamp) return 'Never';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-US');
}

function formatTimestampMultiline(timestamp) {
    if (!timestamp) return 'Never';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

    const dateStr = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
    const timeStr = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });

    return `<div class="d-flex flex-column">
                <span>${dateStr},</span>
                <span class="text-secondary" style="font-size: 0.9em;">${timeStr}</span>
            </div>`;
}

// Compact timestamp for mobile-friendly display with detailed relative time
function formatTimestampCompact(timestamp) {
    if (!timestamp) return 'Never';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
        return 'Just now';
    }

    if (diffDays >= 7) {
        // Show date for older checks
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    }

    if (diffDays > 0) {
        const remainingHours = diffHours % 24;
        const remainingMinutes = diffMinutes % 60;
        const dayLabel = diffDays === 1 ? 'day' : 'days';
        
        let label = `${diffDays} ${dayLabel}`;
        if (remainingHours > 0) {
            label += ` ${remainingHours} h.`;
        }
        if (remainingMinutes > 0) {
            label += ` ${remainingMinutes} min.`;
        }
        return label + ' ago';
    }

    if (diffHours > 0) {
        const remainingMinutes = diffMinutes % 60;
        let label = `${diffHours} h.`;
        if (remainingMinutes > 0) {
            label += ` ${remainingMinutes} min.`;
        }
        return label + ' ago';
    }

    return `${diffMinutes} min. ago`;
}

function initDarkMode() {
    const isDark = localStorage.getItem('theme') === 'dark';
    if (isDark) {
        document.body.setAttribute('data-theme', 'dark');
        const icon = document.querySelector('.bi-moon-stars-fill');
        if (icon) icon.classList.replace('bi-moon-stars-fill', 'bi-sun');
    }
}

function toggleDarkMode() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const toggleBtn = document.getElementById('darkModeToggle');
    const icon = toggleBtn ? toggleBtn.querySelector('i') : null;
    if (!icon) return;

    if (isDark) {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        icon.classList.remove('bi-sun');
        icon.classList.add('bi-moon-stars-fill');
    } else {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        icon.classList.remove('bi-moon-stars-fill');
        icon.classList.add('bi-sun');
    }
}

// Global helper to toggle password input visibility in Profile Settings Modal
window.toggleProfilePw = function(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (!input || !icon) return;

    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'bi bi-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'bi bi-eye';
    }
};

// Start countdown for server load notice and auto-dismiss after clicking X and counting 3, 2, 1
function startNoticeCountdown() {
    const notice = document.getElementById('serverLoadNotice');
    const closeBtn = document.getElementById('closeNoticeBtn');
    const countdownNum = closeBtn ? closeBtn.querySelector('.countdown-num') : null;
    if (!notice || !closeBtn || !countdownNum) return;

    let secondsLeft = 3;
    let timer = null;
    let isCounting = false;

    const dismissNotice = () => {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        notice.classList.add('fade-out');
        setTimeout(() => {
            notice.remove();
        }, 400); // matches the 0.4s transition in CSS
    };

    closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (isCounting) return; // Prevent multiple countdown triggers

        isCounting = true;
        closeBtn.classList.add('counting');
        countdownNum.textContent = secondsLeft; // Show '3' immediately inside the button

        timer = setInterval(() => {
            secondsLeft--;
            if (secondsLeft <= 0) {
                dismissNotice();
            } else {
                countdownNum.textContent = secondsLeft;
            }
        }, 1000);
    });
}
