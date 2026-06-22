// Shared shapes for Dredd's reporters. The `stats` object is owned by the
// TransactionRunner and threaded into every reporter; the `test` object is the
// per-transaction result emitted on the reporter events. Dynamic fields (the
// request/response payloads) stay loosely typed.
export interface ReporterStats {
  tests: number;
  passes: number;
  failures: number;
  errors: number;
  skipped: number;
  start?: Date;
  end?: Date;
  duration?: number;
}

export interface ReporterTest {
  start?: Date | string;
  end?: Date;
  duration?: number;
  startedAt?: number | null;
  title?: string;
  message?: string;
  status?: string;
  request?: any;
  expected?: any;
  actual?: any;
  results?: any;
  errors?: any;
  origin?: any;
}
