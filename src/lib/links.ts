/** A sprint's page by its name, e.g. /sprints/T1 (names are unique; /sprints/<id> still works). */
export const sprintHref = (s: { name: string }) => `/sprints/${encodeURIComponent(s.name)}`
