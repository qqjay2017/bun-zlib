import type { ExportResult } from './export-manager';

export type ExportJobStatus = 'running' | 'done' | 'error';

export interface ExportJob {
  jobId: string;
  status: ExportJobStatus;
  createdAt: number;
  updatedAt: number;
  result?: ExportResult;
  error?: string;
}

class ExportJobManager {
  private jobs = new Map<string, ExportJob>();

  start(run: () => Promise<ExportResult>): ExportJob {
    const now = Date.now();
    const job: ExportJob = {
      jobId: `export_${now}_${Math.random().toString(36).slice(2, 8)}`,
      status: 'running',
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(job.jobId, job);

    void run()
      .then((result) => {
        job.status = 'done';
        job.result = result;
        job.updatedAt = Date.now();
      })
      .catch((error) => {
        job.status = 'error';
        job.error = error instanceof Error ? error.message : '导出失败';
        job.updatedAt = Date.now();
      });

    return job;
  }

  get(jobId: string): ExportJob | undefined {
    return this.jobs.get(jobId);
  }
}

export const exportJobManager = new ExportJobManager();
