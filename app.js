import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore,
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import CONFIG from "./config.js";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBPF5_HYIGuqDNZQQ1V1rGsow3IDkQpO6s",
    authDomain: "omadbek-ef47a.firebaseapp.com",
    projectId: "omadbek-ef47a",
    storageBucket: "omadbek-ef47a.firebasestorage.app",
    messagingSenderId: "355866151538",
    appId: "1:355866151538:web:4bb0cc8251bdf8c15c50eb"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const STUDENTS_COLLECTION = CONFIG.FIRESTORE.STUDENTS_COLLECTION;

// State
let studentsData = [];
// Default filter is now 'application' (active pending applications)
let currentFilter = 'application';
let searchQuery = '';
let tooltips = [];
let searchDebounceTimer = null;

// Cached DOM Elements (for performance)
let cachedDOM = {
    tableBody: null,
    emptyState: null,
    loadingState: null,
    studentCountLabel: null,
    filterLabel: null,
    form: null,
    modalElement: null,
    searchInput: null,
    darkModeToggle: null,
    checkAll: null,
};


let bootstrapModal = null; // Will be initialized on load

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Cache DOM elements
    cachedDOM.tableBody = document.getElementById('studentsTableBody');
    cachedDOM.emptyState = document.getElementById('emptyState');
    cachedDOM.loadingState = document.getElementById('loadingState');
    cachedDOM.studentCountLabel = document.getElementById('studentCount');
    cachedDOM.form = document.getElementById('studentForm');
    cachedDOM.modalElement = document.getElementById('addStudentModal');
    cachedDOM.searchInput = document.getElementById('searchInput');
    cachedDOM.darkModeToggle = document.getElementById('darkModeToggle');
    cachedDOM.checkAll = document.getElementById('checkAll');

    // Init Bootstrap Modal
    bootstrapModal = new bootstrap.Modal(cachedDOM.modalElement);

    // Setup Listeners
    setupEventListeners();

    // Setup Realtime Data Sync
    setupRealtimeListener();

    // Init Dark Mode
    initDarkMode();
});

function setupEventListeners() {
    // Form Submit (Add/Edit)
    cachedDOM.form.addEventListener('submit', handleFormSubmit);

    // Search Input with Debouncing
    cachedDOM.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            searchQuery = e.target.value.toLowerCase();
            renderTable();
        }, CONFIG.UI.SEARCH_DEBOUNCE_MS);
    });

    // Tab Filtering
    document.querySelectorAll('[data-tab]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();

            // Activate Tab UI
            document.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');

            // Apply Filter
            currentFilter = e.target.getAttribute('data-tab');
            renderTable();
        });
    });

    // Dark Mode Toggle
    if (cachedDOM.darkModeToggle) {
        cachedDOM.darkModeToggle.addEventListener('click', toggleDarkMode);
    }

    // Check All Checkbox
    if (cachedDOM.checkAll) {
        cachedDOM.checkAll.addEventListener('change', function () {
            const checkboxes = document.querySelectorAll('tbody .form-check-input');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
        });
    }

    // Modal Events to reset form
    cachedDOM.modalElement.addEventListener('hidden.bs.modal', () => {
        cachedDOM.form.reset();
        document.getElementById('editMode').value = "false";
        document.getElementById('modalTitle').textContent = "Add New Student";
        document.getElementById('submitBtnText').textContent = "Save Student";
        document.getElementById('passport').disabled = false;
    });

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
}

