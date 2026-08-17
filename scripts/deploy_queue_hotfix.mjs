import { Client } from 'ssh2'
import { readFile } from 'node:fs/promises'

const localRoot = new URL('../nuxt-app/', import.meta.url)
const files = [
  'server/api/jobs/worker.post.ts',
  'server/api/jobs/index.post.ts',
  'server/api/jobs/active.get.ts',
  'server/api/jobs/direct.post.ts',
  'server/lib/direct-visa-check.js',
  'server/lib/turso.ts',
  'server/database/schema.ts',
  'server/utils/global-telegram.ts',
  'server/utils/processing-notifier.ts',
  'app/composables/useRealtimeSync.ts',
  'app/composables/useVisaCheck.ts',
  'app/pages/cabinet.vue'
]

const conn = new Client()

async function upload(sftp, relativePath) {
  const content = await readFile(new URL(relativePath, localRoot))
  const remotePath = `/www/wwwroot/salomkorea/nuxt-app/${relativePath}`
  await new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(remotePath)
    stream.on('error', reject)
    stream.on('close', resolve)
    stream.end(content)
  })
}

conn.on('ready', () => {
  conn.sftp(async (sftpError, sftp) => {
    if (sftpError) throw sftpError
    try {
      for (const file of files) {
        await upload(sftp, file)
        console.log(`Uploaded ${file}`)
      }

      const command = [
        'export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH',
        'cd /www/wwwroot/salomkorea/nuxt-app',
        'npm run build',
        'pm2 reload salomkorea --update-env'
      ].join(' && ')
      conn.exec(command, (execError, stream) => {
        if (execError) throw execError
        stream.on('data', data => process.stdout.write(data.toString()))
        stream.stderr.on('data', data => process.stderr.write(data.toString()))
        stream.on('close', code => {
          console.log(`Remote deployment exited with code ${code}`)
          conn.end()
          process.exitCode = code || 0
        })
      })
    } catch (error) {
      console.error(error)
      conn.end()
      process.exitCode = 1
    }
  })
}).on('error', error => {
  console.error(error)
  process.exitCode = 1
}).connect({
  host: '178.238.231.210',
  port: 22,
  username: 'root',
  password: 'SalomKorea2026!'
})
