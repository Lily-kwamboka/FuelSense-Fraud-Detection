import React, { useEffect } from 'react';
import './LandingPage.css';

const DEMO_HREF = 'mailto:hello@mafutasalama.co.ke?subject=Book%20a%20FuelSense%20Demo';

const pains = [
  'Delivery variance appears after the truck has already left.',
  'Manual reconciliation hides losses until the monthly report.',
  'Pump-vs-dip checks live in notebooks and spreadsheets.',
  'Managers hear about fraud late, after stock is already gone.',
  'Weak audit trails make disputes slow and expensive.',
];

const steps = [
  {
    title: 'Connect tank readings',
    body: 'Use ATG and tank data to keep every station visible from one operating screen.',
  },
  {
    title: 'Capture movement',
    body: 'Record deliveries, pump sales, shifts, and dip checks without losing the timeline.',
  },
  {
    title: 'Reconcile stock',
    body: 'Compare expected stock against measured stock and classify the variance.',
  },
  {
    title: 'Alert decision makers',
    body: 'Notify managers when a delivery, tank, or station crosses the risk threshold.',
  },
];

const features = [
  'Live tank dashboard',
  'Delivery reconciliation',
  'Pump-vs-dip checks',
  'Alerts and audit logs',
  'Multi-station controls',
  'Reports for operators',
];

const plans = [
  {
    name: 'Starter',
    price: 'KES 8,000',
    cadence: '/month',
    detail: 'Up to 1 station · 5 tanks',
    features: ['1 station', 'Up to 4 tanks', 'Email alerts', 'PDF reports', 'Email support'],
    cta: 'Request access',
  },
  {
    name: 'Professional',
    price: 'KES 18,000',
    cadence: '/month',
    detail: 'Up to 5 stations · 20 tanks',
    features: ['Up to 5 stations', 'Unlimited tanks', 'Audit log', 'Priority support', 'CSV exports'],
    cta: 'Book demo',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: '',
    detail: 'Unlimited stations · Unlimited tanks',
    features: ['Unlimited stations', 'Unlimited tanks', 'Dedicated support', 'Custom integrations', 'SLA guarantee', 'On-site training', 'Custom reporting'],
    cta: 'Talk to sales',
  },
];

const team = [
  {
    image: '/bernice.jpeg',
    name: 'Bernice Wakarindi',
    role: 'System Engineer',
  },
  {
    image: '/lillian.jpeg',
    name: 'Lillian Kwamboka',
    role: 'Product Designer, Sales & Marketing',
  },
];