function setupRealtimeListener() {
    onSnapshot(collection(db, STUDENTS_COLLECTION), (snapshot) => {
        // Check if this is the initial load or an update
        const isInitialLoad = studentsData.length === 0;

        if (isInitialLoad) {
            // Initial load - rebuild entire array
            studentsData = [];
            snapshot.forEach((doc) => {
                studentsData.push({
                    ...doc.data()
                });
            });
            renderTable();
        } else {
            // Incremental update - only update changed documents
            let hasChanges = false;

            snapshot.docChanges().forEach((change) => {
                const docData = change.doc.data();
                const passport = docData.passport;

                if (change.type === 'added') {
                    // New student added
                    studentsData.push(docData);
                    hasChanges = true;
                } else if (change.type === 'modified') {
                    // Student data updated - find and update in array
                    const index = studentsData.findIndex(s => s.passport === passport);
                    if (index !== -1) {
                        studentsData[index] = docData;
                        // Update only this specific row in the DOM
                        updateSingleRow(docData);
                    }
                } else if (change.type === 'removed') {
                    // Student deleted
                    const index = studentsData.findIndex(s => s.passport === passport);
                    if (index !== -1) {
                        studentsData.splice(index, 1);
                        hasChanges = true;
                    }
                }
            });

            // Only re-render entire table if students were added or removed
            // Modified students are updated individually via updateSingleRow
            if (hasChanges) {
                renderTable();
            }
        }
    });
}

