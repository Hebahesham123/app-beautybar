/**
 * Parse a fetch Response as JSON. If the server returns HTML (e.g. error page),
 * avoid "Unexpected token '<'" and throw a clear error instead.
 */
export async function parseJsonResponse<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("<")) {
    throw new Error(
      res.ok
        ? "Server returned HTML instead of JSON."
        : res.status === 404
          ? "Page not found (404). Use the same URL as the app—e.g. if the app is at http://localhost:3003, open that exact address (not 3000 or 3001)."
          : `Server error (${res.status}). Check the terminal where npm run dev is running for the real error.`
    );
  }
  try {
    return (trimmed ? JSON.parse(text) : {}) as T;
  } catch {
    throw new Error(`Server returned invalid JSON. Check the terminal for errors.`);
  }
}
