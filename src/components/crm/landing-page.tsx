import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  Compass,
  IndianRupee,
  LifeBuoy,
  ListChecks,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchPlans, type PlanDto } from "@/lib/api/modules";
import { errorMessage } from "@/lib/api/client";

/**
 * The public marketing page.
 *
 * One page that tells a travel business owner what this product is, shows the
 * plans they can buy, and hands them straight to sign-up. This is the same
 * component for guests on "/" (the index) and on "/landing".
 */
export function LandingPage() {
  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [plansError, setPlansError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans()
      .then((data) => {
        setPlans(data);
        setPlansError(data.length ? null : "Plans are being updated — pick one at sign-up.");
      })
      .catch((error) => {
        setPlans([]);
        setPlansError(errorMessage(error, "Plans could not load — pick one at sign-up."));
      });
  }, []);

  // Guests land here on the index route, whose head says "Today" — correct the
  // document title so the landing page markets itself properly.
  useEffect(() => {
    document.title = "Traveldesk — Run your travel business from one calm place";
  }, []);

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <div className="login-brand">
          <span className="login-brand__mark">
            <Compass size={20} />
          </span>
          <span className="login-brand__word">
            travel<span>desk</span>
          </span>
        </div>
        <nav className="landing-nav__links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Plans</a>
        </nav>
        <div className="landing-nav__actions">
          <Link to="/login">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link to="/signup">
            <Button size="sm">
              Start now <ArrowRight />
            </Button>
          </Link>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <span className="badge badge-sun">
            <Sparkles size={14} /> The CRM built for travel businesses
          </span>
          <h1>
            Stop running your travel business on spreadsheets.
            <br />
            Run it from one calm place.
          </h1>
          <p>
            Enquiries, quotations, bookings, visas, invoices and your whole team — connected, in
            plain language, on one dashboard. You see what needs you today, and everything else
            answers itself.
          </p>
          <div className="landing-hero__actions">
            <Link to="/signup">
              <Button size="lg">
                Create your workspace <ArrowRight />
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" size="lg">
                Sign in
              </Button>
            </Link>
          </div>
          <ul className="landing-hero__points">
            <li>
              <BadgeCheck size={14} /> 14-day free trial on every plan
            </li>
            <li>
              <BadgeCheck size={14} /> No card needed at sign-up
            </li>
            <li>
              <BadgeCheck size={14} /> Your data stays yours — always exportable
            </li>
          </ul>
        </section>

        <section className="landing-features" id="features">
          {[
            {
              icon: <ListChecks size={18} />,
              title: "One list of everything that needs you",
              body: "Enquiries to answer, invoices to chase, trips to prepare — ranked, dated, done.",
            },
            {
              icon: <Wallet size={18} />,
              title: "Money you can actually trust",
              body: "GST invoices as PDF, Razorpay payment links, cash tracked — revenue visible city-wise every single day.",
            },
            {
              icon: <Users size={18} />,
              title: "The whole team on the same page",
              body: "Owners, agents and accountants see exactly what their role needs — nothing more.",
            },
            {
              icon: <BrainCircuit size={18} />,
              title: "AI that does the drafting",
              body: "Trip itineraries and customer replies, ready in one click — you just review and send.",
            },
            {
              icon: <ShieldCheck size={18} />,
              title: "Safe by design",
              body: "Every action is audited. Sensitive details are masked unless you open them.",
            },
            {
              icon: <LifeBuoy size={18} />,
              title: "Made for real travel desks",
              body: "Fast on old laptops and slow networks; every action is saved the moment you make it.",
            },
          ].map((feature) => (
            <div key={feature.title} className="landing-feature">
              <span className="landing-feature__icon">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </div>
          ))}
        </section>

        <section className="landing-how" id="how">
          <h2>Three steps. That is all.</h2>
          <ol className="landing-how__steps">
            <li>
              <span className="landing-how__num">1</span>
              <h3>Create your workspace</h3>
              <p>Sign up with your company name. Your team joins you in minutes.</p>
            </li>
            <li>
              <span className="landing-how__num">2</span>
              <h3>Pick a plan</h3>
              <p>Start small and grow. Change or cancel your plan any time from settings.</p>
            </li>
            <li>
              <span className="landing-how__num">3</span>
              <h3>Run your business</h3>
              <p>Bookings, invoices, visas and your numbers — all on your dashboard.</p>
            </li>
          </ol>
        </section>

        <section className="landing-pricing" id="pricing">
          <div className="landing-pricing__head">
            <IndianRupee size={20} />
            <h2>Simple plans. Simple pricing.</h2>
            <p>Every plan includes the full product. Bigger plans just give you more people, branches and bookings.</p>
          </div>
          {plansError && <p className="landing-pricing__note" role="status">{plansError}</p>}
          <div className={`landing-pricing__grid ${plans.length ? "" : "is-empty"}`}>
            {plans.map((plan) => (
              <div key={plan.key} className={`landing-plan ${plan.popular ? "is-popular" : ""}`}>
                <h3>{plan.name}</h3>
                <p className="landing-plan__price">
                  <b>{plan.currency}</b>
                  {plan.priceMonthly.toLocaleString("en-IN")}
                  <span>/month</span>
                </p>
                <ul>
                  {(plan.features ?? []).map((feature) => (
                    <li key={feature}>
                      <BadgeCheck size={14} /> {feature}
                    </li>
                  ))}
                </ul>
                <Link to="/signup" className="landing-plan__cta">
                  <Button variant={plan.popular ? "default" : "outline"} className="w-full">
                    Choose {plan.name}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="login-brand">
          <span className="login-brand__mark">
            <Compass size={18} />
          </span>
          <span className="login-brand__word">
            travel<span>desk</span>
          </span>
        </div>
        <p>Built for travel businesses. Made working simpler.</p>
        <div className="landing-footer__links">
          <Link to="/login">Sign in</Link>
          <Link to="/signup">Create workspace</Link>
        </div>
      </footer>
    </div>
  );
}
