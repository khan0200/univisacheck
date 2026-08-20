import { Client } from 'ssh2';

const conn = new Client();

const checkCommand = `
echo "=== /www/server/cron directory ==="
ls -la /www/server/cron/
for f in /www/server/cron/*; do
  if [ -f "$f" ] && [[ "$f" != *.log ]]; then
    echo "--- File: $f ---"
    cat "$f"
    echo ""
  fi
done

echo "=== aaPanel cron logs (last 50 lines) ==="
tail -n 50 /www/server/cron/*.log 2>/dev/null || true
`;

conn.on('ready', () => {
  conn.exec(checkCommand, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => {
      conn.end();
    });
  });
}).connect({
  host: '178.238.231.210',
  port: 22,
  username: 'root',
  password: 'SalomKorea2026!'
});
