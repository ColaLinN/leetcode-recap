export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const error = await response.json();
      message =
        typeof error.detail === "string"
          ? error.detail
          : JSON.stringify(error.detail ?? error);
    } catch {
      /* preserve HTTP message */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
export const jsonBody = (value: unknown) => ({
  method: "POST",
  body: JSON.stringify(value),
});
