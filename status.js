import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import CONFIG from "./config.js";

const firebaseConfig = {
    apiKey: "AIzaSyBPF5_HYIGuqDNZQQ1V1rGsow3IDkQpO6s",
    authDomain: "omadbek-ef47a.firebaseapp.com",
    projectId: "omadbek-ef47a",
    storageBucket: "omadbek-ef47a.firebasestorage.app",
    messagingSenderId: "355866151538",
    appId: "1:355866151538:web:4bb0cc8251bdf8c15c50eb"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM Elements
const form = document.getElementById('checkForm');
const passportInput = document.getElementById('passportInput');
const checkBtn = document.getElementById('checkBtn');
const btnText = document.getElementById('btnText');
const btnSpinner = document.getElementById('btnSpinner');
const errorMsg = document.getElementById('errorMsg');
const resultSection = document.getElementById('resultSection');

// Display Elements
const statusBadge = document.getElementById('statusBadge');
const resName = document.getElementById('resName');
const resDob = document.getElementById('resDob');
const resAppDate = document.getElementById('resAppDate');
const dateWrapper = document.getElementById('dateWrapper');
const resReason = document.getElementById('resReason');
const reasonWrapper = document.getElementById('reasonWrapper');
const downloadBtn = document.getElementById('downloadBtn');
const downloadError = document.getElementById('downloadError');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const passport = passportInput.value.trim().toUpperCase();
    if (!passport) return;

    // Reset UI
    errorMsg.classList.add('d-none');
    resultSection.style.display = 'none';
    btnText.style.display = 'none';
    btnSpinner.classList.remove('d-none');
    checkBtn.disabled = true;
    downloadBtn.classList.add('d-none');
    downloadError.classList.add('d-none');

    try {
        const q = query(
            collection(db, CONFIG.FIRESTORE.STUDENTS_COLLECTION),
            where("passport", "==", passport)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            showError("Ushbu pasport raqami bazadan topilmadi.");
            return;
        }

        const studentDoc = querySnapshot.docs[0];
        const student = studentDoc.data();
        
        // ── Real-time Check Logic ──
        // Instead of just relying on the database value, we perform a real-time fetch
        // using the fullName and birthday we have in the database for this passport.
        const fullName = student.fullName || '';
        const birthday = student.birthday || student.dateOfBirth || '';

        if (!fullName || !birthday) {
            showError("Talaba ma'lumotlari to'liq emas. Iltimos ofisga murojaat qiling.");
            return;
        }

        // Show "Checking..." on the badge while we hit the API
        statusBadge.className = 'status-badge status-Pending';
        statusBadge.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Tekshirilmoqda...';
        resultSection.style.display = 'block';
        resName.textContent = fullName;
        resDob.textContent = birthday;

        const apiBase = CONFIG.API.PROXY_URL;
        const apiResponse = await fetch(apiBase, {
            method: 'POST',
            body: JSON.stringify({ passport, full_name: fullName, birth_date: birthday }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!apiResponse.ok) {
            throw new Error(`Real-time check failed: ${apiResponse.statusText}`);
        }

        const freshData = await apiResponse.json();
        const oldStatus = student.status || 'Unknown';
        const newStatus = freshData.status || 'Pending';
        
        // Notify if status changed
        if (oldStatus !== 'Unknown' && oldStatus.toLowerCase() !== newStatus.toLowerCase()) {
            sendTelegramNotification(student, oldStatus, newStatus, freshData.applicationDate);
        }

        // Update Firestore with the fresh data (so admin also sees it)
        const updatePayload = {
            status: newStatus,
            applicationDate: freshData.applicationDate || '',
            rejectionReason: freshData.rejectionReason || '',
            pdfUrl: freshData.pdfUrl || '',
            apiResponse: freshData, // Store raw response for debugging reasons
            lastChecked: serverTimestamp()
        };
        await updateDoc(doc(db, CONFIG.FIRESTORE.STUDENTS_COLLECTION, passport), updatePayload);

        // Map fresh status for UI
        let displayStatus = freshData.status || 'Pending';
        let statusClass = 'Pending';
        let statusText = 'Kutilmoqda (Pending)';

        if (displayStatus === 'APPROVED') { statusClass = 'APPROVED'; statusText = 'Tasdiqlangan (Approved)'; }
        else if (displayStatus === 'CANCELLED') { statusClass = 'CANCELLED'; statusText = 'Rad etilgan (Cancelled)'; }
        else if (displayStatus === 'APP/RECEIVED') { statusClass = 'RECEIVED'; statusText = 'Qabul Qilingan (Received)'; }
        else if (displayStatus === 'UNDER REVIEW') { statusClass = 'UNDER'; statusText = "Ko'rib Chiqilmoqda (Under Review)"; }
        else if (displayStatus === 'holat noma\'lum' || displayStatus === 'Noma\'lum') { statusClass = 'Pending'; statusText = 'Noma\'lum (Unknown)'; }

        // Update UI with fresh results
        statusBadge.className = `status-badge status-${statusClass}`;
        statusBadge.innerHTML = `<i class="bi ${statusClass==='APPROVED' ? 'bi-check-circle-fill' : 'bi-info-circle-fill'} me-1"></i> ${statusText}`;

        if (freshData.applicationDate) {
            resAppDate.textContent = freshData.applicationDate;
            dateWrapper.classList.remove('d-none');
        } else {
            dateWrapper.classList.add('d-none');
        }

        if (freshData.rejectionReason) {
            resReason.innerHTML = freshData.rejectionReason.replace(/\s+(?=\d+\.)/g, '<br>');
            reasonWrapper.classList.remove('d-none');
        } else {
            reasonWrapper.classList.add('d-none');
        }

        // Handle Download PDF Button
        if (displayStatus === 'APPROVED') {
            if (freshData.pdfUrl) {
                const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
                const pdfFetchUrl = isLocal 
                    ? `http://localhost:3000/download-visa-pdf?url=${encodeURIComponent(freshData.pdfUrl)}&passport=${encodeURIComponent(passport)}&full_name=${encodeURIComponent(fullName)}&birth_date=${encodeURIComponent(birthday)}`
                    : `/api/download-visa-pdf?url=${encodeURIComponent(freshData.pdfUrl)}&passport=${encodeURIComponent(passport)}&full_name=${encodeURIComponent(fullName)}&birth_date=${encodeURIComponent(birthday)}`;

                downloadBtn.href = "#";
                downloadBtn.onclick = async (ev) => {
                    ev.preventDefault();
                    downloadBtn.disabled = true;
                    downloadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Yuklanmoqda...';
                    
                    try {
                        const dlRes = await fetch(pdfFetchUrl);
                        if (!dlRes.ok) {
                            const errData = await dlRes.json().catch(() => ({}));
                            throw new Error(errData.error || `Server HTTP ${dlRes.status} xato qaytardi`);
                        }
                        const blob = await dlRes.blob();
                        const blobUrl = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = blobUrl;
                        a.download = `Viza_${passport}.pdf`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.URL.revokeObjectURL(blobUrl);
                    } catch (err) {
                        downloadError.textContent = "PDF fayl topilmadi yoki xato yuz berdi: " + err.message;
                        downloadError.classList.remove('d-none');
                    } finally {
                        downloadBtn.disabled = false;
                        downloadBtn.innerHTML = '<i class="bi bi-file-earmark-pdf-fill"></i> Viza PDF Yuklab Olish';
                    }
                };
                downloadBtn.classList.remove('d-none');
            } else {
                downloadError.textContent = "Viza PDF fayl manzili hali arxivlanmagan. Iltimos keyinroq urinib ko'ring yoki ofisga murojaat qiling.";
                downloadError.classList.remove('d-none');
            }
        }

    } catch (err) {
        showError(`Tizim xatosi: ${err.message}`);
    } finally {
        btnText.style.display = 'inline-block';
        btnSpinner.classList.add('d-none');
        checkBtn.disabled = false;
    }
});

async function sendTelegramNotification(student, oldStatus, newStatus, applicationDate) {
    try {
        const payload = {
            fullName: student.fullName || '',
            passport: student.passport || '',
            studentId: student.studentId || '',
            birthday: student.birthday || student.dateOfBirth || '',
            oldStatus,
            newStatus,
            applicationDate: applicationDate || '',
            changedAt: new Date().toISOString()
        };

        await fetch(CONFIG.API.TELEGRAM_NOTIFY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });
    } catch (error) {
        console.error('Telegram notify error:', error);
    }
}

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('d-none');
    resultSection.style.display = 'none';
    btnText.style.display = 'inline-block';
    btnSpinner.classList.add('d-none');
    checkBtn.disabled = false;
}
