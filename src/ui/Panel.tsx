"use client";

import { AnimatePresence, motion } from "framer-motion";
import Lenis from "lenis";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/store";
import { ISLAND_MAP } from "@/data/world";
import {
  achievements,
  education,
  experiences,
  profile,
  projects,
  skillCategories,
  skills,
} from "@/data/resume";
import { sfx } from "@/lib/audio";

/**
 * The content panel.
 *
 * Everything the résumé says lives in here, but it never appears — it
 * unfolds. Cards stagger in from below with a spring, and the panel slides
 * rather than fades, so the world stays visible beside it. The camera pushes
 * the island off-centre at the same moment (see flight.ts), which is why the
 * layout can afford to take half the screen.
 */

const spring = { type: "spring", stiffness: 260, damping: 26, mass: 0.85 } as const;

function Card({ label, children, i = 0 }: { label?: string; children: React.ReactNode; i?: number }) {
  return (
    <motion.section
      className="card"
      initial={{ opacity: 0, y: 26, rotateX: -8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ ...spring, delay: 0.06 + i * 0.055 }}
      style={{ transformPerspective: 900 }}
    >
      {label && <h3 className="card__label">{label}</h3>}
      {children}
    </motion.section>
  );
}

function Chips({ items, tone }: { items: readonly string[]; tone?: string }) {
  return (
    <div className="chip-row">
      {items.map((t, i) => (
        <motion.span
          key={t}
          className="chip"
          style={tone ? { ["--chip" as string]: tone } : undefined}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring, delay: 0.18 + i * 0.03 }}
        >
          {t}
        </motion.span>
      ))}
    </div>
  );
}

/** Writes itself out, one character at a time. */
function Typewriter({ text, speed = 14, delay = 0 }: { text: string; speed?: number; delay?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let id: number;
    const start = setTimeout(() => {
      id = window.setInterval(() => {
        setN((v) => {
          if (v >= text.length) {
            clearInterval(id);
            return v;
          }
          return v + 1;
        });
      }, speed);
    }, delay);
    return () => {
      clearTimeout(start);
      clearInterval(id);
    };
  }, [text, speed, delay]);
  return <span className={n >= text.length ? undefined : "type-caret"}>{text.slice(0, n)}</span>;
}

/* ================================================================== */

function HomeContent() {
  return (
    <>
      <Card label="Pre-flight" i={0}>
        <p>
          This is the hangar. Six islands hold {profile.firstName}&rsquo;s work, and you reach
          every one of them by actually flying there.
        </p>
        <p style={{ marginTop: "0.6rem" }}>
          Set a heading from the strip along the bottom, take off, then fly over the glowing
          landing pad to touch down.
        </p>
      </Card>
      <Card label="Flight log" i={1}>
        <div className="stat-row">
          <div className="stat">
            <div className="stat__value">2+</div>
            <div className="stat__label">Years</div>
          </div>
          <div className="stat">
            <div className="stat__value">4</div>
            <div className="stat__label">Systems shipped</div>
          </div>
          <div className="stat">
            <div className="stat__value">2</div>
            <div className="stat__label">Employers</div>
          </div>
          <div className="stat">
            <div className="stat__value">{skills.length}</div>
            <div className="stat__label">Technologies</div>
          </div>
        </div>
      </Card>
      <Card label="Controls" i={2}>
        <ul>
          <li>
            <kbd>↑</kbd> throttle · <kbd>↓</kbd> brake · <kbd>←</kbd> <kbd>→</kbd> turn (or WASD)
          </li>
          <li>Idle for a few seconds and auto-pilot will offer to fly for you.</li>
          <li>Ten stars are hidden along the routes. Each one is worth a fact.</li>
        </ul>
      </Card>
    </>
  );
}

