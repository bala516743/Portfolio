/**
 * SINGLE SOURCE OF TRUTH.
 *
 * Every string rendered anywhere in the experience is derived from this file,
 * transcribed from "Balamurugane Fullstack Dev Resume.pdf" plus the
 * achievements supplied directly by Balamurugane. Nothing here is invented —
 * edit this file and the whole world updates.
 */

export const profile = {
  firstName: "Balamurugane",
  lastName: "R",
  fullName: "Balamurugane R",
  callsign: "Captain Bala",
  title: "Full-Stack Developer",
  location: "Chennai, India",
  phone: "9600516743",
  email: "balamurugan516743@gmail.com",
  // Protocol is required — these strings are used directly as hrefs and as
  // JSON-LD `sameAs` values, and a bare "www." would resolve relative.
  linkedin: "https://www.linkedin.com/in/balamurugan-r-ba6547258",
  github: "https://github.com/bala516743",
  // Prefixed at build time: GitHub Pages serves a project repo from a
  // subpath, and a bare "/..." would 404 there.
  resumeFile: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/Balamurugane-Fullstack-Dev-Resume.pdf`,
  summary:
    "Full Stack Developer with 2+ years of experience working on enterprise and defense-grade systems. Experienced in React, Java, Spring Boot, and distributed data pipelines using Kafka, MySQL, and MongoDB, with hands-on work on code generation utilities, database integration services, and production-ready web applications in agile environments.",
  /** Short, high-contrast lines for the mission board. Kept to three. */
  missionBriefing: [
    "Two years building enterprise and defence-grade systems.",
    "React and Next.js on the front. Java and Spring Boot behind it.",
    "Kafka, MySQL and MongoDB keeping the data moving.",
  ],
} as const;

/* ------------------------------------------------------------------ */
/* EDUCATION                                                           */
/* ------------------------------------------------------------------ */

export const education = {
  degree: "Bachelor of Technology (CSE)",
  institution: "Rajiv Gandhi College of Engineering and Technology",
  period: "2019 – 2023",
  cgpa: "7.32",
} as const;

/* ------------------------------------------------------------------ */
/* WORK EXPERIENCE — one building each, never mixed                    */
/* ------------------------------------------------------------------ */

export type Experience = {
  id: string;
  company: string;
  shortName: string;
  role: string;
  period: string;
  current: boolean;
  /** One line shown on the building sign. */
  strapline: string;
  responsibilities: string[];
  /** Named pieces of work done at this company, for the in-building list. */
  highlights: { name: string; detail: string }[];
  stack: string[];
  accent: string;
};

export const experiences: Experience[] = [
  {
    id: "cdac",
    company: "CDAC",
    shortName: "CDAC",
    role: "Full-Stack Developer",
    period: "June 2025 – Current",
    current: true,
    strapline: "Defence-grade systems. The lights never go off.",
    responsibilities: [
      "Worked on the WESEE (Indian Navy) project, developing a Code Generation Utility supporting IDL/XML inputs with language bindings for Traditional C++, Modern C++, and Python.",
      "Implemented a Database Integration Service (DIS) using Kafka, MySQL, and MongoDB to support real-time data flow, automatic storage, and database synchronization.",
      "Contributed to DDS middleware development and enhancements using eProsima Fast DDS for reliable real-time distributed communication.",
    ],
    highlights: [
      {
        name: "INDE-DDS",
        detail:
          "DDS-based middleware built on eProsima Fast DDS for reliable real-time distributed communication.",
      },
      {
        name: "Code Generation Utility",
        detail:
          "Accepts IDL/XML interface definitions and emits Traditional C++, Modern C++ and Python bindings.",
      },
      {
        name: "Database Integration Service",
        detail:
          "Kafka pipeline into MySQL and MongoDB for real-time data flow, automatic storage and database synchronization.",
      },
      {
        name: "DDS Middleware",
        detail:
          "Enhancement work on the middleware layer itself using eProsima Fast DDS.",
      },
      {
        name: "Kafka Integration",
        detail: "Streaming layer that keeps live messages durable on their way to storage.",
      },
    ],
    stack: ["Java", "C++", "Python", "Kafka", "MySQL", "MongoDB", "eProsima Fast DDS"],
    accent: "#5FD3E8",
  },
  {
    id: "hepl",
    company: "Hema Enterprises Pvt Ltd",
    shortName: "HEPL",
    role: "Full-Stack Developer",
    period: "Feb 2024 – Mar 2025",
    current: false,
    strapline: "Three products out of one workshop.",
    responsibilities: [
      "Developed Convex, a project management tool, implementing drag-and-drop task management, dynamic forms, DataGrid components, and secure authentication using React and RESTful APIs.",
      "Led end-to-end frontend development of Swoos, an out-of-stock product tracking system, building real-time dashboards and plugin-based tables with static column scrolling.",
      "Built NERAM, a timesheet management system, implementing login modules, filters, dynamic dialog boxes, and data tables, improving workflow efficiency and usability.",
    ],
    highlights: [
      {
        name: "CONVEX",
        detail:
          "Project management tool — drag-and-drop task management, dynamic forms, DataGrid components and secure authentication.",
      },
      {
        name: "SWOOS",
        detail:
          "Out-of-stock product tracking system — real-time dashboards and plugin-based tables with static column scrolling. Owned end to end on the front end.",
      },
      {
        name: "NERAM",
        detail:
          "Timesheet management system — login modules, filters, dynamic dialog boxes and data tables.",
      },
    ],
    stack: [
      "React.js",
      "Next.js",
      "TypeScript",
      "Material-UI",
      "Ant Design",
      "Spring Boot",
      "MongoDB",
      "MySQL",
    ],
    accent: "#FF9E7A",
  },
];

/* ------------------------------------------------------------------ */
/* PROJECTS — About / Tech Stack / Key Contributions                   */
/* ------------------------------------------------------------------ */

export type ProjectKind = "lab" | "office" | "construction" | "warehouse";

export type Project = {
  id: string;
  name: string;
  kind: ProjectKind;
  /** One-line strapline for the building sign. */
  tagline: string;
  /** "About Project" — a short paragraph. */
  about: string;
  stack: string[];
  contributions: string[];
  accent: string;
  accentDark: string;
};

export const projects: Project[] = [
  {
    id: "indedds",
    name: "INDE-DDS",
    kind: "lab",
    tagline: "Real-time middleware for distributed systems.",
    about:
      "A DDS-based middleware using eProsima Fast DDS for reliable real-time distributed communication. It lets independent programs — written in different languages, running on different machines — agree on the same data as it changes, and keeps every message durable on its way into storage.",
    stack: ["Java", "C++", "Kafka", "MySQL", "MongoDB", "eProsima Fast DDS"],
    contributions: [
      "Developed a Code Generation Utility supporting IDL/XML inputs with Traditional C++, Modern C++, and Python bindings.",
      "Built a Database Integration Service (DIS) using Kafka, MySQL, and MongoDB for real-time data flow.",
      "Contributed to DDS middleware enhancements using eProsima Fast DDS.",
    ],
    accent: "#5FD3E8",
    accentDark: "#2B7C99",
  },
  {
    id: "convex",
    name: "CONVEX",
    kind: "construction",
    tagline: "Task handling, sprint planning, progress tracking.",
    about:
      "A project management tool for task handling, sprint planning and progress tracking. Work moves by drag-and-drop across task and subtask levels, and forms are generated dynamically rather than hard-coded per task type.",
    stack: ["React.js", "TypeScript", "Material-UI", "Spring Boot", "MongoDB"],
    contributions: [
      "Implemented drag-and-drop functionality and dynamic forms for task and subtask management.",
      "Developed DataGrid components and secure login/authentication with RESTful API integration.",
    ],
    accent: "#FFB24D",
    accentDark: "#C4711A",
  },
  {
    id: "swoos",
    name: "SWOOS",
    kind: "warehouse",
    tagline: "Real-time out-of-stock tracking.",
    about:
      "A real-time system for tracking and managing out-of-stock products. Inventory tables are wide, so key columns stay pinned while the rest scrolls — and stock status is visible the moment it changes rather than on refresh.",
    stack: ["React.js", "Ant Design", "Spring Boot", "MongoDB"],
    contributions: [
      "Built real-time dashboards and plugin-based tables with static column scrolling for inventory tracking.",
      "Integrated and optimized RESTful APIs to improve data accuracy and application performance.",
      "Led end-to-end frontend development of the system.",
    ],
    accent: "#7EE081",
    accentDark: "#2F8F4E",
  },
  {
    id: "neram",
    name: "NERAM",
    kind: "office",
    tagline: "Timesheets people actually fill in.",
    about:
      "A timesheet platform for logging work hours and managing approvals. Entry stays in-context through dynamic dialog boxes instead of separate pages, and filters keep approvals fast as the table grows.",
    stack: ["Next.js", "TypeScript", "MUI", "MySQL Workbench"],
    contributions: [
      "Developed login/authentication, filters, and data tables for timesheet tracking and approvals.",
      "Implemented dynamic dialog boxes and optimized UI performance using Next.js.",
      "Improved workflow efficiency and usability.",
    ],
    accent: "#B79BFF",
    accentDark: "#6B4BC4",
  },
];

/* ------------------------------------------------------------------ */
/* SKILLS — a technology park, four districts                          */
/* ------------------------------------------------------------------ */
/* Deliberately carries no project references: the Skills island is     */
/* about capability, and Project Kingdom is about what was shipped.     */

export type SkillCategory = "frontend" | "backend" | "database" | "tools";

export type Skill = {
  id: string;
  name: string;
  category: SkillCategory;
  color: string;
  /** A short line about the skill itself. Never names a project. */
  note: string;
};

export const skills: Skill[] = [
  /* --- Frontend --- */
  { id: "react", name: "React.js", category: "frontend", color: "#61DAFB", note: "Component architecture, hooks and state-driven UI." },
  { id: "nextjs", name: "Next.js", category: "frontend", color: "#E8E8E8", note: "App routing, rendering strategies and UI performance." },
  { id: "typescript", name: "TypeScript", category: "frontend", color: "#3178C6", note: "Typed components, props and API contracts." },
  { id: "javascript", name: "JavaScript (ES6+)", category: "frontend", color: "#F7DF1E", note: "Modern syntax, async flow and the DOM." },
  { id: "html", name: "HTML5", category: "frontend", color: "#E44D26", note: "Semantic, accessible document structure." },
  { id: "css", name: "CSS3", category: "frontend", color: "#2965F1", note: "Responsive layout and UI optimization." },
  { id: "mui", name: "Material UI", category: "frontend", color: "#007FFF", note: "Design system components and theming." },
  { id: "antd", name: "Ant Design", category: "frontend", color: "#1677FF", note: "Dashboard and data-table component work." },
  { id: "redux", name: "Redux", category: "frontend", color: "#764ABC", note: "Predictable application state at scale." },
  { id: "context", name: "Context API", category: "frontend", color: "#9AD8FF", note: "Lightweight shared state where a store is overkill." },

  /* --- Backend --- */
  { id: "java", name: "Java", category: "backend", color: "#F89820", note: "Service-side application development." },
  { id: "spring", name: "Spring Boot", category: "backend", color: "#6DB33F", note: "Service structure, controllers and configuration." },
  { id: "rest", name: "REST API Development", category: "backend", color: "#FF9F68", note: "Designing and building RESTful endpoints." },
  { id: "apiint", name: "API Integration", category: "backend", color: "#FFC65C", note: "Wiring front ends to services, and tuning the round trip." },

  /* --- Databases --- */
  { id: "mysql", name: "MySQL", category: "database", color: "#00758F", note: "Relational schema design and queries." },
  { id: "mongodb", name: "MongoDB", category: "database", color: "#47A248", note: "Document modelling and collections." },

  /* --- Tools --- */
  { id: "git", name: "Git", category: "tools", color: "#F1502F", note: "Branching, history and day-to-day version control." },
  { id: "github", name: "GitHub", category: "tools", color: "#D8D8D8", note: "Pull requests, reviews and collaboration." },
  { id: "gitlab", name: "GitLab", category: "tools", color: "#FC6D26", note: "Repository and pipeline workflows." },
  { id: "kafka", name: "Kafka", category: "tools", color: "#C7C7C7", note: "Streaming messages between services in real time." },
  { id: "swagger", name: "Swagger", category: "tools", color: "#85EA2D", note: "API contracts and living documentation." },
  { id: "postman", name: "Postman", category: "tools", color: "#FF6C37", note: "Endpoint verification and integration testing." },
  { id: "jest", name: "Jest", category: "tools", color: "#C21325", note: "Front-end test runner and assertions." },
  { id: "unit", name: "Unit Testing", category: "tools", color: "#8BE08F", note: "Covering logic at the smallest useful level." },
];

export const skillCategories: {
  id: SkillCategory;
  label: string;
  short: string;
  blurb: string;
  accent: string;
  glyph: string;
}[] = [
  {
    id: "frontend",
    label: "Frontend",
    short: "Frontend Studio",
    blurb: "Interfaces, state and everything the user actually touches.",
    accent: "#61DAFB",
    glyph: "🖥️",
  },
  {
    id: "backend",
    label: "Backend",
    short: "Engine Room",
    blurb: "Services, endpoints and the contracts between them.",
    accent: "#6DB33F",
    glyph: "⚙️",
  },
  {
    id: "database",
    label: "Databases",
    short: "Storage Vault",
    blurb: "Where the data rests, relational and document alike.",
    accent: "#00A5C4",
    glyph: "🗄️",
  },
  {
    id: "tools",
    label: "Tools & Technologies",
    short: "Tool Shed",
    blurb: "Version control, streaming, documentation and tests.",
    accent: "#FF9F68",
    glyph: "🧰",
  },
];

/* ------------------------------------------------------------------ */
/* ACHIEVEMENTS — supplied by Balamurugane                             */
/* ------------------------------------------------------------------ */

export type Achievement = {
  id: string;
  title: string;
  issuer: string;
  kind: "paper" | "certificate";
  /** Short badge text shown on the case. */
  badge: string;
  detail: string;
  icon: "paper" | "ai" | "java" | "stack";
  accent: string;
};

export const achievements: Achievement[] = [
  {
    id: "retinopathy",
    title: "Research Paper — Diabetic Retinopathy",
    issuer: "Published research",
    kind: "paper",
    badge: "Published",
    detail:
      "A published research paper on Diabetic Retinopathy — the retinal complication of diabetes and the detection of it.",
    icon: "paper",
    accent: "#6FD3A3",
  },
  {
    id: "ibm-genai",
    title: "Generative AI in Action",
    issuer: "IBM",
    kind: "certificate",
    badge: "IBM",
    detail: "IBM certification covering applied generative AI.",
    icon: "ai",
    accent: "#5FD3E8",
  },
  {
    id: "niit-java",
    title: "Java Full Stack Development",
    issuer: "NIIT",
    kind: "certificate",
    badge: "NIIT",
    detail: "NIIT certification in Java full stack development.",
    icon: "java",
    accent: "#F89820",
  },
  {
    id: "capgemini-tns",
    title: "Full Stack Development",
    issuer: "Capgemini TNS",
    kind: "certificate",
    badge: "Capgemini",
    detail: "Capgemini TNS certification in full stack development.",
    icon: "stack",
    accent: "#B79BFF",
  },
];

/* ------------------------------------------------------------------ */
/* EASTER EGG PAYLOAD — star collectibles                              */
/* ------------------------------------------------------------------ */

export const developerFacts: string[] = [
  "The Code Generation Utility reads IDL *and* XML. Two front doors, one compiler.",
  "Modern C++ and Traditional C++ are separate binding targets — they are not the same job.",
  "Fast DDS is publish/subscribe. Nobody calls anybody; everybody just listens.",
  "The Database Integration Service writes to MySQL and MongoDB. Relational and document, same stream.",
  "Static column scrolling: the table scrolls, the important columns refuse to leave.",
  "Plugin-based tables mean a new column type is a plugin, not a rewrite.",
  "Drag-and-drop across task *and* subtask levels is two nesting problems wearing one trench coat.",
  "Dynamic dialog boxes: one component, many shapes. The alternative is forty components.",
  "Two years of experience, four production systems, one Navy programme.",
  "Kafka doesn't store your data. It just refuses to lose it while you decide where to put it.",
];
