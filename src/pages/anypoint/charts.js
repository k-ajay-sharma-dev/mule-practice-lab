import { DAY, dateText, timeText } from '../../lab/platform.js'

export const COLORS = { blue: '#0176d3', teal: '#0b827c', violet: '#7f56d9', green: '#2e844a', amber: '#b86e00', red: '#ba0517' }

// Cuts the time before `end` into equal pieces, each [from, to], with the label of its end
export function bucketsOf(end, range, count) {
  const size = range / count
  const ranges = Array.from({ length: count }, (_, i) => [end - range + i * size, end - range + (i + 1) * size])
  return { ranges, labels: ranges.map(([, to]) => (range > DAY ? `${dateText(to).slice(5)} ${timeText(to).slice(0, 5)}` : timeText(to).slice(0, 5))) }
}
