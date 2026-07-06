import type { LeadProfile } from "./types";

// The three standardised inputs from the brief. Used as one-click prefills in the UI
// and for testing. The deployed app accepts ANY profile + transcript - nothing below
// is special-cased in the pipeline.

export interface DemoPersona {
  id: string;
  profile: LeadProfile;
  transcript: string;
}

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: "rohan",
    profile: {
      name: "Rohan Sharma",
      role: "Software Engineer, TCS",
      yoe: "4",
      intent:
        "Want to switch to a product company, tired of service work, interested in AI engineering roles.",
      linkedin:
        "B.Tech CSE VIT Vellore '20, SDE-2 at TCS for 4 years (banking clients: HDFC, Citi), recent AWS Solutions Architect cert.",
    },
    transcript: `BDA: Rohan, what's bringing you to Scaler?
Rohan: I've been at TCS for 4 years. Banking projects. I want to move to a product company - and I keep seeing AI engineering roles and wondering if I'm already too late.
BDA: Not too late. Have you looked at our AI Engineering program?
Rohan: I've looked. Here's my question though - why should I pay Rs 3.5L when Andrew Ng has basically the same stuff for free on Coursera? What's actually different?
BDA: Good question, let me get back to you on the specifics.
Rohan: Also - realistically, what salary jump does someone like me get? If I'm going from 14 LPA at TCS to 16 at another service company, the math doesn't work.
BDA: We have data on that, I'll share.
Rohan: One more - I want to build real LLM applications. RAG, agents, evals. Is your program on that, or is it more theoretical ML?
BDA: We'll cover everything you need.`,
  },
  {
    id: "karthik",
    profile: {
      name: "Karthik Iyer",
      role: "Senior Software Engineer, Google",
      yoe: "9",
      intent:
        "Looking at AI engineering - what's your AI program like for someone like me?",
      linkedin:
        "IIT Madras CS, 6 years at Google (Search infra), previously Microsoft, frequent open-source contributor.",
    },
    transcript: `BDA: Karthik, thanks for your time. Tell me what got you interested in Scaler.
Karthik: Honestly, I'm exploring. I already work at Google. I can read the papers. I just want to make sure I'm not missing anything on the applied side.
BDA: Of course. What would you want to learn?
Karthik: My real question is - what would I actually learn here that I can't pick up from papers or internal training? I need to be honest about that before I commit.
BDA: Our curriculum is very hands-on -
Karthik: Also - is your cohort going to be at my level? Because if I'm tutoring everyone, I'm not getting value.
BDA: We have senior folks, yeah.
Karthik: Last one - are your instructors people who've actually shipped production AI systems, or is it academic? I've sat through enough academic ML.`,
  },
  {
    id: "meera",
    profile: {
      name: "Meera Patel",
      role: "Final-year B.Tech student, Tier-3 college",
      yoe: "0",
      intent:
        "Need a job. Family wants me to take the govt job offer but I want to work at a product company.",
      linkedin: "",
    },
    transcript: `BDA: Meera, tell me what's on your mind.
Meera: I'm in my final year. I got a government job offer through campus. My parents want me to take it. But I want to work at a product company. I'm confused.
BDA: I understand. How can we help?
Meera: The first thing my parents are going to ask is - can you guarantee I'll get a job after this? Because if I don't, I've turned down a secure government job for nothing.
BDA: We have strong placement -
Meera: And Rs 3.5L is more than what my family earns in a year. I genuinely don't know how people afford this. How does that work?
BDA: We have financing options.
Meera: Also - I'm nervous about your entrance test. What if I can't clear it? Does that mean I'm not right for this?`,
  },
];
