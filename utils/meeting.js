// Placeholder meeting creation utility.
// Replace this with real Google Calendar/Meet or Zoom API integration.
import { v4 as uuidv4 } from 'uuid';

export const createMeetingPlaceholder = async ({ title, startTime, duration }) => {
  // For now, generate a pseudo meeting link and event id.
  const eventId = uuidv4();
  const meetingLink = `https://meet.example.com/${eventId}`;
  return { meetingLink, eventId };
};

export default createMeetingPlaceholder;
