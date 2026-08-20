import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito, Caveat } from "next/font/google";
import { profile, education, experiences, projects, skills } from "@/data/resume";
import "./globals.css";

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fredoka",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-caveat",
  display: "swap",
});

const description =
  "Fly a toy aeroplane through a miniature world to explore the engineering journey of " +
  `${profile.fullName} — ${profile.title} in ${profile.location}. ` +
  "React, Next.js, TypeScript, Java, Spring Boot, Kafka, MySQL and MongoDB.";

export const metadata: Metadata = {
  // Set by CI to the real deployed origin; the fallback only affects the
  // absolute URLs in OG tags during local builds.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://bala516743.github.io"),
  title: {
    default: `${profile.fullName} — ${profile.title}`,
    template: `%s · ${profile.fullName}`,
  },
  description,
  applicationName: "Captain Bala",
  authors: [{ name: profile.fullName }],
  keywords: [
    profile.fullName,
    "Full Stack Developer",
    "React Developer",
    "Next.js",
    "TypeScript",
    "Java",
    "Spring Boot",
    "Kafka",
    "MongoDB",
    "MySQL",
    "eProsima Fast DDS",
    "Chennai",
    "portfolio",
  ],
  openGraph: {
    type: "website",
    title: `${profile.fullName} — ${profile.title}`,
    description,
    siteName: "Captain Bala",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: `${profile.fullName} — ${profile.title}`,
    description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0f1626",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

/**
 * Structured data.
 *
 * The experience itself is a WebGL canvas — a crawler sees almost nothing.
 * This is how the résumé stays machine-readable, and it is generated from
 * the same single source of truth the 3D world reads.
 */
function JsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.fullName,
    jobTitle: profile.title,
    email: `mailto:${profile.email}`,
    telephone: profile.phone,
    description: profile.summary,
    address: { "@type": "PostalAddress", addressLocality: "Chennai", addressCountry: "IN" },
    url: profile.linkedin,
    sameAs: [profile.linkedin, profile.github],
    alumniOf: {
      "@type": "CollegeOrUniversity",
      name: education.institution,
    },
    hasCredential: {
      "@type": "EducationalOccupationalCredential",
      name: education.degree,
      credentialCategory: "degree",
      educationalLevel: "Bachelor",
    },
    knowsAbout: skills.map((s) => s.name),
    worksFor: experiences
      .filter((e) => e.current)
      .map((e) => ({ "@type": "Organization", name: e.company })),
    hasOccupation: experiences.map((e) => ({
      "@type": "Occupation",
      name: e.role,
      occupationLocation: { "@type": "City", name: "Chennai" },
      description: e.responsibilities.join(" "),
    })),
    subjectOf: projects.map((p) => ({
      "@type": "CreativeWork",
      name: p.name,
      abstract: p.tagline,
      keywords: p.stack.join(", "),
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable} ${caveat.variable}`}>
      <body>
        {children}
        <JsonLd />
      </body>
    </html>
  );
}
