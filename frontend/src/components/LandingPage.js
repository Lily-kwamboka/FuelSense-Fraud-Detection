import React, { useEffect, useState } from 'react';
import './LandingPage.css';

const DEMO_HREF = 'mailto:kwambokalilian59@gmail.com?subject=Book%20a%20FuelSense%20Demo';

const pains = [
  { text: 'Delivery variance appears after the truck has already left.', severity: 78 },
  { text: 'Manual reconciliation hides losses until the monthly report.', severity: 85 },
  { text: 'Pump-vs-dip checks live in notebooks and spreadsheets.', severity: 63 },
  { text: 'Managers hear about fraud late — stock is already gone.', severity: 92 },
  { text: 'Weak audit trails make disputes slow and expensive.', severity: 71 },
];

const steps = [
  {
    num: '01',
    title: 'Connect tank readings',
    body: 'ATG and tank data keep every station visible from one operating screen.',
  },
  {
    num: '02',
    title: 'Capture movement',
    body: 'Record deliveries, pump sales, shifts, and dip checks without losing the timeline.',
  },
  {
    num: '03',
    title: 'Reconcile stock',
    body: 'Compare expected stock against measured stock and classify the variance.',
  },
  {
    num: '04',
    title: 'Alert decision makers',
    body: 'Notify managers when a delivery, tank, or station crosses the risk threshold.',
  },
];

const features = [
  { icon: '⊙', label: 'Live tank dashboard' },
  { icon: '⇄', label: 'Delivery reconciliation' },
  { icon: '≡', label: 'Pump-vs-dip checks' },
  { icon: '⚑', label: 'Alerts and audit logs' },
  { icon: '⊞', label: 'Multi-station controls' },
  { icon: '◎', label: 'Reports for operators' },
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
    features: [
      'Unlimited stations',
      'Unlimited tanks',
      'Dedicated support',
      'Custom integrations',
      'SLA guarantee',
      'On-site training',
      'Custom reporting',
    ],
    cta: 'Talk to sales',
  },
];

const team = [
  { image: '/bernice.jpeg', name: 'Bernice Wakarindi', role: 'System Engineer' },
  {
    image: '/lillian.jpeg',
    name: 'Lillian Kwamboka',
    role: 'Product Designer, Sales & Marketing',
  },
];

