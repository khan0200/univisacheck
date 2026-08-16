import { getTursoClient, type SqlStatement, type QueryResult } from '../utils/turso'

type InStatement = string | SqlStatement | { sql: string, args?: unknown[] | Record<string, unknown> }

const db = {
  execute: async (stmt: InStatement, args?: unknown[]): Promise<QueryResult> => (await getTursoClient()).execute(stmt as SqlStatement, args),
  batch: async (stmts: InStatement[]): Promise<QueryResult[]> => (await getTursoClient()).batch(stmts as SqlStatement[])
}

export default db
