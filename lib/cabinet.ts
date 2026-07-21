/**
 * lib/cabinet.ts
 * 
 * Manages CRM student cache, synchronization, and individual/bulk refreshes.
 */

import db from './turso';
import { checkStudentVisaStatus } from './visa';
import { getValidSession } from './auth';

export interface Student {
    passport: string;
    fullName: string;
    birthday: string;
    studentId: string;
    status: string;
    applicationDate: string;
    lastChecked: string;
    rejectReason: string;
    pdfUrl: string;
    userId: number;
    visaType: string;
    applicationNo: string;
    telegram_user_id: number | null;
}

export function normalizeStatus(status: string): string {
    const s = String(status || '').trim().toLowerCase();
    if (!s || s === 'pending' || s === 'unknown' || s.includes('error')) {
        return 'pending';
    }
    if (s.includes('approved') || s.includes('visa used') || s.includes('issued')) {
        return 'approved';
    }
    if (s.includes('cancel') || s.includes('reject')) {
        return 'cancelled';
    }
    if (s.includes('received') || s.includes('app/')) {
        return 'received';
    }
    if (s.includes('under review')) {
        return 'under review';
    }
    return s;
}

export function isSameStatus(status1: string, status2: string): boolean {
    return normalizeStatus(status1) === normalizeStatus(status2);
}

export function getStatusEmoji(status: string): string {
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('approved') || normalized.includes('visa used') || normalized.includes('issued')) {
        return '🟢';
    }
    if (normalized.includes('cancel') || normalized.includes('reject')) {
        return '🔴';
    }
    if (normalized.includes('received') || normalized.includes('app/')) {
        return '🟠';
    }
    if (normalized.includes('under review')) {
        return '🔵';
    }
    return '🔷';
}

export function getStatusDescription(status: string, lang: 'uz' | 'en' = 'uz'): string {
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('approved') || normalized.includes('visa used') || normalized.includes('issued')) {
        return lang === 'en' ? 'Congratulations 🎉' : 'Tabriklaymiz 🎉';
    }
    if (normalized.includes('cancel') || normalized.includes('reject')) {
        return lang === 'en' ? 'Your application was rejected.' : 'Arizangiz rad etildi.';
    }
    if (normalized.includes('received') || normalized.includes('app/')) {
        return lang === 'en' ? '⏳ Your application is being processed.' : '⏳ Arizangiz jarayonda.';
    }
    if (normalized.includes('under review')) {
        return lang === 'en' ? '🔎 Under review.' : '🔎 Ko\'rib chiqilmoqda.';
    }
    return lang === 'en' ? 'Status updated.' : 'Status yangilandi.';
}

/**
 * Formats a Telegram student card message.
 */
