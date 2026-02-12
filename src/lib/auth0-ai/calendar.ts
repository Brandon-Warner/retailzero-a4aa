export interface CalendarEventDetails {
  summary: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
}

export interface CalendarEventResult {
  eventId: string;
  htmlLink: string;
  summary: string;
  start: string;
}

/**
 * Create an event on the user's Google Calendar.
 * Uses GOOGLE_CALENDAR_ID env var if set, otherwise falls back to "primary".
 * Requires a valid Google OAuth2 access token with calendar write scope.
 */
export async function createCalendarEvent(
  accessToken: string,
  event: CalendarEventDetails
): Promise<CalendarEventResult> {
  const calendarId = encodeURIComponent(
    process.env.GOOGLE_CALENDAR_ID || "primary"
  );
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.startDateTime },
        end: { dateTime: event.endDateTime },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${body}`);
  }

  const data = await res.json();
  return {
    eventId: data.id,
    htmlLink: data.htmlLink,
    summary: data.summary,
    start: data.start?.dateTime ?? data.start?.date,
  };
}
