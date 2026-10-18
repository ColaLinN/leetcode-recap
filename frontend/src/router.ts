export type Route = {
  kind: "home" | "chapter" | "problem" | "review" | "notes";
  id?: string;
  chapterId?: string;
  groupId?: string;
  part?: string;
};
export const parseRoute = (): Route => {
  const [path, query] = window.location.hash.replace(/^#\/?/, "").split("?");
  const [kind, rawId] = path.split("/");
  let id = rawId ?? "";
  try {
    id = decodeURIComponent(id);
  } catch {
    /* An invalid URL must not take down the app. */
  }
  const params = new URLSearchParams(query ?? "");
  const groupId = params.get("group") ?? undefined;
  const part = params.get("part") ?? "";
  return ["chapter", "problem", "review", "notes"].includes(kind)
    ? {
        kind: kind as Route["kind"],
        id,
        chapterId: params.get("chapter") ?? undefined,
        groupId,
      }
    : { kind: "home", groupId, part: ["data-structures", "algorithms"].includes(part) ? part : undefined };
};
export const routeHref = ({ kind, id, chapterId, groupId, part }: Route) => {
  const query = new URLSearchParams();
  if (chapterId) query.set("chapter", chapterId);
  if (groupId) query.set("group", groupId);
  if (kind === "home" && part) query.set("part", part);
  return (
    (kind === "home"
      ? "#/"
      : `#/${kind}${id ? `/${encodeURIComponent(id)}` : ""}`) + (query.size ? `?${query}` : "")
  );
};
export const go = (kind: Route["kind"], id?: string, chapterId?: string, groupId = parseRoute().groupId, part?: string) => {
  window.location.hash = routeHref({ kind, id, chapterId, groupId, part });
};
