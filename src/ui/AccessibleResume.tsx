import {
  achievements,
  education,
  experiences,
  profile,
  projects,
  skillCategories,
  skills,
} from "@/data/resume";

/**
 * The résumé as plain, semantic HTML.
 *
 * A WebGL canvas is invisible to a crawler and hostile to a screen reader.
 * This is the same data the 3D world is built from, rendered as an ordinary
 * document: visually hidden, fully in the accessibility tree, in the markup
 * from the very first byte. It is not a fallback — it is the text layer of
 * the same site.
 */
export function AccessibleResume() {
  return (
    <article className="sr-only" aria-label={`${profile.fullName} résumé, text version`}>
      <h1>
        {profile.fullName} — {profile.title}
      </h1>
      <p>{profile.summary}</p>

      <h2>Contact</h2>
      <ul>
        <li>
          Email: <a href={`mailto:${profile.email}`}>{profile.email}</a>
        </li>
        <li>
          Phone: <a href={`tel:${profile.phone}`}>{profile.phone}</a>
        </li>
        <li>Location: {profile.location}</li>
        <li>
          <a href={profile.linkedin}>LinkedIn</a>
        </li>
        <li>
          <a href={profile.github}>GitHub</a>
        </li>
        <li>
          <a href={profile.resumeFile}>Download résumé (PDF)</a>
        </li>
      </ul>

      <h2>Work experience</h2>
      {experiences.map((e) => (
        <section key={e.id}>
          <h3>
            {e.company} — {e.role}
          </h3>
          <p>{e.period}</p>
          <ul>
            {e.responsibilities.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <p>Technologies: {e.stack.join(", ")}</p>
        </section>
      ))}

      <h2>Projects</h2>
      {projects.map((p) => (
        <section key={p.id}>
          <h3>{p.name}</h3>
          <h4>About</h4>
          <p>{p.about}</p>
          <h4>Tech stack</h4>
          <p>{p.stack.join(", ")}</p>
          <h4>Key contributions</h4>
          <ul>
            {p.contributions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      ))}

      <h2>Technical skills</h2>
      {skillCategories.map((c) => (
        <section key={c.id}>
          <h3>{c.label}</h3>
          <p>{c.blurb}</p>
          <ul>
            {skills
              .filter((s) => s.category === c.id)
              .map((s) => (
                <li key={s.id}>
                  {s.name} — {s.note}
                </li>
              ))}
          </ul>
        </section>
      ))}

      <h2>Education</h2>
      <p>
        {education.degree}, {education.institution}, {education.period}. CGPA {education.cgpa}.
      </p>

      <h2>Achievements &amp; certifications</h2>
      <ul>
        {achievements.map((a) => (
          <li key={a.id}>
            <strong>{a.title}</strong> — {a.issuer}. {a.detail}
          </li>
        ))}
      </ul>
    </article>
  );
}
