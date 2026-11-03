/**
 * House style for customer messages.
 *
 * A travel consultant writes: greeting by name, the actual detail, one clear
 * next step, a sign-off. Short enough to read on a phone, warm enough not to
 * sound automated. {name}, {agent} and {company} are filled at insert time.
 */
export type CommsTemplate = {
  name: string;
  channel: "Email" | "WhatsApp" | "Any";
  subject?: string;
  body: string;
};

export const COMMS_TEMPLATES: CommsTemplate[] = [
  {
    name: "Quotation follow-up",
    channel: "Email",
    subject: "Your trip proposal — a quick review",
    body: [
      "Hi {name},",
      "",
      "I wanted to make sure my proposal reached you and to check whether the dates, hotels and pace of the itinerary feel right.",
      "",
      "If you would like a change — a different hotel, an extra day, a later flight — tell me what you have in mind and I will send a revised plan, usually the same day.",
      "",
      "Warm regards,",
      "{agent}",
      "{company}",
    ].join("\n"),
  },
  {
    name: "Booking confirmed",
    channel: "Email",
    subject: "Your booking is confirmed",
    body: [
      "Hi {name},",
      "",
      "Good news — your booking is confirmed. I have attached the confirmation voucher and the day-by-day itinerary.",
      "",
      "Please check the traveller names and dates once and reply to confirm they are correct. I will then send the final documents and the emergency contact for the trip.",
      "",
      "Warm regards,",
      "{agent}",
      "{company}",
    ].join("\n"),
  },
  {
    name: "Payment reminder",
    channel: "Email",
    subject: "Balance payment for your booking",
    body: [
      "Hi {name},",
      "",
      "A gentle reminder that the balance for your trip is due. You can pay by bank transfer or through the payment link in your invoice.",
      "",
      "If you have already paid, please share the transaction reference and I will update the invoice right away. If you would like to split the amount, tell me and we can agree on a date.",
      "",
      "Warm regards,",
      "{agent}",
      "{company}",
    ].join("\n"),
  },
  {
    name: "Documents needed",
    channel: "WhatsApp",
    body: "Hi {name}, to move your visa forward I need clear photos of each traveller's passport first and last page, plus one recent photograph. Once I have them I will submit the application and keep you updated here.",
  },
  {
    name: "Trip check-in",
    channel: "WhatsApp",
    body: "Hi {name}, just checking you have everything for the trip — tickets, visa and hotel voucher are in your email. Safe travels, and message me here any time if something comes up.",
  },
  {
    name: "Thank you & feedback",
    channel: "Email",
    subject: "Welcome back — how was the trip?",
    body: [
      "Hi {name},",
      "",
      "I hope you are back home rested and full of good stories. It would help us a lot to know what worked well and what we could do better next time.",
      "",
      "If a friend is planning a trip, I would be glad to help them too.",
      "",
      "Warm regards,",
      "{agent}",
      "{company}",
    ].join("\n"),
  },
];

/** Replaces the merge fields in a template; never leaves "{name}" on screen. */
export function fillCommsTemplate(
  body: string,
  context: { name?: string | undefined; agent?: string | undefined; company?: string | undefined },
): string {
  // "Priya Mehta" → Priya; "Bali Bliss Escape" stays whole (it is a company).
  const words = (context.name || "there").trim().split(/\s+/).filter(Boolean);
  const first = words.length >= 3 ? words.join(" ") : words[0] || "there";
  return body
    .replaceAll("{name}", first)
    .replaceAll("{agent}", context.agent || "Your travel consultant")
    .replaceAll("{company}", context.company || "our team");
}
