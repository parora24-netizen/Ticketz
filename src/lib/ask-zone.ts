/** An ask's zone: its cases' zone ("Several" across zones), else the zone its title names ("… on Data Hub › Screens"). */
export function askZone(fromCases: Set<string> | undefined, title: string): string {
  if (fromCases?.size) return fromCases.size === 1 ? [...fromCases][0] : 'Several'
  return /\bon ([A-Z][A-Za-z ]+?) [›>]/.exec(title)?.[1] ?? ''
}