// Main landing page component
function LandingPage({ onLoginClick, demoHref = DEMO_HREF }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const goTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* Scroll progress → CSS custom property on :root */
  useEffect(() => {
    const handle = () => {
      const scrolled = window.scrollY;
      const total = document.body.scrollHeight - window.innerHeight;
      const p = total > 0 ? Math.min(scrolled / total, 1) : 0;
      document.documentElement.style.setProperty('--scroll-progress', p);
    };
    window.addEventListener('scroll', handle, { passive: true });
    handle();
    return () => window.removeEventListener('scroll', handle);
  }, []);

  /* Scroll-reveal IntersectionObserver */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('is-visible');
        }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <main className="landing-page">
      {/* Fixed jerrycan + oil-spill scroll progress indicator */}
      <JerrycanScrollTracker />

      {/* Navigation bar */}
      <nav className="landing-nav" aria-label="Public navigation">
        <button className="landing-brand" type="button" onClick={() => { goTo('top'); setMenuOpen(false); }}>
          <HexBrandMark />
          <span>FuelSense</span>
        </button>

        {/* Mobile Hamburger Toggle Button */}
        <button 
          className="landing-nav-toggle" 
          type="button" 
          aria-label="Toggle navigation menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span className={`hamburger-bar ${menuOpen ? 'open' : ''}`} />
        </button>

        <div className={`landing-nav-links ${menuOpen ? 'open' : ''}`}>
          <button type="button" onClick={() => { goTo('how'); setMenuOpen(false); }}>
            How It Works
          </button>
          <button type="button" onClick={() => { goTo('pricing'); setMenuOpen(false); }}>
            Pricing
          </button>
          <button type="button" onClick={() => { goTo('team'); setMenuOpen(false); }}>
            Team
          </button>
          <a href={demoHref} onClick={() => setMenuOpen(false)}>Book Demo</a>
          <button className="landing-login" type="button" onClick={() => { onLoginClick(); setMenuOpen(false); }}>
            Login
          </button>
        </div>
      </nav>

      {/* Hero section */}
      <section className="landing-hero" id="top">
        <div className="landing-hero-bg" aria-hidden="true">
          <div className="landing-hero-orb landing-hero-orb--red" />
          <div className="landing-hero-orb landing-hero-orb--amber" />
          <div className="landing-hero-grid" />
        </div>

        <div className="landing-hero-copy">
          <div className="landing-eyebrow">Fuel operations intelligence</div>
          <h1>FuelSense</h1>
          <p className="landing-hero-line">Stop fuel loss before it becomes a report.</p>
          <p className="landing-hero-sub">
            Real-time tank monitoring, delivery reconciliation, pump-vs-dip checks,
            alerts, and audit trails for serious fuel station operators.
          </p>
          <div className="landing-actions">
            <a className="landing-primary landing-primary--shimmer" href={demoHref}>
              Book Demo
            </a>
            <button className="landing-ghost" type="button" onClick={onLoginClick}>
              Customer Login
            </button>
          </div>
        </div>

        <div className="landing-hero-visual" aria-hidden="true">
          <HeroTankMonitor />
        </div>

        <div className="landing-hero-scroll" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path
              d="M5 8l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </section>

      {/* Pain points section */}
      <section className="landing-section landing-pain-section" id="pain">
        <div className="landing-section-heading reveal">
          <span>System alerts detected</span>
          <h2>Fuel loss rarely announces itself.</h2>
          <p>
            FuelSense is built for operators who need to know what happened, when it
            happened, and who needs to act next.
          </p>
        </div>
        <div className="landing-pain-grid">
          {pains.map((pain, i) => (
            <div
              key={pain.text}
              className="landing-pain-card reveal"
              style={{ transitionDelay: `${i * 0.08}s` }}
            >
              <div className="landing-pain-card-header">
                <span className="landing-alert-dot" aria-hidden="true" />
                <span className="landing-alert-label">⚠ ALERT</span>
              </div>
              <p>{pain.text}</p>
              <div className="landing-severity-bar" aria-hidden="true">
                <div
                  className="landing-severity-fill"
                  style={{ width: `${pain.severity}%` }}
                />
              </div>
              <span className="landing-severity-label">Severity {pain.severity}%</span>
            </div>
          ))}
        </div>
      </section>

      {/* How it works pipeline */}
      <section className="landing-section landing-how-section" id="how">
        <div className="landing-section-heading reveal">
          <span>Pipeline</span>
          <h2>From readings to action in four steps.</h2>
        </div>
        <div className="landing-step-pipeline">
          {steps.map((step, index) => (
            <React.Fragment key={step.num}>
              <article
                className="landing-step reveal"
                style={{ transitionDelay: `${index * 0.12}s` }}
              >
                <div className="landing-step-node">
                  <span>{step.num}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
              {index < steps.length - 1 && (
                <div className="landing-pipe" aria-hidden="true">
                  <svg
                    viewBox="0 0 64 24"
                    xmlns="http://www.w3.org/2000/svg"
                    preserveAspectRatio="none"
                  >
                    <rect
                      x="0"
                      y="9"
                      width="64"
                      height="6"
                      rx="3"
                      fill="rgba(34,197,94,0.07)"
                      stroke="rgba(34,197,94,0.28)"
                      strokeWidth="0.8"
                    />
                  </svg>
                  <div
                    className="landing-pipe-dot"
                    style={{ animationDelay: `${index * 0.55}s` }}
                  />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* Features section */}
      <section className="landing-section landing-features-section">
        <div className="landing-section-heading reveal">
          <span>Product surface</span>
          <h2>The operating layer for every litre.</h2>
        </div>
        <div className="landing-feature-layout">
          <div className="landing-feature-copy reveal">
            <p>
              Everything in the dashboard reflects reality: tank levels, delivery records,
              reconciliation, alerts, reports, and audit history in one controlled workspace.
            </p>
            <div className="landing-feature-list">
              {features.map((feat, i) => (
                <div
                  key={feat.label}
                  className="landing-feature-pill reveal"
                  style={{ transitionDelay: `${i * 0.07}s` }}
                >
                  <span className="landing-feature-icon">{feat.icon}</span>
                  {feat.label}
                </div>
              ))}
            </div>
          </div>
          <OperationsMonitor />
        </div>
      </section>

      {/* Pricing section */}
      <section className="landing-section landing-pricing-section" id="pricing">
        <div className="landing-section-heading reveal">
          <span>Pricing</span>
          <h2>Public pricing, private onboarding.</h2>
          <p>
            FuelSense stays sales-led so every station, user, and tank is set up correctly
            before the team gets access.
          </p>
        </div>
        <div className="landing-pricing-grid">
          {plans.map((plan, i) => (
            <article
              className={`landing-plan ${plan.featured ? 'landing-plan-featured' : ''} reveal`}
              key={plan.name}
              style={{ transitionDelay: `${i * 0.12}s` }}
            >
              {plan.featured && <div className="landing-plan-badge">★ Most popular</div>}
              <h3>{plan.name}</h3>
              <p className="landing-plan-limits">{plan.detail}</p>
              <div className="landing-plan-price">
                <strong>{plan.price}</strong>
                {plan.cadence && <span>{plan.cadence}</span>}
              </div>
              <ul className="landing-plan-features">
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <a href={demoHref} className="landing-plan-cta">
                {plan.cta}
              </a>
            </article>
          ))}
        </div>
      </section>

      {/* Team section */}
      <section className="landing-section landing-team-section" id="team">
        <div className="landing-section-heading reveal">
          <span>People behind the project</span>
          <h2>Built close to the fuel station floor.</h2>
          <p>
            A focused two-person team building the product, operations story, and customer
            experience together.
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
                <img
                  className="landing-avatar-photo"
                  src={member.image}
                  alt={member.name}
                />
              </div>
              <h3>{member.name}</h3>
              <p>{member.role}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Final call to action */}
      <section className="landing-final-cta">
        <div className="landing-final-cta-bg" aria-hidden="true" />
        <div className="landing-final-cta-inner">
          <span>Ready to know where every litre went?</span>
          <h2>Bring FuelSense into the conversation before the next variance.</h2>
          <div className="landing-actions">
            <a className="landing-primary landing-primary--shimmer" href={demoHref}>
              Book Demo
            </a>
            <button
              className="landing-ghost landing-ghost--outline"
              type="button"
              onClick={onLoginClick}
            >
              Login
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

// Sub-components

/* Hexagon brand mark logo */
function HexBrandMark() {
  return (
    <span className="landing-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 46" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="hexg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#101626" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        <polygon points="20,2 38,12 38,34 20,44 2,34 2,12" fill="url(#hexg)" />
        <text
          x="20"
          y="29"
          textAnchor="middle"
          fill="white"
          fontSize="18"
          fontWeight="900"
          fontFamily="Inter,system-ui,sans-serif"
        >
          F
        </text>
      </svg>
    </span>
  );
}

/* Fixed scroll indicator */
function JerrycanScrollTracker() {
  return (
    <div className="fs-tracker" aria-hidden="true">
      {/* Jerrycan stays upright — it is the source of the drip */}
      <div className="fs-tracker-can">
        <JerrycanSVG />
      </div>
      {/* Vertical track — fill grows downward with scroll progress */}
      <div className="fs-tracker-drip-track">
        <div className="fs-tracker-drip-fill" />
        <div className="fs-tracker-drip-drop" />
      </div>
      {/* Pool appears at the bottom near 100% scroll */}
      <div className="fs-tracker-pool" />
    </div>
  );
}

/* Jerrycan vector graphic */
function JerrycanSVG() {
  return (
    <svg viewBox="0 0 60 84" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Handle */}
      <path
        d="M 12 24 C 12 8 48 8 48 24"
        stroke="#7A5C10"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Top plate */}
      <rect x="6" y="20" width="48" height="8" rx="3" fill="#8A6812" />
      {/* Spout */}
      <rect x="16" y="8" width="14" height="14" rx="3" fill="#7A5810" />
      {/* Cap */}
      <circle cx="23" cy="9" r="6" fill="#4A380A" />
      <circle cx="23" cy="9" r="3.5" fill="#5A4510" />
      {/* Body */}
      <rect x="6" y="26" width="48" height="54" rx="5" fill="#9A7014" />
      <rect x="7" y="27" width="46" height="52" rx="4" fill="#C89820" />
      {/* Ribs */}
      <rect x="6" y="40" width="48" height="3" rx="1" fill="#8A6810" />
      <rect x="6" y="55" width="48" height="3" rx="1" fill="#8A6810" />
      <rect x="6" y="70" width="48" height="3" rx="1" fill="#8A6810" />
      {/* Left shadow edge */}
      <rect x="6" y="27" width="5" height="52" rx="2" fill="rgba(0,0,0,0.18)" />
      {/* Highlight streak */}
      <rect x="14" y="30" width="10" height="26" rx="4" fill="rgba(255,255,255,0.15)" />
      {/* Label */}
      <rect x="10" y="58" width="40" height="16" rx="2" fill="rgba(0,0,0,0.28)" />
      <text
        x="30"
        y="68.5"
        textAnchor="middle"
        fill="rgba(255,210,80,0.95)"
        fontSize="7.5"
        fontWeight="bold"
        fontFamily="monospace"
        letterSpacing="1"
      >
        FUEL
      </text>
      <text
        x="30"
        y="76"
        textAnchor="middle"
        fill="rgba(255,185,65,0.6)"
        fontSize="5"
        fontFamily="monospace"
        letterSpacing="0.5"
      >
        SENSE
      </text>
    </svg>
  );
}

/* Oil spill organic blob graphic */
function OilSpillSVG() {
  return (
    <svg viewBox="-8 -5 185 110" xmlns="http://www.w3.org/2000/svg" className="fs-oil-blob">
      <defs>
        <radialGradient id="oilFill" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#3b1f69" stopOpacity="0.96" />
          <stop offset="45%" stopColor="#0f1a3d" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#030408" stopOpacity="0.95" />
        </radialGradient>
        <radialGradient id="oilSheen" cx="28%" cy="25%" r="55%">
          <stop offset="0%" stopColor="#7070d0" stopOpacity="0.6" />
          <stop offset="40%" stopColor="#204070" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#300050" stopOpacity="0.04" />
        </radialGradient>
        <filter id="oilBlur">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {/* Shadow */}
      <path
        d="M80,12 C110,5 152,22 158,52 C164,82 140,95 108,96 C76,97 22,90 6,70 C-10,50 0,22 26,12 C46,5 62,15 80,12Z"
        fill="rgba(0,0,0,0.4)"
        filter="url(#oilBlur)"
        transform="translate(4,6)"
      />
      {/* Main blob */}
      <path
        d="M80,12 C110,5 152,22 158,52 C164,82 140,95 108,96 C76,97 22,90 6,70 C-10,50 0,22 26,12 C46,5 62,15 80,12Z"
        fill="url(#oilFill)"
      />
      {/* Iridescent sheen */}
      <path
        d="M80,12 C110,5 152,22 158,52 C164,82 140,95 108,96 C76,97 22,90 6,70 C-10,50 0,22 26,12 C46,5 62,15 80,12Z"
        fill="url(#oilSheen)"
      />
    </svg>
  );
}

/* Analog fuel risk indicator dial */
function FuelGauge() {
  return (
    <div className="landing-gauge-wrap">
      <svg
        className="landing-gauge"
        viewBox="0 0 200 128"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Variance risk gauge"
      >
        <defs>
          <filter id="needleGlow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background track */}
        <path
          d="M 18,108 A 82,82 0 0,0 182,108"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />

        {/* Green sector — left 40% (angles 180°→108°) */}
        <path
          d="M 18,108 A 82,82 0 0,0 75,30"
          stroke="#10b981"
          strokeWidth="11"
          fill="none"
          strokeLinecap="round"
          opacity="0.85"
        />

        {/* Amber sector — middle 20% (108°→72°) */}
        <path
          d="M 75,30 A 82,82 0 0,0 125,30"
          stroke="#f59e0b"
          strokeWidth="11"
          fill="none"
          strokeLinecap="round"
          opacity="0.9"
        />

        {/* Red sector — right 40% (72°→0°) */}
        <path
          d="M 125,30 A 82,82 0 0,0 182,108"
          stroke="#dc2626"
          strokeWidth="11"
          fill="none"
          strokeLinecap="round"
          opacity="0.95"
          filter="url(#needleGlow)"
        />

        {/* Sector labels */}
        <text x="10" y="122" fill="#10b981" fontSize="7.5" fontFamily="Inter,sans-serif" fontWeight="600" opacity="0.75">SAFE</text>
        <text x="75" y="20" fill="#f59e0b" fontSize="7" fontFamily="Inter,sans-serif" fontWeight="600" opacity="0.75">CAUTION</text>
        <text x="148" y="122" fill="#dc2626" fontSize="7.5" fontFamily="Inter,sans-serif" fontWeight="600" opacity="0.75">RISK</text>

        {/* Tick marks along the arc */}
        {[0, 20, 40, 60, 80, 100].map((pct) => {
          const angle = (180 - pct * 1.8) * (Math.PI / 180);
          const ir = 70, or = 77;
          const x1 = (100 + ir * Math.cos(angle)).toFixed(1);
          const y1 = (108 - ir * Math.sin(angle)).toFixed(1);
          const x2 = (100 + or * Math.cos(angle)).toFixed(1);
          const y2 = (108 - or * Math.sin(angle)).toFixed(1);
          return (
            <line
              key={pct}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}

        {/* Center text */}
        <text x="100" y="90" textAnchor="middle" fill="rgba(255,255,255,0.38)"
          fontSize="7" fontFamily="Inter,sans-serif" letterSpacing="0.1em" fontWeight="600">
          VARIANCE
        </text>
        <text x="100" y="99" textAnchor="middle" fill="rgba(255,255,255,0.2)"
          fontSize="5.5" fontFamily="Inter,sans-serif" letterSpacing="0.14em">
          RISK INDEX
        </text>

        {/* Needle — starts left, swings to red zone via CSS animation */}
        <g className="gauge-needle-group">
          <path d="M 100,108 L 97.5,60 L 100,50 L 102.5,60 Z" fill="#f0f4f8" />
          <path d="M 100,108 L 99,65 L 100,55 L 101,65 Z" fill="#f59e0b" />
        </g>

        {/* Pivot */}
        <circle cx="100" cy="108" r="9" fill="#0d1117" stroke="rgba(245,158,11,0.55)" strokeWidth="2" />
        <circle cx="100" cy="108" r="4" fill="#f59e0b" />
      </svg>

      <div className="landing-gauge-label">Live Variance Risk Index</div>
    </div>
  );
}

/* Floating dashboard status cards */
function FloatingMetrics() {
  return (
    <div className="landing-floating-metrics">
      <div className="landing-metric-card" style={{ animationDelay: '0s' }}>
        <span>Total NSV</span>
        <strong>82,410 L</strong>
      </div>
      <div className="landing-metric-card landing-metric-card--danger" style={{ animationDelay: '0.4s' }}>
        <span>Active Alerts</span>
        <strong>3</strong>
      </div>
      <div className="landing-metric-card landing-metric-card--danger" style={{ animationDelay: '0.8s' }}>
        <span>Variance Risk</span>
        <strong>HIGH</strong>
      </div>
    </div>
  );
}

/* Glassmorphic tank monitor visual */
function HeroTankMonitor() {
  return (
    <div className="landing-tank-monitor">
      {/* Background glass tank container */}
      <div className="landing-tank-frame">
        {/* Scale Ticks on the left side */}
        <div className="landing-tank-ticks">
          <span>20K L</span>
          <span>15K L</span>
          <span>10K L</span>
          <span>5K L</span>
          <span>0 L</span>
        </div>

        {/* Sloshing Liquid area */}
        <div className="landing-tank-liquid-container">
          <svg className="landing-tank-waves" viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* Wave 1 - Dark petroleum background sloshing path */}
            <path
              d="M0,48 Q25,43 50,48 T100,48 L100,100 L0,100 Z"
              fill="rgba(69, 26, 3, 0.45)"
              className="wave-path wave-path--back"
            />
            {/* Wave 2 - Iridescent golden/amber foreground sloshing path */}
            <path
              d="M0,50 Q25,56 50,50 T100,50 L100,100 L0,100 Z"
              fill="url(#oilGrad)"
              className="wave-path wave-path--front"
            />
            <defs>
              <linearGradient id="oilGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(245, 158, 11, 0.75)" />
                <stop offset="40%" stopColor="rgba(180, 83, 9, 0.85)" />
                <stop offset="100%" stopColor="rgba(69, 26, 3, 0.95)" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Front-mounted Dial overlay */}
        <div className="landing-tank-gauge-overlay">
          <FuelGauge />
        </div>
      </div>

      {/* Floating Telemetry overlays around it */}
      <div className="landing-tank-telemetry landing-tank-telemetry--top">
        <div className="telemetry-pill">
          <span className="label">ACTIVE INNAGE</span>
          <strong className="value value--green">82.4%</strong>
        </div>
        <div className="telemetry-pill">
          <span className="label">NET VOL (NSV)</span>
          <strong className="value">14,820 L</strong>
        </div>
      </div>

      <div className="landing-tank-telemetry landing-tank-telemetry--bottom">
        <div className="telemetry-pill">
          <span className="label">SHELL TEMP</span>
          <strong className="value">27.6 °C</strong>
        </div>
        <div className="telemetry-pill">
          <span className="label">WATER INGRESS</span>
          <strong className="value value--danger">12.0 mm</strong>
        </div>
      </div>
    </div>
  );
}

/* Live station operating logs list */
function OperationsMonitor() {
  return (
    <div className="landing-console reveal" aria-label="FuelSense live operations log">
      <div className="landing-console-titlebar">
        <div className="landing-console-dots">
          <span className="dot dot--red" />
          <span className="dot dot--amber" />
          <span className="dot dot--green" />
        </div>
        <span className="landing-console-path">STATION_MONITOR // STN-04</span>
        <span className="landing-console-live">● ONLINE</span>
      </div>
      <div className="landing-console-body">
        <div className="landing-log-item" style={{ animationDelay: '0.2s' }}>
          <div className="landing-log-meta">
            <span className="landing-log-time">14:38:12</span>
            <span className="tag tag--ok">MATCHED</span>
          </div>
          <div className="landing-log-message">Tank 1 (Super) dip matches pump reconciliation.</div>
        </div>

        <div className="landing-log-item" style={{ animationDelay: '0.6s' }}>
          <div className="landing-log-meta">
            <span className="landing-log-time">14:39:45</span>
            <span className="tag tag--ok">VERIFIED</span>
          </div>
          <div className="landing-log-message">Delivery registered: BOL-9941 (14,000 L).</div>
        </div>

        <div className="landing-log-item landing-log-item--warn" style={{ animationDelay: '1.0s' }}>
          <div className="landing-log-meta">
            <span className="landing-log-time">14:41:02</span>
            <span className="tag tag--warn">VARIANCE</span>
          </div>
          <div className="landing-log-message">Tank 2 (Diesel) active variance exceeds ±0.5% threshold.</div>
        </div>

        <div className="landing-log-item" style={{ animationDelay: '1.4s' }}>
          <div className="landing-log-meta">
            <span className="landing-log-time">14:42:19</span>
            <span className="tag tag--ok">VERIFIED</span>
          </div>
          <div className="landing-log-message">Automatic tank gauge (ATG) check successful.</div>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
