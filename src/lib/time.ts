export function ageHours(isoTime: string): number {
  return Math.max(0, (Date.now() - new Date(isoTime).getTime()) / (1000 * 60 * 60));
}

export function formatAge(isoTime: string): string {
  const hours = ageHours(isoTime);
  if (hours < 24) return `${Math.floor(hours)}h`;

  const days = hours / 24;
  if (days < 7) {
    const wholeDays = Math.floor(days);
    const remHours = Math.floor(hours - wholeDays * 24);
    if (remHours === 0) return `${wholeDays}d`;
    return `${wholeDays}d ${remHours}h`;
  }

  const weeks = days / 7;
  if (weeks < 10) {
    const roundedWeeks = Math.round(weeks * 10) / 10;
    return `${roundedWeeks}w`;
  }

  return `${Math.floor(weeks)}w`;
}

export function formatNotificationAge(isoTime: string): string {
  const ms = Date.now() - new Date(isoTime).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "1M";

  const minutes = Math.floor(ms / (1000 * 60));
  if (minutes < 60) return `${Math.max(1, minutes)}M`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  return formatAge(isoTime);
}
