/** Browser-only door request. A lost POST response never proves admission failed. */
import {
  checkInTransportFailure,
  readCheckInResponse,
  type BoxOfficeResult,
} from "@/lib/box-office-core";

export async function submitDoorCheckInRequest(
  passCode: string,
  token: string,
  signal: AbortSignal,
  send: typeof fetch = fetch,
): Promise<BoxOfficeResult> {
  try {
    const response = await send("/api/public/check-in-ticket", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ passCode }),
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return readCheckInResponse(response.status, body);
  } catch {
    return checkInTransportFailure(true);
  }
}
