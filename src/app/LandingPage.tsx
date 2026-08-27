import type { ReactElement } from "react";

const heroImage = "/images/dream-studio-hero-editor.png";

type IconProps = {
  className?: string;
};

type Feature = {
  title: string;
  body: string;
  icon: (props: IconProps) => ReactElement;
  visual: ReactElement;
};

const featureStrip = [
  { title: "Worldbuilding", body: "Infinite scale. Total freedom.", icon: GlobeIcon },
  { title: "Realtime editing", body: "See changes. Instantly.", icon: BoltIcon },
  { title: "AI-assisted workflows", body: "Create more. Ship sooner.", icon: SparkIcon },
  { title: "Studio-grade controls", body: "Precision tools for pros.", icon: ShieldIcon }
];

const features: Feature[] = [
  {
    title: "AI Copilot",
    body: "Describe what you want to build and Dream Studio helps generate worlds, systems, and creative direction.",
    icon: BotIcon,
    visual: <CopilotPreview />
  },
  {
    title: "4-Split Viewport",
    body: "Design from every angle with precise spatial control and an engine-style workspace.",
    icon: GridIcon,
    visual: <ViewportPreview />
  },
  {
    title: "Sculpting Tools",
    body: "Shape terrain, environments, and forms with intuitive brush-based controls.",
    icon: BrushIcon,
    visual: <SculptPreview />
  },
  {
    title: "Mission Builder",
    body: "Craft objectives, logic, triggers, and gameplay flows visually.",
    icon: TargetIcon,
    visual: <MissionPreview />
  },
  {
    title: "Realtime Editing",
    body: "See changes instantly as you build, iterate, and refine your world.",
    icon: BoltIcon,
    visual: <RealtimePreview />
  },
  {
    title: "Playable Prototypes",
    body: "Test your ideas early with fast in-editor previews and interactive gameplay checks.",
    icon: GamepadIcon,
    visual: <PlayablePreview />
  }
];

const footerGroups = [
  { title: "Product", links: ["Features", "Demo", "Pricing", "Docs"] },
  { title: "Resources", links: ["Blog", "Changelog", "Help Center", "Community"] },
  { title: "Company", links: ["About", "Contact", "Careers"] },
  { title: "Legal", links: ["Privacy", "Terms", "Security"] }
];

