export const ROUTE_TYPE_COLOR_MAP: Record<number, string> = {
  0: "#0EA5E9",
  1: "#8B5CF6",
  2: "#6366F1",
  3: "#1D4ED8",
  4: "#14B8A6",
  5: "#D97706",
  6: "#DB2777",
  7: "#9333EA",
  11: "#7C3AED",
  12: "#0891B2",
}

export function getRouteTypeColor(routeType: number): string {
  return ROUTE_TYPE_COLOR_MAP[routeType] ?? "#334155"
}
