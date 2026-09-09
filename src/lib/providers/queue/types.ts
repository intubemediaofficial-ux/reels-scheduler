export type PublishJobPayload = { publishJobId: string };
export type HealthCheckJobPayload = { socialAccountId: string };
export type MediaInspectJobPayload = { mediaAssetId: string };

export interface JobQueue {
  enqueuePublish(payload: PublishJobPayload, opts: { runAt: Date; jobId: string }): Promise<void>;
  cancelPublish(jobId: string): Promise<void>;
  enqueueHealthCheck(payload: HealthCheckJobPayload): Promise<void>;
  enqueueMediaInspect(payload: MediaInspectJobPayload): Promise<void>;
}