export function LandingPage() {
  return (
    <div className="dream-page" id="product">
      <div className="dream-atmosphere" aria-hidden="true" />
      <header className="dream-nav" aria-label="Primary navigation">
        <a className="brand-lockup" href="/" aria-label="Dream Studio home">
          <DreamMark className="brand-mark" />
          <span>DREAM STUDIO</span>
        </a>
        <div className="nav-actions">
          <a className="button button-primary" href="#demo">
            <span>Start Building Free</span>
            <ArrowRightIcon className="button-icon" />
          </a>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="hero-pill">
              <SparkIcon className="pill-icon" />
              <span>Now building the AI-native game studio</span>
            </div>
            <h1>
              Build Playable Worlds
              <span>at the Speed of Imagination.</span>
            </h1>
            <p>
              Dream Studio is the AI-native game engine for creators. Design worlds,
              sculpt environments, direct missions, and prototype gameplay with an
              intelligent copilot - all in one premium workspace.
            </p>
            <div className="hero-actions">
              <a className="button button-primary button-large" href="#demo">
                <span>Start Building Free</span>
                <ArrowRightIcon className="button-icon" />
              </a>
              <a className="button button-secondary button-large" href="#demo">
                Book a Demo
              </a>
            </div>
            <div className="creator-proof">
              <UsersIcon className="proof-icon" />
              <span>Built for ambitious creators, indie studios, and next-gen worldbuilders.</span>
            </div>
          </div>

          <div className="hero-product" id="demo">
            <img src={heroImage} alt="Dream Studio world editor interface with AI copilot and four viewport panels" />
          </div>

          <div className="feature-strip" aria-label="Dream Studio benefits">
            {featureStrip.map((item) => {
              const Icon = item.icon;
              return (
                <div className="strip-item" key={item.title}>
                  <span className="strip-icon">
                    <Icon />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.body}</small>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="features-section" id="features">
          <div className="section-heading">
            <div className="section-pill">
              <SparkIcon className="pill-icon" />
              <span>Powerful features for next-gen worldbuilding</span>
            </div>
            <h2>
              Everything You Need to
              <span>Build, Direct, and Ship Playable Worlds.</span>
            </h2>
            <p>
              Dream Studio combines AI-native creation, studio-grade controls, and
              real-time iteration into one premium workspace so creators can move
              from idea to playable prototype faster.
            </p>
          </div>

          <div className="feature-grid">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article className="feature-card" key={feature.title}>
                  <div className="feature-card-header">
                    <span className="feature-icon">
                      <Icon />
                    </span>
                    <span>
                      <h3>{feature.title}</h3>
                      <p>{feature.body}</p>
                    </span>
                  </div>
                  <div className="feature-visual">{feature.visual}</div>
                </article>
              );
            })}
          </div>

          <div className="cta-panel" id="pricing">
            <DreamMark className="cta-mark" />
            <div className="cta-copy">
              <h2>Create more. Iterate faster. Ship sooner.</h2>
              <p>Join creators building the next generation of playable worlds.</p>
            </div>
            <div className="cta-actions">
              <a className="button button-primary button-large" href="#demo">
                <span>Start Building Free</span>
                <ArrowRightIcon className="button-icon" />
              </a>
              <a className="button button-secondary button-large" href="/editor">
                Book a Demo
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="dream-footer">
        <div className="footer-planet" aria-hidden="true" />
        <div className="footer-brand">
          <a className="brand-lockup" href="/">
            <DreamMark className="brand-mark" />
            <span>DREAM STUDIO</span>
          </a>
          <p>The AI-native game studio for building playable worlds.</p>
          <strong>Create more. Iterate faster. Ship sooner.</strong>
          <div className="social-row" aria-label="Social links">
            <a href="#product" aria-label="X">
              X
            </a>
            <a href="#product" aria-label="LinkedIn">
              in
            </a>
            <a href="#product" aria-label="GitHub">
              gh
            </a>
            <a href="#product" aria-label="Discord">
              ds
            </a>
          </div>
        </div>
        <div className="footer-links">
          {footerGroups.map((group) => (
            <div className="footer-group" key={group.title}>
              <h3>{group.title}</h3>
              {group.links.map((link) => (
                <a href="#product" key={link}>
                  {link}
                </a>
              ))}
            </div>
          ))}
        </div>
        <a className="loop-card" href="#product">
          <span className="loop-icon">
            <MailIcon />
          </span>
          <span>
            <strong>Stay in the loop</strong>
            <small>Get updates on new features, releases, and creator stories.</small>
          </span>
          <ArrowRightIcon className="loop-arrow" />
        </a>
        <div className="footer-bottom">
          <p>Copyright 2026 Dream Studio. All rights reserved.</p>
          <div>
            <a href="#product">Privacy Policy</a>
            <span />
            <a href="#product">Terms of Service</a>
            <span />
            <a href="#product">Manage Cookies</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function CopilotPreview() {
  return (
    <div className="copilot-preview">
      <div className="bot-figure">
        <span />
        <i />
      </div>
      <div className="mini-panel">
        <div className="mini-title">COPILOT <em>BETA</em></div>
        <p>Good afternoon, Creator. How can I help you build today?</p>
        <button>Generate Environment</button>
        <button>Mission Builder</button>
        <label>
          Describe what you want to build...
          <ArrowRightIcon />
        </label>
      </div>
    </div>
  );
}

function ViewportPreview() {
  return (
    <div className="viewport-preview">
      {["Top", "Front", "Perspective", "Right"].map((label, index) => (
        <div className={`viewport-tile viewport-tile-${index + 1}`} key={label}>
          <span>{label}</span>
          {index === 2 ? <WorldScene /> : <WireGrid dense={index === 1} />}
        </div>
      ))}
    </div>
  );
}

function SculptPreview() {
  return (
    <div className="sculpt-preview">
      <div className="tool-column">
        <strong>TOOLS</strong>
        <div className="tool-grid">
          {["Select", "Move", "Rotate", "Scale", "Sculpt", "Paint", "Terrain", "Props"].map((tool) => (
            <span key={tool}>{tool}</span>
          ))}
        </div>
      </div>
      <div className="sculpt-scene">
        <WorldScene />
        <div className="brush-target" />
        <div className="brush-toolbar">
          <span>Strength 0.48</span>
          <span>Radius 24</span>
        </div>
      </div>
    </div>
  );
}

function MissionPreview() {
  return (
    <div className="mission-preview">
      <div className="mission-sidebar">
        {["Objective", "Trigger", "Condition", "Action", "Reward"].map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      <div className="mission-canvas">
        <div className="node node-a">On Player Enter</div>
        <div className="node node-b">Defeat All Enemies</div>
        <div className="node node-c">Open Door</div>
        <div className="node node-d">Grant Reward</div>
        <svg viewBox="0 0 300 180" aria-hidden="true">
          <path d="M74 48 C108 70 118 84 148 106" />
          <path d="M190 48 C184 76 178 92 170 106" />
          <path d="M166 124 C186 130 202 134 224 130" />
        </svg>
      </div>
    </div>
  );
}

function RealtimePreview() {
  return (
    <div className="realtime-preview">
      <WorldScene />
      <div className="stairs">
        {Array.from({ length: 6 }).map((_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="live-chip">LIVE</div>
      <div className="bottom-controls">
        <span>VIEW</span>
        <strong>4-SPLIT</strong>
        <span>GRID ON</span>
        <span>SNAP ON</span>
      </div>
    </div>
  );
}

function PlayablePreview() {
  return (
    <div className="playable-preview">
      <WorldScene />
      <div className="avatar" />
      <div className="crate-stack">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="hud-left">100</div>
      <div className="hud-right">30 <small>/120</small></div>
      <div className="radar" />
    </div>
  );
}

function WireGrid({ dense = false }: { dense?: boolean }) {
  return (
    <div className={dense ? "wire-grid dense" : "wire-grid"}>
      <span className="wire-shape wire-shape-a" />
      <span className="wire-shape wire-shape-b" />
      <span className="axis axis-x">X</span>
      <span className="axis axis-y">Y</span>
    </div>
  );
}

function WorldScene() {
  return (
    <div className="world-scene">
      <span className="sun" />
      <span className="canyon canyon-back" />
      <span className="canyon canyon-left" />
      <span className="canyon canyon-right" />
      <span className="tiles" />
      <span className="gold-ball" />
    </div>
  );
}

function DreamMark({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 56 56" aria-hidden="true">
      <defs>
        <linearGradient id="dream-mark-gradient" x1="10" y1="7" x2="48" y2="51" gradientUnits="userSpaceOnUse">
          <stop stopColor="#b692ff" />
          <stop offset="0.48" stopColor="#7c42ff" />
          <stop offset="1" stopColor="#4720c8" />
        </linearGradient>
      </defs>
      <path d="M28 4 50 16.5v23L28 52 6 39.5v-23L28 4Z" fill="url(#dream-mark-gradient)" />
      <path d="m15 20.5 13 7.2 13-7.2v7.4l-13 7.2-13-7.2v-7.4Z" fill="#06091a" opacity="0.72" />
      <path d="M15 31.5 28 39l13-7.5v6.2L28 45.2 15 37.7v-6.2Z" fill="#090d23" opacity="0.82" />
      <path d="m20 23 8 4.5 8-4.5-8-4.5L20 23Z" fill="#d7c9ff" opacity="0.75" />
    </svg>
  );
}

function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h12" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function SparkIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 14.4 8.4 21 11l-6.6 2.6L12 20l-2.4-6.4L3 11l6.6-2.6L12 2Z" />
      <path d="M19 2.5 20 5l2.5 1-2.5 1-1 2.5L18 7l-2.5-1L18 5l1-2.5Z" />
    </svg>
  );
}

function UsersIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M2.5 20c.7-3.4 2.7-5 6-5s5.3 1.6 6 5" />
      <path d="M16.4 12.5a3 3 0 1 0-1.2-5.7" />
      <path d="M15.7 15.2c3.2.1 5 1.7 5.7 4.8" />
    </svg>
  );
}

function GlobeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.4 2.3 3.6 5.3 3.6 9S14.4 18.7 12 21" />
      <path d="M12 3C9.6 5.3 8.4 8.3 8.4 12S9.6 18.7 12 21" />
    </svg>
  );
}

function BoltIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z" />
    </svg>
  );
}

function ShieldIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 20 6v5.8c0 4.8-3.2 7.7-8 9.2-4.8-1.5-8-4.4-8-9.2V6l8-3Z" />
      <path d="m8.5 12 2.4 2.4 4.8-5" />
    </svg>
  );
}

function BotIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <path d="M9 7V4h6v3" />
      <path d="M8.5 12h.1" />
      <path d="M15.4 12h.1" />
      <path d="M9 16h6" />
    </svg>
  );
}

function GridIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function BrushIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m14.5 4.5 5 5L9 20l-5.5 1.5L5 16 14.5 4.5Z" />
      <path d="m13 6 5 5" />
      <path d="M6 16.5 8.5 19" />
    </svg>
  );
}

function TargetIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
    </svg>
  );
}

function GamepadIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 10h10a4 4 0 0 1 3.9 3.2l.7 3.5a2 2 0 0 1-3.3 1.8L16 16H8l-2.3 2.5a2 2 0 0 1-3.3-1.8l.7-3.5A4 4 0 0 1 7 10Z" />
      <path d="M8 13v3" />
      <path d="M6.5 14.5h3" />
      <path d="M16 14.2h.1" />
      <path d="M18.4 14.2h.1" />
    </svg>
  );
}

function MailIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}
