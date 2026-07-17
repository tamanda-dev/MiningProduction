export function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

export function extractErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (error as any).response?.data;
    if (data) {
      if (typeof data.detail === "string") return data.detail;
      if (typeof data === "string") return data;
      try {
        return Object.entries(data)
          .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
          .join(" · ");
      } catch {
        return "Request failed.";
      }
    }
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
