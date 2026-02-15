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