// Update a single row in the DOM without re-rendering entire table
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
        statusCell.innerHTML = getStatusBadge(student.status);
    }

    // Update last checked timestamp
    const checkedCell = row.querySelector('.td-checked');
    if (checkedCell) {
        checkedCell.textContent = formatTimestampCompact(student.lastChecked);
    }

    // Update application date if it changed
    const appliedCell = row.querySelector('.td-applied .applied-date');
    if (appliedCell && student.applicationDate) {
        appliedCell.textContent = student.applicationDate;
    }

    // Update tab counts (status might have changed)
    updateTabCounts();

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
            const isApproved = status.includes('approved');
            const isCancelled = status.includes('cancel') || status.includes('reject') || status.includes('error');

            if (isApproved) {
                counts.approved++;
            } else if (isCancelled) {
                counts.cancelled++;
            } else {
                // Application (everything else)
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
                // Create badge on first use
                const title = tabName.charAt(0).toUpperCase() + tabName.slice(1);
                badge = document.createElement('span');
                badge.className = 'badge bg-white text-primary ms-1 badge-count rounded-pill';
                badge.style.fontSize = '0.75em';
                badge.style.opacity = '0.8';

                // Clear and rebuild content
                tabLink.textContent = title + ' ';
                tabLink.appendChild(badge);
            }
            // Update count using textContent (safer than innerHTML)
            badge.textContent = count;
        }
    };

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

        if (currentFilter === 'application') {
            // "Statuses except Cancelled, Approved"
            // So: Pending, Under Review, App/Received, Unknown, etc.
            // Exclude: Cancelled, Rejected, Error, Approved

            // Check exclusions
            const isCancelled = status.includes('cancel') || status.includes('reject') || status.includes('error');
            const isApproved = status.includes('approved');

            if (isCancelled || isApproved) return false;

        } else if (currentFilter === 'cancelled') {
            // "Cancelled: Cancelled" (and rejected/error)
            const isCancelled = status.includes('cancel') || status.includes('reject') || status.includes('error');
            if (!isCancelled) return false;

        } else if (currentFilter === 'approved') {
            // "Approved: Approved"
            if (!status.includes('approved')) return false;
        }

        // Search Filter
        if (searchQuery) {
            const matchName = (student.fullName || '').toLowerCase().includes(searchQuery);
            const matchPassport = (student.passport || '').toLowerCase().includes(searchQuery);
            const matchId = (student.studentId || '').toLowerCase().includes(searchQuery);
            if (!matchName && !matchPassport && !matchId) return false;
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

    // Update Count
    cachedDOM.studentCountLabel.textContent = `${filteredStudents.length} students`;

    // Empty State
    if (filteredStudents.length === 0) {
        cachedDOM.emptyState.classList.remove('d-none');
        return;
    } else {
        cachedDOM.emptyState.classList.add('d-none');
    }

    // Create Rows
    filteredStudents.forEach((student, index) => {
        const tr = document.createElement('tr');
        // Animation delay from config
        tr.style.animation = `fadeIn 0.3s ease forwards ${index * (CONFIG.UI.ANIMATION_DELAY_PER_ROW / 1000)}s`;
        tr.style.opacity = '0'; // Start invisible for animation

        tr.innerHTML = `
            <td class="td-name">
                <div class="student-name">${student.fullName}</div>
                <div class="student-id">${student.studentId ? '#' + student.studentId : ''}</div>
            </td>
            <td class="td-passport">
                <span class="passport-num">${student.passport}</span>
                <span class="passport-divider">|</span>
                <span class="birthday">${student.birthday || ''}</span>
            </td>
            <td class="td-status">
                ${getStatusBadge(student.status)}
            </td>
            <td class="td-applied">
                <span class="applied-label">Applied:</span>
                <span class="applied-date">${student.applicationDate || '--'}</span>
            </td>
            <td class="td-checked">
                ${formatTimestampCompact(student.lastChecked)}
            </td>
            <td class="td-actions">
                <div class="d-flex justify-content-end gap-1">
                    <button class="btn btn-sm btn-icon btn-ghost-primary action-btn" data-action="refresh" data-id="${student.passport}" title="Refresh">
                        <i class="bi bi-arrow-repeat"></i>
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

    // Enforce formats
    const fullName = fullNameInput.value.toUpperCase().trim();
    const passport = passportInput.value.toUpperCase().trim();
    const birthday = birthdayInput.value.trim();
    const studentId = studentIdInput ? studentIdInput.value.trim() : '';

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

    // Check for duplicates (only when adding new student)
    if (!isEdit) {
        const duplicate = studentsData.find(s => s.passport === passport);
        if (duplicate) {
            showError(`Student with passport ${passport} already exists`);
            return;
        }
    }

    // Show Loading
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> <span id="submitBtnText">Saving...</span>`;

    const studentData = {
        fullName,
        passport,
        birthday,
        studentId,
        lastChecked: serverTimestamp()
    };

    if (!isEdit) {
        studentData.status = "Pending";
        // Application date will be set by API response
    }

    try {
        await setDoc(doc(db, STUDENTS_COLLECTION, passport), studentData, {
            merge: true
        });

        // Stop Animation & Reset Button immediately
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalContent;

        bootstrapModal.hide();
    } catch (error) {
        debug("Error saving student:", error);
        showError("Failed to save student. Please try again.");
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

async function handleAction(action, passport, btnElement) {
    const student = studentsData.find(s => s.passport === passport);
    if (!student) return;

    if (action === 'delete') {
        if (confirm(`Are you sure you want to delete ${student.fullName}?`)) {
            await deleteDoc(doc(db, STUDENTS_COLLECTION, passport));
        }
    } else if (action === 'edit') {
        document.getElementById('editMode').value = "true";
        document.getElementById('modalTitle').textContent = "Edit Student";
        document.getElementById('submitBtnText').textContent = "Update Student";

        document.getElementById('fullName').value = student.fullName;
        document.getElementById('passport').value = student.passport;
        document.getElementById('passport').disabled = true; // Key shouldn't change easily
        document.getElementById('birthday').value = student.birthday;
        if (document.getElementById('studentId')) {
            document.getElementById('studentId').value = student.studentId || '';
        }


        bootstrapModal.show();
    } else if (action === 'details') {
        document.getElementById('detailsName').textContent = student.fullName;
        // Show ID if exists, maybe append to name or passport
        const idDisplay = student.studentId ? `ID: ${student.studentId} | ` : '';
        document.getElementById('detailsPassport').textContent = `${idDisplay}${student.passport}`;

        document.getElementById('detailsStatus').innerHTML = getStatusBadge(student.status);
        document.getElementById('detailsBirthday').textContent = formatDate(student.birthday);
        document.getElementById('detailsAppDate').textContent = student.applicationDate || '--';
        document.getElementById('detailsLastChecked').textContent = formatTimestamp(student.lastChecked);

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
    }
}

// Helper function to extract visa status from API response
function extractVisaStatus(data) {
    let foundStatus = null;
    let applicationDate = '';

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

    // Priority 5: Check data.status (but filter technical statuses)
    else if (data.status) {
        const status = data.status;
        if (!CONFIG.TECHNICAL_STATUSES.includes(String(status).toUpperCase())) {
            foundStatus = status;
            debug('Found status in data.status:', foundStatus);
        }
    }

    // If nothing found, return Unknown
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

// API Integration
async function checkVisaStatus(student) {
    try {
        debug("Checking status for:", student.passport);

        // Use configured API endpoint
        const API_BASE = CONFIG.API.PROXY_URL;

        // 1. Initial POST Request
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
                website: "",
                _form_start_time: new Date().getTime() / 1000
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}. Is the proxy server running? Run 'node proxy.js' in terminal.`);
        }

        let data = await response.json();
        debug(`Initial API Result for ${student.passport}:`, data);

        // 2. Poll if PENDING
        const taskId = data.id;
        let retryCount = 0;
        const maxRetries = CONFIG.API.MAX_POLL_RETRIES;

        while (data.status === "PENDING" && retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.API.POLL_INTERVAL_MS));
            retryCount++;

            try {
                // Poll via proxy
                const pollResponse = await fetch(`${API_BASE}/${taskId}`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                if (pollResponse.ok) {
                    data = await pollResponse.json();
                    debug(`Poll attempt ${retryCount}:`, data);
                }
            } catch (e) {
                debug("Poll error:", e);
            }
        }

        // 3. Extract visa status using helper function
        const {
            status: newStatus,
            applicationDate
        } = extractVisaStatus(data);
        const oldStatus = student.status || "Unknown";

        // NOTIFICATION LOGIC
        if (oldStatus !== "Unknown" && oldStatus.toLowerCase() !== newStatus.toLowerCase()) {
            showNotification(student.fullName, oldStatus, newStatus);
        }

        // 4. Update Firestore
        const docRef = doc(db, STUDENTS_COLLECTION, student.passport);
        const updatePayload = {
            status: newStatus,
            lastChecked: serverTimestamp(),
            apiResponse: data
        };

        if (applicationDate) {
            updatePayload.applicationDate = applicationDate;
        }

        await updateDoc(docRef, updatePayload);
        return newStatus;

    } catch (error) {
        debug(`Error checking visa for ${student.passport}:`, error);

        // Show user-friendly error if proxy is not running
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            showError('Cannot connect to proxy server. Please make sure proxy.js is running (node proxy.js).');
        }
        return null;
    }
}

// Helpers
function getStatusBadge(status) {
    status = (status || 'Unknown').toLowerCase();

    if (status.includes('approved')) {
        return `<span class="badge bg-success-subtle text-success">
                    <i class="bi bi-check-circle-fill me-1"></i>Approved
                </span>`;
    } else if (status.includes('cancel') || status.includes('reject') || status.includes('error')) {
        return `<span class="badge bg-danger-subtle text-danger">
                    <i class="bi bi-x-circle-fill me-1"></i>Cancelled
                </span>`;
    } else if (status.includes('received') || status.includes('app')) {
        return `<span class="badge bg-warning-subtle text-warning-emphasis">
                    <i class="bi bi-hourglass-split me-1"></i>Received
                </span>`;
    } else {
        return `<span class="badge bg-info-subtle text-info-emphasis">
                    <i class="bi bi-clock me-1"></i>${status.charAt(0).toUpperCase() + status.slice(1)}
                </span>`;
    }
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

// Compact timestamp for mobile-friendly display
function formatTimestampCompact(timestamp) {
    if (!timestamp) return 'Never';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Show relative time for recent checks
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    // Show date for older
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
}

function initDarkMode() {
    const isDark = localStorage.getItem('theme') === 'dark';
    if (isDark) {
        document.body.setAttribute('data-theme', 'dark');
        document.querySelector('.bi-moon-stars').classList.replace('bi-moon-stars', 'bi-sun');
    }
}

function toggleDarkMode() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const icon = document.getElementById('darkModeToggle').querySelector('i');

    if (isDark) {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        icon.classList.remove('bi-sun');
        icon.classList.add('bi-moon-stars');
    } else {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        icon.classList.remove('bi-moon-stars');
        icon.classList.add('bi-sun');
    }
}