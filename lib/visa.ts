/**
 * lib/visa.ts
 * 
 * Provides visa status checking logic by reusing the existing scraper in direct-visa-check.js.
 */

// Import direct visa check JS module
// @ts-ignore - Ignore missing type declarations since this is a vanilla JS file in the project
import { checkVisaDirect } from '../direct-visa-check';

export interface VisaStatusInfo {
    found: boolean;
    latestStatus: string;
    latestStatusKorean: string;
    latestDate: string;
    entryDate: string;
    entryPurpose: string;
    rejectionReason: string;
    visaExpiry: string;
    visaKind: string;
    statusOfResidence: string;
    invitingCompany: string;
    pdfUrl: string;
}

/**
 * Checks a student's visa status directly from the official visa.go.kr portal.
 * 
 * @param passport - Passport number (e.g. "FB0369182")
 * @param fullName - Full name in English (e.g. "ABDUGANIEV MUKHAMMAD AZIZ")
 * @param birthDate - Date of birth in YYYY-MM-DD format
 * @param visaType - 'Embassy' or 'E-Visa'
 * @param applicationNo - E-Visa application sequence number (optional, required if E-Visa)
 */
export async function checkStudentVisaStatus(
    passport: string,
    fullName: string,
    birthDate: string,
    visaType: string = 'Embassy',
    applicationNo: string = ''
): Promise<VisaStatusInfo> {
    try {
        const cleanedPassport = passport.toUpperCase().trim();
        const cleanedName = fullName.toUpperCase().trim();
        const cleanedBirthDate = birthDate.trim();
        const cleanedVisaType = visaType.trim();
        const cleanedAppNo = applicationNo.trim();
        
        console.log(`[Visa Service] Querying visa.go.kr for ${cleanedPassport} (${cleanedName}) via ${cleanedVisaType}...`);
        
        const result = await checkVisaDirect(
            cleanedPassport,
            cleanedName,
            cleanedBirthDate,
            cleanedVisaType,
            cleanedAppNo
        );
        
        return {
            found: !!result.found,
            latestStatus: result.latestStatus || 'Pending',
            latestStatusKorean: result.latestStatusKorean || '',
            latestDate: result.latestDate || '',
            entryDate: result.entryDate || '',
            entryPurpose: result.entryPurpose || '',
            rejectionReason: result.rejectionReason || '',
            visaExpiry: result.visaExpiry || '',
            visaKind: result.visaKind || '',
            statusOfResidence: result.statusOfResidence || '',
            invitingCompany: result.invitingCompany || '',
            pdfUrl: result.pdfUrl || ''
        };
    } catch (err: any) {
        console.error(`[Visa Service] Error checking status for ${passport}:`, err.message);
        throw err;
    }
}