function ObjectiveContent() {
  return (
    <>
      <Card label="Who you are flying for" i={0}>
        <p className="lede">
          <Typewriter text={profile.summary} speed={11} delay={220} />
        </p>
      </Card>
      <Card label="At a glance" i={1}>
        <ul className="big-list">
          {profile.missionBriefing.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Card>
      <Card label="Education" i={2}>
        <p>
          <strong>{education.degree}</strong>
          <br />
          {education.institution}
        </p>
        <p style={{ marginTop: "0.5rem", color: "var(--ink-soft)" }}>
          {education.period} · CGPA {education.cgpa}
        </p>
      </Card>
      <Card label="Base" i={3}>
        <p>
          {profile.location} · {profile.email} · {profile.phone}
        </p>
      </Card>
    </>
  );
}

function SkillsContent() {
  const activeCategory = useGame((s) => s.activeCategory);
  const activeSkill = useGame((s) => s.activeSkill);
  const setActiveSkill = useGame((s) => s.setActiveSkill);
  const muted = useGame((s) => s.muted);

  const shown = activeCategory
    ? skillCategories.filter((c) => c.id === activeCategory)
    : skillCategories;

  return (
    <>
      {activeCategory && (
        <button
          type="button"
          className="toy-btn toy-btn--ghost back-btn"
          onClick={() => {
            useGame.getState().setActiveCategory(null);
            if (!muted) sfx("click");
          }}
        >
          ← All four districts
        </button>
      )}

      {shown.map((cat, ci) => (
        <Card key={cat.id} label={`${cat.glyph}  ${cat.label}`} i={ci}>
          <p style={{ color: "var(--ink-soft)", marginBottom: "0.75rem" }}>{cat.blurb}</p>
          <ul className="skill-list">
            {skills
              .filter((s) => s.category === cat.id)
              .map((s) => {
                const open = activeSkill === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="skill-row"
                      data-open={open}
                      style={{ ["--c" as string]: s.color }}
                      onClick={() => {
                        setActiveSkill(open ? null : s.id);
                        if (!muted) sfx(open ? "click" : "power");
                      }}
                      onPointerEnter={() => !muted && sfx("hover")}
                      aria-expanded={open}
                    >
                      <span className="skill-row__dot" aria-hidden="true" />
                      <span className="skill-row__name">{s.name}</span>
                      <span className="skill-row__chev" aria-hidden="true">
                        {open ? "−" : "+"}
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.p
                          className="skill-row__note"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
                        >
                          <span>{s.note}</span>
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
          </ul>
        </Card>
      ))}
    </>
  );
}

function ExperienceContent() {
  const openCompany = useGame((s) => s.openCompany);
  const setOpenCompany = useGame((s) => s.setOpenCompany);
  const muted = useGame((s) => s.muted);
  const exp = experiences.find((e) => e.id === openCompany);

  // One company at a time. The two are never shown mixed together.
  if (exp) {
    return (
      <motion.div key={exp.id} initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <button
          type="button"
          className="toy-btn toy-btn--ghost back-btn"
          onClick={() => {
            setOpenCompany(null);
            if (!muted) sfx("click");
          }}
        >
          ← Both offices
        </button>

        <Card i={0}>
          <p className="card__label" style={{ color: exp.accent }}>
            {exp.period}
            {exp.current && <span className="chip chip--live">Current</span>}
          </p>
          <h2 className="detail-title">{exp.company}</h2>
          <p style={{ color: "var(--ink-soft)" }}>{exp.role}</p>
        </Card>

        <Card label="Responsibilities" i={1}>
          <ul>
            {exp.responsibilities.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Card>

        <Card label="Major contributions" i={2}>
          <ul className="plain named-list">
            {exp.highlights.map((h) => (
              <li key={h.name}>
                <strong>{h.name}</strong>
                <span>{h.detail}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card label="Technologies used" i={3}>
          <Chips items={exp.stack} tone={exp.accent} />
        </Card>
      </motion.div>
    );
  }

  return (
    <>
      <Card label="Two offices" i={0}>
        <p>Land beside a building and step inside, or pick one here.</p>
      </Card>
      {experiences.map((e, i) => (
        <motion.button
          key={e.id}
          type="button"
          className="card pick-card"
          style={{ borderLeft: `6px solid ${e.accent}` }}
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -4 }}
          transition={{ ...spring, delay: 0.1 + i * 0.07 }}
          onClick={() => {
            setOpenCompany(e.id);
            if (!muted) sfx("unfold");
          }}
          onPointerEnter={() => !muted && sfx("hover")}
        >
          <p className="card__label">
            {e.period}
            {e.current && <span className="chip chip--live">Current</span>}
          </p>
          <h3 className="pick-card__title">{e.company}</h3>
          <p>{e.strapline}</p>
        </motion.button>
      ))}
      <Card label="Education" i={3}>
        <p>
          <strong>{education.degree}</strong> · {education.institution}
          <br />
          {education.period} · CGPA {education.cgpa}
        </p>
      </Card>
    </>
  );
}

function ProjectsContent() {
  const openProject = useGame((s) => s.openProject);
  const setOpenProject = useGame((s) => s.setOpenProject);
  const muted = useGame((s) => s.muted);
  const p = projects.find((x) => x.id === openProject);

  if (p) {
    return (
      <motion.div key={p.id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <button
          type="button"
          className="toy-btn toy-btn--ghost back-btn"
          onClick={() => {
            setOpenProject(null);
            if (!muted) sfx("click");
          }}
        >
          ← All four projects
        </button>

        <Card i={0}>
          <h2 className="detail-title" style={{ color: p.accentDark }}>
            {p.name}
          </h2>
          <p style={{ color: "var(--ink-soft)" }}>{p.tagline}</p>
        </Card>
        <Card label="About project" i={1}>
          <p>{p.about}</p>
        </Card>
        <Card label="Tech stack" i={2}>
          <Chips items={p.stack} tone={p.accent} />
        </Card>
        <Card label="Key contributions" i={3}>
          <ul>
            {p.contributions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Card>
      </motion.div>
    );
  }

  return (
    <>
      <Card label="Four systems, in production" i={0}>
        <p>Land beside a building and raise its shutter, or pick one here.</p>
      </Card>
      {projects.map((proj, i) => (
        <motion.button
          key={proj.id}
          type="button"
          className="card pick-card"
          style={{ borderLeft: `6px solid ${proj.accent}` }}
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -4 }}
          transition={{ ...spring, delay: 0.1 + i * 0.07 }}
          onClick={() => {
            setOpenProject(proj.id);
            if (!muted) sfx("unfold");
          }}
          onPointerEnter={() => !muted && sfx("hover")}
        >
          <p className="card__label">{proj.stack.slice(0, 3).join(" · ")}</p>
          <h3 className="pick-card__title">{proj.name}</h3>
          <p>{proj.tagline}</p>
        </motion.button>
      ))}
    </>
  );
}

function MuseumContent() {
  const openAchievement = useGame((s) => s.openAchievement);
  const setOpenAchievement = useGame((s) => s.setOpenAchievement);
  const muted = useGame((s) => s.muted);

  return (
    <>
      <Card label="The collection" i={0}>
        <p>Research and certification, framed and under glass.</p>
      </Card>
      {achievements.map((a, i) => {
        const open = openAchievement === a.id;
        return (
          <motion.div
            key={a.id}
            className="card award"
            style={{ ["--c" as string]: a.accent }}
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.08 + i * 0.06 }}
            role="button"
            tabIndex={0}
            aria-expanded={open}
            onClick={() => {
              setOpenAchievement(open ? null : a.id);
              if (!muted) sfx(open ? "click" : "chime");
            }}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                setOpenAchievement(open ? null : a.id);
              }
            }}
          >
            <div className="award__head">
              <span className="award__badge">{a.badge}</span>
              <span>
                <h3 className="award__title">{a.title}</h3>
                <p className="award__issuer">{a.issuer}</p>
              </span>
            </div>
            <AnimatePresence initial={false}>
              {open && (
                <motion.p
                  initial={{ height: 0, opacity: 0, marginTop: 0 }}
                  animate={{ height: "auto", opacity: 1, marginTop: "0.7rem" }}
                  exit={{ height: 0, opacity: 0, marginTop: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  style={{ overflow: "hidden" }}
                >
                  {a.detail}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </>
  );
}

function ContactContent() {
  const letterSent = useGame((s) => s.letterSent);
  const sendLetter = useGame((s) => s.sendLetter);
  const muted = useGame((s) => s.muted);
  const say = useGame((s) => s.say);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  const mailto = `mailto:${profile.email}?subject=${encodeURIComponent(
    `Hello from ${name || "a visitor"} — Captain Bala portfolio`
  )}&body=${encodeURIComponent(note || "")}`;

  return (
    <>
      <Card label="Direct line" i={0}>
        <ul className="plain link-list">
          <li>
            <a href={`mailto:${profile.email}`} className="chip">
              ✉ {profile.email}
            </a>
          </li>
          <li>
            <a href={`tel:${profile.phone}`} className="chip">
              ☎ {profile.phone}
            </a>
          </li>
          <li>
            <span className="chip">📍 {profile.location}</span>
          </li>
        </ul>
      </Card>

      <Card label="Send a letter" i={1}>
        {letterSent ? (
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
            <h3 className="detail-title">✉ Mission delivered.</h3>
            <p style={{ marginTop: "0.4rem" }}>
              The letter has left the mailbox. Finish it in your own mail client so it actually
              reaches {profile.firstName}.
            </p>
            <a className="toy-btn toy-btn--mint" style={{ marginTop: "0.9rem" }} href={mailto}>
              Open in mail app
            </a>
          </motion.div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendLetter();
              if (!muted) sfx("whoosh");
              say("Letter folded. Watch it leave the mailbox.", "reward");
            }}
          >
            <label className="field-label" htmlFor="c-name">
              Your name
            </label>
            <input id="c-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Captain…" />
            <label className="field-label" htmlFor="c-note">
              Message
            </label>
            <textarea id="c-note" className="field" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Say hello…" />
            <button type="submit" className="toy-btn toy-btn--tomato" style={{ marginTop: "0.4rem" }}>
              ✈ Send it by air
            </button>
          </form>
        )}
      </Card>

      <Card label="Elsewhere" i={2}>
        <div className="chip-row">
          <a className="chip" href={profile.linkedin} target="_blank" rel="noreferrer noopener">
            LinkedIn ↗
          </a>
          <a className="chip" href={profile.github} target="_blank" rel="noreferrer noopener">
            GitHub ↗
          </a>
          <a className="chip" href={profile.resumeFile} download>
            Résumé (PDF) ↓
          </a>
        </div>
      </Card>
    </>
  );
}

/* ================================================================== */

const CONTENT: Record<string, () => React.ReactElement> = {
  home: HomeContent,
  objective: ObjectiveContent,
  skills: SkillsContent,
  experience: ExperienceContent,
  projects: ProjectsContent,
  museum: MuseumContent,
  contact: ContactContent,
};

export function Panel() {
  const panelOpen = useGame((s) => s.panelOpen);
  const current = useGame((s) => s.current);
  const closePanel = useGame((s) => s.closePanel);
  const muted = useGame((s) => s.muted);
  const bodyRef = useRef<HTMLDivElement>(null);

  const def = current ? ISLAND_MAP[current] : null;
  const Content = current ? CONTENT[current] : null;
  const open = panelOpen && !!def && !!Content;

  // Smooth, weighted scrolling — the only scroll surface in the experience.
  useEffect(() => {
    if (!open || !bodyRef.current) return;
    const lenis = new Lenis({
      wrapper: bodyRef.current,
      content: bodyRef.current.firstElementChild as HTMLElement,
      duration: 1.05,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });
    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [open, current]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closePanel();
        if (!muted) sfx("click");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closePanel, muted]);

  return (
    <AnimatePresence>
      {open && def && Content && (
        <motion.aside
          className="panel"
          role="dialog"
          aria-modal="false"
          aria-label={`${def.label} details`}
          initial={{ x: "100%", opacity: 0.4 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0.3 }}
          transition={{ type: "spring", stiffness: 190, damping: 28, mass: 1 }}
        >
          <header className="panel__head">
            <p className="panel__eyebrow">
              <span aria-hidden="true">{def.glyph}</span> {def.label}
            </p>
            <h2 className="panel__title">{def.tagline}</h2>
            <button
              type="button"
              className="icon-btn panel__close"
              onClick={() => {
                closePanel();
                if (!muted) sfx("click");
              }}
              aria-label="Close panel"
            >
              ✕
            </button>
          </header>

          <div className="panel__body" ref={bodyRef}>
            <div>
              <Content />
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