export function formatLastChecked(dateString: string, lang: 'uz' | 'en' = 'uz'): string {
    const today    = lang === 'en' ? 'Today'    : 'Bugun';
    const never    = lang === 'en' ? 'Never'    : 'Hech qachon';
    if (!dateString) return never;
    const date = new Date(dateString);
    try {
        const todayStr = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Tashkent' });
        const dateStr = date.toLocaleDateString('en-US', { timeZone: 'Asia/Tashkent' });
        
        const timePart = date.toLocaleTimeString('en-US', {
            timeZone: 'Asia/Tashkent',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        if (todayStr === dateStr) {
            return `${today}, ${timePart}`;
        } else {
            const datePart = date.toLocaleDateString('en-US', {
                timeZone: 'Asia/Tashkent',
                month: 'short',
                day: 'numeric'
            });
            return `${datePart}, ${timePart}`;
        }
    } catch {
        const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
        const uzDate = new Date(utc + (3600000 * 5));
        let hours = uzDate.getHours();
        const minutes = String(uzDate.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const timePart = `${hours}:${minutes} ${ampm}`;
        
        const nowUz = new Date(new Date().getTime() + (new Date().getTimezoneOffset() * 60000) + (3600000 * 5));
        if (nowUz.toDateString() === uzDate.toDateString()) {
            return `${today}, ${timePart}`;
        } else {
            return `${uzDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${timePart}`;
        }
    }
}

/**
 * Formats a Telegram student card message.
 */
export function formatStudentCard(student: Student, isUpdate: boolean = false, oldStatus: string = '', lang: 'uz' | 'en' = 'uz'): string {
    const emoji = getStatusEmoji(student.status);
    const checkedStr = formatLastChecked(student.lastChecked, lang);
    
    if (isUpdate && oldStatus && !isSameStatus(oldStatus, student.status)) {
        return [
            lang === 'en' ? 'Visa status changed' : 'Visa holati o\'zgardi',
            ``,
            `${student.studentId || '--'}`,
            `${student.fullName}`,
            ``,
            `${lang === 'en' ? 'Old' : 'Eski'}: ${oldStatus.toUpperCase()}`,
            `${lang === 'en' ? 'New' : 'Yangi'}: ${emoji} ${student.status.toUpperCase()}`,
            `${lang === 'en' ? 'Checked' : 'Tekshirildi'}: ${checkedStr}`
        ].join('\n');
    }
    
    return [
        lang === 'en' ? 'Visa status' : 'Visa statusi',
        ``,
        `${student.studentId || '--'}`,
        `${student.fullName}`,
        ``,
        `${emoji} ${student.status.toUpperCase()}`,
        `${lang === 'en' ? 'Checked' : 'Tekshirildi'}: ${checkedStr}`
    ].join('\n');
}

/**
 * Fetches all active (non-deleted) students belonging to a connected Telegram user.
 */
export async function getStudentsByTelegramId(telegramId: number): Promise<Student[]> {
    try {
        const result = await db.execute({
            sql: `
                SELECT s.* FROM students s
                JOIN cabinet_subscribers cs ON s.userId = cs.cabinet_id
                WHERE cs.telegram_id = ? AND s.deletedAt IS NULL
                ORDER BY s.createdAt DESC
            `,
            args: [telegramId]
        });
        
        return result.rows.map((row: any) => ({
            passport: row.passport,
            fullName: row.fullName || row.fullname || '',
            birthday: row.birthday || '',
            studentId: row.studentId || row.student_id || '',
            status: row.status || 'Pending',
            applicationDate: row.applicationDate || row.application_date || '',
            lastChecked: row.lastChecked || row.last_checked || '',
            rejectReason: row.rejectReason || '',
            pdfUrl: row.pdfUrl || '',
            userId: Number(row.userId),
            visaType: row.visaType || row.visa_type || 'Embassy',
            applicationNo: row.applicationNo || row.application_no || '',
            telegram_user_id: row.telegram_user_id ? Number(row.telegram_user_id) : null
        }));
    } catch (err: any) {
        console.error('[Cabinet Service] Error fetching students:', err.message);
        return [];
    }
}

/**
 * Checks and updates a student's status, and logs a notification if it changes.
 * Returns { changed: boolean, oldStatus: string, student: Student }
 */
export async function refreshStudent(telegramId: number, passport: string): Promise<{
    success: boolean;
    changed: boolean;
    oldStatus: string;
    student?: Student;
    error?: string;
}> {
    try {
        // 1. Fetch student — resolve cabinet via cabinet_subscribers so any
        //    subscriber of the same cabinet can refresh any of its students.
        const result = await db.execute({
            sql: `
                SELECT s.*, cs.cabinet_id as uId
                FROM students s
                JOIN cabinet_subscribers cs ON s.userId = cs.cabinet_id
                WHERE s.passport = ? AND cs.telegram_id = ? AND s.deletedAt IS NULL
            `,
            args: [passport.toUpperCase().trim(), telegramId]
        });
        
        if (result.rows.length === 0) {
            return { success: false, changed: false, oldStatus: '', error: 'Student not found in your cabinet.' };
        }
        
        const row = result.rows[0] as any;
        const student: Student = {
            passport: row.passport,
            fullName: row.fullName || row.fullname || '',
            birthday: row.birthday || '',
            studentId: row.studentId || row.student_id || '',
            status: row.status || 'Pending',
            applicationDate: row.applicationDate || row.application_date || '',
            lastChecked: row.lastChecked || row.last_checked || '',
            rejectReason: row.rejectReason || '',
            pdfUrl: row.pdfUrl || '',
            userId: Number(row.uId),
            visaType: row.visaType || row.visa_type || 'Embassy',
            applicationNo: row.applicationNo || row.application_no || '',
            telegram_user_id: telegramId
        };
        
        // 2. Query official visa portal
        const liveStatus = await checkStudentVisaStatus(
            student.passport,
            student.fullName,
            student.birthday,
            student.visaType,
            student.applicationNo
        );
        
        if (!liveStatus.found) {
            // Update last checked time even if not found on the portal (e.g. pending submission)
            const now = new Date().toISOString();
            await db.execute({
                sql: 'UPDATE students SET lastChecked = ?, last_checked = ? WHERE passport = ?',
                args: [now, now, student.passport]
            });
            student.lastChecked = now;
            return { success: true, changed: false, oldStatus: student.status, student };
        }
        
        const oldStatus = student.status;
        const newStatus = liveStatus.latestStatus;
        const changed = !isSameStatus(oldStatus, newStatus);
        const now = new Date().toISOString();
        
        // 3. Update student in database (keeping both camelCase and snake_case in sync)
        await db.execute({
            sql: `
                UPDATE students 
                SET status = ?,
                    applicationDate = ?,
                    application_date = ?,
                    lastChecked = ?,
                    last_checked = ?,
                    rejectReason = ?,
                    pdfUrl = ?,
                    apiResponse = ?,
                    telegram_user_id = ?
                WHERE passport = ?
            `,
            args: [
                newStatus,
                liveStatus.latestDate || student.applicationDate,
                liveStatus.latestDate || student.applicationDate,
                now,
                now,
                liveStatus.rejectionReason || '',
                liveStatus.pdfUrl || '',
                JSON.stringify(liveStatus),
                telegramId,
                student.passport
            ]
        });
        
        // Update local object
        student.status = newStatus;
        student.applicationDate = liveStatus.latestDate || student.applicationDate;
        student.lastChecked = now;
        student.rejectReason = liveStatus.rejectionReason || '';
        student.pdfUrl = liveStatus.pdfUrl || '';
        
        // 4. Log notification if status changed
        if (changed) {
            await db.execute({
                sql: `
                    INSERT INTO notifications (telegram_user_id, student_id, old_status, new_status, created_at)
                    VALUES (?, ?, ?, ?, datetime('now'))
                `,
                args: [telegramId, student.passport, oldStatus, newStatus]
            });
        }
        
        return { success: true, changed, oldStatus, student };
    } catch (err: any) {
        console.error(`[Cabinet Service] Error refreshing student ${passport}:`, err.message);
        return { success: false, changed: false, oldStatus: '', error: err.message };
    }
}
