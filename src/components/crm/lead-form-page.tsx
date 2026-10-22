import { useEffect, useState } from "react";
import { Compass, Mail, MapPin, Send, User, Phone } from "lucide-react";
import { Route } from "@/routes/lead.$slug";
import { fetchPublicLeadForm, submitPublicLead } from "@/lib/api/modules";
import { errorMessage } from "@/lib/api/client";

type OrgInfo = {
  organization: { name: string; slug: string; supportEmail: string | null };
  token: string;
};

/**
 * The hosted "Plan my trip" form — every travel company shares one link that
 * turns website visitors into real, tracked leads in their CRM.
 */
export function LeadFormPage() {
  const { slug } = Route.useParams();
  const [meta, setMeta] = useState<OrgInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ reference: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Plan my trip — enquiry";
    fetchPublicLeadForm(slug)
      .then(setMeta)
      .catch((err) => setLoadError(errorMessage(err, "This travel desk could not be found.")));
  }, [slug]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const result = await submitPublicLead(slug, {
        name: fd.get("name"),
        email: fd.get("email"),
        phone: fd.get("phone") || undefined,
        destination: fd.get("destination") || undefined,
        travellers: Number(fd.get("travellers")) || 1,
        notes: fd.get("notes") || undefined,
      });
      setSent(result);
    } catch (err) {
      setError(errorMessage(err, "Your enquiry could not be sent. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <div className="lead-form-page">
        <div className="lead-form-card">
          <span className="lead-form-mark">
            <Compass size={24} />
          </span>
          <h1>Form not available</h1>
          <p className="lead-form-sub">{loadError}</p>
        </div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="lead-form-page">
        <div className="lead-form-card">
          <span className="lead-form-mark lead-form-mark--ok">
            <Send size={22} />
          </span>
          <h1>Enquiry received — thank you!</h1>
          <p className="lead-form-sub">{sent.message}</p>
          {sent.reference ? <p className="lead-ref">Your reference: <b>{sent.reference}</b></p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="lead-form-page">
      <div className="lead-form-card">
        <div className="lead-form-head">
          <span className="lead-form-mark">
            <Compass size={24} />
          </span>
          <span className="lead-org-name">{meta?.organization.name ?? "Travel desk"}</span>
        </div>
        <h1>Plan my next trip</h1>
        <p className="lead-form-sub">
          Tell us where you want to go and how many people are travelling — our desk replies within
          one working day.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="lead-form-grid">
            <label>
              <User size={14} /> Full name
              <input name="name" required minLength={2} maxLength={120} placeholder="Aarav Sharma" />
            </label>
            <label>
              <Mail size={14} /> Email
              <input name="email" type="email" required maxLength={160} placeholder="you@example.com" />
            </label>
            <label>
              <Phone size={14} /> Phone / WhatsApp
              <input name="phone" maxLength={30} placeholder="+91 98… (optional)" />
            </label>
            <label>
              <MapPin size={14} /> Destination
              <input name="destination" maxLength={160} placeholder="Bali, 6 nights (optional)" />
            </label>
            <label>
              Travellers
              <select name="travellers" defaultValue="2">
                {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="lead-notes">
              What matters on this trip?
              <textarea
                name="notes"
                maxLength={2000}
                rows={3}
                placeholder="Honeymoon, vegetarian meals, direct flights, budget ₹1.5L…"
              />
            </label>
          </div>
          {error ? <p className="lead-form-error">{error}</p> : null}
          <button type="submit" disabled={busy}>
            <Send size={15} /> {busy ? "Sending…" : "Send enquiry"}
          </button>
        </form>
        <p className="lead-form-foot">
          Your details go straight to {meta?.organization.name ?? "the travel desk"} — never to third
          parties.
          {meta?.organization.supportEmail ? (
            <> Prefer email? Write to {meta.organization.supportEmail}.</>
          ) : null}
        </p>
      </div>
    </div>
  );
}
