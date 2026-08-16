import { getTursoClient, type SqlStatement } from '../utils/turso'

type InStatement = string | SqlStatement | { sql: string; args?: any }

const db = {
  execute: async (stmt: InStatement, args?: any[]) => (await getTursoClient()).execute(stmt as any, args),
  batch: async (stmts: InStatement[]) => (await getTursoClient()).batch(stmts as any)
}

export default db
