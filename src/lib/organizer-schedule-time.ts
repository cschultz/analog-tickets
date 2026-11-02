/** Explicit UTC editing, independent of the operator's browser zone. */
export function organizerUtcInput(iso: string): string {
  return new Date(iso).toISOString().slice(0, 19);
}

/** Unchanged second-precision fields retain the exact stored timestamp, including
 * microseconds/offset spelling. Browsers may omit a zero seconds segment.
 */
export function organizerUtcValue(value: string, original?: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) throw Error("invalid_utc_date");
  if (original !== undefined) {
    const display = organizerUtcInput(original);
    if (value === display || (display.endsWith(":00") && value === display.slice(0, 16)))
      return original;
  }
  const iso = new Date(value + "Z").toISOString();
  if (organizerUtcInput(iso).slice(0, value.length) !== value) throw Error("invalid_utc_date");
  return iso;
}
