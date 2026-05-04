export function getChannelColor(ch: number): string {
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7']
  return colors[ch % colors.length]
}
