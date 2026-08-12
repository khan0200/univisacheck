/**
 * lib/visa.ts
 *
 * Provides visa status checking logic by reusing the existing scraper in direct-visa-check.js.
 */

// Import direct visa check JS module — no type declarations exist for this
// vanilla JS file, so its exports are cast to `any` explicitly (a bare
// ts-expect-error on the import line doesn't propagate to downstream property
// access on the untyped result). Must stay a real ESM import, not
// require() — this file runs in Nitro's ESM runtime, where `require` is
// undefined.
import * as directVisaCheckModule from './direct-visa-check'
import * as https from 'https'
import * as querystring from 'querystring'
import { URL } from 'url'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const directVisaCheck = directVisaCheckModule as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const checkVisaDirect: (passport: string, fullName: string, birthDate: string, visaType: string, applicationNo: string) => Promise<any> = directVisaCheck.checkVisaDirect
const getSession: (forceRefresh?: boolean) => Promise<string> = directVisaCheck.getSession

export interface VisaStatusInfo {
  found: boolean
  latestStatus: string
  latestStatusKorean: string
  latestDate: string
  entryDate: string
  entryPurpose: string
  rejectionReason: string
  visaExpiry: string
  visaKind: string
  statusOfResidence: string
  invitingCompany: string
  pdfUrl: string
  previousRejectionReason?: string
}

/**
 * Checks a student's visa status directly from the official visa.go.kr portal.
 *
 * @param passport - Passport number (e.g. "FA1234567")
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
    const cleanedPassport = passport.toUpperCase().trim()
    if (cleanedPassport === 'MOCK-APP' || cleanedPassport === 'MOCKAPP') {
      return {
        found: true,
        latestStatus: 'Approved',
        latestStatusKorean: 'Approved',
        latestDate: new Date().toISOString().split('T')[0] || '',
        rejectionReason: '',
        pdfUrl: '',
        entryDate: '',
        entryPurpose: '',
        visaExpiry: '',
        visaKind: '',
        statusOfResidence: '',
        invitingCompany: ''
      }
    }
    if (cleanedPassport === 'MOCK-CAN' || cleanedPassport === 'MOCKCAN') {
      return {
        found: true,
        latestStatus: 'Reject',
        latestStatusKorean: 'Rejected',
        latestDate: new Date().toISOString().split('T')[0] || '',
        rejectionReason: 'Simulation Cancelled',
        pdfUrl: '',
        entryDate: '',
        entryPurpose: '',
        visaExpiry: '',
        visaKind: '',
        statusOfResidence: '',
        invitingCompany: ''
      }
    }
    const cleanedName = fullName.toUpperCase().trim()
    const cleanedBirthDate = birthDate.trim()
    const cleanedVisaType = visaType.trim()
    const cleanedAppNo = applicationNo.trim()

    console.log(`[Visa Service] Querying visa.go.kr for ${cleanedPassport} (${cleanedName}) via ${cleanedVisaType}...`)

    const result = await checkVisaDirect(
      cleanedPassport,
      cleanedName,
      cleanedBirthDate,
      cleanedVisaType,
      cleanedAppNo
    )

    let previousRejectionReason = ''
    if (result.records && result.records.length > 1) {
      const prev = result.records[1]
      if (prev && prev.rejectionReason) {
        previousRejectionReason = prev.rejectionReason
      }
    }

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
      pdfUrl: result.pdfUrl || '',
      previousRejectionReason
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error(`[Visa Service] Error checking status for ${passport}:`, err.message)
    throw err
  }
}

/**
 * Downloads the official student visa certificate PDF from visa.go.kr.
 */
