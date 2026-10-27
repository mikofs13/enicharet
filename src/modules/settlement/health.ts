export const WORKER_STALE_MS = 30_000;
export const WORK_OVERDUE_MS = 60_000;
export const REPEATED_FAILURE_ATTEMPTS = 3;

type HealthCounts = { overdueJobs: number; missingJobs: number; delayedNotifications: number; repeatedJobFailures: number; repeatedDeliveryFailures: number };
export function operationsHealth(now: Date, workers: { name: string; lastSeenAt: Date }[], counts: HealthCounts) {
  const workerStates = (["settlement", "notifications"] as const).map(name => {
    const worker = workers.find(row => row.name === name);
    return { name, state: !worker ? "missing" : now.getTime() - worker.lastSeenAt.getTime() > WORKER_STALE_MS ? "stale" : "recent", lastSeenAt: worker?.lastSeenAt.toISOString() ?? null };
  });
  const alerts: { code: string; message: string; count: number }[] = [];
  for (const worker of workerStates) if (worker.state !== "recent") alerts.push({ code: `${worker.name.toUpperCase()}_WORKER_${worker.state.toUpperCase()}`, message: worker.name === "settlement" ? "Auction worker has no recent poll. Start or check the auction worker." : "Notification worker has no recent poll. Start or check the notification worker.", count: 1 });
  if (counts.overdueJobs) alerts.push({ code: "JOBS_OVERDUE", message: "Auction jobs are at least 60 seconds past their scheduled attempt.", count: counts.overdueJobs });
  if (counts.missingJobs) alerts.push({ code: "JOBS_MISSING", message: "Closed published auctions have no processing job. Check the auction worker’s schedule discovery.", count: counts.missingJobs });
  if (counts.delayedNotifications) alerts.push({ code: "DELIVERIES_OVERDUE", message: "Notification deliveries are at least 60 seconds past their scheduled attempt.", count: counts.delayedNotifications });
  if (counts.repeatedJobFailures) alerts.push({ code: "JOBS_REPEATED_FAILURE", message: "Auction jobs have failed at least three times. Investigate the cause before retrying.", count: counts.repeatedJobFailures });
  if (counts.repeatedDeliveryFailures) alerts.push({ code: "DELIVERIES_REPEATED_FAILURE", message: "Notification deliveries have failed at least three times. Investigate the cause before retrying.", count: counts.repeatedDeliveryFailures });
  return { hasAlerts: alerts.length > 0, alerts, workers: workerStates };
}
