import { Redirect } from 'expo-router';

// The calendar now lives at the top of the events page; this route only
// keeps old links and pushes working.
export default function CalendarScreen() {
  return <Redirect href="/events" />;
}