export async function downloadStudentVisaPdf(
  passport: string,
  fullName: string,
  birthDate: string,
  visaType: string,
  applicationNo: string,
  pdfUrl: string
): Promise<{ filename: string, buffer: Buffer }> {
  const cleanedPassport = passport.toUpperCase().trim()
  const cleanedName = fullName.toUpperCase().trim()
  const cleanedBirthDate = birthDate.trim()
  const birthYmd = cleanedBirthDate.replace(/-/g, '')
  const cleanedVisaType = visaType.trim()
  const cleanedAppNo = applicationNo.trim()

  let evSeq: string
  let invSeq: string
  let applNo: string
  let ccviApplNo: string = ''
  let ccviSeq: string = ''
  let cookies: string | undefined

  const isEVisa = (cleanedVisaType === 'Regional' || cleanedVisaType === 'E-Visa') && cleanedAppNo
  const isRegional = (cleanedVisaType === 'Regional')

  if (pdfUrl) {
    const parsedTarget = new URL(pdfUrl)
    evSeq = parsedTarget.searchParams.get('evSeq') || ''
    invSeq = parsedTarget.searchParams.get('invSeq') || '0'
    applNo = parsedTarget.searchParams.get('applNo') || ''
    ccviApplNo = parsedTarget.searchParams.get('ccviApplNo') || ''
    ccviSeq = parsedTarget.searchParams.get('ccviSeq') || ''
    cookies = await getSession(true)
  }

  // If pdfUrl was not passed OR if this is a Regional visa missing ccviSeq/ccviApplNo, perform a live check to get fresh params
  if (!pdfUrl || (isRegional && (!ccviSeq || !ccviApplNo))) {
    const directResult = await checkVisaDirect(cleanedPassport, cleanedName, cleanedBirthDate, cleanedVisaType, cleanedAppNo)
    if (!directResult.found || !directResult.pdfUrl) {
      throw new Error('No visa record or PDF download parameters found on visa.go.kr.')
    }
    const resultUrl = new URL(directResult.pdfUrl)
    evSeq = resultUrl.searchParams.get('evSeq') || ''
    invSeq = resultUrl.searchParams.get('invSeq') || '0'
    applNo = resultUrl.searchParams.get('applNo') || ''
    ccviApplNo = resultUrl.searchParams.get('ccviApplNo') || ''
    ccviSeq = resultUrl.searchParams.get('ccviSeq') || ''
    cookies = await getSession()
  }

  let bodyParams: Record<string, string>
  if (isEVisa) {
    bodyParams = {
      pRADIOSEARCH: 'gb01',
      sINVITEE_SEQ: cleanedAppNo,
      ssINVITEE_SEQ: cleanedAppNo,
      sPASS_NO: cleanedPassport,
      sEK_NM: cleanedName,
      sFROMDATE: cleanedBirthDate,
      sMainPopUpGB: 'main'
    }
  } else if (isRegional) {
    bodyParams = {
      pRADIOSEARCH: 'gb02',
      sBUSI_GB_gb02: 'INVITEE_SEQ_gb02',
      sPASS_NO: cleanedPassport,
      sINVITEE_SEQ: cleanedAppNo,
      ssINVITEE_SEQ: cleanedAppNo,
      ssBUSI_GBNO_gb02: cleanedAppNo,
      sEK_NM: cleanedName,
      sFROMDATE: cleanedBirthDate,
      sMainPopUpGB: 'main'
    }
  } else {
    bodyParams = {
      pRADIOSEARCH: 'gb03',
      sBUSI_GB: 'PASS_NO',
      sBUSI_GBNO: cleanedPassport,
      ssBUSI_GBNO: cleanedPassport,
      sEK_NM: cleanedName,
      sFROMDATE: cleanedBirthDate,
      sMainPopUpGB: 'main'
    }
  }

  // Pre-populate the session
  const checkBody = querystring.stringify(bodyParams)

  const checkOptions = {
    hostname: 'www.visa.go.kr',
    port: 443,
    path: '/openPage.do?MENU_ID=10301',
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://www.visa.go.kr/openPage.do?MENU_ID=10301',
      'Origin': 'https://www.visa.go.kr',
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': String(Buffer.byteLength(checkBody)),
      'Cookie': cookies
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checkRes: any = await new Promise((resolve, reject) => {
    const req = https.request(checkOptions, (res) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chunks: any[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers }))
    })
    req.on('error', reject)
    req.write(checkBody)
    req.end()
  })

  let downloadCookies = cookies
  if (checkRes.headers['set-cookie']) {
    downloadCookies = checkRes.headers['set-cookie'].map((c: string) => c.split(';')[0]).join('; ')
  }

  // Send POST to print servlet to download the PDF
  let printParams: Record<string, string> = {}
  let printPath = '/biz/ap/ev/selectElectronicVisaPrint3.do'

  if (isRegional) {
    printParams = {
      PARAM_CCVI_SEQ: ccviSeq,
      INVITEE_SEQ: invSeq,
      PARAM_CCVI_APPL_NO: ccviApplNo
    }
    printPath = '/biz/si/pr/selectVisaPrintOnOff.do'
  } else {
    printParams = {
      sBUSI_GB: 'PASS_NO',
      sBUSI_GBNO: cleanedPassport,
      EV_SEQ: evSeq,
      INVITEE_SEQ: invSeq,
      APPL_NO: applNo,
      ENG_NM: cleanedName,
      BIRTH_YMD: birthYmd,
      IN_PHOTO: '/biz/ap/ev/selectInviteeXvarmImage.do',
      TRAN_TYPE: 'ComSubmit',
      SE_FLAG_YN: '',
      LANG_TYPE: 'KO',
      CMM_TEST_VAL: 'test'
    }
  }

  const printBody = querystring.stringify(printParams)

  const printOptions = {
    hostname: 'www.visa.go.kr',
    port: 443,
    path: printPath,
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://www.visa.go.kr/openPage.do?MENU_ID=10301',
      'Origin': 'https://www.visa.go.kr',
      'Accept': 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.9',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': String(Buffer.byteLength(printBody)),
      'Cookie': downloadCookies
    }
  }

  const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
    const printReq = https.request(printOptions, (printRes) => {
      const contentType = printRes.headers['content-type'] || ''
      const statusCode = printRes.statusCode

      if (statusCode !== 200) {
        printRes.resume()
        reject(new Error(`visa.go.kr print service returned HTTP ${statusCode}.`))
        return
      }

      if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
        let body = ''
        printRes.on('data', (c) => {
          body += c
        })
        printRes.on('end', () => {
          console.error('[Visa PDF] Printed error body:', body)
          reject(new Error('visa.go.kr did not return a PDF file.'))
        })
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chunks: any[] = []
      printRes.on('data', c => chunks.push(c))
      printRes.on('end', () => resolve(Buffer.concat(chunks)))
    })

    printReq.on('error', reject)
    printReq.write(printBody)
    printReq.end()
  })

  return {
    filename: `visa_${cleanedPassport}.pdf`,
    buffer: pdfBuffer
  }
}
