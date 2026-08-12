import { createClient } from '@libsql/client'
import config from '../../../turso.config.js'

async function run() {
  const client = createClient({ url: config.TURSO_DATABASE_URL, authToken: config.TURSO_AUTH_TOKEN })

  const reason = `귀하의 비자신청에 대한 불허사유는 다음과 같습니다 :
학력입증서류 전체가 스캔되어 있지 않는 건(미얀마의 경우 미얀마어로 된 학위증 없음, 베트남 외교부 인증 없고 일부만 스캔)이 계속 확인되어 학교에서 재점검 요청드립니다. 학력서류 전체를 순서대로 스캔해 주시기 바랍니다. 해당 서류는 "(보완)학력입증서류"로 파일명 부탁드립니다.`

  const apiResponseObj = {
    found: true,
    latestStatus: 'PENDING SUPPLEMENT',
    latestStatusKorean: '보완요청',
    latestDate: '2026-07-27',
    entryDate: '',
    entryPurpose: '석사유학(D-2-3)',
    rejectionReason: reason,
    visaExpiry: '',
    visaKind: '',
    statusOfResidence: '석사유학(D-2-3)',
    invitingCompany: '충북대학교',
    pdfUrl: '',
    previousRejectionReason: ''
  }

  const res = await client.execute({
    sql: 'UPDATE students SET rejectReason = ?, pdfUrl = ?, apiResponse = ? WHERE passport = ?',
    args: [reason, '', JSON.stringify(apiResponseObj), 'FB2372964']
  })
  console.log('Update result:', res)
}

run().catch(console.error)
