export function durationLabel(minutes: number): string {
  return minutes < 60 ? minutes + " 分钟" : minutes / 60 + " 小时";
}

export function remainingLabel(seconds: number | null): string {
  if (seconds === null) return "—";
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = String(value % 60).padStart(2, "0");
  return hours > 0
    ? hours + " 小时 " + minutes + " 分 " + secs + " 秒"
    : minutes + " 分 " + secs + " 秒";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "DC 控制服务暂不可用。";
}
