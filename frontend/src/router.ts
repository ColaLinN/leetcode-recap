export type Route = {
  kind: "home" | "chapter" | "problem" | "review" | "notes";
  id?: string;
  chapterId?: string;
  groupId?: string;
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
  const groupId = new URLSearchParams(query ?? "").get("group") ?? undefined;
  return ["chapter", "problem", "review", "notes"].includes(kind)
    ? {
        kind: kind as Route["kind"],
        id,
        chapterId: new URLSearchParams(query ?? "").get("chapter") ?? undefined,
        groupId,
      }
    : { kind: "home", groupId };
};
export const go = (kind: Route["kind"], id?: string, chapterId?: string, groupId = parseRoute().groupId) => {
  const query = new URLSearchParams();
  if (chapterId) query.set("chapter", chapterId);
  if (groupId) query.set("group", groupId);
  window.location.hash =
    (kind === "home"
      ? "#/"
      : `#/${kind}${id ? `/${encodeURIComponent(id)}` : ""}`) + (query.size ? `?${query}` : "");
};
