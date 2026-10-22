import { Check, Copy, ExternalLink, Globe } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCRM } from "@/lib/crm/store";
import { toast } from "sonner";

/**
 * The real lead funnel for "Website pages": a hosted enquiry form every
 * company can link to or embed — submissions land in Leads instantly and the
 * owner is notified by email.
 */
export function WebsitePanel() {
  const { organizationSlug } = useCRM();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const formUrl = organizationSlug ? `${origin}/lead/${organizationSlug}` : "";
  const embedCode = formUrl
    ? `<iframe src="${formUrl}" title="Plan my trip" style="width:100%;min-height:900px;border:0;border-radius:16px"></iframe>`
    : "";

  const copy = async (value: string, which: "link" | "embed") => {
    try {
      await navigator.clipboard.writeText(value);
      if (which === "link") setCopiedLink(true);
      else setCopiedEmbed(true);
      toast.success(which === "link" ? "Lead form link copied" : "Embed code copied");
      setTimeout(() => {
        setCopiedLink(false);
        setCopiedEmbed(false);
      }, 2000);
    } catch {
      toast.error("Copying is blocked in this browser — select the text manually");
    }
  };

  if (!organizationSlug) {
    return (
      <div className="integration-notice">
        <Globe size={19} />
        <div>
          <strong>Workspace still loading</strong>
          <p>Your shareable lead form appears the moment the workspace finishes loading.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="website-panel">
      <div className="website-panel__card">
        <header>
          <Globe size={18} />
          <div>
            <h3>Your hosted lead form</h3>
            <p>
              One link turns visitors into tracked leads. Every submission becomes a <b>Website
              source</b> lead in your Leads module and your inbox gets an email alert — automatically.
            </p>
          </div>
        </header>

        <div className="website-panel__row">
          <code>{formUrl}</code>
          <div className="website-panel__actions">
            <Button variant="outline" size="sm" onClick={() => void copy(formUrl, "link")}>
              {copiedLink ? <Check size={14} /> : <Copy size={14} />}
              {copiedLink ? "Copied" : "Copy link"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.open(formUrl, "_blank")}>
              <ExternalLink size={14} /> Open
            </Button>
          </div>
        </div>

        <div className="website-panel__row website-panel__row--embed">
          <div>
            <small className="website-panel__hint">Paste this into your website (WordPress, Wix, Shopify — anywhere HTML works):</small>
            <code>{embedCode}</code>
          </div>
          <Button variant="outline" size="sm" onClick={() => void copy(embedCode, "embed")}>
            {copiedEmbed ? <Check size={14} /> : <Copy size={14} />}
            {copiedEmbed ? "Copied" : "Copy embed code"}
          </Button>
        </div>
      </div>

      <div className="integration-notice">
        <Globe size={19} />
        <div>
          <strong>What happens when someone submits</strong>
          <p>
            The enquiry appears in Leads as <b>New</b> with the traveller count, destination and notes
            prefilled. Your admin inbox receives the details, and the customer sees a thank-you screen
            with their reference number.
          </p>
        </div>
      </div>
    </div>
  );
}
