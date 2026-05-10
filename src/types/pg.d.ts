declare module 'pg' {
  export type QueryResultRow = Record<string, unknown>;

  export interface QueryResult<T extends QueryResultRow = QueryResultRow> {
    rows: T[];
    rowCount: number | null;
  }

  export interface PoolClient {
    query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: readonly unknown[]
    ): Promise<QueryResult<T>>;
    release(): void;
  }

  export interface PoolConfig {
    connectionString?: string;
    max?: number;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: readonly unknown[]
    ): Promise<QueryResult<T>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
}
