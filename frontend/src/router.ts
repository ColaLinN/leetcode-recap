export type Route = {
  kind: "home" | "chapter" | "problem" | "review" | "notes";
  id?: string;
  chapterId?: string;
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
  return ["chapter", "problem", "review", "notes"].includes(kind)
    ? {
        kind: kind as Route["kind"],
        id,
        chapterId: new URLSearchParams(query ?? "").get("chapter") ?? undefined,
      }
    : { kind: "home" };
};
export const go = (kind: Route["kind"], id?: string, chapterId?: string) => {
  window.location.hash =
    kind === "home"
      ? "#/"
      : `#/${kind}${id ? `/${encodeURIComponent(id)}` : ""}${chapterId ? `?chapter=${encodeURIComponent(chapterId)}` : ""}`;
};