function LandingPage({ onLoginClick, demoHref = DEMO_HREF }) {
  const goTo = (id) => {
    const section = document.getElementById(id);
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Scroll-reveal: add .is-visible when element enters viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Public navigation">
        <button className="landing-brand" type="button" onClick={() => goTo('top')}>
          <span className="landing-brand-mark" aria-hidden="true">F</span>
          <span>FuelSense</span>
        </button>
        <div className="landing-nav-links">
          <button type="button" onClick={() => goTo('how')}>How It Works</button>
          <button type="button" onClick={() => goTo('pricing')}>Pricing</button>
          <button type="button" onClick={() => goTo('team')}>Team</button>
          <a href={demoHref}>Book Demo</a>
          <button className="landing-login" type="button" onClick={onLoginClick}>Login</button>
        </div>
      </nav>

      <section className="landing-hero" id="top">
        {/* Atmospheric glow orbs */}
        <div className="landing-hero-orb" aria-hidden="true" />
        <div className="landing-hero-orb landing-hero-orb--secondary" aria-hidden="true" />
        <DashboardScene />
        <div className="landing-hero-shade" />
        <div className="landing-hero-copy">
          <div className="landing-eyebrow">Fuel operations intelligence</div>
          <h1>FuelSense</h1>
          <p className="landing-hero-line">Stop fuel loss before it becomes a report.</p>
          <p className="landing-hero-sub">
            Real-time tank monitoring, delivery reconciliation, pump-vs-dip checks,
            alerts, and audit trails for serious fuel station operators.
          </p>
          <div className="landing-actions">
            <a className="landing-primary landing-primary--shimmer" href={demoHref}>Book Demo</a>
            <button className="landing-secondary" type="button" onClick={onLoginClick}>
              Customer Login
            </button>
          </div>
        </div>
        {/* Scroll indicator */}
        <div className="landing-hero-scroll" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M5 8l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      <section className="landing-section landing-pain-section" id="pain">
        <div className="landing-section-heading reveal">
          <span>Why teams need it</span>
          <h2>Fuel loss rarely announces itself.</h2>
          <p>
            FuelSense is built for operators who need to know what happened,
            when it happened, and who needs to act next.
          </p>
        </div>
        <div className="landing-pain-grid">
          {pains.map((pain, i) => (
            <div
              className="landing-pain-card reveal"
              key={pain}
              style={{ transitionDelay: `${i * 0.08}s` }}
            >
              <span className="landing-pain-icon" aria-hidden="true">⚠</span>
              <p>{pain}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section landing-how-section" id="how">
        <div className="landing-section-heading reveal">
          <span>How it works</span>
          <h2>From readings to action in four steps.</h2>
        </div>
        <div className="landing-step-grid">
          {steps.map((step, index) => (
            <article
              className="landing-step reveal"
              key={step.title}
              style={{ transitionDelay: `${index * 0.1}s` }}
            >
              <div className="landing-step-number">{String(index + 1).padStart(2, '0')}</div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-features-section">
        <div className="landing-section-heading reveal">
          <span>Product surface</span>
          <h2>The operating layer for every litre.</h2>
        </div>
        <div className="landing-feature-layout">
          <div className="landing-feature-copy reveal">
            <p>
              The public product story matches the private dashboard: tank
              levels, delivery records, reconciliation, alerts, reports, and
              audit history in one controlled workspace.
            </p>
            <div className="landing-feature-list">
              {features.map((feature, i) => (
                <div
                  key={feature}
                  className="reveal"
                  style={{ transitionDelay: `${i * 0.07}s` }}
                >
                  {feature}
                </div>
              ))}
            </div>
          </div>
          <MiniConsole />
        </div>
      </section>

      <section className="landing-section landing-pricing-section" id="pricing">
        <div className="landing-section-heading reveal">
          <span>Pricing</span>
          <h2>Public pricing, private onboarding.</h2>
          <p>
            FuelSense stays sales-led so every station, user, and tank is set up
            correctly before the team gets access.
          </p>
        </div>
        <div className="landing-pricing-grid">
          {plans.map((plan, i) => (
            <article
              className={`landing-plan ${plan.featured ? 'landing-plan-featured' : ''} reveal`}
              key={plan.name}
              style={{ transitionDelay: `${i * 0.12}s` }}
            >
              {plan.featured && <div className="landing-plan-badge">Most popular</div>}
              <h3>{plan.name}</h3>
              <p className="landing-plan-limits">{plan.detail}</p>
              <div className="landing-plan-price">
                <strong>{plan.price}</strong>
                {plan.cadence && <span>{plan.cadence}</span>}
              </div>
              <ul className="landing-plan-features">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <a href={demoHref}>{plan.cta}</a>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-team-section" id="team">
        <div className="landing-section-heading reveal">
          <span>People behind the project</span>
          <h2>Built close to the fuel station floor.</h2>
          <p>
            FuelSense is carried by a focused two-person team building the
            product, operations story, and customer experience together.
          </p>
        </div>
        <div className="landing-team-grid">
          {team.map((member, i) => (
            <article
              className="landing-team-card reveal"
              key={member.name}
              style={{ transitionDelay: `${i * 0.15}s` }}
            >
              <div className="landing-avatar-ring">
                <img className="landing-avatar-photo" src={member.image} alt={member.name} />
              </div>
              <h3>{member.name}</h3>
              <p>{member.role}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-final-cta">
        <div>
          <span>Ready to know where every litre went?</span>
          <h2>Bring FuelSense into the conversation before the next variance.</h2>
        </div>
        <div className="landing-actions">
          <a className="landing-primary landing-primary--shimmer" href={demoHref}>Book Demo</a>
          <button className="landing-secondary landing-secondary-light" type="button" onClick={onLoginClick}>
            Login
          </button>
        </div>
      </section>
    </main>
  );
}

function DashboardScene() {
  return (
    <div className="landing-dashboard-scene" aria-hidden="true">
      <div className="landing-scene-panel landing-scene-main">
        <div className="landing-scene-topline">
          <span>Live station command</span>
          <strong>3 alerts</strong>
        </div>
        <div className="landing-scene-grid">
          <div>
            <small>Total NSV</small>
            <strong>82,410 L</strong>
          </div>
          <div>
            <small>Open deliveries</small>
            <strong>4</strong>
          </div>
          <div>
            <small>Variance risk</small>
            <strong>High</strong>
          </div>
        </div>
        <div className="landing-chart">
          <span style={{ height: '52%', animationDelay: '0.1s' }} />
          <span style={{ height: '78%', animationDelay: '0.2s' }} />
          <span style={{ height: '44%', animationDelay: '0.3s' }} />
          <span style={{ height: '67%', animationDelay: '0.4s' }} />
          <span style={{ height: '35%', animationDelay: '0.5s' }} />
          <span style={{ height: '88%', animationDelay: '0.6s' }} />
          <span style={{ height: '59%', animationDelay: '0.7s' }} />
        </div>
      </div>
      <div className="landing-scene-panel landing-scene-side">
        <span>Tank 2 diesel</span>
        <strong>18.4% low stock</strong>
        <div className="landing-risk-line" />
      </div>
      <div className="landing-scene-panel landing-scene-alert">
        <span>Delivery variance</span>
        <strong>+312 L flagged</strong>
      </div>
    </div>
  );
}

function MiniConsole() {
  return (
    <div className="landing-console reveal" aria-label="FuelSense dashboard preview">
      <div className="landing-console-header">
        <span>FuelSense Monitor</span>
        <strong>Live</strong>
      </div>
      <div className="landing-console-row">
        <span>Tank 1 petrol</span>
        <strong>72%</strong>
      </div>
      <div className="landing-console-row">
        <span>Truck delivery BOL-1187</span>
        <strong>Reconciling</strong>
      </div>
      <div className="landing-console-row landing-console-row-risk">
        <span>Pump vs dip variance</span>
        <strong>Review</strong>
      </div>
      <div className="landing-console-meter">
        <span />
      </div>
    </div>
  );
}

export default LandingPage;
