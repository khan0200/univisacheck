import { Client } from 'ssh2';

const diagScript = `import { getTursoClient } from '/www/wwwroot/salomkorea/nuxt-app/server/utils/turso.js';
import { checkVisaDirect } from '/www/wwwroot/salomkorea/nuxt-app/server/lib/direct-visa-check.js';

async function diag() {
  const db = await getTursoClient();
  const res = await db.execute({
    sql: "SELECT id, fullname, passport, birthday, visa_type, application_no, status, last_checked, lastchecked FROM students WHERE passport = 'FB1291661' OR passport = 'FB2442582'",
    args: []
  });

  console.log('Students in DB:', res.rows);

  for (const st of res.rows) {
    console.log('\\n--- Checking passport:', st.passport, '---');
    const name = String(st.fullname || '');
    const bday = String(st.birthday || '');
    const visaType = String(st.visa_type || 'Embassy');
    const appNo = String(st.application_no || '');
    console.log({ passport: st.passport, name, bday, visaType, appNo });
    try {
      const result = await checkVisaDirect(st.passport, name, bday, visaType, appNo);
      console.log('Live check result:', result);
    } catch (e) {
      console.error('Check failed:', e);
    }
  }
}

diag().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const writeStream = sftp.createWriteStream('/www/wwwroot/salomkorea/scripts/diag_actual_student.js');
    writeStream.write(diagScript);
    writeStream.end();
    writeStream.on('close', () => {
      conn.exec('export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH; node /www/wwwroot/salomkorea/scripts/diag_actual_student.js', (e, stream) => {
        if (e) throw e;
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', code => {
          conn.end();
        });
      });
    });
  });
}).connect({
  host: '178.238.231.210',
  port: 22,
  username: 'root',
  password: 'SalomKorea2026!'
});
